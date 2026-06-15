"use client";

import React from "react";
import type { AgentRunStatus } from "@/core/types";

const statusConfig: Record<
  AgentRunStatus,
  { label: string; className: string }
> = {
  idle: { label: "Idle", className: "badge-idle" },
  running: { label: "Running", className: "badge-working" },
  applying: { label: "Applying…", className: "badge-working" },
  paused: { label: "Paused", className: "badge-blocked" },
  waiting_for_human: {
    label: "Waiting for Human",
    className: "badge-waiting",
  },
  completed: { label: "Completed", className: "badge-completed" },
  error: { label: "Error", className: "badge-blocked" },
};

export function AgentStatus({ status }: { status: AgentRunStatus }) {
  const cfg = statusConfig[status] ?? statusConfig.idle;
  return (
    <span className={cfg.className} title={`Agent status: ${cfg.label}`}>
      {cfg.label}
    </span>
  );
}
