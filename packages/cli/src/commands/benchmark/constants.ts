export const BENCHMARK_CONSTANTS = {
  DETECTION_INTERVAL: 1000, // Wait 1 second between detection attempts
  MAX_DETECTION_TIME: 15000, // Increased to 15 seconds to accommodate longer waits
  INITIAL_DETECTION_DELAY: 500, // Wait 500ms before starting
  TTI_BUFFER: 1000,
  METRICS_TIMEOUT: 10000,
  METRICS_RETRY_TIMEOUT: 5000,
} as const;

export const BUNDLE_TYPES = {
  IIFE: "iife",
  ESM: "esm",
  CJS: "cjs",
  BUNDLED: "bundled",
} as const;
