"use client";

import { motion, useReducedMotion } from "motion/react";
import type { BuildLabAssets } from "@/components/build-lab/assetResolver";
import type {
  PlanDto,
  ProgressionStageDto,
  KeystoneStepDto,
  TowerActionDto,
} from "@/lib/engine/buildRecommendationDto";
import { ElementIcon, TowerIcon } from "@/components/build-lab/primitives";
import { useBuildLab } from "@/components/build-lab/store";
import type { ElementName } from "@/lib/domain/elements";

const STAGE_LABEL: Record<string, string> = {
  EARLY: "Early",
  MID: "Mid",
  LATE: "Late",
  END_GAME: "End Game",
};

function actionKey(action: TowerActionDto) {
  return `${action.towerId}@${action.toLevel}`;
}

function ActionRow({
  action,
  assets,
  isPrimary,
}: {
  action: TowerActionDto;
  assets: BuildLabAssets;
  isPrimary: boolean;
}) {
  const setHighlightTower = useBuildLab((s) => s.setHighlightTower);
  const highlightTowerId = useBuildLab((s) => s.highlightTowerId);

  return (
    <li
      className="prog-action"
      data-primary={isPrimary || undefined}
      data-active={highlightTowerId === action.towerId || undefined}
      onMouseEnter={() => setHighlightTower(action.towerId)}
      onMouseLeave={() => setHighlightTower(null)}
    >
      <TowerIcon
        towerId={action.towerId}
        name={action.towerName}
        assets={assets}
        size={30}
      />
      <span className="prog-action-body">
        <span className="prog-action-verb">
          {action.kind === "build" ? "Build" : "Upgrade"}
        </span>
        <span className="prog-action-name">{action.towerName}</span>
        <span className="prog-action-level mono">→ L{action.toLevel}</span>
      </span>
      {isPrimary && <span className="prog-action-flag">Start here</span>}
      {action.temporaryCarry && (
        <span className="prog-action-role">temporary carry</span>
      )}
      {!isPrimary && action.roles.length > 0 && (
        <span className="prog-action-role">{action.roles[0]}</span>
      )}
    </li>
  );
}

/**
 * One allocation keystone paired with exactly the tower actions it unlocks,
 * so "spend Water 1→2" and "now Polar is worth building" sit together.
 */
function KeystoneBlock({
  step,
  assets,
  primaryKey,
}: {
  step: KeystoneStepDto;
  assets: BuildLabAssets;
  primaryKey: string | null;
}) {
  return (
    <div className="prog-keystone-block" data-element={step.element}>
      <div className="prog-keystone-head">
        <span className="prog-keystone-chip">
          <ElementIcon
            element={step.element as ElementName}
            assets={assets}
            size={16}
          />
          <span className="prog-keystone-name">{step.element}</span>
          <span className="mono prog-keystone-delta">
            {step.from}→{step.to}
          </span>
        </span>
        {step.unlocks.length === 0 && (
          <span className="prog-keystone-note">
            allocation only — no tower unlocked here
          </span>
        )}
      </div>

      {step.unlocks.length > 0 && (
        <ul className="prog-keystone-unlocks">
          {step.unlocks.map((action) => (
            <ActionRow
              key={actionKey(action)}
              action={action}
              assets={assets}
              isPrimary={actionKey(action) === primaryKey}
            />
          ))}
        </ul>
      )}
    </div>
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
  const primaryKey = stage.primaryAction
    ? actionKey(stage.primaryAction)
    : null;
  const productiveSteps = stage.keystoneSteps.filter(
    (step) => step.unlocks.length > 0,
  );
  const prerequisiteSteps = stage.keystoneSteps.filter(
    (step) => step.unlocks.length === 0,
  );
  const hasKeystones = stage.keystoneSteps.length > 0;

  return (
    <motion.li
      className="prog-stage"
      data-stage={stage.stage}
      initial={reduce ? false : { opacity: 0, y: 20 }}
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
        <span className="prog-stage-name">{STAGE_LABEL[stage.stage]}</span>
        <span className="prog-stage-count mono">
          {index + 1}/{total}
        </span>
      </div>

      <p className="prog-stage-headline">{stage.headline}</p>

      {productiveSteps.length > 0 && (
        <div className="prog-keystone-flow">
          {productiveSteps.map((step, i) => (
            <KeystoneBlock
              key={`${step.element}-${step.to}-${i}`}
              step={step}
              assets={assets}
              primaryKey={primaryKey}
            />
          ))}
        </div>
      )}

      {prerequisiteSteps.length > 0 && (
        <p className="prog-prereq-strip">
          <span className="prog-prereq-label">Also allocate</span>
          {prerequisiteSteps.map((step, i) => (
            <span
              className="prog-prereq-item mono"
              key={`${step.element}-${step.to}-${i}`}
            >
              <ElementIcon
                element={step.element as ElementName}
                assets={assets}
                size={13}
              />
              {step.element} {step.from}→{step.to}
            </span>
          ))}
          <span className="prog-prereq-note">prerequisite only</span>
        </p>
      )}

      {stage.endgameSelections && (
        <div className="prog-essence">
          {stage.endgameSelections.map((selection) => (
            <span className="prog-essence-tower" key={selection.name}>
              {selection.name}
              {selection.quantity > 1 ? ` ×${selection.quantity}` : ""}
            </span>
          ))}
          <span className="prog-essence-note">Essence 2 / 2</span>
        </div>
      )}

      {!hasKeystones && !stage.endgameSelections && (
        <p className="prog-stage-empty">{stage.reason}</p>
      )}

      {isEnd && <span className="prog-end-flare" aria-hidden="true" />}
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
        <span className="section-index mono">03</span>
        <div>
          <h2>Build progression</h2>
          <p>
            The route to this build, by milestone. Each keystone is paired with
            the towers it unlocks — no wave numbers.
          </p>
        </div>
      </div>

      <ol className="prog-track">
        <span className="prog-connector" aria-hidden="true" />
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
