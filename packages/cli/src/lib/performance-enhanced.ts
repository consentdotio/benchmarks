import type { Page } from "@playwright/test";
import {
  PerformanceMetricsCollector,
  DefaultNetworkPresets,
} from "playwright-performance-metrics";
import type { CookieBannerMetrics } from "./performance";

export interface EnhancedPerformanceOptions {
  networkCondition?: keyof typeof DefaultNetworkPresets | "none";
  timeout?: number;
  initialDelay?: number;
  retryTimeout?: number;
}

export class EnhancedPerformanceCollector {
  private collector: PerformanceMetricsCollector;

  constructor() {
    this.collector = new PerformanceMetricsCollector();
  }

  async initialize(
    page: Page,
    options: EnhancedPerformanceOptions = {}
  ): Promise<void> {
    console.log(
      "🔍 [ENHANCED-PERF] Initializing enhanced performance collector..."
    );

    // Set up network conditions if specified
    if (options.networkCondition && options.networkCondition !== "none") {
      const networkPreset = DefaultNetworkPresets[options.networkCondition];
      if (networkPreset) {
        console.log(
          `🔍 [ENHANCED-PERF] Applying network preset: ${options.networkCondition}`
        );
        await this.collector.initialize(page, networkPreset);
      } else {
        console.warn(
          `🔍 [ENHANCED-PERF] Unknown network preset: ${options.networkCondition}`
        );
      }
    }
  }

  async collectMetrics(
    page: Page,
    cookieBannerSelectors: string[] = [],
    options: EnhancedPerformanceOptions = {}
  ): Promise<CookieBannerMetrics> {
    console.log("🔍 [ENHANCED-PERF] Collecting performance metrics...");

    try {
      // Use the robust playwright-performance-metrics library
      const metrics = await this.collector.collectMetrics(page, {
        timeout: options.timeout || 10000,
        retryTimeout: options.retryTimeout || 5000,
        ...options,
      });

      console.log("🔍 [ENHANCED-PERF] Raw metrics collected:", {
        fcp: metrics.paint?.firstContentfulPaint,
        lcp: metrics.largestContentfulPaint,
        cls: metrics.cumulativeLayoutShift,
        tbt: metrics.totalBlockingTime,
        domComplete: metrics.domCompleteTiming,
        pageLoad: metrics.pageloadTiming,
        totalBytes: metrics.totalBytes,
      });

      // Detect cookie banners using our existing logic
      const bannerMetrics = await this.detectCookieBanner(
        page,
        cookieBannerSelectors
      );

      // Convert to our CookieBannerMetrics format
      const enhancedMetrics: CookieBannerMetrics = {
        // Core Web Vitals from the library
        fcp: metrics.paint?.firstContentfulPaint || 0,
        lcp: metrics.largestContentfulPaint || 0,
        cls: metrics.cumulativeLayoutShift || 0,
        tti: this.calculateTTI(metrics),
        tbt: metrics.totalBlockingTime || 0,

        // Cookie Banner Specific
        bannerDetected: bannerMetrics.detected,
        bannerSelector: bannerMetrics.selector,
        bannerFirstPaint: bannerMetrics.firstPaint,
        bannerLargestContentfulPaint: bannerMetrics.lcp,
        bannerTimeToInteractive: bannerMetrics.timeToInteractive,
        bannerHydrationTime: bannerMetrics.hydrationTime,
        bannerLayoutShift: bannerMetrics.layoutShift,
        bannerMainThreadBlocking: bannerMetrics.mainThreadBlocking,
        bannerNetworkImpact: bannerMetrics.networkImpact,
        bannerVisibilityTime: bannerMetrics.visibilityTime,
        bannerViewportCoverage: bannerMetrics.viewportCoverage,
      };

      console.log("🔍 [ENHANCED-PERF] Final enhanced metrics:", {
        fcp: enhancedMetrics.fcp,
        lcp: enhancedMetrics.lcp,
        cls: enhancedMetrics.cls,
        tti: enhancedMetrics.tti,
        tbt: enhancedMetrics.tbt,
        bannerDetected: enhancedMetrics.bannerDetected,
      });

      return enhancedMetrics;
    } catch (error) {
      console.error("🔍 [ENHANCED-PERF] Error collecting metrics:", error);
      // Fallback to basic metrics
      return this.getDefaultMetrics();
    }
  }

