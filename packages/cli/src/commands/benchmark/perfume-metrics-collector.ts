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
	}
}

export class PerfumeMetricsCollector {
	private metrics: PerfumeMetrics | null = null;
	private isInitialized = false;

	async initialize(page: Page): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Initialize Perfume.js in the browser context
		await page.evaluate(() => {
			// Initialize metrics storage
			if (!window.__perfumeMetrics) {
				window.__perfumeMetrics = {};
			}

			// Create a simple Perfume-like implementation using native APIs
			window.Perfume = {
				initPerfume: (config: any) => {
					console.log("🔍 [PERFUME] Initializing performance monitoring...");
					
					// Monitor First Paint and First Contentful Paint
					const observer = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.name === 'first-paint') {
								window.__perfumeMetrics!['firstPaint'] = {
									value: entry.startTime,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstPaint:`, entry.startTime);
							} else if (entry.name === 'first-contentful-paint') {
								window.__perfumeMetrics!['firstContentfulPaint'] = {
									value: entry.startTime,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstContentfulPaint:`, entry.startTime);
							}
						}
					});

					try {
						observer.observe({ entryTypes: ['paint'] });
					} catch (error) {
						console.warn('🔍 [PERFUME] Paint observer not supported, using fallback');
						// Fallback: try to get paint metrics from existing entries
						const paintEntries = performance.getEntriesByType('paint');
						for (const entry of paintEntries) {
							if (entry.name === 'first-paint') {
								window.__perfumeMetrics!['firstPaint'] = {
									value: entry.startTime,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstPaint (fallback):`, entry.startTime);
							} else if (entry.name === 'first-contentful-paint') {
								window.__perfumeMetrics!['firstContentfulPaint'] = {
									value: entry.startTime,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstContentfulPaint (fallback):`, entry.startTime);
							}
						}
					}

					// Monitor Largest Contentful Paint
					const lcpObserver = new PerformanceObserver((list) => {
						const entries = list.getEntries();
						const lastEntry = entries[entries.length - 1];
						window.__perfumeMetrics!['largestContentfulPaint'] = {
							value: lastEntry.startTime,
							timestamp: Date.now(),
						};
						console.log(`🔍 [PERFUME] largestContentfulPaint:`, lastEntry.startTime);
					});

					try {
						lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
					} catch (error) {
						console.warn('🔍 [PERFUME] LCP observer not supported, using fallback');
						// Fallback: try to get LCP from existing entries
						const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
						if (lcpEntries.length > 0) {
							const lastEntry = lcpEntries[lcpEntries.length - 1];
							window.__perfumeMetrics!['largestContentfulPaint'] = {
								value: lastEntry.startTime,
								timestamp: Date.now(),
							};
							console.log(`🔍 [PERFUME] largestContentfulPaint (fallback):`, lastEntry.startTime);
						}
					}

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

					// Monitor Regulatory Friction Delay (RFD) - the learned anticipatory latency
					// This measures the delay between FCP and when users feel safe to interact
					// due to cookie banner stabilization concerns
					const rfdObserver = new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							if (entry.entryType === 'first-input') {
								// RFD is the delay between FCP and first meaningful user interaction
								// This captures the learned hesitation behavior
								const fcp = window.__perfumeMetrics?.firstContentfulPaint?.value || 0;
								const fid = (entry as any).processingStart - entry.startTime;
								const rfd = entry.startTime - fcp;
								
								window.__perfumeMetrics!['regulatoryFrictionDelay'] = {
									value: rfd,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] regulatoryFrictionDelay (RFD):`, rfd);
							}
						}
					});

					rfdObserver.observe({ entryTypes: ['first-input'] });

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

					// Check for any existing paint metrics that might have been missed
					setTimeout(() => {
						const paintEntries = performance.getEntriesByType('paint');
						for (const entry of paintEntries) {
							if (entry.name === 'first-paint' && !window.__perfumeMetrics!['firstPaint']) {
								window.__perfumeMetrics!['firstPaint'] = {
									value: entry.startTime,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstPaint (delayed):`, entry.startTime);
							} else if (entry.name === 'first-contentful-paint' && !window.__perfumeMetrics!['firstContentfulPaint']) {
								window.__perfumeMetrics!['firstContentfulPaint'] = {
									value: entry.startTime,
									timestamp: Date.now(),
								};
								console.log(`🔍 [PERFUME] firstContentfulPaint (delayed):`, entry.startTime);
							}
						}

						const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
						if (lcpEntries.length > 0 && !window.__perfumeMetrics!['largestContentfulPaint']) {
							const lastEntry = lcpEntries[lcpEntries.length - 1];
							window.__perfumeMetrics!['largestContentfulPaint'] = {
								value: lastEntry.startTime,
								timestamp: Date.now(),
							};
							console.log(`🔍 [PERFUME] largestContentfulPaint (delayed):`, lastEntry.startTime);
						}
					}, 100);
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
		});

		this.isInitialized = true;
		console.log("🔍 [PERFUME] Initialized Perfume.js metrics collection");
	}

	async collectMetrics(page: Page, timeout = 10000): Promise<PerfumeMetrics> {
		await this.initialize(page);

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
