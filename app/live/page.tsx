import type { Metadata } from "next";
import Link from "next/link";
import { LabHeader, LabFooter } from "@/components/build-lab/LabChrome";

export const metadata: Metadata = {
  title: "Live Tracking — Element TD 2 Build Lab",
  description:
    "What's coming: a companion that tracks your live game and tells you what to build next.",
};

export default function LivePage() {
  return (
    <main className="lab-shell">
      <span className="lab-grain" aria-hidden="true" />
      <LabHeader current="live" />

      <div className="intro">
        <p className="eyebrow">Live Tracking · Coming</p>
        <h1>Your plan, followed wave by wave.</h1>
        <p>
          The third piece of the Build Lab. You bring a plan — one the engine
          recommended or one you theory-crafted — and Live Tracking walks it
          with you during an actual game.
        </p>
      </div>

      <section className="lab-section live-preview-list">
        <div className="section-rail">
          <span className="section-index mono">01</span>
          <div>
            <h3>How it will work</h3>
            <p>Nothing to install — you drive it from the browser.</p>
          </div>
        </div>
        <ol className="live-steps">
          <li>
            <strong>Bring a build.</strong> Export from{" "}
            <Link href="/build-lab" className="inline-link">
              Build Lab
            </Link>{" "}
            or{" "}
            <Link href="/theorycraft" className="inline-link">
              Theory Craft
            </Link>
            . Both already produce a portable build link that this page will
            read.
          </li>
          <li>
            <strong>Track your keystones.</strong> Tick off each element pick
            as the game hands it to you; the tracker shows which towers just
            came into reach.
          </li>
          <li>
            <strong>Get the next move.</strong> At every stage it names the one
            build or upgrade that matters most for your plan — anchor first,
            then Slow, then the support package, then the Essence path.
          </li>
          <li>
            <strong>Adapt.</strong> Off-plan because a wave went badly? It
            re-checks coverage and synergy against what you actually have on
            the field.
          </li>
        </ol>
      </section>

      <section className="lab-section">
        <div className="section-rail">
          <span className="section-index mono">02</span>
          <div>
            <h3>Until then</h3>
            <p>
              The other two tools are live now.
            </p>
          </div>
        </div>
        <div className="live-cta-row">
          <Link href="/build-lab" className="secondary-button">
            Open Build Lab
          </Link>
          <Link href="/theorycraft" className="secondary-button">
            Open Theory Craft
          </Link>
        </div>
      </section>

      <LabFooter />
    </main>
  );
}
