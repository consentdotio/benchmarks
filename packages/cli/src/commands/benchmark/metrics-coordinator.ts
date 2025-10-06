import type { Page } from "@playwright/test";
import type { Config } from "../../types";
import type {
	BenchmarkDetails,
	CookieBannerData,
	ResourceTimingData,
	NetworkRequest,
	PerfumeMetrics,
	CookieBannerMetrics,
} from "./types";
import { BENCHMARK_CONSTANTS } from "./constants";
import { PerfumeMetricsCollector } from "./perfume-metrics-collector";
import { CookieBannerDetector } from "./cookie-banner-detector";
import { ResourceCollector } from "./resource-collector";
import { NetworkMonitor } from "./network-monitor";
import { MetricsCalculator } from "./metrics-calculator";

interface UnifiedMetrics {
	coreWebVitals: PerfumeMetrics;
	cookieBanner: CookieBannerData;
	resources: ResourceTimingData;
	regulatoryFrictionDelay: number;
	networkRequests: NetworkRequest[];
	cookieBannerMetrics: CookieBannerMetrics;
}

export class MetricsCoordinator {
	private perfumeCollector: PerfumeMetricsCollector;
	private bannerDetector: CookieBannerDetector;
	private resourceCollector: ResourceCollector;
	private networkMonitor: NetworkMonitor;
	private metricsCalculator: MetricsCalculator;

	constructor() {
		this.perfumeCollector = new PerfumeMetricsCollector();
		this.bannerDetector = new CookieBannerDetector();
		this.resourceCollector = new ResourceCollector();
		this.networkMonitor = new NetworkMonitor();
		this.metricsCalculator = new MetricsCalculator();
	}

	async collectAllMetrics(page: Page, config: Config): Promise<UnifiedMetrics> {
		console.log("🔍 [COORDINATOR] Starting unified metrics collection...");

		// Step 1: Network monitoring will be handled by individual collectors

		// Step 2: Setup banner detection
		await this.bannerDetector.setupDetection(page, config);

		// Step 3: Collect banner data FIRST (needed for RFD calculation)
		console.log("🔍 [COORDINATOR] Collecting cookie banner data...");
		const cookieBannerData = await this.bannerDetector.collectBannerData(page) || {
			detected: false,
			selector: null,
			bannerRenderTime: null,
			bannerInteractiveTime: null,
			bannerHydrationTime: 0,
			layoutShiftImpact: 0,
			viewportCoverage: 0,
		};
		console.log("🔍 [COORDINATOR] Cookie banner data:", cookieBannerData);

		// Step 4: Collect resource timing data
		console.log("🔍 [COORDINATOR] Collecting resource timing data...");
		const resourceMetrics = await this.resourceCollector.collectResourceTiming(page);

		// Step 5: Collect Core Web Vitals with Perfume.js FIRST (needed for TTFB)
		console.log("🔍 [COORDINATOR] Collecting Core Web Vitals...");
		const coreWebVitals = await this.perfumeCollector.collectMetrics(
			page,
			BENCHMARK_CONSTANTS.METRICS_TIMEOUT,
			config
		);

		// Step 6: Calculate RFD using actual timing data (TTFB from Perfume + Banner timing)
		console.log("🔍 [COORDINATOR] Calculating Regulatory Friction Delay...");
		const regulatoryFrictionDelay = this.calculateRFD(cookieBannerData, coreWebVitals);
		console.log("🔍 [COORDINATOR] RFD calculated:", regulatoryFrictionDelay);

		// Step 7: Get network requests
		const networkRequests = this.networkMonitor.getNetworkRequests();

		// Step 8: Calculate cookie banner metrics
		const cookieBannerMetrics = this.calculateCookieBannerMetrics(
			cookieBannerData,
			networkRequests,
			config
		);

		// Step 9: Update Core Web Vitals with RFD
		const updatedCoreWebVitals = {
			...coreWebVitals,
			regulatoryFrictionDelay,
		};

		console.log("🔍 [COORDINATOR] Unified metrics collection complete");

		return {
			coreWebVitals: updatedCoreWebVitals,
			cookieBanner: cookieBannerData,
			resources: resourceMetrics,
			regulatoryFrictionDelay,
			networkRequests,
			cookieBannerMetrics,
		};
	}

