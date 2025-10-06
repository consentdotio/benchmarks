import type { Page } from "@playwright/test";
import type { PerfumeMetrics } from "./types";

// Extend Window interface for our metrics storage
declare global {
	interface Window {
		__perfumeMetrics?: Record<string, {
			value: number;
			timestamp: number;
		}>;
		Perfume?: {
			initPerfume: (config: any) => void;
		};
		__benchmarkConfig?: {
			cookieBanner?: {
				selectors: string[];
				serviceHosts: string[];
				waitForVisibility: boolean;
				measureViewportCoverage: boolean;
				expectedLayoutShift: boolean;
				serviceName: string;
			};
		};
	}
}

export class PerfumeMetricsCollector {
	private metrics: PerfumeMetrics | null = null;
	private isInitialized = false;

	async initialize(page: Page, benchmarkConfig?: any): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Initialize Perfume.js in the browser context
		await page.evaluate((config) => {
			// Pass benchmark config to the page context
			if (config) {
				window.__benchmarkConfig = config;
			}
			// Initialize metrics storage
			if (!window.__perfumeMetrics) {
				window.__perfumeMetrics = {};
			}

			// Create a simple Perfume-like implementation using native APIs
			window.Perfume = {
				initPerfume: (config: any) => {
					console.log("🔍 [PERFUME] Initializing performance monitoring...");
					
					// Monitor First Paint and First Contentful Paint with enhanced detection
					let fpValue = 0;
					let fcpValue = 0;
					
					const observer = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.name === 'first-paint') {
								fpValue = entry.startTime;
								window.__perfumeMetrics!['firstPaint'] = {
									value: fpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstPaint:`, fpValue);
							} else if (entry.name === 'first-contentful-paint') {
								fcpValue = entry.startTime;
								window.__perfumeMetrics!['firstContentfulPaint'] = {
									value: fcpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstContentfulPaint:`, fcpValue);
							}
						}
					});

					try {
						observer.observe({ entryTypes: ['paint'] });
					} catch (error) {
						console.warn('🔍 [PERFUME] Paint observer not supported, using fallback');
					}

					// Enhanced paint metrics fallback with multiple attempts
					const checkPaintMetrics = () => {
						const paintEntries = performance.getEntriesByType('paint');
						for (const entry of paintEntries) {
							if (entry.name === 'first-paint' && !fpValue) {
								fpValue = entry.startTime;
								window.__perfumeMetrics!['firstPaint'] = {
									value: fpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstPaint (fallback):`, fpValue);
							} else if (entry.name === 'first-contentful-paint' && !fcpValue) {
								fcpValue = entry.startTime;
								window.__perfumeMetrics!['firstContentfulPaint'] = {
									value: fcpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstContentfulPaint (fallback):`, fcpValue);
							}
						}
					};

					// Check paint metrics multiple times
					setTimeout(() => checkPaintMetrics(), 50);
					setTimeout(() => checkPaintMetrics(), 200);
					setTimeout(() => checkPaintMetrics(), 500);

					// Monitor Largest Contentful Paint with more robust detection
					let lcpValue = 0;
					const lcpObserver = new PerformanceObserver((list) => {
						const entries = list.getEntries();
						const lastEntry = entries[entries.length - 1];
						lcpValue = lastEntry.startTime;
						window.__perfumeMetrics!['largestContentfulPaint'] = {
							value: lcpValue,
							timestamp: Date.now(),
						};
						console.log(`🔍 [PERFUME] largestContentfulPaint:`, lcpValue);
					});

					try {
						lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
					} catch (error) {
						console.warn('🔍 [PERFUME] LCP observer not supported, using fallback');
					}

					// Enhanced LCP fallback with multiple attempts
					const checkLCP = () => {
						const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
						if (lcpEntries.length > 0) {
							const lastEntry = lcpEntries[lcpEntries.length - 1];
							lcpValue = lastEntry.startTime;
							window.__perfumeMetrics!['largestContentfulPaint'] = {
								value: lcpValue,
								timestamp: Date.now(),
							};
							console.log(`🔍 [PERFUME] largestContentfulPaint (fallback):`, lcpValue);
							return true;
						}
						return false;
					};

					// Check LCP multiple times with increasing delays
					setTimeout(() => checkLCP(), 100);
					setTimeout(() => checkLCP(), 500);
					setTimeout(() => checkLCP(), 1000);
					setTimeout(() => checkLCP(), 2000);

