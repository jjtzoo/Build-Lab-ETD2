import { NextResponse } from "next/server";

/**
 * The legacy allocation heuristic has been removed.
 *
 * Step 9 is currently building the canonical planner:
 * legal allocation paths -> role feasibility -> coverage/synergy -> ranking.
 *
 * Do not expose a fake optimizer result while that planner is incomplete.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Build Lab planner is not implemented yet.",
    },
    {
      status: 501,
    },
  );
}