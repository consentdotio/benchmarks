import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	multiselect,
	outro,
	text,
} from "@clack/prompts";
import {
	type BenchmarkResult,
	BenchmarkRunner,
	buildAndServeNextApp,
	cleanupServer,
	type ServerInfo,
} from "@consentio/runner";
import color from "picocolors";
import {
	DEFAULT_DOM_SIZE,
	DEFAULT_ITERATIONS,
	DEFAULT_THIRD_PARTY_DOMAINS,
	HALF_SECOND,
	PERCENTAGE_DIVISOR,
	readConfig,
	SEPARATOR_WIDTH,
} from "../utils";
import type { CliLogger } from "../utils/logger";
import { calculateScores, printScores } from "../utils/scoring";

/**
 * Calculate average from array
 */
function calculateAverage(values: number[]): number {
	return values.reduce((acc, curr) => acc + curr, 0) / values.length;
}

/**
 * Calculate timing metrics from benchmark results
 */
function calculateTimingMetrics(details: BenchmarkResult["details"]) {
	return {
		fcp: calculateAverage(details.map((d) => d.timing.firstContentfulPaint)),
		lcp: calculateAverage(details.map((d) => d.timing.largestContentfulPaint)),
		cls: calculateAverage(details.map((d) => d.timing.cumulativeLayoutShift)),
		tbt: calculateAverage(
			details.map((d) => d.timing.mainThreadBlocking.total)
		),
		tti: calculateAverage(details.map((d) => d.timing.timeToInteractive)),
	};
}

/**
 * Calculate size metrics from benchmark results
 */
function calculateSizeMetrics(details: BenchmarkResult["details"]) {
	return {
		totalSize: calculateAverage(details.map((d) => d.size.total)),
		jsSize: calculateAverage(details.map((d) => d.size.scripts.total)),
		cssSize: calculateAverage(details.map((d) => d.size.styles)),
		imageSize: calculateAverage(details.map((d) => d.size.images)),
		fontSize: calculateAverage(details.map((d) => d.size.fonts)),
		otherSize: calculateAverage(details.map((d) => d.size.other)),
	};
}

/**
 * Calculate network metrics from benchmark results
 */
function calculateNetworkMetrics(details: BenchmarkResult["details"]) {
	const totalRequests = calculateAverage(
		details.map(
			(d) =>
				d.resources.scripts.length +
				d.resources.styles.length +
				d.resources.images.length +
				d.resources.fonts.length +
				d.resources.other.length
		)
	);

	const thirdPartyRequests = calculateAverage(
		details.map((d) => d.resources.scripts.filter((s) => s.isThirdParty).length)
	);

	const thirdPartySize = calculateAverage(
		details.map((d) => d.size.thirdParty)
	);

	return {
		totalRequests,
		thirdPartyRequests,
		thirdPartySize,
		thirdPartyDomains: DEFAULT_THIRD_PARTY_DOMAINS,
	};
}

/**
 * Calculate cookie banner metrics from benchmark results
 */
function calculateCookieBannerMetrics(
	details: BenchmarkResult["details"],
	logger: CliLogger
) {
	// Require consistent detection across ALL iterations for true positive
	const allDetected = details.every((r) => r.cookieBanner.detected);
	if (!allDetected) {
		logger.warn(
			"⚠️ [SCORING] Banner detection inconsistent or failed - marking as not detected"
		);
	}

	// Calculate timing
	const detectionSuccess = details.some((r) => r.cookieBanner.detected);
	let cookieBannerTiming: number | null = null;

	if (detectionSuccess) {
		const timingValues = details.map((r) => r.cookieBanner.visibilityTime);
		const hasNullValues = timingValues.some((t) => t === null || t === 0);

		if (hasNullValues) {
			logger.warn(
				"⚠️ [SCORING] Inconsistent banner detection - applying penalty"
			);
		} else {
			const validTimings = timingValues.filter(
				(t): t is number => t !== null && t > 0
			);
			if (validTimings.length === details.length && validTimings.length > 0) {
				cookieBannerTiming = calculateAverage(validTimings);
			}
		}
	} else {
		logger.warn(
			"⚠️ [SCORING] No banner detected in any iteration - applying penalty"
		);
	}

	// Calculate coverage
	let cookieBannerCoverage = 0;
	const detectionConsistent = details.every((r) => r.cookieBanner.detected);
	if (detectionConsistent) {
		cookieBannerCoverage =
			calculateAverage(details.map((d) => d.cookieBanner.viewportCoverage)) /
			PERCENTAGE_DIVISOR;
	} else {
		logger.warn("⚠️ [SCORING] Inconsistent detection - setting coverage to 0");
	}

	return {
		cookieBannerDetected: allDetected,
		cookieBannerTiming,
		cookieBannerCoverage,
	};
}

/**
 * Calculate performance metrics from benchmark results
 */
