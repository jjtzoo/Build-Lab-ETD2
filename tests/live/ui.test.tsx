// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import { FieldPanel } from "@/components/live/FieldPanel";
import { MapPanel } from "@/components/live/MapPanel";
import { AvailabilityPanel } from "@/components/live/AvailabilityPanel";
import { LiveTracker } from "@/components/live/LiveTracker";
import { BuildLabTracker } from "@/components/live/BuildLabTracker";
import { PlanPanel } from "@/components/live/PlanPanel";
import { StrategyStatus } from "@/components/live/StrategyStatus";
import { useLiveGame } from "@/components/live/store";
import { emptyLiveAllocation } from "@/lib/engine/liveGame";
import {
  PENDING_IMPORT_KEY,
  type PortableBuild,
} from "@/lib/domain/portableBuild";
import { LIVE_STORAGE_KEY } from "@/lib/domain/liveImport";
import { getMap } from "@/lib/domain/mapCatalog";
import { getTower } from "@/lib/domain/towerCatalog";
import { rankPlacements } from "@/lib/engine/placementValue";
import { resolveTowerContribution } from "@/lib/engine/resolvedTowerContribution";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));
vi.mock("@/components/live/LiveTowerIcon", () => ({
  LiveTowerIcon: ({ towerId }: { towerId: string }) => (
    <span data-icon={towerId} />
  ),
}));
vi.mock("@/components/build-lab/LabChrome", () => ({
  LabHeader: () => null,
  LabFooter: () => null,
}));
const assets = {
  elements: {},
  towerForms: {},
  towerIcons: {},
  endGameForms: {},
  towerHero: {},
} as BuildLabAssets;
const allocation = {
  ...emptyLiveAllocation(),
  Water: 2,
  Fire: 2,
  Earth: 2,
  Darkness: 2,
};
const plan: PortableBuild = {
  schema: "etd2-build/2",
  source: "theorycraft",
  anchorTowerId: "haste",
  towers: [{ towerId: "haste", level: 2 }],
  allocation,
  createdAt: "2026-09-13",
};

