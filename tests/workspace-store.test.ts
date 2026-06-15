import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyWorkspaceAction, applyWorkspaceActionWithResult } from "@/core/reducer";
import { resetEventCounterForTests } from "@/core/event-factory";
import { resetObjectCounterForTests } from "@/core/reducer";
import {
  createDemoWorkspaceState,
  createEmptyWorkspaceState,
} from "@/core/workspace-factory";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { WorkspaceAction } from "@/core/schemas";
import type { WorkspaceState } from "@/core/types";

/**
 * Workspace store tests.
 *
 * These test store logic (loadDemo, reset, applyAction, serialization)
 * through the pure factory + reducer functions, which is what the
 * Zustand store delegates to. This approach avoids mocking global
 * localStorage in Node.js while fully exercising the same code paths.
 *
 * For e2e localStorage persistence, see the manual round-trip tests below.
 */

describe("workspace factory — load demo", () => {
  it("creates a complete demo workspace", () => {
    const state = createDemoWorkspaceState();
    expect(state.sources).toHaveLength(8);
    expect(state.evidence).toHaveLength(5);
    expect(state.task.id).toBe("demo-task-001");
    expect(state.agentStatus).toBe("idle");
  });
});

describe("workspace factory — reset / new task", () => {
  it("creates an empty workspace", () => {
    const state = createEmptyWorkspaceState({
      title: "New Task",
      question: "Q?",
      scope: "S.",
    });
    expect(state.sources).toEqual([]);
    expect(state.evidence).toEqual([]);
    expect(state.agentStatus).toBe("idle");
  });
});

describe("applyAction preserves existing state and writes events", () => {
  beforeEach(() => {
    resetEventCounterForTests();
    resetObjectCounterForTests();
  });

  it("retains pre-populated sources when adding evidence via applyAction", () => {
    const demo = createDemoWorkspaceState();
    const action: WorkspaceAction = {
      type: "ADD_EVIDENCE",
      payload: {
        sourceId: "demo-source-001",
        quoteOrFinding: "NZIA sets 40% domestic manufacturing target by 2030.",
        relevance: "Supports localization pressure claim.",
      },
      reason: "Extracting key data point.",
    };

    const next = applyWorkspaceAction(demo, action, "agent");

    // Existing demo data preserved
    expect(next.sources).toHaveLength(8);
    expect(next.evidence).toHaveLength(6); // 5 demo + 1 new
    expect(next.task.id).toBe("demo-task-001");

    // New evidence added
    const newEv = next.evidence.find((e) => e.id === "evidence-0001");
    expect(newEv).toBeDefined();
    expect(newEv?.addedBy).toBe("agent");
  });

  it("preserves event log when multiple actions are applied", () => {
    const demo = createDemoWorkspaceState();

    // Action 1: agent proposes a claim
    const afterPropose = applyWorkspaceAction(
      demo,
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure on Chinese firms.",
          reasoning: "Multiple policy tools link public support to EU production.",
          supportingEvidenceIds: ["demo-evidence-001", "demo-evidence-002"],
          counterEvidenceIds: [],
          confidence: 0.78,
        },
        reason: "Evidence from NZIA and FSR supports the claim.",
      },
      "agent",
    );

    expect(afterPropose.events).toHaveLength(1);
    expect(afterPropose.events[0]?.actionType).toBe("PROPOSE_CLAIM");

    // Action 2: human confirms the claim
    const claimId = afterPropose.claims[0]!.id;
    const afterConfirm = applyWorkspaceAction(
      afterPropose,
      {
        type: "UPDATE_CLAIM",
        payload: {
          claimId,
          status: "human_confirmed",
          humanDecisionNote: "Confirmed based on evidence provided.",
        },
        reason: "Human agrees.",
      },
      "human",
    );

    // Both events preserved
    expect(afterConfirm.events).toHaveLength(2);
    expect(afterConfirm.events[0]?.actionType).toBe("PROPOSE_CLAIM");
    expect(afterConfirm.events[1]?.actionType).toBe("UPDATE_CLAIM");

    // Sources and evidence still intact
    expect(afterConfirm.sources).toHaveLength(8);
    expect(afterConfirm.evidence).toHaveLength(5);
  });

  it("produces a reject event for unauthorized agent actions", () => {
    const demo = createDemoWorkspaceState();
    const claimState = applyWorkspaceAction(
      demo,
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "Test claim.",
          reasoning: "Test reasoning.",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        },
        reason: "Test.",
      },
      "agent",
    );

    const claimId = claimState.claims[0]!.id;
    const rejected = applyWorkspaceAction(
      claimState,
      {
        type: "UPDATE_CLAIM",
        payload: { claimId, status: "final" },
        reason: "Agent tries to finalize.",
      },
      "agent",
    );

    // Rejected: claim stays at ai_proposed
    expect(rejected.claims[0]?.status).toBe("ai_proposed");
    expect(rejected.events).toHaveLength(2);
    expect(rejected.events[1]?.actionType).toBe("ACTION_REJECTED");
  });
});

