import type { AgentTurn } from "@/agent/action-schema";
import type { ActionApplyResult, WorkspaceState } from "@/core/types";

// ── V0.1 (deprecated, kept for backward compatibility) ──

export interface AgentApiSuccess {
  turn: AgentTurn;
  state: WorkspaceState;
  source: "mock" | "real";
  usedFallback: boolean;
  error?: string;
}

export interface AgentApiError {
  error: string;
}

// ── V0.2 Agent Step ──

export interface AgentStepRequest {
  runId: string;
  stepId: string;
  workspace: WorkspaceState;
  previousApplyResults?: ActionApplyResult[];
}

export interface AgentStepResponse {
  turn: AgentTurn;
  source: "mock" | "real";
  usedFallback: boolean;
  error?: string;
}
