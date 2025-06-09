import type { Page } from "@playwright/test";
import type { Config } from "../../types";
import type {
  WindowWithCookieMetrics,
  CookieBannerData,
  LayoutShiftEntry,
} from "./types";
import { BENCHMARK_CONSTANTS } from "./constants";

export class CookieBannerDetector {
  async setupDetection(page: Page, config: Config): Promise<void> {
    await page.addInitScript(
      (params: {
        selectors: string[];
        constants: typeof BENCHMARK_CONSTANTS;
      }) => {
        const { selectors, constants } = params;
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
                ).__cookieBannerMetrics.layoutShiftsAfter =
                  cumulativeLayoutShift;
              }
            }
          });
          clsObserver.observe({ type: "layout-shift", buffered: true });
        }

        // Cookie banner detection logic
        const detectCookieBanner = (): boolean => {
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
        const startDetection = (): void => {
          setTimeout(() => {
            if (!detectCookieBanner()) {
              // Keep checking for dynamically loaded banners
              const interval = setInterval(() => {
                if (detectCookieBanner()) {
                  clearInterval(interval);
                }
              }, constants.DETECTION_INTERVAL);

              // Stop checking after max detection time
              setTimeout(
                () => clearInterval(interval),
                constants.MAX_DETECTION_TIME
              );
            }
          }, constants.INITIAL_DETECTION_DELAY);
        };

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", startDetection);
        } else {
          startDetection();
        }
      },
      {
        selectors: config.cookieBanner?.selectors || [],
        constants: BENCHMARK_CONSTANTS,
      }
    );
  }

  async collectBannerData(page: Page): Promise<CookieBannerData | null> {
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
