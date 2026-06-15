"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import { buildEditBriefAction } from "@/core/human-actions";
import type { WorkspaceAction } from "@/core/schemas";
import type { Actor, BriefDerivation, Claim } from "@/core/types";

export function BriefEditor({
  markdown,
  updatedBy,
  updatedAt,
  isStale,
  derivation,
  claims,
  onAction,
}: {
  markdown: string;
  updatedBy: Actor;
  updatedAt: string;
  isStale: boolean;
  derivation?: BriefDerivation;
  claims: Claim[];
  onAction: (action: WorkspaceAction) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(markdown);

  useEffect(() => {
    setDraft(markdown);
  }, [markdown]);

  function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(buildEditBriefAction(draft));
    setEditing(false);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="panel-title mb-0">Final Brief</h3>
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-2xs"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Preview" : "Edit Brief"}
        </button>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ Brief may be out of date — underlying claims or evidence have
          changed since it was drafted.
        </div>
      )}

      <div className="card">
        {editing ? (
          <form onSubmit={submitBrief} className="space-y-2">
            <textarea
              className="input min-h-64 resize-y font-mono text-xs leading-relaxed"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="# Final brief"
            />
            <div className="flex justify-end gap-1">
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => {
                  setDraft(markdown);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary px-2 py-1 text-xs">
                Save Brief
              </button>
            </div>
          </form>
        ) : !markdown ? (
          <p className="text-xs text-text-muted italic">
            Brief not yet drafted. Run the agent to get a draft, or write one
            directly.
          </p>
        ) : (
          <div>
            <div className="prose prose-sm max-w-none text-xs text-text-primary leading-relaxed whitespace-pre-wrap">
              {markdown}
            </div>

            {/* Derivation summary */}
            {derivation && (
              <div className="mt-2 border-t border-surface-border pt-2">
                <p className="text-2xs text-text-muted">
                  Based on{" "}
                  <span className="font-medium">
                    {Object.keys(derivation.claimVersions).length} claims
                  </span>
                  ,{" "}
                  <span className="font-medium">
                    {Object.keys(derivation.evidenceVersions).length} evidence
                  </span>
                  {" "}— drafted by{" "}
                  <span className="font-medium">{derivation.generatedBy}</span>
                  {" "}at{" "}
                  {new Date(derivation.generatedAt).toLocaleString()}
                </p>
              </div>
            )}

            <div className="mt-2 border-t border-surface-border pt-1.5 text-2xs text-text-muted">
              Last updated by <span className="font-medium">{updatedBy}</span>{" "}
              at {new Date(updatedAt).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
