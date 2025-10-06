import type {
  BenchmarkDetails,
  CookieBannerData,
  CookieBannerMetrics,
  ResourceTimingData,
  NetworkRequest,
  Config,
  PerfumeMetrics,
} from "./types";
import { BENCHMARK_CONSTANTS } from "./constants";

interface CoreWebVitals {
  paint?: {
    firstPaint?: number;
    firstContentfulPaint?: number;
  };
  largestContentfulPaint?: number;
  cumulativeLayoutShift?: number;
  totalBlockingTime?: number;
  domCompleteTiming?: number;
}

export class MetricsCalculator {
  calculateTTI(
    coreWebVitals: CoreWebVitals,
    cookieBannerData: CookieBannerData | null
  ): number {
    return (
      Math.max(
        coreWebVitals.paint?.firstContentfulPaint || 0,
        coreWebVitals.domCompleteTiming || 0,
        cookieBannerData?.bannerInteractiveTime || 0
      ) + BENCHMARK_CONSTANTS.TTI_BUFFER
    );
  }

  calculateTTIFromPerfume(
    perfumeMetrics: PerfumeMetrics,
    cookieBannerData: CookieBannerData | null
  ): number {
    return (
      Math.max(
        perfumeMetrics.firstContentfulPaint || 0,
        perfumeMetrics.largestContentfulPaint || 0,
        cookieBannerData?.bannerInteractiveTime || 0
      ) + BENCHMARK_CONSTANTS.TTI_BUFFER
    );
  }

