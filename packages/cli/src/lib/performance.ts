import type { Page } from "@playwright/test";
import type { LayoutShiftEntry } from "../types";

interface WebVitalsMetrics {
  fcp: number;
  lcp: number;
  cls: number;
  tti: number;
  tbt: number;
  bannerDetected: boolean;
  bannerSelector: string | null;
  bannerVisibilityTime: number;
  bannerViewportCoverage: number;
  bannerFirstPaint: number;
  bannerLargestContentfulPaint: number;
  bannerTimeToInteractive: number;
  bannerHydrationTime: number;
  bannerLayoutShift: number;
  bannerMainThreadBlocking: number;
  bannerNetworkImpact: number;
  measurementComplete: boolean;
}

interface WindowWithWebVitals extends Window {
  __webVitalsMetrics: WebVitalsMetrics;
}

export interface CookieBannerMetrics {
  // Core Web Vitals
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  cls: number; // Cumulative Layout Shift
  tti: number; // Time to Interactive
  tbt: number; // Total Blocking Time

  // Cookie Banner Specific Timings
  bannerFirstPaint: number; // When banner first appears
  bannerLargestContentfulPaint: number; // When banner's main content renders
  bannerTimeToInteractive: number; // When banner buttons become clickable
  bannerHydrationTime: number; // Time from first paint to interactive (hydration)

  // Cookie Banner Impact Measurements
  bannerLayoutShift: number; // Layout shifts caused by banner
  bannerMainThreadBlocking: number; // Main thread blocking from banner scripts
  bannerNetworkImpact: number; // Network requests caused by banner

  // Cookie Banner Detection
  bannerDetected: boolean;
  bannerSelector: string | null;
  bannerVisibilityTime: number; // How long banner was visible
  bannerViewportCoverage: number; // Percentage of viewport covered
}

