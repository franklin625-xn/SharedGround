import { beforeEach, describe, expect, it } from "vitest";
import { resetEventCounterForTests } from "@/core/event-factory";
import { applyWorkspaceAction, applyWorkspaceActionWithResult } from "@/core/reducer";
import type { WorkspaceAction } from "@/core/schemas";
import { resetObjectCounterForTests } from "@/core/reducer";
import type { WorkspaceState } from "@/core/types";

function createState(): WorkspaceState {
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
        summary:
          "EU policy aims to expand clean technology manufacturing capacity.",
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
    claims: [],
    brief: {
      markdown: "",
      updatedBy: "system",
      updatedAt: "2026-06-15T00:00:00.000Z",
      version: 1,
      createdAt: "2026-06-15T00:00:00.000Z",
      createdBy: "system",
    },
    events: [],
    agentStatus: "idle",
    agentControl: {
      status: "idle",
      stepCountInRun: 0,
      maxStepsPerRun: 12,
      maxActionsPerStep: 3,
      acknowledgedHumanEventIds: [],
      discardedStaleRunResponseCount: 0,
      mode: "idle",
    },
    humanMessages: [],
    completed: false,
  };
}

describe("applyWorkspaceAction", () => {
  beforeEach(() => {
    resetEventCounterForTests();
    resetObjectCounterForTests();
  });

  it("lets an agent propose a claim and writes an event", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure.",
          reasoning: "Support schemes and regulatory tools favor local capacity.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
          confidence: 0.74,
        },
        reason: "Evidence supports a preliminary claim.",
      },
      "agent",
    );

    expect(next.claims).toHaveLength(1);
    expect(next.claims[0]?.status).toBe("ai_proposed");
    expect(next.events[0]?.actionType).toBe("PROPOSE_CLAIM");
    expect(next.events[0]?.actor).toBe("agent");
  });

  it("rejects an agent finalizing a claim and writes ACTION_REJECTED", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure.",
          reasoning: "Support schemes and regulatory tools favor local capacity.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
        reason: "Evidence supports a preliminary claim.",
      },
      "agent",
    );

    const next = applyWorkspaceAction(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: { claimId: withClaim.claims[0]!.id, status: "final" },
        reason: "Agent tries to finalize.",
      },
      "agent",
    );

    expect(next.claims[0]?.status).toBe("ai_proposed");
    expect(next.events.at(-1)?.actionType).toBe("ACTION_REJECTED");
    expect(next.events.at(-1)?.summary).toContain(
      "Agent cannot set claim status to final",
    );
  });

  it("lets a human revise a claim", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure.",
          reasoning: "Support schemes and regulatory tools favor local capacity.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
        reason: "Evidence supports a preliminary claim.",
      },
      "agent",
    );

    const next = applyWorkspaceAction(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: withClaim.claims[0]!.id,
          statement:
            "EU policy increases localization pressure, with effects varying by sector.",
          status: "human_revised",
          humanDecisionNote: "Narrow the claim by sector.",
        },
        reason: "Human narrows the judgment.",
      },
      "human",
    );

    expect(next.claims[0]?.status).toBe("human_revised");
    expect(next.claims[0]?.statement).toContain("varying by sector");
    expect(next.events.at(-1)?.actor).toBe("human");
  });

  it("sets waiting status when agent requests human input", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "REQUEST_HUMAN_INPUT",
        payload: {
          question: "Should the brief focus on EV batteries or semiconductors?",
          relatedObjectIds: [],
        },
        reason: "Direction choice belongs to human.",
      },
      "agent",
    );

    expect(next.agentStatus).toBe("waiting_for_human");
    expect(next.pendingHumanRequest?.status).toBe("open");
  });

  it("rejects evidence when the source ID does not exist", () => {
    const state = createState();
    const next = applyWorkspaceAction(
      state,
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: "missing-source",
          quoteOrFinding: "Unsupported finding.",
          relevance: "Should not be accepted.",
        },
        reason: "Model referenced a missing source.",
      },
      "agent",
    );

    expect(next.evidence).toEqual(state.evidence);
    expect(next.events.at(-1)?.actionType).toBe("ACTION_REJECTED");
    expect(next.events.at(-1)?.summary).toContain("missing-source");
  });

  it("rejects claims that reference missing evidence IDs", () => {
    const state = createState();
    const next = applyWorkspaceAction(
      state,
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure.",
          reasoning: "Model cited missing evidence.",
          supportingEvidenceIds: ["missing-evidence"],
          counterEvidenceIds: [],
          confidence: 0.6,
        },
        reason: "Model referenced missing evidence.",
      },
      "agent",
    );

    expect(next.claims).toEqual([]);
    expect(next.events.at(-1)?.actionType).toBe("ACTION_REJECTED");
    expect(next.events.at(-1)?.summary).toContain("missing-evidence");
  });

  it("keeps state stable when agent waits", () => {
    const state = createState();
    const next = applyWorkspaceAction(
      state,
      {
        type: "WAIT",
        payload: { waitingFor: "Human direction." },
        reason: "Open request exists.",
      },
      "agent",
    );

    expect(next.sources).toEqual(state.sources);
    expect(next.events[0]?.actionType).toBe("WAIT");
  });

  it("lets human answer an open request and returns agent to idle", () => {
    const waiting = applyWorkspaceAction(
      createState(),
      {
        type: "REQUEST_HUMAN_INPUT",
        payload: {
          question: "Should the brief focus on EV batteries or semiconductors?",
          relatedObjectIds: [],
        },
        reason: "Direction choice belongs to human.",
      },
      "agent",
    );

    const next = applyWorkspaceAction(
      waiting,
      {
        type: "ANSWER_HUMAN_INPUT",
        payload: {
          requestId: waiting.pendingHumanRequest!.id,
          answer: "Focus on EV batteries.",
        },
        reason: "Human chooses focus.",
      },
      "human",
    );

    expect(next.agentStatus).toBe("idle");
    expect(next.pendingHumanRequest?.status).toBe("answered");
    expect(next.pendingHumanRequest?.answer).toBe("Focus on EV batteries.");
  });

  it("lets a human edit a research note and writes a note-scoped event", () => {
    const withNote = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_NOTE",
        payload: {
          content: "Initial note.",
          sourceIds: ["source-1"],
          evidenceIds: [],
        },
        reason: "Human added a note.",
      },
      "human",
    );

    const noteId = withNote.notes[0]!.id;
    const next = applyWorkspaceAction(
      withNote,
      {
        type: "EDIT_NOTE",
        payload: {
          noteId,
          content: "Updated note.",
          sourceIds: ["source-1"],
          evidenceIds: ["evidence-1"],
        },
        reason: "Human edited a note.",
      },
      "human",
    );

    expect(next.notes[0]?.content).toBe("Updated note.");
    expect(next.notes[0]?.evidenceIds).toEqual(["evidence-1"]);
    expect(next.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "EDIT_NOTE",
      objectType: "note",
      objectId: noteId,
    });
  });

  it("lets a human edit a source and writes scalar changes in a source-scoped event", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "EDIT_SOURCE",
        payload: {
          sourceId: "source-1",
          title: "Updated Net-Zero Industry Act",
          publisher: "Updated Commission",
          url: "https://example.com/nzia",
          publishedAt: "2026-06-15",
          summary: "Updated source summary.",
        },
        reason: "Human corrected source metadata.",
      },
      "human",
    );

    expect(next.sources[0]).toMatchObject({
      id: "source-1",
      title: "Updated Net-Zero Industry Act",
      publisher: "Updated Commission",
      url: "https://example.com/nzia",
      publishedAt: "2026-06-15",
      summary: "Updated source summary.",
    });
    expect(next.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "EDIT_SOURCE",
      objectType: "source",
      objectId: "source-1",
      reason: "Human corrected source metadata.",
    });
    expect(next.events.at(-1)?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "title",
          before: "Net-Zero Industry Act",
          after: "Updated Net-Zero Industry Act",
        }),
        expect.objectContaining({
          field: "publisher",
          before: "European Commission",
          after: "Updated Commission",
        }),
      ]),
    );
    expect(next.events.at(-1)?.before).toBeUndefined();
    expect(next.events.at(-1)?.after).toBeUndefined();
    expect(next.events.at(-1)?.legacyBefore).toBeUndefined();
    expect(next.events.at(-1)?.legacyAfter).toBeUndefined();
  });

  it("lets a human edit evidence and writes scalar changes in an evidence-scoped event", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId: "evidence-1",
          quoteOrFinding: "Updated evidence finding.",
          relevance: "Updated relevance.",
        },
        reason: "Human corrected evidence wording.",
      },
      "human",
    );

    expect(next.evidence[0]).toMatchObject({
      id: "evidence-1",
      quoteOrFinding: "Updated evidence finding.",
      relevance: "Updated relevance.",
    });
    expect(next.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "EDIT_EVIDENCE",
      objectType: "evidence",
      objectId: "evidence-1",
      reason: "Human corrected evidence wording.",
    });
    expect(next.events.at(-1)?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "quoteOrFinding",
          before: "The EU links public support to local manufacturing capacity.",
          after: "Updated evidence finding.",
        }),
        expect.objectContaining({
          field: "relevance",
          before: "Shows localization pressure.",
          after: "Updated relevance.",
        }),
      ]),
    );
    expect(next.events.at(-1)?.before).toBeUndefined();
    expect(next.events.at(-1)?.after).toBeUndefined();
    expect(next.events.at(-1)?.legacyBefore).toBeUndefined();
    expect(next.events.at(-1)?.legacyAfter).toBeUndefined();
  });

  it("lets a human mark a claim evidence insufficient and finalize it with claim-scoped events", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure.",
          reasoning: "Support schemes and regulatory tools favor local capacity.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
        reason: "Evidence supports a preliminary claim.",
      },
      "agent",
    );

    const claimId = withClaim.claims[0]!.id;
    const insufficient = applyWorkspaceAction(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId,
          status: "evidence_insufficient",
          humanDecisionNote: "Need one primary-source citation.",
        },
        reason: "Human requests stronger evidence.",
      },
      "human",
    );

    const finalized = applyWorkspaceAction(
      insufficient,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId,
          status: "final",
          humanDecisionNote: "Final after evidence review.",
        },
        reason: "Human finalizes the claim.",
      },
      "human",
    );

    expect(insufficient.claims[0]?.status).toBe("evidence_insufficient");
    expect(insufficient.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "UPDATE_CLAIM",
      objectType: "claim",
      objectId: claimId,
    });
    expect(finalized.claims[0]?.status).toBe("final");
    expect(finalized.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "UPDATE_CLAIM",
      objectType: "claim",
      objectId: claimId,
    });
  });

  it("lets a human complete the workspace and writes a task-scoped event", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "FINISH",
        payload: {},
        reason: "Human completes the workspace.",
      },
      "human",
    );

    expect(next.completed).toBe(true);
    expect(next.agentStatus).toBe("completed");
    expect(next.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "FINISH",
      objectType: "task",
      objectId: "task-1",
    });
  });

  it("writes human actor events with object scope for all human CRUD actions", () => {
    const sourceState = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Battery policy update",
          publisher: "Commission",
          summary: "New policy details.",
        },
        reason: "Human added source.",
      },
      "human",
    );
    const sourceId = sourceState.sources.at(-1)!.id;
    expect(sourceState.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "ADD_SOURCE",
      objectType: "source",
      objectId: sourceId,
    });

    const evidenceState = applyWorkspaceAction(
      sourceState,
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId,
          quoteOrFinding: "Evidence finding.",
          relevance: "Supports the claim.",
        },
        reason: "Human added evidence.",
      },
      "human",
    );
    const evidenceId = evidenceState.evidence.at(-1)!.id;
    expect(evidenceState.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "ADD_EVIDENCE",
      objectType: "evidence",
      objectId: evidenceId,
    });

    const editedSourceState = applyWorkspaceAction(
      evidenceState,
      {
        type: "EDIT_SOURCE",
        payload: {
          sourceId,
          title: "Edited source",
          publisher: "Edited publisher",
          summary: "Edited summary.",
        },
        reason: "Human edited source.",
      },
      "human",
    );
    expect(editedSourceState.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "EDIT_SOURCE",
      objectType: "source",
      objectId: sourceId,
    });

    const editedEvidenceState = applyWorkspaceAction(
      editedSourceState,
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId,
          quoteOrFinding: "Edited evidence.",
          relevance: "Edited relevance.",
        },
        reason: "Human edited evidence.",
      },
      "human",
    );
    expect(editedEvidenceState.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "EDIT_EVIDENCE",
      objectType: "evidence",
      objectId: evidenceId,
    });

    const noteState = applyWorkspaceAction(
      editedEvidenceState,
      {
        type: "ADD_NOTE",
        payload: {
          content: "Research note.",
          sourceIds: [sourceId],
          evidenceIds: [evidenceId],
        },
        reason: "Human added note.",
      },
      "human",
    );
    const noteId = noteState.notes.at(-1)!.id;
    expect(noteState.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "ADD_NOTE",
      objectType: "note",
      objectId: noteId,
    });

    const claimState = applyWorkspaceAction(
      noteState,
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Claim.",
          reasoning: "Reasoning.",
          supportingEvidenceIds: [evidenceId],
          counterEvidenceIds: [],
        },
        reason: "Agent proposes claim.",
      },
      "agent",
    );
    const claimId = claimState.claims.at(-1)!.id;

    const confirmed = applyWorkspaceAction(
      claimState,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId,
          status: "human_confirmed",
          humanDecisionNote: "Confirmed.",
        },
        reason: "Human confirmed claim.",
      },
      "human",
    );
    expect(confirmed.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "UPDATE_CLAIM",
      objectType: "claim",
      objectId: claimId,
    });

    const contested = applyWorkspaceAction(
      confirmed,
      {
        type: "CHALLENGE_CLAIM",
        payload: {
          claimId,
          counterEvidenceIds: [evidenceId],
          note: "Contested.",
        },
        reason: "Human contested claim.",
      },
      "human",
    );
    expect(contested.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "CHALLENGE_CLAIM",
      objectType: "claim",
      objectId: claimId,
    });

    const waiting = applyWorkspaceAction(
      contested,
      {
        type: "REQUEST_HUMAN_INPUT",
        payload: {
          question: "Need direction?",
          relatedObjectIds: [claimId],
        },
        reason: "Agent asks.",
      },
      "agent",
    );
    const requestId = waiting.pendingHumanRequest!.id;
    const answered = applyWorkspaceAction(
      waiting,
      {
        type: "ANSWER_HUMAN_INPUT",
        payload: {
          requestId,
          answer: "Proceed.",
        },
        reason: "Human answered.",
      },
      "human",
    );
    expect(answered.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "ANSWER_HUMAN_INPUT",
      objectType: "human_request",
      objectId: requestId,
    });

    const briefState = applyWorkspaceAction(
      answered,
      {
        type: "EDIT_BRIEF",
        payload: {
          markdown: "# Brief",
        },
        reason: "Human edited brief.",
      },
      "human",
    );
    expect(briefState.events.at(-1)).toMatchObject({
      actor: "human",
      actionType: "EDIT_BRIEF",
      objectType: "brief",
      objectId: "brief",
    });
  });

  it("generates sequential event IDs starting from existing events", () => {
    const state = createState();

    // Add first event — should be event-0001
    const s1 = applyWorkspaceAction(
      state,
      {
        type: "WAIT",
        payload: { waitingFor: "Direction." },
        reason: "First.",
      },
      "agent",
    );
    expect(s1.events[0]?.id).toBe("event-0001");

    // Add second event — should be event-0002
    const s2 = applyWorkspaceAction(
      s1,
      {
        type: "WAIT",
        payload: { waitingFor: "More." },
        reason: "Second.",
      },
      "agent",
    );
    expect(s2.events[1]?.id).toBe("event-0002");

    // All event IDs unique
    const ids = s2.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates unique event IDs after a state with existing events", () => {
    // Simulate a state that already has events (e.g., after API round trip)
    const state = createState();
    state.events = [
      {
        id: "event-0001",
        timestamp: "2026-06-15T00:00:00.000Z",
        actor: "system",
        actionType: "ADD_SOURCE",
        summary: "Pre-existing event.",
      },
      {
        id: "event-0002",
        timestamp: "2026-06-15T00:00:00.000Z",
        actor: "system",
        actionType: "ADD_EVIDENCE",
        summary: "Another pre-existing event.",
      },
    ];

    const next = applyWorkspaceAction(
      state,
      {
        type: "WAIT",
        payload: { waitingFor: "Input." },
        reason: "After API round trip.",
      },
      "agent",
    );

    // New event should pick up from existing events
    expect(next.events[2]?.id).toBe("event-0003");
    expect(next.events).toHaveLength(3);
    // All unique
    const ids = next.events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates unique event IDs across multiple Run Agent turns", () => {
    const state = createState();

    // Simulate three agent turns with multiple actions each
    const t1Actions: WorkspaceAction[] = [
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Turn 1 Source",
          publisher: "Test",
          summary: "First turn source.",
        },
        reason: "Turn 1.",
      },
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: "source-1",
          quoteOrFinding: "Finding from turn 1.",
          relevance: "Relevant.",
        },
        reason: "Turn 1 evidence.",
      },
    ];

    const s1 = t1Actions.reduce(
      (s, a) => applyWorkspaceAction(s, a, "agent"),
      state,
    );

    // Three events from turn 1: ADD_SOURCE, ADD_EVIDENCE + the pre-existing source edit
    // Actually wait - state already has 1 source and 1 evidence from createState
    // Turn 1: ADD_SOURCE creates source-0002, ADD_EVIDENCE sources from source-1
    expect(s1.events).toHaveLength(2);
    expect(s1.events[0]?.id).toBe("event-0001");
    expect(s1.events[1]?.id).toBe("event-0002");

    // Turn 2: propose claims
    const t2Action: WorkspaceAction = {
      type: "PROPOSE_CLAIM",
      payload: {
        statement: "EU policy increases localization pressure.",
        reasoning: "Evidence supports.",
        supportingEvidenceIds: ["evidence-1"],
        counterEvidenceIds: [],
        confidence: 0.75,
      },
      reason: "Turn 2.",
    };

    const s2 = applyWorkspaceAction(s1, t2Action, "agent");
    expect(s2.events[2]?.id).toBe("event-0003");

    // Turn 3: request human input
    const t3Action: WorkspaceAction = {
      type: "REQUEST_HUMAN_INPUT",
      payload: {
        question: "Should the brief focus on EVs?",
        relatedObjectIds: [],
      },
      reason: "Turn 3.",
    };

    const s3 = applyWorkspaceAction(s2, t3Action, "agent");
    expect(s3.events[3]?.id).toBe("event-0004");

    // All 4 events have unique IDs
    const allIds = s3.events.map((e) => e.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("generates unique object IDs based on existing objects in state", () => {
    const state = createState();
    // State already has source-1 and evidence-1

    const s1 = applyWorkspaceAction(
      state,
      {
        type: "ADD_SOURCE",
        payload: {
          title: "New Source",
          publisher: "Test",
          summary: "Test summary.",
        },
        reason: "Test.",
      },
      "agent",
    );

    // Should be source-0002 (source-1 already exists)
    expect(s1.sources[1]?.id).toBe("source-0002");

    const s2 = applyWorkspaceAction(
      s1,
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: s1.sources[1]!.id,
          quoteOrFinding: "New evidence.",
          relevance: "Test relevance.",
        },
        reason: "Test.",
      },
      "agent",
    );

    // Should be evidence-0002 (evidence-1 already exists)
    expect(s2.evidence[1]?.id).toBe("evidence-0002");
  });

  // ── Phase 1: version metadata tests ──────────────────────────────────

  it("new objects start at version 1", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "New Source",
          publisher: "Test",
          summary: "Test.",
        },
      },
      "agent",
    );

    expect(next.sources[1]?.version).toBe(1);
    expect(next.sources[1]?.createdBy).toBe("agent");
    expect(next.sources[1]?.updatedBy).toBe("agent");
    expect(next.sources[1]?.createdAt).toBeTruthy();
    expect(next.sources[1]?.updatedAt).toBeTruthy();
  });

  it("updates increment version on existing objects", () => {
    const withSource = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "V1 Source",
          publisher: "Test",
          summary: "First.",
        },
      },
      "agent",
    );

    expect(withSource.sources[1]?.version).toBe(1);

    const edited = applyWorkspaceAction(
      withSource,
      {
        type: "EDIT_SOURCE",
        payload: {
          sourceId: withSource.sources[1]!.id,
          title: "V2 Source",
          publisher: "Updated",
          summary: "Second.",
          expectedVersion: 1,
        },
      },
      "agent",
    );

    expect(edited.sources[1]?.version).toBe(2);
    expect(edited.sources[1]?.updatedBy).toBe("agent");
  });

  it("event carries objectVersionBefore and objectVersionAfter on updates", () => {
    const withSource = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "V1 Source",
          publisher: "Test",
          summary: "First.",
        },
      },
      "agent",
    );

    const edited = applyWorkspaceAction(
      withSource,
      {
        type: "EDIT_SOURCE",
        payload: {
          sourceId: withSource.sources[1]!.id,
          title: "V2 Source",
          publisher: "Updated",
          summary: "Second.",
          expectedVersion: 1,
        },
      },
      "agent",
    );

    const lastEvent = edited.events.at(-1);
    expect(lastEvent?.objectVersionBefore).toBe(1);
    expect(lastEvent?.objectVersionAfter).toBe(2);
  });

  it("event carries changes (scalar diff) instead of full objects", () => {
    const withSource = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "V1 Source",
          publisher: "Test",
          summary: "First.",
        },
      },
      "agent",
    );

    const edited = applyWorkspaceAction(
      withSource,
      {
        type: "EDIT_SOURCE",
        payload: {
          sourceId: withSource.sources[1]!.id,
          title: "V2 Source",
          publisher: "Updated",
          summary: "Second.",
          expectedVersion: 1,
        },
      },
      "agent",
    );

    const lastEvent = edited.events.at(-1);
    expect(lastEvent?.changes).toBeDefined();
    expect(lastEvent?.changes).toHaveLength(3); // title, publisher, summary
    expect(lastEvent?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title", before: "V1 Source", after: "V2 Source" }),
        expect.objectContaining({ field: "publisher", before: "Test", after: "Updated" }),
        expect.objectContaining({ field: "summary", before: "First.", after: "Second." }),
      ]),
    );
    expect(lastEvent?.before).toBeUndefined();
    expect(lastEvent?.after).toBeUndefined();
    expect(lastEvent?.legacyBefore).toBeUndefined();
    expect(lastEvent?.legacyAfter).toBeUndefined();
  });

  it("events never contain full before/after state snapshots", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test.",
          reasoning: "Test.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    const event = next.events[0]!;
    // 'before' should not be the full WorkspaceState (should be undefined for ADD)
    // and changes should be present
    expect(event.objectVersionAfter).toBe(1);
    expect(event.before).toBeUndefined();
    expect(event.after).toBeUndefined();
    expect(event.legacyBefore).toBeUndefined();
    expect(event.legacyAfter).toBeUndefined();
  });

  it("ACTION_REJECTED stores a small rejected action snapshot instead of WorkspaceState", () => {
    const state = createState();
    const next = applyWorkspaceAction(
      state,
      {
        type: "UPDATE_CLAIM",
        payload: { claimId: "missing-claim", status: "final" },
        reason: "Agent tries to finalize missing claim.",
      },
      "agent",
    );

    const event = next.events.at(-1)!;
    expect(event.actionType).toBe("ACTION_REJECTED");
    expect(event.before).toBeUndefined();
    expect(event.after).toBeUndefined();
    expect(event.legacyBefore).toBeUndefined();
    expect(event.legacyAfter).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain('"events"');
    expect(JSON.stringify(event).length).toBeLessThan(1200);
  });

  it("100 rejected actions grow event JSON approximately linearly", () => {
    let state = createState();
    const sizes: number[] = [];

    for (let i = 0; i < 100; i++) {
      state = applyWorkspaceAction(
        state,
        {
          type: "EDIT_BRIEF",
          payload: {
            markdown: `stale ${i}`,
            expectedVersion: 999,
            derivation: {
              claimVersions: {},
              evidenceVersions: {},
              generatedFromEventIds: [],
            },
          },
          reason: "Force stale rejection.",
        },
        "agent",
      );
      sizes.push(JSON.stringify(state.events).length);
    }

    const firstTenDelta = sizes[9]! - sizes[0]!;
    const lastTenDelta = sizes[99]! - sizes[90]!;
    expect(lastTenDelta).toBeLessThan(firstTenDelta * 2);
    expect(JSON.stringify(state.events)).not.toContain('"events":');
  });

  it("schema version is 2 on all reducer outputs", () => {
    const next = applyWorkspaceAction(
      createState(),
      {
        type: "WAIT",
        payload: { waitingFor: "Test." },
      },
      "agent",
    );
    expect(next.schemaVersion).toBe(2);
  });
});

