/** biome-ignore-all lint/suspicious/noConsole: console output needed for results display */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { cancel, intro, isCancel, multiselect } from "@clack/prompts";
import type { Config } from "@consentio/runner";
import { KILOBYTE, ONE_SECOND, PERCENTAGE_DIVISOR } from "@consentio/shared";
import Table from "cli-table3";
import color from "picocolors";
import prettyMilliseconds from "pretty-ms";
import type { BenchmarkScores } from "../types";
import { isAdminUser } from "../utils/auth";
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
import type { CliLogger } from "../utils/logger";
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
	app: string;
	results: RawBenchmarkDetail[];
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
				name: string;
				score: number;
				maxScore: number;
				reason: string;
			}>;
			status: "good" | "warning" | "critical";
		}>;
		insights: string[];
		recommendations: string[];
	};
	metadata: {
		timestamp: string;
		iterations: number;
		language: string;
	};
};

async function findResultsFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findResultsFiles(fullPath)));
		} else if (entry.name === "results.json") {
			files.push(fullPath);
		}
	}

	return files;
}

async function loadConfigForApp(
	logger: CliLogger,
	appName: string
): Promise<Config> {
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
		logger.debug(
			`Could not load config for ${appName}: ${
				error instanceof Error ? error.message : "Unknown error"
			}`
		);
		return {
			name: appName,
			iterations: 0,
			techStack: {
				languages: [],
				frameworks: [],
				bundler: "unknown",
				bundleType: "unknown",
				packageManager: "unknown",
				typescript: false,
			},
			source: {
				license: "unknown",
				isOpenSource: false,
				github: false,
				npm: false,
			},
			includes: {
				backend: [],
				components: [],
			},
			company: undefined,
			tags: [],
			cookieBanner: {
				serviceName: "Unknown",
				selectors: [],
				serviceHosts: [],
				waitForVisibility: false,
				measureViewportCoverage: false,
				expectedLayoutShift: false,
			},
			internationalization: {
				detection: "none",
				stringLoading: "bundled",
			},
		};
	}
}

async function aggregateResults(logger: CliLogger, resultsDir: string) {
	const resultsFiles = await findResultsFiles(resultsDir);
	const results: Record<string, RawBenchmarkDetail[]> = {};

	logger.debug(`Found ${resultsFiles.length} results files:`);
	for (const file of resultsFiles) {
		logger.debug(`  - ${file}`);
	}

	for (const file of resultsFiles) {
		try {
			const content = await readFile(file, "utf-8");
			const data: BenchmarkOutput = JSON.parse(content);

			if (!(data.app && data.results)) {
				logger.warn(
					`Skipping invalid results file: ${file} (missing app or results)`
				);
				continue;
			}

			logger.debug(`Processing ${file} with app name: "${data.app}"`);

			if (results[data.app]) {
				logger.warn(
					`Duplicate app name "${data.app}" found in ${file}. Previous results will be overwritten.`
				);
			}

			results[data.app] = data.results;
			logger.debug(
				`Loaded results for ${data.app} (${data.results.length} iterations)`
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

	return results;
}

function formatTime(ms: number): string {
	return prettyMilliseconds(ms, {
		secondsDecimalDigits: 2,
		keepDecimalsOnWholeSeconds: true,
		compact: true,
	});
}

function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0bytes";
	}
	if (bytes < KILOBYTE) {
		return `${bytes.toFixed(0)}bytes`;
	}
	return `${(bytes / KILOBYTE).toFixed(0)}KB`;
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

	// Calculate averages
	const avgBannerVisibility =
		results.reduce((a, b) => a + b.timing.cookieBanner.visibilityTime, 0) /
		results.length;
	const avgViewportCoverage =
		results.reduce((a, b) => a + b.timing.cookieBanner.viewportCoverage, 0) /
		results.length;
	const avgNetworkImpact =
		results.reduce((a, b) => a + b.size.thirdParty, 0) / results.length;
	const _bannerDetected = results.some((r) => r.timing.cookieBanner.detected);
	const isBundled = results[0]?.size.thirdParty === 0;

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

	// Calculate deltas if baseline exists
	let bannerDelta = "";
	if (baseline && appName !== "baseline") {
		const baselineAvgBanner =
			baseline.reduce((a, b) => a + b.timing.cookieBanner.visibilityTime, 0) /
			baseline.length;
		const delta = avgBannerVisibility - baselineAvgBanner;
		bannerDelta = ` ${delta > 0 ? "+" : ""}${formatTime(delta)}`;
	}

	// ━━━ Cookie Banner Impact ━━━
	console.log(`\n${color.bold("🍪 Cookie Banner Impact")}`);
	const bannerTable = new Table({
		chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
		style: { "padding-left": 2, "padding-right": 2, border: ["grey"] },
	});

	bannerTable.push(
		[
			{ content: "Banner Visibility", colSpan: 1 },
			{ content: "Viewport Coverage", colSpan: 1 },
			{ content: "Network Impact", colSpan: 1 },
			{ content: "Bundle Strategy", colSpan: 1 },
		],
		[
			`${color.bold(formatTime(avgBannerVisibility))}\n${color.dim(bannerDelta || "baseline")}`,
			`${color.bold(`${avgViewportCoverage.toFixed(1)}%`)}\n${color.dim("Screen real estate")}`,
			`${color.bold(formatBytes(avgNetworkImpact * KILOBYTE))}\n${color.dim(isBundled ? "Bundled (no network)" : "External requests")}`,
			`${color.bold(isBundled ? "Bundled" : "External")}\n${color.dim(isBundled ? "Included in main bundle" : "Loaded from CDN")}`,
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
			formatBytes(jsSize * KILOBYTE),
			Math.round(jsFiles).toString(),
			`${jsPercentage.toFixed(1)}%`,
		],
		[
			color.cyan("CSS"),
			formatBytes(cssSize * KILOBYTE),
			Math.round(cssFiles).toString(),
			`${cssPercentage.toFixed(1)}%`,
		],
		[
			color.cyan("Images"),
			formatBytes(imageSize * KILOBYTE),
			Math.round(imageFiles).toString(),
			`${imagePercentage.toFixed(1)}%`,
		],
		[
			color.cyan("Fonts"),
			formatBytes(fontSize * KILOBYTE),
			Math.round(fontFiles).toString(),
			`${fontPercentage.toFixed(1)}%`,
		],
		[
			color.cyan("Other"),
			formatBytes(otherSize * KILOBYTE),
			Math.round(otherFiles).toString(),
			`${otherPercentage.toFixed(1)}%`,
		],
		[
			color.bold("Total"),
			color.bold(formatBytes(totalSize * KILOBYTE)),
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
		["Render Performance", color.bold(formatTime(avgBannerVisibility))],
		["Network Overhead", color.bold(formatBytes(avgNetworkImpact * KILOBYTE))],
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
				formatBytes(resource.size * KILOBYTE),
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

	const resultsDir = "benchmarks";
	const results = await aggregateResults(logger, resultsDir);

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
		appConfigs[name] = await loadConfigForApp(logger, name);
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

	if (isAdminUser()) {
		logger.outro(
			`\nDisplayed ${selectedApps.length} of ${Object.keys(results).length} benchmark(s) - Use ${color.cyan("cookiebench save")} to sync to database`
		);
	} else {
		logger.outro(
			`\nDisplayed ${selectedApps.length} of ${Object.keys(results).length} benchmark(s)`
		);
	}
}
