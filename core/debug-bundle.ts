import type { AgentMode } from "@/store/workspace-store";
import type {
  EvaluationSummary,
} from "@/eval/types";
import type { WorkspaceState } from "@/core/types";

type StorageDiagnostics = {
  totalBytes: number;
  sourcesBytes: number;
  eventsBytes: number;
  evidenceBytes: number;
  notesBytes: number;
  claimsBytes: number;
  briefBytes: number;
  messagesBytes: number;
};

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function getStorageDiagnostics(
  workspace: WorkspaceState,
): StorageDiagnostics {
  const messages = workspace.messages ?? [];
  return {
    totalBytes: bytes(workspace),
    sourcesBytes: bytes(workspace.sources),
    eventsBytes: bytes(workspace.events),
    evidenceBytes: bytes(workspace.evidence),
    notesBytes: bytes(workspace.notes),
    claimsBytes: bytes(workspace.claims),
    briefBytes: bytes(workspace.brief),
    messagesBytes: bytes(messages),
  };
}

export function buildDebugBundle({
  workspace,
  evaluation,
  agentMode,
  model,
  lastRunId,
}: {
  workspace: WorkspaceState;
  evaluation: EvaluationSummary;
  agentMode: AgentMode;
  model?: string;
  lastRunId?: string;
}) {
  return {
    exportedAt: new Date().toISOString(),
    appVersion: "0.2",
    schemaVersion: workspace.schemaVersion,
    task: workspace.task,
    sources: workspace.sources,
    evidence: workspace.evidence,
    notes: workspace.notes,
    claims: workspace.claims,
    brief: workspace.brief,
    messages: workspace.messages ?? [],
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
    agentStatus: workspace.agentStatus,
    pendingHumanRequest: workspace.pendingHumanRequest,
    evaluation,
    runtime: {
      agentMode,
      model,
      lastRunId,
    },
    storageDiagnostics: getStorageDiagnostics(workspace),
  };
}
