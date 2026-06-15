import type { ClaimStatus, WorkspaceState } from "@/core/types";

/** Claims allowed in an Agent-drafted final Brief. */
const ALLOWED_BRIEF_CLAIM_STATUSES: ClaimStatus[] = [
  "human_confirmed",
  "human_revised",
  "final",
];

export interface StaleDetail {
  claimId?: string;
  evidenceId?: string;
  reason: string;
}

/**
 * Check whether the Brief is stale because underlying claims or evidence
 * have changed since the Brief was drafted.
 *
 * Pure selector — no side effects, not a persisted field.
 */
export function briefIsStale(state: WorkspaceState): boolean {
  const derivation = state.brief.derivation;
  if (!derivation) return false; // unknown freshness ≠ stale

  // Check: any cited claim version differs or claim no longer exists
  for (const [claimId, version] of Object.entries(derivation.claimVersions)) {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return true;
    if (claim.version !== version) return true;
    if (!ALLOWED_BRIEF_CLAIM_STATUSES.includes(claim.status)) return true;
  }

  // Check: any cited evidence version differs or evidence no longer exists
  for (const [evidenceId, version] of Object.entries(derivation.evidenceVersions)) {
    const ev = state.evidence.find((e) => e.id === evidenceId);
    if (!ev) return true;
    if (ev.version !== version) return true;
  }

  return false;
}

/**
 * Return a human-readable reason why the Brief is stale, or undefined if fresh.
 */
export function briefStaleReason(state: WorkspaceState): string | undefined {
  const derivation = state.brief.derivation;
  if (!derivation) return undefined;

  for (const [claimId, version] of Object.entries(derivation.claimVersions)) {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) return `Claim ${claimId} was deleted.`;
    if (claim.version !== version)
      return `Claim ${claimId} changed from v${version} to v${claim.version}.`;
    if (!ALLOWED_BRIEF_CLAIM_STATUSES.includes(claim.status))
      return `Claim ${claimId} status is now ${claim.status} (not reviewed).`;
  }

  for (const [evidenceId, version] of Object.entries(derivation.evidenceVersions)) {
    const ev = state.evidence.find((e) => e.id === evidenceId);
    if (!ev) return `Evidence ${evidenceId} was deleted.`;
    if (ev.version !== version)
      return `Evidence ${evidenceId} changed from v${version} to v${ev.version}.`;
  }

  return undefined;
}

/**
 * Return detailed breakdown of which items are stale.
 */
export function briefStaleDetails(state: WorkspaceState): StaleDetail[] {
  const derivation = state.brief.derivation;
  if (!derivation) return [];

  const details: StaleDetail[] = [];

  for (const [claimId, version] of Object.entries(derivation.claimVersions)) {
    const claim = state.claims.find((c) => c.id === claimId);
    if (!claim) {
      details.push({ claimId, reason: "deleted" });
    } else if (claim.version !== version) {
      details.push({
        claimId,
        reason: `v${version} → v${claim.version}`,
      });
    } else if (!ALLOWED_BRIEF_CLAIM_STATUSES.includes(claim.status)) {
      details.push({
        claimId,
        reason: `status ${claim.status} (unreviewed)`,
      });
    }
  }

  for (const [evidenceId, version] of Object.entries(derivation.evidenceVersions)) {
    const ev = state.evidence.find((e) => e.id === evidenceId);
    if (!ev) {
      details.push({ evidenceId, reason: "deleted" });
    } else if (ev.version !== version) {
      details.push({
        evidenceId,
        reason: `v${version} → v${ev.version}`,
      });
    }
  }

  return details;
}
