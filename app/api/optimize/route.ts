import { NextResponse } from "next/server";
import { optimizeV8 } from "@/lib/engine/v8-optimizer";
import type { ElementName } from "@/lib/types";

const elements = ["Light","Darkness","Water","Fire","Nature","Earth"] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(()=>null) as {
    core?: unknown;
    anchor?: unknown;
  } | null;
  const core = Array.isArray(body?.core) ? body.core : [];
  const anchor =
    typeof body?.anchor === "string"
      ? body.anchor
      : "Auto";
  if (core.length !== 3 || new Set(core).size !== 3 || core.some((x)=>!elements.includes(x as ElementName))) {
    return NextResponse.json({ error: "Choose exactly three distinct core elements." }, { status: 400 });
  }
  const results = optimizeV8(
    core as ElementName[],
    anchor,
  );
  return NextResponse.json({
    results: results.finalists.slice(0, 20),
    legalCount: results.evaluations.length,
    winner: results.winner,
  });
}
