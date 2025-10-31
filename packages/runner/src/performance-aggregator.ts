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
import {
	calculateCoefficientOfVariation,
	calculateStatistics,
	calculateTrimmedMean,
	isStable,
} from "./statistics";
import type { BenchmarkDetails, BenchmarkResult } from "./types";

// Constants
const TTI_BUFFER_MS = 1000; // Buffer for true interactivity
const PERCENTAGE_MULTIPLIER = 100; // For converting decimal to percentage
const VARIABILITY_WARNING_THRESHOLD = 20; // Coefficient of variation threshold for warnings
const STABILITY_THRESHOLD = 15; // Coefficient of variation threshold for stability checks
const TRIM_PERCENT = 10; // Percentage to trim from each end for trimmed mean

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
			// Use visibilityTime (UX metric) which accounts for CSS transitions
			// Falls back to interactiveTime if visibilityTime not available
			visibilityTime: cookieBannerData?.bannerVisibilityTime || cookieBannerData?.bannerInteractiveTime || 0,
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
			dnsLookupTime: 0,
			connectionTime: 0,
			downloadTime: networkImpact.totalDownloadTime,
			totalImpact: networkImpact.totalImpact,
			cookieServices: {
				hosts: config.cookieBanner?.serviceHosts || [],
				totalSize: networkMetrics.bannerBundleSize,
				resourceCount: networkMetrics.bannerNetworkRequests,
				dnsLookupTime: 0,
				connectionTime: 0,
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
				? (cookieBannerEstimate / (totalBlockingTime || 1)) *
					PERCENTAGE_MULTIPLIER
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
					dnsLookupTime: 0,
					connectionTime: 0,
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
	 * Calculate average metrics from multiple benchmark results using Mitata statistics
	 * Uses trimmed mean (10% trim) for robustness against outliers
	 * Logs stability warnings for metrics with high variability
	 */
	calculateAverages(results: BenchmarkDetails[]): BenchmarkResult["average"] {
		if (results.length === 0) {
			throw new Error("Cannot calculate averages from empty results array");
		}

		// Extract metric arrays for statistical analysis
		const fcpValues = results.map((r) => r.timing.firstContentfulPaint);
		const lcpValues = results.map((r) => r.timing.largestContentfulPaint);
		const ttiValues = results.map((r) => r.timing.timeToInteractive);
		const tbtValues = results.map((r) => r.timing.mainThreadBlocking.total);
		const ttfbValues = results.map((r) => r.timing.timeToFirstByte || 0);
		const fidValues = results
			.map((r) => r.timing.firstInputDelay || 0)
			.filter((v) => v > 0);
		const inpValues = results
			.map((r) => r.timing.interactionToNextPaint || 0)
			.filter((v) => v > 0);
		const clsValues = results.map((r) => r.timing.cumulativeLayoutShift);
		const totalSizeValues = results.map((r) => r.size.total);
		const jsSizeValues = results.map((r) => r.size.scripts.total);
		const cssSizeValues = results.map((r) => r.size.styles);
		const imageSizeValues = results.map((r) => r.size.images);
		const fontSizeValues = results.map((r) => r.size.fonts);
		const otherSizeValues = results.map((r) => r.size.other);
		const totalRequestsValues = results.map(
			(r) =>
				r.resources.scripts.length +
				r.resources.styles.length +
				r.resources.images.length +
				r.resources.fonts.length +
				r.resources.other.length
		);
		const domContentLoadedValues = results.map(
			(r) => r.timing.domContentLoaded
		);
		const loadValues = results.map((r) => r.timing.load);

		// Use trimmed mean for better robustness against outliers (10% trim)
		// Log stability warnings for critical metrics
		if (!isStable(fcpValues, VARIABILITY_WARNING_THRESHOLD)) {
			this.logger.warn(
				`First Contentful Paint shows high variability (CV: ${calculateCoefficientOfVariation(fcpValues).toFixed(1)}%)`
			);
		}
		if (!isStable(lcpValues, VARIABILITY_WARNING_THRESHOLD)) {
			this.logger.warn(
				`Largest Contentful Paint shows high variability (CV: ${calculateCoefficientOfVariation(lcpValues).toFixed(1)}%)`
			);
		}
		if (!isStable(ttiValues, VARIABILITY_WARNING_THRESHOLD)) {
			this.logger.warn(
				`Time to Interactive shows high variability (CV: ${calculateCoefficientOfVariation(ttiValues).toFixed(1)}%)`
			);
		}

		return {
			firstContentfulPaint: calculateTrimmedMean(fcpValues, TRIM_PERCENT),
			largestContentfulPaint: calculateTrimmedMean(lcpValues, TRIM_PERCENT),
			timeToInteractive: calculateTrimmedMean(ttiValues, TRIM_PERCENT),
			totalBlockingTime: calculateTrimmedMean(tbtValues, TRIM_PERCENT),
			speedIndex: 0, // Default value
			timeToFirstByte: calculateTrimmedMean(ttfbValues, TRIM_PERCENT),
			firstInputDelay:
				fidValues.length > 0
					? calculateTrimmedMean(fidValues, TRIM_PERCENT)
					: 0,
			interactionToNextPaint:
				inpValues.length > 0
					? calculateTrimmedMean(inpValues, TRIM_PERCENT)
					: 0,
			cumulativeLayoutShift: calculateTrimmedMean(clsValues, TRIM_PERCENT),
			domSize: 0, // Default value
			totalRequests: calculateTrimmedMean(totalRequestsValues, TRIM_PERCENT),
			totalSize: calculateTrimmedMean(totalSizeValues, TRIM_PERCENT),
			jsSize: calculateTrimmedMean(jsSizeValues, TRIM_PERCENT),
			cssSize: calculateTrimmedMean(cssSizeValues, TRIM_PERCENT),
			imageSize: calculateTrimmedMean(imageSizeValues, TRIM_PERCENT),
			fontSize: calculateTrimmedMean(fontSizeValues, TRIM_PERCENT),
			otherSize: calculateTrimmedMean(otherSizeValues, TRIM_PERCENT),
			thirdPartyRequests: 0, // Default value
			thirdPartySize: 0, // Default value
			thirdPartyDomains: 0, // Default value
			thirdPartyCookies: 0, // Default value
			thirdPartyLocalStorage: 0, // Default value
			thirdPartySessionStorage: 0, // Default value
			thirdPartyIndexedDB: 0, // Default value
			thirdPartyCache: 0, // Default value
			thirdPartyServiceWorkers: 0, // Default value
			thirdPartyWebWorkers: 0, // Default value
			thirdPartyWebSockets: 0, // Default value
			thirdPartyBeacons: 0, // Default value
			thirdPartyFetch: 0, // Default value
			thirdPartyXHR: 0, // Default value
			thirdPartyScripts: 0, // Default value
			thirdPartyStyles: 0, // Default value
			thirdPartyImages: 0, // Default value
			thirdPartyFonts: 0, // Default value
			thirdPartyMedia: 0, // Default value
			thirdPartyOther: 0, // Default value
			thirdPartyTiming: {
				total: 0,
				blocking: 0,
				dns: 0,
				connect: 0,
				ssl: 0,
				send: 0,
				wait: 0,
				receive: 0,
			},
			cookieBannerTiming: {
				firstPaint: 0,
				firstContentfulPaint: calculateTrimmedMean(fcpValues, TRIM_PERCENT),
				domContentLoaded: calculateTrimmedMean(
					domContentLoadedValues,
					TRIM_PERCENT
				),
				load: calculateTrimmedMean(loadValues, TRIM_PERCENT),
			},
		};
	}

	/**
	 * Get statistical summary for a set of benchmark results
	 */
	getStatisticalSummary(results: BenchmarkDetails[]): {
		fcp: ReturnType<typeof calculateStatistics>;
		lcp: ReturnType<typeof calculateStatistics>;
		tti: ReturnType<typeof calculateStatistics>;
		tbt: ReturnType<typeof calculateStatistics>;
	} {
		const fcpValues = results.map((r) => r.timing.firstContentfulPaint);
		const lcpValues = results.map((r) => r.timing.largestContentfulPaint);
		const ttiValues = results.map((r) => r.timing.timeToInteractive);
		const tbtValues = results.map((r) => r.timing.mainThreadBlocking.total);

		return {
			fcp: calculateStatistics(fcpValues),
			lcp: calculateStatistics(lcpValues),
			tti: calculateStatistics(ttiValues),
			tbt: calculateStatistics(tbtValues),
		};
	}

	/**
	 * Log comprehensive benchmark results with statistical information
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

	/**
	 * Log statistical summary for multiple benchmark runs
	 */
	logStatisticalSummary(results: BenchmarkDetails[]): void {
		if (results.length === 0) {
			return;
		}

		const summary = this.getStatisticalSummary(results);

		this.logger.info("📊 Statistical Summary:");
		this.logger.info(
			`  FCP: ${summary.fcp.mean.toFixed(0)}ms (median: ${summary.fcp.median.toFixed(0)}ms, stddev: ${summary.fcp.stddev.toFixed(0)}ms)`
		);
		this.logger.info(
			`  LCP: ${summary.lcp.mean.toFixed(0)}ms (median: ${summary.lcp.median.toFixed(0)}ms, stddev: ${summary.lcp.stddev.toFixed(0)}ms)`
		);
		this.logger.info(
			`  TTI: ${summary.tti.mean.toFixed(0)}ms (median: ${summary.tti.median.toFixed(0)}ms, stddev: ${summary.tti.stddev.toFixed(0)}ms)`
		);
		this.logger.info(
			`  TBT: ${summary.tbt.mean.toFixed(0)}ms (median: ${summary.tbt.median.toFixed(0)}ms, stddev: ${summary.tbt.stddev.toFixed(0)}ms)`
		);

		// Log stability indicators
		const fcpValues = results.map((r) => r.timing.firstContentfulPaint);
		const lcpValues = results.map((r) => r.timing.largestContentfulPaint);
		const ttiValues = results.map((r) => r.timing.timeToInteractive);

		if (isStable(fcpValues, STABILITY_THRESHOLD)) {
			this.logger.info("  ✓ FCP is stable");
		}
		if (isStable(lcpValues, STABILITY_THRESHOLD)) {
			this.logger.info("  ✓ LCP is stable");
		}
		if (isStable(ttiValues, STABILITY_THRESHOLD)) {
			this.logger.info("  ✓ TTI is stable");
		}
	}
}
