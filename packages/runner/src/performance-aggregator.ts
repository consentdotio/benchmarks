import type { Logger } from "@c15t/logger";
import type {
	Config,
	CookieBannerData,
	CookieBannerMetrics,
	CoreWebVitals,
	NetworkMetrics,
	NetworkRequest,
	PerfumeMetrics,
	ResourceTimingData,
} from "@consentio/benchmark";
import { PERCENTAGE_MULTIPLIER, TTI_BUFFER_MS } from "@consentio/shared";
import type { BenchmarkDetails, BenchmarkResult } from "./types";

type AggregateMetricsParams = {
	coreWebVitals: CoreWebVitals;
	cookieBannerData: CookieBannerData | null;
	cookieBannerMetrics: CookieBannerMetrics;
	networkRequests: NetworkRequest[];
	networkMetrics: NetworkMetrics;
	resourceMetrics: ResourceTimingData;
	config: Config;
	perfumeMetrics: PerfumeMetrics | null;
};

export class PerformanceAggregator {
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}
	/**
	 * Calculate Time to Interactive based on core web vitals and cookie banner interaction
	 */
	calculateTTI(
		coreWebVitals: CoreWebVitals,
		cookieBannerData: CookieBannerData | null
	): number {
		return (
			Math.max(
				coreWebVitals.paint?.firstContentfulPaint || 0,
				coreWebVitals.domCompleteTiming || 0,
				cookieBannerData?.bannerInteractiveTime || 0
			) + TTI_BUFFER_MS
		); // Add buffer for true interactivity
	}

	/**
	 * Build cookie banner timing metrics
	 */
	private buildCookieBannerTiming(
		cookieBannerData: CookieBannerData | null,
		config: Config
	) {
		return {
			renderStart: cookieBannerData?.bannerRenderTime || 0,
			renderEnd: cookieBannerData?.bannerInteractiveTime || 0,
			interactionStart: cookieBannerData?.bannerInteractiveTime || 0,
			interactionEnd: cookieBannerData?.bannerInteractiveTime || 0,
			layoutShift: cookieBannerData?.layoutShiftImpact || 0,
			detected: cookieBannerData?.detected ?? false,
			selector: cookieBannerData?.selector ?? null,
			serviceName: config.cookieBanner?.serviceName ?? "unknown",
			visibilityTime: cookieBannerData?.bannerInteractiveTime || 0,
			viewportCoverage: cookieBannerData?.viewportCoverage || 0,
		};
	}

	/**
	 * Build third party metrics
	 */
	private buildThirdPartyMetrics(
		networkImpact: { totalImpact: number; totalDownloadTime: number },
		networkMetrics: NetworkMetrics,
		config: Config
	) {
		return {
			dnsLookupTime: null,
			connectionTime: null,
			downloadTime: networkImpact.totalDownloadTime,
			totalImpact: networkImpact.totalImpact,
			cookieServices: {
				hosts: config.cookieBanner?.serviceHosts || [],
				totalSize: networkMetrics.bannerBundleSize,
				resourceCount: networkMetrics.bannerNetworkRequests,
				dnsLookupTime: null,
				connectionTime: null,
				downloadTime: networkImpact.totalDownloadTime,
			},
		};
	}

	/**
	 * Build main thread blocking metrics
	 */
	private buildMainThreadBlockingMetrics(
		coreWebVitals: CoreWebVitals,
		cookieBannerMetrics: CookieBannerMetrics
	) {
		const totalBlockingTime = coreWebVitals.totalBlockingTime || 0;
		const cookieBannerEstimate =
			cookieBannerMetrics.bannerMainThreadBlockingTime;

		const percentageFromCookies =
			totalBlockingTime > 0
				? (cookieBannerEstimate / totalBlockingTime) * PERCENTAGE_MULTIPLIER
				: 0;

		return {
			total: totalBlockingTime,
			cookieBannerEstimate,
			percentageFromCookies,
		};
	}

	/**
	 * Merge all collected metrics into final benchmark details
	 */
	aggregateMetrics(params: AggregateMetricsParams): BenchmarkDetails {
		const {
			coreWebVitals,
			cookieBannerData,
			cookieBannerMetrics,
			networkRequests,
			networkMetrics,
			resourceMetrics,
			config,
			perfumeMetrics,
		} = params;

		const tti = this.calculateTTI(coreWebVitals, cookieBannerData);
		const networkImpact = this.calculateNetworkImpact(networkRequests);

		return {
			duration: resourceMetrics.duration,
			size: resourceMetrics.size,
			timing: {
				navigationStart: resourceMetrics.timing.navigationStart,
				domContentLoaded: resourceMetrics.timing.domContentLoaded,
				load: resourceMetrics.timing.load,
				firstPaint: coreWebVitals.paint?.firstPaint || 0,
				firstContentfulPaint: coreWebVitals.paint?.firstContentfulPaint || 0,
				largestContentfulPaint: coreWebVitals.largestContentfulPaint || 0,
				timeToInteractive: tti,
				cumulativeLayoutShift: coreWebVitals.cumulativeLayoutShift || 0,
				timeToFirstByte: perfumeMetrics?.timeToFirstByte || 0,
				firstInputDelay: perfumeMetrics?.firstInputDelay || null,
				interactionToNextPaint: perfumeMetrics?.interactionToNextPaint || null,
				navigationTiming: perfumeMetrics?.navigationTiming || {
					timeToFirstByte: 0,
					domInteractive: 0,
					domContentLoadedEventStart: 0,
					domContentLoadedEventEnd: 0,
					domComplete: 0,
					loadEventStart: 0,
					loadEventEnd: 0,
				},
				networkInformation: perfumeMetrics?.networkInformation || undefined,
				cookieBanner: this.buildCookieBannerTiming(cookieBannerData, config),
				thirdParty: this.buildThirdPartyMetrics(
					networkImpact,
					networkMetrics,
					config
				),
				mainThreadBlocking: this.buildMainThreadBlockingMetrics(
					coreWebVitals,
					cookieBannerMetrics
				),
				scripts: resourceMetrics.timing.scripts,
			},
			resources: resourceMetrics.resources,
			language: resourceMetrics.language,
			cookieBanner: {
				detected: cookieBannerData?.detected ?? false,
				selector: cookieBannerData?.selector ?? null,
				serviceName: config.cookieBanner?.serviceName ?? "unknown",
				visibilityTime: cookieBannerData?.bannerInteractiveTime || 0,
				viewportCoverage: cookieBannerData?.viewportCoverage || 0,
			},
			thirdParty: {
				cookieServices: {
					hosts: config.cookieBanner?.serviceHosts || [],
					totalSize: networkMetrics.bannerBundleSize,
					resourceCount: networkMetrics.bannerNetworkRequests,
					dnsLookupTime: null,
					connectionTime: null,
					downloadTime: networkImpact.totalDownloadTime,
				},
				totalImpact: networkImpact.totalImpact,
			},
		};
	}

	/**
	 * Calculate network impact metrics
	 */
	private calculateNetworkImpact(networkRequests: NetworkRequest[]): {
		totalImpact: number;
		totalDownloadTime: number;
	} {
		const totalImpact = networkRequests.reduce((acc, req) => acc + req.size, 0);
		const totalDownloadTime = networkRequests.reduce(
			(acc, req) => acc + req.duration,
			0
		);

		return { totalImpact, totalDownloadTime };
	}

	/**
	 * Calculate average metrics from multiple benchmark results
	 */
	calculateAverages(results: BenchmarkDetails[]): BenchmarkResult["average"] {
		if (results.length === 0) {
			throw new Error("Cannot calculate averages from empty results array");
		}

		// Helper to compute average from defined values only
		const avgDefined = (
			values: (number | null | undefined)[]
		): number | null => {
			const defined = values.filter((v): v is number => v != null);
			return defined.length > 0
				? defined.reduce((acc, v) => acc + v, 0) / defined.length
				: null;
		};

		// Calculate cookieBannerTiming.firstPaint from results[].timing.firstPaint
		const firstPaintValues = results.map((r) => r.timing.firstPaint || null);
		const cookieBannerFirstPaint = avgDefined(firstPaintValues);

		return {
			firstContentfulPaint:
				results.reduce(
					(acc, curr) => acc + curr.timing.firstContentfulPaint,
					0
				) / results.length,
			largestContentfulPaint:
				results.reduce(
					(acc, curr) => acc + curr.timing.largestContentfulPaint,
					0
				) / results.length,
			timeToInteractive:
				results.reduce((acc, curr) => acc + curr.timing.timeToInteractive, 0) /
				results.length,
			totalBlockingTime:
				results.reduce(
					(acc, curr) => acc + curr.timing.mainThreadBlocking.total,
					0
				) / results.length,
			speedIndex: null, // Not measured
			timeToFirstByte:
				results.reduce(
					(acc, curr) => acc + (curr.timing.timeToFirstByte || 0),
					0
				) / results.length,
			firstInputDelay:
				results.reduce(
					(acc, curr) => acc + (curr.timing.firstInputDelay || 0),
					0
				) / results.length,
			interactionToNextPaint:
				results.reduce(
					(acc, curr) => acc + (curr.timing.interactionToNextPaint || 0),
					0
				) / results.length,
			cumulativeLayoutShift:
				results.reduce(
					(acc, curr) => acc + curr.timing.cumulativeLayoutShift,
					0
				) / results.length,
			domSize: null, // Not measured
			totalRequests:
				results.reduce(
					(acc, curr) =>
						acc +
						(curr.resources.scripts.length +
							curr.resources.styles.length +
							curr.resources.images.length +
							curr.resources.fonts.length +
							curr.resources.other.length),
					0
				) / results.length,
			totalSize:
				results.reduce((acc, curr) => acc + curr.size.total, 0) /
				results.length,
			jsSize:
				results.reduce((acc, curr) => acc + curr.size.scripts.total, 0) /
				results.length,
			cssSize:
				results.reduce((acc, curr) => acc + curr.size.styles, 0) /
				results.length,
			imageSize:
				results.reduce((acc, curr) => acc + curr.size.images, 0) /
				results.length,
			fontSize:
				results.reduce((acc, curr) => acc + curr.size.fonts, 0) /
				results.length,
			otherSize:
				results.reduce((acc, curr) => acc + curr.size.other, 0) /
				results.length,
			thirdPartyRequests: null, // Not measured
			thirdPartySize: null, // Not measured
			thirdPartyDomains: null, // Not measured
			thirdPartyCookies: null, // Not measured
			thirdPartyLocalStorage: null, // Not measured
			thirdPartySessionStorage: null, // Not measured
			thirdPartyIndexedDB: null, // Not measured
			thirdPartyCache: null, // Not measured
			thirdPartyServiceWorkers: null, // Not measured
			thirdPartyWebWorkers: null, // Not measured
			thirdPartyWebSockets: null, // Not measured
			thirdPartyBeacons: null, // Not measured
			thirdPartyFetch: null, // Not measured
			thirdPartyXHR: null, // Not measured
			thirdPartyScripts: null, // Not measured
			thirdPartyStyles: null, // Not measured
			thirdPartyImages: null, // Not measured
			thirdPartyFonts: null, // Not measured
			thirdPartyMedia: null, // Not measured
			thirdPartyOther: null, // Not measured
			thirdPartyTiming: {
				total: null,
				blocking: null,
				dns: null,
				connect: null,
				ssl: null,
				send: null,
				wait: null,
				receive: null,
			},
			cookieBannerTiming: {
				firstPaint: cookieBannerFirstPaint,
				firstContentfulPaint:
					results.reduce(
						(acc, curr) => acc + curr.timing.firstContentfulPaint,
						0
					) / results.length,
				domContentLoaded:
					results.reduce((acc, curr) => acc + curr.timing.domContentLoaded, 0) /
					results.length,
				load:
					results.reduce((acc, curr) => acc + curr.timing.load, 0) /
					results.length,
			},
		};
	}

	/**
	 * Log comprehensive benchmark results
	 */
	logResults(
		finalMetrics: BenchmarkDetails,
		cookieBannerMetrics: CookieBannerMetrics,
		config: Config
	): void {
		let bundleStrategy = "Unknown";
		if (cookieBannerMetrics.isBundled) {
			bundleStrategy = "Bundled";
		} else if (cookieBannerMetrics.isIIFE) {
			bundleStrategy = "IIFE";
		}

		this.logger.debug("Final cookie banner benchmark results:", {
			fcp: finalMetrics.timing.firstContentfulPaint,
			lcp: finalMetrics.timing.largestContentfulPaint,
			cls: finalMetrics.timing.cumulativeLayoutShift,
			tti: finalMetrics.timing.timeToInteractive,
			tbt: finalMetrics.timing.mainThreadBlocking.total,
			bannerDetected: finalMetrics.cookieBanner.detected,
			bannerRenderTime:
				finalMetrics.timing.cookieBanner.renderEnd -
				finalMetrics.timing.cookieBanner.renderStart,
			bannerLayoutShift: finalMetrics.timing.cookieBanner.layoutShift,
			bannerNetworkImpact: finalMetrics.thirdParty.totalImpact,
			bundleStrategy,
			isBundled: cookieBannerMetrics.isBundled,
			isIIFE: cookieBannerMetrics.isIIFE,
			configBundleType: config.techStack?.bundleType,
		});
	}
}
