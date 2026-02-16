import type { Logger } from "@c15t/logger";
import type { Page, Request, Response, Route } from "@playwright/test";
import type { Config, NetworkMetrics, NetworkRequest } from "./types";

const CONTENT_RANGE_TOTAL_BYTES_PATTERN = /\/(\d+)$/;

type PendingRequest = {
	url: string;
	startTime: number;
	resourceType: string;
	isScript: boolean;
	isThirdParty: boolean;
};

export class NetworkMonitor {
	private readonly config: Config;
	private readonly logger: Logger;
	private networkRequests: NetworkRequest[] = [];
	private metrics: NetworkMetrics = {
		bannerNetworkRequests: 0,
		bannerBundleSize: 0,
	};
	private readonly pending = new Map<Request, PendingRequest>();
	private detach: Array<() => void> = [];

	constructor(config: Config, logger: Logger) {
		this.config = config;
		this.logger = logger;
	}

	/**
	 * Set up passive network event monitoring.
	 * This avoids request interception side effects and records transfer sizes in bytes.
	 */
	async setupMonitoring(page: Page, targetUrl?: string): Promise<void> {
		this.teardownListeners();
		const monitorMode = this.config.measurement.networkMonitorMode || "passive";

		const firstPartyUrl = this.config.url || targetUrl || page.url();
		let firstPartyHostname = "";
		try {
			firstPartyHostname = new URL(firstPartyUrl).hostname;
		} catch {
			firstPartyHostname = "";
		}

		const handleRequest = (request: Request) => {
			const url = request.url();
			const resourceType = request.resourceType();
			let requestHostname = "";
			try {
				requestHostname = new URL(url).hostname;
			} catch {
				requestHostname = "";
			}

			const isScript = resourceType === "script";
			const isThirdParty =
				Boolean(requestHostname) &&
				Boolean(firstPartyHostname) &&
				requestHostname !== firstPartyHostname;

			this.pending.set(request, {
				url,
				startTime: Date.now(),
				resourceType,
				isScript,
				isThirdParty,
			});
		};

		const commitRequest = async (
			request: Request,
			response?: Response | null
		) => {
			const pendingRequest = this.pending.get(request);
			if (!pendingRequest) {
				return;
			}
			this.pending.delete(request);

			let size = 0;
			try {
				const requestSizes = await request.sizes();
				const responseBodySize = Number.isFinite(requestSizes.responseBodySize)
					? requestSizes.responseBodySize
					: 0;
				const responseHeadersSize = Number.isFinite(
					requestSizes.responseHeadersSize
				)
					? requestSizes.responseHeadersSize
					: 0;
				const protocolTransferSize = responseBodySize + responseHeadersSize;
				if (protocolTransferSize > 0) {
					size = protocolTransferSize;
				} else if (responseBodySize > 0) {
					size = responseBodySize;
				}
			} catch {
				// Some requests may not expose protocol sizes; fall back to headers.
			}

			if (response) {
				const headers = response.headers();
				const contentLength = headers["content-length"];
				if (size === 0 && contentLength) {
					const parsedContentLength = Number.parseInt(contentLength, 10);
					if (Number.isFinite(parsedContentLength) && parsedContentLength > 0) {
						size = parsedContentLength;
					}
				}
				if (size === 0) {
					const contentRange = headers["content-range"];
					if (contentRange) {
						const match = contentRange.match(CONTENT_RANGE_TOTAL_BYTES_PATTERN);
						if (match) {
							const parsedContentRange = Number.parseInt(match[1], 10);
							if (
								Number.isFinite(parsedContentRange) &&
								parsedContentRange > 0
							) {
								size = parsedContentRange;
							}
						}
					}
				}
			}

			if (size === 0 && response) {
				try {
					const body = await response.body();
					if (body.byteLength > 0) {
						size = body.byteLength;
					}
				} catch {
					// Body access can fail for some opaque/streamed responses.
				}
			}

			const duration = Math.max(0, Date.now() - pendingRequest.startTime);

			this.networkRequests.push({
				url: pendingRequest.url,
				size,
				duration,
				startTime: pendingRequest.startTime,
				isScript: pendingRequest.isScript,
				isThirdParty: pendingRequest.isThirdParty,
			});

			if (pendingRequest.isThirdParty) {
				this.metrics.bannerNetworkRequests += 1;
				this.metrics.bannerBundleSize += size;
				this.logger.debug(
					`Third-party request detected: ${pendingRequest.url} [${pendingRequest.resourceType}] (${size} bytes)`
				);
			}
		};

		const handleRequestFinished = async (request: Request) => {
			await commitRequest(request, await request.response());
		};

		const handleRequestFailed = async (request: Request) => {
			await commitRequest(request, await request.response());
		};

		if (monitorMode === "route-debug") {
			const handleRoute = async (route: Route) => {
				const request = route.request();
				this.logger.debug(
					`[route-debug] ${request.method()} ${request.resourceType()} ${request.url()}`
				);
				await route.continue();
			};
			await page.route("**/*", handleRoute);
			this.detach.push(() => {
				page.unroute("**/*", handleRoute).catch(() => {
					// Ignore teardown-time unroute errors.
				});
			});
		}

		page.on("request", handleRequest);
		page.on("requestfinished", handleRequestFinished);
		page.on("requestfailed", handleRequestFailed);

		this.detach.push(() => page.off("request", handleRequest));
		this.detach.push(() => page.off("requestfinished", handleRequestFinished));
		this.detach.push(() => page.off("requestfailed", handleRequestFailed));
	}

	private teardownListeners(): void {
		for (const detach of this.detach) {
			detach();
		}
		this.detach = [];
	}

	getNetworkRequests(): NetworkRequest[] {
		return this.networkRequests;
	}

	getMetrics(): NetworkMetrics {
		return this.metrics;
	}

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

	reset(): void {
		this.networkRequests = [];
		this.metrics = {
			bannerNetworkRequests: 0,
			bannerBundleSize: 0,
		};
		this.pending.clear();
		this.teardownListeners();
	}
}
