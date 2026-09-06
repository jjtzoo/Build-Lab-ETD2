import type {
  TowerId,
} from "@/lib/domain/tower";

import type {
  AnchorRouteState,
} from "@/lib/engine/anchorRouteStates";

import type {
  CoreRoleFeasibility,
  CoreRoleLevelCandidate,
} from "@/lib/engine/coreRoleDetection";

export type SupportCoreRole =
  Exclude<
    CoreRoleFeasibility["role"],
    "main-dps"
  >;

export type CorePackageRoleEvidence = {
  role: SupportCoreRole;

  /**
   * Selected towers in this package that
   * can satisfy this role.
   *
   * Usually one today, but kept as an array
   * so future multi-role profiles remain valid.
   */
  candidates:
    readonly CoreRoleLevelCandidate[];

  developed: boolean;
};

export type CorePackageCandidate = {
  anchorTowerId: TowerId;

  /**
   * Support towers actually selected into
   * this minimum core package.
   *
   * These are NOT every available tower.
   */
  supportTowerIds: readonly TowerId[];

  /**
   * Anchor + selected support towers.
   */
  selectedTowerIds: readonly TowerId[];

  /**
   * Role evidence produced only from the
   * towers actually selected in this package.
   */
  roles: readonly CorePackageRoleEvidence[];

  /**
   * True when every support role has a selected
   * candidate at its desired development depth.
   */
  coreDeveloped: boolean;
};

const SUPPORT_ROLE_ORDER:
  readonly SupportCoreRole[] = [
    "slow",
    "damage-amp",
    "buff",
  ];

function getRoleStatus(
  state: AnchorRouteState,
  role: SupportCoreRole,
): CoreRoleFeasibility {
  const status =
    state.roleFeasibility.find(
      (entry) => entry.role === role,
    );

  if (!status) {
    throw new Error(
      `Missing core role status: ${role}`,
    );
  }

  return status;
}

function uniqueTowerIds(
  towerIds: readonly TowerId[],
): TowerId[] {
  return [...new Set(towerIds)];
}

function packageKey(
  towerIds: readonly TowerId[],
): string {
  return [...towerIds]
    .sort()
    .join("|");
}

function buildRoleEvidence(
  state: AnchorRouteState,
  selectedSupportTowerIds:
    readonly TowerId[],
): readonly CorePackageRoleEvidence[] {
  const selected =
    new Set(selectedSupportTowerIds);

  return SUPPORT_ROLE_ORDER.map(
    (role) => {
      const status =
        getRoleStatus(
          state,
          role,
        );

      const candidates =
        status.candidates.filter(
          (candidate) =>
            selected.has(
              candidate.towerId,
            ),
        );

      return {
        role,
        candidates,
        developed:
          candidates.some(
            (candidate) =>
              candidate.atTargetLevel,
          ),
      };
    },
  );
}

/**
 * Enumerates minimum selected core packages for
 * one legal anchor route state.
 *
 * The selected anchor is fixed.
 *
 * Slow, Damage Amp and Buff candidates are chosen
 * from the state's role-feasibility evidence.
 *
 * Availability is therefore converted into actual
 * package selections here rather than treating every
 * unlocked tower as selected.
 */
export function getCorePackageCandidates(
  state: AnchorRouteState,
): readonly CorePackageCandidate[] {
  if (!state.anchorSatisfied) {
    return [];
  }

  const slow =
    getRoleStatus(
      state,
      "slow",
    ).candidates;

  const damageAmp =
    getRoleStatus(
      state,
      "damage-amp",
    ).candidates;

  const buff =
    getRoleStatus(
      state,
      "buff",
    ).candidates;

  if (
    slow.length === 0 ||
    damageAmp.length === 0 ||
    buff.length === 0
  ) {
    return [];
  }

  const packages =
    new Map<
      string,
      CorePackageCandidate
    >();

  for (
    const slowCandidate
    of slow
  ) {
    for (
      const ampCandidate
      of damageAmp
    ) {
      for (
        const buffCandidate
        of buff
      ) {
        const supportTowerIds =
          uniqueTowerIds([
            slowCandidate.towerId,
            ampCandidate.towerId,
            buffCandidate.towerId,
          ]);

        const key =
          packageKey(
            supportTowerIds,
          );

        if (packages.has(key)) {
          continue;
        }

        const roles =
          buildRoleEvidence(
            state,
            supportTowerIds,
          );

        /*
         * A package is only valid if its actually
         * selected towers satisfy all three support
         * roles.
         *
         * This matters if multi-role profiles are
         * introduced later.
         */
        const coversEveryRole =
          roles.every(
            (role) =>
              role.candidates.length > 0,
          );

        if (!coversEveryRole) {
          continue;
        }

        packages.set(
          key,
          {
            anchorTowerId:
              state.anchorTowerId,

            supportTowerIds,

            selectedTowerIds:
              uniqueTowerIds([
                state.anchorTowerId,
                ...supportTowerIds,
              ]),

            roles,

            coreDeveloped:
              roles.every(
                (role) =>
                  role.developed,
              ),
          },
        );
      }
    }
  }

  return [...packages.values()];
}

/**
 * Stronger subset where Slow, Damage Amp and Buff
 * are all developed to their desired role depth.
 */
export function getDevelopedCorePackageCandidates(
  state: AnchorRouteState,
): readonly CorePackageCandidate[] {
  return getCorePackageCandidates(
    state,
  ).filter(
    (candidate) =>
      candidate.coreDeveloped,
  );
}