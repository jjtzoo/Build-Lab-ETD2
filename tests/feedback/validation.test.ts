import { describe, expect, it } from "vitest";
import { parseFeedbackSubmission } from "@/lib/feedback/validation";

describe("parseFeedbackSubmission", () => {
  it("accepts anonymous feedback and defaults its category", () => {
    expect(
      parseFeedbackSubmission({
        message: "The tower comparison made this choice much clearer.",
      }),
    ).toEqual({
      category: "GENERAL",
      message: "The tower comparison made this choice much clearer.",
      contactEmail: null,
    });
  });

  it("normalizes a supplied reply email", () => {
    expect(
      parseFeedbackSubmission({
        category: "IDEA",
        message: "Please add a way to compare routes.",
        contactEmail: "player@example.com",
      }),
    ).toEqual({
      category: "IDEA",
      message: "Please add a way to compare routes.",
      contactEmail: "player@example.com",
    });
  });

  it("rejects empty messages and invalid contact details", () => {
    expect(parseFeedbackSubmission({ message: "   " })).toBeNull();
    expect(
      parseFeedbackSubmission({
        message: "This should not be accepted.",
        contactEmail: "not-an-email",
      }),
    ).toBeNull();
  });
});
