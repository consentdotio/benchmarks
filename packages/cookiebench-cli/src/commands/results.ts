import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import Table from 'cli-table3';
import prettyMilliseconds from 'pretty-ms';
import { config } from 'dotenv';
import { calculateScores, printScores } from '../utils/scoring';
import type { BenchmarkScores } from '../types';
import type { Config } from '@consentio/runner';

// Load environment variables from .env files
config({ path: ".env" });
config({ path: ".env.local" });
config({ path: "www/.env.local" }); // Also check www directory

// Function to save benchmark result via oRPC endpoint
async function saveBenchmarkResult(result: BenchmarkResult): Promise<void> {
  const apiUrl = process.env.API_URL || "http://localhost:3000";
  const endpoint = `${apiUrl}/api/orpc/benchmarks/save`;

  try {
    p.log.info(`Attempting to save ${result.name} to ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const responseData = await response.json();
    p.log.success(
      `Saved benchmark result for ${result.name} (App ID: ${responseData.appId})`
    );
  } catch (error) {
    if (error instanceof Error) {
      p.log.error(`Failed to save benchmark result for ${result.name}: ${error.message}`);
      if (error.message.includes('fetch failed')) {
        p.log.error(`Connection failed. Is the server running on ${apiUrl}?`);
      }
    } else {
      p.log.error(`Failed to save benchmark result for ${result.name}: Unknown error`);
    }
    throw error;
  }
}

// Benchmark result type (matching the oRPC contract)
interface BenchmarkResult {
  name: string;
  baseline: boolean;
  cookieBannerConfig: unknown;
  techStack: unknown;
  internationalization: unknown;
  source: unknown;
  includes: string[];
  company?: unknown;
  tags: string[];
  details: unknown[];
  average: {
    fcp: number;
    lcp: number;
    cls: number;
    tbt: number;
    tti: number;
    scriptLoadTime: number;
    totalSize: number;
    scriptSize: number;
    resourceCount: number;
    scriptCount: number;
    time: number;
    thirdPartySize: number;
    cookieServiceSize: number;
    bannerVisibilityTime: number;
    viewportCoverage: number;
    thirdPartyImpact: number;
    mainThreadBlocking: number;
    cookieBannerBlocking: number;
  };
  scores?: {
    totalScore: number;
    grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
    categoryScores: {
      performance: number;
      bundleStrategy: number;
      networkImpact: number;
      transparency: number;
      userExperience: number;
    };
    categories: Array<{
      name: string;
      score: number;
      maxScore: number;
      weight: number;
      details: Array<{
        metric: string;
        value: string | number;
        score: number;
        maxScore: number;
        reason: string;
      }>;
      status: 'excellent' | 'good' | 'fair' | 'poor';
    }>;
    insights: string[];
    recommendations: string[];
  };
}

// Raw benchmark data structure from JSON files
export interface RawBenchmarkDetail {
  duration: number;
  size: {
    total: number;
    bundled: number;
    thirdParty: number;
    cookieServices: number;
    scripts: {
      total: number;
      initial: number;
      dynamic: number;
      thirdParty: number;
      cookieServices: number;
    };
    styles: number;
    images: number;
    fonts: number;
    other: number;
  };
  timing: {
    navigationStart: number;
    domContentLoaded: number;
    load: number;
    firstPaint: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    timeToInteractive: number;
    cumulativeLayoutShift: number;
    cookieBanner: {
      renderStart: number;
      renderEnd: number;
      interactionStart: number;
      interactionEnd: number;
      layoutShift: number;
      detected: boolean;
      selector: string | null;
      serviceName: string;
      visibilityTime: number;
      viewportCoverage: number;
    };
    thirdParty: {
      dnsLookupTime: number;
      connectionTime: number;
      downloadTime: number;
      totalImpact: number;
      cookieServices: {
        hosts: string[];
        totalSize: number;
        resourceCount: number;
        dnsLookupTime: number;
        connectionTime: number;
        downloadTime: number;
      };
    };
    mainThreadBlocking: {
      total: number;
      cookieBannerEstimate: number;
      percentageFromCookies: number;
    };
    scripts: {
      bundled: {
        loadStart: number;
        loadEnd: number;
        executeStart: number;
        executeEnd: number;
      };
      thirdParty: {
        loadStart: number;
        loadEnd: number;
        executeStart: number;
        executeEnd: number;
      };
    };
  };
  resources: {
    scripts: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isDynamic: boolean;
      isCookieService: boolean;
      dnsTime?: number;
      connectionTime?: number;
    }>;
    styles: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    images: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    fonts: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    other: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
      type: string;
    }>;
  };
  language: string;
}

export interface BenchmarkOutput {
  app: string;
  results: RawBenchmarkDetail[];
  scores?: {
    totalScore: number;
    grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
    categoryScores: {
      performance: number;
      bundleStrategy: number;
      networkImpact: number;
      transparency: number;
      userExperience: number;
    };
    categories: Array<{
      name: string;
      score: number;
      maxScore: number;
      weight: number;
      details: Array<{
        name: string;
        score: number;
        maxScore: number;
        reason: string;
      }>;
      status: 'good' | 'warning' | 'critical';
    }>;
    insights: string[];
    recommendations: string[];
  };
  metadata: {
    timestamp: string;
    iterations: number;
    language: string;
  };
}

async function findResultsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findResultsFiles(fullPath)));
    } else if (entry.name === "results.json") {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadConfigForApp(appName: string): Promise<Config> {
  const configPath = join("benchmarks", appName, "config.json");

  try {
    const configContent = await readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    return {
      name: config.name || appName,
      iterations: config.iterations || 0,
      techStack: config.techStack || {
        languages: [],
        frameworks: [],
        bundler: "unknown",
        bundleType: "unknown",
        packageManager: "unknown",
        typescript: false,
      },
      source: config.source || {
        license: "unknown",
        isOpenSource: false,
        github: false,
        npm: false,
      },
      includes: config.includes || { backend: [], components: [] },
      company: config.company || undefined,
      tags: config.tags || [],
      cookieBanner: config.cookieBanner || {
        serviceName: "Unknown",
        selectors: [],
        serviceHosts: [],
        waitForVisibility: false,
        measureViewportCoverage: false,
        expectedLayoutShift: false,
      },
      internationalization: config.internationalization || {
        detection: "none",
        stringLoading: "bundled",
      },
    };
  } catch (error) {
    p.log.warn(
      `Could not load config for ${appName}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    return {
      name: appName,
      iterations: 0,
      techStack: {
        languages: [],
        frameworks: [],
        bundler: "unknown",
        bundleType: "unknown",
        packageManager: "unknown",
        typescript: false,
      },
      source: {
        license: "unknown",
        isOpenSource: false,
        github: false,
        npm: false,
      },
      includes: {
        backend: [],
        components: [],
      },
      company: undefined,
      tags: [],
      cookieBanner: {
        serviceName: "Unknown",
        selectors: [],
        serviceHosts: [],
        waitForVisibility: false,
        measureViewportCoverage: false,
        expectedLayoutShift: false,
      },
      internationalization: {
        detection: "none",
        stringLoading: "bundled",
      },
    };
  }
}

// Helper function to safely access optional nested properties
function safeGet<T>(obj: unknown, path: string, defaultValue: T): T {
  try {
    const result = path.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
    return result !== undefined && result !== null
      ? (result as T)
      : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function aggregateResults(resultsDir: string) {
  const resultsFiles = await findResultsFiles(resultsDir);
  const results: Record<string, RawBenchmarkDetail[]> = {};

  p.log.info(`Found ${resultsFiles.length} results files:`);
  for (const file of resultsFiles) {
    p.log.info(`  - ${file}`);
  }

  for (const file of resultsFiles) {
    try {
      const content = await readFile(file, "utf-8");
      const data: BenchmarkOutput = JSON.parse(content);

      if (!data.app || !data.results) {
        p.log.warn(
          `Skipping invalid results file: ${file} (missing app or results)`
        );
        continue;
      }

      // Log the actual app name from the file
      p.log.info(`Processing ${file} with app name: "${data.app}"`);

      if (results[data.app]) {
        p.log.warn(
          `Duplicate app name "${data.app}" found in ${file}. Previous results will be overwritten.`
        );
      }

      results[data.app] = data.results;
      p.log.success(
        `Loaded results for ${data.app} (${data.results.length} iterations)`
      );
    } catch (error) {
      p.log.error(
        `Failed to process ${file}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      if (error instanceof Error && error.stack) {
        p.log.error(`Stack trace: ${error.stack}`);
      }
    }
  }

  // Log final results summary
  p.log.info("Final results summary:");
  for (const [app, appResults] of Object.entries(results)) {
    p.log.info(`  - ${app}: ${appResults.length} iterations`);
  }

  return results;
}

function formatTime(ms: number): string {
  return prettyMilliseconds(ms, {
    secondsDecimalDigits: 2,
    keepDecimalsOnWholeSeconds: true,
    compact: true,
  });
}

function printResults(results: Record<string, RawBenchmarkDetail[]>) {
  // Calculate baseline averages
  const baseline = results.baseline;
  const baselineAvgTime = baseline
    ? baseline.reduce((a, b) => a + b.duration, 0) / baseline.length
    : 1;
  const baselineAvgSize = baseline
    ? baseline.reduce((a, b) => a + b.size.total, 0) / baseline.length
    : 1;
  const baselineAvgFCP = baseline
    ? baseline.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) /
      baseline.length
    : 1;
  const baselineAvgLCP = baseline
    ? baseline.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) /
      baseline.length
    : 1;
  const baselineAvgCLS = baseline
    ? baseline.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
      baseline.length
    : 1;
  const baselineAvgTTI = baseline
    ? baseline.reduce((a, b) => a + b.timing.timeToInteractive, 0) /
      baseline.length
    : 1;
  const baselineAvgBannerRender = baseline
    ? baseline.reduce(
        (a, b) =>
          a + b.timing.cookieBanner.visibilityTime,
        0
      ) / baseline.length
    : 1;
  const baselineAvgScriptLoad = baseline
    ? baseline.reduce(
        (a, b) =>
          a +
          (b.timing.scripts.thirdParty.loadEnd -
            b.timing.scripts.thirdParty.loadStart),
        0
      ) / baseline.length
    : 1;

  // Prepare and sort results by avg time
  const sorted = Object.entries(results)
    .map(([app, arr]) => {
      const avgTime = arr.reduce((a, b) => a + b.duration, 0) / arr.length;
      const avgSize = arr.reduce((a, b) => a + b.size.total, 0) / arr.length;
      const avgFCP =
        arr.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) / arr.length;
      const avgLCP =
        arr.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) /
        arr.length;
      const avgCLS =
        arr.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
        arr.length;
      const avgTTI =
        arr.reduce((a, b) => a + b.timing.timeToInteractive, 0) / arr.length;
      const avgBannerRender =
        arr.reduce(
          (a, b) =>
            a + b.timing.cookieBanner.visibilityTime,
          0
        ) / arr.length;
      const avgScriptLoad =
        arr.reduce(
          (a, b) =>
            a +
            (b.timing.scripts.thirdParty.loadEnd -
              b.timing.scripts.thirdParty.loadStart),
          0
        ) / arr.length;

      // Calculate average sizes for each resource type
      const avgScriptsTotal =
        arr.reduce((a, b) => a + b.size.scripts.total, 0) / arr.length;
      const avgScriptsInitial =
        arr.reduce((a, b) => a + b.size.scripts.initial, 0) / arr.length;
      const avgScriptsDynamic =
        arr.reduce((a, b) => a + b.size.scripts.dynamic, 0) / arr.length;
      const avgStyles = arr.reduce((a, b) => a + b.size.styles, 0) / arr.length;
      const avgImages = arr.reduce((a, b) => a + b.size.images, 0) / arr.length;
      const avgFonts = arr.reduce((a, b) => a + b.size.fonts, 0) / arr.length;
      const avgOther = arr.reduce((a, b) => a + b.size.other, 0) / arr.length;

      return {
        app,
        avgTime,
        avgSize,
        avgFCP,
        avgLCP,
        avgCLS,
        avgTTI,
        avgBannerRender,
        avgScriptLoad,
        avgScriptsTotal,
        avgScriptsInitial,
        avgScriptsDynamic,
        avgStyles,
        avgImages,
        avgFonts,
        avgOther,
        timeDelta: ((avgTime - baselineAvgTime) / baselineAvgTime) * 100,
        sizeDelta: ((avgSize - baselineAvgSize) / baselineAvgSize) * 100,
        fcpDelta: ((avgFCP - baselineAvgFCP) / baselineAvgFCP) * 100,
        lcpDelta: ((avgLCP - baselineAvgLCP) / baselineAvgLCP) * 100,
        clsDelta: ((avgCLS - baselineAvgCLS) / baselineAvgCLS) * 100,
        ttiDelta: ((avgTTI - baselineAvgTTI) / baselineAvgTTI) * 100,
        bannerRenderDelta:
          ((avgBannerRender - baselineAvgBannerRender) /
            baselineAvgBannerRender) *
          100,
        scriptLoadDelta:
          ((avgScriptLoad - baselineAvgScriptLoad) / baselineAvgScriptLoad) *
          100,
      };
    })
    .sort((a, b) => a.avgTime - b.avgTime);

  // Setup cli-table3
  const table = new Table({
    head: [
      "App",
      "Total Time",
      "ΔTime",
      "FCP",
      "ΔFCP",
      "LCP",
      "ΔLCP",
      "CLS",
      "ΔCLS",
      "TTI",
      "ΔTTI",
      "Banner",
      "ΔBanner",
      "Script",
      "ΔScript",
      "Total Size",
      "ΔSize",
      "Scripts",
      "Styles",
      "Images",
      "Fonts",
      "Other",
    ],
    colWidths: [
      15, 10, 8, 10, 8, 10, 8, 8, 8, 10, 8, 10, 8, 10, 8, 10, 8, 10, 10, 10, 10,
      10,
    ],
    style: { head: ["cyan"], border: ["grey"] },
  });

  // Add rows
  for (const r of sorted) {
    const timeDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.timeDelta > 0 ? "+" : ""}${r.timeDelta.toFixed(1)}%`;
    const sizeDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.sizeDelta > 0 ? "+" : ""}${r.sizeDelta.toFixed(1)}%`;
    const fcpDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.fcpDelta > 0 ? "+" : ""}${r.fcpDelta.toFixed(1)}%`;
    const lcpDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.lcpDelta > 0 ? "+" : ""}${r.lcpDelta.toFixed(1)}%`;
    const clsDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.clsDelta > 0 ? "+" : ""}${r.clsDelta.toFixed(1)}%`;
    const ttiDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.ttiDelta > 0 ? "+" : ""}${r.ttiDelta.toFixed(1)}%`;
    const bannerDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.bannerRenderDelta > 0 ? "+" : ""}${r.bannerRenderDelta.toFixed(
            1
          )}%`;
    const scriptDeltaStr =
      r.app === "baseline"
        ? "-"
        : `${r.scriptLoadDelta > 0 ? "+" : ""}${r.scriptLoadDelta.toFixed(1)}%`;

    table.push([
      r.app,
      formatTime(r.avgTime),
      timeDeltaStr,
      formatTime(r.avgFCP),
      fcpDeltaStr,
      formatTime(r.avgLCP),
      lcpDeltaStr,
      r.avgCLS.toFixed(3),
      clsDeltaStr,
      formatTime(r.avgTTI),
      ttiDeltaStr,
      formatTime(r.avgBannerRender),
      bannerDeltaStr,
      formatTime(r.avgScriptLoad),
      scriptDeltaStr,
      `${r.avgSize.toFixed(2)}KB`,
      sizeDeltaStr,
      `${r.avgScriptsTotal.toFixed(2)}KB`,
      `${r.avgStyles.toFixed(2)}KB`,
      `${r.avgImages.toFixed(2)}KB`,
      `${r.avgFonts.toFixed(2)}KB`,
      `${r.avgOther.toFixed(2)}KB`,
    ]);
  }

  // Print the table to console
  console.log(table.toString());

  // Log a summary to console
  p.log.info("Summary:");
  for (const r of sorted.slice(0, 5)) {
    // Show top 5 results
    const deltaColor = r.timeDelta > 0 ? color.red : color.green;
    const deltaStr =
      r.app === "baseline"
        ? ""
        : ` (${deltaColor(r.timeDelta > 0 ? "+" : "")}${deltaColor(
            r.timeDelta.toFixed(1)
          )}${deltaColor("%")})`;
    p.log.info(`  ${r.app}: ${formatTime(r.avgTime)}${deltaStr}`);
  }
}

// Function to transform BenchmarkScores to match oRPC contract
function transformScoresToContract(scores: BenchmarkScores): BenchmarkResult['scores'] {
  return {
    totalScore: scores.totalScore,
    grade: scores.grade,
    categoryScores: scores.categoryScores,
    categories: scores.categories.map(category => ({
      name: category.name,
      score: category.score,
      maxScore: category.maxScore,
      weight: category.weight,
      details: category.details.map(detail => ({
        metric: detail.name,
        value: detail.score,
        score: detail.score,
        maxScore: detail.maxScore,
        reason: detail.reason,
      })),
      status: mapStatusToContract(category.status),
    })),
    insights: scores.insights,
    recommendations: scores.recommendations,
  };
}

// Function to map status values from CLI format to contract format
function mapStatusToContract(status: 'excellent' | 'good' | 'fair' | 'poor'): 'excellent' | 'good' | 'fair' | 'poor' {
  // Now that both CLI and contract use the same format, just return as is
  return status;
}

export async function resultsCommand() {
  console.clear();
  await setTimeout(1000);

  p.intro(`${color.bgCyan(color.black(" results "))}`);

  // Check database configuration
  const databaseUrl =
    process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const authToken =
    process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

  if (
    databaseUrl?.startsWith("libsql://") ||
    databaseUrl?.startsWith("wss://")
  ) {
    p.log.info(
      `🌐 Using Turso remote database: ${color.cyan(
        `${databaseUrl.split("@")[0]}@***`
      )}`
    );
    if (!authToken) {
      p.log.warn("⚠️  No auth token found. Database operations may fail.");
    }
  } else if (databaseUrl?.startsWith("file:")) {
    p.log.info(`📁 Using file database: ${color.cyan(databaseUrl)}`);
  } else if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    p.log.warn("⚠️  Using in-memory database. Data will not persist!");
  } else {
    p.log.info(
      `📁 Using local SQLite database: ${color.cyan("benchmarks.db")}`
    );
  }

  const resultsDir = "benchmarks";
  p.log.step("Aggregating results...");
  const results = await aggregateResults(resultsDir);

  if (Object.keys(results).length === 0) {
    p.log.error("No benchmark results found!");
    return;
  }

  p.log.info(
    `Found results for ${Object.keys(results).length} apps: ${Object.keys(
      results
    ).join(", ")}`
  );

  const appConfigs: Record<string, Config> = {};
  for (const appName of Object.keys(results)) {
    appConfigs[appName] = await loadConfigForApp(appName);
  }

  // Calculate scores for each app
  const scores: Record<string, BenchmarkScores> = {};
  for (const [appName, appResults] of Object.entries(results)) {
    const config = appConfigs[appName];
    
    // Create app data for transparency scoring
    const appData = {
      name: appName,
      baseline: appName === "baseline",
      company: config.company ? JSON.stringify(config.company) : null,
      techStack: JSON.stringify(config.techStack),
      source: config.source ? JSON.stringify(config.source) : null,
      tags: config.tags ? JSON.stringify(config.tags) : null,
    };
    
    scores[appName] = calculateScores(
      {
        fcp: appResults.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) / appResults.length,
        lcp: appResults.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) / appResults.length,
        cls: appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) / appResults.length,
        tbt: appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) / appResults.length,
        tti: appResults.reduce((a, b) => a + b.timing.timeToInteractive, 0) / appResults.length,
      },
      {
        totalSize: appResults.reduce((a, b) => a + b.size.total, 0) / appResults.length,
        jsSize: appResults.reduce((a, b) => a + b.size.scripts.total, 0) / appResults.length,
        cssSize: appResults.reduce((a, b) => a + b.size.styles, 0) / appResults.length,
        imageSize: appResults.reduce((a, b) => a + b.size.images, 0) / appResults.length,
        fontSize: appResults.reduce((a, b) => a + b.size.fonts, 0) / appResults.length,
        otherSize: appResults.reduce((a, b) => a + b.size.other, 0) / appResults.length,
      },
      {
        totalRequests: appResults.reduce((a, b) => 
          a + b.resources.scripts.length + b.resources.styles.length + 
              b.resources.images.length + b.resources.fonts.length + 
              b.resources.other.length, 0) / appResults.length,
        thirdPartyRequests: appResults.reduce((a, b) => 
          a + b.resources.scripts.filter(s => s.isThirdParty).length, 0) / appResults.length,
        thirdPartySize: appResults.reduce((a, b) => a + b.size.thirdParty, 0) / appResults.length,
        thirdPartyDomains: 5, // Default value
      },
      {
        cookieBannerDetected: appResults.some(r => r.timing.cookieBanner.detected),
        cookieBannerTiming: appResults.reduce((a, b) => a + b.timing.cookieBanner.visibilityTime, 0) / appResults.length,
        cookieBannerCoverage: appResults.reduce((a, b) => a + b.timing.cookieBanner.viewportCoverage, 0) / appResults.length / 100,
      },
      {
        domSize: 1500, // Default value
        mainThreadBlocking: appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) / appResults.length,
        layoutShifts: appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) / appResults.length,
      },
      appName === "baseline",
      appData
    );
  }

  // Print scores
  console.log("\n📊 Benchmark Scores:");
  for (const [appName, appScores] of Object.entries(scores)) {
    console.log(`\n${appName}:`);
    printScores(appScores);
  }

  // Save results to database
  p.log.step("Saving results to database...");
  let savedCount = 0;
  let errorCount = 0;

  for (const [appName, appResults] of Object.entries(results)) {
    try {
      // Load config data for this app
      const config = appConfigs[appName];

      // Convert raw benchmark data to BenchmarkResult format
      const benchmarkResult: BenchmarkResult = {
        name: appName,
        baseline: appName === "baseline",
        cookieBannerConfig: {
          selectors: config.cookieBanner.selectors,
          serviceHosts: config.cookieBanner.serviceHosts,
          waitForVisibility: config.cookieBanner.waitForVisibility,
          measureViewportCoverage: config.cookieBanner.measureViewportCoverage,
          expectedLayoutShift: config.cookieBanner.expectedLayoutShift,
          serviceName: config.cookieBanner.serviceName,
        },
        techStack: config.techStack,
        internationalization: config.internationalization,
        source: config.source,
        includes: Object.values(config.includes || {})
          .flat()
          .filter((v): v is string => typeof v === "string"),
        company: config.company,
        tags: config.tags || [],
        details: appResults,
        average: {
          fcp: appResults.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) /
            appResults.length,
          lcp: appResults.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) /
            appResults.length,
          cls: appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
            appResults.length,
          tbt: appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
            appResults.length,
          tti: appResults.reduce((a, b) => a + b.timing.timeToInteractive, 0) /
            appResults.length,
          scriptLoadTime: 0,
          totalSize: appResults.reduce((a, b) => a + b.size.total, 0) /
            appResults.length,
          scriptSize: 0,
          resourceCount: appResults.reduce((a, b) => a + b.resources.scripts.length, 0) /
            appResults.length,
          scriptCount: appResults.reduce((a, b) => a + b.resources.scripts.length, 0) /
            appResults.length,
          time: appResults.reduce((a, b) => a + b.duration, 0) / appResults.length,
          thirdPartySize: appResults.reduce((a, b) => a + b.size.thirdParty, 0) /
            appResults.length,
          cookieServiceSize: appResults.reduce((a, b) => a + b.size.cookieServices, 0) /
            appResults.length,
          bannerVisibilityTime: appResults.reduce((a, b) => a + b.timing.cookieBanner.visibilityTime, 0) /
            appResults.length,
          viewportCoverage: appResults.reduce((a, b) => a + b.timing.cookieBanner.viewportCoverage, 0) /
            appResults.length,
          thirdPartyImpact: appResults.reduce((a, b) => a + b.timing.thirdParty.totalImpact, 0) /
            appResults.length,
          mainThreadBlocking: appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
            appResults.length,
          cookieBannerBlocking: appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.cookieBannerEstimate, 0) /
            appResults.length,
        },
        scores: transformScoresToContract(scores[appName]),
      };

      await saveBenchmarkResult(benchmarkResult);
      p.log.success(`Saved results for ${appName}`);
      savedCount++;
    } catch (error) {
      p.log.error(
        `Failed to save results for ${appName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      errorCount++;
    }
  }

  // Print results table
  printResults(results);

  // Summary of database operations
  if (savedCount > 0) {
    p.log.success(`Successfully saved ${savedCount} app(s) to database.`);
  }
  if (errorCount > 0) {
    p.log.warn(`Failed to save ${errorCount} app(s) to database.`);
  }

  if (
    databaseUrl?.startsWith("libsql://") ||
    databaseUrl?.startsWith("wss://")
  ) {
    p.log.info(
      `Results have been saved to Turso database: ${color.cyan(
        `${databaseUrl.split("@")[0]}@***`
      )}`
    );
  } else {
    p.log.info(
      `Results have been saved to local database: ${color.cyan(
        "benchmarks.db"
      )} (in project root)`
    );
  }

  p.outro("Results aggregated and saved to database successfully!");
}
