import type { ActionApplyResult, Actor } from "@/core/types";
import type { WorkspaceAction } from "@/core/schemas";
import { applyWorkspaceAction, applyWorkspaceActionWithResult } from "@/core/reducer";
import { appendControlEvent } from "@/core/reducer";
import type {
  AgentStepRequest,
  AgentStepResponse,
} from "@/core/api-types";
import {
  createDemoWorkspaceState,
  createEmptyWorkspaceState,
} from "@/core/workspace-factory";
import type { WorkspaceState } from "@/core/types";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const STORAGE_KEY = "sharedground-workspace";
const PERSISTENCE_ERROR_EVENT = "sharedground:persistence-error";

export type AgentMode = "idle" | "mock" | "real" | "fallback";

// ── Transient Agent Runtime ────────────────────────────────────────────
// Per-run state that is NOT persisted and cleared on Pause/Resume.

interface AgentRuntime {
  previousApplyResults: ActionApplyResult[];
}

let transientRuntime: AgentRuntime = { previousApplyResults: [] };
let stepAbortController: AbortController | null = null;

function clearTransientRuntime() {
  transientRuntime = { previousApplyResults: [] };
  if (stepAbortController) {
    stepAbortController.abort();
    stepAbortController = null;
  }
}

// ── ID generators ──────────────────────────────────────────────────────

function createRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `run-${ts}-${rand}`;
}

function createStepId(runId: string, stepN: number): string {
  return `${runId}-step-${stepN}`;
}

// ── Store interface ────────────────────────────────────────────────────

export interface WorkspaceStore {
  workspace: WorkspaceState;
  agentError: string | null;
  agentMode: AgentMode;
  loadDemo: () => void;
  reset: () => void;
  applyAction: (action: WorkspaceAction, actor: Actor) => void;
  /** @deprecated Use startAgent(). */
  runAgent: () => void;
  setWorkspace: (workspace: WorkspaceState) => void;
  // ── V0.2 Agent controls ──
  startAgent: () => void;
  pauseAgent: () => void;
  resumeAgent: () => void;
}

// ── Initial state ──────────────────────────────────────────────────────

function buildInitialWorkspace(): WorkspaceState {
  return createEmptyWorkspaceState({
    title: "New Research Task",
    question: "",
    scope: "",
  });
}

function sanitizeWorkspaceForPersistence(workspace: WorkspaceState): WorkspaceState {
  return {
    ...workspace,
    messages: workspace.messages ?? [],
    humanMessages: [],
    events: workspace.events.map((event) => {
      const {
        before: _before,
        after: _after,
        legacyBefore: _legacyBefore,
        legacyAfter: _legacyAfter,
        ...slim
      } = event;
      return slim;
    }),
    agentControl: {
      ...workspace.agentControl,
      activeRunId: undefined,
      activeStepId: undefined,
    },
  };
}

function createSafeLocalStorage() {
  return {
    getItem: (name: string) => localStorage.getItem(name),
    removeItem: (name: string) => localStorage.removeItem(name),
    setItem: (name: string, value: string) => {
      try {
        localStorage.setItem(name, value);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Workspace could not be persisted.";
        window.dispatchEvent(
          new CustomEvent(PERSISTENCE_ERROR_EVENT, {
            detail: { message, bytes: value.length },
          }),
        );
        console.warn("SharedGround persistence failed", error);
      }
    },
  };
}

export function getPersistenceErrorEventName() {
  return PERSISTENCE_ERROR_EVENT;
}

// ── Store helpers (called outside set() to access getState) ────────────

function scheduleNextStep(runId: string) {
  setTimeout(() => {
    runAgentStep(runId);
  }, 0);
}

