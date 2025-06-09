import { chromium, type Page } from "@playwright/test";
import { readConfig } from "../../utils";
import { buildAndServeNextApp, cleanupServer } from "../../lib/server";
import { PerformanceMetricsCollector } from "playwright-performance-metrics";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  Config,
  BenchmarkResult,
  BenchmarkDetails,
  CookieBannerMetrics,
} from "./types";
import { BENCHMARK_CONSTANTS } from "./constants";
import { determineBundleStrategy } from "./bundle-strategy";
import { NetworkMonitor } from "./network-monitor";
import { CookieBannerDetector } from "./cookie-banner-detector";
import { ResourceCollector } from "./resource-collector";
import { MetricsCalculator } from "./metrics-calculator";
import { calculateScores, printScores } from "../../utils/scoring";
import type { RawBenchmarkDetail } from "../results";

async function runBenchmark(
  page: Page,
  url: string,
  config: Config
): Promise<BenchmarkDetails> {
  console.log(`🔍 [DEBUG] Starting cookie banner benchmark for: ${url}`);
  console.log(
    "🔍 [DEBUG] Cookie banner selectors:",
    config.cookieBanner?.selectors || []
  );
  console.log(
    "🔍 [DEBUG] Bundle type from config:",
    config.techStack?.bundleType
  );

  // Initialize components
  const collector = new PerformanceMetricsCollector();
  const networkMonitor = new NetworkMonitor();
  const bannerDetector = new CookieBannerDetector();
  const resourceCollector = new ResourceCollector();
  const metricsCalculator = new MetricsCalculator();

  // Determine bundle strategy
  const bundleStrategy = determineBundleStrategy(config);
  console.log(
    `🔍 [BUNDLE-STRATEGY] Detected from config: ${
      bundleStrategy.isBundled
        ? "Bundled"
        : bundleStrategy.isIIFE
        ? "IIFE"
        : "Unknown"
    }`,
    {
      bundleType: bundleStrategy.bundleType,
      isBundled: bundleStrategy.isBundled,
      isIIFE: bundleStrategy.isIIFE,
    }
  );

  // Initialize cookie banner metrics
  const cookieBannerMetrics: CookieBannerMetrics = {
    detectionStartTime: 0,
    bannerRenderTime: 0,
    bannerInteractiveTime: 0,
    bannerScriptLoadTime: 0,
    bannerLayoutShiftImpact: 0,
    bannerNetworkRequests: 0,
    bannerBundleSize: 0,
    bannerMainThreadBlockingTime: 0,
    isBundled: bundleStrategy.isBundled,
    isIIFE: bundleStrategy.isIIFE,
    bannerDetected: false,
    bannerSelector: null,
  };

  // Setup monitoring
  await networkMonitor.setupRequestMonitoring(page, cookieBannerMetrics);
  await bannerDetector.setupDetection(page, config);

  console.log(`🔍 [DEBUG] Navigating to: ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });

  // Collect core web vitals
  console.log("🔍 [DEBUG] Collecting core web vitals...");
  const coreWebVitals = await collector.collectMetrics(page, {
    timeout: BENCHMARK_CONSTANTS.METRICS_TIMEOUT,
    retryTimeout: BENCHMARK_CONSTANTS.METRICS_RETRY_TIMEOUT,
  });

  console.log("🔍 [DEBUG] Core web vitals collected:", {
    fcp: coreWebVitals.paint?.firstContentfulPaint,
    lcp: coreWebVitals.largestContentfulPaint,
    cls: coreWebVitals.cumulativeLayoutShift,
    tbt: coreWebVitals.totalBlockingTime,
    domComplete: coreWebVitals.domCompleteTiming,
    pageLoad: coreWebVitals.pageloadTiming,
    totalBytes: coreWebVitals.totalBytes,
  });

  // Collect cookie banner data
  const cookieBannerData = await bannerDetector.collectBannerData(page);
  console.log("🔍 [DEBUG] Cookie banner metrics:", cookieBannerData);

  // Collect resource timing
  console.log("🔍 [DEBUG] Collecting resource timing data...");
  const resourceMetrics = await resourceCollector.collectResourceTiming(page);

  // Calculate TTI
  const tti = metricsCalculator.calculateTTI(coreWebVitals, cookieBannerData);

  // Get network impact data
  const networkRequests = networkMonitor.getNetworkRequests();

  // Merge all metrics
  const finalMetrics = metricsCalculator.mergeBenchmarkMetrics(
    resourceMetrics,
    coreWebVitals,
    cookieBannerData,
    cookieBannerMetrics,
    networkRequests,
    config,
    tti
  );

  // Log final results
  metricsCalculator.logFinalResults(
    finalMetrics,
    cookieBannerMetrics,
    bundleStrategy.bundleType
  );

  // Cleanup
  await collector.cleanup();
  networkMonitor.reset();

  return finalMetrics;
}

async function runBenchmarks(
  serverUrl: string,
  config: Config
): Promise<BenchmarkResult> {
  const browser = await chromium.launch({
    headless: true, // Keep headless mode for stability
  });
  const page = await browser.newPage();
  const results: BenchmarkDetails[] = [];

  try {
    for (let i = 0; i < config.iterations; i++) {
      console.log(
        `[Benchmark] Running iteration ${i + 1}/${config.iterations}...`
      );
      const result = await runBenchmark(page, serverUrl, config);
      results.push(result);
    }
  } finally {
    await browser.close();
  }

  // Create app data for transparency scoring
  const appData = {
    name: config.name,
    baseline: config.baseline || false,
    company: config.company ? JSON.stringify(config.company) : null,
    techStack: JSON.stringify(config.techStack),
    source: config.source ? JSON.stringify(config.source) : null,
    tags: config.tags ? JSON.stringify(config.tags) : null,
  };

  // Calculate scores
  const scores = calculateScores(
    {
      fcp: results.reduce((acc, curr) => acc + curr.timing.firstContentfulPaint, 0) / results.length,
      lcp: results.reduce((acc, curr) => acc + curr.timing.largestContentfulPaint, 0) / results.length,
      cls: results.reduce((acc, curr) => acc + curr.timing.cumulativeLayoutShift, 0) / results.length,
      tbt: results.reduce((acc, curr) => acc + curr.timing.mainThreadBlocking.total, 0) / results.length,
      tti: results.reduce((acc, curr) => acc + curr.timing.timeToInteractive, 0) / results.length,
    },
    {
      totalSize: results.reduce((acc, curr) => acc + curr.size.total, 0) / results.length,
      jsSize: results.reduce((acc, curr) => acc + curr.size.scripts.total, 0) / results.length,
      cssSize: results.reduce((acc, curr) => acc + curr.size.styles, 0) / results.length,
      imageSize: results.reduce((acc, curr) => acc + curr.size.images, 0) / results.length,
      fontSize: results.reduce((acc, curr) => acc + curr.size.fonts, 0) / results.length,
      otherSize: results.reduce((acc, curr) => acc + curr.size.other, 0) / results.length,
    },
    {
      totalRequests: results.reduce((acc, curr) => 
        acc + (curr.resources.scripts.length + curr.resources.styles.length + 
               curr.resources.images.length + curr.resources.fonts.length + 
               curr.resources.other.length), 0) / results.length,
      thirdPartyRequests: results.reduce((acc, curr) => 
        acc + curr.resources.scripts.filter(s => s.isThirdParty).length, 0) / results.length,
      thirdPartySize: results.reduce((acc, curr) => acc + curr.size.thirdParty, 0) / results.length,
      thirdPartyDomains: 5, // Default value
    },
    {
      cookieBannerDetected: (() => {
        // Require consistent detection across ALL iterations for true positive
        const allDetected = results.every(r => r.cookieBanner.detected);
        if (!allDetected) {
          console.log("⚠️ [SCORING] Banner detection inconsistent or failed - marking as not detected");
        }
        return allDetected;
      })(),
      cookieBannerTiming: (() => {
        // If no banners detected across any iteration, heavily penalize
        const detectionSuccess = results.some(r => r.cookieBanner.detected);
        if (!detectionSuccess) {
          console.log("⚠️ [SCORING] No banner detected in any iteration - applying penalty");
          return null; // This signals failed detection for scoring
        }
        
        // Check if any results have null timing (undetected banners)
        const timingValues = results.map(r => r.cookieBanner.visibilityTime);
        const hasNullValues = timingValues.some(t => t === null || t === 0);
        
        // If we have mixed results (some detected, some not), still penalize
        if (hasNullValues) {
          console.log("⚠️ [SCORING] Inconsistent banner detection - applying penalty");
          return null;
        }
        
        // Only return actual timing if all iterations successfully detected banner
        const validTimings = timingValues.filter((t): t is number => t !== null && t > 0);
        return validTimings.length === results.length && validTimings.length > 0
          ? validTimings.reduce((acc, curr) => acc + curr, 0) / validTimings.length
          : null;
      })(),
      cookieBannerCoverage: (() => {
        // Only calculate coverage if banner was consistently detected
        const detectionSuccess = results.every(r => r.cookieBanner.detected);
        if (!detectionSuccess) {
          console.log("⚠️ [SCORING] Inconsistent detection - setting coverage to 0");
          return 0; // No coverage score if detection failed
        }
        return results.reduce((acc, curr) => acc + curr.cookieBanner.viewportCoverage, 0) / results.length / 100;
      })(),
    },
    {
      domSize: 1500, // Default value
      mainThreadBlocking: results.reduce((acc, curr) => acc + curr.timing.mainThreadBlocking.total, 0) / results.length,
      layoutShifts: results.reduce((acc, curr) => acc + curr.timing.cumulativeLayoutShift, 0) / results.length,
    },
    config.baseline || false,
    appData
  );

  return {
    name: config.name,
    baseline: config.baseline || false,
    techStack: config.techStack,
    source: config.source,
    includes: config.includes,
    company: config.company,
    tags: config.tags,
    details: results,
    average: {
      firstContentfulPaint:
        results.reduce(
          (acc, curr) => acc + curr.timing.firstContentfulPaint,
          0
        ) / results.length,
      largestContentfulPaint:
        results.reduce(
          (acc, curr) => acc + curr.timing.largestContentfulPaint,
          0
        ) / results.length,
      timeToInteractive:
        results.reduce((acc, curr) => acc + curr.timing.timeToInteractive, 0) /
        results.length,
      totalBlockingTime:
        results.reduce(
          (acc, curr) => acc + curr.timing.mainThreadBlocking.total,
          0
        ) / results.length,
      speedIndex: 0, // Default value
      timeToFirstByte: 0, // Default value
      firstInputDelay: 0, // Default value
      cumulativeLayoutShift:
        results.reduce(
          (acc, curr) => acc + curr.timing.cumulativeLayoutShift,
          0
        ) / results.length,
      domSize: 0, // Default value
      totalRequests:
        results.reduce(
          (acc, curr) =>
            acc +
            (curr.resources.scripts.length +
              curr.resources.styles.length +
              curr.resources.images.length +
              curr.resources.fonts.length +
              curr.resources.other.length),
          0
        ) / results.length,
      totalSize:
        results.reduce((acc, curr) => acc + curr.size.total, 0) /
        results.length,
      jsSize:
        results.reduce((acc, curr) => acc + curr.size.scripts.total, 0) /
        results.length,
      cssSize:
        results.reduce((acc, curr) => acc + curr.size.styles, 0) / results.length,
      imageSize:
        results.reduce((acc, curr) => acc + curr.size.images, 0) / results.length,
      fontSize:
        results.reduce((acc, curr) => acc + curr.size.fonts, 0) / results.length,
      otherSize:
        results.reduce((acc, curr) => acc + curr.size.other, 0) / results.length,
      thirdPartyRequests:
        results.reduce(
          (acc, curr) => acc + curr.resources.scripts.filter(s => s.isThirdParty).length,
          0
        ) / results.length,
      thirdPartySize:
        results.reduce((acc, curr) => acc + curr.size.thirdParty, 0) / results.length,
      thirdPartyDomains: 0, // Default value
      thirdPartyCookies: 0, // Default value
      thirdPartyLocalStorage: 0, // Default value
      thirdPartySessionStorage: 0, // Default value
      thirdPartyIndexedDB: 0, // Default value
      thirdPartyCache: 0, // Default value
      thirdPartyServiceWorkers: 0, // Default value
      thirdPartyWebWorkers: 0, // Default value
      thirdPartyWebSockets: 0, // Default value
      thirdPartyBeacons: 0, // Default value
      thirdPartyFetch: 0, // Default value
      thirdPartyXHR: 0, // Default value
      thirdPartyScripts: 0, // Default value
      thirdPartyStyles: 0, // Default value
      thirdPartyImages: 0, // Default value
      thirdPartyFonts: 0, // Default value
      thirdPartyMedia: 0, // Default value
      thirdPartyOther: 0, // Default value
      thirdPartyTiming: {
        total: 0,
        blocking: 0,
        dns: 0,
        connect: 0,
        ssl: 0,
        send: 0,
        wait: 0,
        receive: 0,
      },
      cookieBannerTiming: {
        firstPaint: 0,
        firstContentfulPaint:
          results.reduce(
            (acc, curr) => acc + curr.timing.firstContentfulPaint,
            0
          ) / results.length,
        domContentLoaded:
          results.reduce((acc, curr) => acc + curr.timing.domContentLoaded, 0) /
          results.length,
        load:
          results.reduce((acc, curr) => acc + curr.timing.load, 0) /
          results.length,
      },
    },
    scores,
  };
}

export async function benchmarkCommand(appPath?: string): Promise<void> {
  try {
    const config = await readConfig(appPath);
    if (!config) {
      throw new Error("Failed to read config.json");
    }

    const serverInfo = await buildAndServeNextApp(appPath);
    const cwd = appPath || process.cwd();

    try {
      const result = await runBenchmarks(serverInfo.url, config);

      // Format results for results.json
      const resultsData = {
        app: config.name,
        techStack: config.techStack,
        source: config.source,
        includes: config.includes,
        internationalization: config.internationalization,
        company: config.company,
        tags: config.tags,
        results: result.details,
        scores: result.scores,
        metadata: {
          timestamp: new Date().toISOString(),
          iterations: config.iterations,
          languages: config.techStack.languages,
        },
      };

      // Write results to file
      const outputPath = join(cwd, "results.json");
      await writeFile(outputPath, JSON.stringify(resultsData, null, 2));
      console.log(`✅ Benchmark results saved to ${outputPath}`);

      // Print scores if available
      if (result.scores) {
        console.log("📊 Benchmark Scores:");
        printScores(result.scores);
      }
    } finally {
      await cleanupServer(serverInfo);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error running benchmark: ${error.message}`);
    } else {
      console.error("An unknown error occurred during benchmark");
    }
    process.exit(1);
  }
}
