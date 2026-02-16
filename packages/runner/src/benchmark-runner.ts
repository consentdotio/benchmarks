import { exec } from "node:child_process";
import { readFileSync, unlink, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
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

const execAsync = promisify(exec);

// Constants
const WARMUP_ITERATIONS = 1; // Number of warmup runs before actual benchmarking
const MAX_RETRIES = 2; // Maximum retries for failed iterations
const ITERATION_TIMEOUT_MS = 120_000; // 2 minutes timeout per iteration
const CLEANUP_DELAY_MS = 500; // Delay between iterations for cleanup
const NAVIGATION_TIMEOUT_MS = 60_000; // 60 second timeout for navigation
const RETRY_DELAY_MULTIPLIER = 2; // Multiplier for retry delay
const MILLISECONDS_TO_SECONDS = 1000; // Conversion factor for time calculations

export class BenchmarkRunner {
	private readonly config: Config;
	private readonly logger: Logger;
	private readonly cookieBannerCollector: CookieBannerCollector;
	private readonly networkMonitor: NetworkMonitor;
	private readonly resourceTimingCollector: ResourceTimingCollector;
	private readonly perfumeCollector: PerfumeCollector;
	private readonly performanceAggregator: PerformanceAggregator;
	private readonly saveTrace: boolean;
	private readonly traceDir?: string;

	constructor(
		config: Config,
		logger: Logger,
		options?: { saveTrace?: boolean; traceDir?: string }
	) {
		this.config = config;
		this.logger = logger;
		this.cookieBannerCollector = new CookieBannerCollector(config, logger);
		this.networkMonitor = new NetworkMonitor(config, logger);
		this.resourceTimingCollector = new ResourceTimingCollector(logger);
		this.perfumeCollector = new PerfumeCollector(logger);
		this.performanceAggregator = new PerformanceAggregator(logger);
		this.saveTrace = options?.saveTrace ?? false;
		this.traceDir = options?.traceDir;
		this.validateConfig();
	}

	/**
	 * Validate configuration before running benchmarks
	 */
	private validateConfig(): void {
		if (!this.config.iterations || this.config.iterations < 1) {
			throw new Error(
				`Invalid iterations: ${this.config.iterations}. Must be at least 1.`
			);
		}

		const hasSelectors =
			this.config.cookieBanner?.selectors &&
			this.config.cookieBanner.selectors.length > 0;
		if (!hasSelectors) {
			this.logger.warn(
				"No cookie banner selectors configured. Banner detection may fail."
			);
		}

		const hasWaitCondition =
			this.config.testId || this.config.id || this.config.custom;

		if (!hasWaitCondition) {
			if (hasSelectors) {
				this.logger.debug(
					"No explicit wait condition, will use first cookie banner selector as fallback"
				);
			} else {
				this.logger.warn(
					"No wait condition configured (testId, id, or custom) and no cookie banner selectors found. Benchmarks may not wait for page readiness."
				);
			}
		}
	}

	/**
	 * Run a single benchmark iteration with timeout and error handling
	 */
	async runSingleBenchmark(
		page: Page,
		url: string,
		isWarmup = false
	): Promise<BenchmarkDetails> {
		if (isWarmup) {
			this.logger.debug(`Starting warmup benchmark for: ${url}`);
		} else {
			this.logger.debug(`Starting cookie banner benchmark for: ${url}`);
		}
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
		await this.networkMonitor.setupMonitoring(page);
		await this.cookieBannerCollector.setupDetection(page);
		await this.perfumeCollector.setupPerfume(page);

		// Navigate to the page with timeout
		this.logger.debug(`Navigating to: ${url}`);
		try {
			await page.goto(url, {
				waitUntil: "networkidle",
				timeout: NAVIGATION_TIMEOUT_MS,
			});
		} catch (error) {
			throw new Error(
				`Navigation timeout or failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}

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
	 * Run a single benchmark iteration with retry logic
	 */
	private async runSingleBenchmarkWithRetry(
		page: Page,
		url: string,
		isWarmup: boolean
	): Promise<BenchmarkDetails> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
			try {
				if (attempt > 0) {
					this.logger.warn(
						`Retrying iteration (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`
					);
				}

				return await Promise.race([
					this.runSingleBenchmark(page, url, isWarmup),
					new Promise<BenchmarkDetails>((_, reject) =>
						setTimeout(
							() => reject(new Error("Iteration timeout")),
							ITERATION_TIMEOUT_MS
						)
					),
				]);
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				this.logger.debug(
					`Iteration attempt ${attempt + 1} failed:`,
					lastError.message
				);

				if (attempt < MAX_RETRIES) {
					// Wait before retry
					const retryDelay = CLEANUP_DELAY_MS * RETRY_DELAY_MULTIPLIER;
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			}
		}

		throw new Error(
			`Failed to complete benchmark after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`
		);
	}

	/**
	 * Cleanup resources between iterations
	 */
	private async cleanupBetweenIterations(): Promise<void> {
		// Small delay to allow cleanup
		await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY_MS));

		// Force garbage collection if available (Node.js with --expose-gc)
		if (global.gc) {
			global.gc();
		}
	}

	/**
	 * Run multiple benchmark iterations with warmup and error handling
	 */
	async runBenchmarks(serverUrl: string): Promise<BenchmarkResult> {
		const browser = await chromium.launch({
			headless: true, // Keep headless mode for stability
			args: ["--remote-debugging-port=9222"],
		});
		const results: BenchmarkDetails[] = [];
		const startTime = Date.now();

		try {
			// Warmup runs (discarded, used to stabilize the environment)
			if (WARMUP_ITERATIONS > 0) {
				this.logger.info(
					`Running ${WARMUP_ITERATIONS} warmup iteration(s) to stabilize environment...`
				);
				const warmupContext = await browser.newContext();
				const warmupPage = await warmupContext.newPage();

				for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
					try {
						await this.runSingleBenchmark(
							warmupPage,
							`${serverUrl}?t=${Date.now()}&warmup=true`,
							true
						);
						this.logger.debug(`Warmup iteration ${i + 1} completed`);
					} catch (error) {
						this.logger.debug(
							`Warmup iteration ${i + 1} failed (non-critical):`,
							error instanceof Error ? error.message : String(error)
						);
					}
					await this.cleanupBetweenIterations();
				}

				await warmupContext.close();
				this.logger.info("Warmup complete. Starting actual benchmarks...");
			}

			// Actual benchmark iterations
			for (let i = 0; i < this.config.iterations; i += 1) {
				const iterationStartTime = Date.now();
				const elapsedTimeSeconds = Math.round(
					(Date.now() - startTime) / MILLISECONDS_TO_SECONDS
				);
				const avgTimePerIteration = i > 0 ? elapsedTimeSeconds / i : 0;
				const remainingIterations = this.config.iterations - i - 1;
				const estimatedRemaining = avgTimePerIteration * remainingIterations;

				this.logger.info(
					`Running iteration ${i + 1}/${this.config.iterations}${estimatedRemaining > 0 ? ` (est. ${Math.round(estimatedRemaining)}s remaining)` : ""}...`
				);

				const context = await browser.newContext();
				const page = await context.newPage();

				try {
					if (this.saveTrace) {
						this.logger.info(
							`📊 Starting trace capture for iteration ${i + 1}...`
						);
						await context.tracing.start({
							screenshots: true,
							snapshots: true,
						});
					}

					const result = await this.runSingleBenchmarkWithRetry(
						page,
						// Add a timestamp to the URL to avoid caching
						`${serverUrl}?t=${Date.now()}`,
						false
					);
					results.push(result);

					// Save trace if enabled (must be done before closing context)
					if (this.saveTrace) {
						const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
						const traceZipPath = this.traceDir
							? join(this.traceDir, `Trace-${timestamp}.zip`)
							: join(
									process.cwd(),
									`trace-${this.config.name}-iteration-${i + 1}.zip`
								);
						const traceJsonPath = this.traceDir
							? join(this.traceDir, `Trace-${timestamp}.json`)
							: join(
									process.cwd(),
									`trace-${this.config.name}-iteration-${i + 1}.json`
								);

						// Playwright saves traces as ZIP files
						await context.tracing.stop({ path: traceZipPath });

						// Extract the trace.trace file from the ZIP and save as JSON
						try {
							// Extract trace.trace from the ZIP
							const tempDir = this.traceDir || process.cwd();
							await execAsync(
								`unzip -o "${traceZipPath}" -d "${tempDir}" trace.trace 2>/dev/null`
							);

							// Read the extracted trace.trace file and write it as JSON
							const traceFilePath = join(tempDir, "trace.trace");
							const traceContent = readFileSync(traceFilePath, "utf-8");
							writeFileSync(traceJsonPath, traceContent, "utf-8");
							// Clean up the temporary trace.trace file
							unlink(traceFilePath, () => {
								// Ignore errors during cleanup
							});
							// Clean up the ZIP file
							unlink(traceZipPath, () => {
								// Ignore errors during cleanup
							});
							this.logger.info(`📊 Trace saved to: ${traceJsonPath}`);
						} catch {
							// If extraction failed, keep the ZIP file
							this.logger.warn(
								`Failed to extract trace JSON, keeping ZIP file: ${traceZipPath}`
							);
							this.logger.info(`📊 Trace saved to: ${traceZipPath}`);
						}
					}

					const iterationDurationSeconds = Math.round(
						(Date.now() - iterationStartTime) / MILLISECONDS_TO_SECONDS
					);
					this.logger.debug(
						`Iteration ${i + 1} completed in ${iterationDurationSeconds}s`
					);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					this.logger.error(
						`Failed to complete iteration ${i + 1}: ${errorMessage}`
					);
					// Continue with remaining iterations instead of failing completely
				} finally {
					await context.close();
					await this.cleanupBetweenIterations();
				}
			}

			if (results.length === 0) {
				throw new Error(
					"All benchmark iterations failed. Check logs for details."
				);
			}

			if (results.length < this.config.iterations) {
				this.logger.warn(
					`Only ${results.length}/${this.config.iterations} iterations completed successfully. Results may be less reliable.`
				);
			}
		} finally {
			await browser.close();
		}

		const totalTimeSeconds = Math.round(
			(Date.now() - startTime) / MILLISECONDS_TO_SECONDS
		);
		this.logger.info(
			`Benchmark completed in ${totalTimeSeconds}s (${results.length} successful iterations)`
		);

		const averages = this.performanceAggregator.calculateAverages(results);

		// Log statistical summary after all iterations
		if (results.length > 1) {
			this.performanceAggregator.logStatisticalSummary(results);
		}

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
	 * Falls back to first cookie banner selector if no explicit wait condition is set
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
		} else {
			// Fallback: use first cookie banner selector if available
			const firstSelector = this.config.cookieBanner?.selectors?.[0];
			if (firstSelector) {
				this.logger.debug(
					`No explicit wait condition found, using first cookie banner selector: ${firstSelector}`
				);
				await page.waitForSelector(firstSelector);
			}
			// If no selector found, continue without waiting (will rely on networkidle)
		}
	}
}
