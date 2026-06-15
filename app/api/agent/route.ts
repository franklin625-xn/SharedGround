import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * @deprecated V0.2 Continuous Action Protocol uses /api/agent-step.
 * This endpoint is retained only so legacy imports and route discovery do not fail.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Deprecated endpoint. Use /api/agent-step for the V0.2 Continuous Action Protocol.",
      recommendedEndpoint: "/api/agent-step",
    },
    { status: 410 },
  );
}
