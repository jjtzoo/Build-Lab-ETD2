import {
  getTower,
} from "@/lib/domain/towerCatalog";

import type {
  TowerId,
} from "@/lib/domain/tower";

import type {
  MechanicAvailabilityClass,
} from "@/lib/engine/mechanicAvailability";

import type {
  CorePackageEvidence,
} from "@/lib/engine/corePackageEvidence";

import {
  qualifySynergyRelation,
  compareTier,
  isPrimaryNetworkTier,
  type SynergyQualification,
} from "@/lib/engine/synergyQualification";

/**
 * User-facing mechanic tag for each canonical synergy signal. These are
 * the only tags shown on tower cards and in the grouped synergy view.
 */
export const MECHANIC_TAG: Readonly<
  Record<string, string>
> = {
  "enemy-slow": "Slow",
  "enemy-stun": "Stun",
  "enemy-stasis": "Stasis",
  "damage-taken-amp": "Damage Amp",
  "current-hp-removal": "Current HP Removal",
  "attack-damage-buff": "Attack Damage",
  "attack-speed-buff": "Attack Speed",
  "tower-replication": "Replication",
  "kill-generation": "Kill Generation",
  "nearby-enemy-death": "Death Trigger",
  "damage-echo": "Damage Echo",
  "target-isolation": "Isolation",
  "enemy-grouping": "Grouping",
  "enemy-displacement": "Displacement",
  "path-distance": "Range",
};

export const AVAILABILITY_TAG: Readonly<
  Record<
    MechanicAvailabilityClass,
    string
  >
> = {
  "effectively-continuous": "Persistent",
  periodic: "Conditional",
  triggered: "Triggered",
  "burst-window": "Burst Window",
  ramping: "Ramping",
  unknown: "Unknown",
};

const SIGNAL_TEMPLATE: Readonly<
  Record<
    string,
    (p: string, c: string) => string
  >
> = {
  "enemy-grouping": (p, c) =>
    `${p} pulls enemies together so ${c} can affect denser packs.`,
  "target-isolation": (p, c) =>
    `${p} separates enemies so ${c} deals its full damage against isolated targets.`,
  "attack-damage-buff": (p, c) =>
    `${p} increases ${c}'s attack damage.`,
  "attack-speed-buff": (p, c) =>
    `${p} increases ${c}'s attack speed.`,
  "enemy-slow": (p, c) =>
    `${p} slows enemies, keeping them in ${c}'s effective window longer.`,
  "enemy-stun": (p, c) =>
    `${p} stuns enemies, holding them for ${c}.`,
  "enemy-stasis": (p, c) =>
    `${p} freezes a target in stasis, setting up ${c}.`,
  "damage-taken-amp": (p, c) =>
    `${p} amplifies the damage enemies take from ${c}.`,
  "current-hp-removal": (p, c) =>
    `${p} strips current HP, softening targets for ${c}.`,
  "kill-generation": (p, c) =>
    `${p} generates kills that power ${c}.`,
  "nearby-enemy-death": (p, c) =>
    `${p}'s kills trigger ${c}'s on-death effect.`,
  "damage-echo": (p, c) =>
    `${p} echoes ${c}'s damage across nearby enemies.`,
  "tower-replication": (p, c) =>
    `${p} replicates ${c}'s attacks.`,
  "enemy-displacement": (p, c) =>
    `${p} repositions enemies into ${c}'s kill zone.`,
  "path-distance": (p, c) =>
    `${p} extends the effective engagement range for ${c}.`,
};

/**
 * A handful of marquee interactions that read better with bespoke
 * wording. Everything else uses the signal templates above.
 */
const PAIR_OVERRIDE: Readonly<
  Record<string, string>
> = {
  "archdruid>corrosion>enemy-grouping":
    "Archdruid hurls enemies into a tight cluster, letting Corrosion's spread cover the whole pack.",
  "phantom-zone>laser>enemy-stasis":
    "Phantom Zone holds a target in stasis, giving Laser a clean isolated shot before the stored damage releases.",
  "singularity>runic>enemy-grouping":
    "Singularity drags the wave into one clump so Runic's area hit lands on everything at once.",
};

export type SynergyRelationExplanation = {
  providerId: TowerId;
  providerName: string;
  consumerId: TowerId;
  consumerName: string;
  signal: string;
  mechanicTag: string;
  availabilityTag: string;
  contribution: "full" | "diminished";
  effectiveStrength: number;
  consumerIsAnchor: boolean;
  qualification: SynergyQualification;
  text: string;
};

function availabilityClass(
  evidence: CorePackageEvidence,
  providerTowerId: string,
  signal: string,
): MechanicAvailabilityClass {
  return (
    evidence.resolvedContributions
      .find(
        (entry) =>
          entry.towerId ===
          providerTowerId,
      )
      ?.supportedAbilityFacts.find(
        (fact) => fact.signal === signal,
      )?.availability.classification ??
    "unknown"
  );
}