function calculatePerformanceMetrics(details: BenchmarkResult["details"]) {
	return {
		domSize: DEFAULT_DOM_SIZE,
		mainThreadBlocking: calculateAverage(
			details.map((d) => d.timing.mainThreadBlocking.total)
		),
		layoutShifts: calculateAverage(
			details.map((d) => d.timing.cumulativeLayoutShift)
		),
	};
}

/**
 * Find all benchmark directories
 */
async function findBenchmarkDirs(logger: CliLogger): Promise<string[]> {
	const benchmarksDir = "benchmarks";
	try {
		const entries = await readdir(benchmarksDir, { withFileTypes: true });
		const dirs = entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
			.map((entry) => entry.name);
		return dirs;
	} catch (error) {
		logger.debug("Failed to read benchmarks directory:", error);
		return [];
	}
}

/**
 * Run a single benchmark for a specific app
 */
async function runSingleBenchmark(
	logger: CliLogger,
	appPath: string,
	showScores = true,
	iterationsOverride?: number
): Promise<boolean> {
	const configPath = appPath ? join(appPath, "config.json") : undefined;
	const config = readConfig(configPath);
	if (!config) {
		logger.error(
			`Failed to read config.json for ${appPath || "current directory"}`
		);
		return false;
	}

	// Override iterations if provided
	if (iterationsOverride !== undefined && iterationsOverride > 0) {
		config.iterations = iterationsOverride;
	}

	try {
		let serverInfo: ServerInfo | null = null;
		let benchmarkUrl: string;

		// Check if remote benchmarking is enabled
		if (config.remote?.enabled && config.remote.url) {
			logger.info(`🌐 Running remote benchmark against: ${config.remote.url}`);
			benchmarkUrl = config.remote.url;
		} else {
			logger.info("🏗️ Building and serving app locally...");
			serverInfo = await buildAndServeNextApp(logger, appPath);
			benchmarkUrl = serverInfo.url;
		}

		const cwd = appPath || process.cwd();

		// Create traces directory if it doesn't exist
		const tracesDir = join(cwd, "traces");
		try {
			await mkdir(tracesDir, { recursive: true });
		} catch {
			// Directory might already exist, ignore error
		}
		logger.info(`📊 Tracing enabled - traces will be saved to: ${tracesDir}`);

		try {
			// Create benchmark runner and run benchmarks with trace saving enabled
			const runner = new BenchmarkRunner(config, logger, {
				saveTrace: true,
				traceDir: tracesDir,
			});
			const result = await runner.runBenchmarks(benchmarkUrl);

			// Create app data for transparency scoring
			const appData = {
				name: config.name,
				baseline: config.baseline ?? false,
				company: config.company ? JSON.stringify(config.company) : null,
				techStack: JSON.stringify(config.techStack),
				source: config.source ? JSON.stringify(config.source) : null,
				tags: config.tags ? JSON.stringify(config.tags) : null,
			};

			// Calculate all metrics using helper functions
			const timingMetrics = calculateTimingMetrics(result.details);
			const sizeMetrics = calculateSizeMetrics(result.details);
			const networkMetrics = calculateNetworkMetrics(result.details);
			const cookieBannerMetrics = calculateCookieBannerMetrics(
				result.details,
				logger
			);
			const performanceMetrics = calculatePerformanceMetrics(result.details);

			// Calculate scores
			const scores = calculateScores(
				timingMetrics,
				sizeMetrics,
				networkMetrics,
				cookieBannerMetrics,
				performanceMetrics,
				config.baseline ?? false,
				appData
			);

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
				scores,
				metadata: {
					timestamp: new Date().toISOString(),
					iterations: config.iterations,
					languages: config.techStack.languages,
					isRemote: config.remote?.enabled ?? false,
					url: config.remote?.enabled ? config.remote.url : undefined,
				},
			};

			// Write results to file
			const outputPath = join(cwd, "results.json");
			await writeFile(outputPath, JSON.stringify(resultsData, null, 2));
			logger.success(`Benchmark results saved to ${outputPath}`);

			// Print scores if requested
			if (showScores && scores) {
				logger.info("📊 Benchmark Scores:");
				printScores(scores);
			}

			return true;
		} finally {
			// Only cleanup server if we started one
			if (serverInfo) {
				cleanupServer(serverInfo);
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error) {
			logger.error(`Error running benchmark: ${error.message}`);
		} else {
			logger.error("An unknown error occurred during benchmark");
		}
		return false;
	}
}

/**
 * Main benchmark command with multi-select support
 */
