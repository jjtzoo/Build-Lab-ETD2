import { NextResponse } from "next/server";
import { sendFeedbackNotification } from "@/lib/feedback/email";
import { canSubmitFeedback } from "@/lib/feedback/rateLimit";
import {
  saveFeedbackSubmission,
  updateFeedbackDelivery,
} from "@/lib/feedback/store";
import { parseFeedbackSubmission } from "@/lib/feedback/validation";

export const runtime = "nodejs";

function getClientId(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const submission = parseFeedbackSubmission(body);

  if (!submission) {
    return NextResponse.json(
      {
        error:
          "Please provide a message of up to 4,000 characters and a valid email address if included.",
      },
      { status: 400 },
    );
  }

  if (!canSubmitFeedback(getClientId(request))) {
    return NextResponse.json(
      {
        error:
          "Too many feedback submissions. Please try again in a few minutes.",
      },
      { status: 429 },
    );
  }

  try {
    const id = await saveFeedbackSubmission(submission);
    const delivery = await sendFeedbackNotification(submission);

    try {
      await updateFeedbackDelivery(
        id,
        delivery.delivered ? "sent" : "failed",
        delivery.error,
      );
    } catch (error) {
      console.error("Feedback delivery status could not be updated", error);
    }

    if (!delivery.delivered) {
      console.error("Feedback notification could not be sent", {
        feedbackId: id,
        error: delivery.error,
      });
    }

    return NextResponse.json(
      { message: "Thanks — your feedback has been saved for review." },
      { status: 201 },
    );
  } catch (error) {
    console.error("Feedback submission failed", error);
    return NextResponse.json(
      {
        error: "Feedback could not be sent right now. Please try again later.",
      },
      { status: 503 },
    );
  }
}
