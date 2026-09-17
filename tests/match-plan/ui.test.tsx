// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MatchPlanView } from "@/components/match-plan/MatchPlan";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { PortableBuild } from "@/lib/domain/portableBuild";
import { MATCH_PLAN_STORAGE_KEY } from "@/lib/domain/matchPlan";
import { generateMatchPlan } from "@/lib/engine/matchPlan";

vi.mock("@/components/build-lab/LabChrome", () => ({
  LabHeader: () => null,
  LabFooter: () => null,
}));

const build: PortableBuild = {
  schema: "etd2-build/2",
  source: "theorycraft",
  anchorTowerId: "laser",
  towers: [{ towerId: "laser", level: 1 }],
  allocation: { Light: 2, Darkness: 2, Earth: 2, Water: 1, Fire: 1, Nature: 1 },
  createdAt: "2026-09-14T00:00:00.000Z",
};

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/match-plan");
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(cleanup);

describe("Match Plan UI", () => {
  it("renders a phase snapshot, camps, all coverage rows and temporary labels", async () => {
    render(<MatchPlanView initialPlan={build} />);
    expect(
      await screen.findByRole("heading", { name: /laser match plan/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /placement snapshot/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Camp allocation" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("recommended").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/temporary/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Automatic budget model")).toHaveTextContent(
      "Automatic allocation",
    );
    expect(screen.getByText("Plan skeleton")).toBeInTheDocument();
    expect(screen.getByText("COPILOT DECISION")).toBeInTheDocument();
    expect(screen.getByLabelText("Difficulty baseline")).toHaveValue("hard");
    expect(screen.getByLabelText("Gold allocation")).toHaveTextContent(
      "Wave income",
    );
    expect(screen.getByLabelText("Survival check")).toHaveTextContent("W1");
    expect(screen.getByLabelText("Survival check")).toHaveTextContent("W5");
    expect(screen.getByText("later placement")).toBeInTheDocument();
    expect(
      screen.getByText(/engine assigned every tower/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Select a tower")).not.toBeInTheDocument();
    expect(
      document.querySelectorAll("[data-future-placement]").length,
    ).toBeGreaterThan(0);
    const coverage = screen
      .getByText("Armour coverage")
      .closest("div.match-coverage") as HTMLElement | null;
    expect(coverage).not.toBeNull();
    for (const element of [
      "Light",
      "Darkness",
      "Water",
      "Fire",
      "Nature",
      "Earth",
    ]) {
      expect(within(coverage!).getByText(element)).toBeInTheDocument();
    }
  });

  it("moves between snapshots and applies then undoes a reserve override", async () => {
    render(<MatchPlanView initialPlan={build} />);
    await screen.findByRole("heading", { name: /laser match plan/i });
    fireEvent.click(screen.getByRole("button", { name: /6-10/i }));
    expect(
      screen.getByRole("heading", { name: "Waves 6–10" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Adjust generated plan"));
    const reserve = screen.getByLabelText("Emergency reserve");
    fireEvent.change(reserve, { target: { value: "900" } });
    expect(reserve).toHaveValue(900);
    fireEvent.click(screen.getByRole("button", { name: "Undo change" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Emergency reserve")).toHaveValue(300),
    );
  });

  it("steps between windows from the map panel and reports the field state", async () => {
    render(<MatchPlanView initialPlan={build} />);
    await screen.findByRole("heading", { name: /laser match plan/i });
    const stepper = screen.getByRole("group", {
      name: "Step between windows",
    });
    expect(
      within(stepper).getByRole("button", { name: "No earlier window" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Field state")).toHaveTextContent(
      /End of wave 5 · \d+ towers? standing · \d+ new/,
    );
    fireEvent.click(
      within(stepper).getByRole("button", { name: "Next window: Waves 6–10" }),
    );
    expect(
      screen.getByRole("heading", { name: "Waves 6–10" }),
    ).toBeInTheDocument();
    expect(stepper).toHaveTextContent("End of wave 10");
    expect(screen.getByLabelText("Field state")).toHaveTextContent(
      "End of wave 10",
    );
    // Towers already standing are folded away, but still one click away.
    const held = document.querySelector("details.match-lineup-held");
    expect(held).not.toBeNull();
    expect(held).not.toHaveAttribute("open");
    expect(held!.querySelector("summary")).toHaveTextContent(
      /[0-9]+ already on the field/,
    );
    expect(
      held!.querySelectorAll('li[data-change="carried"]').length,
    ).toBeGreaterThan(0);
    fireEvent.click(
      within(stepper).getByRole("button", {
        name: "Previous window: Waves 1–5",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Waves 1–5" }),
    ).toBeInTheDocument();
    // An action row is a reference: clicking it selects that copy on the
    // board and in the lineup.
    const reference = screen.getAllByRole("button", {
      name: /show on the map/i,
    })[0];
    fireEvent.click(reference);
    expect(reference).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelectorAll(".match-tower.is-selected").length).toBe(
      1,
    );
    // The snapshot reads as grouped rosters and grouped actions, not as
    // one card per copy: temporaries fold into a single line, the actions
    // carry a tier, and the anchor row sits first once it is fielded.
    expect(
      document.querySelectorAll(".snapshot-roster-temp summary").length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelector(".snapshot-roster-temp summary")?.textContent,
    ).toMatch(/[0-9]+ temporary cop/);
    expect(
      document.querySelectorAll(".snapshot-actions li[data-tier]").length,
    ).toBeGreaterThan(0);
    // Every token on the board carries its level as a roman numeral pip.
    const pips = document.querySelectorAll(".match-tower-level text");
    expect(pips.length).toBeGreaterThan(0);
    for (const pip of pips) expect(pip.textContent).toMatch(/^(I|II|III)$/);
  });

  it("badges each tower with its build/upgrade step number from the action sequence, and leaves carried towers unbadged", async () => {
    render(<MatchPlanView initialPlan={build} />);
    await screen.findByRole("heading", { name: /laser match plan/i });

    const plan = generateMatchPlan(build, { mapId: "forest" });
    const opening = plan.phases[0];
    const openingSteps = opening.actions.flatMap((action, index) =>
      action.copyId &&
      action.affordable !== false &&
      (action.type === "build" ||
        action.type === "upgrade" ||
        action.type === "evolve")
        ? [{ copyId: action.copyId, position: index + 1 }]
        : [],
    );
    expect(openingSteps.length).toBeGreaterThan(0);
    const openingDistinctCopies = new Set(
      openingSteps.map((step) => step.copyId),
    );

    // Waves 1-5: every fielded tower was just built, so every copy with a
    // build/upgrade/evolve action gets exactly one badge, in list order.
    const stepBadgeText = () =>
      Array.from(document.querySelectorAll(".match-tower-step text")).map(
        (el) => el.textContent,
      );
    await waitFor(() =>
      expect(stepBadgeText().length).toBe(openingDistinctCopies.size),
    );
    for (const text of stepBadgeText()) {
      expect(text).toMatch(/^\d+(→\d+)*$/);
      // Every number in the badge is a real, in-range position in this
      // window's own action list — the same list "Exact action sequence"
      // numbers — never a value the sequence itself couldn't produce.
      for (const part of text!.split("→")) {
        const n = Number(part);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(opening.actions.length);
      }
    }

    // Waves 6-10: some copies carry over unchanged (asserted elsewhere in
    // this file via the "held" roster), so strictly fewer tokens should
    // carry a badge than are on the board.
    const stepper = screen.getByRole("group", {
      name: "Step between windows",
    });
    fireEvent.click(
      within(stepper).getByRole("button", { name: "Next window: Waves 6–10" }),
    );
    await screen.findByRole("heading", { name: "Waves 6–10" });
    const nextPhase = plan.phases[1];
    const nextSteps = nextPhase.actions.flatMap((action, index) =>
      action.copyId &&
      action.affordable !== false &&
      (action.type === "build" ||
        action.type === "upgrade" ||
        action.type === "evolve")
        ? [{ copyId: action.copyId, position: index + 1 }]
        : [],
    );
    const nextDistinctCopies = new Set(nextSteps.map((step) => step.copyId));
    const boardTokens = document.querySelectorAll(
      ".match-tower:not(.is-future)",
    ).length;
    await waitFor(() =>
      expect(stepBadgeText().length).toBe(nextDistinctCopies.size),
    );
    expect(stepBadgeText().length).toBeLessThan(boardTokens);
  });

  it("never shows a future tower's real icon, only a current on-field tower's", async () => {
    // A fake resolver that answers every lookup, so a future tower here
    // *would* resolve a real icon if the code allowed it — proving the
    // absence below is the code's own choice, not just missing test assets.
    const fakeIcon = "data:image/svg+xml,fake";
    const fakeAssets = new Proxy(
      {},
      { get: () => new Proxy({}, { get: () => fakeIcon }) },
    ) as unknown as BuildLabAssets;
    render(<MatchPlanView initialPlan={build} assets={fakeAssets} />);
    await screen.findByRole("heading", { name: /laser match plan/i });

    const currentIcons = document.querySelectorAll(
      ".match-tower:not(.is-future) image.match-tower-icon",
    );
    expect(currentIcons.length).toBeGreaterThan(0);

    const futureTokens = document.querySelectorAll("[data-future-placement]");
    expect(futureTokens.length).toBeGreaterThan(0);
    for (const token of futureTokens) {
      expect(token.querySelector("image.match-tower-icon")).toBeNull();
      expect(token.querySelector(".match-tower-mark")).not.toBeNull();
    }
  });

  it("exports the deterministic Co-pilot action stream", async () => {
    render(<MatchPlanView initialPlan={build} />);
    const button = await screen.findByRole("button", {
      name: "Copy JSON",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce(),
    );
    const payload = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(payload).toContain("etd2-copilot-action/1");
  });

  it("refreshes a stored plan through the current automatic engine", async () => {
    const stale = structuredClone(
      generateMatchPlan(build, { mapId: "forest" }),
    );
    for (const phase of stale.phases) {
      for (const tower of phase.endTowers) {
        if (tower.effect === "damage" || tower.effect === "hybrid") {
          (tower as { campId: string }).campId = "camp-1-1";
        }
      }
    }
    window.localStorage.setItem(MATCH_PLAN_STORAGE_KEY, JSON.stringify(stale));
    render(<MatchPlanView initialPlan={null} />);
    await screen.findByRole("heading", { name: /laser match plan/i });
    await waitFor(() => {
      const refreshed = JSON.parse(
        window.localStorage.getItem(MATCH_PLAN_STORAGE_KEY) ?? "null",
      );
      const camps = new Set(
        refreshed.phases[2].endTowers
          .filter(
            (tower: { effect: string }) =>
              tower.effect === "damage" || tower.effect === "hybrid",
          )
          .map((tower: { campId: string }) => tower.campId),
      );
      expect(camps.size).toBeGreaterThan(1);
    });
  });
});
