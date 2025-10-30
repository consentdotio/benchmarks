import type { Logger } from "@c15t/logger";
import type { Config } from "@consentio/benchmark";
import {
	BENCHMARK_CONSTANTS,
	CookieBannerCollector,
	NetworkMonitor,
	PerfumeCollector,
	ResourceTimingCollector,
} from "@consentio/benchmark";
import { chromium, type Page } from "@playwright/test";
import { PerformanceMetricsCollector } from "playwright-performance-metrics";
import { PerformanceAggregator } from "./performance-aggregator";
import type { BenchmarkDetails, BenchmarkResult } from "./types";

export class BenchmarkRunner {
	private readonly config: Config;
	private readonly logger: Logger;
	private readonly cookieBannerCollector: CookieBannerCollector;
	private readonly networkMonitor: NetworkMonitor;
	private readonly resourceTimingCollector: ResourceTimingCollector;
	private readonly perfumeCollector: PerfumeCollector;
	private readonly performanceAggregator: PerformanceAggregator;

	constructor(config: Config, logger: Logger) {
		this.config = config;
		this.logger = logger;
		this.cookieBannerCollector = new CookieBannerCollector(config, logger);
		this.networkMonitor = new NetworkMonitor(config, logger);
		this.resourceTimingCollector = new ResourceTimingCollector(logger);
		this.perfumeCollector = new PerfumeCollector(logger);
		this.performanceAggregator = new PerformanceAggregator(logger);
	}

	/**
	 * Run a single benchmark iteration
	 */
	async runSingleBenchmark(page: Page, url: string): Promise<BenchmarkDetails> {
		this.logger.debug(`Starting cookie banner benchmark for: ${url}`);
		this.logger.debug(
			"Cookie banner selectors:",
			this.config.cookieBanner?.selectors || []
		);
		this.logger.debug(
			"Bundle type from config:",
			this.config.techStack?.bundleType
		);

		// Initialize collectors
		const collector = new PerformanceMetricsCollector();
		const cookieBannerMetrics = this.cookieBannerCollector.initializeMetrics();

		// Setup monitoring and detection
		// Pass the target URL so NetworkMonitor can extract hostname for third-party detection
		await this.networkMonitor.setupMonitoring(page, url);
		await this.cookieBannerCollector.setupDetection(page);
		await this.perfumeCollector.setupPerfume(page);

		// Navigate to the page
		this.logger.debug(`Navigating to: ${url}`);
		await page.goto(url, { waitUntil: "networkidle" });

		// Wait for the specified element
		await this.waitForElement(page);

		// Wait for network to be idle
		this.logger.debug("Waiting for network idle...");
		await page.waitForLoadState("networkidle");

		// Collect core web vitals from playwright-performance-metrics (primary source)
		this.logger.debug("Collecting core web vitals...");
		const coreWebVitals = await collector.collectMetrics(page, {
			timeout: BENCHMARK_CONSTANTS.METRICS_TIMEOUT,
			retryTimeout: BENCHMARK_CONSTANTS.METRICS_RETRY_TIMEOUT,
		});

		this.logger.debug("Core web vitals collected:", {
			fcp: coreWebVitals.paint?.firstContentfulPaint,
			lcp: coreWebVitals.largestContentfulPaint,
			cls: coreWebVitals.cumulativeLayoutShift,
			tbt: coreWebVitals.totalBlockingTime,
		});

		// Collect Perfume.js metrics (supplementary - TTFB, navigation timing, network info)
		this.logger.debug("Collecting Perfume.js supplementary metrics...");
		const perfumeMetrics = await this.perfumeCollector.collectMetrics(page);
		this.logger.debug("Perfume.js metrics:", perfumeMetrics);

		// Collect cookie banner specific metrics
		const cookieBannerData =
			await this.cookieBannerCollector.collectMetrics(page);
		this.logger.debug("Cookie banner metrics:", cookieBannerData);

		// Collect detailed resource timing data
		const resourceMetrics = await this.resourceTimingCollector.collect(page);

		// Get network metrics
		const networkRequests = this.networkMonitor.getNetworkRequests();
		const networkMetrics = this.networkMonitor.getMetrics();

		// Aggregate all metrics
		const finalMetrics = this.performanceAggregator.aggregateMetrics({
			coreWebVitals,
			cookieBannerData,
			cookieBannerMetrics,
			networkRequests,
			networkMetrics,
			resourceMetrics,
			config: this.config,
			perfumeMetrics,
		});

		// Log results
		this.performanceAggregator.logResults(
			finalMetrics,
			cookieBannerMetrics,
			this.config
		);

		// Cleanup
		await collector.cleanup();
		this.networkMonitor.reset();

		return finalMetrics;
	}

	/**
	 * Run multiple benchmark iterations
	 */
	async runBenchmarks(serverUrl: string): Promise<BenchmarkResult> {
		const browser = await chromium.launch({
			headless: true, // Keep headless mode for stability
			args: ["--remote-debugging-port=9222"],
		});
		const results: BenchmarkDetails[] = [];

		try {
			for (let i = 0; i < this.config.iterations; i += 1) {
				this.logger.info(
					`Running iteration ${i + 1}/${this.config.iterations}...`
				);

				const context = await browser.newContext();
				const page = await context.newPage();

				const result = await this.runSingleBenchmark(
					page,
					// Add a timestamp to the URL to avoid caching
					`${serverUrl}?t=${Date.now()}`
				);
				results.push(result);

				await context.close();
			}
		} finally {
			await browser.close();
		}

		const averages = this.performanceAggregator.calculateAverages(results);

		return {
			name: this.config.name,
			baseline: this.config.baseline ?? false,
			techStack: this.config.techStack,
			source: this.config.source,
			includes: this.config.includes,
			company: this.config.company,
			tags: this.config.tags,
			details: results,
			average: averages,
		};
	}

	/**
	 * Wait for the specified element based on config
	 */
	private async waitForElement(page: Page): Promise<void> {
		if (this.config.testId) {
			this.logger.debug(`Waiting for testId: ${this.config.testId}`);
			await page.waitForSelector(`[data-testid="${this.config.testId}"]`);
		} else if (this.config.id) {
			this.logger.debug(`Waiting for id: ${this.config.id}`);
			await page.waitForSelector(`#${this.config.id}`);
		} else if (this.config.custom) {
			this.logger.debug("Running custom wait function");
			await this.config.custom(page);
		}
	}
}
