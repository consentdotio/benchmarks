import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus } from "node:os";
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
	type Config,
	type ServerInfo,
} from "@consentio/runner";
import color from "picocolors";
import {
	ConfigValidationError,
	DEFAULT_DOM_SIZE,
	DEFAULT_ITERATIONS,
	findProjectRoot,
	formatConfigIssues,
	HALF_SECOND,
	loadValidatedConfigSync,
	PERCENTAGE_DIVISOR,
	resolveBenchmarkPath,
	SEPARATOR_WIDTH,
} from "../utils";
import type { CliLogger } from "../utils/logger";
import { calculateScores, printScores } from "../utils/scoring";

type TraceMode = "off" | "on-failure" | "all";

const require = createRequire(import.meta.url);

type BenchmarkCommandOptions = {
	traceMode?: TraceMode;
	profile?: Config["runProfile"]["networkProfile"];
	cacheMode?: Config["runProfile"]["cacheMode"];
};

/**
 * Calculate average from array
 */
function calculateAverage(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((acc, curr) => acc + curr, 0) / values.length;
}

/**
 * Calculate timing metrics from benchmark results
 */
function calculateTimingMetrics(details: BenchmarkResult["details"]) {
	const validTtfb = details
		.map((d) => d.timing.timeToFirstByte)
		.filter((value): value is number => value !== null && value > 0);
	const validInp = details
		.map((d) => d.timing.interactionToNextPaint)
		.filter((value): value is number => value !== null && value > 0);

	return {
		fcp: calculateAverage(details.map((d) => d.timing.firstContentfulPaint)),
		lcp: calculateAverage(details.map((d) => d.timing.largestContentfulPaint)),
		cls: calculateAverage(details.map((d) => d.timing.cumulativeLayoutShift)),
		tbt: calculateAverage(
			details.map((d) => d.timing.mainThreadBlocking.total)
		),
		tti: calculateAverage(details.map((d) => d.timing.timeToInteractive)),
		timeToFirstByte:
			validTtfb.length > 0 ? calculateAverage(validTtfb) : undefined,
		interactionToNextPaint:
			validInp.length > 0 ? calculateAverage(validInp) : null,
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
		details.map(
			(d) =>
				d.resources.scripts.filter((r) => r.isThirdParty).length +
				d.resources.styles.filter((r) => r.isThirdParty).length +
				d.resources.images.filter((r) => r.isThirdParty).length +
				d.resources.fonts.filter((r) => r.isThirdParty).length +
				d.resources.other.filter((r) => r.isThirdParty).length
		)
	);

	const thirdPartySize = calculateAverage(
		details.map((d) => d.size.thirdParty)
	);

	const thirdPartyDomains = calculateAverage(
		details.map((d) => {
			const domains = new Set<string>();
			for (const resource of [
				...d.resources.scripts,
				...d.resources.styles,
				...d.resources.images,
				...d.resources.fonts,
				...d.resources.other,
			]) {
				if (resource.isThirdParty && resource.name) {
					try {
						domains.add(new URL(resource.name).hostname);
					} catch {
						// Skip invalid URLs
					}
				}
			}
			return domains.size;
		})
	);

	const scriptLoadTime = calculateAverage(
		details.map(
			(d) =>
				d.timing.scripts.bundled.loadEnd + d.timing.scripts.thirdParty.loadEnd
		)
	);

	return {
		totalRequests,
		thirdPartyRequests,
		thirdPartySize,
		thirdPartyDomains,
		scriptLoadTime,
	};
}

/**
 * Calculate cookie banner metrics from benchmark results.
 */
function calculateCookieBannerMetrics(
	details: BenchmarkResult["details"],
	logger: CliLogger
) {
	const allDetected = details.every((r) => r.cookieBanner.detected);
	if (!allDetected) {
		logger.warn(
			"⚠️ [SCORING] Banner detection inconsistent or failed - marking as not detected"
		);
	}

	const detectionSuccess = details.some((r) => r.cookieBanner.detected);
	let cookieBannerVisibleTimeMs: number | null = null;

	if (detectionSuccess) {
		const timingValues = details.map(
			(r) => r.cookieBanner.userVisibleTime ?? r.cookieBanner.visibilityTime
		);
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
				cookieBannerVisibleTimeMs = calculateAverage(validTimings);
			}
		}
	} else {
		logger.warn(
			"⚠️ [SCORING] No banner detected in any iteration - applying penalty"
		);
	}

	let cookieBannerCoverage = 0;
	if (allDetected) {
		cookieBannerCoverage =
			calculateAverage(details.map((d) => d.cookieBanner.viewportCoverage)) /
			PERCENTAGE_DIVISOR;
	} else {
		logger.warn("⚠️ [SCORING] Inconsistent detection - setting coverage to 0");
	}

	return {
		cookieBannerDetected: allDetected,
		cookieBannerVisibleTimeMs,
		cookieBannerCoverage,
	};
}