export function explainSynergyRelations(
  evidence: CorePackageEvidence,
): readonly SynergyRelationExplanation[] {
  return evidence.synergy.applicable
    .filter(
      (match) =>
        match.contribution !== "ignored",
    )
    .map((match) => {
      const providerName = getTower(
        match.providerTowerId as TowerId,
      ).name;
      const consumerName = getTower(
        match.consumerTowerId as TowerId,
      ).name;
      const cls = availabilityClass(
        evidence,
        match.providerTowerId,
        match.signal,
      );

      const override =
        PAIR_OVERRIDE[
          `${match.providerTowerId}>${match.consumerTowerId}>${match.signal}`
        ];
      const template =
        SIGNAL_TEMPLATE[match.signal];
      let text =
        override ??
        (template
          ? template(
              providerName,
              consumerName,
            )
          : `${providerName} supports ${consumerName}.`);

      if (
        cls === "burst-window" ||
        cls === "triggered" ||
        cls === "periodic"
      ) {
        text +=
          " The effect is not always active.";
      }
      if (
        match.contribution ===
        "diminished"
      ) {
        text +=
          " Another provider already covers most of this, so the added effect is limited.";
      }

      const contribution =
        match.contribution as "full" | "diminished";
      const consumerIsAnchor =
        match.consumerTowerId ===
        evidence.anchorTowerId;

      return {
        providerId:
          match.providerTowerId as TowerId,
        providerName,
        consumerId:
          match.consumerTowerId as TowerId,
        consumerName,
        signal: match.signal,
        mechanicTag:
          MECHANIC_TAG[match.signal] ??
          match.signal,
        availabilityTag:
          AVAILABILITY_TAG[cls],
        contribution,
        effectiveStrength:
          match.effectiveStrength,
        consumerIsAnchor,
        qualification: qualifySynergyRelation({
          signal: match.signal,
          effectiveStrength:
            match.effectiveStrength,
          contribution,
          availabilityClass: cls,
          consumerIsAnchor,
        }),
        text,
      };
    })
    .sort(
      (a, b) =>
        compareTier(
          a.qualification.tier,
          b.qualification.tier,
        ) ||
        b.effectiveStrength -
          a.effectiveStrength ||
        a.consumerName.localeCompare(
          b.consumerName,
        ),
    );
}

/**
 * Splits relations into the set shown in the primary synergy network
 * (Fair and above) and the weaker Situational tail kept for the "view
 * all relationships" disclosure.
 */
export function partitionSynergyRelations(
  relations: readonly SynergyRelationExplanation[],
): {
  primary: readonly SynergyRelationExplanation[];
  secondary: readonly SynergyRelationExplanation[];
} {
  const primary: SynergyRelationExplanation[] = [];
  const secondary: SynergyRelationExplanation[] = [];
  for (const relation of relations) {
    if (isPrimaryNetworkTier(relation.qualification.tier)) {
      primary.push(relation);
    } else {
      secondary.push(relation);
    }
  }
  return { primary, secondary };
}

/**
 * The 1-3 most build-relevant mechanic tags for one tower, drawn only
 * from relationships it actually participates in.
 */
export function synergyTagsForTower(
  relations:
    readonly SynergyRelationExplanation[],
  towerId: TowerId,
): readonly string[] {
  const provided = new Set<string>();
  const consumed = new Set<string>();

  for (const relation of relations) {
    if (relation.providerId === towerId) {
      provided.add(relation.mechanicTag);
    }
    if (relation.consumerId === towerId) {
      consumed.add(
        `${relation.mechanicTag} Beneficiary`,
      );
    }
  }

  return [...provided, ...consumed].slice(
    0,
    3,
  );
}

export function groupSynergyByMechanic(
  relations:
    readonly SynergyRelationExplanation[],
): readonly {
  mechanicTag: string;
  relations:
    readonly SynergyRelationExplanation[];
}[] {
  const byTag = new Map<
    string,
    SynergyRelationExplanation[]
  >();

  for (const relation of relations) {
    const list =
      byTag.get(relation.mechanicTag) ??
      [];
    list.push(relation);
    byTag.set(relation.mechanicTag, list);
  }

  return [...byTag.entries()]
    .map(([mechanicTag, list]) => ({
      mechanicTag,
      relations: list,
    }))
    .sort(
      (a, b) =>
        compareTier(
          a.relations[0].qualification.tier,
          b.relations[0].qualification.tier,
        ) ||
        b.relations.length -
          a.relations.length ||
        a.mechanicTag.localeCompare(
          b.mechanicTag,
        ),
    );
}
