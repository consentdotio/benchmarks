export const BENCHMARK_CONSTANTS = {
  DETECTION_INTERVAL: 100,
  MAX_DETECTION_TIME: 10000, // Back to 10 seconds
  INITIAL_DETECTION_DELAY: 100, // Back to 100ms
  TTI_BUFFER: 1000,
  METRICS_TIMEOUT: 10000,
  METRICS_RETRY_TIMEOUT: 5000,
} as const;

export const BUNDLE_TYPES = {
  IIFE: "iffe",
  ESM: "esm",
  CJS: "cjs",
  BUNDLED: "bundled",
} as const;
