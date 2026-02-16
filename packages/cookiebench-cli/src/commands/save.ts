import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { cancel, confirm, intro, isCancel, multiselect } from "@clack/prompts";
import type { Config } from "@consentio/runner";
import { HALF_SECOND, PERCENTAGE_DIVISOR } from "@consentio/shared";
import { config as loadDotenv } from "dotenv";
import color from "picocolors";
import type { BenchmarkScores } from "../types";
import {
	ConfigValidationError,
	formatConfigIssues,
	loadValidatedConfigSync,
} from "../utils";
import { isAdminUser } from "../utils/auth";
import { findProjectRoot } from "../utils/project-root";
import type { CliLogger } from "../utils/logger";
import { calculateScores } from "../utils/scoring";
import type { RawBenchmarkDetail } from "./results";

// Load environment variables from .env files
loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local" });
loadDotenv({ path: "www/.env.local" });

type BenchmarkOutput = {
	schemaVersion?: number;
	app: string;
	results: RawBenchmarkDetail[];
	scores?: BenchmarkScores;
	metadata?: Record<string, unknown>;
};

// Benchmark result type (matching the oRPC contract)
type BenchmarkResult = {
	name: string;
	baseline: boolean;
	cookieBannerConfig: unknown;
	techStack: unknown;
	internationalization: unknown;
	source: unknown;
	includes: string[];
	company?: string;
	tags: string[];
	details: RawBenchmarkDetail[];
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
		grade: "Excellent" | "Good" | "Fair" | "Poor" | "Critical";
		indexes?: {
			performanceIndex: number;
			governanceIndex: number;
			combinedIndex: number;
		};
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
			status: "excellent" | "good" | "fair" | "poor" | "critical";
		}>;
		insights: string[];
		recommendations: string[];
	};
};

const SAVE_REQUEST_TIMEOUT_MS = 15_000;

async function saveBenchmarkResult(
	logger: CliLogger,
	result: BenchmarkResult
): Promise<void> {
	const apiUrl = process.env.API_URL || "http://localhost:3000";
	const endpoint = `${apiUrl}/api/orpc/benchmarks/save`;
	const controller = new AbortController();
	const timeoutId = globalThis.setTimeout(
		() => controller.abort(),
		SAVE_REQUEST_TIMEOUT_MS
	);

	try {
		logger.debug(`Attempting to save ${result.name} to ${endpoint}`);

		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			signal: controller.signal,
			body: JSON.stringify(result),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`HTTP error! status: ${response.status}, body: ${errorText}`
			);
		}

		const responseData = await response.json();
		logger.success(`Saved ${result.name} (App ID: ${responseData.appId})`);
	} catch (error) {
		if (error instanceof Error) {
			const wasAborted =
				error.name === "AbortError" ||
				error.message.toLowerCase().includes("abort");
			if (wasAborted) {
				logger.error(
					`Request timed out after 15s while saving ${result.name} to ${apiUrl}`
				);
			}
			logger.error(`Failed to save ${result.name}: ${error.message}`);
			if (error.message.includes("fetch failed")) {
				logger.error(`Connection failed. Is the server running on ${apiUrl}?`);
			}
		} else {
			logger.error(`Failed to save ${result.name}: Unknown error`);
		}
		throw error;
	} finally {
		globalThis.clearTimeout(timeoutId);
	}
}

async function findResultsFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	try {
		const entries = await readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await findResultsFiles(fullPath)));
			} else if (entry.name === "results.json") {
				files.push(fullPath);
			}
		}
	} catch {
		// Silently fail if directory doesn't exist
	}

	return files;
}

function loadConfigForApp(
	logger: CliLogger,
	appName: string,
	projectRoot: string
): Config | null {
	const configPath = join(projectRoot, "benchmarks", appName, "config.json");

	try {
		return loadValidatedConfigSync(configPath);
	} catch (error) {
		if (error instanceof ConfigValidationError) {
			logger.error(`Invalid config for ${appName}`);
			logger.error(formatConfigIssues(error.issues));
			return null;
		}
		logger.debug(`Could not load config for ${appName}:`, error);
		return null;
	}
}

function transformScoresToContract(
	scores: BenchmarkScores
): BenchmarkResult["scores"] {
	return {
		totalScore: scores.totalScore,
		grade: scores.grade,
		indexes: scores.indexes,
		categoryScores: scores.categoryScores,
		categories: scores.categories.map((category) => ({
			name: category.name,
			score: category.score,
			maxScore: category.maxScore,
			weight: category.weight,
			details: category.details.map((detail) => ({
				metric: detail.name,
				value: detail.value ?? detail.score,
				score: detail.score,
				maxScore: detail.maxScore,
				reason: detail.reason,
			})),
			status: category.status,
		})),
		insights: scores.insights,
		recommendations: scores.recommendations,
	};
}

