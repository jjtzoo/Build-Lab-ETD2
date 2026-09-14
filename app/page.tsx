import type { Metadata } from "next";
import Image from "next/image";
import { LabFooter } from "@/components/build-lab/LabChrome";
import { resolveBuildLabAssets } from "@/components/build-lab/assetResolver";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import {
  FeatureCarousel,
  type CarouselItem,
} from "@/components/landing/FeatureCarousel";
import {
  BuildLabPreview,
  type BuildLabPreviewData,
} from "@/components/landing/previews/BuildLabPreview";
import { TheorycraftPreview } from "@/components/landing/previews/TheorycraftPreview";
import { LivePreview } from "@/components/landing/previews/LivePreview";
import { SupportLink } from "@/components/SupportRail";

export const metadata: Metadata = {
  title: "Element TD 2 Build Lab",
  description:
    "Three tools for planning an Element TD 2 game — a recommendation engine, a theory-craft sandbox, and a pre-game Match Plan.",
  authors: [{ name: "JJ Toledo" }],
  creator: "JJ Toledo (jjtzoo)",
};

export default function Home() {
  const assets = resolveBuildLabAssets();
  const laser = buildRecommendationSetDto("laser").plans[0];

  const buildLabData: BuildLabPreviewData = {
    anchorId: laser.anchor.id,
    anchorName: laser.anchor.name,
    package: laser.package.map((tower) => ({
      id: tower.id,
      name: tower.name,
      level: tower.level,
    })),
    synergyTags: laser.synergy.tags,
    coverage: laser.coverage.rows.map((row) => ({
      defender: row.defender,
      multiplier: row.anchorMultiplier,
      weak: row.isAnchorWeakness,
    })),
    keystoneCount: laser.keystoneCount,
  };

  const items: CarouselItem[] = [
    {
      id: "build-lab",
      eyebrow: "Recommend",
      title: "Build Lab",
      blurb:
        "Pick a main DPS anchor; the engine returns a full plan — package, keystone route, coverage, synergy, End Game.",
      href: "/build-lab",
      cta: "Open Build Lab",
      preview: <BuildLabPreview data={buildLabData} assets={assets} />,
    },
    {
      id: "theorycraft",
      eyebrow: "Sandbox",
      title: "Theory Craft",
      blurb:
        "Build it your way, slot by slot, against the 11-keystone budget — graded with the same engine evidence.",
      href: "/theorycraft",
      cta: "Open Theory Craft",
      preview: <TheorycraftPreview assets={assets} />,
    },
    {
      id: "live",
      eyebrow: "Prepare",
      title: "Match Plan",
      blurb:
        "Turn a build into phase snapshots, camp assignments, coverage repairs and a safe purchase sequence before loading in.",
      href: "/match-plan",
      cta: "Open Match Plan",
      preview: <LivePreview assets={assets} />,
    },
  ];

  return (
    <main className="landing-shell">
      <span className="lab-grain" aria-hidden="true" />

      <header className="lab-header">
        <span className="wordmark">
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
        </span>
        <span className="header-aside">
          <span className="header-note">Companion tools</span>
          <SupportLink />
        </span>
      </header>

      <div className="landing-hero">
        <p className="eyebrow">Element TD 2</p>
        <h1>Plan the whole game, three ways.</h1>
        <p>
          A recommendation engine, a theory-craft sandbox, and a pre-game
          strategy storyboard that plans the whole match.
        </p>
      </div>

      <FeatureCarousel items={items} />

      <LabFooter />
    </main>
  );
}
