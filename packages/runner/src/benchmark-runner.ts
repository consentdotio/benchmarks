import { execFile } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
import {
	chromium,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	type Page,
} from "@playwright/test";
import { PerformanceMetricsCollector } from "playwright-performance-metrics";
import { PerformanceAggregator } from "./performance-aggregator";
import type {
	BenchmarkDetails,
	BenchmarkQuality,
	BenchmarkResult,
	BenchmarkStatistics,
} from "./types";

const execFileAsync = promisify(execFile);

const WARMUP_ITERATIONS = 1;
const MAX_RETRIES = 2;
const ITERATION_TIMEOUT_MS = 120_000;
const CLEANUP_DELAY_MS = 500;
const NAVIGATION_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MULTIPLIER = 2;
const MILLISECONDS_TO_SECONDS = 1000;
const FCP_LCP_MIN_STDDEV_MS = 8;
const FCP_LCP_MIN_P95_P50_SPREAD_MS = 15;
const TTI_MIN_STDDEV_MS = 30;
const TTI_MIN_P95_P50_SPREAD_MS = 60;
const TBT_MIN_STDDEV_MS = 15;
const TBT_MIN_P95_P50_SPREAD_MS = 25;
const BANNER_VISIBLE_MIN_P95_P50_SPREAD_MS = 250;
const BANNER_VISIBLE_MIN_RELATIVE_SPREAD = 0.2;
const CLS_MIN_STDDEV = 0.005;
const CLS_MIN_P95_P50_SPREAD = 0.01;

type TraceMode = "off" | "on-failure" | "all";

const NETWORK_PROFILES: Record<
	Config["runProfile"]["networkProfile"],
	{
		latency: number;
		downloadThroughput: number;
		uploadThroughput: number;
	} | null
> = {
	none: null,
	slow4g: {
		latency: 150,
		downloadThroughput: (1.6 * 1024 * 1024) / 8,
		uploadThroughput: (750 * 1024) / 8,
	},
	fast3g: {
		latency: 562,
		downloadThroughput: (1.6 * 1024 * 1024) / 8,
		uploadThroughput: (750 * 1024) / 8,
	},
};

export class BenchmarkRunner {
	private readonly config: Config;
	private readonly logger: Logger;
	private readonly cookieBannerCollector: CookieBannerCollector;
	private readonly networkMonitor: NetworkMonitor;
	private readonly resourceTimingCollector: ResourceTimingCollector;
	private readonly perfumeCollector: PerfumeCollector;
	private readonly performanceAggregator: PerformanceAggregator;
	private readonly traceMode: TraceMode;
	private readonly traceDir?: string;
	private warmContext: BrowserContext | null = null;

	constructor(
		config: Config,
		logger: Logger,
		options?: { traceMode?: TraceMode; traceDir?: string }
	) {
		this.config = config;
		this.logger = logger;
		this.cookieBannerCollector = new CookieBannerCollector(config, logger);
		this.networkMonitor = new NetworkMonitor(config, logger);
		this.resourceTimingCollector = new ResourceTimingCollector(logger, config);
		this.perfumeCollector = new PerfumeCollector(logger);
		this.performanceAggregator = new PerformanceAggregator(logger);
		this.traceMode = options?.traceMode ?? "on-failure";
		this.traceDir = options?.traceDir;
		this.validateConfig();
	}