export async function saveCommand(
	logger: CliLogger,
	appName?: string
): Promise<void> {
	const projectRoot = findProjectRoot();

	// Double-check admin access (safeguard)
	if (!isAdminUser()) {
		logger.error("This command requires admin access");
		process.exit(1);
	}

	logger.clear();
	await sleep(HALF_SECOND);

	intro(
		`${color.bgBlue(color.white(" save "))} ${color.dim("Sync results to database")}`
	);

	// Check database configuration
	const databaseUrl =
		process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
	const authToken =
		process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
	const apiUrl = process.env.API_URL || "http://localhost:3000";

	logger.info(`API endpoint: ${color.cyan(apiUrl)}`);

	if (
		databaseUrl?.startsWith("libsql://") ||
		databaseUrl?.startsWith("wss://")
	) {
		logger.info(
			`Database: ${color.cyan(`Turso (${databaseUrl.split("@")[0]}@***)`)}`
		);
		if (!authToken) {
			logger.warn("⚠️  No auth token found. Database operations may fail.");
		}
	} else if (databaseUrl?.startsWith("file:")) {
		logger.info(`Database: ${color.cyan(`Local (${databaseUrl})`)}`);
	} else {
		logger.info(`Database: ${color.cyan("Local SQLite (benchmarks.db)")}`);
	}

	const resultsDir = join(projectRoot, "benchmarks");
	const resultsFiles = await findResultsFiles(resultsDir);

	if (resultsFiles.length === 0) {
		logger.error("No benchmark results found!");
		logger.info(
			`Run ${color.cyan("cookiebench benchmark")} first to generate results.`
		);
		return;
	}

	logger.info(`Found ${resultsFiles.length} results file(s)`);

	// Load all results
	const allResults: Record<string, BenchmarkOutput> = {};
	const nonV2Files: string[] = [];
	for (const file of resultsFiles) {
		try {
			const content = await readFile(file, "utf-8");
			const data: BenchmarkOutput = JSON.parse(content);

			if (data.schemaVersion !== 2) {
				nonV2Files.push(file);
				continue;
			}

			if (data.app && data.results) {
				allResults[data.app] = data;
			}
		} catch (error) {
			logger.debug(`Failed to load ${file}:`, error);
		}
	}

	if (nonV2Files.length > 0) {
		logger.error(
			`Found ${nonV2Files.length} non-v2 results files. Run ${color.cyan("cookiebench migrate-results")} first.`
		);
		return;
	}

	if (Object.keys(allResults).length === 0) {
		logger.error("No valid benchmark results found!");
		return;
	}

	// If specific app requested, save only that one
	if (appName) {
		const result = allResults[appName];
		if (!result) {
			logger.error(`No results found for app: ${appName}`);
			logger.info(`Available apps: ${Object.keys(allResults).join(", ")}`);
			return;
		}

		await saveAppToDatabase(logger, appName, result, projectRoot);
		logger.outro("Done!");
		return;
	}

	// Otherwise, show interactive selection
	const appOptions = Object.keys(allResults).map((name) => ({
		value: name,
		label: name,
		hint: `${allResults[name].results.length} iterations`,
	}));

	appOptions.push({
		value: "__all__",
		label: "Save all apps",
		hint: "Sync all benchmark results to database",
	});

	const selectedApps = await multiselect({
		message: "Select benchmarks to save to database:",
		options: appOptions,
		required: true,
	});

	if (isCancel(selectedApps)) {
		cancel("Operation cancelled");
		return;
	}

	if (!Array.isArray(selectedApps) || selectedApps.length === 0) {
		logger.warn("No benchmarks selected");
		return;
	}

	// Confirm before saving
	const appsToSave = selectedApps.includes("__all__")
		? Object.keys(allResults)
		: (selectedApps as string[]);

	const confirmBeforeSave = await confirm({
		message: `Save ${appsToSave.length} benchmark(s) to ${apiUrl}?`,
		initialValue: true,
	});

	if (isCancel(confirmBeforeSave) || !confirmBeforeSave) {
		cancel("Operation cancelled");
		return;
	}

	// Save selected apps
	let savedCount = 0;
	let errorCount = 0;

	for (const name of appsToSave) {
		try {
			await saveAppToDatabase(logger, name, allResults[name], projectRoot);
			savedCount += 1;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to save ${name}: ${error.message}`);
			} else {
				logger.error(`Failed to save ${name}: Unknown error`);
			}
			errorCount += 1;
		}
	}

	// Summary
	logger.message("");
	if (savedCount > 0) {
		logger.success(`Successfully saved ${savedCount} app(s)`);
	}
	if (errorCount > 0) {
		logger.warn(`Failed to save ${errorCount} app(s)`);
	}

	logger.outro(
		`Saved ${savedCount}/${appsToSave.length} benchmarks to database`
	);
}

async function saveAppToDatabase(
	logger: CliLogger,
	appName: string,
	result: BenchmarkOutput,
	projectRoot: string
): Promise<void> {
	const appConfig = loadConfigForApp(logger, appName, projectRoot);
	if (!appConfig) {
		throw new Error(
			`Cannot save ${appName}: benchmark config validation failed`
		);
	}
	const appResults = result.results;
	if (appResults.length === 0) {
		logger.warn(`Skipping ${appName}: no benchmark iterations found.`);
		return;
	}

	// Calculate scores if not already in results
	let scores = result.scores;
	if (!scores) {
		const appData = {
			name: appName,
			baseline: appName === "baseline",
			company: appConfig.company ? JSON.stringify(appConfig.company) : null,
			techStack: JSON.stringify(appConfig.techStack),
			source: appConfig.source ? JSON.stringify(appConfig.source) : null,
			tags: appConfig.tags ? JSON.stringify(appConfig.tags) : null,
		};

		scores = calculateScores(
			{
				fcp:
					appResults.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) /
					appResults.length,
				lcp:
					appResults.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) /
					appResults.length,
				cls:
					appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
					appResults.length,
				tbt:
					appResults.reduce(
						(a, b) => a + b.timing.mainThreadBlocking.total,
						0
					) / appResults.length,
				tti:
					appResults.reduce((a, b) => a + b.timing.timeToInteractive, 0) /
					appResults.length,
				timeToFirstByte:
					appResults.reduce((a, b) => a + (b.timing.timeToFirstByte || 0), 0) /
					appResults.length,
				interactionToNextPaint: (() => {
					const validValues = appResults
						.map((resultItem) => resultItem.timing.interactionToNextPaint)
						.filter(
							(inp): inp is number =>
								inp !== null && inp !== undefined && Number.isFinite(inp)
						);
					return validValues.length > 0
						? validValues.reduce((a, b) => a + b, 0) / validValues.length
						: null;
				})(),
			},
			{
				totalSize:
					appResults.reduce((a, b) => a + b.size.total, 0) / appResults.length,
				jsSize:
					appResults.reduce((a, b) => a + b.size.scripts.total, 0) /
					appResults.length,
				cssSize:
					appResults.reduce((a, b) => a + b.size.styles, 0) / appResults.length,
				imageSize:
					appResults.reduce((a, b) => a + b.size.images, 0) / appResults.length,
				fontSize:
					appResults.reduce((a, b) => a + b.size.fonts, 0) / appResults.length,
				otherSize:
					appResults.reduce((a, b) => a + b.size.other, 0) / appResults.length,
			},
			{
				totalRequests:
					appResults.reduce(
						(a, b) =>
							a +
							b.resources.scripts.length +
							b.resources.styles.length +
							b.resources.images.length +
							b.resources.fonts.length +
							b.resources.other.length,
						0
					) / appResults.length,
				thirdPartyRequests:
					appResults.reduce(
						(a, b) =>
							a +
							b.resources.scripts.filter((s) => s.isThirdParty).length +
							b.resources.styles.filter((s) => s.isThirdParty).length +
							b.resources.images.filter((s) => s.isThirdParty).length +
							b.resources.fonts.filter((s) => s.isThirdParty).length +
							b.resources.other.filter((s) => s.isThirdParty).length,
						0
					) / appResults.length,
				thirdPartySize:
					appResults.reduce((a, b) => a + b.size.thirdParty, 0) /
					appResults.length,
				thirdPartyDomains:
					appResults.reduce((sum, appResult) => {
						const thirdPartyHosts = new Set<string>();
						const allThirdPartyResources = [
							...appResult.resources.scripts.filter((r) => r.isThirdParty),
							...appResult.resources.styles.filter((r) => r.isThirdParty),
							...appResult.resources.images.filter((r) => r.isThirdParty),
							...appResult.resources.fonts.filter((r) => r.isThirdParty),
							...appResult.resources.other.filter((r) => r.isThirdParty),
						];
						for (const resource of allThirdPartyResources) {
							try {
								thirdPartyHosts.add(new URL(resource.name).hostname);
							} catch {
								// Ignore invalid URLs
							}
						}
						return sum + thirdPartyHosts.size;
					}, 0) / appResults.length,
				scriptLoadTime:
					appResults.reduce(
						(a, b) =>
							a +
							b.timing.scripts.bundled.loadEnd +
							b.timing.scripts.thirdParty.loadEnd,
						0
					) / appResults.length,
			},
			{
				cookieBannerDetected: appResults.some(
					(r) => r.timing.cookieBanner.detected
				),
				cookieBannerVisibleTimeMs:
					appResults.reduce(
						(a, b) =>
							a +
							(b.timing.cookieBanner.userVisibleTime ??
								b.timing.cookieBanner.visibilityTime),
						0
					) / appResults.length,
				cookieBannerCoverage:
					appResults.reduce(
						(a, b) => a + b.timing.cookieBanner.viewportCoverage,
						0
					) /
					appResults.length /
					PERCENTAGE_DIVISOR,
			},
			{
				domSize: 1500,
				mainThreadBlocking:
					appResults.reduce(
						(a, b) => a + b.timing.mainThreadBlocking.total,
						0
					) / appResults.length,
				layoutShifts:
					appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
					appResults.length,
			},
			appName === "baseline",
			appData,
			appResults[0]?.timing.networkInformation
		);
	}

	// Convert to API format
	const benchmarkResult: BenchmarkResult = {
		name: appName,
		baseline: appName === "baseline",
		cookieBannerConfig: appConfig.cookieBanner,
		techStack: appConfig.techStack,
		internationalization: appConfig.internationalization,
		source: appConfig.source,
		includes: appConfig.includes
			? Object.values(appConfig.includes)
					.flat()
					.filter((v): v is string => typeof v === "string")
			: [],
		company: appConfig.company ? JSON.stringify(appConfig.company) : undefined,
		tags: appConfig.tags || [],
		details: appResults,
		average: {
			fcp:
				appResults.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) /
				appResults.length,
			lcp:
				appResults.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) /
				appResults.length,
			cls:
				appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
				appResults.length,
			tbt:
				appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
				appResults.length,
			tti:
				appResults.reduce((a, b) => a + b.timing.timeToInteractive, 0) /
				appResults.length,
			scriptLoadTime:
				appResults.reduce(
					(a, b) =>
						a +
						b.timing.scripts.bundled.loadEnd +
						b.timing.scripts.thirdParty.loadEnd,
					0
				) / appResults.length,
			totalSize:
				appResults.reduce((a, b) => a + b.size.total, 0) / appResults.length,
			scriptSize:
				appResults.reduce((a, b) => a + b.size.scripts.total, 0) /
				appResults.length,
			resourceCount:
				appResults.reduce(
					(a, b) =>
						a +
						b.resources.scripts.length +
						b.resources.styles.length +
						b.resources.images.length +
						b.resources.fonts.length +
						b.resources.other.length,
					0
				) / appResults.length,
			scriptCount:
				appResults.reduce((a, b) => a + b.resources.scripts.length, 0) /
				appResults.length,
			time: appResults.reduce((a, b) => a + b.duration, 0) / appResults.length,
			thirdPartySize:
				appResults.reduce((a, b) => a + b.size.thirdParty, 0) /
				appResults.length,
			cookieServiceSize:
				appResults.reduce((a, b) => a + b.size.cookieServices, 0) /
				appResults.length,
			bannerVisibilityTime:
				appResults.reduce(
					(a, b) =>
						a +
						(b.timing.cookieBanner.userVisibleTime ??
							b.timing.cookieBanner.visibilityTime),
					0
				) / appResults.length,
			viewportCoverage:
				appResults.reduce(
					(a, b) => a + b.timing.cookieBanner.viewportCoverage,
					0
				) / appResults.length,
			thirdPartyImpact:
				appResults.reduce((a, b) => a + b.timing.thirdParty.totalImpact, 0) /
				appResults.length,
			mainThreadBlocking:
				appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
				appResults.length,
			cookieBannerBlocking:
				appResults.reduce(
					(a, b) => a + b.timing.mainThreadBlocking.cookieBannerEstimate,
					0
				) / appResults.length,
		},
		scores: scores ? transformScoresToContract(scores) : undefined,
	};

	await saveBenchmarkResult(logger, benchmarkResult);
}
