import { NextResponse } from "next/server";
import { z } from "zod";

import {
  INTENT_CAPABILITY_INPUTS,
  INTENT_PROFILE_INPUTS,
  type BuildIntent,
} from "@/lib/engine/build-intent";
import {
  BuildIntentValidationError,
} from "@/lib/engine/build-intent-resolver";
import {
  BuildStateValidationError,
  createBuildState,
} from "@/lib/engine/build-state";
import { createSequentialRecommendationResponse } from "@/lib/sequential-recommendation";

const elementAllocationSchema = z.object({
  Light: z.number().int().nonnegative(),
  Darkness: z.number().int().nonnegative(),
  Water: z.number().int().nonnegative(),
  Fire: z.number().int().nonnegative(),
  Nature: z.number().int().nonnegative(),
  Earth: z.number().int().nonnegative(),
}).strict();

const buildStateRequestSchema = z.object({
  selectedTowers: z.array(z.object({
    towerName: z.string().min(1),
    level: z.number().int(),
  }).strict()),
  elementAllocation: elementAllocationSchema,
  maxTowerSlots: z.number().int().nonnegative(),
}).strict();

const buildIntentRequestSchema = z.object({
  focusedTowers: z.array(z.object({
    tower: z.string().min(1),
    priority: z.enum(["explore", "balanced", "maximum-depth"]).optional(),
  }).strict()),
  preferredProfiles: z.array(z.enum(INTENT_PROFILE_INPUTS)).optional(),
  preferredCapabilities: z.array(z.enum(INTENT_CAPABILITY_INPUTS)).optional(),
  mode: z.enum(["normal", "explore"]),
}).strict();

const nextRecommendationRequestSchema = z.object({
  state: buildStateRequestSchema,
  intent: buildIntentRequestSchema.optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();

function invalidRequest(message: string, details?: readonly string[]) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return invalidRequest("Request body must be valid JSON.");

  const parsed = nextRecommendationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequest(
      "Request must contain a valid build state and an optional limit from 1 to 20.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`),
    );
  }

  try {
    const state = createBuildState(parsed.data.state);
    return NextResponse.json(
      createSequentialRecommendationResponse(
        state,
        parsed.data.limit ?? 10,
        parsed.data.intent as BuildIntent | undefined,
      ),
    );
  } catch (error) {
    if (error instanceof BuildStateValidationError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
      }, { status: 400 });
    }
    if (error instanceof BuildIntentValidationError) {
      return NextResponse.json({
        error: error.message,
        code: "invalid-intent",
      }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Sequential recommendation evaluation failed." },
      { status: 500 },
    );
  }
}
