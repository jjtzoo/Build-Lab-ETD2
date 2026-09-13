"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { gold, roman } from "@/components/build-lab/primitives";
import {
  builtRowKey,
  deriveGoldSpent,
  isTowerLoggable,
  liveTowerName,
  liveTowerLevelLabel,
  liveTowerReachableLevel,
  resolveLiveTowerCost,
  staleFieldRows,
} from "@/lib/engine/liveGame";
import {
  canEvolveInto,
  evolutionCost,
  evolutionTargets,
} from "@/lib/domain/towerEvolution";
import { getTower } from "@/lib/domain/towerCatalog";
import {
  CORE_ROLE_LABEL,
  CORE_ROLE_PRIORITY,
  SUPPORT_ROLE_LABEL,
} from "@/lib/domain/roles";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";
import { useLiveGame } from "@/components/live/store";
import { liveAvailability } from "@/lib/engine/liveAvailability";
import { liveBuildBlock } from "@/lib/engine/liveAvailability";
import { isMonoTowerId } from "@/lib/domain/auxiliaryTowers";
import { LiveDialog } from "./LiveDialog";
import {
  followsFinalForm,
  placementDestinations,
  placementKey,
} from "@/lib/engine/livePlacement";
import { liveCoaching, type LivePlanAction } from "@/lib/engine/liveCoaching";

function rowCost(towerId: string, level: number, quantity: number): number {
  return resolveLiveTowerCost(towerId, level) * quantity;
}

/**
 * Combination class, recipe size and level ceiling for a catalog tower.
 * Mono and basic towers aren't in that catalog — an Arrow's evolution
 * targets are monos — so this answers `null` rather than throwing.
 */
function towerFacts(towerId: string): {
  combination: string;
  recipeLength: number;
  maxLevel: number;
} | null {
  try {
    const tower = getTower(towerId);
    return {
      combination: tower.combination,
      recipeLength: tower.recipe.length,
      maxLevel: tower.maxLevel,
    };
  } catch {
    return null;
  }
}

type FieldPlanPriority = {
  rank: number;
  label: string | null;
};

/**
 * A field row can be useful before it is the tower named by the plan.  For
 * example, a Water mono can earn now and later become the planned Trio.
 * Only rank that row when its evolution tree reaches a remaining plan action
 * and respects any final-form intent already locked to a placed copy.
 */
function priorityForPlan(
  towerId: string,
  level: number,
  actions: readonly LivePlanAction[],
  finalForms: readonly { towerId: string; level: number }[],
): FieldPlanPriority {
  const destinations = placementDestinations(towerId, level);
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (action.done) continue;
    const feedsAction = destinations.some(
      (destination) =>
        destination.tower.id === action.towerId &&
        destination.level >= action.toLevel,
    );
    const respectsFinalForms = finalForms.every((finalForm) =>
      followsFinalForm(action.towerId, action.toLevel, finalForm),
    );
    if (!feedsAction || !respectsFinalForms) continue;

    const direct = towerId === action.towerId;
    return {
      rank: index * 10 + (direct ? 0 : 1),
      label: direct
        ? index === 0
          ? "Next upgrade"
          : `Plan step ${index + 1}`
        : `Feeds ${action.towerName} ${roman(action.toLevel)}`,
    };
  }
  return { rank: Number.POSITIVE_INFINITY, label: null };
}

/**
 * What the player has on the field. Rows are per tower **and** level, so a
 * pair of Light I sits beside a Light II. Gold is derived, never typed.
 * Logging a tower off the summon moment happens through the search here —
 * no wall of chips.
 */
