import type { WorkspaceAction } from "@/core/schemas";
import type { Actor, ClaimStatus } from "@/core/types";

export type PermissionResult = {
  allowed: boolean;
  reason?: string;
};

const agentForbiddenClaimStatuses: ClaimStatus[] = [
  "human_confirmed",
  "human_revised",
  "final",
];

export function canApplyWorkspaceAction(
  actor: Actor,
  action: WorkspaceAction,
): PermissionResult {
  if (actor === "system") {
    return { allowed: true };
  }

  if (actor === "human") {
    if (
      action.type === "SEARCH_SOURCE" ||
      action.type === "WAIT" ||
      action.type === "REPLY_TEAMMATE_MESSAGE" ||
      action.type === "MARK_MESSAGE_READ" ||
      action.type === "RESOLVE_TEAMMATE_MESSAGE"
    ) {
      return {
        allowed: false,
        reason: `Human cannot perform ${action.type}; this action is reserved for agent control flow.`,
      };
    }

    return { allowed: true };
  }

  if (action.type === "ANSWER_HUMAN_INPUT") {
    return {
      allowed: false,
      reason: "Agent cannot answer human input requests.",
    };
  }

  if (action.type === "SEND_TEAMMATE_MESSAGE") {
    return {
      allowed: false,
      reason: "Agent cannot send teammate messages.",
    };
  }

  if (action.type === "FINISH") {
    return {
      allowed: false,
      reason: "Agent cannot finally complete the task.",
    };
  }

  if (action.type === "UPDATE_CLAIM") {
    const requestedStatus = action.payload.status;

    if (
      requestedStatus &&
      agentForbiddenClaimStatuses.includes(requestedStatus)
    ) {
      return {
        allowed: false,
        reason: `Agent cannot set claim status to ${requestedStatus}.`,
      };
    }
  }

  return { allowed: true };
}
