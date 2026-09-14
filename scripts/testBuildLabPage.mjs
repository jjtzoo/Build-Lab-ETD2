import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.BUILD_LAB_URL ?? "http://localhost:3000";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

let executablePath;
for (const candidate of chromeCandidates) {
  try {
    await fs.access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next known browser location.
  }
}

if (!executablePath) {
  throw new Error(
    "No Chrome-compatible browser found. Set CHROME_PATH to run this page test.",
  );
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];
let optimizeResponse;

page.on("console", (message) => {
  consoleMessages.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => {
  pageErrors.push(error.stack ?? error.message);
});
page.on("requestfailed", (request) => {
  failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText ?? "unknown error",
  });
});
page.on("response", (response) => {
  if (response.url().endsWith("/api/optimize")) {
    optimizeResponse = {
      status: response.status(),
      ok: response.ok(),
    };
  }
});

try {
  await page.goto(`${baseUrl}/build-lab`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });

  await page.waitForSelector("#anchor-picker", { timeout: 15_000 });

  const laserValue = await page.$eval("#anchor-picker", (select) => {
    const option = [...select.options].find(
      (candidate) => candidate.textContent?.trim() === "Laser",
    );
    return option?.value ?? null;
  });

  if (!laserValue) {
    throw new Error("Laser is not available in the rendered anchor picker.");
  }

  await page.select("#anchor-picker", laserValue);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Build around Laser"),
      ),
    { timeout: 10_000 },
  );

  await page.click(".build-cta");

  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Laser build ready below.") &&
      Boolean(document.querySelector("#build-result")),
    { timeout: 30_000 },
  );

  await page.locator("#build-result").scroll();
  const artifactDir = path.resolve(".next", "e2e");
  await fs.mkdir(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, "build-lab-laser-result.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const state = await page.evaluate(() => ({
    status: document.querySelector('[role="status"]')?.textContent?.trim(),
    resultHeading: document
      .querySelector("#build-result")
      ?.querySelector("h2, h3")
      ?.textContent?.trim(),
    selectedAnchor: document
      .querySelector("#anchor-picker option:checked")
      ?.textContent?.trim(),
    scrollY: window.scrollY,
  }));

  if (!optimizeResponse?.ok) {
    throw new Error(
      `The optimize request did not succeed: ${JSON.stringify(optimizeResponse)}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        passed: true,
        url: page.url(),
        executablePath,
        optimizeResponse,
        state,
        screenshotPath,
        consoleMessages,
        pageErrors,
        failedRequests,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  const artifactDir = path.resolve(".next", "e2e");
  await fs.mkdir(artifactDir, { recursive: true });
  const screenshotPath = path.join(artifactDir, "build-lab-laser-failure.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const state = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 4_000),
    status: document.querySelector('[role="status"]')?.textContent?.trim(),
    selectedAnchor: document
      .querySelector("#anchor-picker option:checked")
      ?.textContent?.trim(),
    buildButtons: [...document.querySelectorAll("button")]
      .filter((button) => button.textContent?.includes("Build"))
      .map((button) => ({
        text: button.textContent?.trim(),
        disabled: button.disabled,
      })),
    hasResult: Boolean(document.querySelector("#build-result")),
  }));

  process.stderr.write(
    `${JSON.stringify(
      {
        passed: false,
        error: error instanceof Error ? error.stack : String(error),
        url: page.url(),
        optimizeResponse,
        state,
        screenshotPath,
        consoleMessages,
        pageErrors,
        failedRequests,
      },
      null,
      2,
    )}\n`,
  );
  throw error;
} finally {
  await browser.close();
}
