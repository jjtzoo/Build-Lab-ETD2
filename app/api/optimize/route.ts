import { NextResponse } from "next/server";
import { optimize } from "@/lib/engine/allocation";
import type { ElementName } from "@/lib/types";

const elements = ["Light","Darkness","Water","Fire","Nature","Earth"] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(()=>null) as { core?: unknown } | null;
  const core = Array.isArray(body?.core) ? body.core : [];
  if (core.length !== 3 || new Set(core).size !== 3 || core.some((x)=>!elements.includes(x as ElementName))) {
    return NextResponse.json({ error: "Choose exactly three distinct core elements." }, { status: 400 });
  }
  const results = optimize(core as ElementName[]);
  return NextResponse.json({ results: results.slice(0, 20), legalCount: results.length });
}
