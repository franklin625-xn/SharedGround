import type {
  ActionRejectionCode,
  Actor,
  EventChange,
  WorkspaceEvent,
  WorkspaceObjectType,
} from "@/core/types";

export type CreateWorkspaceEventInput = {
  actor: Actor;
  actionType: string;
  objectType?: WorkspaceObjectType;
  objectId?: string;
  summary: string;
  reason?: string;
  // ── V0.2 slim event fields ──
  actionId?: string;
  runId?: string;
  stepId?: string;
  objectVersionBefore?: number;
  objectVersionAfter?: number;
  expectedVersion?: number;
  changes?: EventChange[];
  rejectionCode?: ActionRejectionCode;
  // ── V0.1 compatibility input only. New events never persist these. ──
  legacyBefore?: unknown;
  legacyAfter?: unknown;
  /** @deprecated Use legacyBefore / changes. */
  before?: unknown;
  /** @deprecated Use legacyAfter / changes. */
  after?: unknown;
};

/**
 * Create a workspace event.
 *
 * When `existingCount` is provided (e.g. `state.events.length`), the event
 * ID is derived from it. This guarantees deterministic, collision-free IDs
 * across server-side agent turns and client-side human actions, even after
 * localStorage hydration.
 *
 * When `existingCount` is omitted (e.g., direct calls in tests), the
 * module-level `eventCounter` is used as fallback.
 */
export function createWorkspaceEvent(
  input: CreateWorkspaceEventInput,
  existingCount?: number,
): WorkspaceEvent {
  const base = {
    id: "",
    timestamp: new Date().toISOString(),
    actor: input.actor,
    actionType: input.actionType,
    objectType: input.objectType,
    objectId: input.objectId,
    summary: input.summary,
    reason: input.reason,
    // V0.2 slim fields
    actionId: input.actionId,
    runId: input.runId,
    stepId: input.stepId,
    objectVersionBefore: input.objectVersionBefore,
    objectVersionAfter: input.objectVersionAfter,
    expectedVersion: input.expectedVersion,
    changes: input.changes,
    rejectionCode: input.rejectionCode,
  };

  if (existingCount !== undefined) {
    return {
      ...base,
      id: `event-${(existingCount + 1).toString().padStart(4, "0")}`,
    };
  }

  // Legacy path — module-level counter (used by tests that don't pass state)
  eventCounter += 1;

  return {
    ...base,
    id: `event-${eventCounter.toString().padStart(4, "0")}`,
  };
}

let eventCounter = 0;

export function resetEventCounterForTests() {
  eventCounter = 0;
}
