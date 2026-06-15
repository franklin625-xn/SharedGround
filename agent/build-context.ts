import type {
  Claim,
  Evidence,
  HumanInputRequest,
  ResearchNote,
  Source,
  WorkspaceEvent,
  WorkspaceState,
} from "@/core/types";

export type AgentContext = {
  taskTitle: string;
  question: string;
  scope: string;
  sourceCount: number;
  evidenceCount: number;
  agentNotes: ResearchNote[];
  agentClaims: Claim[];
  openHumanRequest?: HumanInputRequest;
  answeredHumanRequest?: HumanInputRequest;
  briefMarkdown: string;
  briefVersion: number;

  /** Full data — used by real agent context builder */
  sources: Source[];
  evidence: Evidence[];
  allNotes: ResearchNote[];
  allClaims: Claim[];
  humanEvents: WorkspaceEvent[];

  /** V0.2: Recent Human Changes not yet acknowledged by Agent */
  recentHumanChanges: WorkspaceEvent[];
  /** V0.2: Human teammate messages not yet acknowledged */
  unacknowledgedMessages: WorkspaceEvent[];
  messages: NonNullable<WorkspaceState["messages"]>;
};

const SOURCE_CONTENT_EXCERPT_LIMIT = 2000;

function buildSourceContentExcerpt(content: string): {
  excerpt: string;
  originalLength: number;
  truncated: boolean;
} | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  const truncated = trimmed.length > SOURCE_CONTENT_EXCERPT_LIMIT;
  return {
    excerpt: truncated
      ? trimmed.slice(0, SOURCE_CONTENT_EXCERPT_LIMIT)
      : trimmed,
    originalLength: trimmed.length,
    truncated,
  };
}

export function buildAgentContext(state: WorkspaceState): AgentContext {
  const pendingRequest = state.pendingHumanRequest;

  return {
    taskTitle: state.task.title,
    question: state.task.question,
    scope: state.task.scope,
    sourceCount: state.sources.length,
    evidenceCount: state.evidence.length,
    agentNotes: state.notes.filter((note) => note.createdBy === "agent"),
    agentClaims: state.claims.filter((claim) => claim.createdBy === "agent"),
    openHumanRequest:
      pendingRequest?.status === "open" ? pendingRequest : undefined,
    answeredHumanRequest:
      pendingRequest?.status === "answered" ? pendingRequest : undefined,
    briefMarkdown: state.brief.markdown,
    briefVersion: state.brief.version,

    // Full data
    sources: state.sources,
    evidence: state.evidence,
    allNotes: state.notes,
    allClaims: state.claims,
    humanEvents: state.events.filter((e) => e.actor === "human"),

    // V0.2: Recent Human Changes (human events with object impact, not yet acknowledged)
    recentHumanChanges: state.events.filter(
      (e) =>
        e.actor === "human" &&
        e.objectType !== undefined &&
        e.objectId !== undefined &&
        !state.agentControl.acknowledgedHumanEventIds.includes(e.id) &&
        e.actionType !== "FINISH",
    ),

    // V0.2: Unacknowledged teammate messages
    unacknowledgedMessages: state.events.filter(
      (e) =>
        e.actor === "human" &&
        e.objectType === "human_message" &&
        !state.agentControl.acknowledgedHumanEventIds.includes(e.id),
    ),
    messages: state.messages ?? [],
  };
}

/**
 * Builds a human-readable snapshot of the workspace for the real agent's prompt.
 */
