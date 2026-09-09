import type { FeedbackSubmission } from "@/lib/feedback/validation";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RECIPIENT = "bsemjtoledo@gmail.com";

export async function sendFeedbackNotification(submission: FeedbackSubmission) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL;
  const to = process.env.FEEDBACK_TO_EMAIL ?? DEFAULT_RECIPIENT;

  if (!apiKey || !from) {
    return {
      delivered: false,
      error: "Feedback email is not configured.",
    };
  }

  const response = await fetch(RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[Build Lab feedback] ${submission.category}`,
      text: [
        `Category: ${submission.category}`,
        `Reply-to: ${submission.contactEmail ?? "Not provided"}`,
        "",
        submission.message,
      ].join("\n"),
      ...(submission.contactEmail ? { reply_to: submission.contactEmail } : {}),
    }),
  });

  if (response.ok) {
    return { delivered: true, error: null };
  }

  return {
    delivered: false,
    error: `Resend returned ${response.status}.`,
  };
}
