"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { ElementIcon, roman } from "@/components/build-lab/primitives";
import { LiveTowerIcon } from "@/components/live/LiveTowerIcon";
import { LiveDialog } from "@/components/live/LiveDialog";
import {
  isEndGameTowerId,
  liveTowerLevelLabel,
  liveTowerName,
} from "@/lib/engine/liveGame";
import { liveCoaching, type LivePlanAction } from "@/lib/engine/liveCoaching";
import { useLiveGame } from "./store";

/** Where the player last left the tracker, and whether it was collapsed. */
const PLAN_TRACKER_KEY = "etd2-live-plan-tracker";
/** Below this the float gives way to the tab-and-dialog fallback. */
const NARROW_VIEWPORT = 960;
const PANEL_WIDTH = 248;
const EDGE_MARGIN = 8;
/** Pointer travel before a press on the tab counts as a drag, not a click. */
const DRAG_THRESHOLD = 4;
const NUDGE_STEP = 16;

type Point = { x: number; y: number };
type SavedTracker = Point & { collapsed: boolean };

function readSaved(): SavedTracker | null {
  try {
    const raw = window.localStorage.getItem(PLAN_TRACKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedTracker>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y, collapsed: parsed.collapsed === true };
  } catch {
    return null;
  }
}

function writeSaved(value: SavedTracker) {
  try {
    window.localStorage.setItem(PLAN_TRACKER_KEY, JSON.stringify(value));
  } catch {
    // A remembered position is a convenience, never a requirement.
  }
}

/**
 * Where the tracker lands the first time, before the player has moved it:
 * whichever gutter beside the app is wider, or the top-right corner if
 * neither has room. Only a starting point — once dragged, the saved
 * position wins and this is never consulted again.
 */
function defaultPosition(shell: HTMLElement | null): Point {
  // Sit just under the sticky status strip, measured rather than assumed:
  // it grows a second row when a strategy is loaded, and a fixed guess
  // put the panel straight over its right-hand controls.
  const strip = shell?.querySelector<HTMLElement>(".live-strip") ?? null;
  const stripRect = strip?.getBoundingClientRect();
  const y = Math.max(
    112,
    stripRect && stripRect.height > 0 ? stripRect.bottom + 12 : 96,
  );
  const fallback = { x: window.innerWidth - PANEL_WIDTH - 16, y };
  if (!shell) return fallback;

  const rects = [
    strip,
    shell.querySelector<HTMLElement>(".live-focal"),
  ]
    .filter((el): el is HTMLElement => !!el)
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return fallback;

  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const leftGutter = left;
  const rightGutter = window.innerWidth - right;
  const needed = PANEL_WIDTH + EDGE_MARGIN * 2;

  if (rightGutter >= needed) return { x: right + EDGE_MARGIN, y };
  if (leftGutter >= needed) return { x: left - PANEL_WIDTH - EDGE_MARGIN, y };
  return fallback;
}

/** Keep the whole panel on screen, whatever the viewport does. */
function clamp(point: Point, panel: HTMLElement | null): Point {
  const width = panel?.offsetWidth || PANEL_WIDTH;
  const height = panel?.offsetHeight || 0;
  return {
    x: Math.min(
      Math.max(EDGE_MARGIN, point.x),
      Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
    ),
    y: Math.min(
      Math.max(EDGE_MARGIN, point.y),
      Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN),
    ),
  };
}

/** One planned tower: its icon, its target level, and whether it stands. */
function RosterIcon({
  action,
  assets,
}: {
  action: LivePlanAction;
  assets: BuildLabAssets;
}) {
  const verb = action.kind === "upgrade" ? "Upgrade" : "Build";
  // End Game forms have a single level; naming it is noise.
  const level = isEndGameTowerId(action.towerId)
    ? ""
    : liveTowerLevelLabel(action.towerId, action.toLevel);
  const copies = action.quantity > 1 ? ` ×${action.quantity}` : "";
  return (
    <li
      data-done={action.done || undefined}
      title={`${verb} ${action.towerName}${level ? ` ${level}` : ""}${copies}${
        action.done ? " — built" : ""
      }`}
    >
      <LiveTowerIcon towerId={action.towerId} assets={assets} size={30} />
      {action.toLevel > 1 && (
        <em className="mono" aria-hidden="true">
          {roman(action.toLevel)}
        </em>
      )}
      {action.quantity > 1 && (
        <small className="mono" aria-hidden="true">
          ×{action.quantity}
        </small>
      )}
      <i aria-hidden="true">{action.done ? "✓" : "✕"}</i>
      <span className="sr-only">
        {verb} {action.towerName}
        {level ? ` ${level}` : ""}
        {copies}
        {action.done ? ", built" : ", not yet"}
      </span>
    </li>
  );
}