async function runAgentStep(runId: string) {
  const state = useWorkspaceStore.getState();
  const control = state.workspace.agentControl;

  // ── Guard: must be running ──
  if (control.status !== "running") return;
  if (control.activeRunId !== runId) return;

  // ── Step limit ──
  if (control.stepCountInRun >= control.maxStepsPerRun) {
    const ws = state.workspace;
    const updated = appendControlEvent(ws, "AGENT_PAUSED", runId, control.stepCountInRun, "Step limit reached.");
    useWorkspaceStore.setState({
      workspace: {
        ...updated,
        agentControl: {
          ...updated.agentControl,
          status: "paused",
          activeRunId: undefined,
          activeStepId: undefined,
          currentGoal: "Step limit reached.",
        },
      },
    });
    clearTransientRuntime();
    return;
  }

  const stepN = control.stepCountInRun + 1;
  const stepId = createStepId(runId, stepN);

  useWorkspaceStore.setState({
    workspace: {
      ...state.workspace,
      agentControl: {
        ...state.workspace.agentControl,
        activeStepId: stepId,
      },
    },
  });

  // ── Create per-step AbortController ──
  const controller = new AbortController();
  stepAbortController = controller;

  let response: Response;
  try {
    const body: AgentStepRequest = {
      runId,
      stepId,
      workspace: state.workspace,
      previousApplyResults: transientRuntime.previousApplyResults,
    };

    response = await fetch("/api/agent-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Pause aborted the fetch — expected, nothing to do
      stepAbortController = null;
      return;
    }
    useWorkspaceStore.setState({
      agentError: err instanceof Error ? err.message : "Agent step failed.",
      agentMode: "fallback",
    });
    stepAbortController = null;
    return;
  } finally {
    // Controller no longer needed after fetch completes/aborts
    stepAbortController = null;
  }

  // ═══════ Stale check — BEFORE response.json() ═══════
  const currentState = useWorkspaceStore.getState();
  const currentControl = currentState.workspace.agentControl;

  if (currentControl.activeRunId !== runId) {
    // Pause or new Resume invalidated this run
    useWorkspaceStore.setState({
      workspace: {
        ...currentState.workspace,
        agentControl: {
          ...currentControl,
          discardedStaleRunResponseCount: currentControl.discardedStaleRunResponseCount + 1,
          latestActionSummary: `Discarded stale response for run ${runId}.`,
        },
      },
    });
    return;
  }

  if (currentControl.activeStepId !== stepId) {
    // Defensive: new step started before this one returned
    useWorkspaceStore.setState({
      workspace: {
        ...currentState.workspace,
        agentControl: {
          ...currentControl,
          discardedStaleRunResponseCount: currentControl.discardedStaleRunResponseCount + 1,
          latestActionSummary: `Discarded stale step response ${stepId}.`,
        },
      },
    });
    return;
  }

  if (!response.ok) {
    useWorkspaceStore.setState({
      agentError: `API error: ${response.status}`,
      agentMode: "fallback",
    });
    return;
  }

  let payload: AgentStepResponse;
  try {
    payload = await response.json();
  } catch {
    useWorkspaceStore.setState({
      agentError: "Invalid JSON from agent API.",
      agentMode: "fallback",
    });
    return;
  }

  if ("error" in payload && !("turn" in payload)) {
    useWorkspaceStore.setState({
      agentError: (payload as { error: string }).error,
      agentMode: "fallback",
    });
    return;
  }

  const turn = (payload as AgentStepResponse).turn;

  // ── Apply control update (status → applying) ──
  useWorkspaceStore.setState({
    workspace: {
      ...currentState.workspace,
      agentControl: {
        ...currentControl,
        status: "applying",
        currentGoal: turn.nextGoal,
      },
    },
    agentMode: (payload as AgentStepResponse).source === "real"
      ? "real"
      : (payload as AgentStepResponse).usedFallback
        ? "fallback"
        : "mock",
  });

  // ── Apply each action against latest state ──
  const applyResults: ActionApplyResult[] = [];
  for (const action of turn.actions.slice(0, currentControl.maxActionsPerStep)) {
    const latest = useWorkspaceStore.getState();
    const { state: next, result } = applyWorkspaceActionWithResult(
      latest.workspace,
      action,
      "agent",
    );
    useWorkspaceStore.setState({ workspace: next });
    applyResults.push(result);
  }

  transientRuntime.previousApplyResults = applyResults;

  // ── Persist acknowledged Human event IDs from AgentTurn ──
  if (turn.acknowledgedHumanEventIds && turn.acknowledgedHumanEventIds.length > 0) {
    const postApply = useWorkspaceStore.getState();
    const currentAck = postApply.workspace.agentControl.acknowledgedHumanEventIds;
    const validHumanEventIds = new Set(
      postApply.workspace.events
        .filter((event) => event.actor === "human")
        .map((event) => event.id),
    );
    const filteredAckIds = turn.acknowledgedHumanEventIds.filter((eventId) =>
      validHumanEventIds.has(eventId),
    );
    const newAcks = Array.from(new Set([...currentAck, ...filteredAckIds]));
    useWorkspaceStore.setState({
      workspace: {
        ...postApply.workspace,
        agentControl: {
          ...postApply.workspace.agentControl,
          acknowledgedHumanEventIds: newAcks,
        },
      },
    });
  }

  // ── Post-apply state ──
  const postState = useWorkspaceStore.getState();
  const postControl = postState.workspace.agentControl;

  // If Human paused during apply, stop
  if (postControl.status === "paused") return;

  // ── Stop reason routing ──
  if (turn.stopReason === "waiting_for_human" || postState.workspace.pendingHumanRequest?.status === "open") {
    useWorkspaceStore.setState({
      workspace: {
        ...postState.workspace,
        agentControl: {
          ...postControl,
          status: "waiting_for_human",
          activeStepId: undefined,
          latestActionSummary: turn.nextGoal,
        },
      },
    });
    return;
  }

  if (turn.stopReason === "task_complete" || postState.workspace.completed) {
    const ws = postState.workspace;
    const updated = appendControlEvent(ws, "AGENT_COMPLETED", runId, stepN);
    useWorkspaceStore.setState({
      workspace: {
        ...updated,
        agentControl: {
          ...updated.agentControl,
          status: "completed",
          activeRunId: undefined,
          activeStepId: undefined,
          lastCompletedStepId: stepId,
          latestActionSummary: turn.nextGoal,
        },
      },
    });
    clearTransientRuntime();
    return;
  }

  // ── Schedule next step ──
  useWorkspaceStore.setState({
    workspace: {
      ...postState.workspace,
      agentControl: {
        ...postControl,
        status: "running",
        stepCountInRun: stepN,
        lastCompletedStepId: stepId,
        latestActionSummary: turn.nextGoal,
        activeStepId: undefined,
      },
    },
  });

  scheduleNextStep(runId);
}

