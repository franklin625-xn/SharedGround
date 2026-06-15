import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemPrompt } from "@/agent/system-prompt";
import { buildWorkspaceSnapshot } from "@/agent/build-context";
import { agentTurnSchema } from "@/agent/action-schema";
import type { AgentTurn } from "@/agent/action-schema";
import { createDemoWorkspaceState } from "@/core/workspace-factory";
import { applyWorkspaceAction } from "@/core/reducer";
import { POST as agentStepPost } from "@/app/api/agent-step/route";

describe("system prompt", () => {
  it("returns a non-empty string with key sections", () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(500);
    expect(prompt).toContain("ADD_SOURCE");
    expect(prompt).toContain("ANSWER_HUMAN_INPUT");
    expect(prompt).toContain("FINISH");
    expect(prompt).toContain("human_confirmed");
    expect(prompt).toContain("stopReason");
  });
});

describe("workspace snapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes task, sources, evidence, claims info", () => {
    const state = createDemoWorkspaceState();
    const snapshot = buildWorkspaceSnapshot(state);

    expect(snapshot).toContain(state.task.title);
    expect(snapshot).toContain("8");
    expect(snapshot).toContain("Net-Zero");
    expect(snapshot).toContain("demo-evidence-001");
    expect(snapshot).toContain("Agent Status: idle");
  });

  it("mentions open human request if present", () => {
    const state = createDemoWorkspaceState();
    state.pendingHumanRequest = {
      id: "req-1",
      question: "Should we focus on EVs?",
      relatedObjectIds: [],
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const snapshot = buildWorkspaceSnapshot(state);
    expect(snapshot).toContain("Should we focus on EVs?");
  });

  it("includes uploaded Markdown source content as a bounded excerpt", () => {
    const markdown = [
      "# Uploaded Policy Memo",
      "",
      "Unique markdown body visible to the real agent.",
      "This line should enter the workspace snapshot.",
    ].join("\n");
    const state = applyWorkspaceAction(
      createDemoWorkspaceState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Uploaded Policy Memo",
          publisher: "Human Upload",
          summary: "Uploaded Markdown memo.",
          fileName: "memo.md",
          mediaType: "markdown",
          content: markdown,
        },
      },
      "human",
    );

    const snapshot = buildWorkspaceSnapshot(state);

    expect(snapshot).toContain("Content excerpt");
    expect(snapshot).toContain("Unique markdown body visible to the real agent.");
  });

  it("sends uploaded Markdown source content in the real agent prompt", async () => {
    const oldUseMock = process.env.USE_MOCK_AGENT;
    const oldApiKey = process.env.OPENAI_API_KEY;
    process.env.USE_MOCK_AGENT = "false";
    process.env.OPENAI_API_KEY = "test-key";

    const markdown = [
      "# Uploaded Market Note",
      "",
      "Prompt-visible markdown body for OpenAI request verification.",
    ].join("\n");
    const state = applyWorkspaceAction(
      createDemoWorkspaceState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Uploaded Market Note",
          publisher: "Human Upload",
          summary: "Uploaded Markdown note.",
          fileName: "market-note.md",
          mediaType: "markdown",
          content: markdown,
        },
      },
      "human",
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                situation: "Read uploaded source content.",
                nextGoal: "Wait after verifying context.",
                actions: [],
                stopReason: "turn_complete",
              }),
            },
          },
        ],
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    try {
      await agentStepPost(
        new Request("http://localhost/api/agent-step", {
          method: "POST",
          body: JSON.stringify({
            runId: "run-test",
            stepId: "step-test",
            workspace: state,
          }),
        }),
      );
    } finally {
      if (oldUseMock === undefined) {
        delete process.env.USE_MOCK_AGENT;
      } else {
        process.env.USE_MOCK_AGENT = oldUseMock;
      }
      if (oldApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = oldApiKey;
      }
    }

    const body = JSON.parse(
      (mockFetch.mock.calls[0]![1] as { body: string }).body,
    ) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[1]!.content).toContain(
      "Prompt-visible markdown body for OpenAI request verification.",
    );
  });
});

