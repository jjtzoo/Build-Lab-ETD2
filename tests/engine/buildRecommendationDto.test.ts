import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildRecommendationSetDto,
} from "@/lib/engine/buildRecommendationDto";

describe(
  "Phase 10 build recommendation DTO",
  () => {
    it("serialises a complete, JSON-safe recommendation set", () => {
      const dto = buildRecommendationSetDto(
        "laser",
      );

      // Round-trips through JSON without loss (no undefined, cycles,
      // class instances).
      expect(
        JSON.parse(JSON.stringify(dto)),
      ).toEqual(dto);

      expect(
        dto.engineRecommendedPlanId,
      ).toBe("rank-1");
      expect(
        dto.plans.length,
      ).toBeGreaterThanOrEqual(1);

      const rank1 = dto.plans[0];
      expect(rank1.anchor.id).toBe("laser");
      expect(
        rank1.comparisonToRecommended,
      ).toBeNull();
      expect(
        rank1.package[0].isAnchor,
      ).toBe(true);
      expect(
        rank1.keystoneCount,
      ).toBe(11);
      expect(
        rank1.minimumCapital.complete,
      ).toBe(
        rank1.minimumCapital.normal +
          rank1.minimumCapital
            .endgameAdded!,
      );

      // Progression is the four ordered stages.
      expect(
        rank1.progression.map(
          (stage) => stage.stage,
        ),
      ).toEqual([
        "EARLY",
        "MID",
        "LATE",
        "END_GAME",
      ]);

      // Endgame section is populated for an allocation that reaches it.
      expect(
        rank1.endGame.best,
      ).not.toBeNull();
      expect(
        rank1.endGame.best!.essenceUses,
      ).toBe(2);
    });

    it("gives every underdeveloped post-core tower a plain-language reason and no evaluator jargon", () => {
      for (const anchor of [
        "laser",
        "howitzer",
        "solar",
      ]) {
        const dto =
          buildRecommendationSetDto(
            anchor,
          );
        for (const tower of dto.plans[0]
          .package) {
          if (
            tower.developmentStatus ===
              "underdeveloped" &&
            !tower.isAnchor
          ) {
            expect(
              tower.developmentReason,
            ).toBeTruthy();
            expect(
              tower.developmentReason,
            ).not.toMatch(
              /full-synergy:|critical-element-coverage:|reduces-minimum-capital/,
            );
          }
          // Synergy tags are short and human.
          expect(
            tower.synergyTags.length,
          ).toBeLessThanOrEqual(3);
        }
      }
    });

    it("renders human-readable synergy without raw enum names", () => {
      const dto = buildRecommendationSetDto(
        "laser",
      );
      for (const relation of dto.plans[0]
        .synergy.relations) {
        expect(relation.text).not.toMatch(
          /direct relationship|full mechanic contribution|[a-z]+-[a-z]+-buff\b/,
        );
        expect(
          relation.text.endsWith("."),
        ).toBe(true);
        expect(
          relation.mechanicTag,
        ).not.toContain("-");
      }
    });

    it("keeps alternative comparisons grounded", () => {
      const dto = buildRecommendationSetDto(
        "ice",
      );
      for (const plan of dto.plans.slice(
        1,
      )) {
        const cmp =
          plan.comparisonToRecommended!;
        expect(
          cmp.improves.length +
            cmp.worsens.length,
        ).toBeGreaterThan(0);
      }
    });
  },
);
