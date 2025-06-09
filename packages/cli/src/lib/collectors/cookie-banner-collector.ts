import type { Page } from "@playwright/test";
import type { Config, LayoutShiftEntry } from "../../types";

interface WindowWithCookieMetrics extends Window {
  __cookieBannerMetrics: {
    pageLoadStart: number;
    bannerDetectionStart: number;
    bannerFirstSeen: number;
    bannerInteractive: number;
    layoutShiftsBefore: number;
    layoutShiftsAfter: number;
    detected: boolean;
    selector: string | null;
  };
}

export interface CookieBannerMetrics {
  detectionStartTime: number;
  bannerRenderTime: number;
  bannerInteractiveTime: number;
  bannerScriptLoadTime: number;
  bannerLayoutShiftImpact: number;
  bannerNetworkRequests: number;
  bannerBundleSize: number;
  bannerMainThreadBlockingTime: number;
  isBundled: boolean;
  isIIFE: boolean;
  bannerDetected: boolean;
  bannerSelector: string | null;
}

export interface CookieBannerData {
  detected: boolean;
  selector: string | null;
  bannerRenderTime: number;
  bannerInteractiveTime: number;
  bannerHydrationTime: number;
  layoutShiftImpact: number;
  viewportCoverage: number;
}

export class CookieBannerCollector {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Determines bundle strategy from config
   */
  getBundleStrategy(): { isBundled: boolean; isIIFE: boolean } {
    const bundleType = this.config.techStack?.bundleType;
    const isIIFE =
      bundleType === "iffe" ||
      (Array.isArray(bundleType) && bundleType.includes("iffe"));
    const isBundled =
      !isIIFE &&
      (bundleType === "bundled" ||
        (Array.isArray(bundleType) &&
          (bundleType.includes("esm") || bundleType.includes("cjs"))) ||
        bundleType === "esm" ||
        bundleType === "cjs");

    console.log(
      `🔍 [BUNDLE-STRATEGY] Detected from config: ${
        isBundled ? "Bundled" : isIIFE ? "IIFE" : "Unknown"
      }`,
      {
        bundleType,
        isBundled,
        isIIFE,
      }
    );

    return { isBundled, isIIFE };
  }

  /**
   * Initialize cookie banner metrics tracking
   */
  initializeMetrics(): CookieBannerMetrics {
    const { isBundled, isIIFE } = this.getBundleStrategy();

    return {
      detectionStartTime: 0,
      bannerRenderTime: 0,
      bannerInteractiveTime: 0,
      bannerScriptLoadTime: 0,
      bannerLayoutShiftImpact: 0,
      bannerNetworkRequests: 0,
      bannerBundleSize: 0,
      bannerMainThreadBlockingTime: 0,
      isBundled,
      isIIFE,
      bannerDetected: false,
      bannerSelector: null,
    };
  }

  /**
   * Set up cookie banner detection script in the browser
   */
  async setupDetection(page: Page): Promise<void> {
    const selectors = this.config.cookieBanner?.selectors || [];

    await page.addInitScript((selectors: string[]) => {
      console.log("🔍 [BROWSER] Setting up cookie banner detection...");

      // Store initial performance baseline
      (window as unknown as WindowWithCookieMetrics).__cookieBannerMetrics = {
        pageLoadStart: performance.now(),
        bannerDetectionStart: 0,
        bannerFirstSeen: 0,
        bannerInteractive: 0,
        layoutShiftsBefore: 0,
        layoutShiftsAfter: 0,
        detected: false,
        selector: null,
      };

      // Monitor for layout shifts specifically
      let cumulativeLayoutShift = 0;
      if ("PerformanceObserver" in window) {
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as LayoutShiftEntry;
            if (!layoutShiftEntry.hadRecentInput) {
              cumulativeLayoutShift += layoutShiftEntry.value;
              (
                window as unknown as WindowWithCookieMetrics
              ).__cookieBannerMetrics.layoutShiftsAfter = cumulativeLayoutShift;
            }
          }
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });
      }

      // Cookie banner detection logic
      const detectCookieBanner = () => {
        (
          window as unknown as WindowWithCookieMetrics
        ).__cookieBannerMetrics.bannerDetectionStart = performance.now();

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
                const metrics = (window as unknown as WindowWithCookieMetrics)
                  .__cookieBannerMetrics;
                metrics.detected = true;
                metrics.selector = selector;
                metrics.bannerFirstSeen = performance.now();
                metrics.layoutShiftsBefore = cumulativeLayoutShift;

                console.log("🔍 [BANNER] Cookie banner detected:", selector);
                console.log(
                  "🔍 [BANNER] Banner render time:",
                  metrics.bannerFirstSeen - metrics.pageLoadStart,
                  "ms"
                );

                // Check if banner is interactive
                const buttons = element.querySelectorAll(
                  'button, a, [role="button"], [onclick]'
                );
                if (buttons.length > 0) {
                  // Test if buttons are actually clickable
                  const firstButton = buttons[0] as HTMLElement;
                  if (firstButton.offsetParent !== null) {
                    // Element is visible and clickable
                    metrics.bannerInteractive = performance.now();
                    console.log(
                      "🔍 [BANNER] Banner interactive time:",
                      metrics.bannerInteractive - metrics.pageLoadStart,
                      "ms"
                    );
                  }
                }

                return true;
              }
            }
          } catch (error) {
            console.warn(
              "🔍 [BANNER] Error checking selector:",
              selector,
              error
            );
          }
        }
        return false;
      };

      // Start detection after DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          setTimeout(() => {
            if (!detectCookieBanner()) {
              // Keep checking for dynamically loaded banners
              const interval = setInterval(() => {
                if (detectCookieBanner()) {
                  clearInterval(interval);
                }
              }, 100);

              // Stop checking after 10 seconds
              setTimeout(() => clearInterval(interval), 10000);
            }
          }, 100); // Small delay to allow for initial render
        });
      } else {
        setTimeout(() => {
          if (!detectCookieBanner()) {
            const interval = setInterval(() => {
              if (detectCookieBanner()) {
                clearInterval(interval);
              }
            }, 100);

            setTimeout(() => clearInterval(interval), 10000);
          }
        }, 100);
      }
    }, selectors);
  }

  /**
   * Collect cookie banner specific metrics from the browser
   */
  async collectMetrics(page: Page): Promise<CookieBannerData | null> {
    return page.evaluate(() => {
      const metrics = (window as unknown as WindowWithCookieMetrics)
        .__cookieBannerMetrics;
      if (!metrics) {
        return null;
      }

      return {
        detected: metrics.detected,
        selector: metrics.selector,
        bannerRenderTime: metrics.bannerFirstSeen - metrics.pageLoadStart,
        bannerInteractiveTime:
          metrics.bannerInteractive - metrics.pageLoadStart,
        bannerHydrationTime:
          metrics.bannerInteractive > 0
            ? metrics.bannerInteractive - metrics.bannerFirstSeen
            : 0,
        layoutShiftImpact:
          metrics.layoutShiftsAfter - metrics.layoutShiftsBefore,
        viewportCoverage: metrics.detected
          ? (() => {
              if (!metrics.selector) {
                return 0;
              }
              const element = document.querySelector(metrics.selector);
              if (element) {
                const rect = element.getBoundingClientRect();
                return (
                  ((rect.width * rect.height) /
                    (window.innerWidth * window.innerHeight)) *
                  100
                );
              }
              return 0;
            })()
          : 0,
      };
    });
  }
}
