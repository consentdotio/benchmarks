import type {
	Config,
	CoreWebVitals,
	CookieBannerData,
	CookieBannerMetrics,
	NetworkRequest,
	NetworkMetrics,
	ResourceTimingData,
	PerfumeMetrics,
} from '@consentio/benchmark';
import type { Logger } from '@c15t/logger';
import type { BenchmarkDetails, BenchmarkResult } from './types';

export class PerformanceAggregator {
	private logger: Logger;

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
			) + 1000
		); // Add buffer for true interactivity
	}

	/**
	 * Merge all collected metrics into final benchmark details
	 */
	aggregateMetrics(
		coreWebVitals: CoreWebVitals,
		cookieBannerData: CookieBannerData | null,
		cookieBannerMetrics: CookieBannerMetrics,
		networkRequests: NetworkRequest[],
		networkMetrics: NetworkMetrics,
		resourceMetrics: ResourceTimingData,
		config: Config,
		perfumeMetrics: PerfumeMetrics | null
	): BenchmarkDetails {
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
				// Enhanced metrics from Perfume.js
				timeToFirstByte: perfumeMetrics?.timeToFirstByte || 0,
				firstInputDelay: perfumeMetrics?.firstInputDelay || null,
				interactionToNextPaint: perfumeMetrics?.interactionToNextPaint || null,
				// Detailed navigation timing from Perfume.js
				navigationTiming: perfumeMetrics?.navigationTiming || {
					timeToFirstByte: 0,
					domInteractive: 0,
					domContentLoadedEventStart: 0,
					domContentLoadedEventEnd: 0,
					domComplete: 0,
					loadEventStart: 0,
					loadEventEnd: 0,
				},
				// Network information from Perfume.js
				networkInformation: perfumeMetrics?.networkInformation || undefined,
				cookieBanner: {
					renderStart: cookieBannerData?.bannerRenderTime || 0,
					renderEnd: cookieBannerData?.bannerInteractiveTime || 0,
					interactionStart: cookieBannerData?.bannerInteractiveTime || 0,
					interactionEnd: cookieBannerData?.bannerInteractiveTime || 0,
					layoutShift: cookieBannerData?.layoutShiftImpact || 0,
					detected: cookieBannerData?.detected || false,
					selector: cookieBannerData?.selector || null,
					serviceName: config.cookieBanner?.serviceName || 'unknown',
					visibilityTime: cookieBannerData?.bannerInteractiveTime || 0,
					viewportCoverage: cookieBannerData?.viewportCoverage || 0,
				},
				thirdParty: {
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
				},
				mainThreadBlocking: {
					total: coreWebVitals.totalBlockingTime || 0,
					cookieBannerEstimate:
						cookieBannerMetrics.bannerMainThreadBlockingTime,
					percentageFromCookies:
						(coreWebVitals.totalBlockingTime || 0) > 0
							? (cookieBannerMetrics.bannerMainThreadBlockingTime /
									(coreWebVitals.totalBlockingTime || 1)) *
								100
							: 0,
				},
				scripts: resourceMetrics.timing.scripts,
			},
			resources: resourceMetrics.resources,
			language: resourceMetrics.language,
			cookieBanner: {
				detected: cookieBannerData?.detected || false,
				selector: cookieBannerData?.selector || null,
				serviceName: config.cookieBanner?.serviceName || 'unknown',
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
	 * Calculate average metrics from multiple benchmark results
	 */
	calculateAverages(results: BenchmarkDetails[]): BenchmarkResult['average'] {
		if (results.length === 0) {
			throw new Error('Cannot calculate averages from empty results array');
		}

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
			speedIndex: 0, // Default value
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
			domSize: 0, // Default value
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
				results.reduce((acc, curr) => acc + curr.size.styles, 0) / results.length,
			imageSize:
				results.reduce((acc, curr) => acc + curr.size.images, 0) / results.length,
			fontSize:
				results.reduce((acc, curr) => acc + curr.size.fonts, 0) / results.length,
			otherSize:
				results.reduce((acc, curr) => acc + curr.size.other, 0) / results.length,
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
		this.logger.debug('Final cookie banner benchmark results:', {
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
			bundleStrategy: cookieBannerMetrics.isBundled
				? 'Bundled'
				: cookieBannerMetrics.isIIFE
					? 'IIFE'
					: 'Unknown',
			isBundled: cookieBannerMetrics.isBundled,
			isIIFE: cookieBannerMetrics.isIIFE,
			configBundleType: config.techStack?.bundleType,
		});
	}
}

