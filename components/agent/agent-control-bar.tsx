"use client";

import React from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { AgentMode } from "@/store/workspace-store";
import type { AgentRunStatus } from "@/core/types";

function ModeBadge({ mode }: { mode: AgentMode }) {
  if (mode === "idle") return null;

  const config: Record<AgentMode, { label: string; className: string }> = {
    idle: { label: "", className: "" },
    mock: { label: "Mock", className: "badge-idle" },
    real: { label: "Real", className: "status-final" },
    fallback: { label: "Fallback", className: "badge-blocked" },
  };

  const c = config[mode];
  return <span className={c.className}>{c.label}</span>;
}

function StatusBadge({ status }: { status: AgentRunStatus }) {
  const config: Record<AgentRunStatus, { label: string; className: string }> = {
    idle: { label: "Idle", className: "badge-idle" },
    running: { label: "Running", className: "badge-working" },
    applying: { label: "Applying…", className: "badge-working" },
    paused: { label: "Paused", className: "badge-blocked" },
    waiting_for_human: { label: "Waiting for Human", className: "badge-waiting" },
    completed: { label: "Completed", className: "badge-completed" },
    error: { label: "Error", className: "badge-blocked" },
  };

  const c = config[status] ?? config.idle;
  return (
    <span className={c.className} title={`Agent status: ${c.label}`}>
      {c.label}
    </span>
  );
}

export function AgentControlBar() {
  const startAgent = useWorkspaceStore((s) => s.startAgent);
  const pauseAgent = useWorkspaceStore((s) => s.pauseAgent);
  const resumeAgent = useWorkspaceStore((s) => s.resumeAgent);
  const completed = useWorkspaceStore((s) => s.workspace.completed);
  const agentControl = useWorkspaceStore((s) => s.workspace.agentControl);
  const agentMode = useWorkspaceStore((s) => s.agentMode);
  const error = useWorkspaceStore((s) => s.agentError);
  const currentGoal = agentControl.currentGoal;
  const latestAction = agentControl.latestActionSummary;
  const status = agentControl.status;

  const isRunning = status === "running" || status === "applying";
  const isPaused = status === "paused";
  const isWaiting = status === "waiting_for_human";
  const isCompleted = status === "completed" || completed;
  const isIdle = status === "idle";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ModeBadge mode={agentMode} />
      <StatusBadge status={status} />

      {/* Start */}
      {(isIdle || isCompleted) && (
        <button
          type="button"
          onClick={startAgent}
          className="btn-primary text-xs"
          title="Start agent research"
        >
          ▶ Start
        </button>
      )}

      {/* Pause */}
      {isRunning && (
        <button
          type="button"
          onClick={pauseAgent}
          className="btn-ghost px-2 py-1 text-xs border border-surface-border"
          title="Pause agent execution"
        >
          ⏸ Pause
        </button>
      )}

      {/* Resume */}
      {isPaused && (
        <button
          type="button"
          onClick={resumeAgent}
          className="btn-primary text-xs"
          title="Resume agent from latest state"
        >
          ▶ Resume
        </button>
      )}

      {/* Waiting state */}
      {isWaiting && (
        <span className="text-2xs text-text-muted italic">
          Waiting for your input…
        </span>
      )}

      {/* Running spinner */}
      {isRunning && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}

      {/* Current goal */}
      {currentGoal && isRunning && (
        <span className="text-2xs text-text-muted truncate max-w-[200px]">
          {currentGoal}
        </span>
      )}

      {/* Latest action summary */}
      {latestAction && !isRunning && (
        <span className="text-2xs text-text-muted truncate max-w-[200px]">
          {latestAction}
        </span>
      )}

      {/* Error */}
      {error && (
        <span className="text-2xs text-red-400 truncate max-w-[200px]" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
