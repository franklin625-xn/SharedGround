import type { WorkspaceEvent, WorkspaceState } from "@/core/types";
import type { ProcessEvaluation } from "@/eval/types";
import { evaluateActionValidity } from "@/eval/rules/action-validity";
import { evaluateControlHandoff } from "@/eval/rules/control-handoff";
import { evaluateHumanOverride } from "@/eval/rules/human-override";

const humanModificationActions = new Set([
  "EDIT_SOURCE",
  "EDIT_EVIDENCE",
  "EDIT_NOTE",
  "UPDATE_CLAIM",
  "CHALLENGE_CLAIM",
  "EDIT_BRIEF",
]);

function modificationKey(event: WorkspaceEvent): string | undefined {
  if (!event.objectType || !event.objectId) return undefined;
  return `${event.objectType}:${event.objectId}`;
}

function respectsHumanModifications(events: WorkspaceEvent[]): boolean {
  const humanModifiedObjects = new Set<string>();

  for (const event of events) {
    const key = modificationKey(event);
    if (!key) continue;

    if (
      event.actor === "human" &&
      humanModificationActions.has(event.actionType)
    ) {
      humanModifiedObjects.add(key);
      continue;
    }

    if (
      event.actor === "agent" &&
      humanModifiedObjects.has(key) &&
      humanModificationActions.has(event.actionType)
    ) {
      return false;
    }
  }

  return true;
}

// ── V0.2 helpers ──

function countStaleRejections(events: WorkspaceEvent[]): number {
  return events.filter(
    (e) =>
      e.actionType === "ACTION_REJECTED" &&
      e.rejectionCode === "STALE_OBJECT_VERSION",
  ).length;
}

function countRepeatedStaleWrites(events: WorkspaceEvent[]): number {
  const seen = new Map<string, number>();
  let repeated = 0;
  for (const event of events) {
    if (
      event.actionType !== "ACTION_REJECTED" ||
      event.rejectionCode !== "STALE_OBJECT_VERSION"
    ) {
      continue;
    }
    const key = `${event.objectType ?? ""}:${event.objectId ?? ""}:${event.expectedVersion ?? ""}`;
    const count = seen.get(key) ?? 0;
    if (count > 0) repeated += 1;
    seen.set(key, count + 1);
  }
  return repeated;
}

function countDuplicateSources(events: WorkspaceEvent[]): number {
  return events.filter(
    (event) =>
      event.actionType === "ACTION_REJECTED" &&
      event.rejectionCode === "DUPLICATE_SOURCE",
  ).length;
}

function countHumanMessages(
  state: WorkspaceState,
): { total: number; acknowledged: number; resolved: number } {
  const messageEvents = state.events.filter(
    (e) => e.objectType === "human_message",
  );
  const humanMessages = (state.messages ?? []).filter(
    (message) => message.actor === "human",
  );
  const total = humanMessages.length || messageEvents.length;
  const acknowledged = messageEvents.filter((e) =>
    state.agentControl.acknowledgedHumanEventIds.includes(e.id),
  ).length;
  const resolved = humanMessages.filter(
    (message) => message.status === "resolved",
  ).length;
  return { total, acknowledged, resolved };
}

function countAgentRepliesWithoutAction(state: WorkspaceState): number {
  const actionVerbs = /\b(will|update|revise|add|request|resolve|补充|修改|更新|请求)\b/i;
  return (state.messages ?? []).filter(
    (message) =>
      message.actor === "agent" &&
      actionVerbs.test(message.content) &&
      (!message.resolvedByActionIds || message.resolvedByActionIds.length === 0),
  ).length;
}

