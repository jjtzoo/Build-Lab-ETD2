import Link from "next/link";
import Image from "next/image";
import { FeedbackDialog } from "@/components/build-lab/FeedbackDialog";
import { SupportLink } from "@/components/SupportRail";

type LabSurface = "build-lab" | "theorycraft" | "live";

/** Shared header + primary navigation for every Build Lab surface. */
export function LabHeader({ current }: { current: LabSurface }) {
  return (
    <header className="lab-header">
      <Link href="/" className="wordmark">
        <Image
          className="wordmark-mark"
          src="/branding/buildlab-icon.png"
          alt=""
          width={26}
          height={26}
          sizes="26px"
          priority
        />
        ELEMENT TD 2 <span>BUILD LAB</span>
      </Link>
      <nav className="lab-nav" aria-label="Sections">
        <Link
          href="/build-lab"
          className="lab-nav-link"
          aria-current={current === "build-lab" ? "page" : undefined}
        >
          Build Lab
        </Link>
        <Link
          href="/theorycraft"
          className="lab-nav-link"
          aria-current={current === "theorycraft" ? "page" : undefined}
        >
          Theory Craft
        </Link>
        <Link
          href="/live"
          className="lab-nav-link"
          aria-current={current === "live" ? "page" : undefined}
        >
          Live Tracking
        </Link>
        <SupportLink className="lab-nav-support" />
      </nav>
    </header>
  );
}

/** Shared footer — branding, support, feedback, disclaimer. */
export function LabFooter() {
  return (
    <footer className="lab-footer">
      <span className="footer-product">
        Element TD 2 Build Lab
      </span>
      <span className="footer-signature">
        <Image
          src="/branding/jjtzoo-general-logo.png"
          alt="jjtzoo"
          width={1254}
          height={1254}
        />
      </span>
      <span className="footer-copy">© 2026 JJ Toledo</span>
      <div className="footer-support">
        <span>
          Enjoying Build Lab? Help cover hosting and keep the Lab free for
          everyone.
        </span>
        <a
          href="https://ko-fi.com/jjtzoo"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support the Lab on Ko-fi (opens in a new tab)"
          className="footer-support-link"
        >
          Support the Lab
        </a>
      </div>
      <div className="footer-feedback">
        <span>Have a thought about the Lab?</span>
        <FeedbackDialog />
      </div>
      <span className="footer-disclaimer">
        Recommendations explain a plan — placement and execution remain
        yours. Element TD 2 and its tower art are property of their
        respective owners; this is an unofficial fan tool.
      </span>
    </footer>
  );
}