// ── Phase 2: applyWorkspaceActionWithResult ────────────────────────────

describe("applyWorkspaceActionWithResult", () => {
  beforeEach(() => {
    resetEventCounterForTests();
    resetObjectCounterForTests();
  });

  it("returns accepted result with actionId, eventId, and version metadata", () => {
    const { state, result } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: { title: "Test", publisher: "Pub", summary: "Sum." },
      },
      "agent",
    );

    expect(result.accepted).toBe(true);
    expect(result.actionId).toMatch(/^action-/);
    expect(result.eventId).toMatch(/^event-/);
    expect(result.objectType).toBe("source");
    expect(result.objectId).toBe(state.sources[1]!.id);
    expect(result.afterVersion).toBe(1);
    expect(result.rejectionCode).toBeUndefined();
  });

  it("rejects Agent UPDATE_CLAIM with STALE_OBJECT_VERSION when expectedVersion mismatches", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test.",
          reasoning: "Test.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    // First human edit pushes version to 2
    const edited = applyWorkspaceAction(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: withClaim.claims[0]!.id,
          status: "human_revised",
          humanDecisionNote: "Revised.",
        },
      },
      "human",
    );
    expect(edited.claims[0]!.version).toBe(2);

    // Agent tries to update with stale expectedVersion=1
    const { state, result } = applyWorkspaceActionWithResult(
      edited,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: edited.claims[0]!.id,
          statement: "Stale update.",
          expectedVersion: 1,
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("STALE_OBJECT_VERSION");
    expect(result.beforeVersion).toBe(2);
    expect(result.expectedVersion).toBe(1);
    // State unchanged except for rejection event
    expect(state.claims[0]!.version).toBe(2);
    expect(state.claims[0]!.statement).toBe("Test.");
    expect(state.events.at(-1)!.rejectionCode).toBe("STALE_OBJECT_VERSION");
  });

  it("rejects Agent existing-object updates when expectedVersion is missing", () => {
    const withNote = applyWorkspaceAction(
      createState(),
      {
        type: "ADD_NOTE",
        payload: {
          content: "Initial note.",
          sourceIds: ["source-1"],
          evidenceIds: ["evidence-1"],
        },
      },
      "human",
    );
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test claim.",
          reasoning: "Test reasoning.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    const cases: Array<{
      name: string;
      state: WorkspaceState;
      action: WorkspaceAction;
      objectId: string;
    }> = [
      {
        name: "EDIT_SOURCE",
        state: createState(),
        objectId: "source-1",
        action: {
          type: "EDIT_SOURCE",
          payload: {
            sourceId: "source-1",
            title: "Edited source",
            publisher: "Edited publisher",
            summary: "Edited summary.",
          },
        },
      },
      {
        name: "EDIT_EVIDENCE",
        state: createState(),
        objectId: "evidence-1",
        action: {
          type: "EDIT_EVIDENCE",
          payload: {
            evidenceId: "evidence-1",
            quoteOrFinding: "Edited evidence.",
            relevance: "Edited relevance.",
          },
        },
      },
      {
        name: "EDIT_NOTE",
        state: withNote,
        objectId: withNote.notes[0]!.id,
        action: {
          type: "EDIT_NOTE",
          payload: {
            noteId: withNote.notes[0]!.id,
            content: "Edited note.",
            sourceIds: ["source-1"],
            evidenceIds: ["evidence-1"],
          },
        },
      },
      {
        name: "UPDATE_CLAIM",
        state: withClaim,
        objectId: withClaim.claims[0]!.id,
        action: {
          type: "UPDATE_CLAIM",
          payload: {
            claimId: withClaim.claims[0]!.id,
            statement: "Edited claim.",
          },
        },
      },
      {
        name: "CHALLENGE_CLAIM",
        state: withClaim,
        objectId: withClaim.claims[0]!.id,
        action: {
          type: "CHALLENGE_CLAIM",
          payload: {
            claimId: withClaim.claims[0]!.id,
            counterEvidenceIds: ["evidence-1"],
            note: "Challenge note.",
          },
        },
      },
      {
        name: "EDIT_BRIEF",
        state: createState(),
        objectId: "brief",
        action: {
          type: "EDIT_BRIEF",
          payload: {
            markdown: "Draft brief.",
            derivation: {
              claimVersions: {},
              evidenceVersions: {},
              generatedFromEventIds: [],
            },
          },
        },
      },
    ];

    for (const item of cases) {
      const { state, result } = applyWorkspaceActionWithResult(
        item.state,
        item.action,
        "agent",
      );

      expect(result.accepted, item.name).toBe(false);
      expect(result.rejectionCode, item.name).toBe("INVALID_ACTION");
      expect(result.objectId, item.name).toBe(item.objectId);
      expect(state.events.at(-1)?.actionType, item.name).toBe("ACTION_REJECTED");
      expect(state.events.at(-1)?.rejectionCode, item.name).toBe("INVALID_ACTION");
    }
  });

  it("rejects Agent EDIT_EVIDENCE with STALE_OBJECT_VERSION when stale", () => {
    const base = createState();

    const edited = applyWorkspaceAction(
      base,
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId: "evidence-1",
          quoteOrFinding: "Updated.",
          relevance: "Updated.",
        },
      },
      "human",
    );
    expect(edited.evidence[0]!.version).toBe(2);

    const { result } = applyWorkspaceActionWithResult(
      edited,
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId: "evidence-1",
          quoteOrFinding: "Stale.",
          relevance: "Stale.",
          expectedVersion: 1,
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("STALE_OBJECT_VERSION");
  });

  it("allows Human update without expectedVersion", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test.",
          reasoning: "Test.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    // Human updates without expectedVersion — always succeeds
    const { state, result } = applyWorkspaceActionWithResult(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: withClaim.claims[0]!.id,
          status: "human_confirmed",
          humanDecisionNote: "Confirmed.",
        },
      },
      "human",
    );

    expect(result.accepted).toBe(true);
    expect(state.claims[0]!.version).toBe(2);
    expect(state.claims[0]!.status).toBe("human_confirmed");
  });

  it("allows Human update even with mismatched expectedVersion (Human wins)", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test.",
          reasoning: "Test.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    // Human updates, claim v1 → v2
    const edited = applyWorkspaceAction(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: withClaim.claims[0]!.id,
          status: "human_revised",
          humanDecisionNote: "V2.",
        },
      },
      "human",
    );

    // Human sends stale expectedVersion=1, but still succeeds
    const { result } = applyWorkspaceActionWithResult(
      edited,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: edited.claims[0]!.id,
          statement: "Human always wins.",
          expectedVersion: 1,
        },
      },
      "human",
    );

    expect(result.accepted).toBe(true);
  });

  it("rejects Agent regressing a human-reviewed claim back to ai_proposed", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test.",
          reasoning: "Test.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    const reviewed = applyWorkspaceAction(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: withClaim.claims[0]!.id,
          status: "human_confirmed",
          humanDecisionNote: "Looks good.",
        },
      },
      "human",
    );
    expect(reviewed.claims[0]!.status).toBe("human_confirmed");

    // Agent tries to regress to ai_proposed
    const { state, result } = applyWorkspaceActionWithResult(
      reviewed,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: reviewed.claims[0]!.id,
          status: "ai_proposed",
          expectedVersion: reviewed.claims[0]!.version,
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("AGENT_STATE_REGRESSION");
    expect(state.claims[0]!.status).toBe("human_confirmed");
    expect(state.events.at(-1)!.rejectionCode).toBe("AGENT_STATE_REGRESSION");
  });

  it("sets accepted=true and includes correct beforeVersion/afterVersion for successful Agent update", () => {
    const withClaim = applyWorkspaceAction(
      createState(),
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test.",
          reasoning: "Test.",
          supportingEvidenceIds: ["evidence-1"],
          counterEvidenceIds: [],
        },
      },
      "agent",
    );

    const { result } = applyWorkspaceActionWithResult(
      withClaim,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId: withClaim.claims[0]!.id,
          reasoning: "Updated reasoning.",
          expectedVersion: 1,
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(true);
    expect(result.beforeVersion).toBe(1);
    expect(result.afterVersion).toBe(2);
    expect(result.expectedVersion).toBe(1);
    expect(result.rejectionCode).toBeUndefined();
  });
});

