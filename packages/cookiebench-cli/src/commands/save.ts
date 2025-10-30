import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { cancel, confirm, intro, isCancel, multiselect } from "@clack/prompts";
import type { Config } from "@consentio/runner";
import { config as loadDotenv } from "dotenv";
import color from "picocolors";
import type { BenchmarkScores } from "../types";
import { HALF_SECOND, PERCENTAGE_DIVISOR } from "../utils";
import { isAdminUser } from "../utils/auth";
import type { CliLogger } from "../utils/logger";
import { calculateScores } from "../utils/scoring";
import type { RawBenchmarkDetail } from "./results";

// Load environment variables from .env files
loadDotenv({ path: ".env" });
loadDotenv({ path: ".env.local" });
loadDotenv({ path: "www/.env.local" });

type BenchmarkOutput = {
	app: string;
	results: RawBenchmarkDetail[];
	scores?: BenchmarkScores;
	metadata?: {
		timestamp: string;
		iterations: number;
		languages?: string[];
	};
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
			status: "excellent" | "good" | "fair" | "poor";
		}>;
		insights: string[];
		recommendations: string[];
	};
};

async function saveBenchmarkResult(
	logger: CliLogger,
	result: BenchmarkResult
): Promise<void> {
	const apiUrl = process.env.API_URL || "http://localhost:3000";
	const endpoint = `${apiUrl}/api/orpc/benchmarks/save`;

	try {
		logger.debug(`Attempting to save ${result.name} to ${endpoint}`);

		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
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
			logger.error(`Failed to save ${result.name}: ${error.message}`);
			if (error.message.includes("fetch failed")) {
				logger.error(`Connection failed. Is the server running on ${apiUrl}?`);
			}
		} else {
			logger.error(`Failed to save ${result.name}: Unknown error`);
		}
		throw error;
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

async function loadConfigForApp(
	logger: CliLogger,
	appName: string
): Promise<Config | null> {
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
		categoryScores: scores.categoryScores,
		categories: scores.categories.map((category) => ({
			name: category.name,
			score: category.score,
			maxScore: category.maxScore,
			weight: category.weight,
			details: category.details.map((detail) => ({
				metric: detail.name,
				value: detail.score,
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
	// Double-check admin access (safeguard)
	if (!isAdminUser()) {
		logger.error("This command requires admin access");
		process.exit(1);
	}

	logger.clear();
	await setTimeout(HALF_SECOND);

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

	const resultsDir = "benchmarks";
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
	for (const file of resultsFiles) {
		try {
			const content = await readFile(file, "utf-8");
			const data: BenchmarkOutput = JSON.parse(content);

			if (data.app && data.results) {
				allResults[data.app] = data;
			}
		} catch (error) {
			logger.debug(`Failed to load ${file}:`, error);
		}
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

		await saveAppToDatabase(logger, appName, result);
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
			await saveAppToDatabase(logger, name, allResults[name]);
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
	result: BenchmarkOutput
): Promise<void> {
	const appConfig = await loadConfigForApp(logger, appName);
	const appResults = result.results;

	// Calculate scores if not already in results
	let scores = result.scores;
	if (!scores) {
		const appData = {
			name: appName,
			baseline: appName === "baseline",
			company: appConfig?.company ? JSON.stringify(appConfig.company) : null,
			techStack: appConfig?.techStack
				? JSON.stringify(appConfig.techStack)
				: "{}",
			source: appConfig?.source ? JSON.stringify(appConfig.source) : null,
			tags: appConfig?.tags ? JSON.stringify(appConfig.tags) : null,
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
				interactionToNextPaint:
					appResults[0]?.timing.interactionToNextPaint || null,
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
							a + b.resources.scripts.filter((s) => s.isThirdParty).length,
						0
					) / appResults.length,
				thirdPartySize:
					appResults.reduce((a, b) => a + b.size.thirdParty, 0) /
					appResults.length,
				thirdPartyDomains: 5,
			},
			{
				cookieBannerDetected: appResults.some(
					(r) => r.timing.cookieBanner.detected
				),
				cookieBannerTiming:
					appResults.reduce(
						(a, b) => a + b.timing.cookieBanner.visibilityTime,
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
		cookieBannerConfig: appConfig?.cookieBanner || {},
		techStack: appConfig?.techStack || {},
		internationalization: appConfig?.internationalization || {},
		source: appConfig?.source || {},
		includes: appConfig?.includes
			? Object.values(appConfig.includes)
					.flat()
					.filter((v): v is string => typeof v === "string")
			: [],
		company: appConfig?.company ? JSON.stringify(appConfig.company) : undefined,
		tags: appConfig?.tags || [],
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
			scriptLoadTime: 0,
			totalSize:
				appResults.reduce((a, b) => a + b.size.total, 0) / appResults.length,
			scriptSize: 0,
			resourceCount:
				appResults.reduce((a, b) => a + b.resources.scripts.length, 0) /
				appResults.length,
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
					(a, b) => a + b.timing.cookieBanner.visibilityTime,
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
