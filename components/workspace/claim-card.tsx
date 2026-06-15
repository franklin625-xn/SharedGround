"use client";

import React, { useState, type FormEvent } from "react";
import {
  buildConfirmClaimAction,
  buildContestClaimAction,
  buildEvidenceInsufficientClaimAction,
  buildFinalizeClaimAction,
  buildReviseClaimAction,
} from "@/core/human-actions";
import type { WorkspaceAction } from "@/core/schemas";
import type { Claim, Evidence } from "@/core/types";

const statusLabel: Record<string, string> = {
  ai_proposed: "AI Proposed",
  human_confirmed: "Human Confirmed",
  human_revised: "Human Revised",
  contested: "Contested",
  evidence_insufficient: "Evidence Insufficient",
  final: "Final",
};

const statusClass: Record<string, string> = {
  ai_proposed: "status-ai_proposed",
  human_confirmed: "status-human_confirmed",
  human_revised: "status-human_revised",
  contested: "status-contested",
  evidence_insufficient: "status-evidence_insufficient",
  final: "status-final",
};

function selectedValues(options: HTMLCollectionOf<HTMLOptionElement>) {
  return Array.from(options)
    .filter((option) => option.selected)
    .map((option) => option.value);
}

export function ClaimCard({
  claim,
  evidence,
  inBrief,
  onAction,
}: {
  claim: Claim;
  evidence: Evidence[];
  inBrief?: boolean;
  onAction: (action: WorkspaceAction) => void;
}) {
  const [mode, setMode] = useState<
    "idle" | "confirm" | "revise" | "contest" | "insufficient" | "finalize"
  >("idle");
  const [decisionNote, setDecisionNote] = useState("");
  const [revision, setRevision] = useState({
    statement: claim.statement,
    reasoning: claim.reasoning,
    humanDecisionNote: "",
  });
  const [contest, setContest] = useState({
    counterEvidenceIds: claim.counterEvidenceIds,
    note: "",
  });

  function resetDecision() {
    setMode("idle");
    setDecisionNote("");
    setRevision({
      statement: claim.statement,
      reasoning: claim.reasoning,
      humanDecisionNote: "",
    });
    setContest({
      counterEvidenceIds: claim.counterEvidenceIds,
      note: "",
    });
  }

  function submitConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(buildConfirmClaimAction(claim.id, decisionNote));
    resetDecision();
  }

  function submitRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(buildReviseClaimAction({ claimId: claim.id, ...revision }));
    resetDecision();
  }

  function submitContest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(
      buildContestClaimAction(
        claim.id,
        contest.counterEvidenceIds,
        contest.note,
      ),
    );
    resetDecision();
  }

  function submitEvidenceInsufficient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(buildEvidenceInsufficientClaimAction(claim.id, decisionNote));
    resetDecision();
  }

  function submitFinalize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(buildFinalizeClaimAction(claim.id, decisionNote));
    resetDecision();
  }

  return (
    <div className="card">
      {/* Header: status + actor */}
      <div className="flex items-center gap-2">
        <span className={statusClass[claim.status] || "badge"}>
          {statusLabel[claim.status] || claim.status}
        </span>
        {inBrief && (
          <span className="text-2xs text-accent-blue" title="Referenced in the final Brief">
            📝 Brief
          </span>
        )}
        <span className="text-2xs text-text-muted">
          by{" "}
          <span className={claim.createdBy === "human" ? "actor-human" : "actor-agent"}>
            {claim.createdBy}
          </span>
        </span>
        <span className="ml-auto text-2xs text-text-muted">
          {new Date(claim.updatedAt).toLocaleString()}
        </span>
      </div>

      {/* Statement */}
      <p className="mt-2 text-sm font-medium text-text-primary leading-snug">
        {claim.statement}
      </p>

      {/* Reasoning */}
      {claim.reasoning && (
        <p className="mt-1 text-xs text-text-secondary leading-relaxed">
          {claim.reasoning}
        </p>
      )}

      {/* Evidence counts */}
      <div className="mt-2 flex items-center gap-3 text-2xs text-text-muted">
        <span>
          Supporting: {claim.supportingEvidenceIds.length} evidence
        </span>
        {claim.counterEvidenceIds.length > 0 && (
          <span>
            Counter: {claim.counterEvidenceIds.length} evidence
          </span>
        )}
        {claim.confidence !== undefined && (
          <span>Confidence: {Math.round(claim.confidence * 100)}%</span>
        )}
      </div>

      {/* Human decision note */}
      {claim.humanDecisionNote && (
        <div className="mt-2 rounded border border-accent-amber/20 bg-amber-50/50 px-2 py-1.5">
          <p className="text-2xs font-medium text-accent-amber uppercase tracking-wider">
            Human Note
          </p>
          <p className="text-xs text-text-secondary">{claim.humanDecisionNote}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-surface-border pt-2">
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-2xs"
          onClick={() => setMode(mode === "confirm" ? "idle" : "confirm")}
        >
          Confirm
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-2xs"
          onClick={() => setMode(mode === "revise" ? "idle" : "revise")}
        >
          Revise
        </button>
        <button
          type="button"
          className="btn-danger px-2 py-1 text-2xs"
          onClick={() => setMode(mode === "contest" ? "idle" : "contest")}
        >
          Contest
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-2xs"
          onClick={() =>
            setMode(mode === "insufficient" ? "idle" : "insufficient")
          }
        >
          Evidence Insufficient
        </button>
        <button
          type="button"
          className="btn-primary px-2 py-1 text-2xs"
          onClick={() => setMode(mode === "finalize" ? "idle" : "finalize")}
        >
          Finalize
        </button>
      </div>

      {mode === "confirm" && (
        <form onSubmit={submitConfirm} className="mt-2 space-y-2">
          <textarea
            className="input min-h-16 resize-y text-xs"
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            placeholder="Decision note"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-2xs"
              onClick={resetDecision}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-2 py-1 text-2xs">
              Save
            </button>
          </div>
        </form>
      )}

      {mode === "revise" && (
        <form onSubmit={submitRevision} className="mt-2 space-y-2">
          <textarea
            className="input min-h-20 resize-y text-xs"
            value={revision.statement}
            onChange={(event) =>
              setRevision((value) => ({
                ...value,
                statement: event.target.value,
              }))
            }
            placeholder="Revised claim"
            required
          />
          <textarea
            className="input min-h-20 resize-y text-xs"
            value={revision.reasoning}
            onChange={(event) =>
              setRevision((value) => ({
                ...value,
                reasoning: event.target.value,
              }))
            }
            placeholder="Revised reasoning"
            required
          />
          <textarea
            className="input min-h-16 resize-y text-xs"
            value={revision.humanDecisionNote}
            onChange={(event) =>
              setRevision((value) => ({
                ...value,
                humanDecisionNote: event.target.value,
              }))
            }
            placeholder="Revision note"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-2xs"
              onClick={resetDecision}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-2 py-1 text-2xs">
              Save
            </button>
          </div>
        </form>
      )}

      {mode === "contest" && (
        <form onSubmit={submitContest} className="mt-2 space-y-2">
          {evidence.length > 0 && (
            <label className="block">
              <span className="label">Counter evidence</span>
              <select
                className="input min-h-24 text-xs"
                multiple
                value={contest.counterEvidenceIds}
                onChange={(event) =>
                  setContest((value) => ({
                    ...value,
                    counterEvidenceIds: selectedValues(
                      event.currentTarget.options,
                    ),
                  }))
                }
              >
                {evidence.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.quoteOrFinding}
                  </option>
                ))}
              </select>
            </label>
          )}
          <textarea
            className="input min-h-16 resize-y text-xs"
            value={contest.note}
            onChange={(event) =>
              setContest((value) => ({ ...value, note: event.target.value }))
            }
            placeholder="Why this claim is contested"
            required
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-2xs"
              onClick={resetDecision}
            >
              Cancel
            </button>
            <button type="submit" className="btn-danger px-2 py-1 text-2xs">
              Save
            </button>
          </div>
        </form>
      )}

      {mode === "insufficient" && (
        <form onSubmit={submitEvidenceInsufficient} className="mt-2 space-y-2">
          <textarea
            className="input min-h-16 resize-y text-xs"
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            placeholder="What evidence is missing?"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-2xs"
              onClick={resetDecision}
            >
              Cancel
            </button>
            <button type="submit" className="btn-secondary px-2 py-1 text-2xs">
              Save
            </button>
          </div>
        </form>
      )}

      {mode === "finalize" && (
        <form onSubmit={submitFinalize} className="mt-2 space-y-2">
          <textarea
            className="input min-h-16 resize-y text-xs"
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            placeholder="Finalization note"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-2xs"
              onClick={resetDecision}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-2 py-1 text-2xs">
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
