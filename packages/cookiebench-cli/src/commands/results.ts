/** biome-ignore-all lint/suspicious/noConsole: console output needed for results display */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { cancel, intro, isCancel, multiselect } from "@clack/prompts";
import type { Config } from "@consentio/runner";
import { ONE_SECOND, PERCENTAGE_DIVISOR } from "@consentio/shared";
import Table from "cli-table3";
import color from "picocolors";
import prettyMilliseconds from "pretty-ms";
import type { BenchmarkScores } from "../types";
import {
	CLS_DECIMAL_PLACES,
	CLS_THRESHOLD_FAIR,
	CLS_THRESHOLD_GOOD,
	COL_WIDTH_CHART_PADDING,
	COL_WIDTH_DURATION,
	COL_WIDTH_NAME,
	COL_WIDTH_SIZE,
	COL_WIDTH_SOURCE,
	COL_WIDTH_TAGS,
	COL_WIDTH_TYPE,
	DEFAULT_DOM_SIZE,
	MAX_FILENAME_LENGTH,
	MIN_DURATION_THRESHOLD,
	SCORE_THRESHOLD_FAIR,
	SCORE_THRESHOLD_POOR,
	TRUNCATED_FILENAME_LENGTH,
} from "../utils/constants";
import { findProjectRoot } from "../utils/project-root";
import type { CliLogger } from "../utils/logger";
import {
	ConfigValidationError,
	formatConfigIssues,
	formatBytes as formatBytesShared,
	loadValidatedConfigSync,
} from "../utils";
import { calculateScores } from "../utils/scoring";

// Raw benchmark data structure from JSON files
export type RawBenchmarkDetail = {
	duration: number;
	size: {
		total: number;
		bundled: number;
		thirdParty: number;
		cookieServices: number;
		scripts: {
			total: number;
			initial: number;
			dynamic: number;
			thirdParty: number;
			cookieServices: number;
		};
		styles: number;
		images: number;
		fonts: number;
		other: number;
	};
	timing: {
		navigationStart: number;
		domContentLoaded: number;
		load: number;
		firstPaint: number;
		firstContentfulPaint: number;
		largestContentfulPaint: number;
		timeToInteractive: number;
		cumulativeLayoutShift: number;
		// NEW: Perfume.js enhanced metrics
		timeToFirstByte?: number;
		firstInputDelay?: number | null;
		interactionToNextPaint?: number | null;
		navigationTiming?: {
			timeToFirstByte: number;
			domInteractive: number;
			domContentLoadedEventStart: number;
			domContentLoadedEventEnd: number;
			domComplete: number;
			loadEventStart: number;
			loadEventEnd: number;
		};
		networkInformation?: {
			effectiveType: string;
			downlink: number;
			rtt: number;
			saveData: boolean;
		};
		cookieBanner: {
			renderStart: number;
			renderEnd: number;
			interactionStart: number;
			interactionEnd: number;
			layoutShift: number;
			detected: boolean;
			selector: string | null;
			serviceName: string;
			visibilityTime: number;
			/** DOM presence time (ms). Present when reading runner output. */
			domPresenceTime?: number;
			/** User-visible time (ms). Present when reading runner output; used for scoring. */
			userVisibleTime?: number;
			viewportCoverage: number;
		};
		thirdParty: {
			dnsLookupTime: number;
			connectionTime: number;
			downloadTime: number;
			totalImpact: number;
			cookieServices: {
				hosts: string[];
				totalSize: number;
				resourceCount: number;
				dnsLookupTime: number;
				connectionTime: number;
				downloadTime: number;
			};
		};
		mainThreadBlocking: {
			total: number;
			cookieBannerEstimate: number;
			percentageFromCookies: number;
		};
		scripts: {
			bundled: {
				loadStart: number;
				loadEnd: number;
				executeStart: number;
				executeEnd: number;
			};
			thirdParty: {
				loadStart: number;
				loadEnd: number;
				executeStart: number;
				executeEnd: number;
			};
		};
	};
	resources: {
		scripts: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			isDynamic: boolean;
			isCookieService: boolean;
			dnsTime?: number;
			connectionTime?: number;
		}>;
		styles: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			isCookieService: boolean;
		}>;
		images: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			isCookieService: boolean;
		}>;
		fonts: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			isCookieService: boolean;
		}>;
		other: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			isCookieService: boolean;
			type: string;
		}>;
	};
	language: string;
};

