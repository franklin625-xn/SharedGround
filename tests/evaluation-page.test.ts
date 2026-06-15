import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "@/store/workspace-store";
import { createEmptyWorkspaceState } from "@/core/workspace-factory";
import type { EvaluationSummary } from "@/eval/types";
import type { WorkspaceState } from "@/core/types";

function evaluationSummary(): EvaluationSummary {
  return {
    generatedAt: "2026-06-15T00:00:00.000Z",
    outcome: {
      taskCompleted: true,
      finalClaimCount: 1,
      groundedFinalClaimCount: 1,
      groundedClaimRate: 1,
      citationIntegrityRate: 0.5,
      missingCitationIds: ["missing-evidence"],
      briefStaleDetected: false,
    },
    process: {
      agentActionCount: 4,
      humanActionCount: 3,
      humanRevisionCount: 1,
      contestedClaimCount: 1,
      humanOverrideRate: 0.5,
      humanRequestCount: 1,
      answeredHumanRequestCount: 1,
      effectiveHumanRequestRate: 1,
      waitCount: 2,
      correctWaitCount: 1,
      unauthorizedActionCount: 1,
      respectedHumanModification: true,
      staleWriteRejectionCount: 0,
      humanMessageCount: 0,
      acknowledgedHumanMessageCount: 0,
      humanMessageAckRate: 0,
      acceptedAgentActionCount: 3,
      totalAgentApplyResults: 4,
      acceptedAgentActionRate: 0.75,
      discardedStaleRunResponseCount: 0,
      repeatedStaleWriteCount: 0,
      duplicateSourceCount: 0,
      messageResolutionRate: 1,
      agentReplyWithoutActionCount: 0,
      humanRevisionResolutionRate: 1,
      unresolvedHumanRevisionCount: 0,
    },
    traceability: {
      items: [
        {
          claimId: "claim-1",
          hasSource: true,
          hasEvidence: true,
          hasHumanDecision: true,
          referencedInBrief: false,
          complete: false,
        },
      ],
      completeTraceCount: 0,
      totalTraceCount: 1,
      completeTraceRate: 0,
      evidenceWithSourceVersionCount: 1,
      evidenceWithSourceHashCount: 1,
      evidenceWithValidLineRange: 0,
      totalAgentExtractedEvidence: 1,
      sourceLocationCompletenessRate: 0,
    },
  };
}

function workspace(): WorkspaceState {
  return {
    schemaVersion: 2,
    task: {
      id: "task-1",
      title: "EU industrial policy and Chinese investment",
      question: "How does EU policy affect Chinese investment?",
      scope: "Demo audit",
      sourceMode: "demo_corpus",
      createdAt: "2026-06-15T00:00:00.000Z",
    },
    sources: [],
    evidence: [],
    notes: [],
    claims: [
      {
        id: "claim-1",
        statement: "EU policy increases localization pressure.",
        reasoning: "Evidence and tariffs point toward local production.",
        supportingEvidenceIds: [],
        counterEvidenceIds: [],
        confidence: 0.8,
        status: "final",
        createdBy: "agent",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
        version: 1,
        updatedBy: "agent",
      },
    ],
    brief: {
      markdown: "# Brief",
      updatedBy: "human",
      updatedAt: "2026-06-15T00:00:00.000Z",
      version: 1,
      createdAt: "2026-06-15T00:00:00.000Z",
      createdBy: "system",
    },
    events: [],
    agentStatus: "completed",
    agentControl: {
      status: "completed",
      stepCountInRun: 0,
      maxStepsPerRun: 12,
      maxActionsPerStep: 3,
      acknowledgedHumanEventIds: [],
      discardedStaleRunResponseCount: 0,
      mode: "mock",
    },
    humanMessages: [],
    completed: true,
  };
}

vi.mock("@/eval/run-evaluation", () => ({
  runEvaluation: vi.fn(() => evaluationSummary()),
}));

describe("Evaluation page", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspace: workspace(),
      agentError: null,
      agentMode: "idle",
    });
  });

  it("reads the current Zustand workspace and calls runEvaluation once", async () => {
    const { default: EvaluationPage } = await import("@/app/evaluation/page");
    const { runEvaluation } = await import("@/eval/run-evaluation");

    const html = renderToStaticMarkup(React.createElement(EvaluationPage));

    expect(runEvaluation).toHaveBeenCalledWith(workspace());
    expect(html).toContain("Collaboration Evaluation");
    expect(html).toContain("EU industrial policy and Chinese investment");
  });

  it("renders outcome, process, control, and traceability metrics", async () => {
    const { default: EvaluationPage } = await import("@/app/evaluation/page");

    const html = renderToStaticMarkup(React.createElement(EvaluationPage));

    expect(html).toContain("Outcome");
    expect(html).toContain("Grounded final claims");
    expect(html).toContain("Citation integrity");
    expect(html).toContain("Collaboration");
    expect(html).toContain("Human override rate");
    expect(html).toContain("Control");
    expect(html).toContain("Unauthorized actions");
    expect(html).toContain("Traceability");
    expect(html).toContain("claim-1");
    expect(html).toContain("EU policy increases localization pressure.");
    expect(html).toContain("missing-evidence");
  });

  it("renders an empty traceability state when there are no final claims", async () => {
    const { EvaluationSummaryView } = await import(
      "@/components/evaluation/evaluation-summary"
    );
    const emptyWorkspace = createEmptyWorkspaceState({
      title: "Empty task",
      question: "Q?",
      scope: "S.",
    });
    const emptySummary: EvaluationSummary = {
      ...evaluationSummary(),
      outcome: {
        ...evaluationSummary().outcome,
        taskCompleted: false,
        finalClaimCount: 0,
        groundedFinalClaimCount: 0,
      },
      traceability: {
        items: [],
        completeTraceCount: 0,
        totalTraceCount: 0,
        completeTraceRate: 0,
        evidenceWithSourceVersionCount: 0,
        evidenceWithSourceHashCount: 0,
        evidenceWithValidLineRange: 0,
        totalAgentExtractedEvidence: 0,
        sourceLocationCompletenessRate: 0,
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(EvaluationSummaryView, {
        workspace: emptyWorkspace,
        summary: emptySummary,
      }),
    );

    expect(html).toContain("No final claims are available");
    expect(html).toContain("Back to Workspace");
  });

  it("renders a secondary workspace entry to evaluation", async () => {
    const { WorkspaceShell } = await import(
      "@/components/workspace/workspace-shell"
    );

    const html = renderToStaticMarkup(React.createElement(WorkspaceShell));

    expect(html).toContain("View Evaluation");
    expect(html).toContain('href="/evaluation"');
  });
});