function PlanMemory({
  assets,
  anchorTowerId,
  anchorName,
  source,
  action,
  actionState,
  complete,
  nextPick,
  actions,
  onOpenPlan,
}: {
  assets: BuildLabAssets;
  anchorTowerId: string;
  anchorName: string;
  source: string;
  action: ReturnType<typeof liveCoaching>["nextAction"];
  actionState: string;
  complete: boolean;
  nextPick: ReturnType<typeof liveCoaching>["nextPick"];
  actions: readonly LivePlanAction[];
  onOpenPlan?: () => void;
}) {
  const endGame = actions.filter((a) => isEndGameTowerId(a.towerId));
  const build = actions.filter((a) => !isEndGameTowerId(a.towerId));
  const done = build.filter((a) => a.done).length;
  return (
    <>
      <header className="live-build-rail-head">
        <span>{source}</span>
        <strong>Plan tracker</strong>
      </header>
      <div className="live-build-rail-anchor">
        <LiveTowerIcon towerId={anchorTowerId} assets={assets} size={22} />
        <div>
          <span>Anchor</span>
          <b>{anchorName}</b>
        </div>
      </div>
      <section
        className="live-build-rail-step"
        data-ready={
          actionState === "Build now" ||
          actionState === "Upgrade now" ||
          undefined
        }
      >
        <span>{actionState}</span>
        {action ? (
          <b>
            {action.towerName}{" "}
            {liveTowerLevelLabel(action.towerId, action.toLevel)}
          </b>
        ) : (
          <b>{complete ? "Every target logged" : "Keep the route moving"}</b>
        )}
        {action?.missing.length ? (
          <small>Needs {action.missing.slice(0, 2).join(" · ")}</small>
        ) : null}
      </section>
      {!complete && nextPick ? (
        <div className="live-build-rail-pick">
          <span>Next pick</span>
          <b>
            <ElementIcon element={nextPick.element} assets={assets} size={16} />
            Take {nextPick.element} {roman(nextPick.to)}
          </b>
        </div>
      ) : null}
      {/*
        The whole build, as icons. This is the one place in the live
        tracker that shows the roster the plan is actually aiming at,
        rather than the single next step — so a player can see at a
        glance what is standing and what is still owed. Icons only, by
        request: a check once a tower is built to its planned level, a
        cross while it is not, with the full text on hover.
      */}
      <div className="live-build-rail-roster">
        <span>
          Build{" "}
          <b className="mono">
            {done}/{build.length}
          </b>
        </span>
        <ul>
          {build.map((a) => (
            <RosterIcon
              key={`${a.towerId}-${a.toLevel}`}
              action={a}
              assets={assets}
            />
          ))}
        </ul>
        {endGame.length > 0 && (
          <>
            <span>End Game</span>
            <ul>
              {endGame.map((a) => (
                <RosterIcon key={a.towerId} action={a} assets={assets} />
              ))}
            </ul>
          </>
        )}
      </div>
      <a href="#live-plan" className="live-build-rail-open" onClick={onOpenPlan}>
        Open full plan <span aria-hidden="true">→</span>
      </a>
    </>
  );
}

/**
 * The plan, kept in view while the match runs.
 *
 * On a wide screen this is a floating card: open by default, and it stays
 * open until the player collapses it — nothing here reacts to the mouse
 * leaving or focus moving on. An earlier version expanded on hover and
 * folded itself away the moment the pointer left, which meant it vanished
 * exactly when the player looked back at the game to act on it; a "pin"
 * control existed only to fight that. The tab is now both the handle and
 * the toggle: press and move to drag it anywhere, click to collapse or
 * restore, arrow keys to nudge. It is translucent so it can sit over the
 * page without hiding what is under it, and firms up while in use.
 *
 * Narrow viewports keep the tab-and-dialog fallback — a draggable float
 * on a phone is worse than a proper sheet.
 */
