import {
	BYTES_TO_KB,
	ONE_SECOND,
	PERCENTAGE_MULTIPLIER,
	TTI_BUFFER_MS,
} from "@consentio/shared";

export const BENCHMARK_CONSTANTS = {
	DETECTION_INTERVAL: ONE_SECOND, // Wait 1 second between detection attempts
	MAX_DETECTION_TIME: 15_000, // Increased to 15 seconds to accommodate longer waits
	INITIAL_DETECTION_DELAY: 500, // Wait 500ms before starting
	TTI_BUFFER: TTI_BUFFER_MS,
	METRICS_TIMEOUT: 10_000,
	METRICS_RETRY_TIMEOUT: 5000,
	BYTES_TO_KB, // Convert bytes to kilobytes
	PERFUME_METRICS_WAIT: ONE_SECOND, // Wait 1 second for Perfume.js metrics to be collected
	BANNER_POLL_INTERVAL: 100, // Poll for banner visibility every 100ms
	BANNER_DETECTION_TIMEOUT: 10_000, // Stop checking for banner after 10 seconds
	PERCENTAGE_MULTIPLIER, // Convert decimal to percentage
} as const;

export const BUNDLE_TYPES = {
	IIFE: "iife",
	ESM: "esm",
	CJS: "cjs",
	BUNDLED: "bundled",
} as const;
