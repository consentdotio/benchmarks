import {
	BYTES_TO_KB,
	ONE_SECOND,
	PERCENTAGE_MULTIPLIER,
	TTI_BUFFER_MS,
} from "@consentio/shared";

/**
 * Benchmark constants used throughout the measurement system.
 *
 * These constants define timing windows, thresholds, and intervals for
 * cookie banner detection and metrics collection. All values are measured
 * in milliseconds unless otherwise specified.
 *
 * @see METHODOLOGY.md for detailed explanation of measurement approach
 */
export const BENCHMARK_CONSTANTS = {
	/**
	 * Wait 1 second between detection attempts when banner is not found immediately.
	 * Prevents excessive polling while ensuring we catch dynamically loaded banners.
	 */
	DETECTION_INTERVAL: ONE_SECOND, // Wait 1 second between detection attempts
	/**
	 * Maximum time to wait for banner detection before giving up.
	 * Increased to 15 seconds to accommodate longer waits for async-loaded banners.
	 */
	MAX_DETECTION_TIME: 15_000, // Increased to 15 seconds to accommodate longer waits
	/**
	 * Initial delay before starting banner detection.
	 * Allows page to start loading before we begin checking for banner.
	 */
	INITIAL_DETECTION_DELAY: 500, // Wait 500ms before starting
	/**
	 * Buffer time added to Time to Interactive calculations.
	 * Ensures page is truly interactive before recording TTI.
	 */
	TTI_BUFFER: TTI_BUFFER_MS,
	/**
	 * Timeout for collecting performance metrics from Perfume.js.
	 * Some metrics may take time to be reported by the browser.
	 */
	METRICS_TIMEOUT: 10_000,
	/**
	 * Retry timeout for metrics collection failures.
	 * Allows retry attempts if initial collection fails.
	 */
	METRICS_RETRY_TIMEOUT: 5000,
	/**
	 * Conversion factor: bytes to kilobytes.
	 * Used for displaying resource sizes in KB.
	 */
	BYTES_TO_KB, // Convert bytes to kilobytes
	/**
	 * Wait time for Perfume.js metrics to be collected.
	 * Perfume.js reports metrics asynchronously, so we wait before collection.
	 */
	PERFUME_METRICS_WAIT: ONE_SECOND, // Wait 1 second for Perfume.js metrics to be collected
	/**
	 * Polling interval for banner visibility detection.
	 * Checks every 100ms for banner appearance/visibility changes.
	 * Lower values = more accurate but more CPU usage.
	 */
	BANNER_POLL_INTERVAL: 100, // Poll for banner visibility every 100ms
	/**
	 * Timeout for banner detection polling.
	 * Stops checking for banner after 10 seconds to prevent infinite loops.
	 */
	BANNER_DETECTION_TIMEOUT: 10_000, // Stop checking for banner after 10 seconds
	/**
	 * Multiplier for converting decimal ratios to percentages.
	 * Used for viewport coverage calculations (0.125 -> 12.5%).
	 */
	PERCENTAGE_MULTIPLIER, // Convert decimal to percentage
} as const;

export const BUNDLE_TYPES = {
	IIFE: "iife",
	ESM: "esm",
	CJS: "cjs",
	BUNDLED: "bundled",
} as const;
