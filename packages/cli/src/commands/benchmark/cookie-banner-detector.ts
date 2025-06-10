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

          console.log("🔍 [BANNER] Starting detection check...");
          
          for (const selector of selectors) {
            try {
              const element = document.querySelector(selector);
              console.log(`🔍 [BANNER] Checking selector "${selector}":`, element ? "found" : "not found");
              
              if (element) {
                // First check if element is immediately visible
                let isVisible = false;
                let recheckAttempts = 0;
                const maxRecheckAttempts = 10; // 10 attempts * 100ms = 1 second max
                
                // Function to check visibility
                const checkElementVisibility = () => {
                  const rect = element.getBoundingClientRect();
                  const computedStyle = window.getComputedStyle(element);
                  const hasContent = rect.width > 100 && rect.height > 0;
                  const hasContainer = rect.width > 200 && computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
                  return hasContent || hasContainer;
                };
                // Check visibility immediately
                isVisible = checkElementVisibility();
                
                // If element exists but not visible, wait and recheck up to 1 second
                while (!isVisible && recheckAttempts < maxRecheckAttempts) {
                  const rect = element.getBoundingClientRect();
                  console.log(`🔍 [BANNER] Element "${selector}" found but not visible yet (${rect.width}x${rect.height}), waiting 100ms (attempt ${recheckAttempts + 1}/${maxRecheckAttempts})`);
                  
                  // Wait 100ms synchronously (not ideal but necessary for this detection pattern)
                  const start = performance.now();
                  while (performance.now() - start < 100) {
                    // Busy wait for 100ms
                  }
                  
                  recheckAttempts++;
                  isVisible = checkElementVisibility();
                }

                const rect = element.getBoundingClientRect();
                console.log(`🔍 [BANNER] Final visibility check for "${selector}":`, {
                  width: rect.width,
                  height: rect.height,
                  isVisible,
                  recheckAttempts
                });

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

          console.log("🔍 [BANNER] No visible banner found in this check");
          return false;
        };

        // Enhanced detection for async-loaded banners
        const startDetection = (): void => {
          let detectionInterval: ReturnType<typeof setInterval>;
          let isDetected = false;
          let attemptCount = 0;

          const runDetection = () => {
            attemptCount++;
            console.log(`🔍 [DETECTION] Attempt ${attemptCount} - Looking for cookie banner...`);
            
            if (!isDetected && detectCookieBanner()) {
              isDetected = true;
              console.log(`🔍 [DETECTION] Banner found on attempt ${attemptCount}!`);
              if (detectionInterval) clearInterval(detectionInterval);
              if (mutationObserver) mutationObserver.disconnect();
            } else if (!isDetected) {
              console.log(`🔍 [DETECTION] Attempt ${attemptCount} - No banner found, will retry in ${constants.DETECTION_INTERVAL}ms`);
            }
          };

          // Initial detection attempt
          setTimeout(() => {
            runDetection();
            
            if (!isDetected) {
              // Keep checking for dynamically loaded banners
              detectionInterval = setInterval(runDetection, constants.DETECTION_INTERVAL);

              // Stop checking after max detection time
              setTimeout(() => {
                if (!isDetected) {
                  console.log(`🔍 [DETECTION] Giving up after ${constants.MAX_DETECTION_TIME}ms and ${attemptCount} attempts`);
                }
                if (detectionInterval) clearInterval(detectionInterval);
                if (mutationObserver) mutationObserver.disconnect();
              }, constants.MAX_DETECTION_TIME);
            }
          }, constants.INITIAL_DETECTION_DELAY);

                    // Enhanced: Watch for DOM changes for async-loaded content
          let mutationObserver: MutationObserver | null = null;
          if ('MutationObserver' in window) {
            mutationObserver = new MutationObserver((mutations) => {
              if (isDetected) return;
              
              console.log("🔍 [MUTATION] DOM mutations detected:", mutations.length);
              
              for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                  console.log("🔍 [MUTATION] Nodes added:", mutation.addedNodes.length);
                  
                  // Check if any added nodes might be our banner
                  for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      const element = node as Element;
                      console.log("🔍 [MUTATION] Added element:", element.tagName, element.className, element.id);
                      
                      // Check if this element or its children match our selectors
                      for (const selector of selectors) {
                        if (element.matches?.(selector)) {
                          console.log("🔍 [MUTATION] Found matching element for selector:", selector);
                          setTimeout(runDetection, 50); // Small delay to ensure rendering
                          return;
                        }
                        if (element.querySelector?.(selector)) {
                          console.log("🔍 [MUTATION] Found child matching selector:", selector);
                          setTimeout(runDetection, 50);
                          return;
                        }
                      }
                    }
                  }
                }
              }
            });

            mutationObserver.observe(document.body, {
              childList: true,
              subtree: true,
              attributes: false
            });
          }

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