	/**
	 * Calculate Regulatory Friction Delay using actual timing data
	 * RFD = Banner Render Time - Time to First Byte
	 */
	private calculateRFD(
		bannerData: CookieBannerData,
		perfumeMetrics: PerfumeMetrics
	): number {
		// Only calculate RFD if banner was detected
		if (!bannerData.detected) {
			console.log("🔍 [COORDINATOR] No banner detected, RFD = 0");
			return 0;
		}

		// Get TTFB from Perfume metrics
		const ttfb = perfumeMetrics.timeToFirstByte || 0;
		const bannerRenderTime = bannerData.bannerRenderTime || 0;

		if (ttfb === 0 || bannerRenderTime === 0) {
			console.log("🔍 [COORDINATOR] Missing timing data, RFD = 0", {
				ttfb,
				bannerRenderTime,
			});
			return 0;
		}

		// Calculate RFD: Banner render time - TTFB
		const rfd = bannerRenderTime - ttfb;

		console.log("🔍 [COORDINATOR] RFD calculation:", {
			bannerRenderTime,
			ttfb,
			rfd,
		});

		return rfd;
	}

	/**
	 * Calculate cookie banner specific metrics
	 */
	private calculateCookieBannerMetrics(
		bannerData: CookieBannerData,
		networkRequests: NetworkRequest[],
		config: Config
	): CookieBannerMetrics {
		// Filter network requests for cookie banner related resources
		const bannerRequests = networkRequests.filter((req) =>
			config.cookieBanner?.serviceHosts?.some((host) =>
				req.url.includes(host)
			)
		);

		const bannerBundleSize = bannerRequests.reduce(
			(acc, req) => acc + req.size,
			0
		);

		const bannerMainThreadBlockingTime = bannerRequests.reduce(
			(acc, req) => acc + req.duration,
			0
		);

		return {
			detectionStartTime: 0, // Will be calculated by banner detector
			bannerRenderTime: bannerData.bannerRenderTime || 0,
			bannerInteractiveTime: bannerData.bannerInteractiveTime || 0,
			bannerScriptLoadTime: bannerMainThreadBlockingTime,
			bannerLayoutShiftImpact: bannerData.layoutShiftImpact || 0,
			bannerNetworkRequests: bannerRequests.length,
			bannerBundleSize,
			bannerMainThreadBlockingTime,
			isBundled: false, // Will be determined by bundle strategy
			isIIFE: false, // Will be determined by bundle strategy
			bannerDetected: bannerData.detected,
			bannerSelector: bannerData.selector,
		};
	}

	/**
	 * Merge all metrics into final benchmark details
	 */
	mergeMetrics(
		unifiedMetrics: UnifiedMetrics,
		config: Config
	): BenchmarkDetails {
		// Calculate TTI using the unified metrics
		const tti = this.metricsCalculator.calculateTTIFromPerfume(
			unifiedMetrics.coreWebVitals,
			unifiedMetrics.cookieBanner
		);

		// Use the existing merge method from MetricsCalculator
		return this.metricsCalculator.mergeBenchmarkMetricsFromPerfume(
			unifiedMetrics.resources,
			unifiedMetrics.coreWebVitals,
			unifiedMetrics.cookieBanner,
			unifiedMetrics.cookieBannerMetrics,
			unifiedMetrics.networkRequests,
			config,
			tti,
			unifiedMetrics.regulatoryFrictionDelay
		);
	}

	/**
	 * Cleanup all collectors
	 */
	async cleanup(): Promise<void> {
		await this.perfumeCollector.cleanup();
		// Add cleanup for other collectors if needed
	}
}
