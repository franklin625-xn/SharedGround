"use client";

import React from "react";
import type { WorkspaceAction } from "@/core/schemas";
import type { BriefDerivation, Claim, Evidence } from "@/core/types";
import { ClaimCard } from "@/components/workspace/claim-card";

export function ClaimsPanel({
  claims,
  evidence,
  briefDerivation,
  onAction,
}: {
  claims: Claim[];
  evidence: Evidence[];
  briefDerivation?: BriefDerivation;
  onAction: (action: WorkspaceAction) => void;
}) {
  const briefClaimIds = new Set(
    briefDerivation ? Object.keys(briefDerivation.claimVersions) : [],
  );

  return (
    <section>
      <h3 className="panel-title">Claims / Analysis ({claims.length})</h3>
      <div className="space-y-2">
        {claims.length === 0 && (
          <p className="text-xs text-text-muted italic">
            No claims proposed yet. Run the agent to get started.
          </p>
        )}
        {claims.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            evidence={evidence}
            inBrief={briefClaimIds.has(claim.id)}
            onAction={onAction}
          />
        ))}
      </div>
    </section>
  );
}
