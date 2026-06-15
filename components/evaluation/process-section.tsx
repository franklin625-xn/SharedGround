import React from "react";
import type { ProcessEvaluation } from "@/eval/types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="card-sm">
      <div className="text-2xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-text-primary">{value}</div>
      {note && <div className="mt-1 text-2xs text-text-muted">{note}</div>}
    </div>
  );
}

export function ProcessSection({ process }: { process: ProcessEvaluation }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          Collaboration
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          Process evaluates whether the human participated and whether the agent
          handed control back at the right moments. Human override and request
          rates are context signals, not simple better-or-worse scores.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Metric label="Agent actions" value={process.agentActionCount} />
        <Metric label="Human actions" value={process.humanActionCount} />
        <Metric label="Human revisions" value={process.humanRevisionCount} />
        <Metric label="Contested claims" value={process.contestedClaimCount} />
        <Metric
          label="Human override rate"
          value={percent(process.humanOverrideRate)}
          note="Not inherently good or bad; inspect the activity log."
        />
        <Metric label="Human requests" value={process.humanRequestCount} />
        <Metric
          label="Answered human requests"
          value={process.answeredHumanRequestCount}
        />
        <Metric
          label="Effective human request rate"
          value={percent(process.effectiveHumanRequestRate)}
          note="Not a target to maximize."
        />
      </div>

      {/* V0.2 metrics */}
      <div>
        <h3 className="mt-3 border-t border-surface-border pt-3 text-sm font-semibold text-text-primary">
          V0.2 — Continuous Action Safety
        </h3>
        <p className="mt-1 text-xs text-text-secondary">
          These metrics measure how well the versioned action protocol prevents
          stale writes and enables Human-Agent coordination.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <Metric
          label="Stale write rejections"
          value={process.staleWriteRejectionCount}
          note="How often Agent tried to update a stale object version. Lower is better, but zero may mean no concurrency pressure."
        />
        <Metric
          label="Human messages"
          value={process.humanMessageCount}
        />
        <Metric
          label="Acknowledged messages"
          value={process.acknowledgedHumanMessageCount}
        />
        <Metric
          label="Message ack rate"
          value={percent(process.humanMessageAckRate)}
          note="Rate at which Agent acknowledged non-blocking human messages."
        />
        <Metric
          label="Accepted agent actions"
          value={`${process.acceptedAgentActionCount} / ${process.totalAgentApplyResults}`}
        />
        <Metric
          label="Agent action accept rate"
          value={percent(process.acceptedAgentActionRate)}
          note="Proportion of Agent actions that succeeded. High may indicate stable protocol; low may indicate heavy conflict."
        />
        <Metric
          label="Discarded stale responses"
          value={process.discardedStaleRunResponseCount}
          note="Count of Agent responses discarded due to stale runId/stepId."
        />
        <Metric
          label="Repeated stale writes"
          value={process.repeatedStaleWriteCount}
        />
        <Metric
          label="Duplicate sources"
          value={process.duplicateSourceCount}
        />
        <Metric
          label="Message resolution rate"
          value={percent(process.messageResolutionRate)}
        />
        <Metric
          label="Replies without action"
          value={process.agentReplyWithoutActionCount}
        />
        <Metric
          label="Revision resolution rate"
          value={percent(process.humanRevisionResolutionRate)}
        />
        <Metric
          label="Unresolved revisions"
          value={process.unresolvedHumanRevisionCount}
        />
      </div>
    </section>
  );
}