export function FieldPanel({ assets }: { assets: BuildLabAssets }) {
  const built = useLiveGame((s) => s.built);
  const allocation = useLiveGame((s) => s.allocation);
  const addBuilt = useLiveGame((s) => s.addBuilt);
  const setBuiltLevel = useLiveGame((s) => s.setBuiltLevel);
  const setBuiltQuantity = useLiveGame((s) => s.setBuiltQuantity);
  const removeBuilt = useLiveGame((s) => s.removeBuilt);
  const evolveBuilt = useLiveGame((s) => s.evolveBuilt);
  const holds = useLiveGame((s) => s.holds);
  const placements = useLiveGame((s) => s.placements);
  const history = useLiveGame((s) => s.evolutionHistory);
  const undoEvolution = useLiveGame((s) => s.undoEvolution);
  const clearFinalForm = useLiveGame((s) => s.clearFinalForm);
  const plan = useLiveGame((s) => s.plan);
  const [selectedCopies, setSelectedCopies] = useState<Record<string, string>>(
    {},
  );
  const reduce = useReducedMotion();

  const [evolving, setEvolving] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{
    towerId: string;
    level: number;
  } | null>(null);
  const deletingRow =
    deleting &&
    built.find(
      (entry) =>
        entry.towerId === deleting.towerId && entry.level === deleting.level,
    );

  const goldSpent = useMemo(() => deriveGoldSpent(built), [built]);
  const towerCount = built.reduce((total, entry) => total + entry.quantity, 0);
  const staleKeys = useMemo(
    () =>
      new Set(
        staleFieldRows(allocation, built).map((entry) =>
          builtRowKey(entry.towerId, entry.level),
        ),
      ),
    [allocation, built],
  );

  const catalog = useMemo(
    () => liveAvailability(allocation, holds, built),
    [allocation, holds, built],
  );
  const coaching = useMemo(
    () => liveCoaching(plan, allocation, built, holds),
    [plan, allocation, built, holds],
  );
  const orderedBuilt = useMemo(
    () =>
      built
        .map((entry, originalIndex) => {
          const finalForms = placements
            .filter(
              (placement) =>
                placement.towerId === entry.towerId &&
                placement.level === entry.level &&
                placement.finalForm,
            )
            .map((placement) => placement.finalForm!);
          return {
            entry,
            originalIndex,
            priority: priorityForPlan(
              entry.towerId,
              entry.level,
              coaching.actions,
              finalForms,
            ),
          };
        })
        .sort(
          (a, b) =>
            a.priority.rank - b.priority.rank ||
            a.originalIndex - b.originalIndex,
        ),
    [built, coaching.actions, placements],
  );
  /**
   * The log list as a grouped dropdown rather than a text search.
   *
   * Typing a name is the wrong interaction here: the tracker already
   * knows exactly which towers this allocation can field, so asking the
   * player to recall and spell one mid-match is work the app can do
   * itself. Grouped by the role each tower fills, in the same priority
   * order the plan uses, so the list reads as "what can I put in this
   * slot" rather than as an alphabet.
   */
  const groups = useMemo(() => {
    const buckets: { key: string; label: string; towers: typeof catalog }[] =
      [];
    const push = (key: string, label: string, towers: typeof catalog) => {
      if (towers.length > 0) buckets.push({ key, label, towers });
    };

    push(
      "basic",
      "Arrow & Cannon",
      catalog.filter((t) => t.group === "basic"),
    );
    push(
      "mono",
      "Mono I–III",
      catalog.filter((t) => t.group === "mono"),
    );
    for (const role of [...CORE_ROLE_PRIORITY, "support"] as const) {
      push(
        role,
        role === "support" ? SUPPORT_ROLE_LABEL : CORE_ROLE_LABEL[role],
        catalog.filter((t) => t.group === "element" && t.role === role),
      );
    }
    // Anything the role pass didn't claim, so nothing silently vanishes.
    push(
      "other",
      "Other",
      catalog.filter((t) => t.group === "element" && t.role === null),
    );
    push(
      "end-game",
      "End Game",
      catalog.filter((t) => t.group === "end-game"),
    );
    return buckets;
  }, [catalog]);

  return (
    <motion.section
      className="live-field"
      aria-label="Your field"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="live-panel-head">
        <h2>Your field</h2>
        <span className="live-panel-note">
          {towerCount} tower{towerCount === 1 ? "" : "s"} ·{" "}
          <b className="mono">{gold(goldSpent)}</b>
        </span>
      </header>

      <div className="live-log">
        <select
          className="live-log-select"
          value=""
          aria-label="Log a tower onto your field"
          disabled={catalog.length === 0}
          onChange={(event) => {
            if (event.target.value) addBuilt(event.target.value, 1);
          }}
        >
          <option value="">
            {catalog.length === 0
              ? "no towers available yet — spend a pick first"
              : "＋ log a tower"}
          </option>
          {groups.map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.towers.map((tower) => (
                <option
                  key={tower.id}
                  value={tower.id}
                  disabled={!!tower.blockedReason}
                >
                  {tower.name}
                  {tower.maxLevel > 1 ? ` · to ${roman(tower.maxLevel)}` : ""}
                  {tower.blockedReason ? ` · ${tower.blockedReason}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {history.length > 0 && (
        <button type="button" className="live-undo" onClick={undoEvolution}>
          Undo evolution · {history.length} step
          {history.length === 1 ? "" : "s"}
        </button>
      )}
      {deletingRow && (
        <LiveDialog
          title={`Delete ${liveTowerName(deletingRow.towerId)} ${liveTowerLevelLabel(deletingRow.towerId, deletingRow.level)}?`}
          onCancel={() => setDeleting(null)}
        >
          <p>
            Remove all {deletingRow.quantity}{" "}
            {deletingRow.quantity === 1 ? "copy" : "copies"} and{" "}
            {
              placements.filter(
                (p) =>
                  p.towerId === deletingRow.towerId &&
                  p.level === deletingRow.level,
              ).length
            }{" "}
            map placements from this row?
          </p>
          <div className="live-dialog-actions">
            <button
              type="button"
              className="secondary-button"
              autoFocus
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                removeBuilt(deletingRow.towerId, deletingRow.level);
                setDeleting(null);
              }}
            >
              Delete tower row
            </button>
          </div>
        </LiveDialog>
      )}

      {built.length === 0 ? (
        <p className="live-empty">
          Nothing logged yet — use the summon chips or the search above.
        </p>
      ) : (
        <ul className="live-field-list">
          {orderedBuilt.map(({ entry, priority }) => {
            const key = builtRowKey(entry.towerId, entry.level);
            const copies = placements.filter(
              (p) => p.towerId === entry.towerId && p.level === entry.level,
            );
            const hasUnplaced = entry.quantity > copies.length;
            const selectedCopy =
              copies.find((p) => placementKey(p) === selectedCopies[key]) ??
              (hasUnplaced ? undefined : copies[0]);
            const copyKey = selectedCopy
              ? placementKey(selectedCopy)
              : undefined;
            const finalForm = selectedCopy?.finalForm;
            const stale = staleKeys.has(key);
            // Cap the level buttons at what the picks support — but never
            // below this row's own level, so a stale row can still be
            // corrected downward.
            const max = Math.max(
              entry.level,
              liveTowerReachableLevel(entry.towerId, allocation),
            );
            const name = liveTowerName(entry.towerId);
            // What this tower can grow into, and the gap to get there —
            // evolving deducts what it already cost, so the total is the
            // same as fielding the target outright.
            const evolveOptions = evolutionTargets(entry.towerId, entry.level)
              .filter(
                (step) =>
                  followsFinalForm(step.towerId, step.level, finalForm) &&
                  isTowerLoggable(step.towerId, allocation) &&
                  liveTowerReachableLevel(step.towerId, allocation) >=
                    step.level,
              )
              .map((step) => {
                const target = towerFacts(step.towerId);
                return {
                  towerId: step.towerId,
                  level: step.level,
                  combination: target?.combination ?? null,
                  recipeLength: target?.recipeLength ?? 1,
                  maxLevel: target?.maxLevel ?? step.level,
                  extraCost: evolutionCost(
                    { towerId: entry.towerId, level: entry.level },
                    step,
                  ),
                };
              });

            /**
             * Split by combination class, because the two tiers behave
             * differently and the price alone doesn't say so: a Trio takes
             * the level straight across and still has a level left in it,
             * while a Quad is one element further out and caps at I.
             */
            const sourceRecipeLength =
              towerFacts(entry.towerId)?.recipeLength ??
              (isMonoTowerId(entry.towerId) ? 1 : 0);
            const evolveGroups = (["Dual", "Trio", "Quad", null] as const)
              .map((combination) => ({
                combination,
                options: evolveOptions.filter(
                  (option) => option.combination === combination,
                ),
              }))
              .filter((group) => group.options.length > 0);
            return (
              <motion.li
                key={key}
                className="live-field-row"
                data-stale={stale || undefined}
                data-on-plan={priority.label ? true : undefined}
                layout={reduce ? false : "position"}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 440, damping: 34 }
                }
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(key)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setFocused(null);
                }}
              >
                <LiveTowerIcon
                  towerId={entry.towerId}
                  assets={assets}
                  size={26}
                />
                <span className="live-field-name">
                  {name}
                  {priority.label && (
                    <span className="live-field-plan-queue">
                      {priority.label}
                    </span>
                  )}
                  {stale && (
                    <span
                      className="live-field-stale"
                      title="Not reachable at your current picks"
                    >
                      out of reach
                    </span>
                  )}
                </span>

                {max > 1 ? (
                  <span
                    className="live-level-group"
                    role="group"
                    aria-label={`${name} level`}
                  >
                    {Array.from({ length: max }, (_, i) => i + 1).map(
                      (level) => (
                        <button
                          key={level}
                          type="button"
                          className="live-level"
                          data-on={entry.level === level || undefined}
                          onClick={() =>
                            setBuiltLevel(
                              entry.towerId,
                              entry.level,
                              level,
                              copyKey,
                            )
                          }
                          aria-pressed={entry.level === level}
                          title={`Set one ${name} to level ${roman(level)}`}
                          disabled={
                            !followsFinalForm(
                              entry.towerId,
                              level,
                              finalForm,
                            ) ||
                            (level > entry.level &&
                              level >
                                liveTowerReachableLevel(
                                  entry.towerId,
                                  allocation,
                                ))
                          }
                        >
                          {roman(level)}
                        </button>
                      ),
                    )}
                  </span>
                ) : (
                  <span className="live-level-fixed mono">
                    {liveTowerLevelLabel(entry.towerId, entry.level)}
                  </span>
                )}

                <span className="live-qty">
                  <button
                    type="button"
                    onClick={() =>
                      entry.quantity === 1
                        ? setDeleting(entry)
                        : setBuiltQuantity(
                            entry.towerId,
                            entry.level,
                            entry.quantity - 1,
                          )
                    }
                    aria-label={`One fewer ${name}`}
                  >
                    −
                  </button>
                  <b className="mono" aria-label={`${entry.quantity} copies`}>
                    ×{entry.quantity}
                  </b>
                  <button
                    type="button"
                    onClick={() =>
                      setBuiltQuantity(
                        entry.towerId,
                        entry.level,
                        entry.quantity + 1,
                      )
                    }
                    aria-label={`One more ${name}`}
                    disabled={
                      !!liveBuildBlock(
                        entry.towerId,
                        allocation,
                        holds,
                        built,
                      ) ||
                      liveTowerReachableLevel(entry.towerId, allocation) <
                        entry.level
                    }
                    title={
                      liveBuildBlock(entry.towerId, allocation, holds, built) ??
                      undefined
                    }
                  >
                    +
                  </button>
                </span>

                <span className="mono live-field-cost">
                  {gold(rowCost(entry.towerId, entry.level, entry.quantity))}
                </span>

                <button
                  type="button"
                  className="live-field-remove"
                  onClick={() => setDeleting(entry)}
                  aria-label={`Remove ${name} ${liveTowerLevelLabel(entry.towerId, entry.level)}`}
                >
                  ✕
                </button>

                {copies.length > 0 && (
                  <div className="live-field-intent">
                    <select
                      aria-label={`Choose ${name} copy`}
                      value={copyKey ?? ""}
                      onChange={(e) =>
                        setSelectedCopies((old) => ({
                          ...old,
                          [key]: e.target.value,
                        }))
                      }
                    >
                      {hasUnplaced && (
                        <option value="">Unplaced copy · no locked path</option>
                      )}
                      {copies.map((copy) => (
                        <option
                          key={placementKey(copy)}
                          value={placementKey(copy)}
                        >
                          {copy.mapId} · {copy.col + 1},{copy.row + 1}
                          {copy.finalForm
                            ? ` → ${liveTowerName(copy.finalForm.towerId)} ${liveTowerLevelLabel(copy.finalForm.towerId, copy.finalForm.level)}`
                            : " · open path"}
                        </option>
                      ))}
                    </select>
                    {finalForm && (
                      <small>
                        Locked path → {liveTowerName(finalForm.towerId)}{" "}
                        {liveTowerLevelLabel(
                          finalForm.towerId,
                          finalForm.level,
                        )}{" "}
                        <button
                          type="button"
                          onClick={() => clearFinalForm(copyKey!)}
                        >
                          Unlock path
                        </button>
                      </small>
                    )}
                  </div>
                )}
                {evolveOptions.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="live-field-evolve"
                      data-on={evolving === key || undefined}
                      onClick={() => setEvolving(evolving === key ? null : key)}
                      aria-expanded={
                        evolving === key || hovered === key || focused === key
                      }
                      aria-label={`Evolution line for ${name} — ${evolveOptions.length} option${
                        evolveOptions.length === 1 ? "" : "s"
                      }`}
                    >
                      <span aria-hidden="true">⟶</span>
                      evolution line
                      <span className="mono live-field-evolve-count">
                        {evolveOptions.length}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {(evolving === key ||
                        hovered === key ||
                        focused === key) && (
                        <motion.ul
                          className="live-evolve-menu"
                          initial={reduce ? false : { opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{
                            duration: reduce ? 0 : 0.4,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          {evolveGroups.map((group) => {
                            const sample = group.options[0];
                            const step =
                              sourceRecipeLength > 0 && sample.recipeLength > 0
                                ? sample.recipeLength - sourceRecipeLength
                                : 0;
                            const headroom =
                              sample.maxLevel > sample.level
                                ? `keeps ${roman(sample.level)}, upgrades to ${roman(sample.maxLevel)}`
                                : `final form at ${roman(sample.level)}`;
                            return (
                              <li
                                key={group.combination ?? "other"}
                                className="live-evolve-group"
                              >
                                {group.combination && (
                                  <span className="live-evolve-group-head">
                                    <b>{group.combination}</b>
                                    {step > 0 && (
                                      <>
                                        {" "}
                                        · +{step} element
                                        {step === 1 ? "" : "s"}
                                      </>
                                    )}{" "}
                                    · {headroom}
                                  </span>
                                )}
                                <ul>
                                  {group.options.map((option) => (
                                    <li key={option.towerId}>
                                      <button
                                        type="button"
                                        onMouseEnter={() =>
                                          setPreview(option.towerId)
                                        }
                                        onFocus={() =>
                                          setPreview(option.towerId)
                                        }
                                        onMouseLeave={() => setPreview(null)}
                                        onBlur={() => setPreview(null)}
                                        data-related={
                                          (preview
                                            ? canEvolveInto(
                                                preview,
                                                option.towerId,
                                                entry.level,
                                              )
                                            : option.recipeLength ===
                                              sourceRecipeLength + 1) ||
                                          undefined
                                        }
                                        onClick={() => {
                                          evolveBuilt(
                                            entry.towerId,
                                            entry.level,
                                            option.towerId,
                                            copyKey,
                                          );
                                          setEvolving(null);
                                        }}
                                      >
                                        <LiveTowerIcon
                                          towerId={option.towerId}
                                          assets={assets}
                                          size={20}
                                        />
                                        <span>
                                          {liveTowerName(option.towerId)}
                                        </span>
                                        <span className="live-log-max mono">
                                          +{gold(option.extraCost)}
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            );
                          })}
                          {preview && (
                            <li className="live-evolve-preview">
                              <span className="live-evolve-group-head">
                                Next from {liveTowerName(preview)}
                              </span>
                              <div className="live-map-chiprow">
                                {evolutionTargets(preview, entry.level)
                                  .filter(
                                    (step) =>
                                      followsFinalForm(
                                        step.towerId,
                                        step.level,
                                        finalForm,
                                      ) &&
                                      liveTowerReachableLevel(
                                        step.towerId,
                                        allocation,
                                      ) >= step.level &&
                                      isTowerLoggable(step.towerId, allocation),
                                  )
                                  .filter((step, _, candidates) => {
                                    const minimum = Math.min(
                                      ...candidates.map(
                                        (candidate) =>
                                          towerFacts(candidate.towerId)
                                            ?.recipeLength ?? 1,
                                      ),
                                    );
                                    return (
                                      (towerFacts(step.towerId)?.recipeLength ??
                                        1) === minimum
                                    );
                                  })
                                  .map((step) => (
                                    <span
                                      className="live-map-chip"
                                      data-on
                                      key={step.towerId}
                                    >
                                      <LiveTowerIcon
                                        towerId={step.towerId}
                                        assets={assets}
                                        size={18}
                                      />
                                      {liveTowerName(step.towerId)}
                                    </span>
                                  ))}
                              </div>
                            </li>
                          )}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