// ── Zustand store ──────────────────────────────────────────────────────

export const useWorkspaceStore =
  /* c8 ignore next 3 */
  create<WorkspaceStore>()(
    persist(
      (set) => ({
        workspace: buildInitialWorkspace(),
        agentError: null,
        agentMode: "idle" as AgentMode,

        loadDemo: () => {
          clearTransientRuntime();
          set({
            workspace: createDemoWorkspaceState(),
            agentError: null,
            agentMode: "idle",
          });
        },

        reset: () => {
          clearTransientRuntime();
          set({
            workspace: buildInitialWorkspace(),
            agentError: null,
            agentMode: "idle",
          });
        },

        applyAction: (action: WorkspaceAction, actor: Actor) => {
          set((state) => ({
            workspace: applyWorkspaceAction(state.workspace, action, actor),
            agentError: null,
          }));
        },

        /** @deprecated Use startAgent(). */
        runAgent: () => {
          const store = useWorkspaceStore.getState();
          store.startAgent();
        },

        setWorkspace: (workspace: WorkspaceState) => {
          set({ workspace, agentError: null, agentMode: "idle" });
        },

        // ── V0.2 Agent controls ──

        startAgent: () => {
          const state = useWorkspaceStore.getState();
          const control = state.workspace.agentControl;

          // Don't start if already running
          if (control.status === "running" || control.status === "applying") return;
          // Don't start if waiting for human
          if (
            control.status === "waiting_for_human" &&
            state.workspace.pendingHumanRequest?.status === "open"
          ) return;

          clearTransientRuntime();

          const runId = createRunId();
          const ws = appendControlEvent(state.workspace, "AGENT_STARTED", runId);

          set({
            workspace: {
              ...ws,
              agentControl: {
                ...ws.agentControl,
                status: "running",
                activeRunId: runId,
                activeStepId: undefined,
                stepCountInRun: 0,
                lastCompletedStepId: undefined,
                currentGoal: undefined,
                latestActionSummary: undefined,
                error: undefined,
                mode: "mock",
              },
            },
            agentError: null,
          });

          scheduleNextStep(runId);
        },

        pauseAgent: () => {
          const state = useWorkspaceStore.getState();
          const control = state.workspace.agentControl;

          // Abort in-flight step fetch
          if (stepAbortController) {
            stepAbortController.abort();
            stepAbortController = null;
          }

          const invalidatedRunId = control.activeRunId;
          const stepCount = control.stepCountInRun;
          clearTransientRuntime();

          const ws = appendControlEvent(
            state.workspace,
            "AGENT_PAUSED",
            invalidatedRunId,
            stepCount,
            "Human paused the agent.",
          );

          set({
            workspace: {
              ...ws,
              agentControl: {
                ...ws.agentControl,
                status: "paused",
                activeRunId: undefined,
                activeStepId: undefined,
                currentGoal: undefined,
                latestActionSummary: "Paused by human.",
              },
            },
          });
        },

        resumeAgent: () => {
          const state = useWorkspaceStore.getState();
          const control = state.workspace.agentControl;

          // If Human request is open, go to waiting_for_human
          if (state.workspace.pendingHumanRequest?.status === "open") {
            set({
              workspace: {
                ...state.workspace,
                agentControl: {
                  ...control,
                  status: "waiting_for_human",
                  activeRunId: undefined,
                  activeStepId: undefined,
                },
              },
            });
            return;
          }

          clearTransientRuntime();

          const runId = createRunId();
          const ws = appendControlEvent(state.workspace, "AGENT_RESUMED", runId);

          set({
            workspace: {
              ...ws,
              agentControl: {
                ...ws.agentControl,
                status: "running",
                activeRunId: runId,
                activeStepId: undefined,
                stepCountInRun: 0,
                lastCompletedStepId: undefined,
                currentGoal: undefined,
                latestActionSummary: undefined,
                error: undefined,
                mode: "mock",
              },
            },
            agentError: null,
          });

          scheduleNextStep(runId);
        },
      }),
      {
        name: STORAGE_KEY,
        version: 2,
        storage:
          /* c8 ignore next 4 */
          typeof window !== "undefined"
            ? createJSONStorage(createSafeLocalStorage)
            : undefined,
        partialize: (state) => ({
          workspace: sanitizeWorkspaceForPersistence(state.workspace),
          agentError: state.agentError,
        }),
        migrate: (persisted: unknown, _version: number) => {
          const raw = persisted as Record<string, unknown> | null;
          if (!raw) return buildInitialWorkspace() as unknown as Record<string, unknown>;

          const ws = raw.workspace as WorkspaceState | undefined;

          if (ws?.schemaVersion === 2) {
            return {
              ...raw,
              workspace: sanitizeWorkspaceForPersistence(ws),
            } as Record<string, unknown>;
          }

          if (ws) {
            const migrated = {
              ...raw,
              workspace: createDemoWorkspaceState(),
            };
            return migrated as unknown as Record<string, unknown>;
          }

          return raw as Record<string, unknown>;
        },
      },
    ),
  );

/** For use outside React components — returns the raw store API. */
export function getWorkspaceStore() {
  return useWorkspaceStore;
}