beforeEach(() => {
  useLiveGame.getState().newGame();
  useLiveGame.getState().setPlan(null);
  useLiveGame.getState().hydrate({ allocation });
  window.localStorage.clear();
  window.history.replaceState(null, "", "/live");
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

describe("live field controls", () => {
  it("confirms all copies and placements before deleting a row", () => {
    const state = useLiveGame.getState();
    state.addBuilt("haste", 1);
    state.addBuilt("haste", 1);
    state.placeTower("forest", "haste", 1, 3, 3);
    render(<FieldPanel assets={assets} />);
    expect(screen.getByLabelText("2 copies")).toHaveTextContent("×2");
    fireEvent.click(screen.getByRole("button", { name: "Remove Haste I" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Remove all 2 copies and 1 map placements",
    );
    expect(useLiveGame.getState().built[0].quantity).toBe(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(useLiveGame.getState().built[0].quantity).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove Haste I" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete tower row" }));
    expect(useLiveGame.getState().built).toEqual([]);
    expect(useLiveGame.getState().placements).toEqual([]);
  });
  it("reveals eligible evolution choices on hover and supports undo", () => {
    useLiveGame.getState().addBuilt("vapor", 1);
    render(<FieldPanel assets={assets} />);
    fireEvent.mouseEnter(screen.getByText("Vapor").closest("li")!);
    expect(screen.getByRole("button", { name: /Haste/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Windstorm/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Haste/ }));
    fireEvent.click(screen.getByRole("button", { name: /Undo evolution/ }));
    expect(useLiveGame.getState().built[0].towerId).toBe("vapor");
  });
  it("logs Mono I or II directly from availability and renders Pure safely", () => {
    render(<AvailabilityPanel assets={assets} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Water II" }));
    expect(useLiveGame.getState().built[0]).toEqual({
      towerId: "mono-water",
      level: 2,
      quantity: 1,
    });
    cleanup();
    useLiveGame
      .getState()
      .hydrate({ built: [{ towerId: "pure-water", level: 1, quantity: 1 }] });
    expect(() => render(<FieldPanel assets={assets} />)).not.toThrow();
  });
  it("keeps the map field chip deletion in sync with its tower-log row", () => {
    useLiveGame.getState().addBuilt("cannon", 1);
    useLiveGame.getState().placeTower("forest", "cannon", 1, 3, 3);
    render(<MapPanel assets={assets} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Cannon I from your field",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("1 copy");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(useLiveGame.getState().built).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Cannon I from your field",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete tower row" }));
    expect(useLiveGame.getState().built).toEqual([]);
    expect(useLiveGame.getState().placements).toEqual([]);
  });
});

describe("placement origin and final form", () => {
  it("orders final-form choices by Mono, Dual, Trio, then Quad", () => {
    useLiveGame.getState().spendPick("Nature");
    useLiveGame.getState().addBuilt("mono-nature", 1);
    const { container } = render(<MapPanel assets={assets} />);
    const list = container.querySelector<HTMLElement>(
      ".live-map-destination-list",
    )!;
    expect(
      within(list)
        .getAllByRole("heading", { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(["Mono", "Dual", "Trio", "Quad"]);
  });
  it("puts evolution branches for the loaded plan ahead of unrelated monos", () => {
    useLiveGame.getState().setPlan(plan);
    useLiveGame.getState().addBuilt("arrow", 1);
    render(<MapPanel assets={assets} />);
    const mono = within(
      screen.getByRole("region", { name: "Mono final forms" }),
    ).getAllByRole("button");
    expect(mono.slice(0, 2).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Water"),
      expect.stringContaining("Water"),
    ]);
  });
  it("scores Muck II or Crystal Spire while placing the owned Muck I, then arms a duplicate", () => {
    useLiveGame.getState().addBuilt("muck", 1);
    const { container } = render(<MapPanel assets={assets} />);
    fireEvent.click(screen.getByRole("button", { name: "Score for Muck II" }));
    expect(container.querySelector(".live-map-selection")).toHaveTextContent(
      "placing Muck I; scoring Muck II",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Score for Crystal Spire I" }),
    );
    expect(container.querySelector(".live-map-selection")).toHaveTextContent(
      "placing Muck I; scoring Crystal Spire I",
    );
    const tower = getTower("crystal-spire");
    const best = rankPlacements({
      map: getMap("forest"),
      mode: "standard",
      towerId: "crystal-spire",
      rangeUnits: tower.stats.range,
      baseDps: resolveTowerContribution("crystal-spire", 1).factualStatsAtLevel
        .baseDps,
      placed: [],
      occupied: [],
      topN: 6,
    });
    const first = container.querySelector('polygon[data-rank="0"]')!;
    fireEvent.click(first);
    expect(useLiveGame.getState().placements).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm placement" }));
    expect(screen.queryByRole("button", { name: "Cancel preview" })).toBeNull();
    expect(useLiveGame.getState().placements[0]).toMatchObject({
      towerId: "muck",
      level: 1,
      ...best[0].cell,
    });
    act(() => {
      useLiveGame.getState().addBuilt("muck", 1);
    });
    expect(container.querySelector(".live-map-selection")).toHaveTextContent(
      "1 to place",
    );
    expect(container.querySelector(".live-map-selection")).toHaveTextContent(
      "scoring Crystal Spire I",
    );
    fireEvent.click(container.querySelector('polygon[data-rank="0"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm placement" }));
    expect(useLiveGame.getState().placements).toHaveLength(2);
  });
  it("shows mixed levels, recommends Arrow cells, and confirms placement and moves explicitly", () => {
    useLiveGame.getState().addBuilt("haste", 2);
    useLiveGame.getState().addBuilt("haste", 1);
    useLiveGame.getState().addBuilt("arrow", 1);
    const { container } = render(<MapPanel assets={assets} />);
    expect(
      screen.getByRole("button", { name: "Select Haste II, 1 copies" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Select Haste I, 1 copies" }),
    ).toBeVisible();
    expect(screen.getByText(/Best spots for Arrow/)).toBeVisible();
    fireEvent.click(container.querySelector('polygon[data-rank="0"]')!);
    expect(useLiveGame.getState().placements).toHaveLength(0);
    fireEvent.click(container.querySelector('polygon[data-rank="1"]')!);
    expect(useLiveGame.getState().placements).toHaveLength(0);
    fireEvent.click(container.querySelector('polygon[data-rank="0"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm placement" }));
    expect(useLiveGame.getState().placements[0].towerId).toBe("arrow");
    const previous = useLiveGame.getState().placements[0];
    fireEvent.click(container.querySelector('polygon[data-occupied="true"]')!);
    expect(useLiveGame.getState().placements[0]).toEqual(previous);
    expect(screen.getByLabelText("Tower level I")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move this tower" }));
    fireEvent.click(container.querySelector('polygon[data-rank="0"]')!);
    expect(useLiveGame.getState().placements[0]).toEqual(previous);
    fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));
    expect(useLiveGame.getState().placements).toHaveLength(1);
    expect(useLiveGame.getState().placements[0]).not.toEqual(previous);
  });
  it("confirms a preview by tapping the same cell again, without the button", () => {
    // Confirm lives below a tall map inside a scrolling column, so reaching
    // it meant scrolling away from the grid mid-wave. A second tap on the
    // previewed cell must commit; a tap on a different cell only re-previews.
    useLiveGame.getState().addBuilt("arrow", 1);
    const { container } = render(<MapPanel assets={assets} />);

    const first = container.querySelector('polygon[data-rank="0"]')!;
    const second = container.querySelector('polygon[data-rank="1"]')!;

    fireEvent.click(first);
    expect(useLiveGame.getState().placements).toHaveLength(0);
    expect(first.querySelector("title")).toHaveTextContent(
      /Tap again to confirm Arrow/,
    );

    // Switching cells re-previews rather than committing.
    fireEvent.click(second);
    expect(useLiveGame.getState().placements).toHaveLength(0);

    fireEvent.click(second);
    expect(useLiveGame.getState().placements).toHaveLength(1);
    expect(useLiveGame.getState().placements[0].towerId).toBe("arrow");
    // The preview is cleared once committed.
    expect(
      screen.queryByRole("button", { name: "Confirm placement" }),
    ).toBeNull();

    // With no copies left, another tap on an open cell only previews.
    fireEvent.click(first);
    fireEvent.click(first);
    expect(useLiveGame.getState().placements).toHaveLength(1);
  });
  it.each([
    "cannon",
    "mono-water",
    "mono-fire",
    "mono-light",
    "mono-darkness",
    "mono-nature",
    "mono-earth",
  ])("recommends cells for %s", (id) => {
    useLiveGame.getState().spendPick("Light");
    useLiveGame.getState().spendPick("Nature");
    useLiveGame.getState().addBuilt(id, 1);
    const { container } = render(<MapPanel assets={assets} />);
    expect(container.querySelector('polygon[data-rank="0"]')).not.toBeNull();
    expect(
      container.querySelector(".live-map-selection"),
    ).not.toHaveTextContent("unknown");
  });
  it("shows and enforces each placed copy's remembered final form", () => {
    useLiveGame.getState().addBuilt("muck", 1);
    useLiveGame.getState().placeTower("forest", "muck", 1, 3, 3, {
      towerId: "crystal-spire",
      level: 1,
    });
    render(<FieldPanel assets={assets} />);
    expect(screen.getByText(/Locked path/)).toHaveTextContent(
      "Crystal Spire I",
    );
    fireEvent.focus(
      screen.getByRole("button", { name: /Evolution line for Muck/ }),
    );
    expect(
      screen.getByRole("button", { name: /Crystal Spire/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plague/ })).toBeNull();
    expect(screen.getByTitle("Set one Muck to level II")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Unlock path" }));
    expect(screen.getByTitle("Set one Muck to level II")).toBeEnabled();
  });
  it("raises a planned tower precursor above unrelated field rows", () => {
    useLiveGame.getState().setPlan(plan);
    // Darkness cannot feed the Water / Fire / Earth Haste target; Water can.
    useLiveGame.getState().addBuilt("mono-darkness", 1);
    useLiveGame.getState().addBuilt("mono-water", 1);
    const { container } = render(<FieldPanel assets={assets} />);
    const rows = container.querySelectorAll(".live-field-row");
    expect(rows[0]?.querySelector('[data-icon="mono-water"]')).not.toBeNull();
    expect(rows[0]).toHaveTextContent("Feeds Haste II");
  });
});

describe("plan and import interactions", () => {
  function setViewport(width: number) {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
    return () =>
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: original,
      });
  }

  it("keeps the plan behind a tab and opens it in a dialog on a narrow viewport", () => {
    const restore = setViewport(800);
    useLiveGame.getState().setPlan({ ...plan, source: "engine" });
    render(<BuildLabTracker assets={assets} />);

    const tab = screen.getByRole("button", { name: "Plan" });
    expect(tab).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".live-plan-dock")).toHaveAttribute(
      "data-mode",
      "drawer",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(tab);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Build Lab");
    expect(dialog).toHaveTextContent("Anchor");
    expect(dialog).toHaveTextContent("Haste");
    expect(dialog).toHaveTextContent("Build now");
    expect(dialog).toHaveTextContent("Next pick");
    expect(
      within(dialog).getByRole("link", { name: /Open full plan/ }),
    ).toHaveAttribute("href", "#live-plan");
    restore();
  });

  it("floats open on a wide viewport and never hides itself", () => {
    // The regression this guards: the tracker used to expand on hover and
    // fold away on mouseleave, so it vanished exactly when the player
    // looked back at the game to act on it. It must stay open until the
    // player collapses it on purpose.
    const restore = setViewport(1600);
    const bounds = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (
          this.classList.contains("live-strip") ||
          this.classList.contains("live-focal")
        ) {
          return {
            bottom: 200,
            height: 120,
            left: 320,
            right: 1280,
            top: 80,
            width: 960,
            x: 320,
            y: 80,
            toJSON: () => ({}),
          } as DOMRect;
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      });
    useLiveGame.getState().setPlan({ ...plan, source: "engine" });
    render(
      <main className="live-shell">
        <div className="live-strip" />
        <div className="live-focal" />
        <BuildLabTracker assets={assets} />
      </main>,
    );

    const dock = document.querySelector<HTMLElement>(".live-plan-dock")!;
    const tab = screen.getByRole("button", { name: "Plan" });
    expect(dock).toHaveAttribute("data-mode", "float");
    // Open by default, landed in the wider (right) gutter beside the app
    // and just under the strip (mocked bottom edge at 200px).
    expect(tab).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Build Lab tracker")).toBeInTheDocument();
    expect(dock.style.left).toBe("1288px");
    expect(dock.style.top).toBe("212px");

    // Leaving with the mouse, or moving focus away, changes nothing.
    fireEvent.mouseLeave(dock);
    fireEvent.blur(tab);
    expect(tab).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Build Lab tracker")).toBeInTheDocument();

    // No pin control — there is nothing to pin against any more.
    expect(screen.queryByRole("button", { name: /pin/i })).toBeNull();

    bounds.mockRestore();
    restore();
  });

  it("shows the whole build as icons and ticks off what is standing", () => {
    // The gap this closes: the tracker only ever showed the next step, so
    // nothing in the live view listed the roster the plan is aiming at.
    const restore = setViewport(1600);
    useLiveGame.getState().setPlan({ ...plan, source: "engine" });
    render(<BuildLabTracker assets={assets} />);

    const roster = document.querySelector<HTMLElement>(
      ".live-build-rail-roster",
    )!;
    // The fixture plan is a single Haste II. One icon, owed, with its
    // target level badged and the full action in the hover title.
    expect(roster).toHaveTextContent("Build 0/1");
    const icon = roster.querySelector<HTMLElement>("li")!;
    expect(icon).toHaveAttribute("title", "Build Haste II");
    expect(icon).not.toHaveAttribute("data-done");
    expect(icon.querySelector("em")).toHaveTextContent("II");
    expect(icon.querySelector("i")).toHaveTextContent("✕");

    // Haste I is not enough — the plan wants II.
    act(() => {
      useLiveGame.getState().addBuilt("haste", 1);
    });
    expect(icon).not.toHaveAttribute("data-done");
    expect(roster).toHaveTextContent("Build 0/1");

    act(() => {
      useLiveGame.getState().setBuiltLevel("haste", 1, 2);
    });
    expect(icon).toHaveAttribute("data-done", "true");
    expect(icon).toHaveAttribute("title", "Build Haste II — built");
    expect(icon.querySelector("i")).toHaveTextContent("✓");
    expect(roster).toHaveTextContent("Build 1/1");
    restore();
  });

  it("drags by its tab and remembers where it was left", () => {
    const restore = setViewport(1600);
    useLiveGame.getState().setPlan({ ...plan, source: "engine" });
    render(<BuildLabTracker assets={assets} />);

    const dock = document.querySelector<HTMLElement>(".live-plan-dock")!;
    const tab = screen.getByRole("button", { name: "Plan" });
    // No measurable shell: falls back to the top-right corner.
    expect(dock.style.left).toBe(`${1600 - 248 - 16}px`);
    const startX = Number.parseFloat(dock.style.left);
    const startY = Number.parseFloat(dock.style.top);

    // Press, move well past the click threshold, release.
    fireEvent.pointerDown(tab, {
      pointerId: 1,
      button: 0,
      clientX: 500,
      clientY: 300,
    });
    fireEvent.pointerMove(tab, { pointerId: 1, clientX: 460, clientY: 330 });
    expect(dock).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerUp(tab, { pointerId: 1, clientX: 460, clientY: 330 });

    expect(dock).not.toHaveAttribute("data-dragging");
    expect(Number.parseFloat(dock.style.left)).toBe(startX - 40);
    expect(Number.parseFloat(dock.style.top)).toBe(startY + 30);
    // A drag is a move, not a click: still expanded.
    expect(tab).toHaveAttribute("aria-expanded", "true");
    expect(
      JSON.parse(window.localStorage.getItem("etd2-live-plan-tracker")!),
    ).toEqual({ x: startX - 40, y: startY + 30, collapsed: false });

    // A press with no movement is a click: collapses, and that is saved.
    fireEvent.pointerDown(tab, {
      pointerId: 2,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(tab, { pointerId: 2, clientX: 11, clientY: 10 });
    expect(tab).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Build Lab tracker")).toBeNull();
    expect(dock).toHaveAttribute("data-collapsed", "true");
    expect(
      JSON.parse(window.localStorage.getItem("etd2-live-plan-tracker")!)
        .collapsed,
    ).toBe(true);

    // Arrow keys nudge it for keyboard users.
    fireEvent.keyDown(tab, { key: "ArrowRight" });
    expect(Number.parseFloat(dock.style.left)).toBe(startX - 40 + 16);
    restore();
  });

  it("restores a remembered position and collapsed state on mount", () => {
    const restore = setViewport(1600);
    window.localStorage.setItem(
      "etd2-live-plan-tracker",
      JSON.stringify({ x: 640, y: 200, collapsed: true }),
    );
    useLiveGame.getState().setPlan({ ...plan, source: "engine" });
    render(<BuildLabTracker assets={assets} />);

    const dock = document.querySelector<HTMLElement>(".live-plan-dock")!;
    expect(dock.style.left).toBe("640px");
    expect(dock.style.top).toBe("200px");
    expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    restore();
  });
  it("prioritizes planned summons and updates strategy checks at the planned level", () => {
    useLiveGame.getState().setPlan({
      ...plan,
      strategy: {
        towers: [
          {
            towerId: "haste",
            purpose: "Main clearing tower",
            roles: ["Main DPS"],
            synergyTags: ["Attack Speed"],
          },
        ],
        relations: [
          {
            providerId: "vapor",
            consumerId: "haste",
            text: "Test partner requirement",
          },
        ],
      },
    });
    const { container } = render(
      <>
        <AvailabilityPanel assets={assets} />
        <StrategyStatus />
      </>,
    );
    const group = screen.getByRole("region", { name: "Dual / Trio / Quad" });
    expect(group.querySelector(".live-available-tower")).toHaveAttribute(
      "data-on-plan",
      "true",
    );
    expect(group.querySelector(".live-available-name")).toHaveTextContent(
      "Haste",
    );
    fireEvent.click(screen.getByText("Build Lab strategy, coverage & synergy"));
    expect(
      screen.getByText(/Main clearing tower/).closest("p"),
    ).toHaveAttribute("data-met", "false");
    act(() => useLiveGame.getState().addBuilt("haste", 1));
    expect(
      screen.getByText(/Main clearing tower/).closest("p"),
    ).toHaveAttribute("data-met", "false");
    act(() => useLiveGame.getState().setBuiltLevel("haste", 1, 2));
    expect(
      screen.getByText(/Main clearing tower/).closest("p"),
    ).toHaveAttribute("data-met", "true");
    expect(screen.getByText(/Test partner requirement/)).toHaveAttribute(
      "data-met",
      "false",
    );
    act(() => useLiveGame.getState().addBuilt("vapor", 1));
    expect(screen.getByText(/Test partner requirement/)).toHaveAttribute(
      "data-met",
      "true",
    );
    expect(container.querySelector(".live-strategy-summary")).toHaveTextContent(
      "Strategy · 1/1",
    );
  });
  it("still offers a stored import when the previous saved match is corrupt", () => {
    window.localStorage.setItem(LIVE_STORAGE_KEY, "broken JSON");
    window.localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(plan));
    render(<LiveTracker initialPlan={null} assets={assets} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));
    expect(useLiveGame.getState().plan).toEqual(plan);
  });
  it("upgrades one existing tower from the Plan action", () => {
    useLiveGame.getState().setPlan(plan);
    useLiveGame.getState().addBuilt("haste", 1);
    useLiveGame.getState().addBuilt("haste", 1);
    render(<PlanPanel assets={assets} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Upgrade one Haste II" }),
    );
    expect(useLiveGame.getState().built).toEqual([
      { towerId: "haste", level: 1, quantity: 1 },
      { towerId: "haste", level: 2, quantity: 1 },
    ]);
  });
  it("keeps coverage advice quiet until the field has a real damage penalty", () => {
    useLiveGame.getState().setPlan(plan);
    render(<PlanPanel assets={assets} />);
    expect(screen.getByText(/No active coverage risk/)).toBeVisible();
    expect(screen.queryByText(/is uncovered/)).toBeNull();
  });
  it.each(["Keep current match", "Start fresh"])(
    "waits for %s before hydrating and consumes the handoff",
    (choice) => {
      const saved = {
        allocation,
        built: [{ towerId: "vapor", level: 1, quantity: 2 }],
        placements: [],
        holds: 1,
        pickLog: [],
      };
      window.localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(saved));
      window.localStorage.setItem(PENDING_IMPORT_KEY, JSON.stringify(plan));
      window.history.replaceState(null, "", "/live?b=incoming");
      render(<LiveTracker initialPlan={plan} assets={assets} />);
      expect(screen.getByRole("dialog")).toBeVisible();
      expect(window.localStorage.getItem(LIVE_STORAGE_KEY)).toBe(
        JSON.stringify(saved),
      );
      expect(window.localStorage.getItem(PENDING_IMPORT_KEY)).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: choice }));
      expect(useLiveGame.getState().plan).toEqual(plan);
      expect(useLiveGame.getState().built).toEqual(
        choice === "Keep current match" ? saved.built : [],
      );
      expect(useLiveGame.getState().holds).toBe(
        choice === "Keep current match" ? 1 : 0,
      );
      expect(window.localStorage.getItem(PENDING_IMPORT_KEY)).toBeNull();
      expect(window.location.search).toBe("");
      cleanup();
      render(<LiveTracker initialPlan={null} assets={assets} />);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(useLiveGame.getState().plan).toEqual(plan);
    },
  );
});
