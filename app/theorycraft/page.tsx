import type { Metadata } from "next";
import { TheoryCraft } from "@/components/theorycraft/TheoryCraft";
import { resolveBuildLabAssets } from "@/components/build-lab/assetResolver";

export const metadata: Metadata = {
  title: "Theory Craft — Element TD 2 Build Lab",
  description:
    "Hand-build an Element TD 2 tower package against the 11-keystone budget and grade it with the Build Lab engine.",
};

export default function TheoryCraftPage() {
  return <TheoryCraft assets={resolveBuildLabAssets()} />;
}