// ── Phase 3: Markdown Sources & Evidence Location ──────────────────────

describe("Phase 3 — Markdown Sources & Evidence", () => {
  beforeEach(() => {
    resetEventCounterForTests();
    resetObjectCounterForTests();
  });

  it("ADD_SOURCE with Markdown content computes contentHash and lineCount", () => {
    const content = "# Title\n\nParagraph one.\n\nParagraph two.";
    const { state } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Test Markdown",
          publisher: "Uploaded",
          summary: "Test.",
          fileName: "test.md",
          mediaType: "markdown",
          content,
        },
      },
      "human",
    );

    const src = state.sources[1]!;
    expect(src.content).toBe(content);
    expect(src.contentHash).toBeTruthy();
    expect(src.contentHash).toHaveLength(8);
    expect(src.lineCount).toBe(5);
    expect(src.mediaType).toBe("markdown");
    expect(src.fileName).toBe("test.md");
  });

  it("ADD_SOURCE without content omits hash and lineCount", () => {
    const { state } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: { title: "No Content", publisher: "X", summary: "Y." },
      },
      "human",
    );

    const src = state.sources[1]!;
    expect(src.content).toBeUndefined();
    expect(src.contentHash).toBeUndefined();
    expect(src.lineCount).toBeUndefined();
    expect(src.mediaType).toBe("demo");
  });

  it("events never include Source.content or full objects in before/after", () => {
    const { state } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Secret Doc",
          publisher: "Uploaded",
          summary: "Confidential.",
          content: "TOP SECRET CONTENT HERE",
        },
      },
      "human",
    );

    const event = state.events.at(-1)!;
    expect(event.before).toBeUndefined();
    expect(event.after).toBeUndefined();
    expect(event.legacyBefore).toBeUndefined();
    expect(event.legacyAfter).toBeUndefined();
    // The source in state still has the content
    expect(state.sources[1]!.content).toBe("TOP SECRET CONTENT HERE");
  });

  it("skips duplicate Markdown contentHash without creating a second source", () => {
    const content = "# Same\n\nBody";
    const { state: first } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "First Upload",
          publisher: "Uploaded",
          summary: "First.",
          fileName: "same.md",
          mediaType: "markdown",
          content,
        },
      },
      "human",
    );
    const sourceCount = first.sources.length;

    const { state: second, result } = applyWorkspaceActionWithResult(
      first,
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Duplicate Upload",
          publisher: "Uploaded",
          summary: "Duplicate.",
          fileName: "same-copy.md",
          mediaType: "markdown",
          content,
        },
      },
      "human",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("DUPLICATE_SOURCE");
    expect(second.sources).toHaveLength(sourceCount);
    expect(second.events.at(-1)).toMatchObject({
      actionType: "ACTION_REJECTED",
      objectType: "source",
      rejectionCode: "DUPLICATE_SOURCE",
    });
    expect(JSON.stringify(second.events.at(-1))).not.toContain(content);
  });

  it("rejects ADD_EVIDENCE with mismatched startLine/endLine (one missing)", () => {
    const { state, result } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: "source-1",
          quoteOrFinding: "Test.",
          relevance: "Test.",
          startLine: 1,
        },
      },
      "human",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("LINE_RANGE_INVALID");
    expect(state.evidence).toHaveLength(1); // unchanged
  });

  it("rejects ADD_EVIDENCE with startLine > endLine", () => {
    const { result } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: "source-1",
          quoteOrFinding: "Test.",
          relevance: "Test.",
          startLine: 5,
          endLine: 3,
        },
      },
      "human",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("LINE_RANGE_INVALID");
  });

  it("accepts ADD_EVIDENCE with valid line range and snaps sourceVersion/sourceContentHash", () => {
    // First add a source with content
    const { state: withSrc } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Lines",
          publisher: "Test",
          summary: "Test.",
          content: "line1\nline2\nline3\nline4\nline5",
        },
      },
      "human",
    );
    const src = withSrc.sources[1]!;

    const { state, result } = applyWorkspaceActionWithResult(
      withSrc,
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: src.id,
          quoteOrFinding: "From lines 2-3.",
          relevance: "Test.",
          startLine: 2,
          endLine: 3,
          section: "Body",
          polarity: "supporting",
        },
      },
      "human",
    );

    expect(result.accepted).toBe(true);
    const ev = state.evidence.at(-1)!;
    expect(ev.sourceVersion).toBe(src.version);
    expect(ev.sourceContentHash).toBe(src.contentHash);
    expect(ev.startLine).toBe(2);
    expect(ev.endLine).toBe(3);
    expect(ev.section).toBe("Body");
    expect(ev.polarity).toBe("supporting");
  });

  it("rejects EDIT_EVIDENCE with endLine exceeding source lineCount", () => {
    const { state: withSrc } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "ADD_SOURCE",
        payload: {
          title: "Short",
          publisher: "Test",
          summary: "Test.",
          content: "only 2 lines\nthat's it",
        },
      },
      "human",
    );
    const srcId = withSrc.sources[1]!.id;

    const { state: withEv } = applyWorkspaceActionWithResult(
      withSrc,
      {
        type: "ADD_EVIDENCE",
        payload: {
          sourceId: srcId,
          quoteOrFinding: "Test.",
          relevance: "Test.",
        },
      },
      "human",
    );

    const { result } = applyWorkspaceActionWithResult(
      withEv,
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId: withEv.evidence.at(-1)!.id,
          quoteOrFinding: "Out of range.",
          relevance: "Test.",
          startLine: 1,
          endLine: 99,
        },
      },
      "human",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("LINE_RANGE_INVALID");
  });
});