describe("JSON serialization round-trip", () => {
  it("serializes and deserializes demo workspace without data loss", () => {
    const original = createDemoWorkspaceState();

    // Simulate localStorage: JSON.stringify → JSON.parse
    const json = JSON.stringify(original);
    const restored: WorkspaceState = JSON.parse(json);

    // Core fields match
    expect(restored.task.id).toEqual(original.task.id);
    expect(restored.sources).toHaveLength(original.sources.length);
    expect(restored.evidence).toHaveLength(original.evidence.length);
    expect(restored.events).toEqual(original.events);
    expect(restored.agentStatus).toEqual(original.agentStatus);
    expect(restored.completed).toEqual(original.completed);

    // Deep equality
    expect(restored).toEqual(original);
  });

  it("serializes and deserializes a workspace with actions applied", () => {
    const demo = createDemoWorkspaceState();

    const afterAction = applyWorkspaceAction(
      demo,
      {
        type: "PROPOSE_CLAIM",
        payload: {
          statement: "EU policy increases localization pressure.",
          reasoning: "Evidence from NZIA and FSR supports.",
          supportingEvidenceIds: ["demo-evidence-001"],
          counterEvidenceIds: [],
          confidence: 0.75,
        },
        reason: "Preliminary analysis.",
      },
      "agent",
    );

    const json = JSON.stringify(afterAction);
    const restored: WorkspaceState = JSON.parse(json);

    // Events preserved after round-trip
    expect(restored.events).toHaveLength(1);
    expect(restored.events[0]?.actionType).toBe("PROPOSE_CLAIM");
    expect(restored.claims).toHaveLength(1);
    expect(restored.claims[0]?.statement).toContain("localization pressure");
    expect(restored.sources).toHaveLength(8);
    expect(restored).toEqual(afterAction);
  });
});

// ── Phase 4: Agent Step Loop ──────────────────────────────────────────

function mockStepResponse(overrides?: Partial<{
  actions: WorkspaceAction[];
  acknowledgedHumanEventIds: string[];
  stopReason: string;
  nextGoal: string;
}>) {
  return {
    turn: {
      situation: "Test step.",
      nextGoal: overrides?.nextGoal ?? "Advancing research.",
      actions: overrides?.actions ?? [{
        type: "ADD_SOURCE" as const,
        payload: { title: "Step Source", publisher: "Test", summary: "Added by agent step." },
        reason: "Test step action.",
      }],
      acknowledgedHumanEventIds: overrides?.acknowledgedHumanEventIds,
      stopReason: overrides?.stopReason ?? "turn_complete",
    },
    source: "mock",
    usedFallback: false,
  };
}