export async function benchmarkCommand(
	logger: CliLogger,
	appPath?: string
): Promise<void> {
	// If a specific app path is provided, run that benchmark directly
	if (appPath) {
		const success = await runSingleBenchmark(logger, appPath, true);
		if (!success) {
			process.exit(1);
		}
		process.exit(0);
	}

	// Otherwise, show multi-select for available benchmarks
	logger.clear();
	await setTimeout(HALF_SECOND);

	intro(`${color.bgMagenta(color.white(" benchmark "))}`);

	// Find available benchmarks
	const availableBenchmarks = await findBenchmarkDirs(logger);

	if (availableBenchmarks.length === 0) {
		logger.error("No benchmarks found in the benchmarks/ directory");
		logger.info(
			"Create benchmark directories with config.json files to get started"
		);
		process.exit(1);
	}

	logger.info(
		`Found ${availableBenchmarks.length} benchmark(s): ${color.cyan(availableBenchmarks.join(", "))}`
	);

	// Ask user to select benchmarks
	const selectedBenchmarks = await multiselect({
		message: "Select benchmarks to run (use space to toggle):",
		options: availableBenchmarks.map((name) => ({
			value: name,
			label: name,
			hint: join("benchmarks", name),
		})),
		required: true,
	});

	if (isCancel(selectedBenchmarks)) {
		cancel("Operation cancelled");
		return;
	}

	if (!Array.isArray(selectedBenchmarks) || selectedBenchmarks.length === 0) {
		logger.warn("No benchmarks selected");
		return;
	}

	// Load configs to get default iterations
	const benchmarkConfigs = new Map<string, number>();
	for (const benchmarkName of selectedBenchmarks) {
		const benchmarkPath = join("benchmarks", benchmarkName);
		const configPath = join(benchmarkPath, "config.json");
		const config = readConfig(configPath);
		if (config) {
			benchmarkConfigs.set(benchmarkName, config.iterations);
		}
	}

	// Find the most common iteration count or first one
	const defaultIterations =
		benchmarkConfigs.size > 0
			? Array.from(benchmarkConfigs.values())[0]
			: DEFAULT_ITERATIONS;

	// Show iteration counts for selected benchmarks
	const iterationsList = Array.from(selectedBenchmarks)
		.map((name) => {
			const iterations = benchmarkConfigs.get(name) ?? "?";
			return `${name}: ${iterations}`;
		})
		.join(", ");

	logger.info(`Config iterations: ${color.dim(iterationsList)}`);

	// Ask for iterations override
	const iterationsInput = await text({
		message: "Number of iterations (press Enter to use config values):",
		placeholder: `Default: ${defaultIterations}`,
		defaultValue: "",
		validate: (value) => {
			if (!value || value === "") {
				return; // Empty is valid (use defaults)
			}
			const num = Number.parseInt(value, 10);
			if (Number.isNaN(num) || num < 1) {
				return "Please enter a valid number greater than 0";
			}
		},
	});

	if (isCancel(iterationsInput)) {
		cancel("Operation cancelled");
		return;
	}

	// Parse iterations - if empty string, use undefined to let each benchmark use its config
	const iterationsOverride =
		iterationsInput === "" ? undefined : Number.parseInt(iterationsInput, 10);

	if (iterationsOverride !== undefined) {
		logger.info(
			`Using ${color.bold(color.cyan(String(iterationsOverride)))} iterations for all benchmarks`
		);
	} else {
		logger.info("Using iteration counts from each benchmark config");
	}

	// Ask if user wants to see results panel after completion
	const showResults = await confirm({
		message: "Show results panel after completion?",
		initialValue: true,
	});

	if (isCancel(showResults)) {
		cancel("Operation cancelled");
		return;
	}

	// Run selected benchmarks sequentially
	const results: Array<{ name: string; success: boolean }> = [];

	for (let i = 0; i < selectedBenchmarks.length; i += 1) {
		const benchmarkName = selectedBenchmarks[i];
		const benchmarkPath = join("benchmarks", benchmarkName);

		logger.info(
			`\n${color.bold(color.cyan(`[${i + 1}/${selectedBenchmarks.length}]`))} Running benchmark: ${color.bold(benchmarkName)}`
		);

		const success = await runSingleBenchmark(
			logger,
			benchmarkPath,
			false, // Don't show inline scores anymore
			iterationsOverride
		);

		results.push({ name: benchmarkName, success });

		if (!success) {
			logger.error(
				`Failed to complete benchmark for ${benchmarkName}, continuing...`
			);
		}

		// Add spacing between benchmarks
		if (i < selectedBenchmarks.length - 1) {
			logger.message(`\n${"─".repeat(SEPARATOR_WIDTH)}\n`);
		}
	}

	// Summary
	logger.message("\n");
	outro(
		`${color.bold("Summary:")} ${results.filter((r) => r.success).length}/${results.length} benchmarks completed successfully`
	);

	// Show failed benchmarks if any
	const failed = results.filter((r) => !r.success);
	if (failed.length > 0) {
		logger.warn(`Failed benchmarks: ${failed.map((r) => r.name).join(", ")}`);
	}

	// Show results panel if requested
	if (showResults === true && results.some((r) => r.success)) {
		logger.message(`\n${"═".repeat(SEPARATOR_WIDTH)}\n`);
		logger.info("Loading results panel...\n");

		// Get successful benchmark names
		const successfulBenchmarks = results
			.filter((r) => r.success)
			.map((r) => r.name);

		// Dynamically import and run the results command with specific benchmarks
		const { resultsCommand } = await import("./results.js");
		await resultsCommand(logger, successfulBenchmarks);
	}

	// Exit process after command completes
	process.exit(0);
}
