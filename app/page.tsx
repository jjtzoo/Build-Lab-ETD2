import type { Metadata } from "next";
import Image from "next/image";
import { LabFooter } from "@/components/build-lab/LabChrome";
import { resolveBuildLabAssets } from "@/components/build-lab/assetResolver";
import { buildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";
import { CURATED_ANCHORS } from "@/lib/domain/anchorPolicy";
import {
  FeatureCarousel,
  type CarouselItem,
} from "@/components/landing/FeatureCarousel";
import {
  RandomBuildLabPreview,
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
  // Every curated anchor's preview, computed once at build time; the card
  // shows one at random per visit instead of always the same anchor.
  const buildLabOptions: BuildLabPreviewData[] = CURATED_ANCHORS.flatMap(
    ({ towerId }) => {
      const plan = buildRecommendationSetDto(towerId).plans[0];
      if (!plan) return [];
      return [
        {
          anchorId: plan.anchor.id,
          anchorName: plan.anchor.name,
          package: plan.package.map((tower) => ({
            id: tower.id,
            name: tower.name,
            level: tower.level,
          })),
          synergyTags: plan.synergy.tags,
          coverage: plan.coverage.rows.map((row) => ({
            defender: row.defender,
            multiplier: row.anchorMultiplier,
            weak: row.isAnchorWeakness,
          })),
          keystoneCount: plan.keystoneCount,
        },
      ];
    },
  );

  const items: CarouselItem[] = [
    {
      id: "build-lab",
      eyebrow: "Recommend",
      title: "Build Lab",
      blurb:
        "Pick a main DPS anchor; the engine returns a full plan — package, keystone route, coverage, synergy, End Game.",
      href: "/build-lab",
      cta: "Open Build Lab",
      preview: (
        <RandomBuildLabPreview options={buildLabOptions} assets={assets} />
      ),
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