export function BuildLabTracker({ assets }: { assets: BuildLabAssets }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const plan = useLiveGame((s) => s.plan);
  const allocation = useLiveGame((s) => s.allocation);
  const built = useLiveGame((s) => s.built);
  const holds = useLiveGame((s) => s.holds);

  const [narrow, setNarrow] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const drag = useRef<{
    pointerId: number;
    start: Point;
    origin: Point;
    moved: boolean;
  } | null>(null);

  const coaching = useMemo(
    () => liveCoaching(plan, allocation, built, holds),
    [plan, allocation, built, holds],
  );

  const persist = useCallback((next: Point, isCollapsed: boolean) => {
    writeSaved({ ...next, collapsed: isCollapsed });
  }, []);

  // Viewport mode, and the starting position the first time this mounts
  // wide. Re-clamps on resize so a remembered position from a bigger
  // window never leaves the panel off screen.
  useEffect(() => {
    const shell =
      rootRef.current?.closest<HTMLElement>(".live-shell") ?? null;
    const saved = readSaved();
    if (saved) setCollapsed(saved.collapsed);

    const update = () => {
      const isNarrow = window.innerWidth < NARROW_VIEWPORT;
      setNarrow(isNarrow);
      if (isNarrow) return;
      setPosition((current) =>
        clamp(current ?? saved ?? defaultPosition(shell), rootRef.current),
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
    // Plan changes can change the shell's layout, which moves the default.
  }, [plan]);

  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      if (position) persist(position, next);
      return next;
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (narrow || !position || event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: position,
      moved: false,
    };
    // Optional chaining: jsdom has no pointer capture, browsers do.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.start.x;
    const dy = event.clientY - state.start.y;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      setDragging(true);
    }
    setPosition(
      clamp(
        { x: state.origin.x + dx, y: state.origin.y + dy },
        rootRef.current,
      ),
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (state.moved) {
      setDragging(false);
      // A drag is a move, not a click — save where it landed and stop.
      setPosition((current) => {
        if (current) persist(current, collapsed);
        return current;
      });
      return;
    }
    toggleCollapsed();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (narrow || !position) return;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -NUDGE_STEP, y: 0 },
      ArrowRight: { x: NUDGE_STEP, y: 0 },
      ArrowUp: { x: 0, y: -NUDGE_STEP },
      ArrowDown: { x: 0, y: NUDGE_STEP },
    };
    const step = delta[event.key];
    if (!step) return;
    event.preventDefault();
    const next = clamp(
      { x: position.x + step.x, y: position.y + step.y },
      rootRef.current,
    );
    setPosition(next);
    persist(next, collapsed);
  };

  if (!plan) return null;
  const action = coaching.nextAction ?? coaching.blockedAction;
  const actionState = coaching.nextAction
    ? coaching.nextAction.kind === "upgrade"
      ? "Upgrade now"
      : "Build now"
    : action
      ? "Blocked"
      : coaching.complete
        ? "Complete"
        : "In progress";
  const source = plan.source === "engine" ? "Build Lab" : "Theory Craft";
  let anchorName = plan.anchorTowerId;
  try {
    anchorName = liveTowerName(plan.anchorTowerId);
  } catch {
    // A legacy plan with a removed tower remains readable and removable.
  }

  const memory = (
    <PlanMemory
      assets={assets}
      anchorTowerId={plan.anchorTowerId}
      anchorName={anchorName}
      source={source}
      action={action}
      actionState={actionState}
      complete={coaching.complete}
      nextPick={coaching.nextPick}
      actions={coaching.actions}
      onOpenPlan={() => setDrawerOpen(false)}
    />
  );

  const expanded = narrow ? drawerOpen : !collapsed;

  return (
    <>
      <div
        ref={rootRef}
        className="live-plan-dock"
        data-mode={narrow ? "drawer" : "float"}
        data-collapsed={(!narrow && collapsed) || undefined}
        data-dragging={dragging || undefined}
        style={
          narrow || !position
            ? undefined
            : { left: position.x, top: position.y }
        }
      >
        <button
          type="button"
          className="live-plan-tab"
          aria-expanded={expanded}
          aria-controls="live-plan-memory"
          title={
            narrow
              ? undefined
              : "Drag to move · click to show or hide · arrow keys to nudge"
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            // Pointer events own the wide-screen mouse path; click is for
            // the narrow dialog and for keyboard activation (detail 0).
            if (narrow) setDrawerOpen(true);
            else if (event.detail === 0) toggleCollapsed();
          }}
        >
          {narrow ? (
            <span className="live-plan-glyph" aria-hidden="true">
              ⌁
            </span>
          ) : (
            <span className="live-plan-grip" aria-hidden="true">
              ⠿
            </span>
          )}
          Plan
          {!narrow && (
            <span className="live-plan-tab-hint" aria-hidden="true">
              {collapsed ? "show" : "hide"}
            </span>
          )}
        </button>
        {!narrow && !collapsed && (
          <aside
            id="live-plan-memory"
            className="live-build-rail"
            aria-label="Build Lab tracker"
          >
            {memory}
          </aside>
        )}
      </div>
      {narrow && drawerOpen && (
        <LiveDialog title="Plan tracker" onCancel={() => setDrawerOpen(false)}>
          <div
            id="live-plan-memory"
            className="live-build-rail live-build-rail-drawer"
          >
            {memory}
          </div>
          <button
            type="button"
            className="secondary-button live-build-rail-close"
            onClick={() => setDrawerOpen(false)}
          >
            Close plan tracker
          </button>
        </LiveDialog>
      )}
    </>
  );
}
