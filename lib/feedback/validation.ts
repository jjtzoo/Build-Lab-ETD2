import { z } from "zod";

const feedbackCategorySchema = z.enum(["BUG", "IDEA", "GENERAL"]);

const feedbackSubmissionSchema = z.object({
  category: feedbackCategorySchema.optional().default("GENERAL"),
  message: z.string().trim().min(1).max(4_000),
  contactEmail: z
    .union([z.string().trim().email().max(320), z.literal("")])
    .optional(),
});

export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export type FeedbackSubmission = {
  category: FeedbackCategory;
  message: string;
  contactEmail: string | null;
};

export function parseFeedbackSubmission(
  value: unknown,
): FeedbackSubmission | null {
  const parsed = feedbackSubmissionSchema.safeParse(value);
  if (!parsed.success) return null;

  return {
    ...parsed.data,
    contactEmail: parsed.data.contactEmail || null,
  };
}