/**
 * Calculate performance metrics from benchmark results
 */
function calculatePerformanceMetrics(details: BenchmarkResult["details"]) {
	return {
		domSize: calculateAverage(
			details.map((d) => d.dom?.size ?? DEFAULT_DOM_SIZE)
		),
		mainThreadBlocking: calculateAverage(
			details.map((d) => d.timing.mainThreadBlocking.total)
		),
		layoutShifts: calculateAverage(
			details.map((d) => d.timing.cumulativeLayoutShift)
		),
	};
}

function loadConfig(logger: CliLogger, configPath: string): Config {
	try {
		return loadValidatedConfigSync(configPath);
	} catch (error) {
		if (error instanceof ConfigValidationError) {
			logger.error(error.message);
			logger.error(formatConfigIssues(error.issues));
			throw error;
		}
		throw error;
	}
}

function getGitContext(projectRoot: string): {
	sha: string | null;
	dirty: boolean;
} {
	try {
		const sha = execSync("git rev-parse HEAD", {
			cwd: projectRoot,
			encoding: "utf-8",
		}).trim();
		const dirty =
			execSync("git status --porcelain", {
				cwd: projectRoot,
				encoding: "utf-8",
			}).trim().length > 0;

		return { sha, dirty };
	} catch {
		return { sha: null, dirty: false };
	}
}

function detectPlaywrightVersion(): string {
	try {
		const pkg = require("@playwright/test/package.json") as {
			version?: string;
		};
		return pkg.version ?? "unknown";
	} catch {
		return "unknown";
	}
}

function resolveTraceMode(traceMode?: TraceMode): TraceMode {
	if (!traceMode) {
		return "on-failure";
	}
	if (
		traceMode === "off" ||
		traceMode === "on-failure" ||
		traceMode === "all"
	) {
		return traceMode;
	}
	throw new Error(`Invalid trace mode: ${traceMode}`);
}

/**
 * Find all benchmark directories
 */