					// Monitor Cumulative Layout Shift
					let clsValue = 0;
					const clsObserver = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (!(entry as any).hadRecentInput) {
								clsValue += (entry as any).value;
							}
						}
						window.__perfumeMetrics!['cumulativeLayoutShift'] = {
							value: clsValue,
							timestamp: Date.now(),
						};
						console.log(`🔍 [PERFUME] cumulativeLayoutShift:`, clsValue);
					});

					clsObserver.observe({ entryTypes: ['layout-shift'] });

					// Monitor Total Blocking Time
					let totalBlockingTime = 0;
					const tbtObserver = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.entryType === 'longtask') {
								totalBlockingTime += entry.duration - 50; // Subtract 50ms threshold
							}
						}
						window.__perfumeMetrics!['totalBlockingTime'] = {
							value: totalBlockingTime,
							timestamp: Date.now(),
						};
						console.log(`🔍 [PERFUME] totalBlockingTime:`, totalBlockingTime);
					});

					tbtObserver.observe({ entryTypes: ['longtask'] });

					// Monitor First Input Delay
					const fidObserver = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.entryType === 'first-input') {
								const fid = (entry as any).processingStart - entry.startTime;
								window.__perfumeMetrics!['firstInputDelay'] = {
									value: fid,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstInputDelay:`, fid);
							}
						}
					});

					fidObserver.observe({ entryTypes: ['first-input'] });

					// Monitor Regulatory Friction Delay (RFD) - time from HTML rendering start to cookie banner appearance
					// This measures the actual regulatory friction users experience waiting for the mandatory consent element
					let htmlRenderStartTime = 0;
					let cookieBannerAppearTime = 0;
					
					// Track when HTML starts rendering (DOMContentLoaded or first paint)
					const trackHtmlRenderStart = () => {
						if (htmlRenderStartTime === 0) {
							htmlRenderStartTime = performance.now();
							console.log(`🔍 [PERFUME] HTML rendering started:`, htmlRenderStartTime);
							calculateRFD();
						}
					};
					
					// Track when cookie banner becomes visible and actionable
					const trackCookieBannerAppearance = () => {
						if (cookieBannerAppearTime === 0) {
							cookieBannerAppearTime = performance.now();
							console.log(`🔍 [PERFUME] Cookie banner appeared:`, cookieBannerAppearTime);
							calculateRFD();
						}
					};
					
					const calculateRFD = () => {
						// RFD = Time from HTML rendering start to cookie banner appearance
						// This captures the regulatory friction delay users experience waiting for mandatory consent
						const rfd = htmlRenderStartTime > 0 && cookieBannerAppearTime > 0 ? 
							cookieBannerAppearTime - htmlRenderStartTime : 0;
						
						if (rfd > 0) {
							window.__perfumeMetrics!['regulatoryFrictionDelay'] = {
								value: rfd,
								timestamp: Date.now(),
							};
							console.log(`🔍 [PERFUME] regulatoryFrictionDelay (RFD):`, rfd, `(HTML Start: ${htmlRenderStartTime}ms, Banner Appear: ${cookieBannerAppearTime}ms)`);
						}
					};

					// Track HTML rendering start - use DOMContentLoaded as the start point
					if (document.readyState === 'loading') {
						document.addEventListener('DOMContentLoaded', trackHtmlRenderStart, { once: true });
					} else {
						// DOM is already loaded, use current time
						trackHtmlRenderStart();
					}
					
					// Also track on first paint as fallback
					if (fpValue > 0) {
						htmlRenderStartTime = fpValue;
						console.log(`🔍 [PERFUME] HTML rendering started (via FP):`, htmlRenderStartTime);
						calculateRFD();
					}
					
					// Monitor cookie banner appearance using the benchmark config selectors
					const monitorCookieBannerAppearance = () => {
						const bannerSelectors = window.__benchmarkConfig?.cookieBanner?.selectors || [];
						
						for (const selector of bannerSelectors) {
							const banner = document.querySelector(selector) as HTMLElement;
							if (banner && banner.offsetHeight > 0 && banner.offsetWidth > 0) {
								// Banner is visible and has dimensions
								if (cookieBannerAppearTime === 0) {
									trackCookieBannerAppearance();
								}
								return;
							}
						}
					};
					
					// Check for cookie banner appearance periodically
					const bannerCheckInterval = setInterval(() => {
						if (!window.__perfumeMetrics?.regulatoryFrictionDelay) {
							monitorCookieBannerAppearance();
						} else {
							clearInterval(bannerCheckInterval);
						}
					}, 50);
					
					// Check for RFD calculation periodically
					const rfdInterval = setInterval(() => {
						if (!window.__perfumeMetrics?.regulatoryFrictionDelay) {
							calculateRFD();
						} else {
							clearInterval(rfdInterval);
						}
					}, 100);

					// Store navigation timing and TTFB
					const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
					if (navigationTiming) {
						// Calculate Time To First Byte (TTFB)
						const ttfb = navigationTiming.responseStart - navigationTiming.fetchStart;
						window.__perfumeMetrics!['timeToFirstByte'] = {
							value: ttfb,
							timestamp: Date.now(),
						};
						console.log(`🔍 [PERFUME] timeToFirstByte:`, ttfb);

						// Store overall navigation timing
						window.__perfumeMetrics!['navigationTiming'] = {
							value: navigationTiming.loadEventEnd - navigationTiming.fetchStart,
							timestamp: Date.now(),
						};
						console.log(`🔍 [PERFUME] navigationTiming:`, navigationTiming.loadEventEnd - navigationTiming.fetchStart);
					}

					// Note: Cookie banner stability monitoring removed as RFD now measures
					// learned anticipatory delay (user interaction - FCP) instead of technical timing

					// Final check for any missed metrics after a longer delay
					setTimeout(() => {
						// Final paint metrics check
						const paintEntries = performance.getEntriesByType('paint');
						for (const entry of paintEntries) {
							if (entry.name === 'first-paint' && !fpValue) {
								fpValue = entry.startTime;
								window.__perfumeMetrics!['firstPaint'] = {
									value: fpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstPaint (final):`, fpValue);
							} else if (entry.name === 'first-contentful-paint' && !fcpValue) {
								fcpValue = entry.startTime;
								window.__perfumeMetrics!['firstContentfulPaint'] = {
									value: fcpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstContentfulPaint (final):`, fcpValue);
							}
						}

						// Final LCP check
						if (!lcpValue) {
							const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
							if (lcpEntries.length > 0) {
								const lastEntry = lcpEntries[lcpEntries.length - 1];
								lcpValue = lastEntry.startTime;
								window.__perfumeMetrics!['largestContentfulPaint'] = {
									value: lcpValue,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] largestContentfulPaint (final):`, lcpValue);
							}
						}
					}, 3000);
				}
			};

			// Initialize with analytics tracker
			window.Perfume.initPerfume({
				analyticsTracker: ({ metricName, data }: { metricName: string; data: number }) => {
					window.__perfumeMetrics![metricName] = {
						value: data,
						timestamp: Date.now(),
					};
					console.log(`🔍 [PERFUME] ${metricName}:`, data);
				},
			});
		}, benchmarkConfig);

		this.isInitialized = true;
		console.log("🔍 [PERFUME] Initialized Perfume.js metrics collection");
	}

	async collectMetrics(page: Page, timeout = 10000, benchmarkConfig?: any): Promise<PerfumeMetrics> {
		await this.initialize(page, benchmarkConfig);

		// Wait for metrics to be collected
		const startTime = Date.now();
		let metrics: PerfumeMetrics | null = null;

		while (Date.now() - startTime < timeout && !metrics) {
			metrics = await page.evaluate(() => {
				const perfumeMetrics = window.__perfumeMetrics;
				if (!perfumeMetrics) {
					return null;
				}

				// Check if we have the essential metrics - be more lenient
				const hasEssentialMetrics = 
					perfumeMetrics.firstContentfulPaint ||
					perfumeMetrics.firstPaint;

				if (!hasEssentialMetrics) {
					return null;
				}

				// Fallback: if LCP is 0 but we have FCP, use FCP as LCP
				if (!perfumeMetrics.largestContentfulPaint && perfumeMetrics.firstContentfulPaint) {
					perfumeMetrics.largestContentfulPaint = perfumeMetrics.firstContentfulPaint;
					console.log(`🔍 [PERFUME] Using FCP as LCP fallback:`, perfumeMetrics.firstContentfulPaint.value);
				}

				// Extract metrics with fallbacks
				return {
					firstPaint: perfumeMetrics.firstPaint?.value || 0,
					firstContentfulPaint: perfumeMetrics.firstContentfulPaint?.value || 0,
					largestContentfulPaint: perfumeMetrics.largestContentfulPaint?.value || 0,
					firstInputDelay: perfumeMetrics.firstInputDelay?.value || 0,
					cumulativeLayoutShift: perfumeMetrics.cumulativeLayoutShift?.value || 0,
					totalBlockingTime: perfumeMetrics.totalBlockingTime?.value || 0,
					timeToFirstByte: perfumeMetrics.timeToFirstByte?.value || 0,
					regulatoryFrictionDelay: perfumeMetrics.regulatoryFrictionDelay?.value || 0,
					navigationTiming: perfumeMetrics.navigationTiming?.value || null,
					// Store raw data for debugging
					rawMetrics: perfumeMetrics,
					// Add timing information
					collectionTime: Date.now(),
				};
			});

			if (!metrics) {
				await page.waitForTimeout(200);
			}
		}

		// If we still don't have metrics, try one more time with a longer wait
		if (!metrics) {
			await page.waitForTimeout(500);
			metrics = await page.evaluate(() => {
				const perfumeMetrics = window.__perfumeMetrics;
				if (!perfumeMetrics) {
					return null;
				}

				// Extract metrics with fallbacks - be more lenient
				return {
					firstPaint: perfumeMetrics.firstPaint?.value || 0,
					firstContentfulPaint: perfumeMetrics.firstContentfulPaint?.value || 0,
					largestContentfulPaint: perfumeMetrics.largestContentfulPaint?.value || 0,
					firstInputDelay: perfumeMetrics.firstInputDelay?.value || 0,
					cumulativeLayoutShift: perfumeMetrics.cumulativeLayoutShift?.value || 0,
					totalBlockingTime: perfumeMetrics.totalBlockingTime?.value || 0,
					timeToFirstByte: perfumeMetrics.timeToFirstByte?.value || 0,
					regulatoryFrictionDelay: perfumeMetrics.regulatoryFrictionDelay?.value || 0,
					navigationTiming: perfumeMetrics.navigationTiming?.value || null,
					// Store raw data for debugging
					rawMetrics: perfumeMetrics,
					// Add timing information
					collectionTime: Date.now(),
				};
			});
		}

		if (!metrics) {
			console.warn("⚠️ [PERFUME] Timeout waiting for metrics collection");
			// Return default metrics structure
			metrics = {
				firstPaint: 0,
				firstContentfulPaint: 0,
				largestContentfulPaint: 0,
				firstInputDelay: 0,
				cumulativeLayoutShift: 0,
				totalBlockingTime: 0,
				timeToFirstByte: 0,
				regulatoryFrictionDelay: 0,
				navigationTiming: null,
				rawMetrics: {},
				collectionTime: Date.now(),
			};
		}

		this.metrics = metrics;
		console.log("🔍 [PERFUME] Collected metrics:", {
			fp: metrics.firstPaint,
			fcp: metrics.firstContentfulPaint,
			lcp: metrics.largestContentfulPaint,
			fid: metrics.firstInputDelay,
			cls: metrics.cumulativeLayoutShift,
			tbt: metrics.totalBlockingTime,
			ttfb: metrics.timeToFirstByte,
			rfd: metrics.regulatoryFrictionDelay,
		});

		return metrics;
	}

	getMetrics(): PerfumeMetrics | null {
		return this.metrics;
	}

	async cleanup(): Promise<void> {
		this.metrics = null;
		this.isInitialized = false;
	}

	// Helper method to get specific metric value
	getMetricValue(metricName: keyof PerfumeMetrics): number | null {
		if (!this.metrics) {
			return null;
		}
		
		const value = this.metrics[metricName];
		return typeof value === 'number' ? value : null;
	}

	// Helper method to check if metrics are available
	hasMetrics(): boolean {
		return this.metrics !== null;
	}

	// Helper method to get metrics summary
	getMetricsSummary(): {
		coreWebVitals: {
			fcp: number;
			lcp: number;
			fid: number;
			cls: number;
			tbt: number;
		};
		paintMetrics: {
			fp: number;
		};
	} | null {
		if (!this.metrics) {
			return null;
		}

		return {
			coreWebVitals: {
				fcp: this.metrics.firstContentfulPaint,
				lcp: this.metrics.largestContentfulPaint,
				fid: this.metrics.firstInputDelay,
				cls: this.metrics.cumulativeLayoutShift,
				tbt: this.metrics.totalBlockingTime,
			},
			paintMetrics: {
				fp: this.metrics.firstPaint,
			},
		};
	}
}
