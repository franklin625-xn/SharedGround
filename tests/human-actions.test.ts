import { describe, expect, it } from "vitest";
import {
  buildAddEvidenceAction,
  buildAddNoteAction,
  buildAddSourceAction,
  buildAddSourceFromFiles,
  buildAnswerHumanInputAction,
  buildConfirmClaimAction,
  buildContestClaimAction,
  buildEditBriefAction,
  buildEditEvidenceAction,
  buildEditNoteAction,
  buildEditSourceAction,
  buildEvidenceInsufficientClaimAction,
  buildFinalizeClaimAction,
  buildFinishTaskAction,
  buildReviseClaimAction,
} from "@/core/human-actions";

describe("human action builders", () => {
  it("trims source form fields and omits empty optional fields", () => {
    expect(
      buildAddSourceAction({
        title: "  EU battery regulation  ",
        publisher: "  European Commission ",
        url: " ",
        publishedAt: "",
        summary: "  Policy summary. ",
      }),
    ).toEqual({
      type: "ADD_SOURCE",
      payload: {
        title: "EU battery regulation",
        publisher: "European Commission",
        summary: "Policy summary.",
      },
      reason: "Human added a source.",
    });
  });

  it("builds evidence and note actions with selected object ids", () => {
    expect(
      buildAddEvidenceAction({
        sourceId: "source-1",
        quoteOrFinding: "  Local production target reached 40%. ",
        relevance: " Supports localization claim. ",
      }),
    ).toEqual({
      type: "ADD_EVIDENCE",
      payload: {
        sourceId: "source-1",
        quoteOrFinding: "Local production target reached 40%.",
        relevance: "Supports localization claim.",
      },
      reason: "Human added evidence.",
    });

    expect(
      buildAddNoteAction({
        content: "  Check whether this differs by sector. ",
        sourceIds: ["source-1"],
        evidenceIds: ["evidence-1"],
      }),
    ).toEqual({
      type: "ADD_NOTE",
      payload: {
        content: "Check whether this differs by sector.",
        sourceIds: ["source-1"],
        evidenceIds: ["evidence-1"],
      },
      reason: "Human added a research note.",
    });
  });

  it("builds edit note actions through the reducer schema", () => {
    expect(
      buildEditSourceAction({
        sourceId: "source-1",
        title: "  Updated source  ",
        publisher: " Updated publisher ",
        url: " https://example.com/source ",
        publishedAt: " 2026-06-15 ",
        summary: " Updated summary. ",
      }),
    ).toEqual({
      type: "EDIT_SOURCE",
      payload: {
        sourceId: "source-1",
        title: "Updated source",
        publisher: "Updated publisher",
        url: "https://example.com/source",
        publishedAt: "2026-06-15",
        summary: "Updated summary.",
      },
      reason: "Human edited a source.",
    });

    expect(
      buildEditEvidenceAction({
        evidenceId: "evidence-1",
        quoteOrFinding: "  Updated finding. ",
        relevance: " Updated relevance. ",
      }),
    ).toEqual({
      type: "EDIT_EVIDENCE",
      payload: {
        evidenceId: "evidence-1",
        quoteOrFinding: "Updated finding.",
        relevance: "Updated relevance.",
      },
      reason: "Human edited evidence.",
    });

    expect(
      buildEditNoteAction({
        noteId: "note-1",
        content: "  Updated note. ",
        sourceIds: ["source-1"],
        evidenceIds: ["evidence-1", "evidence-2"],
      }),
    ).toEqual({
      type: "EDIT_NOTE",
      payload: {
        noteId: "note-1",
        content: "Updated note.",
        sourceIds: ["source-1"],
        evidenceIds: ["evidence-1", "evidence-2"],
      },
      reason: "Human edited a research note.",
    });
  });

  it("builds human claim decision actions", () => {
    expect(buildConfirmClaimAction("claim-1", "  Looks supported. ")).toEqual({
      type: "UPDATE_CLAIM",
      payload: {
        claimId: "claim-1",
        status: "human_confirmed",
        humanDecisionNote: "Looks supported.",
      },
      reason: "Human confirmed a claim.",
    });

    expect(
      buildReviseClaimAction({
        claimId: "claim-1",
        statement: "  Revised statement. ",
        reasoning: " Revised reasoning. ",
        humanDecisionNote: " Needs narrower language. ",
      }),
    ).toEqual({
      type: "UPDATE_CLAIM",
      payload: {
        claimId: "claim-1",
        statement: "Revised statement.",
        reasoning: "Revised reasoning.",
        status: "human_revised",
        humanDecisionNote: "Needs narrower language.",
      },
      reason: "Human revised a claim.",
    });

    expect(buildContestClaimAction("claim-1", ["evidence-2"], " Weak support. ")).toEqual({
      type: "CHALLENGE_CLAIM",
      payload: {
        claimId: "claim-1",
        counterEvidenceIds: ["evidence-2"],
        note: "Weak support.",
      },
      reason: "Human contested a claim.",
    });

    expect(
      buildEvidenceInsufficientClaimAction("claim-1", "  Need primary source. "),
    ).toEqual({
      type: "UPDATE_CLAIM",
      payload: {
        claimId: "claim-1",
        status: "evidence_insufficient",
        humanDecisionNote: "Need primary source.",
      },
      reason: "Human marked a claim as evidence insufficient.",
    });

    expect(buildFinalizeClaimAction("claim-1", "  Ready for final. ")).toEqual({
      type: "UPDATE_CLAIM",
      payload: {
        claimId: "claim-1",
        status: "final",
        humanDecisionNote: "Ready for final.",
      },
      reason: "Human finalized a claim.",
    });
  });

  it("builds answer and brief edit actions", () => {
    expect(buildAnswerHumanInputAction("request-1", "  Focus on EVs. ")).toEqual({
      type: "ANSWER_HUMAN_INPUT",
      payload: {
        requestId: "request-1",
        answer: "Focus on EVs.",
      },
      reason: "Human answered an input request.",
    });

    expect(buildEditBriefAction("  # Brief\n\nUpdated.  ")).toEqual({
      type: "EDIT_BRIEF",
      payload: {
        markdown: "# Brief\n\nUpdated.",
      },
      reason: "Human edited the final brief.",
    });

    expect(buildFinishTaskAction()).toEqual({
      type: "FINISH",
      payload: {},
      reason: "Human completed the task.",
    });
  });

  // ── Phase 3: multi-file upload builder ──

  it("buildAddSourceFromFiles creates one ADD_SOURCE per file with content fields", () => {
    const actions = buildAddSourceFromFiles([
      { name: "nzia.md", content: "# NZIA\n\nOverview of the act." },
      { name: "crma.md", content: "# CRMA\n\nRaw materials regulation." },
    ]);

    expect(actions).toHaveLength(2);

    expect(actions[0]).toMatchObject({
      type: "ADD_SOURCE",
      payload: {
        title: "nzia",
        publisher: "Uploaded",
        fileName: "nzia.md",
        mediaType: "markdown",
        content: "# NZIA\n\nOverview of the act.",
      },
      reason: expect.stringContaining("uploaded"),
    });

    expect(actions[1]).toMatchObject({
      type: "ADD_SOURCE",
      payload: {
        title: "crma",
        publisher: "Uploaded",
        fileName: "crma.md",
        mediaType: "markdown",
        content: "# CRMA\n\nRaw materials regulation.",
      },
      reason: expect.stringContaining("uploaded"),
    });
  });

  it("buildAddSourceFromFiles produces empty array for empty input", () => {
    expect(buildAddSourceFromFiles([])).toEqual([]);
  });
});