describe("agent step loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEventCounterForTests();
    resetObjectCounterForTests();
    useWorkspaceStore.setState({
      workspace: createDemoWorkspaceState(),
      agentError: null,
      agentMode: "idle",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("startAgent creates runId, sets status to running, writes AGENT_STARTED event", () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStepResponse({ stopReason: "task_complete" }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    useWorkspaceStore.getState().startAgent();

    const state = useWorkspaceStore.getState();
    expect(state.workspace.agentControl.status).toBe("running");
    expect(state.workspace.agentControl.activeRunId).toMatch(/^run-/);
    expect(state.workspace.agentControl.stepCountInRun).toBe(0);

    // AGENT_STARTED event written
    const startEvent = state.workspace.events.find(
      (e) => e.actionType === "AGENT_STARTED",
    );
    expect(startEvent).toBeDefined();
    expect(startEvent!.actor).toBe("system");

    // Advance timers to let step complete
    vi.advanceTimersToNextTimer();
  });

  it("pauseAgent aborts, clears runId, writes AGENT_PAUSED event", () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStepResponse({ stopReason: "turn_complete" }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    useWorkspaceStore.getState().startAgent();
    useWorkspaceStore.getState().pauseAgent();

    const state = useWorkspaceStore.getState();
    expect(state.workspace.agentControl.status).toBe("paused");
    expect(state.workspace.agentControl.activeRunId).toBeUndefined();

    const pauseEvent = state.workspace.events.find(
      (e) => e.actionType === "AGENT_PAUSED",
    );
    expect(pauseEvent).toBeDefined();
  });

  it("resumeAgent creates new runId, writes AGENT_RESUMED event", () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStepResponse({ stopReason: "task_complete" }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    useWorkspaceStore.getState().startAgent();
    useWorkspaceStore.getState().pauseAgent();

    const pausedRunId = useWorkspaceStore.getState().workspace.events
      .filter((e) => e.actionType === "AGENT_PAUSED")
      .at(-1);

    useWorkspaceStore.getState().resumeAgent();

    const state = useWorkspaceStore.getState();
    expect(state.workspace.agentControl.status).toBe("running");
    expect(state.workspace.agentControl.activeRunId).toMatch(/^run-/);

    const resumeEvent = state.workspace.events.find(
      (e) => e.actionType === "AGENT_RESUMED",
    );
    expect(resumeEvent).toBeDefined();
  });

  it("agent applies step actions to workspace and increments step count", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStepResponse({
        actions: [{
          type: "ADD_EVIDENCE" as const,
          payload: {
            sourceId: "demo-source-001",
            quoteOrFinding: "Step evidence.",
            relevance: "Test.",
          },
          reason: "Step action.",
        }],
        stopReason: "task_complete",
        nextGoal: "Done.",
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const demoState = createDemoWorkspaceState();
    useWorkspaceStore.setState({ workspace: demoState });

    useWorkspaceStore.getState().startAgent();

    // Let the step run (it calls setTimeout(0))
    await vi.advanceTimersToNextTimerAsync();

    const state = useWorkspaceStore.getState();
    // Evidence should have increased
    expect(state.workspace.evidence.length).toBeGreaterThan(demoState.evidence.length);
  });

  it("persists only existing unique human acknowledgement event IDs", async () => {
    const withMessage = applyWorkspaceAction(
      createDemoWorkspaceState(),
      {
        type: "SEND_TEAMMATE_MESSAGE",
        payload: {
          content: "Please prioritize the uploaded Markdown source.",
          relatedObjectIds: [],
        },
      },
      "human",
    );
    const humanEventId = withMessage.events.at(-1)!.id;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStepResponse({
        actions: [],
        acknowledgedHumanEventIds: [humanEventId, "missing-event", humanEventId],
        stopReason: "task_complete",
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
    useWorkspaceStore.setState({ workspace: withMessage });

    useWorkspaceStore.getState().startAgent();
    await vi.advanceTimersToNextTimerAsync();

    const state = useWorkspaceStore.getState();
    expect(state.workspace.agentControl.acknowledgedHumanEventIds).toEqual([
      humanEventId,
    ]);
  });

  it("Human edit between steps causes Agent stale rejection and re-read", async () => {
    // Step 1: Agent proposes a claim
    const step1Fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStepResponse({
        actions: [{
          type: "PROPOSE_CLAIM" as const,
          payload: {
            statement: "Agent claim v1.",
            reasoning: "Based on evidence.",
            supportingEvidenceIds: ["demo-evidence-001"],
            counterEvidenceIds: [],
          },
          reason: "Step 1.",
        }],
        stopReason: "turn_complete",
        nextGoal: "Claims proposed.",
      }),
    });

    globalThis.fetch = step1Fetch as unknown as typeof globalThis.fetch;
    useWorkspaceStore.getState().startAgent();
    await vi.advanceTimersToNextTimerAsync();

    // After step 1, Human edits the claim (pushes version to 2)
    const afterStep1 = useWorkspaceStore.getState();
    const claimId = afterStep1.workspace.claims[0]!.id;
    expect(afterStep1.workspace.claims[0]!.version).toBe(1);

    const { state: humanEdited } = applyWorkspaceActionWithResult(
      afterStep1.workspace,
      {
        type: "UPDATE_CLAIM",
        payload: { claimId, status: "human_revised", humanDecisionNote: "Revised." },
      },
      "human",
    );
    useWorkspaceStore.setState({ workspace: humanEdited });
    expect(useWorkspaceStore.getState().workspace.claims[0]!.version).toBe(2);

    // Override fetch to verify Agent re-reads latest state
    // The Agent will try to update with stale expectedVersion
    const stepCalls: WorkspaceState[] = [];
    const step2Fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init as { body: string }).body) as { workspace: WorkspaceState };
      stepCalls.push(body.workspace);

      // Simulate Agent returning stale update
      return {
        ok: true,
        json: async () => mockStepResponse({
          actions: [{
            type: "UPDATE_CLAIM" as const,
            payload: {
              claimId,
              statement: "Stale update.",
              expectedVersion: 1,  // Stale!
            },
            reason: "Step 2 — stale.",
          }],
          stopReason: "turn_complete",
          nextGoal: "Failed attempt.",
        }),
      };
    });

    globalThis.fetch = step2Fetch as unknown as typeof globalThis.fetch;

    // Wait for step 2
    await vi.advanceTimersToNextTimerAsync();

    // Verify Agent received the latest workspace (with claim v2)
    const sentWorkspace = stepCalls[0];
    expect(sentWorkspace).toBeDefined();
    expect(sentWorkspace!.claims[0]!.version).toBe(2);

    // Verify the stale action was rejected
    const finalState = useWorkspaceStore.getState();
    const rejectionEvent = finalState.workspace.events.find(
      (e) => e.rejectionCode === "STALE_OBJECT_VERSION",
    );
    expect(rejectionEvent).toBeDefined();
  });
});
