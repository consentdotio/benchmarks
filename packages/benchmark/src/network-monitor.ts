import type { Page, Route } from '@playwright/test';
import type { Config, NetworkRequest, NetworkMetrics } from './types';

export class NetworkMonitor {
	private config: Config;
	private networkRequests: NetworkRequest[] = [];
	private metrics: NetworkMetrics = {
		bannerNetworkRequests: 0,
		bannerBundleSize: 0,
	};

	constructor(config: Config) {
		this.config = config;
	}

	/**
	 * Set up network request monitoring
	 */
	async setupMonitoring(page: Page): Promise<void> {
		await page.route('**/*', async (route: Route) => {
			const request = route.request();
			const url = request.url();

			try {
				const response = await route.fetch();
				const headers = response.headers();

				// Add timing-allow-origin header for all responses
				headers['timing-allow-origin'] = '*';

				const isScript = request.resourceType() === 'script';
				const isThirdParty = !url.includes(new URL(url).hostname);

				if (isScript) {
					const contentLength = response.headers()['content-length'];
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
						this.metrics.bannerNetworkRequests++;
						this.metrics.bannerBundleSize += size / 1024;
						console.log(
							`🌐 [THIRD-PARTY-SCRIPT] Detected: ${url} (${(size / 1024).toFixed(2)}KB)`
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

	/**
	 * Get collected network requests
	 */
	getNetworkRequests(): NetworkRequest[] {
		return this.networkRequests;
	}

	/**
	 * Get network metrics
	 */
	getMetrics(): NetworkMetrics {
		return this.metrics;
	}

	/**
	 * Calculate network impact metrics
	 */
	calculateNetworkImpact(): {
		totalImpact: number;
		totalDownloadTime: number;
		thirdPartyImpact: number;
		scriptImpact: number;
	} {
		const totalImpact = this.networkRequests.reduce(
			(acc, req) => acc + req.size,
			0
		);
		const totalDownloadTime = this.networkRequests.reduce(
			(acc, req) => acc + req.duration,
			0
		);
		const thirdPartyImpact = this.networkRequests
			.filter((req) => req.isThirdParty)
			.reduce((acc, req) => acc + req.size, 0);
		const scriptImpact = this.networkRequests
			.filter((req) => req.isScript)
			.reduce((acc, req) => acc + req.size, 0);

		return {
			totalImpact,
			totalDownloadTime,
			thirdPartyImpact,
			scriptImpact,
		};
	}

	/**
	 * Reset collected data
	 */
	reset(): void {
		this.networkRequests = [];
		this.metrics = {
			bannerNetworkRequests: 0,
			bannerBundleSize: 0,
		};
	}
}

