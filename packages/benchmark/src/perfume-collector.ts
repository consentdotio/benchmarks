import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@c15t/logger";
import type { Page } from "@playwright/test";
import { BENCHMARK_CONSTANTS } from "./constants";
import type { PerfumeMetrics, WindowWithPerfumeMetrics } from "./types";

export class PerfumeCollector {
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}
	/**
	 * Setup Perfume.js in the browser to collect performance metrics
	 */
	async setupPerfume(page: Page): Promise<void> {
		// Load Perfume.js UMD bundle from node_modules
		const perfumeScript = this.loadPerfumeScript();

		await page.addInitScript((perfumeScriptCode: string) => {
			// Initialize storage object
			const win = window as WindowWithPerfumeMetrics;
			win.__perfumeMetrics = {};

			if (!perfumeScriptCode) {
				// Perfume.js failed to load, continue without it
				return;
			}

			try {
				// Execute Perfume.js UMD bundle using script injection
				// This creates the Perfume constructor on window
				const script = document.createElement("script");
				script.textContent = perfumeScriptCode;
				document.head.appendChild(script);
				document.head.removeChild(script);

				// Initialize Perfume with analytics tracker
				// @ts-expect-error - Perfume is loaded from UMD bundle
				new window.Perfume({
					analyticsTracker: ({
						metricName,
						data,
						rating,
						attribution,
						navigatorInformation,
					}: {
						metricName: string;
						data: number;
						rating: string;
						attribution?: unknown;
						navigatorInformation?: {
							deviceMemory?: number;
							hardwareConcurrency?: number;
							isLowEndDevice?: boolean;
							isLowEndExperience?: boolean;
							serviceWorkerStatus?: string;
						};
					}) => {
						const metricsWin = window as WindowWithPerfumeMetrics;
						const metrics = metricsWin.__perfumeMetrics;

						// Store metric with all available data
						if (metrics) {
							metrics[metricName] = {
								value: data,
								rating,
								attribution,
								navigatorInformation,
							};
						}
					},
				});
			} catch (_error) {
				// Perfume.js is optional, continue without it
			}
		}, perfumeScript);
	}

	/**
	 * Load Perfume.js UMD bundle from node_modules
	 */
	private loadPerfumeScript(): string {
		// Try multiple possible paths for perfume.js in a monorepo setup
		const currentDir = fileURLToPath(new URL(".", import.meta.url));
		const possiblePaths = [
			// Package-level node_modules (most common in monorepos)
			join(
				currentDir,
				"..",
				"..",
				"node_modules",
				"perfume.js",
				"dist",
				"perfume.umd.min.js"
			),
			// Root node_modules (alternative location)
			join(
				currentDir,
				"..",
				"..",
				"..",
				"..",
				"node_modules",
				"perfume.js",
				"dist",
				"perfume.umd.min.js"
			),
			// Alternative root location
			join(
				currentDir,
				"..",
				"..",
				"..",
				"node_modules",
				"perfume.js",
				"dist",
				"perfume.umd.min.js"
			),
			// Also try non-minified version
			join(
				currentDir,
				"..",
				"..",
				"node_modules",
				"perfume.js",
				"dist",
				"perfume.umd.js"
			),
		];

		for (const perfumePath of possiblePaths) {
			try {
				return readFileSync(perfumePath, "utf-8");
			} catch {
				// Try next path
			}
		}

		// Try using createRequire for ES modules (works in Node.js environments)
		try {
			const require = createRequire(import.meta.url);
			const perfumeModulePath = require.resolve(
				"perfume.js/dist/perfume.umd.min.js"
			);
			return readFileSync(perfumeModulePath, "utf-8");
		} catch {
			// Final fallback
		}

		this.logger.warn(
			"Failed to load Perfume.js from node_modules, falling back to empty script"
		);
		return "";
	}

	/**
	 * Collect all metrics from Perfume.js
	 */
	async collectMetrics(page: Page): Promise<PerfumeMetrics | null> {
		try {
			// Wait a bit for metrics to be collected
			await page.waitForTimeout(BENCHMARK_CONSTANTS.PERFUME_METRICS_WAIT);

			const rawMetrics = await page.evaluate(() => {
				const win = window as WindowWithPerfumeMetrics;
				const perfumeData = win.__perfumeMetrics;
				return perfumeData || {};
			});

			this.logger.debug("Raw Perfume metrics:", rawMetrics);

			// Get navigation timing separately
			const navigationTiming = await page.evaluate(() => {
				const timing = performance.timing;
				const navigationStart = timing.navigationStart;

				return {
					timeToFirstByte: timing.responseStart - navigationStart,
					domInteractive: timing.domInteractive - navigationStart,
					domContentLoadedEventStart:
						timing.domContentLoadedEventStart - navigationStart,
					domContentLoadedEventEnd:
						timing.domContentLoadedEventEnd - navigationStart,
					domComplete: timing.domComplete - navigationStart,
					loadEventStart: timing.loadEventStart - navigationStart,
					loadEventEnd: timing.loadEventEnd - navigationStart,
				};
			});

			// Get network information
			const networkInformation = await page.evaluate(() => {
				// @ts-expect-error - navigator.connection is experimental
				const connection = navigator.connection || navigator.mozConnection;
				if (connection) {
					return {
						effectiveType: connection.effectiveType || "unknown",
						downlink: connection.downlink || 0,
						rtt: connection.rtt || 0,
						saveData: connection.saveData,
					};
				}
				return;
			});

			// Convert raw metrics to PerfumeMetrics format
			const metrics: PerfumeMetrics = {
				firstPaint: rawMetrics.FP?.value || 0,
				firstContentfulPaint: rawMetrics.FCP?.value || 0,
				largestContentfulPaint: rawMetrics.LCP?.value || 0,
				cumulativeLayoutShift: rawMetrics.CLS?.value || 0,
				totalBlockingTime: rawMetrics.TBT?.value || 0,
				firstInputDelay: rawMetrics.FID?.value || null,
				interactionToNextPaint: rawMetrics.INP?.value || null,
				timeToFirstByte:
					rawMetrics.TTFB?.value || navigationTiming.timeToFirstByte,
				navigationTiming,
				networkInformation,
			};

			return metrics;
		} catch (error) {
			this.logger.error("Failed to collect Perfume metrics:", error);
			return null;
		}
	}
}
