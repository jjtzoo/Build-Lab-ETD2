import type { BuildIntent } from "@/lib/engine/build-intent";
import type {
  BuildStateInput,
  CapabilityKey,
  ElementAllocation,
  RankingComponent,
  StrategicProfileKey,
  IntentAlignmentStatus,
} from "@/lib/types";

export type ValidationComponentExpectation = Readonly<{
  candidate: string;
  component: RankingComponent;
  key?: string;
}>;

export type ValidationScenario = Readonly<{
  id: string;
  label: string;
  purpose: string;
  state: BuildStateInput;
  intent?: BuildIntent;
  lookahead?: boolean;
  expectedImmediateTop: string;
  expectedTwoStepPath?: Readonly<{
    first: string;
    second: string | null;
  }>;
  expectedProfiles?: readonly StrategicProfileKey[];
  expectedVulnerabilities?: readonly CapabilityKey[];
  expectedComponents?: readonly ValidationComponentExpectation[];
  expectedIntentAlignment?: IntentAlignmentStatus;
  dataLimitations?: string;
}>;

function allocation(): ElementAllocation {
  return { Light: 1, Darkness: 1, Water: 1, Fire: 1, Nature: 1, Earth: 1 };
}

function state(
  towerNames: readonly string[],
  maxTowerSlots = 8,
): BuildStateInput {
  return {
    selectedTowers: towerNames.map((towerName) => ({ towerName, level: 1 })),
    elementAllocation: allocation(),
    maxTowerSlots,
  };
}

/**
 * Real catalog-only MVP scenarios. They deliberately preserve inputs and
 * strategic assertions rather than freezing arbitrary contextual scores.
 */
export const VALIDATION_CORPUS: readonly ValidationScenario[] = [
  {
    id: "dot-sustained",
    label: "DoT / sustained damage",
    purpose: "Validate persistent-damage profiles and coverage gaps.",
    state: state(["Poison", "Plague"]),
    expectedProfiles: ["dot", "sustainedDps"],
    expectedVulnerabilities: ["range"],
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "aoe-wave-clear",
    label: "AoE / wave clear",
    purpose: "Validate area-pressure interpretation with Tsunami and Nuclear anchors.",
    state: state(["Infernal", "Tsunami", "Nuclear", "Singularity"]),
    expectedProfiles: ["aoeWaveClear"],
    expectedImmediateTop: "Rage",
  },
  {
    id: "boss-single-target",
    label: "Boss / single target",
    purpose: "Validate priority-target pressure with Railgun, Doom, and Shredder anchors.",
    state: state(["Howitzer", "Railgun", "Doom", "Shredder"]),
    expectedProfiles: ["bossSingleTarget"],
    expectedImmediateTop: "Rage",
  },
  {
    id: "control-package",
    label: "Control",
    purpose: "Validate control signals and Gravity Cannon coverage.",
    state: state(["Windstorm", "Gravity Cannon"]),
    expectedProfiles: ["control"],
    expectedVulnerabilities: ["isolation"],
    expectedImmediateTop: "Rage",
  },
  {
    id: "amplification-support",
    label: "Amplification / support",
    purpose: "Validate support signals with Blacksmith, Life Altar, and Obelisk.",
    state: state(["Blacksmith", "Life Altar", "Obelisk"]),
    expectedProfiles: ["support"],
    expectedImmediateTop: "Nuclear",
  },
  {
    id: "scaling-package",
    label: "Scaling",
    purpose: "Validate scaling signals with Haste and Tesla Tree.",
    state: state(["Haste", "Tesla Tree"]),
    expectedProfiles: ["scaling"],
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "economy-package",
    label: "Economy",
    purpose: "Validate the economy profile without inventing combat value.",
    state: state(["Money"]),
    expectedProfiles: ["economy"],
    expectedImmediateTop: "Rage",
  },
  {
    id: "isolation-package",
    label: "Isolation",
    purpose: "Validate isolation evidence from Gravity Cannon without inferring it from Crystal Spire's stored projectile burst.",
    state: state(["Gravity Cannon"]),
    expectedProfiles: ["isolation"],
    expectedImmediateTop: "Rage",
  },
  {
    id: "replication-network",
    label: "Replication / network",
    purpose: "Validate the network-oriented Phantom Zone package.",
    state: state(["Trickery", "Phantom Zone"]),
    expectedProfiles: ["replicationNetwork"],
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "rage-laser-synergy",
    label: "Explicit synergy package",
    purpose: "Ensure stored mechanics synergy remains visible for Rage and Laser.",
    state: state(["Rage"]),
    intent: {
      focusedTowers: [{ tower: "Rage", priority: "maximum-depth" }],
      mode: "normal",
    },
    expectedComponents: [{
      candidate: "Laser",
      component: "synergy",
      key: "Laser:Rage",
    }],
    expectedVulnerabilities: ["range"],
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "windstorm-laser-anti-synergy",
    label: "Explicit anti-synergy",
    purpose: "Ensure stored anti-synergy remains visible for Windstorm and Laser.",
    state: state(["Windstorm"]),
    intent: {
      focusedTowers: [{ tower: "Windstorm", priority: "maximum-depth" }],
      mode: "normal",
    },
    expectedComponents: [{
      candidate: "Laser",
      component: "anti-synergy",
      key: "Laser:Windstorm",
    }],
    lookahead: true,
    expectedImmediateTop: "Tsunami",
    expectedTwoStepPath: { first: "Tsunami", second: "Rage" },
  },
  {
    id: "mixed-architecture",
    label: "Mixed architecture",
    purpose: "Validate that a DoT, support, and control mix remains explainable.",
    state: state(["Poison", "Blacksmith", "Windstorm"]),
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "near-slot-capacity",
    label: "Near slot capacity",
    purpose: "Exercise final-slot pressure with only one legal addition remaining.",
    state: state(["Poison", "Haste", "Blacksmith", "Windstorm", "Rage"], 6),
    lookahead: true,
    expectedImmediateTop: "Tsunami",
    expectedTwoStepPath: { first: "Tsunami", second: null },
  },
  {
    id: "intent-aligned-dot",
    label: "Intent aligned",
    purpose: "Validate a declared DoT preference that agrees with the current build.",
    state: state(["Poison"]),
    intent: {
      focusedTowers: [{ tower: "Poison", priority: "balanced" }],
      preferredProfiles: ["dot"],
      mode: "normal",
    },
    expectedProfiles: ["dot"],
    expectedVulnerabilities: ["range"],
    expectedIntentAlignment: "aligned",
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "intent-conflicting-boss",
    label: "Intent conflicting",
    purpose: "Validate that a boss preference does not rewrite a current DoT build.",
    state: state(["Poison"]),
    intent: {
      focusedTowers: [],
      preferredProfiles: ["boss-single-target"],
      mode: "normal",
    },
    expectedProfiles: ["dot"],
    expectedVulnerabilities: ["range"],
    expectedIntentAlignment: "diverges",
    expectedImmediateTop: "Tsunami",
  },
  {
    id: "endgame-anchor-mix",
    label: "Endgame anchor mix",
    purpose: "Keep Archdruid and the remaining late-game anchors reproducible without claiming a pure archetype.",
    state: state(["Archdruid", "Phantom Zone", "Tesla Tree", "Crystal Spire"]),
    expectedImmediateTop: "Rage",
    dataLimitations: "This intentionally mixed scenario validates catalog coverage rather than one pure inferred profile.",
  },
];
