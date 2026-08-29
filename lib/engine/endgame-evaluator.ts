import type {
  Allocation,
  ElementName,
} from "@/lib/types";
import type {
  EndgameEvaluation,
  EndgameSelection,
  TowerState,
} from "./types";

const TOTAL_ESSENCE = 2;
const ESSENCE_COST = 1;

const PURE_VALUE: Record<
  ElementName,
  number
> = {
  Light: 56160,
  Darkness: 129600,
  Water: 38880,
  Fire: 12960,
  Nature: 36720,
  Earth: 54000,
};

const PURE_RANGE: Record<
  ElementName,
  number
> = {
  Light: 1500,
  Darkness: 1150,
  Water: 900,
  Fire: 750,
  Nature: 750,
  Earth: 900,
};

function elementAtLeastThree(
  allocation: Allocation,
  element: ElementName,
): boolean {
  const index = [
    "Light",
    "Darkness",
    "Water",
    "Fire",
    "Nature",
    "Earth",
  ].indexOf(element);

  return index >= 0 && allocation[index] >= 3;
}

function allElementsAtLeastOne(
  allocation: Allocation,
): boolean {
  return allocation.every(
    (value) => value >= 1,
  );
}

function pureCandidates(
  allocation: Allocation,
): EndgameSelection[] {
  return (
    [
      "Light",
      "Darkness",
      "Water",
      "Fire",
      "Nature",
      "Earth",
    ] as ElementName[]
  )
    .filter((element) =>
      elementAtLeastThree(
        allocation,
        element,
      ),
    )
    .map((element) : EndgameSelection => ({
      kind: "Pure",
      element,
      value:
        PURE_VALUE[element] +
        Math.min(12, PURE_RANGE[element] / 125),
      essenceCost: ESSENCE_COST,
      reason:
        `${element} reaches Lv3 allocation and is eligible for a Lv4 Pure conversion.`,
    }))
    .sort((a, b) => b.value - a.value);
}

function periodicCandidate(
  allocation: Allocation,
): EndgameSelection | null {
  if (!allElementsAtLeastOne(allocation)) {
    return null;
  }

  return {
    kind: "Periodic",
    value: 52000,
    essenceCost: ESSENCE_COST,
    reason:
      "All six elements reach Lv1+, unlocking the Periodic endgame conversion.",
  };
}

function selectedTowerName(
  states: TowerState[],
): string | null {
  return (
    states.find(
      (state) => state.roles.scaling === "Primary",
    )?.tower.name ??
    states.find(
      (state) => state.roles.mainDPS === "Primary",
    )?.tower.name ??
    null
  );
}

export function evaluateEndgame(
  allocation: Allocation,
  states: TowerState[],
): EndgameEvaluation {
  const pure = pureCandidates(allocation);
  const periodic = periodicCandidate(allocation);

  const availablePure =
    pure.map(
      (candidate) =>
        candidate.element as ElementName,
    );

  const reasons: string[] = [];

  if (pure.length > 0) {
    reasons.push(
      `${pure.length} Pure Element conversion option${
        pure.length === 1 ? "" : "s"
      } available.`,
    );
  } else {
    reasons.push(
      "No element currently reaches Lv3 for a Pure conversion.",
    );
  }

  if (periodic) {
    reasons.push(
      "Periodic is available through full six-element breadth.",
    );
  }

  if (pure.length === 0 && !periodic) {
    return {
      score: 0,
      totalEssence: TOTAL_ESSENCE,
      spent: 0,
      selected: [],
      availablePure,
      periodicAvailable: false,
      periodicState: "UNAVAILABLE",
      reasons,
      provenance: [
        "V8 endgame allocation rules",
      ],
    };
  }

  /*
   * Endgame selection is deliberately evaluated independently
   * of the normal package slots.
   *
   * The old V8 model allows up to two one-Essence conversions.
   * We therefore select the best two distinct legal options.
   */
  const options = [
    ...pure,
    ...(periodic ? [periodic] : []),
  ];

  const selections: EndgameSelection[] = [];

  for (const option of options) {
    if (selections.length >= TOTAL_ESSENCE) {
      break;
    }

    /*
     * Do not spend both Essence on the same conversion.
     */
    const duplicate = selections.some(
      (selected) =>
        selected.kind === option.kind &&
        selected.element === option.element,
    );

    if (!duplicate) {
      selections.push(option);
    }
  }

  const spent = selections.reduce(
    (sum, selection) =>
      sum + selection.essenceCost,
    0,
  );

  const score = selections.reduce(
    (sum, selection) =>
      sum + selection.value,
    0,
  );

  const selectedTower =
    selectedTowerName(states);

  if (selectedTower) {
    reasons.push(
      `Endgame conversions are evaluated after the normal combat package (${selectedTower} selected as a primary combat reference).`,
    );
  }

  return {
    score,
    totalEssence: TOTAL_ESSENCE,
    spent,
    selected: selections,
    availablePure,
    periodicAvailable: periodic !== null,
    periodicState:
      selections.some(
        (selection) =>
          selection.kind === "Periodic",
      )
        ? "AVAILABLE"
        : periodic
          ? "AVAILABLE"
          : "UNAVAILABLE",
    reasons,
    provenance: [
      "V8 endgame allocation rules",
      "Pure Element Lv4 conversion rules",
      "Periodic six-element conversion rule",
    ],
  };
}