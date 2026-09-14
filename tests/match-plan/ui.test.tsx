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
import type { PortableBuild } from "@/lib/domain/portableBuild";

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
    const reserve = screen.getByLabelText("Emergency reserve");
    fireEvent.change(reserve, { target: { value: "900" } });
    expect(reserve).toHaveValue(900);
    fireEvent.click(screen.getByRole("button", { name: "Undo change" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Emergency reserve")).toHaveValue(300),
    );
  });

  it("exports the deterministic Co-pilot action stream", async () => {
    render(<MatchPlanView initialPlan={build} />);
    const button = await screen.findByRole("button", {
      name: "Copy Co-pilot JSON",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce(),
    );
    const payload = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    expect(payload).toContain("etd2-copilot-action/1");
  });
});
