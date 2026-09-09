"use client";

import { useEffect, useRef, useState } from "react";

type SubmissionState = "idle" | "submitting" | "success" | "error";

function getFocusableElements(container: HTMLElement) {
  return container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
}

export function FeedbackDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [submissionState, setSubmissionState] =
    useState<SubmissionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  const openDialog = () => {
    setSubmissionState("idle");
    setErrorMessage("");
    setIsOpen(true);
  };

  const closeDialog = () => setIsOpen(false);

  const submitFeedback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const category = formData.get("category");
    const contactEmail = formData.get("contactEmail");

    setSubmissionState("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(typeof category === "string" && category ? { category } : {}),
          message: formData.get("message"),
          contactEmail: typeof contactEmail === "string" ? contactEmail : "",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ??
            "Feedback could not be sent right now. Please try again later.",
        );
      }

      form.reset();
      setSubmissionState("success");
    } catch (error) {
      setSubmissionState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Feedback could not be sent right now. Please try again later.",
      );
    }
  };

  return (
    <>
      <button
        type="button"
        className="footer-feedback-link"
        onClick={openDialog}
      >
        Send feedback
      </button>

      {isOpen ? (
        <div
          className="feedback-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            className="feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
            aria-describedby="feedback-modal-description"
            ref={dialogRef}
          >
            <header className="feedback-modal-head">
              <div>
                <span className="feedback-modal-eyebrow mono">
                  Build Lab feedback
                </span>
                <h2 id="feedback-modal-title">Help shape the Lab</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close feedback form"
                onClick={closeDialog}
                ref={closeRef}
              >
                ×
              </button>
            </header>

            <form className="feedback-form" onSubmit={submitFeedback}>
              <p
                id="feedback-modal-description"
                className="feedback-modal-description"
              >
                Tell us what worked, what got in the way, or what you would like
                to see next. Feedback is saved for review.
              </p>

              <label className="feedback-field">
                <span>
                  Topic <em>(optional)</em>
                </span>
                <select name="category" defaultValue="">
                  <option value="">Choose a topic</option>
                  <option value="BUG">Something is broken</option>
                  <option value="IDEA">Feature idea</option>
                  <option value="GENERAL">General feedback</option>
                </select>
              </label>

              <label className="feedback-field">
                <span>Your feedback</span>
                <textarea
                  name="message"
                  required
                  maxLength={4000}
                  rows={6}
                  placeholder="Share the detail that would make Build Lab better."
                />
              </label>

              <label className="feedback-field">
                <span>
                  Email <em>(optional)</em>
                </span>
                <input
                  name="contactEmail"
                  type="email"
                  autoComplete="email"
                  maxLength={320}
                  placeholder="For a reply, if you would like one"
                />
              </label>

              <p className="feedback-privacy-note">
                Please do not include sensitive personal information.
              </p>

              {submissionState === "success" ? (
                <p className="feedback-form-status" role="status">
                  Thanks — your feedback has been saved for review.
                </p>
              ) : null}
              {submissionState === "error" ? (
                <p className="feedback-form-error" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <div className="feedback-form-actions">
                <button
                  type="button"
                  className="feedback-cancel-button"
                  onClick={closeDialog}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="feedback-submit-button"
                  disabled={submissionState === "submitting"}
                >
                  {submissionState === "submitting"
                    ? "Sending…"
                    : "Send feedback"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
