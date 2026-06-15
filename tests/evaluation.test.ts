import { describe, expect, it } from "vitest";
import { runEvaluation } from "@/eval/run-evaluation";
import type { WorkspaceEvent, WorkspaceState } from "@/core/types";

function event(
  id: string,
  input: Omit<WorkspaceEvent, "id" | "timestamp" | "summary"> & {
    summary?: string;
  },
): WorkspaceEvent {
  return {
    id,
    timestamp: "2026-06-15T00:00:00.000Z",
    summary: input.summary ?? input.actionType,
    ...input,
  };
}

function baseWorkspace(): WorkspaceState {
  return {
    schemaVersion: 2,
    task: {
      id: "task-1",
      title: "EU industrial policy and Chinese investment",
      question:
        "How do EU industrial policy changes affect Chinese companies investing in Europe?",
      scope: "Demo research brief",
      sourceMode: "demo_corpus",
      createdAt: "2026-06-15T00:00:00.000Z",
    },
    sources: [
      {
        id: "source-1",
        title: "Net-Zero Industry Act",
        publisher: "European Commission",
        summary: "EU policy aims to expand clean technology manufacturing.",
        addedBy: "system",
        createdAt: "2026-06-15T00:00:00.000Z",
        version: 1,
        updatedAt: "2026-06-15T00:00:00.000Z",
        createdBy: "system",
        updatedBy: "system",
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        sourceId: "source-1",
        quoteOrFinding:
          "The EU links public support to local manufacturing capacity.",
        relevance: "Shows localization pressure.",
        addedBy: "system",
        createdAt: "2026-06-15T00:00:00.000Z",
        version: 1,
        updatedAt: "2026-06-15T00:00:00.000Z",
        createdBy: "system",
        updatedBy: "system",
      },
    ],
    notes: [],
    claims: [
      {
        id: "claim-1",
        statement: "EU policy increases localization pressure.",
        reasoning: "Support schemes favor local manufacturing.",
        supportingEvidenceIds: ["evidence-1"],
        counterEvidenceIds: [],
        confidence: 0.8,
        status: "final",
        createdBy: "agent",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
        version: 1,
        updatedBy: "agent",
        humanDecisionNote: "Final after human review.",
      },
    ],
    brief: {
      markdown: "Final brief cites [claim-1] and [evidence-1].",
      updatedBy: "human",
      updatedAt: "2026-06-15T00:00:00.000Z",
      version: 1,
      createdAt: "2026-06-15T00:00:00.000Z",
      createdBy: "system",
    },
    events: [
      event("event-0001", {
        actor: "agent",
        actionType: "PROPOSE_CLAIM",
        objectType: "claim",
        objectId: "claim-1",
      }),
      event("event-0002", {
        actor: "human",
        actionType: "UPDATE_CLAIM",
        objectType: "claim",
        objectId: "claim-1",
        after: {
          id: "claim-1",
          status: "final",
          humanDecisionNote: "Final after human review.",
        },
      }),
    ],
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

describe("runEvaluation", () => {
  it("calculates complete outcome and traceability for a grounded final claim", () => {
    const summary = runEvaluation(baseWorkspace());

    expect(summary.outcome).toMatchObject({
      taskCompleted: true,
      finalClaimCount: 1,
      groundedFinalClaimCount: 1,
      groundedClaimRate: 1,
      citationIntegrityRate: 1,
      missingCitationIds: [],
    });
    expect(summary.traceability).toMatchObject({
      completeTraceCount: 1,
      totalTraceCount: 1,
      completeTraceRate: 1,
    });
    expect(summary.traceability.items[0]).toMatchObject({
      claimId: "claim-1",
      hasSource: true,
      hasEvidence: true,
      hasHumanDecision: true,
      referencedInBrief: true,
      complete: true,
    });
  });

  it("lowers grounded rate when a final claim has no evidence", () => {
    const workspace = baseWorkspace();
    workspace.claims[0] = {
      ...workspace.claims[0]!,
      supportingEvidenceIds: [],
    };

    const summary = runEvaluation(workspace);

    expect(summary.outcome.finalClaimCount).toBe(1);
    expect(summary.outcome.groundedFinalClaimCount).toBe(0);
    expect(summary.outcome.groundedClaimRate).toBe(0);
  });

  it("marks trace incomplete when evidence references a missing source", () => {
    const workspace = baseWorkspace();
    workspace.evidence[0] = {
      ...workspace.evidence[0]!,
      sourceId: "missing-source",
    };

    const summary = runEvaluation(workspace);

    expect(summary.traceability.items[0]).toMatchObject({
      claimId: "claim-1",
      hasEvidence: true,
      hasSource: false,
      complete: false,
    });
  });

  it("lowers citation integrity when the brief references a missing ID", () => {
    const workspace = baseWorkspace();
    workspace.brief.markdown =
      "Final brief cites [claim-1], [evidence-1], and [missing-evidence].";

    const summary = runEvaluation(workspace);

    expect(summary.outcome.missingCitationIds).toContain("missing-evidence");
    expect(summary.outcome.citationIntegrityRate).toBeLessThan(1);
  });

  it("treats C/E index citations as references to existing claims and evidence", () => {
    const workspace = baseWorkspace();
    workspace.brief.markdown = "Final brief cites [C1] and [E1].";

    const summary = runEvaluation(workspace);

    expect(summary.outcome.citationIntegrityRate).toBe(1);
    expect(summary.outcome.missingCitationIds).toEqual([]);
    expect(summary.traceability.items[0]?.referencedInBrief).toBe(true);
  });

  it("counts human revisions and contested AI claims", () => {
    const workspace = baseWorkspace();
    workspace.claims.push({
      id: "claim-2",
      statement: "EVs face the strongest pressure.",
      reasoning: "Tariffs and battery rules are most direct.",
      supportingEvidenceIds: ["evidence-1"],
      counterEvidenceIds: [],
      confidence: 0.7,
      status: "human_revised",
      createdBy: "agent",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
      version: 1,
      updatedBy: "agent",
    });
    workspace.claims.push({
      id: "claim-3",
      statement: "All sectors face equal pressure.",
      reasoning: "Initial broad read.",
      supportingEvidenceIds: ["evidence-1"],
      counterEvidenceIds: ["evidence-1"],
      confidence: 0.4,
      status: "contested",
      createdBy: "agent",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
      version: 1,
      updatedBy: "agent",
    });
    workspace.events.push(
      event("event-0003", {
        actor: "human",
        actionType: "UPDATE_CLAIM",
        objectType: "claim",
        objectId: "claim-2",
        after: { id: "claim-2", status: "human_revised" },
      }),
      event("event-0004", {
        actor: "human",
        actionType: "CHALLENGE_CLAIM",
        objectType: "claim",
        objectId: "claim-3",
      }),
    );

    const summary = runEvaluation(workspace);

    expect(summary.process.humanRevisionCount).toBe(1);
    expect(summary.process.contestedClaimCount).toBe(1);
    expect(summary.process.humanOverrideRate).toBeCloseTo(2 / 3);
  });

  it("counts human requests, answers, waits, and correct waits", () => {
    const workspace = baseWorkspace();
    workspace.events.push(
      event("event-0003", {
        actor: "agent",
        actionType: "REQUEST_HUMAN_INPUT",
        objectType: "human_request",
        objectId: "request-1",
      }),
      event("event-0004", {
        actor: "agent",
        actionType: "WAIT",
      }),
      event("event-0005", {
        actor: "human",
        actionType: "ANSWER_HUMAN_INPUT",
        objectType: "human_request",
        objectId: "request-1",
      }),
      event("event-0006", {
        actor: "agent",
        actionType: "WAIT",
      }),
    );

    const summary = runEvaluation(workspace);

    expect(summary.process.humanRequestCount).toBe(1);
    expect(summary.process.answeredHumanRequestCount).toBe(1);
    expect(summary.process.effectiveHumanRequestRate).toBe(1);
    expect(summary.process.waitCount).toBe(2);
    expect(summary.process.correctWaitCount).toBe(1);
  });

  it("counts rejected agent actions as unauthorized actions", () => {
    const workspace = baseWorkspace();
    workspace.events.push(
      event("event-0003", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        summary: "Agent cannot finally complete the task.",
      }),
    );

    const summary = runEvaluation(workspace);

    expect(summary.process.unauthorizedActionCount).toBe(1);
  });

  // ── V0.2 metrics ────────────────────────────────────────────────────

  it("counts STALE_OBJECT_VERSION rejections", () => {
    const workspace = baseWorkspace();
    workspace.events.push(
      event("event-0003", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        rejectionCode: "STALE_OBJECT_VERSION",
        summary: "Expected v1 got v2.",
      }),
      event("event-0004", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        rejectionCode: "STALE_OBJECT_VERSION",
        summary: "Expected v2 got v3.",
      }),
      event("event-0005", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        rejectionCode: "PERMISSION_DENIED",
        summary: "Agent cannot finalize.",
      }),
    );

    const summary = runEvaluation(workspace);
    expect(summary.process.staleWriteRejectionCount).toBe(2);
  });

  it("counts human message ack rate", () => {
    const workspace = baseWorkspace();
    const msgEvent = event("event-0003", {
      actor: "human",
      actionType: "SEND_TEAMMATE_MESSAGE",
      objectType: "human_message",
      objectId: "human-message-0001",
    });
    workspace.events.push(msgEvent);
    workspace.agentControl.acknowledgedHumanEventIds = [msgEvent.id];

    const summary = runEvaluation(workspace);
    expect(summary.process.humanMessageCount).toBe(1);
    expect(summary.process.acknowledgedHumanMessageCount).toBe(1);
    expect(summary.process.humanMessageAckRate).toBe(1);
  });

  it("detects stale Brief in outcome", () => {
    const workspace = baseWorkspace();
    // Set derivation with a claim version that doesn't match current
    workspace.brief.derivation = {
      claimVersions: { "claim-1": 99 },
      evidenceVersions: {},
      generatedFromEventIds: [],
      generatedAt: "2026-06-15T00:00:00.000Z",
      generatedBy: "agent",
    };
    // claim-1 is at version 1 (in baseWorkspace), derivation says 99 → stale

    const summary = runEvaluation(workspace);
    expect(summary.outcome.briefStaleDetected).toBe(true);
  });

  it("counts agent accepted action rate", () => {
    const workspace = baseWorkspace();
    // baseWorkspace already has 2 events (PROPOSE_CLAIM + UPDATE_CLAIM)
    // Add one accepted + one rejected agent action
    workspace.events.push(
      event("event-0003", {
        actor: "agent",
        actionType: "ADD_NOTE",
        objectType: "note",
        objectId: "note-1",
      }),
      event("event-0004", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        rejectionCode: "PERMISSION_DENIED",
      }),
    );

    const summary = runEvaluation(workspace);
    // Accepted: PROPOSE_CLAIM + ADD_NOTE = 2; Rejected: 1; Total = 3
    expect(summary.process.acceptedAgentActionCount).toBe(2);
    expect(summary.process.totalAgentApplyResults).toBe(3);
    expect(summary.process.acceptedAgentActionRate).toBeCloseTo(2 / 3);
  });

  it("counts source location completeness for agent evidence", () => {
    const workspace = baseWorkspace();
    // Add agent evidence with sourceVersion and valid line range
    workspace.evidence.push({
      id: "evidence-2",
      sourceId: "source-1",
      quoteOrFinding: "With location.",
      relevance: "Test.",
      addedBy: "agent",
      createdAt: "2026-06-15T00:00:00.000Z",
      version: 1,
      updatedAt: "2026-06-15T00:00:00.000Z",
      createdBy: "agent",
      updatedBy: "agent",
      sourceVersion: 1,
      sourceContentHash: "abc123",
      startLine: 2,
      endLine: 5,
    });

    const summary = runEvaluation(workspace);
    expect(summary.traceability.totalAgentExtractedEvidence).toBe(1);
    expect(summary.traceability.evidenceWithSourceVersionCount).toBe(1);
    expect(summary.traceability.evidenceWithSourceHashCount).toBe(1);
    expect(summary.traceability.evidenceWithValidLineRange).toBe(1);
    expect(summary.traceability.sourceLocationCompletenessRate).toBe(1);
  });

  it("reports V0.2 collaboration risk metrics", () => {
    const workspace = baseWorkspace();
    workspace.messages = [
      {
        id: "human-message-1",
        actor: "human",
        content: "Please consider route mix.",
        relatedObjectIds: ["claim-1"],
        createdAt: "2026-06-15T00:00:00.000Z",
        status: "pending",
      },
      {
        id: "agent-message-1",
        actor: "agent",
        content: "I will update the claim.",
        relatedObjectIds: ["claim-1"],
        createdAt: "2026-06-15T00:01:00.000Z",
        status: "resolved",
        inReplyToMessageId: "human-message-1",
      },
    ];
    workspace.events.push(
      event("event-0003", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        objectType: "brief",
        objectId: "brief",
        expectedVersion: 1,
        rejectionCode: "STALE_OBJECT_VERSION",
      }),
      event("event-0004", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        objectType: "brief",
        objectId: "brief",
        expectedVersion: 1,
        rejectionCode: "STALE_OBJECT_VERSION",
      }),
      event("event-0005", {
        actor: "human",
        actionType: "UPDATE_CLAIM",
        objectType: "claim",
        objectId: "claim-1",
        changes: [{ field: "status", before: "ai_proposed", after: "human_revised" }],
      }),
      event("event-0006", {
        actor: "agent",
        actionType: "ACTION_REJECTED",
        objectType: "source",
        objectId: "source-1",
        rejectionCode: "DUPLICATE_SOURCE",
      }),
    );

    const summary = runEvaluation(workspace);

    expect(summary.process.repeatedStaleWriteCount).toBe(1);
    expect(summary.process.duplicateSourceCount).toBe(1);
    expect(summary.process.messageResolutionRate).toBe(0);
    expect(summary.process.agentReplyWithoutActionCount).toBe(1);
    expect(summary.process.unresolvedHumanRevisionCount).toBe(1);
  });
});
