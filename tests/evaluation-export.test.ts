import { describe, expect, it } from "vitest";
import {
  buildEvaluationJson,
  buildEvaluationMarkdown,
} from "@/components/evaluation/export-controls";
import type { EvaluationSummary } from "@/eval/types";
import type { WorkspaceState } from "@/core/types";

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
    claims: [],
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

function summary(): EvaluationSummary {
  return {
    generatedAt: "2026-06-15T00:00:00.000Z",
    outcome: {
      taskCompleted: true,
      finalClaimCount: 1,
      groundedFinalClaimCount: 1,
      groundedClaimRate: 1,
      citationIntegrityRate: 1,
      missingCitationIds: [],
      briefStaleDetected: false,
    },
    process: {
      agentActionCount: 3,
      humanActionCount: 2,
      humanRevisionCount: 1,
      contestedClaimCount: 0,
      humanOverrideRate: 0.5,
      humanRequestCount: 1,
      answeredHumanRequestCount: 1,
      effectiveHumanRequestRate: 1,
      waitCount: 1,
      correctWaitCount: 1,
      unauthorizedActionCount: 0,
      respectedHumanModification: true,
      staleWriteRejectionCount: 0,
      humanMessageCount: 0,
      acknowledgedHumanMessageCount: 0,
      humanMessageAckRate: 0,
      acceptedAgentActionCount: 2,
      totalAgentApplyResults: 3,
      acceptedAgentActionRate: 0.67,
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
          referencedInBrief: true,
          complete: true,
        },
      ],
      completeTraceCount: 1,
      totalTraceCount: 1,
      completeTraceRate: 1,
      evidenceWithSourceVersionCount: 1,
      evidenceWithSourceHashCount: 1,
      evidenceWithValidLineRange: 0,
      totalAgentExtractedEvidence: 1,
      sourceLocationCompletenessRate: 0,
    },
  };
}

describe("evaluation exports", () => {
  it("builds formatted JSON that matches the current EvaluationSummary", () => {
    const evaluation = summary();
    const json = buildEvaluationJson(evaluation);

    expect(JSON.parse(json)).toEqual(evaluation);
    expect(json).toContain('\n  "generatedAt"');
  });

  it("builds readable Markdown with required sections", () => {
    const markdown = buildEvaluationMarkdown(workspace(), summary());

    expect(markdown).toContain("# SharedGround Collaboration Evaluation");
    expect(markdown).toContain("## Task");
    expect(markdown).toContain("## Outcome");
    expect(markdown).toContain("## Collaboration");
    expect(markdown).toContain("## Control");
    expect(markdown).toContain("## Traceability");
    expect(markdown).toContain("EU industrial policy and Chinese investment");
    expect(markdown).toContain("claim-1");
  });
});
