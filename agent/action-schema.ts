import { z } from "zod";

const reasonSchema = z.string().min(1).optional();
const actionIdSchema = z.string().min(1).optional();
const expectedVersionSchema = z.number().int().positive().optional();

export const workspaceActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SEARCH_SOURCE"),
    payload: z.object({ query: z.string().min(1) }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("ADD_SOURCE"),
    payload: z.object({
      title: z.string().min(1),
      publisher: z.string().min(1),
      url: z.string().url().optional(),
      publishedAt: z.string().optional(),
      summary: z.string().min(1),
      fileName: z.string().optional(),
      mediaType: z.enum(["markdown", "demo", "manual"]).optional(),
      content: z.string().optional(),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("EDIT_SOURCE"),
    payload: z.object({
      sourceId: z.string().min(1),
      title: z.string().min(1),
      publisher: z.string().min(1),
      url: z.string().url().optional(),
      publishedAt: z.string().optional(),
      summary: z.string().min(1),
      expectedVersion: expectedVersionSchema,
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("ADD_EVIDENCE"),
    payload: z.object({
      sourceId: z.string().min(1),
      quoteOrFinding: z.string().min(1),
      relevance: z.string().min(1),
      section: z.string().optional(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
      polarity: z.enum(["supporting", "counter", "context"]).optional(),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("EDIT_EVIDENCE"),
    payload: z.object({
      evidenceId: z.string().min(1),
      quoteOrFinding: z.string().min(1),
      relevance: z.string().min(1),
      section: z.string().optional(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
      polarity: z.enum(["supporting", "counter", "context"]).optional(),
      expectedVersion: expectedVersionSchema,
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("ADD_NOTE"),
    payload: z.object({
      content: z.string().min(1),
      sourceIds: z.array(z.string()),
      evidenceIds: z.array(z.string()),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("EDIT_NOTE"),
    payload: z.object({
      noteId: z.string().min(1),
      content: z.string().min(1),
      sourceIds: z.array(z.string()),
      evidenceIds: z.array(z.string()),
      expectedVersion: expectedVersionSchema,
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("PROPOSE_CLAIM"),
    payload: z.object({
      statement: z.string().min(1),
      reasoning: z.string().min(1),
      supportingEvidenceIds: z.array(z.string()),
      counterEvidenceIds: z.array(z.string()),
      confidence: z.number().min(0).max(1).optional(),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("UPDATE_CLAIM"),
    payload: z.object({
      claimId: z.string().min(1),
      statement: z.string().min(1).optional(),
      reasoning: z.string().min(1).optional(),
      supportingEvidenceIds: z.array(z.string()).optional(),
      counterEvidenceIds: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).optional(),
      status: z
        .enum([
          "ai_proposed",
          "human_confirmed",
          "human_revised",
          "contested",
          "evidence_insufficient",
          "final",
        ])
        .optional(),
      humanDecisionNote: z.string().optional(),
      expectedVersion: expectedVersionSchema,
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("CHALLENGE_CLAIM"),
    payload: z.object({
      claimId: z.string().min(1),
      counterEvidenceIds: z.array(z.string()),
      note: z.string().min(1),
      expectedVersion: expectedVersionSchema,
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("REQUEST_HUMAN_INPUT"),
    payload: z.object({
      question: z.string().min(1),
      relatedObjectIds: z.array(z.string()),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("ANSWER_HUMAN_INPUT"),
    payload: z.object({
      requestId: z.string().min(1),
      answer: z.string().min(1),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("EDIT_BRIEF"),
    payload: z.object({
      markdown: z.string(),
      expectedVersion: expectedVersionSchema,
      derivation: z.object({
        claimVersions: z.record(z.string(), z.number()),
        evidenceVersions: z.record(z.string(), z.number()),
        generatedFromEventIds: z.array(z.string()),
      }).optional(),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("WAIT"),
    payload: z.object({
      waitingFor: z.string().min(1),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("FINISH"),
    payload: z.object({}),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("SEND_TEAMMATE_MESSAGE"),
    payload: z.object({
      content: z.string().min(1),
      relatedObjectIds: z.array(z.string()),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("REPLY_TEAMMATE_MESSAGE"),
    payload: z.object({
      content: z.string().min(1),
      inReplyToMessageId: z.string().min(1).optional(),
      relatedObjectIds: z.array(z.string()),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("MARK_MESSAGE_READ"),
    payload: z.object({
      messageId: z.string().min(1),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
  z.object({
    type: z.literal("RESOLVE_TEAMMATE_MESSAGE"),
    payload: z.object({
      messageId: z.string().min(1),
      resolvedByActionIds: z.array(z.string().min(1)).min(1),
    }),
    reason: reasonSchema,
    actionId: actionIdSchema,
  }),
]);

type ParsedWorkspaceAction = z.infer<typeof workspaceActionSchema>;

function hasRequiredAgentExpectedVersion(action: ParsedWorkspaceAction): boolean {
  switch (action.type) {
    case "EDIT_SOURCE":
    case "EDIT_EVIDENCE":
    case "EDIT_NOTE":
    case "UPDATE_CLAIM":
    case "CHALLENGE_CLAIM":
    case "EDIT_BRIEF":
      return action.payload.expectedVersion !== undefined;
    default:
      return true;
  }
}

export const agentTurnSchema = z.object({
  situation: z.string(),
  nextGoal: z.string(),
  actions: z
    .array(
      workspaceActionSchema
        .refine(
          (action) =>
            action.type !== "ANSWER_HUMAN_INPUT" &&
            action.type !== "FINISH" &&
            action.type !== "SEND_TEAMMATE_MESSAGE",
          {
            message:
              "Agent turns cannot include human-only ANSWER_HUMAN_INPUT, FINISH, or SEND_TEAMMATE_MESSAGE actions.",
          },
        )
        .refine(hasRequiredAgentExpectedVersion, {
          message:
            "Agent existing-object update actions must include expectedVersion.",
        }),
    )
    .max(3),
  acknowledgedHumanEventIds: z.array(z.string()).optional(),
  stopReason: z.enum([
    "turn_complete",
    "waiting_for_human",
    "insufficient_evidence",
    "task_complete",
  ]),
});

export type WorkspaceAction = z.infer<typeof workspaceActionSchema>;
export type AgentAction = Exclude<
  WorkspaceAction,
  { type: "ANSWER_HUMAN_INPUT" } | { type: "FINISH" } | { type: "SEND_TEAMMATE_MESSAGE" }
>;
export type AgentTurn = z.infer<typeof agentTurnSchema>;
