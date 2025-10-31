import type { Logger } from "@c15t/logger";
import type { Page } from "@playwright/test";
import { BENCHMARK_CONSTANTS } from "./constants";
import type { ResourceTimingData } from "./types";

export class ResourceTimingCollector {
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}
	/**
	 * Collect detailed resource timing data from the browser
	 */
	async collect(page: Page): Promise<ResourceTimingData> {
		this.logger.debug("Collecting resource timing data...");

		return await page.evaluate((bytesToKb: number) => {
			const perfEntries = performance.getEntriesByType(
				"navigation"
			)[0] as PerformanceNavigationTiming;
			const resourceEntries = performance.getEntriesByType(
				"resource"
			) as PerformanceResourceTiming[];

			// Helper to determine if a resource is first-party
			const isFirstParty = (entry: PerformanceResourceTiming) => {
				try {
					return (
						new URL(entry.name, window.location.origin).hostname ===
						window.location.hostname
					);
				} catch {
					return (
						entry.name.startsWith(window.location.origin) ||
						entry.name.startsWith("/")
					);
				}
			};

			// Categorize resources
			const scriptEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "script"
			);
			const styleEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "link" && entry.name.endsWith(".css")
			);
			const imageEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "img"
			);
			const fontEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "font"
			);
			const otherEntries = resourceEntries.filter(
				(entry) =>
					!["script", "link", "img", "font"].includes(entry.initiatorType)
			);

			// Calculate sizes
			const calculateSize = (entries: PerformanceResourceTiming[]) => {
				const total =
					entries.reduce((acc, entry) => {
						const size = entry.transferSize || entry.encodedBodySize || 0;
						return acc + size;
					}, 0) / bytesToKb;
				return total;
			};

			const navigationStart = perfEntries.startTime;
			const domContentLoaded =
				perfEntries.domContentLoadedEventEnd - navigationStart;
			const load = perfEntries.loadEventEnd - navigationStart;

			return {
				timing: {
					navigationStart,
					domContentLoaded,
					load,
					scripts: {
						bundled: {
							loadStart: 0,
							loadEnd: scriptEntries
								.filter((entry) => isFirstParty(entry))
								.reduce((acc, entry) => acc + entry.duration, 0),
							executeStart: 0,
							executeEnd: 0,
						},
						thirdParty: {
							loadStart: 0,
							loadEnd: scriptEntries
								.filter((entry) => !isFirstParty(entry))
								.reduce((acc, entry) => acc + entry.duration, 0),
							executeStart: 0,
							executeEnd: 0,
						},
					},
				},
				size: {
					total: calculateSize(resourceEntries),
					bundled: calculateSize(
						scriptEntries.filter((entry) => isFirstParty(entry))
					),
					thirdParty: calculateSize(
						scriptEntries.filter((entry) => !isFirstParty(entry))
					),
					cookieServices: 0, // Will be calculated later
					scripts: {
						total: calculateSize(scriptEntries),
						initial: calculateSize(
							scriptEntries.filter((e) => e.startTime < domContentLoaded)
						),
						dynamic: calculateSize(
							scriptEntries.filter((e) => e.startTime >= domContentLoaded)
						),
						thirdParty: calculateSize(
							scriptEntries.filter((entry) => !isFirstParty(entry))
						),
						cookieServices: 0, // Will be calculated later
					},
					styles: calculateSize(styleEntries),
					images: calculateSize(imageEntries),
					fonts: calculateSize(fontEntries),
					other: calculateSize(otherEntries),
				},
				resources: {
					scripts: scriptEntries.map((entry) => ({
						name: entry.name,
						size:
							(entry.transferSize || entry.encodedBodySize || 0) / bytesToKb,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isDynamic: entry.startTime >= domContentLoaded,
						isCookieService: false,
						dnsTime: entry.domainLookupEnd - entry.domainLookupStart,
						connectionTime: entry.connectEnd - entry.connectStart,
					})),
					styles: styleEntries.map((entry) => ({
						name: entry.name,
						size:
							(entry.transferSize || entry.encodedBodySize || 0) / bytesToKb,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: false,
					})),
					images: imageEntries.map((entry) => ({
						name: entry.name,
						size:
							(entry.transferSize || entry.encodedBodySize || 0) / bytesToKb,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: false,
					})),
					fonts: fontEntries.map((entry) => ({
						name: entry.name,
						size:
							(entry.transferSize || entry.encodedBodySize || 0) / bytesToKb,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: false,
					})),
					other: otherEntries.map((entry) => ({
						name: entry.name,
						size:
							(entry.transferSize || entry.encodedBodySize || 0) / bytesToKb,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: false,
						type: entry.initiatorType,
					})),
				},
				language: (() => {
					const docLang = (
						document.documentElement.getAttribute("lang") || ""
					).trim();
					return (
						docLang || navigator.language || navigator.languages?.[0] || "en"
					);
				})(),
				duration: load,
			};
		}, BENCHMARK_CONSTANTS.BYTES_TO_KB);
	}
}