export async function collectCookieBannerMetrics(
  page: Page,
  cookieBannerSelectors: string[],
  serviceHosts: string[]
): Promise<CookieBannerMetrics> {
  console.log(
    "🔍 [PERFORMANCE] Setting up Web Vitals measurement before navigation..."
  );

  // Set up performance measurement BEFORE navigation
  await page.addInitScript((selectors: string[]) => {
    console.log(
      "🔍 [BROWSER] Setting up performance observers before page load..."
    );

    // Initialize global storage for metrics
    const webVitalsMetrics = {
      fcp: 0,
      lcp: 0,
      cls: 0,
      tti: 0,
      tbt: 0,
      bannerDetected: false,
      bannerSelector: null as string | null,
      bannerVisibilityTime: 0,
      bannerViewportCoverage: 0,
      bannerFirstPaint: 0,
      bannerLargestContentfulPaint: 0,
      bannerTimeToInteractive: 0,
      bannerHydrationTime: 0,
      bannerLayoutShift: 0,
      bannerMainThreadBlocking: 0,
      bannerNetworkImpact: 0,
      measurementComplete: false
    };

    (window as unknown as WindowWithWebVitals).__webVitalsMetrics =
      webVitalsMetrics;

    // Set up observers for paint timing
    try {
      // First Contentful Paint
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            webVitalsMetrics.fcp = entry.startTime;
            console.log("🔍 [BROWSER] FCP captured:", webVitalsMetrics.fcp);
            fcpObserver.disconnect();
          }
        }
      });
      fcpObserver.observe({ type: "paint", buffered: true });

      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry =
          entries.length > 0 ? entries[entries.length - 1] : null;
        if (lastEntry) {
          webVitalsMetrics.lcp = lastEntry.startTime;
          console.log("🔍 [BROWSER] LCP captured:", webVitalsMetrics.lcp);
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

      // Cumulative Layout Shift
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShiftEntry = entry as LayoutShiftEntry;
          if (!layoutShiftEntry.hadRecentInput) {
            clsValue += layoutShiftEntry.value;
          }
        }
        webVitalsMetrics.cls = clsValue;
        if (clsValue > 0) {
          console.log("🔍 [BROWSER] CLS updated:", webVitalsMetrics.cls);
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });

      // Total Blocking Time
      let tbtValue = 0;
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            tbtValue += entry.duration - 50;
          }
        }
        webVitalsMetrics.tbt = tbtValue;
        if (tbtValue > 0) {
          console.log("🔍 [BROWSER] TBT updated:", webVitalsMetrics.tbt);
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });

      console.log("🔍 [BROWSER] Performance observers set up successfully");
    } catch (error) {
      console.warn(
        "🔍 [BROWSER] Error setting up performance observers:",
        error
      );
    }

    // Cookie banner detection setup
    const detectCookieBanner = () => {
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
              webVitalsMetrics.bannerDetected = true;
              webVitalsMetrics.bannerSelector = selector;
              webVitalsMetrics.bannerFirstPaint = performance.now();
              webVitalsMetrics.bannerViewportCoverage =
                ((rect.width * rect.height) /
                  (window.innerWidth * window.innerHeight)) *
                100;

              console.log("🔍 [BANNER] Cookie banner detected:", selector);

              // Check if banner is interactive
              const buttons = element.querySelectorAll(
                'button, a, [role="button"], [onclick]'
              );
              if (buttons.length > 0) {
                webVitalsMetrics.bannerTimeToInteractive = performance.now();
                webVitalsMetrics.bannerHydrationTime =
                  webVitalsMetrics.bannerTimeToInteractive -
                  webVitalsMetrics.bannerFirstPaint;
              }

              return true;
            }
          }
        } catch (error) {
          console.warn("🔍 [BANNER] Error checking selector:", selector, error);
        }
      }
      return false;
    };

    // Set up banner detection after DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        // Check immediately and then periodically
        if (!detectCookieBanner()) {
          const interval = setInterval(() => {
            if (detectCookieBanner()) {
              clearInterval(interval);
            }
          }, 100);

          // Stop checking after 10 seconds
          setTimeout(() => clearInterval(interval), 10000);
        }
      });
    } else {
      // DOM is already ready
      if (!detectCookieBanner()) {
        const interval = setInterval(() => {
          if (detectCookieBanner()) {
            clearInterval(interval);
          }
        }, 100);

        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(interval), 10000);
      }
    }
  }, cookieBannerSelectors);

  return {
    fcp: 0,
    lcp: 0,
    cls: 0,
    tti: 0,
    tbt: 0,
    bannerDetected: false,
    bannerSelector: null,
    bannerVisibilityTime: 0,
    bannerViewportCoverage: 0,
    bannerFirstPaint: 0,
    bannerLargestContentfulPaint: 0,
    bannerTimeToInteractive: 0,
    bannerHydrationTime: 0,
    bannerLayoutShift: 0,
    bannerMainThreadBlocking: 0,
    bannerNetworkImpact: 0
  };
}