// ── Phase 5: Human Messages & Acknowledgement ───────────────────────

describe("Phase 5 — Human Messages & Acknowledgement", () => {
  beforeEach(() => {
    resetEventCounterForTests();
    resetObjectCounterForTests();
  });

  it("SEND_TEAMMATE_MESSAGE creates pending message object and slim event", () => {
    const { state, result } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "SEND_TEAMMATE_MESSAGE",
        payload: {
          content: "Focus on EV batteries please.",
          relatedObjectIds: [],
        },
      },
      "human",
    );

    expect(result.accepted).toBe(true);
    expect(result.objectType).toBe("human_message");
    expect(state.messages!).toHaveLength(1);
    expect(state.messages![0]).toMatchObject({
      actor: "human",
      content: "Focus on EV batteries please.",
      status: "pending",
      relatedObjectIds: [],
    });

    // Event stores summary, not full content duplicate
    const event = state.events.find(
      (e) => e.objectType === "human_message",
    );
    expect(event).toBeDefined();
    expect(event!.summary).toBe("Human sent a teammate message.");
    expect(JSON.stringify(event)).not.toContain("Focus on EV batteries please.");
  });

  it("REPLY_TEAMMATE_MESSAGE creates agent reply and marks the human message read", () => {
    const { state: withMessage } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "SEND_TEAMMATE_MESSAGE",
        payload: {
          content: "Consider BF-BOF and scrap-EAF route shares.",
          relatedObjectIds: ["evidence-1"],
        },
      },
      "human",
    );
    const messageId = withMessage.messages![0]!.id;

    const { state, result } = applyWorkspaceActionWithResult(
      withMessage,
      {
        type: "REPLY_TEAMMATE_MESSAGE",
        payload: {
          content:
            "I will treat route mix as unresolved and update the claim before touching the brief.",
          inReplyToMessageId: messageId,
          relatedObjectIds: ["evidence-1"],
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(true);
    expect(state.messages!).toHaveLength(2);
    expect(state.messages![0]!.status).toBe("read");
    expect(state.messages![0]!.acknowledgedAt).toBeTruthy();
    expect(state.messages![1]).toMatchObject({
      actor: "agent",
      status: "resolved",
      inReplyToMessageId: messageId,
    });
  });

  it("RESOLVE_TEAMMATE_MESSAGE requires a real successful action id", () => {
    const { state: withMessage } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "SEND_TEAMMATE_MESSAGE",
        payload: {
          content: "Please revise the claim.",
          relatedObjectIds: [],
        },
      },
      "human",
    );
    const messageId = withMessage.messages![0]!.id;

    const { state, result } = applyWorkspaceActionWithResult(
      withMessage,
      {
        type: "RESOLVE_TEAMMATE_MESSAGE",
        payload: {
          messageId,
          resolvedByActionIds: ["missing-action"],
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("INVALID_REFERENCE");
    expect(state.messages![0]!.status).toBe("pending");
  });

  it("Agent cannot send SEND_TEAMMATE_MESSAGE", () => {
    const { result } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "SEND_TEAMMATE_MESSAGE",
        payload: {
          content: "Agent shouldn't send this.",
          relatedObjectIds: [],
        },
      },
      "agent",
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionCode).toBe("PERMISSION_DENIED");
  });

  it("unacknowledged Human edits appear in recentHumanChanges context", async () => {
    const { buildAgentContext } = await import("@/agent/build-context");

    // Human edits evidence
    const { state: s1 } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId: "evidence-1",
          quoteOrFinding: "Human edited this.",
          relevance: "New relevance.",
        },
      },
      "human",
    );

    const ctx = buildAgentContext(s1);
    expect(ctx.recentHumanChanges).toHaveLength(1);
    expect(ctx.recentHumanChanges[0]!.actionType).toBe("EDIT_EVIDENCE");
  });

  it("acknowledged Human events are excluded from recentHumanChanges", async () => {
    const { buildAgentContext } = await import("@/agent/build-context");

    // Human edits evidence
    const { state: s1 } = applyWorkspaceActionWithResult(
      createState(),
      {
        type: "EDIT_EVIDENCE",
        payload: {
          evidenceId: "evidence-1",
          quoteOrFinding: "Human edited this.",
          relevance: "New relevance.",
        },
      },
      "human",
    );

    const humanEventId = s1.events.at(-1)!.id;

    // Mark as acknowledged
    s1.agentControl.acknowledgedHumanEventIds = [humanEventId];

    const ctx = buildAgentContext(s1);
    expect(ctx.recentHumanChanges).toHaveLength(0);
  });
});
