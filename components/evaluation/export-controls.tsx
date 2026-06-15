"use client";

import React from "react";
import type { WorkspaceState } from "@/core/types";
import type { EvaluationSummary } from "@/eval/types";

export function buildEvaluationJson(summary: EvaluationSummary): string {
  return JSON.stringify(summary, null, 2);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function buildEvaluationMarkdown(
  workspace: WorkspaceState,
  summary: EvaluationSummary,
): string {
  const lines: string[] = [
    "# SharedGround Collaboration Evaluation",
    "",
    `Generated at: ${summary.generatedAt}`,
    "",
    "## Task",
    "",
    `- Title: ${workspace.task.title}`,
    `- Question: ${workspace.task.question || "Not specified"}`,
    `- Scope: ${workspace.task.scope || "Not specified"}`,
    `- Completed: ${yesNo(summary.outcome.taskCompleted)}`,
    "",
    "## Outcome",
    "",
    `- Task completed: ${yesNo(summary.outcome.taskCompleted)}`,
    `- Final claims: ${summary.outcome.finalClaimCount}`,
    `- Grounded final claims: ${summary.outcome.groundedFinalClaimCount}`,
    `- Grounded claim rate: ${
      summary.outcome.finalClaimCount === 0
        ? "No final claims"
        : percent(summary.outcome.groundedClaimRate)
    }`,
    `- Citation integrity rate: ${percent(summary.outcome.citationIntegrityRate)}`,
    `- Missing citation IDs: ${
      summary.outcome.missingCitationIds.length > 0
        ? summary.outcome.missingCitationIds.join(", ")
        : "None"
    }`,
    "",
    "## Collaboration",
    "",
    `- Agent actions: ${summary.process.agentActionCount}`,
    `- Human actions: ${summary.process.humanActionCount}`,
    `- Human revisions: ${summary.process.humanRevisionCount}`,
    `- Contested claims: ${summary.process.contestedClaimCount}`,
    `- Human override rate: ${percent(summary.process.humanOverrideRate)}`,
    `- Human requests: ${summary.process.humanRequestCount}`,
    `- Answered human requests: ${summary.process.answeredHumanRequestCount}`,
    `- Effective human request rate: ${percent(
      summary.process.effectiveHumanRequestRate,
    )}`,
    `- Human revision resolution rate: ${percent(summary.process.humanRevisionResolutionRate)}`,
    `- Unresolved human revisions: ${summary.process.unresolvedHumanRevisionCount}`,
    `- Message resolution rate: ${percent(summary.process.messageResolutionRate)}`,
    `- Agent replies without supporting action: ${summary.process.agentReplyWithoutActionCount}`,
    "",
    "## Control",
    "",
    `- Unauthorized actions: ${summary.process.unauthorizedActionCount}`,
    `- Wait count: ${summary.process.waitCount}`,
    `- Correct waits: ${summary.process.correctWaitCount}`,
    `- Stale write rejections: ${summary.process.staleWriteRejectionCount}`,
    `- Repeated stale writes: ${summary.process.repeatedStaleWriteCount}`,
    `- Duplicate source attempts: ${summary.process.duplicateSourceCount}`,
    `- Discarded stale responses: ${summary.process.discardedStaleRunResponseCount}`,
    `- Human modifications respected: ${yesNo(
      summary.process.respectedHumanModification,
    )}`,
    "",
    "## Traceability",
    "",
    `- Complete evidence chains: ${summary.traceability.completeTraceCount}`,
    `- Total final claims: ${summary.traceability.totalTraceCount}`,
    `- Complete trace rate: ${
      summary.traceability.totalTraceCount === 0
        ? "No final claims"
        : percent(summary.traceability.completeTraceRate)
    }`,
    "",
  ];

  if (summary.traceability.items.length === 0) {
    lines.push(
      "No final claims are available for traceability evaluation yet.",
      "",
    );
  } else {
    for (const item of summary.traceability.items) {
      const claim = workspace.claims.find((candidate) => candidate.id === item.claimId);
      lines.push(
        `### ${item.claimId}`,
        "",
        `- Statement: ${claim?.statement ?? "Claim not found"}`,
        `- Source: ${yesNo(item.hasSource)}`,
        `- Evidence: ${yesNo(item.hasEvidence)}`,
        `- Human decision: ${yesNo(item.hasHumanDecision)}`,
        `- Referenced in brief: ${yesNo(item.referencedInBrief)}`,
        `- Complete: ${yesNo(item.complete)}`,
        "",
      );
    }
  }

  return lines.join("\n");
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportControls({
  workspace,
  summary,
}: {
  workspace: WorkspaceState;
  summary: EvaluationSummary;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary text-xs"
        onClick={() =>
          downloadText(
            "evaluation-summary.json",
            buildEvaluationJson(summary),
            "application/json;charset=utf-8",
          )
        }
      >
        Export JSON
      </button>
      <button
        type="button"
        className="btn-secondary text-xs"
        onClick={() =>
          downloadText(
            "evaluation-summary.md",
            buildEvaluationMarkdown(workspace, summary),
            "text/markdown;charset=utf-8",
          )
        }
      >
        Export Markdown
      </button>
    </div>
  );
}
