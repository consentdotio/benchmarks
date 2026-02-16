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
import { calculateStatistics, calculateTrimmedMean } from "./statistics";
import type {
	BenchmarkDetails,
	BenchmarkResult,
	BenchmarkStatistics,
} from "./types";

const VARIABILITY_WARNING_THRESHOLD = 20;
const STABILITY_THRESHOLD = 15;
const TRIM_PERCENT = 10;
const FCP_LCP_MIN_STDDEV_MS = 8;
const FCP_LCP_MIN_P95_P50_SPREAD_MS = 15;
const TTI_MIN_STDDEV_MS = 30;
const TTI_MIN_P95_P50_SPREAD_MS = 60;

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
		);
	}

	private buildCookieBannerTiming(
		cookieBannerData: CookieBannerData | null,
		config: Config
	) {
		const domPresenceTime = cookieBannerData?.bannerRenderTime || 0;
		const userVisibleTime =
			cookieBannerData?.bannerVisibilityTime ||
			cookieBannerData?.bannerInteractiveTime ||
			0;
		return {
			renderStart: domPresenceTime,
			renderEnd: cookieBannerData?.bannerInteractiveTime || 0,
			interactionStart: cookieBannerData?.bannerInteractiveTime || 0,
			interactionEnd: cookieBannerData?.bannerInteractiveTime || 0,
			layoutShift: cookieBannerData?.layoutShiftImpact || 0,
			detected: cookieBannerData?.detected ?? false,
			selector: cookieBannerData?.selector ?? null,
			serviceName: config.cookieBanner?.serviceName ?? "unknown",
			visibilityTime: userVisibleTime,
			domPresenceTime,
			userVisibleTime,
			viewportCoverage: cookieBannerData?.viewportCoverage || 0,
		};
	}

	private buildThirdPartyMetrics(
		networkImpact: {
			totalImpact: number;
			totalDownloadTime: number;
			thirdPartyImpact: number;
			thirdPartyDownloadTime: number;
		},
		resourceMetrics: ResourceTimingData,
		config: Config
	) {
		const cookieServiceResources = [
			...resourceMetrics.resources.scripts,
			...resourceMetrics.resources.styles,
			...resourceMetrics.resources.images,
			...resourceMetrics.resources.fonts,
			...resourceMetrics.resources.other,
		].filter((resource) => resource.isCookieService);

		const cookieServicesTotalSizeFromResourceTiming =
			cookieServiceResources.reduce((acc, resource) => acc + resource.size, 0);
		const cookieServicesDownloadTimeFromResourceTiming =
			cookieServiceResources.reduce(
				(acc, resource) => acc + resource.duration,
				0
			);

		const cookieServicesTotalSize =
			cookieServicesTotalSizeFromResourceTiming > 0
				? cookieServicesTotalSizeFromResourceTiming
				: networkImpact.thirdPartyImpact;
		const cookieServicesDownloadTime =
			cookieServicesDownloadTimeFromResourceTiming > 0
				? cookieServicesDownloadTimeFromResourceTiming
				: networkImpact.thirdPartyDownloadTime;
		const totalImpact =
			networkImpact.totalImpact > 0
				? networkImpact.totalImpact
				: cookieServicesTotalSize;
		const totalDownloadTime =
			networkImpact.totalDownloadTime > 0
				? networkImpact.totalDownloadTime
				: cookieServicesDownloadTime;

		return {
			dnsLookupTime: 0,
			connectionTime: 0,
			downloadTime: totalDownloadTime,
			totalImpact,
			cookieServices: {
				hosts: config.cookieBanner?.serviceHosts || [],
				totalSize: cookieServicesTotalSize,
				resourceCount: cookieServiceResources.length,
				dnsLookupTime: 0,
				connectionTime: 0,
				downloadTime: cookieServicesDownloadTime,
			},
		};
	}

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
		const thirdPartyMetrics = this.buildThirdPartyMetrics(
			networkImpact,
			resourceMetrics,
			config
		);
		let resolvedThirdPartySize: number;
		if (resourceMetrics.size.thirdParty > 0) {
			resolvedThirdPartySize = resourceMetrics.size.thirdParty;
		} else if (networkImpact.thirdPartyImpact > 0) {
			resolvedThirdPartySize = networkImpact.thirdPartyImpact;
		} else {
			resolvedThirdPartySize = thirdPartyMetrics.cookieServices.totalSize;
		}
		const resolvedThirdPartyScriptSize =
			resourceMetrics.size.scripts.thirdParty > 0
				? resourceMetrics.size.scripts.thirdParty
				: resolvedThirdPartySize;

		return {
			duration: resourceMetrics.duration,
			size: {
				...resourceMetrics.size,
				thirdParty: resolvedThirdPartySize,
				cookieServices:
					resourceMetrics.size.cookieServices ||
					thirdPartyMetrics.cookieServices.totalSize,
				scripts: {
					...resourceMetrics.size.scripts,
					thirdParty: resolvedThirdPartyScriptSize,
					cookieServices:
						resourceMetrics.size.scripts.cookieServices ||
						resourceMetrics.resources.scripts
							.filter((resource) => resource.isCookieService)
							.reduce((acc, resource) => acc + resource.size, 0),
				},
			},
			timing: {
				navigationStart: resourceMetrics.timing.navigationStart,
				domContentLoaded: resourceMetrics.timing.domContentLoaded,
				load: resourceMetrics.timing.load,
				firstPaint: coreWebVitals.paint?.firstPaint || 0,
				firstContentfulPaint: coreWebVitals.paint?.firstContentfulPaint || 0,
				largestContentfulPaint: coreWebVitals.largestContentfulPaint || 0,
				timeToInteractive: tti,
				cumulativeLayoutShift: coreWebVitals.cumulativeLayoutShift || 0,
				timeToFirstByte: perfumeMetrics?.timeToFirstByte ?? null,
				firstInputDelay: perfumeMetrics?.firstInputDelay ?? null,
				interactionToNextPaint: perfumeMetrics?.interactionToNextPaint ?? null,
				navigationTiming: perfumeMetrics?.navigationTiming ?? {
					timeToFirstByte: 0,
					domInteractive: 0,
					domContentLoadedEventStart: 0,
					domContentLoadedEventEnd: 0,
					domComplete: 0,
					loadEventStart: 0,
					loadEventEnd: 0,
				},
				networkInformation: perfumeMetrics?.networkInformation ?? undefined,
				cookieBanner: this.buildCookieBannerTiming(cookieBannerData, config),
				thirdParty: thirdPartyMetrics,
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
				visibilityTime:
					cookieBannerData?.bannerVisibilityTime ||
					cookieBannerData?.bannerInteractiveTime ||
					0,
				domPresenceTime: cookieBannerData?.bannerRenderTime || 0,
				userVisibleTime:
					cookieBannerData?.bannerVisibilityTime ||
					cookieBannerData?.bannerInteractiveTime ||
					0,
				viewportCoverage: cookieBannerData?.viewportCoverage || 0,
			},
			thirdParty: {
				cookieServices: {
					hosts: config.cookieBanner?.serviceHosts || [],
					totalSize: thirdPartyMetrics.cookieServices.totalSize,
					resourceCount: thirdPartyMetrics.cookieServices.resourceCount,
					dnsLookupTime: 0,
					connectionTime: 0,
					downloadTime: thirdPartyMetrics.cookieServices.downloadTime,
				},
				totalImpact:
					networkImpact.thirdPartyImpact ||
					networkMetrics.bannerBundleSize ||
					resolvedThirdPartySize ||
					0,
			},
		};
	}

	calculateNetworkImpact(networkRequests: NetworkRequest[]): {
		totalImpact: number;
		totalDownloadTime: number;
		thirdPartyImpact: number;
		thirdPartyDownloadTime: number;
	} {
		const totalImpact = networkRequests.reduce((acc, req) => acc + req.size, 0);
		const totalDownloadTime = networkRequests.reduce(
			(acc, req) => acc + req.duration,
			0
		);
		const thirdPartyImpact = networkRequests
			.filter((request) => request.isThirdParty)
			.reduce((acc, request) => acc + request.size, 0);
		const thirdPartyDownloadTime = networkRequests
			.filter((request) => request.isThirdParty)
			.reduce((acc, request) => acc + request.duration, 0);

		return {
			totalImpact,
			totalDownloadTime,
			thirdPartyImpact,
			thirdPartyDownloadTime,
		};
	}

	hasMeaningfulVariability(
		values: number[],
		cvThreshold: number,
		minStddev: number,
		minP95P50Spread: number
	): { unstable: boolean; cv: number } {
		const stats = calculateStatistics(values);
		const absoluteSpread = Math.max(0, stats.p95 - stats.p50);
		const unstable =
			stats.cv > cvThreshold &&
			(stats.stddev >= minStddev || absoluteSpread >= minP95P50Spread);
		return { unstable, cv: stats.cv };
	}

	private calculateAverageThirdPartyDomainCount(
		results: BenchmarkDetails[]
	): number {
		const domainCounts = results.map((result) => {
			const hosts = new Set<string>();
			for (const resource of [
				...result.resources.scripts,
				...result.resources.styles,
				...result.resources.images,
				...result.resources.fonts,
				...result.resources.other,
			]) {
				if (!resource.isThirdParty) {
					continue;
				}
				try {
					hosts.add(new URL(resource.name).hostname);
				} catch {
					// Ignore malformed URLs from resource timing
				}
			}
			return hosts.size;
		});
		return calculateTrimmedMean(domainCounts, TRIM_PERCENT);
	}

	calculateAverages(results: BenchmarkDetails[]): BenchmarkResult["average"] {
		if (results.length === 0) {
			throw new Error("Cannot calculate averages from empty results array");
		}

		const fcpValues = results.map((r) => r.timing.firstContentfulPaint);
		const lcpValues = results.map((r) => r.timing.largestContentfulPaint);
		const ttiValues = results.map((r) => r.timing.timeToInteractive);
		const tbtValues = results.map((r) => r.timing.mainThreadBlocking.total);
		const clsValues = results.map((r) => r.timing.cumulativeLayoutShift);
		const ttfbValues = results
			.map((r) => r.timing.timeToFirstByte)
			.filter((value): value is number => value !== null && value > 0);
		const inpValues = results
			.map((r) => r.timing.interactionToNextPaint)
			.filter((value): value is number => value !== null && value > 0);
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
		const thirdPartyRequestValues = results.map(
			(r) =>
				r.resources.scripts.filter((resource) => resource.isThirdParty).length +
				r.resources.styles.filter((resource) => resource.isThirdParty).length +
				r.resources.images.filter((resource) => resource.isThirdParty).length +
				r.resources.fonts.filter((resource) => resource.isThirdParty).length +
				r.resources.other.filter((resource) => resource.isThirdParty).length
		);
		const thirdPartySizeValues = results.map((r) => r.size.thirdParty);
		const bannerVisibleValues = results.map(
			(r) =>
				r.cookieBanner.userVisibleTime ?? r.cookieBanner.visibilityTime ?? 0
		);
		const bannerDomValues = results.map((r) => r.cookieBanner.domPresenceTime);
		const bannerCoverageValues = results.map(
			(r) => r.cookieBanner.viewportCoverage
		);
		const scriptLoadValues = results.map(
			(r) =>
				r.timing.scripts.bundled.loadEnd + r.timing.scripts.thirdParty.loadEnd
		);

		const fcpVariability = this.hasMeaningfulVariability(
			fcpValues,
			VARIABILITY_WARNING_THRESHOLD,
			FCP_LCP_MIN_STDDEV_MS,
			FCP_LCP_MIN_P95_P50_SPREAD_MS
		);
		if (fcpVariability.unstable) {
			this.logger.warn(
				`First Contentful Paint shows high variability (CV: ${fcpVariability.cv.toFixed(1)}%)`
			);
		}
		const lcpVariability = this.hasMeaningfulVariability(
			lcpValues,
			VARIABILITY_WARNING_THRESHOLD,
			FCP_LCP_MIN_STDDEV_MS,
			FCP_LCP_MIN_P95_P50_SPREAD_MS
		);
		if (lcpVariability.unstable) {
			this.logger.warn(
				`Largest Contentful Paint shows high variability (CV: ${lcpVariability.cv.toFixed(1)}%)`
			);
		}
		const ttiVariability = this.hasMeaningfulVariability(
			ttiValues,
			VARIABILITY_WARNING_THRESHOLD,
			TTI_MIN_STDDEV_MS,
			TTI_MIN_P95_P50_SPREAD_MS
		);
		if (ttiVariability.unstable) {
			this.logger.warn(
				`Time to Interactive shows high variability (CV: ${ttiVariability.cv.toFixed(1)}%)`
			);
		}

		return {
			firstContentfulPaint: calculateTrimmedMean(fcpValues, TRIM_PERCENT),
			largestContentfulPaint: calculateTrimmedMean(lcpValues, TRIM_PERCENT),
			timeToInteractive: calculateTrimmedMean(ttiValues, TRIM_PERCENT),
			totalBlockingTime: calculateTrimmedMean(tbtValues, TRIM_PERCENT),
			timeToFirstByte:
				ttfbValues.length > 0
					? calculateTrimmedMean(ttfbValues, TRIM_PERCENT)
					: 0,
			interactionToNextPaint:
				inpValues.length > 0
					? calculateTrimmedMean(inpValues, TRIM_PERCENT)
					: 0,
			cumulativeLayoutShift: calculateTrimmedMean(clsValues, TRIM_PERCENT),
			totalRequests: calculateTrimmedMean(totalRequestsValues, TRIM_PERCENT),
			totalSize: calculateTrimmedMean(totalSizeValues, TRIM_PERCENT),
			jsSize: calculateTrimmedMean(jsSizeValues, TRIM_PERCENT),
			cssSize: calculateTrimmedMean(cssSizeValues, TRIM_PERCENT),
			imageSize: calculateTrimmedMean(imageSizeValues, TRIM_PERCENT),
			fontSize: calculateTrimmedMean(fontSizeValues, TRIM_PERCENT),
			otherSize: calculateTrimmedMean(otherSizeValues, TRIM_PERCENT),
			thirdPartyRequests: calculateTrimmedMean(
				thirdPartyRequestValues,
				TRIM_PERCENT
			),
			thirdPartySize: calculateTrimmedMean(thirdPartySizeValues, TRIM_PERCENT),
			thirdPartyDomains: this.calculateAverageThirdPartyDomainCount(results),
			cookieBannerVisibleTime: calculateTrimmedMean(
				bannerVisibleValues,
				TRIM_PERCENT
			),
			cookieBannerDomPresenceTime: calculateTrimmedMean(
				bannerDomValues,
				TRIM_PERCENT
			),
			cookieBannerCoverage: calculateTrimmedMean(
				bannerCoverageValues,
				TRIM_PERCENT
			),
			scriptLoadTime: calculateTrimmedMean(scriptLoadValues, TRIM_PERCENT),
		};
	}

	getStatisticalSummary(results: BenchmarkDetails[]): BenchmarkStatistics {
		const fcpValues = results.map((r) => r.timing.firstContentfulPaint);
		const lcpValues = results.map((r) => r.timing.largestContentfulPaint);
		const ttiValues = results.map((r) => r.timing.timeToInteractive);
		const tbtValues = results.map((r) => r.timing.mainThreadBlocking.total);
		const clsValues = results.map((r) => r.timing.cumulativeLayoutShift);
		const ttfbValues = results
			.map((r) => r.timing.timeToFirstByte)
			.filter((value): value is number => value !== null && value > 0);
		const bannerVisibleValues = results
			.map(
				(r) => r.cookieBanner.userVisibleTime ?? r.cookieBanner.visibilityTime
			)
			.filter((value): value is number => value !== null && value > 0);

		return {
			fcp: calculateStatistics(fcpValues),
			lcp: calculateStatistics(lcpValues),
			tti: calculateStatistics(ttiValues),
			tbt: calculateStatistics(tbtValues),
			cls: calculateStatistics(clsValues),
			ttfb: calculateStatistics(ttfbValues),
			bannerVisibleTime: calculateStatistics(bannerVisibleValues),
		};
	}

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
			bannerVisibleTime: finalMetrics.cookieBanner.userVisibleTime,
			bannerLayoutShift: finalMetrics.timing.cookieBanner.layoutShift,
			bannerNetworkImpact: finalMetrics.thirdParty.totalImpact,
			bundleStrategy,
			isBundled: cookieBannerMetrics.isBundled,
			isIIFE: cookieBannerMetrics.isIIFE,
			configBundleType: config.techStack?.bundleType,
		});
	}

	logStatisticalSummary(results: BenchmarkDetails[]): void {
		if (results.length === 0) {
			return;
		}

		const summary = this.getStatisticalSummary(results);

		this.logger.info("📊 Statistical Summary:");
		this.logger.info(
			`  FCP mean ${summary.fcp.mean.toFixed(0)}ms | p50 ${summary.fcp.p50.toFixed(0)}ms | p95 ${summary.fcp.p95.toFixed(0)}ms | CV ${summary.fcp.cv.toFixed(1)}%`
		);
		this.logger.info(
			`  LCP mean ${summary.lcp.mean.toFixed(0)}ms | p50 ${summary.lcp.p50.toFixed(0)}ms | p95 ${summary.lcp.p95.toFixed(0)}ms | CV ${summary.lcp.cv.toFixed(1)}%`
		);
		this.logger.info(
			`  TTI mean ${summary.tti.mean.toFixed(0)}ms | p50 ${summary.tti.p50.toFixed(0)}ms | p95 ${summary.tti.p95.toFixed(0)}ms | CV ${summary.tti.cv.toFixed(1)}%`
		);
		this.logger.info(
			`  TBT mean ${summary.tbt.mean.toFixed(0)}ms | p50 ${summary.tbt.p50.toFixed(0)}ms | p95 ${summary.tbt.p95.toFixed(0)}ms | CV ${summary.tbt.cv.toFixed(1)}%`
		);
		this.logger.info(
			`  FCP CI95 [${summary.fcp.ci95Low.toFixed(0)}, ${summary.fcp.ci95High.toFixed(0)}] ms`
		);

		const fcpStable = !this.hasMeaningfulVariability(
			results.map((r) => r.timing.firstContentfulPaint),
			STABILITY_THRESHOLD,
			FCP_LCP_MIN_STDDEV_MS,
			FCP_LCP_MIN_P95_P50_SPREAD_MS
		).unstable;
		const lcpStable = !this.hasMeaningfulVariability(
			results.map((r) => r.timing.largestContentfulPaint),
			STABILITY_THRESHOLD,
			FCP_LCP_MIN_STDDEV_MS,
			FCP_LCP_MIN_P95_P50_SPREAD_MS
		).unstable;
		const ttiStable = !this.hasMeaningfulVariability(
			results.map((r) => r.timing.timeToInteractive),
			STABILITY_THRESHOLD,
			TTI_MIN_STDDEV_MS,
			TTI_MIN_P95_P50_SPREAD_MS
		).unstable;

		if (fcpStable) {
			this.logger.info("  ✓ FCP is stable");
		}
		if (lcpStable) {
			this.logger.info("  ✓ LCP is stable");
		}
		if (ttiStable) {
			this.logger.info("  ✓ TTI is stable");
		}
	}
}