export function buildWorkspaceSnapshot(state: WorkspaceState): string {
  const lines: string[] = [];

  lines.push(`## Task`);
  lines.push(`Title: ${state.task.title}`);
  lines.push(`Question: ${state.task.question}`);
  lines.push(`Scope: ${state.task.scope}`);
  lines.push("");

  lines.push(`## Sources (${state.sources.length})`);
  for (const s of state.sources) {
    lines.push(`- [${s.id}] "${s.title}" — ${s.publisher}`);
    lines.push(`  Summary: ${s.summary}`);
    if (s.content) {
      const contentExcerpt = buildSourceContentExcerpt(s.content);
      if (contentExcerpt) {
        lines.push(
          `  Content excerpt (${contentExcerpt.excerpt.length}/${contentExcerpt.originalLength} chars):`,
        );
        for (const line of contentExcerpt.excerpt.split("\n")) {
          lines.push(`    ${line}`);
        }
        if (contentExcerpt.truncated) {
          lines.push(
            `  [Source content truncated after ${SOURCE_CONTENT_EXCERPT_LIMIT} chars.]`,
          );
        }
      }
    }
  }
  lines.push("");

  lines.push(`## Evidence (${state.evidence.length})`);
  for (const e of state.evidence) {
    lines.push(
      `- [${e.id}] from ${e.sourceId}: "${e.quoteOrFinding.substring(0, 120)}…"`,
    );
    lines.push(`  Relevance: ${e.relevance}`);
  }
  lines.push("");

  lines.push(`## Research Notes (${state.notes.length})`);
  for (const n of state.notes) {
    lines.push(
      `- [${n.id}] by ${n.createdBy}: "${n.content.substring(0, 120)}…"`,
    );
  }
  lines.push("");

  lines.push(`## Claims (${state.claims.length})`);
  for (const c of state.claims) {
    lines.push(
      `- [${c.id}] [${c.status}] by ${c.createdBy}: "${c.statement}"`,
    );
    if (c.supportingEvidenceIds.length > 0) {
      lines.push(`  Supporting: ${c.supportingEvidenceIds.join(", ")}`);
    }
    if (c.counterEvidenceIds.length > 0) {
      lines.push(`  Counter: ${c.counterEvidenceIds.join(", ")}`);
    }
  }
  lines.push("");

  lines.push(`## Final Brief`);
  lines.push(
    state.brief.markdown
      ? `Brief exists (${state.brief.markdown.length} chars), last updated by ${state.brief.updatedBy}`
      : "Brief not yet drafted.",
  );
  lines.push("");

  if (state.pendingHumanRequest) {
    const req = state.pendingHumanRequest;
    lines.push(`## Pending Human Request`);
    lines.push(`Status: ${req.status}`);
    lines.push(`Question: ${req.question}`);
    if (req.answer) lines.push(`Answer: ${req.answer}`);
    lines.push("");
  }

  // V0.2: Recent Human Changes
  const ackIds = state.agentControl.acknowledgedHumanEventIds;
  const recentHuman = state.events.filter(
    (e) =>
      e.actor === "human" &&
      e.objectType !== undefined &&
      e.objectId !== undefined &&
      !ackIds.includes(e.id) &&
      e.actionType !== "FINISH",
  );
  if (recentHuman.length > 0) {
    lines.push(`## Recent Human Changes (${recentHuman.length} unacknowledged)`);
    for (const e of recentHuman.slice(-8)) {
      lines.push(
        `- [${e.id}] ${e.actionType} ${e.objectType} ${e.objectId ?? ""} — ${e.summary}`,
      );
    }
    lines.push("");
  }

  // V0.2: Human messages
  const messages = state.messages ?? [];
  const unreadMessages = messages.filter(
    (m) => m.actor === "human" && (m.status === "pending" || m.status === "read"),
  );
  if (unreadMessages.length > 0) {
    lines.push(`## Teammate Messages (${unreadMessages.length})`);
    for (const m of unreadMessages) {
      const relatedVersions = m.relatedObjectIds.map((id) => {
        const source = state.sources.find((item) => item.id === id);
        if (source) return `${id}@v${source.version}`;
        const evidence = state.evidence.find((item) => item.id === id);
        if (evidence) return `${id}@v${evidence.version}`;
        const claim = state.claims.find((item) => item.id === id);
        if (claim) return `${id}@v${claim.version}`;
        if (id === "brief") return `brief@v${state.brief.version}`;
        return id;
      });
      lines.push(`- [${m.id}] status=${m.status} related=${relatedVersions.join(", ") || "none"}`);
      lines.push(`  ${m.content}`);
    }
    const recentAgentReplies = messages
      .filter((m) => m.actor === "agent")
      .slice(-3);
    if (recentAgentReplies.length > 0) {
      lines.push(`Recent agent replies:`);
      for (const reply of recentAgentReplies) {
        lines.push(`- [${reply.id}] ${reply.content}`);
      }
    }
    lines.push("");
  }

  const staleRejections = state.events.filter(
    (event) =>
      event.actionType === "ACTION_REJECTED" &&
      event.rejectionCode === "STALE_OBJECT_VERSION",
  );
  if (staleRejections.length > 0) {
    lines.push(`## Recent Stale Write Rejections`);
    for (const event of staleRejections.slice(-5)) {
      lines.push(
        `- [${event.id}] ${event.objectType} ${event.objectId}: expected ${event.expectedVersion}, current ${event.objectVersionBefore}`,
      );
    }
    lines.push("");
  }

  lines.push(`## Agent Status: ${state.agentStatus}`);
  lines.push(`## Task Completed: ${state.completed}`);

  return lines.join("\n");
}
