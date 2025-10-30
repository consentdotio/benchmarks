import type { Page } from '@playwright/test';
import type { PerfumeMetrics, WindowWithPerfumeMetrics } from './types';
import type { Logger } from '@c15t/logger';

export class PerfumeCollector {
	private logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
	}
	/**
	 * Setup Perfume.js in the browser to collect performance metrics
	 */
	async setupPerfume(page: Page): Promise<void> {
		await page.addInitScript(() => {
			// Initialize storage object
			const win = window as WindowWithPerfumeMetrics;
			win.__perfumeMetrics = {};

			// Load Perfume.js from CDN
			const script = document.createElement('script');
			script.src = 'https://unpkg.com/perfume.js@9.4.0/dist/perfume.umd.min.js';
			script.onload = () => {
				console.log('🔍 [PERFUME] Perfume.js loaded from CDN');

				// Initialize Perfume with analytics tracker
				// @ts-ignore - Perfume is loaded from CDN
				new window.Perfume({
					analyticsTracker: ({
						metricName,
						data,
						rating,
						attribution,
						navigatorInformation,
					}: {
						metricName: string;
						data: number;
						rating: string;
						attribution?: unknown;
						navigatorInformation?: {
							deviceMemory?: number;
							hardwareConcurrency?: number;
							isLowEndDevice?: boolean;
							isLowEndExperience?: boolean;
							serviceWorkerStatus?: string;
						};
					}) => {
						const win = window as WindowWithPerfumeMetrics;
						const metrics = win.__perfumeMetrics;

						// Store metric with all available data
						if (metrics) {
							metrics[metricName] = {
								value: data,
								rating,
								attribution,
								navigatorInformation,
							};
						}

						console.log(
							`🔍 [PERFUME] ${metricName}:`,
							data,
							`(${rating})`,
							attribution
						);
					},
				});
			};

			// Handle script load errors
			script.onerror = () => {
				console.error('🔍 [PERFUME] Failed to load Perfume.js from CDN');
			};

			document.head.appendChild(script);
		});
	}

	/**
	 * Collect all metrics from Perfume.js
	 */
	async collectMetrics(page: Page): Promise<PerfumeMetrics | null> {
		try {
			// Wait a bit for metrics to be collected
			await page.waitForTimeout(1000);

			const rawMetrics = await page.evaluate(() => {
				const win = window as WindowWithPerfumeMetrics;
				const perfumeData = win.__perfumeMetrics;
				return perfumeData || {};
			});

			this.logger.debug('Raw Perfume metrics:', rawMetrics);

			// Get navigation timing separately
			const navigationTiming = await page.evaluate(() => {
				const timing = performance.timing;
				const navigationStart = timing.navigationStart;

				return {
					timeToFirstByte: timing.responseStart - navigationStart,
					domInteractive: timing.domInteractive - navigationStart,
					domContentLoadedEventStart:
						timing.domContentLoadedEventStart - navigationStart,
					domContentLoadedEventEnd:
						timing.domContentLoadedEventEnd - navigationStart,
					domComplete: timing.domComplete - navigationStart,
					loadEventStart: timing.loadEventStart - navigationStart,
					loadEventEnd: timing.loadEventEnd - navigationStart,
				};
			});

			// Get network information
			const networkInformation = await page.evaluate(() => {
				// @ts-ignore - navigator.connection is experimental
				const connection = navigator.connection || navigator.mozConnection;
				if (connection) {
					return {
						effectiveType: connection.effectiveType || 'unknown',
						downlink: connection.downlink || 0,
						rtt: connection.rtt || 0,
						saveData: connection.saveData || false,
					};
				}
				return undefined;
			});

			// Convert raw metrics to PerfumeMetrics format
			const metrics: PerfumeMetrics = {
				firstPaint: rawMetrics.FP?.value || 0,
				firstContentfulPaint: rawMetrics.FCP?.value || 0,
				largestContentfulPaint: rawMetrics.LCP?.value || 0,
				cumulativeLayoutShift: rawMetrics.CLS?.value || 0,
				totalBlockingTime: rawMetrics.TBT?.value || 0,
				firstInputDelay: rawMetrics.FID?.value || null,
				interactionToNextPaint: rawMetrics.INP?.value || null,
				timeToFirstByte: rawMetrics.TTFB?.value || navigationTiming.timeToFirstByte,
				navigationTiming,
				networkInformation,
			};

			return metrics;
		} catch (error) {
			this.logger.error('Failed to collect Perfume metrics:', error);
			return null;
		}
	}
}