export type BenchmarkOutput = {
	schemaVersion?: number;
	app: string;
	results: RawBenchmarkDetail[];
	scores?: BenchmarkScores;
	metadata?: Record<string, unknown>;
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
	} catch (error) {
		const errorCode =
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			typeof error.code === "string"
				? error.code
				: "";
		if (errorCode === "ENOENT") {
			return files;
		}
		throw error;
	}

	return files;
}

function loadConfigForApp(
	logger: CliLogger,
	appName: string,
	projectRoot: string
): Config {
	const configPath = join(projectRoot, "benchmarks", appName, "config.json");

	try {
		return loadValidatedConfigSync(configPath);
	} catch (error) {
		if (error instanceof ConfigValidationError) {
			logger.error(`Invalid config for ${appName}`);
			logger.error(formatConfigIssues(error.issues));
			throw error;
		}
		logger.debug(
			`Could not load config for ${appName}: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
		throw error;
	}
}

async function aggregateResults(
	logger: CliLogger,
	resultsDir: string,
	scopedApps?: Set<string>
) {
	const resultsFiles = await findResultsFiles(resultsDir);
	const results: Record<string, RawBenchmarkDetail[]> = {};
	const nonV2Files: string[] = [];

	logger.debug(`Found ${resultsFiles.length} results files:`);
	for (const file of resultsFiles) {
		logger.debug(`  - ${file}`);
	}

	for (const file of resultsFiles) {
		try {
			const content = await readFile(file, "utf-8");
			const data: BenchmarkOutput = JSON.parse(content);
			const appFromFile = typeof data.app === "string" ? data.app : null;

			if (scopedApps && appFromFile && !scopedApps.has(appFromFile)) {
				continue;
			}

			if (data.schemaVersion !== 2) {
				if (!scopedApps || (appFromFile && scopedApps.has(appFromFile))) {
					nonV2Files.push(file);
				}
				continue;
			}

			if (!(appFromFile && data.results)) {
				logger.warn(
					`Skipping invalid results file: ${file} (missing app or results)`
				);
				continue;
			}

			logger.debug(`Processing ${file} with app name: "${appFromFile}"`);

			if (results[appFromFile]) {
				logger.warn(
					`Duplicate app name "${appFromFile}" found in ${file}. Previous results will be overwritten.`
				);
			}

			results[appFromFile] = data.results;
			logger.debug(
				`Loaded results for ${appFromFile} (${data.results.length} iterations)`
			);
		} catch (error) {
			logger.error(
				`Failed to process ${file}: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
			if (error instanceof Error && error.stack) {
				logger.debug(`Stack trace: ${error.stack}`);
			}
		}
	}

	logger.debug("Final results summary:");
	for (const [app, appResults] of Object.entries(results)) {
		logger.debug(`  - ${app}: ${appResults.length} iterations`);
	}

	if (nonV2Files.length > 0) {
		throw new Error(
			`Found ${nonV2Files.length} non-v2 results files. Run "cookiebench migrate-results" first.`
		);
	}

	return results;
}

// Minimum threshold for showing decimal milliseconds (JavaScript precision is ~0.1ms)
const SUB_MILLISECOND_THRESHOLD = 1;
const MILLISECOND_DECIMAL_PLACES = 3;

function formatTime(ms: number): string {
	// JavaScript timing precision is typically ~0.1ms, so we don't show microseconds
	// For very small values, show fractional milliseconds
	return prettyMilliseconds(ms, {
		secondsDecimalDigits: 2,
		keepDecimalsOnWholeSeconds: true,
		compact: true,
		millisecondsDecimalDigits:
			ms < SUB_MILLISECOND_THRESHOLD ? MILLISECOND_DECIMAL_PLACES : 0,
	});
}