async function findBenchmarkDirs(
	logger: CliLogger,
	projectRoot: string
): Promise<string[]> {
	const benchmarksDir = join(projectRoot, "benchmarks");
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
	iterationsOverride?: number,
	options?: BenchmarkCommandOptions
): Promise<boolean> {
	const configPath = appPath ? join(appPath, "config.json") : undefined;
	if (!configPath) {
		logger.error("Missing benchmark config path");
		return false;
	}

	const config = loadConfig(logger, configPath);

	if (iterationsOverride !== undefined && iterationsOverride > 0) {
		const originalIterations = config.iterations;
		const originalMinimumSuccessfulIterations =
			config.measurement.minSuccessfulIterations;

		config.iterations = iterationsOverride;

		const successRatio =
			originalIterations > 0
				? originalMinimumSuccessfulIterations / originalIterations
				: 1;
		const scaledMinimumSuccessfulIterations = Math.ceil(
			iterationsOverride * successRatio
		);
		config.measurement.minSuccessfulIterations = Math.max(
			1,
			Math.min(iterationsOverride, scaledMinimumSuccessfulIterations)
		);

		logger.debug(
			`Adjusted measurement.minSuccessfulIterations from ${originalMinimumSuccessfulIterations} to ${config.measurement.minSuccessfulIterations} for ${iterationsOverride} iteration(s)`
		);
	}

	if (options?.profile) {
		config.runProfile.networkProfile = options.profile;
	}
	if (options?.cacheMode) {
		config.runProfile.cacheMode = options.cacheMode;
	}

	const traceMode = resolveTraceMode(options?.traceMode);
	const runStartedAtUtc = new Date().toISOString();

	try {
		let serverInfo: ServerInfo | null = null;
		let benchmarkUrl: string;

		if (config.remote?.enabled && config.remote.url) {
			logger.info(`🌐 Running remote benchmark against: ${config.remote.url}`);
			benchmarkUrl = config.remote.url;
		} else {
			logger.info("🏗️ Building and serving app locally...");
			serverInfo = await buildAndServeNextApp(logger, appPath);
			benchmarkUrl = serverInfo.url;
		}

		const cwd = appPath || process.cwd();
		let tracesDir: string | undefined;

		if (traceMode !== "off") {
			tracesDir = join(cwd, "traces");
			try {
				await mkdir(tracesDir, { recursive: true });
			} catch (error: unknown) {
				if (
					error &&
					typeof error === "object" &&
					"code" in error &&
					error.code !== "EEXIST"
				) {
					throw error;
				}
			}
			logger.info(`📊 Tracing mode: ${traceMode} (${tracesDir})`);
		} else {
			logger.info("📊 Tracing mode: off");
		}

		try {
			const runner = new BenchmarkRunner(config, logger, {
				traceMode,
				traceDir: tracesDir,
			});
			const result = await runner.runBenchmarks(benchmarkUrl);

			if (!result.details || result.details.length === 0) {
				logger.error("No successful benchmark iterations");
				return false;
			}

			const appData = {
				name: config.name,
				baseline: config.baseline ?? false,
				company: config.company ? JSON.stringify(config.company) : null,
				techStack: JSON.stringify(config.techStack),
				source: config.source ? JSON.stringify(config.source) : null,
				tags: config.tags ? JSON.stringify(config.tags) : null,
			};

			const timingMetrics = calculateTimingMetrics(result.details);
			const sizeMetrics = calculateSizeMetrics(result.details);
			const networkMetrics = calculateNetworkMetrics(result.details);
			const cookieBannerMetrics = calculateCookieBannerMetrics(
				result.details,
				logger
			);
			const performanceMetrics = calculatePerformanceMetrics(result.details);

			const scores = calculateScores(
				timingMetrics,
				sizeMetrics,
				networkMetrics,
				cookieBannerMetrics,
				performanceMetrics,
				config.baseline ?? false,
				appData,
				result.details[0]?.timing.networkInformation
			);

			const projectRoot = findProjectRoot();
			const gitContext = getGitContext(projectRoot);
			const cpuInfo = cpus();
			const configHash = createHash("sha256")
				.update(JSON.stringify(config))
				.digest("hex");
			const runCompletedAtUtc = new Date().toISOString();

			const resultsData = {
				$schema:
					"./node_modules/@cookiebench/benchmark-schema/results.schema.json",
				schemaVersion: 2,
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
					generatedAtUtc: runCompletedAtUtc,
					runStartedAtUtc,
					runCompletedAtUtc,
					iterationsRequested: config.iterations,
					iterationsSuccessful: result.details.length,
					isRemote: config.remote?.enabled ?? false,
					url: config.remote?.enabled ? config.remote.url : undefined,
					traceMode,
					runProfile: config.runProfile,
					measurement: config.measurement,
					quality: result.quality,
					statistics: result.statistics,
					environment: {
						nodeVersion: process.version,
						platform: process.platform,
						arch: process.arch,
						cpuModel: cpuInfo[0]?.model ?? "unknown",
						cpuCores: cpuInfo.length,
						playwrightVersion: detectPlaywrightVersion(),
						chromiumVersion: result.environment.chromiumVersion,
						gitSha: gitContext.sha,
						gitDirty: gitContext.dirty,
						configHash,
					},
					baselineRole: config.baseline ? "reference" : "candidate",
				},
			};

			const outputPath = join(cwd, "results.json");
			await writeFile(outputPath, JSON.stringify(resultsData, null, 2));
			logger.success(`Benchmark results saved to ${outputPath}`);

			if (showScores && scores) {
				logger.info("📊 Benchmark Scores:");
				printScores(scores);
			}

			return true;
		} finally {
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
	appPath?: string,
	options?: BenchmarkCommandOptions
): Promise<void> {
	const projectRoot = findProjectRoot();

	if (appPath) {
		const resolvedAppPath = resolveBenchmarkPath(projectRoot, appPath);
		const success = await runSingleBenchmark(
			logger,
			resolvedAppPath,
			true,
			undefined,
			options
		);
		if (!success) {
			throw new Error(`Benchmark failed for ${appPath}`);
		}
		return;
	}

	logger.clear();
	await setTimeout(HALF_SECOND);

	intro(`${color.bgMagenta(color.white(" benchmark "))}`);

	const availableBenchmarks = await findBenchmarkDirs(logger, projectRoot);

	if (availableBenchmarks.length === 0) {
		logger.error("No benchmarks found in the benchmarks/ directory");
		logger.info(
			"Create benchmark directories with config.json files to get started"
		);
		throw new Error("No benchmarks found");
	}

	logger.info(
		`Found ${availableBenchmarks.length} benchmark(s): ${color.cyan(availableBenchmarks.join(", "))}`
	);

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

	const benchmarkConfigs = new Map<string, number>();
	for (const benchmarkName of selectedBenchmarks) {
		const benchmarkPath = join(projectRoot, "benchmarks", benchmarkName);
		const configPath = join(benchmarkPath, "config.json");
		const config = loadConfig(logger, configPath);
		benchmarkConfigs.set(benchmarkName, config.iterations);
	}

	const defaultIterations =
		benchmarkConfigs.size > 0
			? Array.from(benchmarkConfigs.values())[0]
			: DEFAULT_ITERATIONS;

	const iterationsList = Array.from(selectedBenchmarks)
		.map((name) => {
			const iterations = benchmarkConfigs.get(name) ?? "?";
			return `${name}: ${iterations}`;
		})
		.join(", ");

	logger.info(`Config iterations: ${color.dim(iterationsList)}`);

	const iterationsInput = await text({
		message: "Number of iterations (press Enter to use config values):",
		placeholder: `Default: ${defaultIterations}`,
		defaultValue: "",
		validate: (value) => {
			if (!value || value === "") {
				return;
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

	const iterationsOverride =
		iterationsInput === "" ? undefined : Number.parseInt(iterationsInput, 10);

	if (iterationsOverride !== undefined) {
		logger.info(
			`Using ${color.bold(color.cyan(String(iterationsOverride)))} iterations for all benchmarks`
		);
	} else {
		logger.info("Using iteration counts from each benchmark config");
	}

	const showResults = await confirm({
		message: "Show results panel after completion?",
		initialValue: true,
	});

	if (isCancel(showResults)) {
		cancel("Operation cancelled");
		return;
	}

	const results: Array<{ name: string; success: boolean }> = [];

	for (let i = 0; i < selectedBenchmarks.length; i += 1) {
		const benchmarkName = selectedBenchmarks[i];
		const benchmarkPath = join(projectRoot, "benchmarks", benchmarkName);

		logger.info(
			`\n${color.bold(color.cyan(`[${i + 1}/${selectedBenchmarks.length}]`))} Running benchmark: ${color.bold(benchmarkName)}`
		);

		const success = await runSingleBenchmark(
			logger,
			benchmarkPath,
			false,
			iterationsOverride,
			options
		);

		results.push({ name: benchmarkName, success });

		if (!success) {
			logger.error(
				`Failed to complete benchmark for ${benchmarkName}, continuing...`
			);
		}

		if (i < selectedBenchmarks.length - 1) {
			logger.message(`\n${"─".repeat(SEPARATOR_WIDTH)}\n`);
		}
	}

	logger.message("\n");
	outro(
		`${color.bold("Summary:")} ${results.filter((r) => r.success).length}/${results.length} benchmarks completed successfully`
	);

	const failed = results.filter((r) => !r.success);
	if (failed.length > 0) {
		logger.warn(`Failed benchmarks: ${failed.map((r) => r.name).join(", ")}`);
	}

	if (showResults === true && results.some((r) => r.success)) {
		logger.message(`\n${"═".repeat(SEPARATOR_WIDTH)}\n`);
		logger.info("Loading results panel...\n");

		const successfulBenchmarks = results
			.filter((r) => r.success)
			.map((r) => r.name);

		try {
			const { resultsCommand } = await import("./results.js");
			await resultsCommand(logger, successfulBenchmarks);
		} catch (error) {
			logger.error("Failed to load results panel");
			logger.debug(error instanceof Error ? error.message : String(error));
		}
	}
}
