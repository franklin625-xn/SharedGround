import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourcesPanel } from "@/components/workspace/sources-panel";
import type { Evidence, Source } from "@/core/types";

const source: Source = {
  id: "source-1",
  title: "Net-Zero Industry Act",
  publisher: "European Commission",
  summary: "EU policy aims to expand clean technology manufacturing capacity.",
  addedBy: "system",
  createdAt: "2026-06-15T00:00:00.000Z",
  version: 1,
  updatedAt: "2026-06-15T00:00:00.000Z",
  createdBy: "system",
  updatedBy: "system",
};

const evidence: Evidence = {
  id: "evidence-1",
  sourceId: "source-1",
  quoteOrFinding: "The EU links public support to local manufacturing capacity.",
  relevance: "Shows localization pressure.",
  addedBy: "system",
  createdAt: "2026-06-15T00:00:00.000Z",
  version: 1,
  updatedAt: "2026-06-15T00:00:00.000Z",
  createdBy: "system",
  updatedBy: "system",
};

describe("SourcesPanel", () => {
  it("renders edit controls for source cards and linked evidence", () => {
    const html = renderToStaticMarkup(
      React.createElement(SourcesPanel, {
        sources: [source],
        evidence: [evidence],
        onAction: () => undefined,
      }),
    );

    expect(html).toContain("Edit Source");
    expect(html).toContain("Edit Evidence");
  });
});
