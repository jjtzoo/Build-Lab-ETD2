import { NextResponse } from "next/server";

import type {
  Allocation,
  ElementName,
} from "@/lib/types";

import { searchPackage } from "@/lib/engine/package-search";
import { evaluateCandidate } from "@/lib/engine/evaluator-run";

const elements = [
  "Light",
  "Darkness",
  "Water",
  "Fire",
  "Nature",
  "Earth",
] as const;

function isValidCore(
  value: unknown,
): value is ElementName[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    new Set(value).size === 3 &&
    value.every((x) =>
      elements.includes(
        x as ElementName,
      ),
    )
  );
}

function isValidAllocation(
  value: unknown,
): value is Allocation {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every(
      (x) =>
        typeof x === "number" &&
        Number.isInteger(x) &&
        x >= 0 &&
        x <= 3,
    ) &&
    value.reduce(
      (sum, x) => sum + x,
      0,
    ) === 11
  );
}

export async function POST(
  request: Request,
) {
  const body =
    await request
      .json()
      .catch(() => null) as {
        allocation?: unknown;
        core?: unknown;
        anchor?: unknown;
      } | null;

  if (!isValidCore(body?.core)) {
    return NextResponse.json(
      {
        error:
          "Choose exactly three distinct core elements.",
      },
      { status: 400 },
    );
  }

  if (!isValidAllocation(body?.allocation)) {
    return NextResponse.json(
      {
        error:
          "What If allocation must contain exactly 11 points.",
      },
      { status: 400 },
    );
  }

  const anchor =
    typeof body?.anchor === "string"
      ? body.anchor
      : "Auto";

  const packageResult =
    searchPackage(
      body.allocation,
      body.core,
      anchor,
    );

  if (!packageResult) {
    return NextResponse.json(
      {
        error:
          "No valid package could be generated for this scenario.",
      },
      { status: 422 },
    );
  }

  const evaluation =
    evaluateCandidate(
      body.allocation,
      body.core,
      packageResult.towers,
      anchor,
    );

  return NextResponse.json({
    evaluation,
  });
}