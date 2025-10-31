import type { Logger } from "@c15t/logger";
import type { Page } from "@playwright/test";
import { determineBundleStrategy } from "./bundle-strategy";
import { BENCHMARK_CONSTANTS } from "./constants";
import type {
	Config,
	CookieBannerData,
	CookieBannerMetrics,
	LayoutShiftEntry,
	WindowWithCookieMetrics,
} from "./types";

/**
 * Opacity threshold for determining when banner is actually visible to users.
 *
 * This threshold (0.5 = 50% opacity) accounts for CSS transitions and animations.
 * A banner that renders instantly but fades in slowly will only be considered
 * "visible" once it reaches 50% opacity, ensuring scores reflect actual user
 * experience rather than just technical render time.
 *
 * @see METHODOLOGY.md for detailed explanation of render time vs visibility time
 */
const OPACITY_VISIBILITY_THRESHOLD = 0.5;

export class CookieBannerCollector {
	private readonly config: Config;
	private readonly logger: Logger;

	constructor(config: Config, logger: Logger) {
		this.config = config;
		this.logger = logger;
	}

	/**
	 * Initialize cookie banner metrics tracking
	 */
	initializeMetrics(): CookieBannerMetrics {
		const { isBundled, isIIFE } = determineBundleStrategy(this.config);

		let bundleStrategy = "Unknown";
		if (isBundled) {
			bundleStrategy = "Bundled";
		} else if (isIIFE) {
			bundleStrategy = "IIFE";
		}

		this.logger.debug(
			`Bundle strategy detected from config: ${bundleStrategy}`,
			{
				bundleType: this.config.techStack?.bundleType,
				isBundled,
				isIIFE,
			}
		);

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
	 * Set up cookie banner detection script in the browser.
	 *
	 * This method injects a detection script that runs before page load to track
	 * banner appearance metrics. It measures both technical render time (when element
	 * appears in DOM) and user-perceived visibility time (when opacity > threshold).
	 *
	 * Metrics tracked:
	 * - bannerFirstSeen: Technical render time (element in DOM)
	 * - bannerVisibleTime: User-perceived visibility (opacity > 0.5)
	 * - bannerInteractive: When buttons become clickable
	 *
	 * @see METHODOLOGY.md for detailed measurement approach
	 */
	async setupDetection(page: Page): Promise<void> {
		const selectors = this.config.cookieBanner?.selectors || [];

		await page.addInitScript(
			(config: {
				bannerSelectors: string[];
				pollInterval: number;
				detectionTimeout: number;
				opacityThreshold: number;
			}) => {
				const {
					bannerSelectors,
					pollInterval,
					detectionTimeout,
					opacityThreshold,
				} = config;
				// Store initial performance baseline
				// pageLoadStart = 0 means all times are relative to navigation start
				// performance.now() already returns time since navigation (timeOrigin)
				(window as unknown as WindowWithCookieMetrics).__cookieBannerMetrics = {
					pageLoadStart: 0,
					bannerDetectionStart: 0,
					bannerFirstSeen: 0,
					bannerVisibleTime: 0, // Track when banner is actually visible (opacity > 0.5)
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
				const detectCookieBanner = () => {
					const metrics = (window as unknown as WindowWithCookieMetrics)
						.__cookieBannerMetrics;
					// performance.now() returns time since navigation start (timeOrigin)
					metrics.bannerDetectionStart = performance.now();

					for (const selector of bannerSelectors) {
						try {
							const element = document.querySelector(selector);
							if (element) {
								const rect = element.getBoundingClientRect();
								const computedStyle = window.getComputedStyle(element);
								const opacity = Number.parseFloat(computedStyle.opacity);

								/**
								 * Technical render check: Element exists in DOM with dimensions.
								 * This determines when the banner element first appears, regardless
								 * of visibility. Used for bannerRenderTime metric.
								 */
								const isRendered =
									rect.width > 0 &&
									rect.height > 0 &&
									computedStyle.visibility !== "hidden" &&
									computedStyle.display !== "none";

								/**
								 * User-perceived visibility check: Element is rendered AND visible.
								 * Uses opacity threshold to account for CSS animations. A banner that
								 * renders instantly but fades in slowly will only be considered "visible"
								 * once opacity > 0.5. This ensures scores reflect actual user experience.
								 * Used for bannerVisibilityTime metric (primary scoring metric).
								 */
								const isVisible = isRendered && opacity > opacityThreshold;

								if (isRendered) {
									const bannerMetrics = (
										window as unknown as WindowWithCookieMetrics
									).__cookieBannerMetrics;
									// performance.now() returns time since navigation start (timeOrigin)
									const now = performance.now();

									/**
									 * Track technical render time: When banner element first appears in DOM.
									 * This is measured from navigationStart and represents when the element
									 * has dimensions and is not hidden. Used for bannerRenderTime metric.
									 */
									if (!bannerMetrics.detected) {
										bannerMetrics.detected = true;
										bannerMetrics.selector = selector;
										bannerMetrics.bannerFirstSeen = now;
										bannerMetrics.layoutShiftsBefore = cumulativeLayoutShift;
									}

									/**
									 * Track user-perceived visibility time: When banner becomes visible to users.
									 * Only recorded when opacity > threshold (0.5), accounting for CSS animations.
									 * This is the primary metric used for scoring (bannerVisibilityTime).
									 * Only update if not set yet or if this measurement is earlier.
									 */
									if (
										isVisible &&
										(bannerMetrics.bannerVisibleTime === 0 ||
											now < bannerMetrics.bannerVisibleTime)
									) {
										bannerMetrics.bannerVisibleTime = now;
									}

									// Check if banner is interactive
									const buttons = element.querySelectorAll(
										'button, a, [role="button"], [onclick]'
									);
									if (buttons.length > 0) {
										// Test if buttons are actually clickable
										const firstButton = buttons[0] as HTMLElement;
										if (firstButton.offsetParent !== null) {
											// Element is visible and clickable
											bannerMetrics.bannerInteractive = now;
										}
									}

									return true;
								}
							}
						} catch (_error) {
							// Ignore selector errors and continue checking other selectors
						}
					}
					return false;
				};

				// Start detection immediately - try right away, then poll if needed
				// This ensures we catch banners that appear instantly (like in offline/bundled mode)
				const startDetection = () => {
					// Try immediate detection first (catches instant renders)
					if (!detectCookieBanner()) {
						// If not found immediately, start polling
						const interval = setInterval(() => {
							if (detectCookieBanner()) {
								clearInterval(interval);
							}
						}, pollInterval);

						// Stop checking after timeout
						setTimeout(() => clearInterval(interval), detectionTimeout);
					}
				};

				// If DOM is already loaded, start immediately
				if (document.readyState !== "loading") {
					startDetection();
				} else {
					// Otherwise wait for DOMContentLoaded, but start immediately after
					document.addEventListener("DOMContentLoaded", startDetection, {
						once: true,
					});
				}
			},
			{
				bannerSelectors: selectors,
				pollInterval: BENCHMARK_CONSTANTS.BANNER_POLL_INTERVAL,
				detectionTimeout: BENCHMARK_CONSTANTS.BANNER_DETECTION_TIMEOUT,
				opacityThreshold: OPACITY_VISIBILITY_THRESHOLD,
			}
		);
	}

	/**
	 * Collect cookie banner specific metrics from the browser.
	 *
	 * Returns both technical metrics (bannerRenderTime) and user-perceived metrics
	 * (bannerVisibilityTime). The visibilityTime metric is used for scoring as it
	 * reflects actual user experience including CSS animations.
	 *
	 * All timing metrics are relative to navigationStart (includes TTFB).
	 *
	 * @returns CookieBannerData with render time, visibility time, interactive time,
	 *          layout shift impact, and viewport coverage
	 * @see METHODOLOGY.md for detailed explanation of metrics
	 */
	async collectMetrics(page: Page): Promise<CookieBannerData | null> {
		return await page.evaluate(
			(config: { percentageMultiplier: number }) => {
				const { percentageMultiplier } = config;
				const metrics = (window as unknown as WindowWithCookieMetrics)
					.__cookieBannerMetrics;
				if (!metrics) {
					return null;
				}

				return {
					detected: metrics.detected,
					selector: metrics.selector,
					/**
					 * Technical render time: When banner element first appeared in DOM.
					 * Measured from navigationStart. This is tracked for reference but
					 * not used in primary scoring.
					 */
					bannerRenderTime:
						metrics.detected && metrics.bannerFirstSeen > 0
							? metrics.bannerFirstSeen - metrics.pageLoadStart
							: 0,
					/**
					 * User-perceived visibility time: When banner becomes visible to users.
					 * Uses opacity threshold (0.5) to account for CSS animations. This is the
					 * primary metric used for scoring. Falls back to render time if visibility
					 * time was not recorded (e.g., banner rendered with opacity already > 0.5).
					 */
					bannerVisibilityTime: (() => {
						if (metrics.detected && metrics.bannerVisibleTime > 0) {
							return metrics.bannerVisibleTime - metrics.pageLoadStart;
						}
						if (metrics.detected && metrics.bannerFirstSeen > 0) {
							return metrics.bannerFirstSeen - metrics.pageLoadStart;
						}
						return 0; // Fallback to render time if visibility time not set
					})(),
					bannerInteractiveTime:
						metrics.detected && metrics.bannerInteractive > 0
							? metrics.bannerInteractive - metrics.pageLoadStart
							: 0,
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
									const viewportWidth = window.innerWidth;
									const viewportHeight = window.innerHeight;

									// Calculate the intersection of element rect with viewport
									// Only count the visible portion of the banner
									const visibleLeft = Math.max(0, rect.left);
									const visibleTop = Math.max(0, rect.top);
									const visibleRight = Math.min(
										viewportWidth,
										rect.left + rect.width
									);
									const visibleBottom = Math.min(
										viewportHeight,
										rect.top + rect.height
									);

									// Calculate visible area (intersection with viewport)
									const visibleWidth = Math.max(0, visibleRight - visibleLeft);
									const visibleHeight = Math.max(0, visibleBottom - visibleTop);
									const visibleArea = visibleWidth * visibleHeight;
									const viewportArea = viewportWidth * viewportHeight;

									if (viewportArea === 0) {
										return 0;
									}

									return (visibleArea / viewportArea) * percentageMultiplier;
								}
								return 0;
							})()
						: 0,
				};
			},
			{ percentageMultiplier: BENCHMARK_CONSTANTS.PERCENTAGE_MULTIPLIER }
		);
	}
}
