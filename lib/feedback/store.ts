import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { FeedbackSubmission } from "@/lib/feedback/validation";

declare global {
  var feedbackPool: Pool | undefined;
}

function getFeedbackPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!global.feedbackPool) {
    global.feedbackPool = new Pool({ connectionString });
  }

  return global.feedbackPool;
}

export async function saveFeedbackSubmission(submission: FeedbackSubmission) {
  const id = randomUUID();
  await getFeedbackPool().query(
    `insert into feedback_submission (
      id,
      category,
      message,
      contact_email,
      delivery_status
    ) values ($1, $2, $3, $4, 'pending')`,
    [id, submission.category, submission.message, submission.contactEmail],
  );
  return id;
}

export async function updateFeedbackDelivery(
  id: string,
  status: "sent" | "failed",
  error: string | null,
) {
  await getFeedbackPool().query(
    `update feedback_submission
     set delivery_status = $2,
         delivery_error = $3,
         notification_sent_at = case
           when $2 = 'sent' then now()
           else null
         end
     where id = $1`,
    [id, status, error],
  );
}