	private validateConfig(): void {
		if (!this.config.iterations || this.config.iterations < 1) {
			throw new Error(
				`Invalid iterations: ${this.config.iterations}. Must be at least 1.`
			);
		}

		if (!this.config.runProfile) {
			throw new Error("Missing required runProfile configuration");
		}
		if (!this.config.measurement) {
			throw new Error("Missing required measurement configuration");
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

	private getContextOptions(): BrowserContextOptions {
		if (!this.config.remote?.enabled) {
			return {};
		}

		const extraHTTPHeaders = this.config.remote.headers;
		if (extraHTTPHeaders && Object.keys(extraHTTPHeaders).length > 0) {
			return { extraHTTPHeaders };
		}
		return {};
	}

	private shouldUseWarmCache(iterationIndex: number): boolean {
		const cacheMode = this.config.runProfile.cacheMode;
		if (cacheMode === "warm") {
			return iterationIndex > 0;
		}
		if (cacheMode === "mixed") {
			return iterationIndex % 2 === 1;
		}
		return false;
	}

	private withCacheBuster(url: string, label: string): string {
		try {
			const parsed = new URL(url);
			parsed.searchParams.set("cb", `${Date.now()}-${label}`);
			return parsed.toString();
		} catch {
			return `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}-${label}`;
		}
	}

	private getIterationUrl(
		baseUrl: string,
		iterationIndex: number,
		isWarmup: boolean,
		useWarmCache: boolean
	): string {
		const cacheMode = this.config.runProfile.cacheMode;
		const shouldBustCache =
			cacheMode === "cold" || (!useWarmCache && cacheMode === "mixed");
		if (!shouldBustCache) {
			return baseUrl;
		}
		const label = isWarmup
			? `warmup-${iterationIndex}`
			: `iter-${iterationIndex}`;
		return this.withCacheBuster(baseUrl, label);
	}

	private async applyRunProfile(page: Page): Promise<void> {
		const cdpSession = await page.context().newCDPSession(page);
		const networkProfile =
			NETWORK_PROFILES[this.config.runProfile.networkProfile];
		const cpuSlowdown = this.config.runProfile.cpuSlowdownMultiplier;

		if (networkProfile) {
			await cdpSession.send("Network.enable");
			await cdpSession.send("Network.emulateNetworkConditions", {
				offline: false,
				latency: networkProfile.latency,
				downloadThroughput: networkProfile.downloadThroughput,
				uploadThroughput: networkProfile.uploadThroughput,
			});
		}

		if (cpuSlowdown > 1) {
			await cdpSession.send("Emulation.setCPUThrottlingRate", {
				rate: cpuSlowdown,
			});
		}
	}

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

		const collector = new PerformanceMetricsCollector();
		const cookieBannerMetrics = this.cookieBannerCollector.initializeMetrics();

		await this.applyRunProfile(page);
		await this.networkMonitor.setupMonitoring(page, url);
		await this.cookieBannerCollector.setupDetection(page);
		await this.perfumeCollector.setupPerfume(page);

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

		await this.waitForElement(page);
		await page.waitForLoadState("networkidle");

		const coreWebVitals = await collector.collectMetrics(page, {
			timeout: BENCHMARK_CONSTANTS.METRICS_TIMEOUT,
			retryTimeout: BENCHMARK_CONSTANTS.METRICS_RETRY_TIMEOUT,
		});

		const perfumeMetrics = await this.perfumeCollector.collectMetrics(page);
		const cookieBannerData =
			await this.cookieBannerCollector.collectMetrics(page);
		const resourceMetrics = await this.resourceTimingCollector.collect(page);
		const networkRequests = this.networkMonitor.getNetworkRequests();
		const networkMetrics = this.networkMonitor.getMetrics();

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

		this.performanceAggregator.logResults(
			finalMetrics,
			cookieBannerMetrics,
			this.config
		);

		await collector.cleanup();
		this.networkMonitor.reset();

		return finalMetrics;
	}

	private async persistTrace(
		context: BrowserContext,
		iterationNumber: number,
		suffix: string
	): Promise<void> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const traceZipPath = this.traceDir
			? join(this.traceDir, `Trace-${timestamp}-${suffix}.zip`)
			: join(
					process.cwd(),
					`trace-${this.config.name}-iteration-${iterationNumber}-${suffix}.zip`
				);
		const traceJsonPath = this.traceDir
			? join(this.traceDir, `Trace-${timestamp}-${suffix}.json`)
			: join(
					process.cwd(),
					`trace-${this.config.name}-iteration-${iterationNumber}-${suffix}.json`
				);
		await context.tracing.stop({ path: traceZipPath });

		try {
			const tempDir = this.traceDir || process.cwd();
			await execFileAsync("unzip", [
				"-o",
				traceZipPath,
				"-d",
				tempDir,
				"trace.trace",
			]);

			const traceFilePath = join(tempDir, "trace.trace");
			const traceContent = readFileSync(traceFilePath, "utf-8");
			writeFileSync(traceJsonPath, traceContent, "utf-8");
			try {
				unlinkSync(traceFilePath);
			} catch {
				// Ignore cleanup failures
			}
			try {
				unlinkSync(traceZipPath);
			} catch {
				// Ignore cleanup failures
			}
			this.logger.info(`📊 Trace saved to: ${traceJsonPath}`);
		} catch {
			this.logger.warn(
				`Failed to extract trace JSON, keeping ZIP file: ${traceZipPath}`
			);
			this.logger.info(`📊 Trace saved to: ${traceZipPath}`);
		}
	}

	private async runSingleBenchmarkWithRetry(
		browser: Browser,
		url: string,
		isWarmup: boolean,
		iterationNumber: number,
		useWarmCache: boolean
	): Promise<BenchmarkDetails> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
			let context: BrowserContext;
			let ownsContext = false;

			if (useWarmCache) {
				if (!this.warmContext) {
					this.warmContext = await browser.newContext(this.getContextOptions());
				}
				context = this.warmContext;
			} else {
				context = await browser.newContext(this.getContextOptions());
				ownsContext = true;
			}

