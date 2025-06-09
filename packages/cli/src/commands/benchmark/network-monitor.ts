import type { Page } from "@playwright/test";
import type { NetworkRequest, CookieBannerMetrics } from "./types";

export class NetworkMonitor {
  private networkRequests: NetworkRequest[] = [];

  async setupRequestMonitoring(
    page: Page,
    cookieBannerMetrics: CookieBannerMetrics
  ): Promise<void> {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();

      try {
        const response = await route.fetch();
        const headers = response.headers();

        // Add timing-allow-origin header for all responses
        headers["timing-allow-origin"] = "*";

        const isScript = request.resourceType() === "script";
        const isThirdParty = !url.includes(new URL(url).hostname);

        if (isScript) {
          const contentLength = response.headers()["content-length"];
          const size = contentLength ? +contentLength || 0 : 0;

          this.networkRequests.push({
            url,
            size: size / 1024, // Convert to KB
            duration: 0, // Will be calculated later
            startTime: Date.now(),
            isScript,
            isThirdParty,
          });

          if (isThirdParty) {
            cookieBannerMetrics.bannerNetworkRequests++;
            cookieBannerMetrics.bannerBundleSize += size / 1024;
            console.log(
              `🌐 [THIRD-PARTY-SCRIPT] Detected: ${url} (${(
                size / 1024
              ).toFixed(2)}KB)`
            );
          }
        }

        await route.fulfill({ response, headers });
      } catch {
        // If we can't modify the response, just continue with the original request
        await route.continue();
      }
    });
  }

  getNetworkRequests(): NetworkRequest[] {
    return this.networkRequests;
  }

  calculateNetworkImpact(): {
    totalDownloadTime: number;
    totalSize: number;
    thirdPartyCount: number;
  } {
    return {
      totalDownloadTime: this.networkRequests.reduce(
        (acc, req) => acc + req.duration,
        0
      ),
      totalSize: this.networkRequests.reduce((acc, req) => acc + req.size, 0),
      thirdPartyCount: this.networkRequests.filter((req) => req.isThirdParty)
        .length,
    };
  }

  reset(): void {
    this.networkRequests = [];
  }
}