function getPerformanceRating(metric: string, value: number): string {
	const ratings: Record<string, { good: number; poor: number }> = {
		fcp: { good: 1800, poor: 3000 },
		lcp: { good: 2500, poor: 4000 },
		cls: { good: 0.1, poor: 0.25 },
		tti: { good: 3800, poor: 7300 },
		tbt: { good: 200, poor: 600 },
	};

	const thresholds = ratings[metric];
	if (!thresholds) {
		return "N/A";
	}

	if (value <= thresholds.good) {
		return color.green("Good");
	}
	if (value <= thresholds.poor) {
		return color.yellow("Fair");
	}
	return color.red("Poor");
}

function printDetailedResults(
	appName: string,
	results: RawBenchmarkDetail[],
	scores: BenchmarkScores,
	baseline?: RawBenchmarkDetail[]
) {
	if (!results || results.length === 0) {
		console.log(
			`\n${color.bold(color.cyan(`━━━ ${appName.toUpperCase()} ━━━`))}`
		);
		console.log(color.dim("No benchmark iterations available for this app."));
		return;
	}

	console.log(
		`\n${color.bold(color.cyan(`━━━ ${appName.toUpperCase()} ━━━`))}`
	);

	// ━━━ Score Display ━━━
	const score = Math.round(scores.totalScore);
	let scoreColor = color.green;
	let scoreBgColor = color.bgGreen;

	if (score < SCORE_THRESHOLD_POOR) {
		scoreColor = color.red;
		scoreBgColor = color.bgRed;
	} else if (score < SCORE_THRESHOLD_FAIR) {
		scoreColor = color.yellow;
		scoreBgColor = color.bgYellow;
	}

	console.log(`\n${color.bold("🎯 Overall Score")}`);
	console.log(
		scoreColor(`  ${score}/100`) +
			" " +
			scoreBgColor(color.black(` ${scores.grade} `))
	);

	// ━━━ Key Insights ━━━
	if (scores.insights && scores.insights.length > 0) {
		console.log(`\n${color.bold("💡 Key Insights")}`);
		for (const insight of scores.insights) {
			console.log(`${color.blue("  •")} ${color.dim(insight)}`);
		}
	}

	// Calculate averages (support both timing modes; scoring uses user-visible)
	const getUserVisibleTimeMs = (r: RawBenchmarkDetail) =>
		r.timing.cookieBanner.userVisibleTime ??
		r.timing.cookieBanner.visibilityTime;
	const getDomPresenceTimeMs = (r: RawBenchmarkDetail) =>
		r.timing.cookieBanner.domPresenceTime ?? r.timing.cookieBanner.renderStart;
	const avgBannerDomPresenceTimeMs =
		results.reduce((a, b) => a + getDomPresenceTimeMs(b), 0) / results.length;
	const avgBannerVisibleTimeMs =
		results.reduce((a, b) => a + getUserVisibleTimeMs(b), 0) / results.length;
	const avgViewportCoverage =
		results.reduce((a, b) => a + b.timing.cookieBanner.viewportCoverage, 0) /
		results.length;
	const avgNetworkImpact =
		results.reduce((a, b) => a + b.size.thirdParty, 0) / results.length;
	const avgThirdPartyRequests =
		results.reduce(
			(total, result) =>
				total +
				result.resources.scripts.filter((resource) => resource.isThirdParty)
					.length +
				result.resources.styles.filter((resource) => resource.isThirdParty)
					.length +
				result.resources.images.filter((resource) => resource.isThirdParty)
					.length +
				result.resources.fonts.filter((resource) => resource.isThirdParty)
					.length +
				result.resources.other.filter((resource) => resource.isThirdParty)
					.length,
			0
		) / results.length;
	const _bannerDetected = results.some((r) => r.timing.cookieBanner.detected);
	const isBundled = avgThirdPartyRequests === 0;
	const formattedThirdPartyRequests = Number.isInteger(avgThirdPartyRequests)
		? avgThirdPartyRequests.toString()
		: avgThirdPartyRequests.toFixed(1);
	const networkImpactSummary = isBundled
		? formatBytesShared(avgNetworkImpact)
		: `${formatBytesShared(avgNetworkImpact)} (${formattedThirdPartyRequests} req)`;
	let networkImpactHint: string;
	if (isBundled) {
		networkImpactHint = "Bundled (no external requests)";
	} else if (avgNetworkImpact > 0) {
		networkImpactHint = "External requests";
	} else {
		networkImpactHint = "External requests (size unavailable)";
	}
	const bundleStrategyHint = isBundled
		? "Included in main bundle"
		: "Loaded from external hosts";

	const avgFCP =
		results.reduce((a, b) => a + b.timing.firstContentfulPaint, 0) /
		results.length;
	const avgLCP =
		results.reduce((a, b) => a + b.timing.largestContentfulPaint, 0) /
		results.length;
	const avgTTI =
		results.reduce((a, b) => a + b.timing.timeToInteractive, 0) /
		results.length;
	const avgCLS =
		results.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
		results.length;
	const avgTBT =
		results.reduce((a, b) => a + b.timing.mainThreadBlocking.total, 0) /
		results.length;

	const totalSize =
		results.reduce((a, b) => a + b.size.total, 0) / results.length;
	const jsSize =
		results.reduce((a, b) => a + b.size.scripts.total, 0) / results.length;
	const cssSize =
		results.reduce((a, b) => a + b.size.styles, 0) / results.length;
	const imageSize =
		results.reduce((a, b) => a + b.size.images, 0) / results.length;
	const fontSize =
		results.reduce((a, b) => a + b.size.fonts, 0) / results.length;
	const otherSize =
		results.reduce((a, b) => a + b.size.other, 0) / results.length;

	const jsFiles =
		results.reduce((a, b) => a + b.resources.scripts.length, 0) /
		results.length;
	const cssFiles =
		results.reduce((a, b) => a + b.resources.styles.length, 0) / results.length;
	const imageFiles =
		results.reduce((a, b) => a + b.resources.images.length, 0) / results.length;
	const fontFiles =
		results.reduce((a, b) => a + b.resources.fonts.length, 0) / results.length;
	const otherFiles =
		results.reduce((a, b) => a + b.resources.other.length, 0) / results.length;

	// Calculate deltas if baseline exists (user-visible is used for scoring)
	let bannerDelta = "";
	if (baseline && appName !== "baseline") {
		const baselineAvgBanner =
			baseline.reduce((a, b) => a + getUserVisibleTimeMs(b), 0) /
			baseline.length;
		const delta = avgBannerVisibleTimeMs - baselineAvgBanner;
		bannerDelta = ` ${delta > 0 ? "+" : ""}${formatTime(delta)}`;
	}

	// ━━━ Cookie Banner Impact (dual timing modes) ━━━
	console.log(`\n${color.bold("🍪 Cookie Banner Impact")}`);
	console.log(
		color.dim(
			"  Dual timing: DOM presence (technical) | Banner visible (used for score)"
		)
	);
	const bannerTable = new Table({
		chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
		style: { "padding-left": 2, "padding-right": 2, border: ["grey"] },
	});

	bannerTable.push(
		[
			{ content: "DOM presence", colSpan: 1 },
			{ content: "Banner visible (scored)", colSpan: 1 },
			{ content: "Viewport Coverage", colSpan: 1 },
			{ content: "Network Impact", colSpan: 1 },
			{ content: "Bundle Strategy", colSpan: 1 },
		],
		[
			`${color.bold(formatTime(avgBannerDomPresenceTimeMs))}\n${color.dim("Technical render")}`,
			`${color.bold(formatTime(avgBannerVisibleTimeMs))}\n${color.dim(bannerDelta || "baseline")}`,
			`${color.bold(`${avgViewportCoverage.toFixed(1)}%`)}\n${color.dim("Screen real estate")}`,
			`${color.bold(networkImpactSummary)}\n${color.dim(networkImpactHint)}`,
			`${color.bold(isBundled ? "Bundled" : "External")}\n${color.dim(bundleStrategyHint)}`,
		]
	);

	console.log(bannerTable.toString());

	// ━━━ Core Web Vitals ━━━
	console.log(`\n${color.bold("⚡ Core Web Vitals")}`);
	const vitalsTable = new Table({
		chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
		style: { "padding-left": 2, "padding-right": 2, border: ["grey"] },
	});

	vitalsTable.push(
		[
			{ content: "First Contentful Paint", colSpan: 1 },
			{ content: "Largest Contentful Paint", colSpan: 1 },
			{ content: "Time to Interactive", colSpan: 1 },
			{ content: "Cumulative Layout Shift", colSpan: 1 },
		],
		[
			`${color.bold(formatTime(avgFCP))}\n${getPerformanceRating("fcp", avgFCP)}`,
			`${color.bold(formatTime(avgLCP))}\n${getPerformanceRating("lcp", avgLCP)}`,
			`${color.bold(formatTime(avgTTI))}\n${getPerformanceRating("tti", avgTTI)}`,
			`${color.bold(avgCLS.toFixed(CLS_DECIMAL_PLACES))}\n${getPerformanceRating("cls", avgCLS)}`,
		]
	);

	console.log(vitalsTable.toString());

	// ━━━ Resource Breakdown ━━━
	console.log(`\n${color.bold("📦 Resource Breakdown")}`);

	const totalFiles = jsFiles + cssFiles + imageFiles + fontFiles + otherFiles;
	const jsPercentage =
		totalSize > 0 ? (jsSize / totalSize) * PERCENTAGE_DIVISOR : 0;
	const cssPercentage =
		totalSize > 0 ? (cssSize / totalSize) * PERCENTAGE_DIVISOR : 0;
	const imagePercentage =
		totalSize > 0 ? (imageSize / totalSize) * PERCENTAGE_DIVISOR : 0;
	const fontPercentage =
		totalSize > 0 ? (fontSize / totalSize) * PERCENTAGE_DIVISOR : 0;
	const otherPercentage =
		totalSize > 0 ? (otherSize / totalSize) * PERCENTAGE_DIVISOR : 0;

	const resourceTable = new Table({
		chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
		style: { "padding-left": 2, "padding-right": 2, border: ["grey"] },
	});

	resourceTable.push(
		[
			{ content: "Type", colSpan: 1 },
			{ content: "Size", colSpan: 1 },
			{ content: "Files", colSpan: 1 },
			{ content: "% of Total", colSpan: 1 },
		],
		[
			color.cyan("JavaScript"),
			formatBytesShared(jsSize),
			Math.round(jsFiles).toString(),
			`${jsPercentage.toFixed(1)}%`,
		],
		[
			color.cyan("CSS"),
			formatBytesShared(cssSize),
			Math.round(cssFiles).toString(),
			`${cssPercentage.toFixed(1)}%`,
		],
		[
			color.cyan("Images"),
			formatBytesShared(imageSize),
			Math.round(imageFiles).toString(),
			`${imagePercentage.toFixed(1)}%`,
		],
		[
			color.cyan("Fonts"),
			formatBytesShared(fontSize),
			Math.round(fontFiles).toString(),
			`${fontPercentage.toFixed(1)}%`,
		],
		[
			color.cyan("Other"),
			formatBytesShared(otherSize),
			Math.round(otherFiles).toString(),
			`${otherPercentage.toFixed(1)}%`,
		],
		[
			color.bold("Total"),
			color.bold(formatBytesShared(totalSize)),
			color.bold(Math.round(totalFiles).toString()),
			color.bold("100%"),
		]
	);

	console.log(resourceTable.toString());

	// ━━━ Performance Impact Summary ━━━
	console.log(`\n${color.bold("📊 Performance Impact Summary")}`);
	const summaryTable = new Table({
		chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
		style: { "padding-left": 2, "padding-right": 2, border: ["grey"] },
	});

	let layoutStability = "Poor";
	if (avgCLS === 0) {
		layoutStability = "Perfect";
	} else if (avgCLS < CLS_THRESHOLD_GOOD) {
		layoutStability = "Good";
	} else if (avgCLS < CLS_THRESHOLD_FAIR) {
		layoutStability = "Fair";
	}

	summaryTable.push(
		["Loading Strategy", color.bold(isBundled ? "Bundled" : "External")],
		["Render Performance", color.bold(formatTime(avgBannerVisibleTimeMs))],
		["Network Overhead", color.bold(networkImpactSummary)],
		["Main Thread Impact", color.bold(formatTime(avgTBT))],
		["Layout Stability", color.bold(layoutStability)],
		["User Disruption", color.bold(`${avgViewportCoverage.toFixed(1)}%`)]
	);

	console.log(summaryTable.toString());

	// ━━━ Network Chart (Waterfall) ━━━
	console.log(`\n${color.bold("🌐 Network Chart")}`);

	// Get first iteration's resources for waterfall
	const firstResult = results[0];
	if (firstResult?.resources) {
		const allResources = [
			...firstResult.resources.scripts.map((r) => ({ ...r, type: "script" })),
			...firstResult.resources.styles.map((r) => ({ ...r, type: "style" })),
			...firstResult.resources.images.map((r) => ({ ...r, type: "image" })),
			...firstResult.resources.fonts.map((r) => ({ ...r, type: "font" })),
			...firstResult.resources.other.map((r) => ({ ...r, type: "other" })),
		].sort((a, b) => a.startTime - b.startTime);

		// Take top 10 resources for waterfall
		const topResources = allResources.slice(0, 10);

		if (topResources.length > 0) {
			const maxEndTime = Math.max(
				...topResources.map((r) => r.startTime + r.duration)
			);
			const chartWidth = 60; // Width of the waterfall bars

			const waterfallTable = new Table({
				chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
				colWidths: [COL_WIDTH_NAME, chartWidth + COL_WIDTH_CHART_PADDING],
				style: { "padding-left": 1, "padding-right": 1, border: ["grey"] },
				wordWrap: true,
			});

			waterfallTable.push([
				color.dim("Resource"),
				color.dim(
					"Timeline (0ms ───────────────────────────► " +
						formatTime(maxEndTime) +
						")"
				),
			]);

			for (const resource of topResources) {
				const fileName = resource.name.split("/").pop() || resource.name;
				const shortName =
					fileName.length > MAX_FILENAME_LENGTH
						? `${fileName.substring(0, TRUNCATED_FILENAME_LENGTH)}...`
						: fileName;

				const startPos = Math.floor(
					(resource.startTime / maxEndTime) * chartWidth
				);
				const barLength = Math.max(
					1,
					Math.floor((resource.duration / maxEndTime) * chartWidth)
				);

				const emptyBefore = " ".repeat(startPos);
				const bar = "█".repeat(barLength);
				const durationLabel =
					resource.duration > maxEndTime * MIN_DURATION_THRESHOLD
						? formatTime(resource.duration)
						: "";

				let barColor = color.blue;
				if (resource.isThirdParty) {
					barColor = color.yellow;
				}
				if (resource.isCookieService) {
					barColor = color.red;
				}

				waterfallTable.push([
					color.dim(shortName),
					`${emptyBefore + barColor(bar)} ${color.dim(durationLabel)}`,
				]);
			}

			console.log(waterfallTable.toString());
		}
	}

	// ━━━ Resource Details ━━━
	console.log(`\n${color.bold("📋 Resource Details")}`);

	// Aggregate resource data across all results
	const aggregatedResources: Array<{
		name: string;
		type: string;
		source: string;
		size: number;
		duration: number;
		tags: string[];
	}> = [];

	// Use first result for resource list (assuming resources are consistent)
	const sampleResult = results[0];
	if (sampleResult?.resources) {
		const allSampleResources = [
			...sampleResult.resources.scripts.map((r) => ({
				...r,
				type: "JavaScript",
			})),
			...sampleResult.resources.styles.map((r) => ({ ...r, type: "CSS" })),
			...sampleResult.resources.images.map((r) => ({ ...r, type: "Image" })),
			...sampleResult.resources.fonts.map((r) => ({ ...r, type: "Font" })),
			...sampleResult.resources.other.map((r) => ({ ...r, type: "Other" })),
		];

		// Calculate averages for each resource
		for (const sampleResource of allSampleResources) {
			const resourceName = sampleResource.name;

			// Find this resource in all results and average the values
			const avgSize =
				results.reduce((sum, result) => {
					const allResources = [
						...result.resources.scripts,
						...result.resources.styles,
						...result.resources.images,
						...result.resources.fonts,
						...result.resources.other,
					];
					const found = allResources.find((r) => r.name === resourceName);
					return sum + (found ? found.size : 0);
				}, 0) / results.length;

			const avgDuration =
				results.reduce((sum, result) => {
					const allResources = [
						...result.resources.scripts,
						...result.resources.styles,
						...result.resources.images,
						...result.resources.fonts,
						...result.resources.other,
					];
					const found = allResources.find((r) => r.name === resourceName);
					return sum + (found ? found.duration : 0);
				}, 0) / results.length;

			let source = "Bundled";
			if (sampleResource.isThirdParty) {
				source = sampleResource.isCookieService
					? "Cookie Service"
					: "Third-Party";
			}

			const tags: string[] = [];
			if (!sampleResource.isThirdParty) {
				tags.push("bundled");
			}
			if (sampleResource.isThirdParty) {
				tags.push("third-party");
			}
			if (sampleResource.isCookieService) {
				tags.push("cookie-service");
			}
			if ("isDynamic" in sampleResource && sampleResource.isDynamic) {
				tags.push("dynamic");
			}

			// Add core/other categorization for bundled scripts
			if (
				!sampleResource.isThirdParty &&
				sampleResource.type === "JavaScript"
			) {
				tags.push("core");
			}

			aggregatedResources.push({
				name: resourceName,
				type: sampleResource.type,
				source,
				size: avgSize,
				duration: avgDuration,
				tags,
			});
		}
	}

	// Sort by size (descending) and take top 10
	const topResources = aggregatedResources
		.sort((a, b) => b.size - a.size)
		.slice(0, 10);

	if (topResources.length > 0) {
		const detailsTable = new Table({
			head: ["Resource Name", "Type", "Source", "Size", "Duration", "Tags"],
			colWidths: [
				COL_WIDTH_NAME,
				COL_WIDTH_TYPE,
				COL_WIDTH_SOURCE,
				COL_WIDTH_SIZE,
				COL_WIDTH_DURATION,
				COL_WIDTH_TAGS,
			],
			style: { head: ["cyan"], border: ["grey"] },
			wordWrap: true,
		});

		for (const resource of topResources) {
			const fileName = resource.name.split("/").pop() || resource.name;
			const shortName =
				fileName.length > MAX_FILENAME_LENGTH
					? `${fileName.substring(0, TRUNCATED_FILENAME_LENGTH)}...`
					: fileName;

			let sourceColor = color.green;
			if (resource.source === "Third-Party") {
				sourceColor = color.yellow;
			}
			if (resource.source === "Cookie Service") {
				sourceColor = color.red;
			}

			detailsTable.push([
				shortName,
				resource.type,
				sourceColor(resource.source),
				formatBytesShared(resource.size),
				color.blue(formatTime(resource.duration)),
				resource.tags.join(", "),
			]);
		}

		console.log(detailsTable.toString());
	}
}

