export type OutcomeEvaluation = {
  taskCompleted: boolean;
  finalClaimCount: number;
  groundedFinalClaimCount: number;
  groundedClaimRate: number;
  citationIntegrityRate: number;
  missingCitationIds: string[];
  // V0.2
  briefStaleDetected: boolean;
};

export type ProcessEvaluation = {
  agentActionCount: number;
  humanActionCount: number;
  humanRevisionCount: number;
  contestedClaimCount: number;
  humanOverrideRate: number;
  humanRequestCount: number;
  answeredHumanRequestCount: number;
  effectiveHumanRequestRate: number;
  waitCount: number;
  correctWaitCount: number;
  unauthorizedActionCount: number;
  respectedHumanModification: boolean;
  // V0.2
  staleWriteRejectionCount: number;
  humanMessageCount: number;
  acknowledgedHumanMessageCount: number;
  humanMessageAckRate: number;
  acceptedAgentActionCount: number;
  totalAgentApplyResults: number;
  acceptedAgentActionRate: number;
  discardedStaleRunResponseCount: number;
  repeatedStaleWriteCount: number;
  duplicateSourceCount: number;
  messageResolutionRate: number;
  agentReplyWithoutActionCount: number;
  humanRevisionResolutionRate: number;
  unresolvedHumanRevisionCount: number;
};

export type TraceEvaluationItem = {
  claimId: string;
  hasSource: boolean;
  hasEvidence: boolean;
  hasHumanDecision: boolean;
  referencedInBrief: boolean;
  complete: boolean;
};

export type TraceEvaluation = {
  items: TraceEvaluationItem[];
  completeTraceCount: number;
  totalTraceCount: number;
  completeTraceRate: number;
  // V0.2
  evidenceWithSourceVersionCount: number;
  evidenceWithSourceHashCount: number;
  evidenceWithValidLineRange: number;
  totalAgentExtractedEvidence: number;
  sourceLocationCompletenessRate: number;
};

export type EvalRuleResult = {
  ruleId: string;
  passed: boolean;
  score: number;
  explanation: string;
  relatedEventIds: string[];
};

export type EvaluationSummary = {
  generatedAt: string;
  outcome: OutcomeEvaluation;
  process: ProcessEvaluation;
  traceability: TraceEvaluation;
};
