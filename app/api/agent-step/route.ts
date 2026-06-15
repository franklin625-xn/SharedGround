import { runMockAgent } from "@/agent/mock-agent";
import { buildSystemPrompt } from "@/agent/system-prompt";
import { buildAgentContext, buildWorkspaceSnapshot } from "@/agent/build-context";
import { agentTurnSchema, type AgentTurn } from "@/agent/action-schema";
import type { ActionApplyResult, WorkspaceState } from "@/core/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface AgentStepResponse {
  turn: AgentTurn;
  source: "mock" | "real";
  usedFallback: boolean;
  error?: string;
}

interface AgentStepRequest {
  runId: string;
  stepId: string;
  workspace: WorkspaceState;
  previousApplyResults?: ActionApplyResult[];
}

export async function POST(request: Request) {
  try {
    const body: AgentStepRequest = await request.json();

    if (!body.workspace || !body.workspace.task || !body.workspace.task.id) {
      return NextResponse.json(
        { error: "Invalid workspace state." },
        { status: 400 },
      );
    }

    const useMock = process.env.USE_MOCK_AGENT !== "false";

    if (useMock) {
      const context = buildAgentContext(body.workspace);
      const turn = agentTurnSchema.parse(runMockAgent(context));
      return NextResponse.json({
        turn,
        source: "mock",
        usedFallback: false,
      } satisfies AgentStepResponse);
    }

    // Real agent path
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const context = buildAgentContext(body.workspace);
      const turn = agentTurnSchema.parse(runMockAgent(context));
      return NextResponse.json({
        turn,
        source: "mock",
        usedFallback: true,
        error: "OPENAI_API_KEY not configured. Fell back to mock agent.",
      } satisfies AgentStepResponse);
    }

    try {
      const turn = await callRealAgent(body.workspace, body.previousApplyResults ?? []);
      return NextResponse.json({
        turn,
        source: "real",
        usedFallback: false,
      } satisfies AgentStepResponse);
    } catch (err) {
      const context = buildAgentContext(body.workspace);
      const turn = agentTurnSchema.parse(runMockAgent(context));
      return NextResponse.json({
        turn,
        source: "mock",
        usedFallback: true,
        error:
          err instanceof Error
            ? err.message
            : "Real agent call failed. Fell back to mock agent.",
      } satisfies AgentStepResponse);
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal server error.",
      },
      { status: 500 },
    );
  }
}

async function callRealAgent(
  state: WorkspaceState,
  previousApplyResults: ActionApplyResult[],
): Promise<AgentTurn> {
  const baseUrl =
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY!;

  const systemPrompt = buildSystemPrompt();
  const context = buildAgentContext(state);
  const workspaceSnapshot = buildWorkspaceSnapshot(state);

  const userMessage = [
    "## Current Workspace State",
    workspaceSnapshot,
    "",
    "## Agent Context Summary",
    `- Sources: ${context.sourceCount}`,
    `- Evidence: ${context.evidenceCount}`,
    `- Agent notes: ${context.agentNotes.length}`,
    `- Agent claims: ${context.agentClaims.length}`,
    `- Open request: ${context.openHumanRequest ? context.openHumanRequest.question : "none"}`,
    `- Brief drafted: ${context.briefMarkdown ? "yes" : "no"}`,
    `- Previous apply results: ${previousApplyResults.length}`,
    ...previousApplyResults.map((result) =>
      `  - ${result.actionId}: accepted=${result.accepted} object=${result.objectType ?? "n/a"}:${result.objectId ?? "n/a"} expected=${result.expectedVersion ?? "n/a"} before=${result.beforeVersion ?? "n/a"} rejection=${result.rejectionCode ?? "none"}`,
    ),
    "",
    previousApplyResults.some((result) => result.rejectionCode === "STALE_OBJECT_VERSION")
      ? "Important: at least one previous action was rejected as stale. Re-read the latest object versions above and do not repeat the old expectedVersion."
      : "",
    "",
    "Based on the current workspace state, produce up to 3 actions to advance the research.",
    "Return valid JSON matching the schema described in the system prompt.",
  ].join("\n");

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const { turn } = await modelCall(baseUrl, model, apiKey, messages);
  return turn;
}

async function modelCall(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  attempt = 1,
): Promise<{ turn: AgentTurn; rawContent: string }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(
      `API error ${response.status}: ${errorBody.substring(0, 200)}`,
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Model returned empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    if (attempt < 2) {
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content:
            "The JSON you returned is not valid JSON (parse error). " +
            "Return ONLY a single valid JSON object, no markdown, no code fences.",
        },
      );
      return modelCall(baseUrl, model, apiKey, messages, attempt + 1);
    }
    throw new Error("Model returned invalid JSON after retry.");
  }

  const validation = agentTurnSchema.safeParse(parsed);

  if (!validation.success) {
    const zodPath = validation.error.issues
      .map((i) => `path=${i.path.join(".")} message=${i.message}`)
      .join("; ");

    if (attempt < 2) {
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: [
            "Your previous response failed schema validation. Fix ONLY the structure — do NOT change the research content.",
            "",
            `Validation errors: ${zodPath}`,
            "",
            "Rules to follow:",
            "- Each action.type must be exactly one of the allowed values (SEARCH_SOURCE, ADD_SOURCE, EDIT_SOURCE, ADD_EVIDENCE, EDIT_EVIDENCE, ADD_NOTE, EDIT_NOTE, PROPOSE_CLAIM, UPDATE_CLAIM, CHALLENGE_CLAIM, REQUEST_HUMAN_INPUT, WAIT, EDIT_BRIEF, REPLY_TEAMMATE_MESSAGE, MARK_MESSAGE_READ, RESOLVE_TEAMMATE_MESSAGE).",
            "- Each action.payload must contain exactly the fields listed for that action type.",
            "- EDIT_SOURCE, EDIT_EVIDENCE, EDIT_NOTE, UPDATE_CLAIM, CHALLENGE_CLAIM, and EDIT_BRIEF must include expectedVersion.",
            "- Do not output ANSWER_HUMAN_INPUT, FINISH, or SEND_TEAMMATE_MESSAGE.",
            "- Acknowledgement belongs only in top-level acknowledgedHumanEventIds.",
            "- Return ONLY the JSON object, no markdown.",
          ].join("\n"),
        },
      );
      return modelCall(baseUrl, model, apiKey, messages, attempt + 1);
    }

    throw new Error(
      `Zod validation failed after retry: ${zodPath.substring(0, 200)}`,
    );
  }

  return { turn: validation.data, rawContent: content };
}
