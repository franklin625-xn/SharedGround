import type { WorkspaceState } from "@/core/types";
import type { OutcomeEvaluation } from "@/eval/types";
import {
  countGroundedFinalClaims,
  getFinalClaims,
} from "@/eval/rules/evidence-grounding";
import { evaluateCitationIntegrity } from "@/eval/rules/citation-integrity";
import { briefIsStale } from "@/core/brief-stale";

export function evaluateOutcome(state: WorkspaceState): OutcomeEvaluation {
  const finalClaimCount = getFinalClaims(state).length;
  const groundedFinalClaimCount = countGroundedFinalClaims(state);
  const citationIntegrity = evaluateCitationIntegrity(state);

  return {
    taskCompleted: state.completed && state.brief.markdown.trim().length > 0,
    finalClaimCount,
    groundedFinalClaimCount,
    groundedClaimRate: groundedFinalClaimCount / Math.max(finalClaimCount, 1),
    citationIntegrityRate: citationIntegrity.rate,
    missingCitationIds: citationIntegrity.missingCitationIds,
    // V0.2
    briefStaleDetected: briefIsStale(state),
  };
}
