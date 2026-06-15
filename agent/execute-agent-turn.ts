import { agentTurnSchema, type AgentTurn } from "@/agent/action-schema";
import { buildAgentContext } from "@/agent/build-context";
import { runMockAgent } from "@/agent/mock-agent";
import { applyWorkspaceAction } from "@/core/reducer";
import type { WorkspaceState } from "@/core/types";

export type AgentExecutionResult = {
  turn: AgentTurn;
  state: WorkspaceState;
};

/** V0.1: execute a turn and return turn + applied state. */
export function executeAgentTurn(state: WorkspaceState): AgentExecutionResult {
  const context = buildAgentContext(state);
  const turn = agentTurnSchema.parse(runMockAgent(context));

  const nextState = turn.actions.reduce(
    (current, action) => applyWorkspaceAction(current, action, "agent"),
    state,
  );

  return {
    turn,
    state: nextState,
  };
}

/** V0.2: return just the AgentTurn without applying actions server-side. */
export function getAgentTurn(state: WorkspaceState): AgentTurn {
  const context = buildAgentContext(state);
  return agentTurnSchema.parse(runMockAgent(context));
}
