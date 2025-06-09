import type { Page } from "@playwright/test";

export interface ResourceTimingData {
  timing: {
    navigationStart: number;
    domContentLoaded: number;
    load: number;
    scripts: {
      bundled: {
        loadStart: number;
        loadEnd: number;
        executeStart: number;
        executeEnd: number;
      };
      thirdParty: {
        loadStart: number;
        loadEnd: number;
        executeStart: number;
        executeEnd: number;
      };
    };
  };
  size: {
    total: number;
    bundled: number;
    thirdParty: number;
    cookieServices: number;
    scripts: {
      total: number;
      initial: number;
      dynamic: number;
      thirdParty: number;
      cookieServices: number;
    };
    styles: number;
    images: number;
    fonts: number;
    other: number;
  };
  resources: {
    scripts: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isDynamic: boolean;
      isCookieService: boolean;
      dnsTime: number;
      connectionTime: number;
    }>;
    styles: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    images: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    fonts: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    other: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
      type: string;
    }>;
  };
  language: string;
  duration: number;
}

export class ResourceTimingCollector {
  /**
   * Collect detailed resource timing data from the browser
   */
  async collect(page: Page): Promise<ResourceTimingData> {
    console.log("🔍 [DEBUG] Collecting resource timing data...");

    return page.evaluate(() => {
      console.log("🔍 [BROWSER] Starting resource collection...");

      const perfEntries = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming;
      const resourceEntries = performance.getEntriesByType(
        "resource"
      ) as PerformanceResourceTiming[];

      console.log("🔍 [BROWSER] Navigation timing:", {
        navigationStart: perfEntries.startTime,
        domContentLoaded:
          perfEntries.domContentLoadedEventEnd - perfEntries.startTime,
        loadComplete: perfEntries.loadEventEnd - perfEntries.startTime,
        domInteractive: perfEntries.domInteractive - perfEntries.startTime,
      });

      console.log("🔍 [BROWSER] Found", resourceEntries.length, "resources");

      // Categorize resources
      const scriptEntries = resourceEntries.filter(
        (entry) => entry.initiatorType === "script"
      );
      const styleEntries = resourceEntries.filter(
        (entry) => entry.initiatorType === "link" && entry.name.endsWith(".css")
      );
      const imageEntries = resourceEntries.filter(
        (entry) => entry.initiatorType === "img"
      );
      const fontEntries = resourceEntries.filter(
        (entry) => entry.initiatorType === "font"
      );
      const otherEntries = resourceEntries.filter(
        (entry) =>
          !["script", "link", "img", "font"].includes(entry.initiatorType)
      );

      console.log("🔍 [BROWSER] Resource breakdown:", {
        scripts: scriptEntries.length,
        styles: styleEntries.length,
        images: imageEntries.length,
        fonts: fontEntries.length,
        other: otherEntries.length,
      });

      // Calculate sizes
      const calculateSize = (entries: PerformanceResourceTiming[]) => {
        const total =
          entries.reduce((acc, entry) => {
            const size = entry.transferSize || entry.encodedBodySize || 0;
            return acc + size;
          }, 0) / 1024;
        return total;
      };

      const navigationStart = perfEntries.startTime;
      const domContentLoaded =
        perfEntries.domContentLoadedEventEnd - navigationStart;
      const load = perfEntries.loadEventEnd - navigationStart;

      console.log("🔍 [BROWSER] Calculated timings:", {
        navigationStart,
        domContentLoaded,
        load,
      });

      return {
        timing: {
          navigationStart,
          domContentLoaded,
          load,
          scripts: {
            bundled: {
              loadStart: 0,
              loadEnd: scriptEntries.reduce(
                (acc, entry) => acc + entry.duration,
                0
              ),
              executeStart: 0,
              executeEnd: 0,
            },
            thirdParty: {
              loadStart: 0,
              loadEnd: scriptEntries.reduce(
                (acc, entry) => acc + entry.duration,
                0
              ),
              executeStart: 0,
              executeEnd: 0,
            },
          },
        },
        size: {
          total: calculateSize(resourceEntries),
          bundled: calculateSize(
            scriptEntries.filter((e) =>
              e.name.includes(window.location.hostname)
            )
          ),
          thirdParty: calculateSize(
            scriptEntries.filter(
              (e) => !e.name.includes(window.location.hostname)
            )
          ),
          cookieServices: 0, // Will be calculated later
          scripts: {
            total: calculateSize(scriptEntries),
            initial: calculateSize(
              scriptEntries.filter((e) => e.startTime < domContentLoaded)
            ),
            dynamic: calculateSize(
              scriptEntries.filter((e) => e.startTime >= domContentLoaded)
            ),
            thirdParty: calculateSize(
              scriptEntries.filter(
                (e) => !e.name.includes(window.location.hostname)
              )
            ),
            cookieServices: 0, // Will be calculated later
          },
          styles: calculateSize(styleEntries),
          images: calculateSize(imageEntries),
          fonts: calculateSize(fontEntries),
          other: calculateSize(otherEntries),
        },
        resources: {
          scripts: scriptEntries.map((entry) => ({
            name: entry.name,
            size: entry.transferSize ? entry.transferSize / 1024 : 0,
            duration: entry.duration,
            startTime: entry.startTime - navigationStart,
            isThirdParty: !entry.name.includes(window.location.hostname),
            isDynamic: entry.startTime >= domContentLoaded,
            isCookieService: false,
            dnsTime: entry.domainLookupEnd - entry.domainLookupStart,
            connectionTime: entry.connectEnd - entry.connectStart,
          })),
          styles: styleEntries.map((entry) => ({
            name: entry.name,
            size: entry.transferSize ? entry.transferSize / 1024 : 0,
            duration: entry.duration,
            startTime: entry.startTime - navigationStart,
            isThirdParty: !entry.name.includes(window.location.hostname),
            isCookieService: false,
          })),
          images: imageEntries.map((entry) => ({
            name: entry.name,
            size: entry.transferSize ? entry.transferSize / 1024 : 0,
            duration: entry.duration,
            startTime: entry.startTime - navigationStart,
            isThirdParty: !entry.name.includes(window.location.hostname),
            isCookieService: false,
          })),
          fonts: fontEntries.map((entry) => ({
            name: entry.name,
            size: entry.transferSize ? entry.transferSize / 1024 : 0,
            duration: entry.duration,
            startTime: entry.startTime - navigationStart,
            isThirdParty: !entry.name.includes(window.location.hostname),
            isCookieService: false,
          })),
          other: otherEntries.map((entry) => ({
            name: entry.name,
            size: entry.transferSize ? entry.transferSize / 1024 : 0,
            duration: entry.duration,
            startTime: entry.startTime - navigationStart,
            isThirdParty: !entry.name.includes(window.location.hostname),
            isCookieService: false,
            type: entry.initiatorType,
          })),
        },
        language: "en",
        duration: load,
      };
    });
  }
}
