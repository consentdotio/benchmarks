export const BENCHMARK_CONSTANTS = {
	DETECTION_INTERVAL: 1000, // Wait 1 second between detection attempts
	MAX_DETECTION_TIME: 15_000, // Increased to 15 seconds to accommodate longer waits
	INITIAL_DETECTION_DELAY: 500, // Wait 500ms before starting
	TTI_BUFFER: 1000,
	METRICS_TIMEOUT: 10_000,
	METRICS_RETRY_TIMEOUT: 5000,
	BYTES_TO_KB: 1024, // Convert bytes to kilobytes
	PERFUME_METRICS_WAIT: 1000, // Wait 1 second for Perfume.js metrics to be collected
	BANNER_POLL_INTERVAL: 100, // Poll for banner visibility every 100ms
	BANNER_DETECTION_TIMEOUT: 10_000, // Stop checking for banner after 10 seconds
	PERCENTAGE_MULTIPLIER: 100, // Convert decimal to percentage
} as const;

export const BUNDLE_TYPES = {
	IIFE: "iffe",
	ESM: "esm",
	CJS: "cjs",
	BUNDLED: "bundled",
} as const;
