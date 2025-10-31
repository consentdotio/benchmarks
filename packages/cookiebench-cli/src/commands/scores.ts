import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { intro, isCancel, select } from "@clack/prompts";
import type { Config } from "@consentio/runner";
import { HALF_SECOND, PERCENTAGE_DIVISOR } from "@consentio/shared";
import color from "picocolors";
import type { BenchmarkScores } from "../types";
import type { CliLogger } from "../utils/logger";
import { calculateScores, printScores } from "../utils/scoring";
import type { RawBenchmarkDetail } from "./results";

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
		// Directory doesn't exist or can't be read
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

export async function scoresCommand(logger: CliLogger, appName?: string) {
	logger.clear();
	await setTimeout(HALF_SECOND);

	intro(`${color.bgCyan(color.black(" scores "))}`);

	const resultsDir = "benchmarks";
	const resultsFiles = await findResultsFiles(resultsDir);

	if (resultsFiles.length === 0) {
		logger.error("No benchmark results found!");
		logger.info(
			`Run ${color.cyan("cookiebench benchmark")} first to generate results.`
		);
		return;
	}

	logger.debug(`Found ${resultsFiles.length} results files`);

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

	// If specific app requested, show only that one
	if (appName) {
		const result = allResults[appName];
		if (!result) {
			logger.error(`No results found for app: ${appName}`);
			logger.info(`Available apps: ${Object.keys(allResults).join(", ")}`);
			return;
		}

		await displayAppScores(logger, appName, result);
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
		label: "Show all apps",
		hint: "Display scores for all benchmarks",
	});

	const selectedApp = await select({
		message: "Which benchmark scores would you like to view?",
		options: appOptions,
	});

	if (isCancel(selectedApp)) {
		logger.info("Operation cancelled");
		return;
	}

	if (selectedApp === "__all__") {
		// Show all apps
		for (const [name, result] of Object.entries(allResults)) {
			await displayAppScores(logger, name, result);
			logger.message(""); // Add spacing between apps
		}
	} else {
		await displayAppScores(
			logger,
			selectedApp as string,
			allResults[selectedApp as string]
		);
	}

	logger.outro("Done!");

	// Exit process after command completes
	process.exit(0);
}

async function displayAppScores(
	logger: CliLogger,
	appName: string,
	result: BenchmarkOutput
) {
	logger.info(`\n${color.bold(color.cyan(`📊 ${appName}`))}`);

	// Show metadata if available
	if (result.metadata) {
		logger.debug(`Iterations: ${result.metadata.iterations}`);
		logger.debug(`Timestamp: ${result.metadata.timestamp}`);
	}

	// If scores are already calculated and stored, use them
	if (result.scores) {
		logger.debug("Using pre-calculated scores from results file");
		printScores(result.scores);
		return;
	}

	// Otherwise, calculate scores from raw results
	logger.debug("Calculating scores from raw benchmark data");

	const appResults = result.results;
	const config = await loadConfigForApp(logger, appName);

	if (!config) {
		logger.warn(`Could not load config for ${appName}, using default values`);
	}

	// Create app data for transparency scoring
	const appData = {
		name: appName,
		baseline: appName === "baseline",
		company: config?.company ? JSON.stringify(config.company) : null,
		techStack: config?.techStack ? JSON.stringify(config.techStack) : "{}",
		source: config?.source ? JSON.stringify(config.source) : null,
		tags: config?.tags ? JSON.stringify(config.tags) : null,
	};

	const scores = calculateScores(
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
				appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
				appResults.length,
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
			thirdPartyDomains: 5, // Default value
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
			domSize: 1500, // Default value
			mainThreadBlocking:
				appResults.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
				appResults.length,
			layoutShifts:
				appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
				appResults.length,
		},
		appName === "baseline",
		appData,
		appResults[0]?.timing.networkInformation
	);

	printScores(scores);
}