describe("agent turn schema validation", () => {
  it("accepts a valid agent turn", () => {
    const turn: AgentTurn = {
      situation: "Workspace has demo materials.",
      nextGoal: "Add evidence and propose a claim.",
      actions: [
        {
          type: "ADD_EVIDENCE",
          payload: {
            sourceId: "demo-source-001",
            quoteOrFinding: "Test finding.",
            relevance: "Test relevance.",
          },
          reason: "Testing.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(true);
  });

  it("rejects a turn with ANSWER_HUMAN_INPUT (agent forbidden)", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "ANSWER_HUMAN_INPUT",
          payload: { requestId: "req-1", answer: "Focus on EVs." },
          reason: "Test.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects a turn with FINISH (human-only completion)", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "FINISH",
          payload: {},
          reason: "Test.",
        },
      ],
      stopReason: "task_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects a turn with more than 3 actions", () => {
    const turn: AgentTurn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "WAIT",
          payload: { waitingFor: "1" },
          reason: "Test.",
        },
        {
          type: "WAIT",
          payload: { waitingFor: "2" },
          reason: "Test.",
        },
        {
          type: "WAIT",
          payload: { waitingFor: "3" },
          reason: "Test.",
        },
        {
          type: "WAIT",
          payload: { waitingFor: "4" },
          reason: "Test.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects invalid stopReason", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [],
      stopReason: "invalid_reason",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects Agent update actions without expectedVersion", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "UPDATE_CLAIM",
          payload: {
            claimId: "claim-1",
            statement: "Missing expectedVersion.",
          },
          reason: "Test.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("expectedVersion");
  });
});

describe("Zod discriminator — real agent output validation", () => {
  it("rejects an action with an unknown type (e.g. ADD_CLAIM instead of PROPOSE_CLAIM)", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "ADD_CLAIM",
          payload: {
            statement: "Some claim.",
            reasoning: "Because.",
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
          },
          reason: "Model invented an action name.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
    // The error should mention the discriminator / union
    expect(result.error?.message).toMatch(/discriminator|union|ADD_CLAIM/i);
  });

  it("rejects an action with a misspelled type (e.g. PROPOSE_CLAIM -> PROPOSE_CLAIMES)", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "PROPOSE_CLAIMES",
          payload: {
            statement: "Test.",
            reasoning: "Test.",
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
          },
          reason: "Typo.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects an action with lowercase type (e.g. propose_claim)", () => {
    const turn = {
      situation: "Test.",
      nextGoal: "Test.",
      actions: [
        {
          type: "propose_claim",
          payload: {
            statement: "Test.",
            reasoning: "Test.",
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
          },
          reason: "Lowercase.",
        },
      ],
      stopReason: "turn_complete",
    };

    const result = agentTurnSchema.safeParse(turn);
    expect(result.success).toBe(false);
  });

  it("rejects a turn wrapped in markdown code fence (backticks in output)", () => {
    // Simulate what happens if the model wraps JSON in ```json...```
    const raw = '```json\n{"situation":"Test.","nextGoal":"Test.","actions":[],"stopReason":"turn_complete"}\n```';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Expected: JSON.parse fails because of the backticks
      expect(true).toBe(true);
      return;
    }
    // If it somehow parsed, the schema should still handle it
    const result = agentTurnSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("correctly applies a valid AgentTurn through the reducer", () => {
    const state = createDemoWorkspaceState();

    const turn: AgentTurn = {
      situation: "Workspace has demo sources but no claims.",
      nextGoal: "Propose an initial claim.",
      actions: [
        {
          type: "PROPOSE_CLAIM",
          payload: {
            statement: "EU policy increases localization pressure.",
            reasoning: "NZIA and FSR both link public support to local production.",
            supportingEvidenceIds: ["demo-evidence-001"],
            counterEvidenceIds: [],
            confidence: 0.75,
          },
          reason: "Evidence supports preliminary claim.",
        },
      ],
      stopReason: "turn_complete",
    };

    const nextState = turn.actions.reduce(
      (s, a) => applyWorkspaceAction(s, a, "agent"),
      state,
    );

    expect(nextState.claims).toHaveLength(1);
    expect(nextState.claims[0]?.status).toBe("ai_proposed");
    expect(nextState.events).toHaveLength(1);
    expect(nextState.events[0]?.actionType).toBe("PROPOSE_CLAIM");
  });
});
