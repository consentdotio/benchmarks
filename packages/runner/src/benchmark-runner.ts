import { chromium, type Page } from '@playwright/test';
import { PerformanceMetricsCollector } from 'playwright-performance-metrics';
import type { Config } from '@consentio/benchmark';
import {
	CookieBannerCollector,
	NetworkMonitor,
	ResourceTimingCollector,
	BENCHMARK_CONSTANTS,
} from '@consentio/benchmark';
import type { BenchmarkResult, BenchmarkDetails, CoreWebVitals } from './types';
import { PerformanceAggregator } from './performance-aggregator';

export class BenchmarkRunner {
	private config: Config;
	private cookieBannerCollector: CookieBannerCollector;
	private networkMonitor: NetworkMonitor;
	private resourceTimingCollector: ResourceTimingCollector;
	private performanceAggregator: PerformanceAggregator;

	constructor(config: Config) {
		this.config = config;
		this.cookieBannerCollector = new CookieBannerCollector(config);
		this.networkMonitor = new NetworkMonitor(config);
		this.resourceTimingCollector = new ResourceTimingCollector();
		this.performanceAggregator = new PerformanceAggregator();
	}

	/**
	 * Run a single benchmark iteration
	 */
	async runSingleBenchmark(page: Page, url: string): Promise<BenchmarkDetails> {
		console.log(`🔍 [DEBUG] Starting cookie banner benchmark for: ${url}`);
		console.log(
			'🔍 [DEBUG] Cookie banner selectors:',
			this.config.cookieBanner?.selectors || []
		);
		console.log(
			'🔍 [DEBUG] Bundle type from config:',
			this.config.techStack?.bundleType
		);

		// Initialize collectors
		const collector = new PerformanceMetricsCollector();
		const cookieBannerMetrics = this.cookieBannerCollector.initializeMetrics();

		// Setup monitoring and detection
		await this.networkMonitor.setupMonitoring(page);
		await this.cookieBannerCollector.setupDetection(page);

		// Navigate to the page
		console.log(`🔍 [DEBUG] Navigating to: ${url}`);
		await page.goto(url, { waitUntil: 'networkidle' });

		// Wait for the specified element
		await this.waitForElement(page);

		// Wait for network to be idle
		console.log('🔍 [DEBUG] Waiting for network idle...');
		await page.waitForLoadState('networkidle');

		// Collect core web vitals
		console.log('🔍 [DEBUG] Collecting core web vitals...');
		const coreWebVitals = await this.collectCoreWebVitals(collector, page);

		// Collect cookie banner specific metrics
		const cookieBannerData = await this.cookieBannerCollector.collectMetrics(
			page
		);
		console.log('🔍 [DEBUG] Cookie banner metrics:', cookieBannerData);

		// Collect detailed resource timing data
		const resourceMetrics = await this.resourceTimingCollector.collect(page);

		// Get network metrics
		const networkRequests = this.networkMonitor.getNetworkRequests();
		const networkMetrics = this.networkMonitor.getMetrics();

		// Aggregate all metrics
		const finalMetrics = this.performanceAggregator.aggregateMetrics(
			coreWebVitals,
			cookieBannerData,
			cookieBannerMetrics,
			networkRequests,
			networkMetrics,
			resourceMetrics,
			this.config
		);

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
			args: ['--remote-debugging-port=9222'],
		});
		const results: BenchmarkDetails[] = [];

		try {
			for (let i = 0; i < this.config.iterations; i++) {
				console.log(
					`[Benchmark] Running iteration ${i + 1}/${this.config.iterations}...`
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
			baseline: this.config.baseline || false,
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
			console.log(`🔍 [DEBUG] Waiting for testId: ${this.config.testId}`);
			await page.waitForSelector(`[data-testid="${this.config.testId}"]`);
		} else if (this.config.id) {
			console.log(`🔍 [DEBUG] Waiting for id: ${this.config.id}`);
			await page.waitForSelector(`#${this.config.id}`);
		} else if (this.config.custom) {
			console.log('🔍 [DEBUG] Running custom wait function');
			await this.config.custom(page);
		}
	}

	/**
	 * Collect core web vitals using playwright-performance-metrics
	 */
	private async collectCoreWebVitals(
		collector: PerformanceMetricsCollector,
		page: Page
	): Promise<CoreWebVitals> {
		const coreWebVitals = await collector.collectMetrics(page, {
			timeout: BENCHMARK_CONSTANTS.METRICS_TIMEOUT,
			retryTimeout: BENCHMARK_CONSTANTS.METRICS_RETRY_TIMEOUT,
		});

		console.log('🔍 [DEBUG] Core web vitals collected:', {
			fcp: coreWebVitals.paint?.firstContentfulPaint,
			lcp: coreWebVitals.largestContentfulPaint,
			cls: coreWebVitals.cumulativeLayoutShift,
			tbt: coreWebVitals.totalBlockingTime,
			domComplete: coreWebVitals.domCompleteTiming,
			pageLoad: coreWebVitals.pageloadTiming,
			totalBytes: coreWebVitals.totalBytes,
		});

		return coreWebVitals;
	}
}