export async function collectWebVitalsAfterLoad(
  page: Page
): Promise<CookieBannerMetrics> {
  console.log("🔍 [PERFORMANCE] Collecting final Web Vitals...");

  // Wait for page to be ready
  await page.waitForLoadState("networkidle");

  // Get final metrics from the browser
  const webVitals = await page.evaluate(() => {
    console.log("🔍 [BROWSER] Collecting final Web Vitals...");

    const storedMetrics = (window as unknown as WindowWithWebVitals)
      .__webVitalsMetrics;
    if (!storedMetrics) {
      console.error("🔍 [BROWSER] No stored metrics found!");
      return null;
    }

    // Get additional paint entries that might have been missed
    const paintEntries = performance.getEntriesByType("paint");
    console.log("🔍 [BROWSER] Paint entries found:", paintEntries.length);
    for (const entry of paintEntries) {
      console.log(
        `🔍 [BROWSER] Paint entry: ${entry.name} = ${entry.startTime}ms`
      );
      if (entry.name === "first-contentful-paint" && storedMetrics.fcp === 0) {
        storedMetrics.fcp = entry.startTime;
        console.log("🔍 [BROWSER] FCP from fallback:", storedMetrics.fcp);
      }
    }

    // Get LCP entries that might have been missed
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    console.log("🔍 [BROWSER] LCP entries found:", lcpEntries.length);
    if (lcpEntries.length > 0 && storedMetrics.lcp === 0) {
      const lastLCP = lcpEntries[lcpEntries.length - 1];
      storedMetrics.lcp = lastLCP.startTime;
      console.log("🔍 [BROWSER] LCP from fallback:", storedMetrics.lcp);
    }

    console.log("🔍 [BROWSER] Final stored metrics:", {
      fcp: storedMetrics.fcp,
      lcp: storedMetrics.lcp,
      cls: storedMetrics.cls,
      tbt: storedMetrics.tbt,
      bannerDetected: storedMetrics.bannerDetected
    });

    return storedMetrics;
  });

  if (!webVitals) {
    console.warn(
      "🔍 [PERFORMANCE] No web vitals data available, returning defaults"
    );
    return {
      fcp: 0,
      lcp: 0,
      cls: 0,
      tti: 0,
      tbt: 0,
      bannerDetected: false,
      bannerSelector: null,
      bannerVisibilityTime: 0,
      bannerViewportCoverage: 0,
      bannerFirstPaint: 0,
      bannerLargestContentfulPaint: 0,
      bannerTimeToInteractive: 0,
      bannerHydrationTime: 0,
      bannerLayoutShift: 0,
      bannerMainThreadBlocking: 0,
      bannerNetworkImpact: 0
    };
  }

  // Calculate TTI (simplified approach)
  const navigationTiming = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming;
    return {
      domContentLoaded:
        navigation.domContentLoadedEventEnd - navigation.fetchStart,
      loadComplete: navigation.loadEventEnd - navigation.fetchStart
    };
  });

  // Calculate TTI as a simple estimation
  const tti =
    Math.max(
      webVitals.fcp || 0,
      navigationTiming.domContentLoaded,
      webVitals.bannerTimeToInteractive || 0
    ) + 5000; // Add 5 seconds for page to become truly interactive

  const finalMetrics: CookieBannerMetrics = {
    fcp: webVitals.fcp,
    lcp: webVitals.lcp,
    cls: webVitals.cls,
    tti: tti,
    tbt: webVitals.tbt,
    bannerDetected: webVitals.bannerDetected,
    bannerSelector: webVitals.bannerSelector,
    bannerVisibilityTime: webVitals.bannerVisibilityTime,
    bannerViewportCoverage: webVitals.bannerViewportCoverage,
    bannerFirstPaint: webVitals.bannerFirstPaint,
    bannerLargestContentfulPaint:
      webVitals.bannerLargestContentfulPaint || webVitals.bannerFirstPaint,
    bannerTimeToInteractive: webVitals.bannerTimeToInteractive,
    bannerHydrationTime: webVitals.bannerHydrationTime,
    bannerLayoutShift: webVitals.bannerLayoutShift,
    bannerMainThreadBlocking: webVitals.bannerMainThreadBlocking,
    bannerNetworkImpact: webVitals.bannerNetworkImpact
  };

  console.log("🔍 [PERFORMANCE] Final metrics collected:", {
    fcp: finalMetrics.fcp,
    lcp: finalMetrics.lcp,
    cls: finalMetrics.cls,
    tti: finalMetrics.tti,
    tbt: finalMetrics.tbt,
    bannerDetected: finalMetrics.bannerDetected
  });

  return finalMetrics;
}

// Legacy function for backwards compatibility
export async function collectPerformanceMetrics(
  page: Page,
  cookieBannerSelectors: string[] = []
): Promise<{
  fcp: number;
  lcp: number;
  cls: number;
  tbt: number;
  tti: number;
}> {
  const metrics = await collectCookieBannerMetrics(
    page,
    cookieBannerSelectors,
    []
  );
  return {
    fcp: metrics.fcp,
    lcp: metrics.lcp,
    cls: metrics.cls,
    tbt: metrics.tbt,
    tti: metrics.tti
  };
}

export async function collectResourceTiming(page: Page): Promise<{
  scriptLoadTime: number;
  totalSize: number;
  scriptSize: number;
  resourceCount: number;
  scriptCount: number;
}> {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    const scripts = resources.filter((r) => r.initiatorType === "script");

    const totalSize = resources.reduce(
      (sum, r) => sum + (r.transferSize || 0),
      0
    );
    const scriptSize = scripts.reduce(
      (sum, r) => sum + (r.transferSize || 0),
      0
    );
    const scriptLoadTime =
      scripts.reduce((sum, r) => sum + r.duration, 0) / (scripts.length || 1);

    return {
      scriptLoadTime,
      totalSize,
      scriptSize,
      resourceCount: resources.length,
      scriptCount: scripts.length
    };
  });
}
