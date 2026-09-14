// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BuildLab } from "@/components/build-lab/BuildLab";
import { useBuildLab } from "@/components/build-lab/store";
import { getTower } from "@/lib/domain/towerCatalog";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type { BuildRecommendationSetDto } from "@/lib/engine/buildRecommendationDto";

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));
vi.mock("@/components/build-lab/LabChrome", () => ({
  LabHeader: () => null,
  LabFooter: () => null,
}));
vi.mock("@/components/build-lab/FeaturedBuild", () => ({
  FeaturedBuild: () => (
    <div data-testid="build-result-card">Generated build</div>
  ),
}));
vi.mock("@/components/build-lab/BuildProgression", () => ({
  BuildProgression: () => null,
}));
vi.mock("@/components/build-lab/EndGameSection", () => ({
  EndGameSection: () => null,
}));
vi.mock("@/components/build-lab/TowerPackage", () => ({
  TowerPackage: () => null,
}));
vi.mock("@/components/build-lab/CoverageAnalysis", () => ({
  CoverageAnalysis: () => null,
}));
vi.mock("@/components/build-lab/SynergyNetwork", () => ({
  SynergyNetwork: () => null,
}));
vi.mock("@/components/build-lab/AlternativeRoutes", () => ({
  RouteDetailModal: () => null,
}));

const laser = getTower("laser");
const anchors = [
  {
    ...laser,
    level: 2,
    shape: null,
    profile: null,
    delivery: null,
    scaling: [],
    allocation: {
      Light: 2,
      Darkness: 2,
      Earth: 2,
      Water: 0,
      Fire: 0,
      Nature: 0,
    },
  },
];
const assets = {
  elements: {},
  towerForms: {},
  towerIcons: {},
  endGameForms: {},
  towerHero: {},
} as BuildLabAssets;
const response = {
  engineRecommendedPlanId: "laser-plan",
  plans: [{ id: "laser-plan", rank: 1, tensions: [] }],
} as unknown as BuildRecommendationSetDto;

beforeEach(() => {
  useBuildLab.setState({
    anchorId: "laser",
    requestState: "empty",
    error: "",
    recommendationSet: null,
    engineRecommendedPlanId: null,
    activePlanId: null,
    previewPlanId: null,
    selectedAlternativePlanId: null,
    isAlternativeDetailOpen: false,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => response }),
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Build Lab primary action", () => {
  it("submits the selected anchor and visibly loads the generated build", async () => {
    render(
      <BuildLab anchors={anchors} names={{ laser: "Laser" }} assets={assets} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /build around laser/i }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/optimize",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      await screen.findByText("Laser build ready below."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("build-result-card")).toBeInTheDocument();
    await waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled(),
    );
  });
});
