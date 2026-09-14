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

  const opening = await page.evaluate(() => ({
    heading: document.querySelector(".match-phase-heading h2")?.textContent,
    actions: [...document.querySelectorAll(".match-action-list li")].map(
      (item) => item.textContent?.trim(),
    ),
    towerCount: document.querySelectorAll(".snapshot-towers button").length,
  }));
  if (!opening.actions.some((action) => action?.includes("Arrow 1"))) {
    throw new Error(
      `Wave-one Arrow action missing: ${JSON.stringify(opening)}`,
    );
  }

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

  await page.click(".snapshot-towers button:last-of-type");
  await page.waitForSelector(
    ".match-camp-row[data-preferred] button:not(:disabled)",
  );
  await page.click(".match-camp-row[data-preferred] button:not(:disabled)");
  await page.waitForFunction(() =>
    document.querySelector(".match-notice")?.textContent?.includes("reserved"),
  );

  const artifactDir = path.resolve(".next", "e2e");
  await fs.mkdir(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, "match-plan-camp-map.png");
  const mapPanel = await page.$(".match-map-panel");
  if (!mapPanel) throw new Error("Rendered map panel is missing.");
  await mapPanel.screenshot({ path: screenshotPath });

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

  if (!state.actions.some((action) => action?.includes("Earth 2"))) {
    throw new Error(
      `Earth II coverage action missing: ${JSON.stringify(state)}`,
    );
  }
  if (consoleErrors.length || pageErrors.length) {
    throw new Error(
      `Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({ passed: true, state, screenshotPath }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
