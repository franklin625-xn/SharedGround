import { describe, expect, it } from "vitest";
import { briefIsStale, briefStaleReason } from "@/core/brief-stale";
import type { Brief, WorkspaceState } from "@/core/types";

function baseBrief(): Brief {
  return {
    markdown: "",
    updatedBy: "agent",
    updatedAt: "2026-06-15T00:00:00.000Z",
    version: 1,
    createdAt: "2026-06-15T00:00:00.000Z",
    createdBy: "agent",
  };
}

function baseState(): WorkspaceState {
  return {
    schemaVersion: 2,
    task: {
      id: "task-1",
      title: "Test",
      question: "Q?",
      scope: "S.",
      sourceMode: "demo_corpus",
      createdAt: "2026-06-15T00:00:00.000Z",
    },
    sources: [],
    evidence: [
      {
        id: "ev-1",
        sourceId: "src-1",
        quoteOrFinding: "Test.",
        relevance: "Test.",
        addedBy: "agent",
        createdAt: "2026-06-15T00:00:00.000Z",
        version: 2,
        updatedAt: "2026-06-15T00:00:00.000Z",
        createdBy: "agent",
        updatedBy: "agent",
      },
    ],
    notes: [],
    claims: [
      {
        id: "claim-1",
        statement: "Claim 1.",
        reasoning: "Test.",
        supportingEvidenceIds: [],
        counterEvidenceIds: [],
        status: "human_confirmed",
        createdBy: "agent",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
        version: 3,
        updatedBy: "human",
      },
    ],
    brief: {
      ...baseBrief(),
      derivation: {
        claimVersions: { "claim-1": 3 },
        evidenceVersions: { "ev-1": 2 },
        generatedFromEventIds: [],
        generatedAt: "2026-06-15T00:00:00.000Z",
        generatedBy: "agent",
      },
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

describe("briefIsStale", () => {
  it("returns false when no derivation exists", () => {
    const state = baseState();
    state.brief = { ...baseBrief() };
    expect(briefIsStale(state)).toBe(false);
  });

  it("returns false when derivation matches current versions", () => {
    expect(briefIsStale(baseState())).toBe(false);
  });

  it("returns true when claim version changed", () => {
    const state = baseState();
    state.claims[0]!.version = 5; // derivation says 3
    expect(briefIsStale(state)).toBe(true);
    expect(briefStaleReason(state)).toContain("v3 to v5");
  });

  it("returns true when evidence version changed", () => {
    const state = baseState();
    state.evidence[0]!.version = 99;
    expect(briefIsStale(state)).toBe(true);
    expect(briefStaleReason(state)).toContain("v2 to v99");
  });

  it("returns true when referenced claim is deleted", () => {
    const state = baseState();
    state.claims = [];
    expect(briefIsStale(state)).toBe(true);
  });

  it("returns true when claim status regresses from human-reviewed", () => {
    const state = baseState();
    state.claims[0]!.status = "ai_proposed"; // was human_confirmed
    expect(briefIsStale(state)).toBe(true);
    expect(briefStaleReason(state)).toContain("not reviewed");
  });

  it("returns false when source metadata changes (source edits don't stale Brief)", () => {
    // Brief derivation doesn't track source versions
    const state = baseState();
    state.sources.push({
      id: "src-1",
      title: "Changed title",
      publisher: "Changed",
      summary: "Changed.",
      addedBy: "human",
      createdAt: "2026-06-15T00:00:00.000Z",
      version: 99,
      updatedAt: "2026-06-15T00:00:00.000Z",
      createdBy: "human",
      updatedBy: "human",
    });
    expect(briefIsStale(state)).toBe(false);
  });
});
