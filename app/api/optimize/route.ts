import { NextResponse } from "next/server";
import { optimizeV8 } from "@/lib/engine/v8-optimizer";
import type { ElementName } from "@/lib/types";
import {
  optimizeAutoCore,
} from "@/lib/engine/auto-core";

const elements = ["Light","Darkness","Water","Fire","Nature","Earth"] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(()=>null) as {
    core?: unknown;
    anchor?: unknown;
    mode?: unknown;
  } | null;
  const core = Array.isArray(body?.core) ? body.core : [];
  const anchor =
    typeof body?.anchor === "string"
      ? body.anchor
      : "Auto";
  
  const mode =
  body?.mode === "auto"
    ? "auto"
    : "manual";

  if (core.length !== 3 || new Set(core).size !== 3 || core.some((x)=>!elements.includes(x as ElementName))) {
    return NextResponse.json({ error: "Choose exactly three distinct core elements." }, { status: 400 });
  }

  const autoResult =
    mode === "auto"
      ? optimizeAutoCore(anchor)
      : null;

  const results =
    mode === "auto"
      ? autoResult?.result ?? null
      : optimizeV8(
          core as ElementName[],
          anchor,
        );

  if (!results) {
    return NextResponse.json(
      {
        error:
          "No valid build could be generated for the selected inputs.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    results: results.finalists.slice(0, 20),
    legalCount: results.evaluations.length,
    winner: results.winner,
  });
}
