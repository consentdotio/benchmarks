import type { Page } from "@playwright/test";
import type { PerfumeMetrics } from "./types";

// Extend Window interface for our metrics
declare global {
	interface Window {
		__nativeMetrics?: Record<string, {
			value: number;
			timestamp: number;
		}>;
	}
}

export class NativePerformanceCollector {
	private metrics: PerfumeMetrics | null = null;
	private isInitialized = false;

	async initialize(page: Page): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		// Inject native performance monitoring script
		await page.evaluate(() => {
			// Initialize metrics storage
			if (!window.__nativeMetrics) {
				window.__nativeMetrics = {};
			}

			// Helper function to store metrics
			const storeMetric = (name: string, value: number) => {
				window.__nativeMetrics![name] = {
					value,
					timestamp: Date.now(),
				};
				console.log(`🔍 [NATIVE-PERF] ${name}:`, value);
			};

			// Monitor First Paint and First Contentful Paint
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.name === 'first-paint') {
						storeMetric('firstPaint', entry.startTime);
					} else if (entry.name === 'first-contentful-paint') {
						storeMetric('firstContentfulPaint', entry.startTime);
					}
				}
			});

			observer.observe({ entryTypes: ['paint'] });

			// Monitor Largest Contentful Paint
			const lcpObserver = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				const lastEntry = entries[entries.length - 1];
				storeMetric('largestContentfulPaint', lastEntry.startTime);
			});

			lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

			// Monitor Cumulative Layout Shift
			let clsValue = 0;
			const clsObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (!(entry as any).hadRecentInput) {
						clsValue += (entry as any).value;
					}
				}
				storeMetric('cumulativeLayoutShift', clsValue);
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
				storeMetric('totalBlockingTime', totalBlockingTime);
			});

			tbtObserver.observe({ entryTypes: ['longtask'] });

			// Monitor First Input Delay
			let firstInputDelay = 0;
			const fidObserver = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.entryType === 'first-input') {
						firstInputDelay = (entry as any).processingStart - entry.startTime;
						storeMetric('firstInputDelay', firstInputDelay);
					}
				}
			});

			fidObserver.observe({ entryTypes: ['first-input'] });

			// Store navigation timing
			const navigationTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
			if (navigationTiming) {
				storeMetric('navigationTiming', navigationTiming.loadEventEnd - navigationTiming.fetchStart);
			}

			console.log("🔍 [NATIVE-PERF] Initialized native performance monitoring");
		});

		this.isInitialized = true;
		console.log("🔍 [NATIVE-PERF] Initialized native performance metrics collection");
	}

	async collectMetrics(page: Page, timeout = 10000): Promise<PerfumeMetrics> {
		await this.initialize(page);

		// Wait for metrics to be collected
		const startTime = Date.now();
		let metrics: PerfumeMetrics | null = null;

		while (Date.now() - startTime < timeout && !metrics) {
			metrics = await page.evaluate(() => {
				const nativeMetrics = window.__nativeMetrics;
				if (!nativeMetrics) {
					return null;
				}

				// Check if we have the essential metrics
				const hasEssentialMetrics = 
					nativeMetrics.firstContentfulPaint &&
					nativeMetrics.largestContentfulPaint &&
					nativeMetrics.cumulativeLayoutShift !== undefined;

				if (!hasEssentialMetrics) {
					return null;
				}

				// Extract metrics with fallbacks
				return {
					firstPaint: nativeMetrics.firstPaint?.value || 0,
					firstContentfulPaint: nativeMetrics.firstContentfulPaint?.value || 0,
					largestContentfulPaint: nativeMetrics.largestContentfulPaint?.value || 0,
					firstInputDelay: nativeMetrics.firstInputDelay?.value || 0,
					cumulativeLayoutShift: nativeMetrics.cumulativeLayoutShift?.value || 0,
					totalBlockingTime: nativeMetrics.totalBlockingTime?.value || 0,
					timeToFirstByte: nativeMetrics.timeToFirstByte?.value || 0,
					regulatoryFrictionDelay: nativeMetrics.regulatoryFrictionDelay?.value || 0,
					navigationTiming: nativeMetrics.navigationTiming?.value || null,
					// Store raw data for debugging
					rawMetrics: nativeMetrics,
					// Add timing information
					collectionTime: Date.now(),
				};
			});

			if (!metrics) {
				await page.waitForTimeout(100);
			}
		}

		if (!metrics) {
			console.warn("⚠️ [NATIVE-PERF] Timeout waiting for metrics collection");
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
		console.log("🔍 [NATIVE-PERF] Collected metrics:", {
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
