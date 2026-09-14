import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.BUILD_LAB_URL ?? "http://localhost:3000";
const executablePath =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const build = {
  schema: "etd2-build/2",
  source: "theorycraft",
  anchorTowerId: "laser",
  towers: [{ towerId: "laser", level: 2 }],
  allocation: {
    Light: 3,
    Darkness: 3,
    Water: 1,
    Fire: 1,
    Nature: 0,
    Earth: 3,
  },
  createdAt: "2026-09-14T00:00:00.000Z",
};
const encoded = Buffer.from(JSON.stringify(build))
  .toString("base64url")
  .replace(/=+$/, "");

await fs.access(executablePath);
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  await page.goto(`${baseUrl}/match-plan?b=${encoded}`, {
    waitUntil: "networkidle0",
    timeout: 45_000,
  });
  await page.waitForSelector(".match-map-board", { timeout: 20_000 });

  const automaticPlan = await page.evaluate(() => {
    const raw = window.localStorage.getItem("etd2:match-plan:v1");
    if (!raw) return null;
    const plan = JSON.parse(raw);
    return plan.phases.map((phase) => ({
      id: phase.id,
      economy: phase.economy,
      survival: phase.survival,
      towers: phase.endTowers.map((tower) => ({
        name: `${tower.towerName} ${tower.level}`,
        campId: tower.campId,
        effect: tower.effect,
      })),
    }));
  });
  if (!automaticPlan)
    throw new Error("Generated Match Plan was not persisted.");
  const finalDamageCamps = new Set(
    automaticPlan
      .at(-1)
      .towers.filter(
        (tower) => tower.effect === "damage" || tower.effect === "hybrid",
      )
      .map((tower) => tower.campId)
      .filter(Boolean),
  );
  if (finalDamageCamps.size < 2) {
    throw new Error(
      `The engine stacked all automatic damage placements into one camp: ${JSON.stringify(automaticPlan)}`,
    );
  }
  const earlyDamageCamps = new Set(
    automaticPlan[2].towers
      .filter((tower) => tower.effect === "damage" || tower.effect === "hybrid")
      .map((tower) => tower.campId)
      .filter(Boolean),
  );
  if (earlyDamageCamps.size < 2) {
    throw new Error(
      `The engine did not establish multiple early camps automatically: ${JSON.stringify(automaticPlan[2])}`,
    );
  }

  const opening = await page.evaluate(() => ({
    heading: document.querySelector(".match-phase-heading h2")?.textContent,
    actions: [...document.querySelectorAll(".match-action-list li")].map(
      (item) => item.textContent?.trim(),
    ),
    towerCount: document.querySelectorAll(".snapshot-towers button").length,
    futurePlacements: document.querySelectorAll("[data-future-placement]")
      .length,
    notice: document.querySelector(".match-notice")?.textContent?.trim(),
    manualCampPrompts: [
      ...document.querySelectorAll(".match-camp-row button"),
    ].filter((button) => button.textContent?.includes("Select a tower")).length,
    snapshotOverflow: (() => {
      const snapshot = document.querySelector(".phase-snapshot");
      return snapshot ? snapshot.scrollWidth - snapshot.clientWidth : 0;
    })(),
    ledger: document.querySelector(".snapshot-ledger")?.textContent?.trim(),
    survival: document.querySelector(".snapshot-survival")?.textContent?.trim(),
  }));
  if (!opening.actions.some((action) => action?.includes("Arrow 1"))) {
    throw new Error(
      `Wave-one Arrow action missing: ${JSON.stringify(opening)}`,
    );
  }
  if (
    opening.futurePlacements < 1 ||
    !opening.notice?.includes("engine assigned every tower") ||
    opening.manualCampPrompts > 0 ||
    opening.snapshotOverflow > 1 ||
    !opening.ledger?.includes("Wave income") ||
    !opening.survival?.includes("W5")
  ) {
    throw new Error(
      `The automatic field workflow is not visible: ${JSON.stringify(opening)}`,
    );
  }

  const artifactDir = path.resolve(".next", "e2e");
  await fs.mkdir(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, "match-plan-camp-map.png");
  const snapshotPath = path.join(artifactDir, "match-plan-snapshot.png");
  const snapshot = await page.$(".phase-snapshot");
  if (!snapshot) throw new Error("Rendered strategy snapshot is missing.");
  await snapshot.screenshot({ path: snapshotPath });
  const mapPanel = await page.$(".match-map-panel");
  if (!mapPanel) throw new Error("Rendered map panel is missing.");
  await mapPanel.screenshot({ path: screenshotPath });

  await page.evaluate(() => {
    const phase = [...document.querySelectorAll(".match-timeline button")].find(
      (button) => button.textContent?.includes("11-15"),
    );
    if (!(phase instanceof HTMLButtonElement)) throw new Error("11-15 missing");
    phase.click();
  });
  await page.waitForFunction(() =>
    document
      .querySelector(".match-phase-heading h2")
      ?.textContent?.includes("11"),
  );

  const state = await page.evaluate(() => ({
    phase: document
      .querySelector(".match-phase-heading h2")
      ?.textContent?.trim(),
    actions: [...document.querySelectorAll(".match-action-list li")].map(
      (item) => item.textContent?.trim(),
    ),
    camps: document.querySelectorAll(".match-camp-row").length,
    recommendedCamps: document.querySelectorAll(
      ".match-camp-row[data-preferred]",
    ).length,
    mapReadout: document
      .querySelector(".match-map-readout")
      ?.textContent?.trim(),
    notice: document.querySelector(".match-notice")?.textContent?.trim(),
  }));

  if (!state.actions.some((action) => action?.includes(" 2"))) {
    throw new Error(
      `Level-II mono coverage action missing: ${JSON.stringify(state)}`,
    );
  }
  if (consoleErrors.length || pageErrors.length) {
    throw new Error(
      `Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      { passed: true, automaticPlan, state, screenshotPath, snapshotPath },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