			const page = await context.newPage();
			const shouldTrace = this.traceMode !== "off" && !isWarmup;
			if (shouldTrace) {
				await context.tracing.start({
					screenshots: true,
					snapshots: true,
				});
			}

			try {
				if (attempt > 0) {
					this.logger.warn(
						`Retrying iteration (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`
					);
				}

				const result = await Promise.race([
					this.runSingleBenchmark(page, url, isWarmup),
					new Promise<BenchmarkDetails>((_, reject) =>
						setTimeout(
							() => reject(new Error("Iteration timeout")),
							ITERATION_TIMEOUT_MS
						)
					),
				]);

				if (shouldTrace) {
					if (this.traceMode === "all") {
						await this.persistTrace(context, iterationNumber, "success");
					} else {
						await context.tracing.stop();
					}
				}

				await page.close();
				if (ownsContext) {
					await context.close();
				}
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				this.logger.debug(
					`Iteration attempt ${attempt + 1} failed:`,
					lastError.message
				);

				if (
					shouldTrace &&
					(this.traceMode === "on-failure" || this.traceMode === "all")
				) {
					await this.persistTrace(
						context,
						iterationNumber,
						`failed-attempt-${attempt + 1}`
					);
				} else if (shouldTrace) {
					await context.tracing.stop();
				}

				await page.close();
				if (ownsContext) {
					await context.close();
				}

				if (attempt < MAX_RETRIES) {
					const retryDelay = CLEANUP_DELAY_MS * RETRY_DELAY_MULTIPLIER;
					await new Promise((resolve) => setTimeout(resolve, retryDelay));
				}
			}
		}

		throw new Error(
			`Failed to complete benchmark after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`
		);
	}

	private async cleanupBetweenIterations(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY_MS));

		if (global.gc) {
			global.gc();
		}
	}

	private buildQualitySummary(
		results: BenchmarkDetails[],
		statistics: BenchmarkStatistics
	): BenchmarkQuality {
		const requestedIterations = this.config.iterations;
		const successfulIterations = results.length;
		const failedIterations = requestedIterations - successfulIterations;
		const failureRate =
			requestedIterations > 0 ? failedIterations / requestedIterations : 0;
		const minSuccessfulIterations =
			this.config.measurement.minSuccessfulIterations;
		const maxFailureRate = this.config.measurement.maxFailureRate;
		const stabilityThresholdCv = this.config.measurement.stabilityThresholdCv;
		const isMetricUnstable = (
			stats: BenchmarkStatistics[keyof BenchmarkStatistics],
			options: {
				minStddev: number;
				minP95P50Spread: number;
				minRelativeSpread?: number;
				useStddev?: boolean;
			}
		): boolean => {
			const spread = Math.max(0, stats.p95 - stats.p50);
			const relativeSpread =
				stats.p50 > 0 ? spread / stats.p50 : Number.POSITIVE_INFINITY;
			const stddevUnstable =
				options.useStddev === false ? false : stats.stddev >= options.minStddev;
			const spreadUnstable =
				spread >= options.minP95P50Spread &&
				(options.minRelativeSpread === undefined ||
					relativeSpread >= options.minRelativeSpread);

			return (
				stats.cv > stabilityThresholdCv && (stddevUnstable || spreadUnstable)
			);
		};

		const cvMetrics: Array<{ metric: string; unstable: boolean }> = [
			{
				metric: "fcp",
				unstable: isMetricUnstable(statistics.fcp, {
					minStddev: FCP_LCP_MIN_STDDEV_MS,
					minP95P50Spread: FCP_LCP_MIN_P95_P50_SPREAD_MS,
				}),
			},
			{
				metric: "lcp",
				unstable: isMetricUnstable(statistics.lcp, {
					minStddev: FCP_LCP_MIN_STDDEV_MS,
					minP95P50Spread: FCP_LCP_MIN_P95_P50_SPREAD_MS,
				}),
			},
			{
				metric: "tti",
				unstable: isMetricUnstable(statistics.tti, {
					minStddev: TTI_MIN_STDDEV_MS,
					minP95P50Spread: TTI_MIN_P95_P50_SPREAD_MS,
				}),
			},
			{
				metric: "tbt",
				unstable: isMetricUnstable(statistics.tbt, {
					minStddev: TBT_MIN_STDDEV_MS,
					minP95P50Spread: TBT_MIN_P95_P50_SPREAD_MS,
				}),
			},
			{
				metric: "cls",
				unstable: isMetricUnstable(statistics.cls, {
					minStddev: CLS_MIN_STDDEV,
					minP95P50Spread: CLS_MIN_P95_P50_SPREAD,
				}),
			},
			{
				metric: "bannerVisibleTime",
				unstable: isMetricUnstable(statistics.bannerVisibleTime, {
					minStddev: 0,
					minP95P50Spread: BANNER_VISIBLE_MIN_P95_P50_SPREAD_MS,
					minRelativeSpread: BANNER_VISIBLE_MIN_RELATIVE_SPREAD,
					useStddev: false,
				}),
			},
		];
		const unstableMetrics = cvMetrics
			.filter(({ unstable }) => unstable)
			.map(({ metric }) => metric);

		return {
			requestedIterations,
			successfulIterations,
			failedIterations,
			failureRate,
			minSuccessfulIterations,
			maxFailureRate,
			stabilityThresholdCv,
			stable: unstableMetrics.length === 0,
			unstableMetrics,
		};
	}

	async runBenchmarks(serverUrl: string): Promise<BenchmarkResult> {
		const browser = await chromium.launch({
			headless: true,
			args: ["--remote-debugging-port=9222"],
		});
		const chromiumVersion = browser.version();
		const results: BenchmarkDetails[] = [];
		const startTime = Date.now();

		try {
			if (WARMUP_ITERATIONS > 0) {
				this.logger.info(
					`Running ${WARMUP_ITERATIONS} warmup iteration(s) to stabilize environment...`
				);
				const warmupContext = await browser.newContext(
					this.getContextOptions()
				);
				const warmupPage = await warmupContext.newPage();

				for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
					const warmupUrl = this.getIterationUrl(serverUrl, i, true, false);
					try {
						await this.runSingleBenchmark(warmupPage, warmupUrl, true);
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

			for (let i = 0; i < this.config.iterations; i += 1) {
				const iterationStartTime = Date.now();
				const elapsedTimeSeconds = Math.round(
					(Date.now() - startTime) / MILLISECONDS_TO_SECONDS
				);
				const avgTimePerIteration = i > 0 ? elapsedTimeSeconds / i : 0;
				const remainingIterations = this.config.iterations - i - 1;
				const estimatedRemaining = avgTimePerIteration * remainingIterations;
				const useWarmCache = this.shouldUseWarmCache(i);
				const iterationUrl = this.getIterationUrl(
					serverUrl,
					i,
					false,
					useWarmCache
				);

				this.logger.info(
					`Running iteration ${i + 1}/${this.config.iterations}${estimatedRemaining > 0 ? ` (est. ${Math.round(estimatedRemaining)}s remaining)` : ""}...`
				);
				this.logger.debug(
					`Cache mode ${this.config.runProfile.cacheMode}; warm cache ${useWarmCache ? "enabled" : "disabled"}`
				);

				try {
					const result = await this.runSingleBenchmarkWithRetry(
						browser,
						iterationUrl,
						false,
						i + 1,
						useWarmCache
					);
					results.push(result);

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
					// Continue so quality gates can evaluate failure rate.
				} finally {
					await this.cleanupBetweenIterations();
				}
			}

			if (results.length === 0) {
				throw new Error(
					"All benchmark iterations failed. Check logs for details."
				);
			}
		} finally {
			if (this.warmContext) {
				await this.warmContext.close();
				this.warmContext = null;
			}
			await browser.close();
		}

		const totalTimeSeconds = Math.round(
			(Date.now() - startTime) / MILLISECONDS_TO_SECONDS
		);
		this.logger.info(
			`Benchmark completed in ${totalTimeSeconds}s (${results.length} successful iterations)`
		);

		const averages = this.performanceAggregator.calculateAverages(results);
		const statistics =
			this.performanceAggregator.getStatisticalSummary(results);
		const quality = this.buildQualitySummary(results, statistics);

		if (quality.successfulIterations < quality.minSuccessfulIterations) {
			throw new Error(
				`Run failed quality gate: only ${quality.successfulIterations}/${quality.requestedIterations} iterations succeeded (minimum ${quality.minSuccessfulIterations})`
			);
		}

		if (quality.failureRate > quality.maxFailureRate) {
			throw new Error(
				`Run failed quality gate: failure rate ${(quality.failureRate * 100).toFixed(1)}% exceeds ${(quality.maxFailureRate * 100).toFixed(1)}%`
			);
		}

		if (!quality.stable) {
			this.logger.warn(
				`Run is unstable for metrics: ${quality.unstableMetrics.join(", ")}`
			);
		}

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
			statistics,
			quality,
			environment: {
				chromiumVersion,
			},
		};
	}

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
			const firstSelector = this.config.cookieBanner?.selectors?.[0];
			if (firstSelector) {
				this.logger.debug(
					`No explicit wait condition found, using first cookie banner selector: ${firstSelector}`
				);
				await page.waitForSelector(firstSelector);
			}
		}
	}
}
