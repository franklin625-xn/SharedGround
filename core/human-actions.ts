import type { WorkspaceAction } from "@/core/schemas";

type SourceForm = {
  title: string;
  publisher: string;
  url?: string;
  publishedAt?: string;
  summary: string;
  fileName?: string;
  mediaType?: "markdown" | "demo" | "manual";
  content?: string;
};

type EditSourceForm = SourceForm & {
  sourceId: string;
};

type EvidenceForm = {
  sourceId: string;
  quoteOrFinding: string;
  relevance: string;
  section?: string;
  startLine?: number;
  endLine?: number;
  polarity?: "supporting" | "counter" | "context";
};

type EditEvidenceForm = {
  evidenceId: string;
  quoteOrFinding: string;
  relevance: string;
  section?: string;
  startLine?: number;
  endLine?: number;
  polarity?: "supporting" | "counter" | "context";
};

type NoteForm = {
  content: string;
  sourceIds: string[];
  evidenceIds: string[];
};

type EditNoteForm = NoteForm & {
  noteId: string;
};

type ReviseClaimForm = {
  claimId: string;
  statement: string;
  reasoning: string;
  humanDecisionNote: string;
};

function clean(value: string) {
  return value.trim();
}

function cleanOptional(value: string | undefined) {
  const next = value?.trim();
  return next ? next : undefined;
}

export function buildAddSourceAction(form: SourceForm): WorkspaceAction {
  return {
    type: "ADD_SOURCE",
    payload: {
      title: clean(form.title),
      publisher: clean(form.publisher),
      url: cleanOptional(form.url),
      publishedAt: cleanOptional(form.publishedAt),
      summary: clean(form.summary),
      fileName: cleanOptional(form.fileName),
      mediaType: form.mediaType,
      content: form.content,
    },
    reason: "Human added a source.",
  };
}

/** Build multiple ADD_SOURCE actions from an array of uploaded Markdown files. */
export function buildAddSourceFromFiles(
  files: { name: string; content: string }[],
): WorkspaceAction[] {
  return files.map((f) => ({
    type: "ADD_SOURCE" as const,
    payload: {
      title: f.name.replace(/\.md$/i, ""),
      publisher: "Uploaded",
      summary: f.content.slice(0, 200).replace(/\n/g, " "),
      fileName: f.name,
      mediaType: "markdown" as const,
      content: f.content,
    },
    reason: "Human uploaded a Markdown file.",
  }));
}

export function buildEditSourceAction(form: EditSourceForm): WorkspaceAction {
  return {
    type: "EDIT_SOURCE",
    payload: {
      sourceId: form.sourceId,
      title: clean(form.title),
      publisher: clean(form.publisher),
      url: cleanOptional(form.url),
      publishedAt: cleanOptional(form.publishedAt),
      summary: clean(form.summary),
    },
    reason: "Human edited a source.",
  };
}

export function buildAddEvidenceAction(form: EvidenceForm): WorkspaceAction {
  return {
    type: "ADD_EVIDENCE",
    payload: {
      sourceId: clean(form.sourceId),
      quoteOrFinding: clean(form.quoteOrFinding),
      relevance: clean(form.relevance),
      section: cleanOptional(form.section),
      startLine: form.startLine,
      endLine: form.endLine,
      polarity: form.polarity,
    },
    reason: "Human added evidence.",
  };
}

export function buildEditEvidenceAction(
  form: EditEvidenceForm,
): WorkspaceAction {
  return {
    type: "EDIT_EVIDENCE",
    payload: {
      evidenceId: form.evidenceId,
      quoteOrFinding: clean(form.quoteOrFinding),
      relevance: clean(form.relevance),
      section: cleanOptional(form.section),
      startLine: form.startLine,
      endLine: form.endLine,
      polarity: form.polarity,
    },
    reason: "Human edited evidence.",
  };
}

export function buildAddNoteAction(form: NoteForm): WorkspaceAction {
  return {
    type: "ADD_NOTE",
    payload: {
      content: clean(form.content),
      sourceIds: form.sourceIds,
      evidenceIds: form.evidenceIds,
    },
    reason: "Human added a research note.",
  };
}

export function buildEditNoteAction(form: EditNoteForm): WorkspaceAction {
  return {
    type: "EDIT_NOTE",
    payload: {
      noteId: form.noteId,
      content: clean(form.content),
      sourceIds: form.sourceIds,
      evidenceIds: form.evidenceIds,
    },
    reason: "Human edited a research note.",
  };
}

export function buildConfirmClaimAction(
  claimId: string,
  humanDecisionNote: string,
): WorkspaceAction {
  return {
    type: "UPDATE_CLAIM",
    payload: {
      claimId,
      status: "human_confirmed",
      humanDecisionNote: clean(humanDecisionNote),
    },
    reason: "Human confirmed a claim.",
  };
}

export function buildReviseClaimAction(form: ReviseClaimForm): WorkspaceAction {
  return {
    type: "UPDATE_CLAIM",
    payload: {
      claimId: form.claimId,
      statement: clean(form.statement),
      reasoning: clean(form.reasoning),
      status: "human_revised",
      humanDecisionNote: clean(form.humanDecisionNote),
    },
    reason: "Human revised a claim.",
  };
}

export function buildContestClaimAction(
  claimId: string,
  counterEvidenceIds: string[],
  note: string,
): WorkspaceAction {
  return {
    type: "CHALLENGE_CLAIM",
    payload: {
      claimId,
      counterEvidenceIds,
      note: clean(note),
    },
    reason: "Human contested a claim.",
  };
}

export function buildEvidenceInsufficientClaimAction(
  claimId: string,
  humanDecisionNote: string,
): WorkspaceAction {
  return {
    type: "UPDATE_CLAIM",
    payload: {
      claimId,
      status: "evidence_insufficient",
      humanDecisionNote: clean(humanDecisionNote),
    },
    reason: "Human marked a claim as evidence insufficient.",
  };
}

export function buildFinalizeClaimAction(
  claimId: string,
  humanDecisionNote: string,
): WorkspaceAction {
  return {
    type: "UPDATE_CLAIM",
    payload: {
      claimId,
      status: "final",
      humanDecisionNote: clean(humanDecisionNote),
    },
    reason: "Human finalized a claim.",
  };
}

export function buildAnswerHumanInputAction(
  requestId: string,
  answer: string,
): WorkspaceAction {
  return {
    type: "ANSWER_HUMAN_INPUT",
    payload: {
      requestId,
      answer: clean(answer),
    },
    reason: "Human answered an input request.",
  };
}

export function buildEditBriefAction(markdown: string): WorkspaceAction {
  return {
    type: "EDIT_BRIEF",
    payload: {
      markdown: clean(markdown),
    },
    reason: "Human edited the final brief.",
  };
}

export function buildFinishTaskAction(): WorkspaceAction {
  return {
    type: "FINISH",
    payload: {},
    reason: "Human completed the task.",
  };
}

export function buildSendTeammateMessageAction(
  content: string,
  relatedObjectIds: string[],
): WorkspaceAction {
  return {
    type: "SEND_TEAMMATE_MESSAGE",
    payload: {
      content: clean(content),
      relatedObjectIds,
    },
    reason: "Human sent a teammate message.",
  };
}
