"use client";

import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type {
  PlanDto,
  ProgressionStageDto,
  TowerActionDto,
} from "@/lib/engine/buildRecommendationDto";
import {
  ElementIcon,
  TowerIcon,
} from "@/components/build-lab/primitives";
import type { ElementName } from "@/lib/domain/elements";

const STAGE_LABEL: Record<string, string> = {
  EARLY: "Early",
  MID: "Mid",
  LATE: "Late",
  END_GAME: "End Game",
};

function ActionRow({
  action,
  assets,
}: {
  action: TowerActionDto;
  assets: BuildLabAssets;
}) {
  return (
    <li className="prog-action">
      <TowerIcon
        towerId={action.towerId}
        name={action.towerName}
        assets={assets}
        size={30}
      />
      <span className="prog-action-body">
        <span className="prog-action-verb">
          {action.kind === "build"
            ? "Build"
            : "Upgrade"}
        </span>
        <span className="prog-action-name">
          {action.towerName}
        </span>
        <span className="prog-action-level mono">
          → L{action.toLevel}
        </span>
      </span>
      {action.roles.length > 0 && (
        <span className="prog-action-role">
          {action.roles[0]}
        </span>
      )}
    </li>
  );
}

function Stage({
  stage,
  index,
  total,
  assets,
}: {
  stage: ProgressionStageDto;
  index: number;
  total: number;
  assets: BuildLabAssets;
}) {
  const reduce = useReducedMotion();
  const isEnd = stage.stage === "END_GAME";

  return (
    <motion.li
      className="prog-stage"
      data-stage={stage.stage}
      initial={
        reduce ? false : { opacity: 0, y: 20 }
      }
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{
        duration: 0.5,
        delay: index * 0.07,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="prog-stage-head">
        <span className="prog-node" aria-hidden="true">
          <span className="prog-node-dot" />
        </span>
        <span className="prog-stage-name">
          {STAGE_LABEL[stage.stage]}
        </span>
        <span className="prog-stage-count mono">
          {index + 1}/{total}
        </span>
      </div>

      <p className="prog-stage-headline">
        {stage.headline}
      </p>

      {stage.keystoneSteps.length > 0 && (
        <div className="prog-keystones">
          <span className="prog-sub-label">
            Keystones
          </span>
          <span className="prog-keystone-list">
            {stage.keystoneSteps.map((step, i) => (
              <span
                className="prog-keystone"
                key={`${step.element}-${i}`}
                data-element={step.element}
              >
                <ElementIcon
                  element={
                    step.element as ElementName
                  }
                  assets={assets}
                  size={16}
                />
                <span className="mono">
                  {step.from}→{step.to}
                </span>
              </span>
            ))}
          </span>
        </div>
      )}

      {(stage.primaryAction ||
        stage.endgameSelections) && (
        <div className="prog-priority">
          <span className="prog-sub-label">
            Highest priority
          </span>
          {stage.primaryAction && (
            <div className="prog-primary-action">
              <TowerIcon
                towerId={
                  stage.primaryAction.towerId
                }
                name={
                  stage.primaryAction.towerName
                }
                assets={assets}
                size={38}
              />
              <span>
                <span className="prog-action-verb">
                  {stage.primaryAction.kind ===
                  "build"
                    ? "Build"
                    : "Upgrade"}
                </span>{" "}
                <strong>
                  {
                    stage.primaryAction
                      .towerName
                  }
                </strong>{" "}
                <span className="mono">
                  → L
                  {stage.primaryAction.toLevel}
                </span>
              </span>
            </div>
          )}
          {stage.endgameSelections && (
            <div className="prog-essence">
              {stage.endgameSelections.map(
                (selection) => (
                  <span
                    className="prog-essence-tower"
                    key={selection.name}
                  >
                    {selection.name}
                    {selection.quantity > 1
                      ? ` ×${selection.quantity}`
                      : ""}
                  </span>
                ),
              )}
              <span className="prog-essence-note">
                Essence 2 / 2
              </span>
            </div>
          )}
        </div>
      )}

      {stage.secondaryActions.length > 0 && (
        <ul className="prog-secondary">
          {stage.secondaryActions
            .slice(0, 5)
            .map((action) => (
              <ActionRow
                key={`${action.towerId}-${action.toLevel}`}
                action={action}
                assets={assets}
              />
            ))}
        </ul>
      )}

      {isEnd && (
        <span
          className="prog-end-flare"
          aria-hidden="true"
        />
      )}
    </motion.li>
  );
}

export function BuildProgression({
  plan,
  assets,
}: {
  plan: PlanDto;
  assets: BuildLabAssets;
}) {
  return (
    <section className="lab-section prog-section">
      <div className="section-rail">
        <span className="section-index mono">04</span>
        <div>
          <h2>Build progression</h2>
          <p>
            The route to this build, by milestone. No wave numbers —
            each stage is reached when its objective is met.
          </p>
        </div>
      </div>

      <ol className="prog-track">
        <span
          className="prog-connector"
          aria-hidden="true"
        />
        {plan.progression.map((stage, index) => (
          <Stage
            key={stage.stage}
            stage={stage}
            index={index}
            total={plan.progression.length}
            assets={assets}
          />
        ))}
      </ol>
    </section>
  );
}