function evaluateHumanRevisionResolution(state: WorkspaceState): {
  total: number;
  resolved: number;
  unresolved: number;
  rate: number;
} {
  const revisionEvents = state.events.filter(
    (event) =>
      event.actor === "human" &&
      event.actionType === "UPDATE_CLAIM" &&
      event.objectType === "claim" &&
      event.objectId &&
      event.changes?.some(
        (change) =>
          change.field === "status" &&
          (change.after === "human_revised" ||
            change.after === "evidence_insufficient" ||
            change.after === "contested"),
      ),
  );

  let resolved = 0;
  for (const revision of revisionEvents) {
    const laterEvents = state.events.slice(
      state.events.findIndex((event) => event.id === revision.id) + 1,
    );
    const addressed = laterEvents.some(
      (event) =>
        event.actor === "agent" &&
        event.actionType !== "ACTION_REJECTED" &&
        (event.objectId === revision.objectId ||
          event.actionType === "REQUEST_HUMAN_INPUT"),
    );
    const claimNow = state.claims.find((claim) => claim.id === revision.objectId);
    if (addressed || claimNow?.status === "evidence_insufficient") {
      resolved += 1;
    }
  }

  const total = revisionEvents.length;
  const unresolved = total - resolved;
  return {
    total,
    resolved,
    unresolved,
    rate: total > 0 ? resolved / total : 1,
  };
}

function countAgentApplyResults(state: WorkspaceState): {
  accepted: number;
  total: number;
} {
  const agentEvents = state.events.filter((e) => e.actor === "agent");
  const rejected = agentEvents.filter(
    (e) => e.actionType === "ACTION_REJECTED",
  ).length;
  const accepted = agentEvents.filter(
    (e) =>
      e.actionType !== "ACTION_REJECTED" &&
      e.actionType !== "WAIT" &&
      e.actionType !== "SEARCH_SOURCE" &&
      e.actionType !== "REQUEST_HUMAN_INPUT",
  ).length;
  const total = accepted + rejected;
  return { accepted, total: total || 0 };
}

// ── Main ──

export function evaluateProcess(state: WorkspaceState): ProcessEvaluation {
  const actionValidity = evaluateActionValidity(state.events);
  const controlHandoff = evaluateControlHandoff(state.events);
  const humanOverride = evaluateHumanOverride(state);

  const staleRejections = countStaleRejections(state.events);
  const messages = countHumanMessages(state);
  const applyResults = countAgentApplyResults(state);
  const revisionResolution = evaluateHumanRevisionResolution(state);

  return {
    agentActionCount: actionValidity.agentActionCount,
    humanActionCount: actionValidity.humanActionCount,
    humanRevisionCount: humanOverride.humanRevisionCount,
    contestedClaimCount: humanOverride.contestedClaimCount,
    humanOverrideRate: humanOverride.humanOverrideRate,
    humanRequestCount: controlHandoff.humanRequestCount,
    answeredHumanRequestCount: controlHandoff.answeredHumanRequestCount,
    effectiveHumanRequestRate: controlHandoff.effectiveHumanRequestRate,
    waitCount: controlHandoff.waitCount,
    correctWaitCount: controlHandoff.correctWaitCount,
    unauthorizedActionCount: actionValidity.unauthorizedActionCount,
    respectedHumanModification: respectsHumanModifications(state.events),
    // V0.2
    staleWriteRejectionCount: staleRejections,
    humanMessageCount: messages.total,
    acknowledgedHumanMessageCount: messages.acknowledged,
    humanMessageAckRate:
      messages.total > 0 ? messages.acknowledged / messages.total : 0,
    acceptedAgentActionCount: applyResults.accepted,
    totalAgentApplyResults: applyResults.total,
    acceptedAgentActionRate:
      applyResults.total > 0 ? applyResults.accepted / applyResults.total : 0,
    discardedStaleRunResponseCount:
      state.agentControl.discardedStaleRunResponseCount,
    repeatedStaleWriteCount: countRepeatedStaleWrites(state.events),
    duplicateSourceCount: countDuplicateSources(state.events),
    messageResolutionRate:
      messages.total > 0 ? messages.resolved / messages.total : 1,
    agentReplyWithoutActionCount: countAgentRepliesWithoutAction(state),
    humanRevisionResolutionRate: revisionResolution.rate,
    unresolvedHumanRevisionCount: revisionResolution.unresolved,
  };
}