  private async detectCookieBanner(
    page: Page,
    selectors: string[]
  ): Promise<{
    detected: boolean;
    selector: string | null;
    firstPaint: number;
    lcp: number;
    timeToInteractive: number;
    hydrationTime: number;
    layoutShift: number;
    mainThreadBlocking: number;
    networkImpact: number;
    visibilityTime: number;
    viewportCoverage: number;
  }> {
    if (selectors.length === 0) {
      return {
        detected: false,
        selector: null,
        firstPaint: 0,
        lcp: 0,
        timeToInteractive: 0,
        hydrationTime: 0,
        layoutShift: 0,
        mainThreadBlocking: 0,
        networkImpact: 0,
        visibilityTime: 0,
        viewportCoverage: 0,
      };
    }

    return page.evaluate((selectors: string[]) => {
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            const rect = element.getBoundingClientRect();
            const isVisible =
              rect.width > 0 &&
              rect.height > 0 &&
              window.getComputedStyle(element).visibility !== "hidden" &&
              window.getComputedStyle(element).display !== "none";

            if (isVisible) {
              const viewportCoverage =
                ((rect.width * rect.height) /
                  (window.innerWidth * window.innerHeight)) *
                100;
              const now = performance.now();

              // Check if banner is interactive
              const buttons = element.querySelectorAll(
                'button, a, [role="button"], [onclick]'
              );
              const timeToInteractive = buttons.length > 0 ? now : 0;

              return {
                detected: true,
                selector: selector,
                firstPaint: now,
                lcp: now,
                timeToInteractive: timeToInteractive,
                hydrationTime:
                  timeToInteractive > 0 ? timeToInteractive - now : 0,
                layoutShift: 0, // Would need more complex measurement
                mainThreadBlocking: 0, // Would need more complex measurement
                networkImpact: 0, // Would need more complex measurement
                visibilityTime: 0, // Would need time tracking
                viewportCoverage: viewportCoverage,
              };
            }
          }
        } catch (error) {
          console.warn("🔍 [BANNER] Error checking selector:", selector, error);
        }
      }

      return {
        detected: false,
        selector: null,
        firstPaint: 0,
        lcp: 0,
        timeToInteractive: 0,
        hydrationTime: 0,
        layoutShift: 0,
        mainThreadBlocking: 0,
        networkImpact: 0,
        visibilityTime: 0,
        viewportCoverage: 0,
      };
    }, selectors);
  }

  private calculateTTI(metrics: {
    paint?: { firstContentfulPaint?: number };
    domCompleteTiming?: number | null;
  }): number {
    // TTI calculation based on the available metrics
    // This is a simplified approach - the library might provide better TTI measurement in the future
    const baseTime = Math.max(
      metrics.paint?.firstContentfulPaint || 0,
      metrics.domCompleteTiming || 0
    );

    // Add some buffer time for interactivity (simplified approach)
    return baseTime + 2000; // Add 2 seconds as a buffer
  }

  private getDefaultMetrics(): CookieBannerMetrics {
    return {
      fcp: 0,
      lcp: 0,
      cls: 0,
      tti: 0,
      tbt: 0,
      bannerDetected: false,
      bannerSelector: null,
      bannerFirstPaint: 0,
      bannerLargestContentfulPaint: 0,
      bannerTimeToInteractive: 0,
      bannerHydrationTime: 0,
      bannerLayoutShift: 0,
      bannerMainThreadBlocking: 0,
      bannerNetworkImpact: 0,
      bannerVisibilityTime: 0,
      bannerViewportCoverage: 0,
    };
  }

  async cleanup(): Promise<void> {
    await this.collector.cleanup();
  }
}

// Network presets for easy access
export const NetworkPresets = {
  REGULAR_4G: "REGULAR_4G" as const,
  SLOW_3G: "SLOW_3G" as const,
  FAST_3G: "FAST_3G" as const,
  FAST_WIFI: "FAST_WIFI" as const,
  NONE: "none" as const,
};