  mergeBenchmarkMetricsFromPerfume(
    resourceMetrics: ResourceTimingData,
    perfumeMetrics: PerfumeMetrics,
    cookieBannerData: CookieBannerData | null,
    cookieBannerMetrics: CookieBannerMetrics,
    networkRequests: NetworkRequest[],
    config: Config,
    tti: number
  ): BenchmarkDetails {
    return {
      duration: resourceMetrics.duration,
      size: resourceMetrics.size,
      timing: {
        navigationStart: resourceMetrics.timing.navigationStart,
        domContentLoaded: resourceMetrics.timing.domContentLoaded,
        load: resourceMetrics.timing.load,
        firstPaint: perfumeMetrics.firstPaint || 0,
        firstContentfulPaint: perfumeMetrics.firstContentfulPaint || 0,
        largestContentfulPaint: perfumeMetrics.largestContentfulPaint || 0,
        timeToInteractive: tti,
        cumulativeLayoutShift: perfumeMetrics.cumulativeLayoutShift || 0,
        firstInputDelay: perfumeMetrics.firstInputDelay || 0,
        timeToFirstByte: perfumeMetrics.timeToFirstByte || 0,
        regulatoryFrictionDelay: perfumeMetrics.regulatoryFrictionDelay || 0,
        cookieBanner: {
          renderStart: cookieBannerData?.bannerRenderTime || 0,
          renderEnd: cookieBannerData?.bannerInteractiveTime || 0,
          interactionStart: cookieBannerData?.bannerInteractiveTime || 0,
          interactionEnd: cookieBannerData?.bannerInteractiveTime || 0,
          layoutShift: cookieBannerData?.layoutShiftImpact || 0,
          detected: cookieBannerData?.detected || false,
          selector: cookieBannerData?.selector || null,
          serviceName: config.cookieBanner?.serviceName || "unknown",
          visibilityTime: cookieBannerData?.bannerRenderTime ?? null,
          viewportCoverage: cookieBannerData?.viewportCoverage || 0,
        },
        thirdParty: {
          dnsLookupTime: 0,
          connectionTime: 0,
          downloadTime: networkRequests.reduce(
            (acc, req) => acc + req.duration,
            0
          ),
          totalImpact: networkRequests.reduce((acc, req) => acc + req.size, 0),
          cookieServices: {
            hosts: config.cookieBanner?.serviceHosts || [],
            totalSize: cookieBannerMetrics.bannerBundleSize,
            resourceCount: cookieBannerMetrics.bannerNetworkRequests,
            dnsLookupTime: 0,
            connectionTime: 0,
            downloadTime: networkRequests.reduce(
              (acc, req) => acc + req.duration,
              0
            ),
          },
        },
        mainThreadBlocking: {
          total: perfumeMetrics.totalBlockingTime || 0,
          cookieBannerEstimate:
            cookieBannerMetrics.bannerMainThreadBlockingTime,
          percentageFromCookies:
            (perfumeMetrics.totalBlockingTime || 0) > 0
              ? (cookieBannerMetrics.bannerMainThreadBlockingTime /
                  (perfumeMetrics.totalBlockingTime || 1)) *
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
        serviceName: config.cookieBanner?.serviceName || "unknown",
        visibilityTime: cookieBannerData?.bannerRenderTime ?? null,
        viewportCoverage: cookieBannerData?.viewportCoverage || 0,
      },
      thirdParty: {
        cookieServices: {
          hosts: config.cookieBanner?.serviceHosts || [],
          totalSize: cookieBannerMetrics.bannerBundleSize,
          resourceCount: cookieBannerMetrics.bannerNetworkRequests,
          dnsLookupTime: 0,
          connectionTime: 0,
          downloadTime: networkRequests.reduce(
            (acc, req) => acc + req.duration,
            0
          ),
        },
        totalImpact: networkRequests.reduce((acc, req) => acc + req.size, 0),
      },
    };
  }

  mergeBenchmarkMetrics(
    resourceMetrics: ResourceTimingData,
    coreWebVitals: CoreWebVitals,
    cookieBannerData: CookieBannerData | null,
    cookieBannerMetrics: CookieBannerMetrics,
    networkRequests: NetworkRequest[],
    config: Config,
    tti: number
  ): BenchmarkDetails {
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
        cookieBanner: {
          renderStart: cookieBannerData?.bannerRenderTime || 0,
          renderEnd: cookieBannerData?.bannerInteractiveTime || 0,
          interactionStart: cookieBannerData?.bannerInteractiveTime || 0,
          interactionEnd: cookieBannerData?.bannerInteractiveTime || 0,
          layoutShift: cookieBannerData?.layoutShiftImpact || 0,
          detected: cookieBannerData?.detected || false,
          selector: cookieBannerData?.selector || null,
          serviceName: config.cookieBanner?.serviceName || "unknown",
          visibilityTime: cookieBannerData?.bannerRenderTime ?? null,
          viewportCoverage: cookieBannerData?.viewportCoverage || 0,
        },
        thirdParty: {
          dnsLookupTime: 0,
          connectionTime: 0,
          downloadTime: networkRequests.reduce(
            (acc, req) => acc + req.duration,
            0
          ),
          totalImpact: networkRequests.reduce((acc, req) => acc + req.size, 0),
          cookieServices: {
            hosts: config.cookieBanner?.serviceHosts || [],
            totalSize: cookieBannerMetrics.bannerBundleSize,
            resourceCount: cookieBannerMetrics.bannerNetworkRequests,
            dnsLookupTime: 0,
            connectionTime: 0,
            downloadTime: networkRequests.reduce(
              (acc, req) => acc + req.duration,
              0
            ),
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
        serviceName: config.cookieBanner?.serviceName || "unknown",
        visibilityTime: cookieBannerData?.bannerRenderTime ?? null,
        viewportCoverage: cookieBannerData?.viewportCoverage || 0,
      },
      thirdParty: {
        cookieServices: {
          hosts: config.cookieBanner?.serviceHosts || [],
          totalSize: cookieBannerMetrics.bannerBundleSize,
          resourceCount: cookieBannerMetrics.bannerNetworkRequests,
          dnsLookupTime: 0,
          connectionTime: 0,
          downloadTime: networkRequests.reduce(
            (acc, req) => acc + req.duration,
            0
          ),
        },
        totalImpact: networkRequests.reduce((acc, req) => acc + req.size, 0),
      },
    };
  }

  logFinalResults(
    finalMetrics: BenchmarkDetails,
    cookieBannerMetrics: CookieBannerMetrics,
    bundleType: string | string[] | undefined
  ): void {
    console.log("🔍 [DEBUG] Final cookie banner benchmark results:", {
      fp: finalMetrics.timing.firstPaint,
      fcp: finalMetrics.timing.firstContentfulPaint,
      lcp: finalMetrics.timing.largestContentfulPaint,
      fid: finalMetrics.timing.firstInputDelay || 0,
      ttfb: finalMetrics.timing.timeToFirstByte || 0,
      rfd: finalMetrics.timing.regulatoryFrictionDelay || 0,
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
        ? "Bundled"
        : cookieBannerMetrics.isIIFE
        ? "IIFE"
        : "Unknown",
      isBundled: cookieBannerMetrics.isBundled,
      isIIFE: cookieBannerMetrics.isIIFE,
      configBundleType: bundleType,
    });
  }
}
