"use client";

import React, { useState, type FormEvent } from "react";
import { buildSendTeammateMessageAction } from "@/core/human-actions";
import type { TeammateMessage } from "@/core/types";
import type { WorkspaceAction } from "@/core/schemas";

const statusClass: Record<TeammateMessage["status"], string> = {
  pending: "badge-waiting",
  read: "badge-idle",
  resolved: "status-final",
  blocked: "badge-blocked",
};

export function MessagesPanel({
  messages,
  onAction,
  onSendAndRun,
}: {
  messages: TeammateMessage[];
  onAction: (action: WorkspaceAction) => void;
  onSendAndRun: (action: WorkspaceAction) => void;
}) {
  const [text, setText] = useState("");

  function buildAction() {
    const content = text.trim();
    if (!content) return undefined;
    return buildSendTeammateMessageAction(content, []);
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = buildAction();
    if (!action) return;
    onAction(action);
    setText("");
  }

  function sendAndRun() {
    const action = buildAction();
    if (!action) return;
    onSendAndRun(action);
    setText("");
  }

  return (
    <section className="flex h-full flex-col p-3">
      <h3 className="panel-title">Messages ({messages.length})</h3>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted italic">
            No teammate messages yet.
          </p>
        )}
        {[...messages].reverse().map((message) => (
          <div key={message.id} className="card-sm">
            <div className="flex items-center gap-1.5">
              <span className={message.actor === "human" ? "actor-human" : "actor-agent"}>
                {message.actor}
              </span>
              <span className={statusClass[message.status]}>
                {message.status}
              </span>
              <span className="ml-auto text-2xs text-text-muted">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 text-2xs leading-relaxed text-text-secondary">
              {message.content}
            </p>
            {message.relatedObjectIds.length > 0 && (
              <p className="mt-1 text-2xs text-text-muted">
                Related: {message.relatedObjectIds.join(", ")}
              </p>
            )}
            {message.resolvedByActionIds && message.resolvedByActionIds.length > 0 && (
              <p className="mt-1 text-2xs text-text-muted">
                Actions: {message.resolvedByActionIds.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={send} className="mt-2 space-y-2 border-t border-surface-border pt-2">
        <textarea
          className="input min-h-20 resize-y text-xs"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Message the agent..."
        />
        <div className="flex justify-end gap-1">
          <button
            type="submit"
            className="btn-secondary px-2 py-1 text-2xs"
            disabled={!text.trim()}
          >
            Send
          </button>
          <button
            type="button"
            className="btn-primary px-2 py-1 text-2xs"
            disabled={!text.trim()}
            onClick={sendAndRun}
          >
            Send & Run
          </button>
        </div>
      </form>
    </section>
  );
}