export async function resultsCommand(
	logger: CliLogger,
	appName?: string | string[]
) {
	logger.clear();
	await setTimeout(ONE_SECOND);

	intro(
		`${color.bgCyan(color.black(" results "))} ${color.dim("Compare benchmarks")}`
	);

	const projectRoot = findProjectRoot();
	const resultsDir = join(projectRoot, "benchmarks");
	let scopedApps: Set<string> | undefined;
	if (Array.isArray(appName)) {
		scopedApps = new Set(appName);
	} else if (appName && appName !== "__all__") {
		scopedApps = new Set([appName]);
	}
	const results = await aggregateResults(logger, resultsDir, scopedApps);

	if (Object.keys(results).length === 0) {
		logger.error("No benchmark results found!");
		return;
	}

	logger.debug(
		`Found results for ${Object.keys(results).length} apps: ${Object.keys(
			results
		).join(", ")}`
	);

	// If a specific app is requested, filter to that
	let selectedApps: string[];

	if (Array.isArray(appName)) {
		// Array of app names passed (e.g., from benchmark command)
		// Filter to only valid apps
		selectedApps = appName.filter((name) => results[name]);
		if (selectedApps.length === 0) {
			logger.error("No valid results found for the specified benchmarks");
			logger.info(`Available apps: ${Object.keys(results).join(", ")}`);
			return;
		}
	} else if (appName && appName !== "__all__") {
		// Direct command with specific app
		if (!results[appName]) {
			logger.error(`No results found for "${appName}"`);
			logger.info(`Available apps: ${Object.keys(results).join(", ")}`);
			return;
		}
		selectedApps = [appName];
	} else if (appName === "__all__") {
		// Show all results
		selectedApps = Object.keys(results);
	} else {
		// Interactive mode - let user select which apps to view
		const availableApps = Object.keys(results).sort((a, b) => {
			if (a === "baseline") {
				return -1;
			}
			if (b === "baseline") {
				return 1;
			}
			return a.localeCompare(b);
		});

		const selected = await multiselect({
			message:
				"Select benchmarks to view (use space to toggle, all selected by default):",
			options: availableApps.map((name) => ({
				value: name,
				label: name,
				hint: `benchmarks/${name}`,
			})),
			initialValues: availableApps, // All selected by default
			required: true,
		});

		if (isCancel(selected)) {
			cancel("Operation cancelled");
			return;
		}

		if (!Array.isArray(selected) || selected.length === 0) {
			logger.warn("No benchmarks selected");
			return;
		}

		selectedApps = selected;
	}

	logger.debug(`Viewing results for: ${selectedApps.join(", ")}`);

	// Load configs for each app
	const appConfigs: Record<string, Config> = {};
	for (const name of Object.keys(results)) {
		appConfigs[name] = loadConfigForApp(logger, name, projectRoot);
	}

	// Calculate scores for each app
	const scores: Record<string, BenchmarkScores> = {};
	for (const [name, appResults] of Object.entries(results)) {
		const config = appConfigs[name];

		// Create app data for transparency scoring
		const appData = {
			name,
			baseline: name === "baseline",
			company: config.company ? JSON.stringify(config.company) : null,
			techStack: JSON.stringify(config.techStack),
			source: config.source ? JSON.stringify(config.source) : null,
			tags: config.tags ? JSON.stringify(config.tags) : null,
		};

		scores[name] = calculateScores(
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
						.map((result) => result.timing.interactionToNextPaint)
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
								// Skip invalid resource URLs
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
				domSize: DEFAULT_DOM_SIZE,
				mainThreadBlocking:
					appResults.reduce(
						(a, b) => a + b.timing.mainThreadBlocking.total,
						0
					) / appResults.length,
				layoutShifts:
					appResults.reduce((a, b) => a + b.timing.cumulativeLayoutShift, 0) /
					appResults.length,
			},
			name === "baseline",
			appData,
			appResults[0]?.timing.networkInformation
		);
	}

	// Print detailed results for selected apps only
	const baselineResults = results.baseline;
	const sortedApps = selectedApps.sort((a, b) => {
		if (a === "baseline") {
			return -1;
		}
		if (b === "baseline") {
			return 1;
		}
		return a.localeCompare(b);
	});

	for (const name of sortedApps) {
		printDetailedResults(name, results[name], scores[name], baselineResults);
	}
}
