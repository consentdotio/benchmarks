// Main runner
// biome-ignore lint/performance/noBarrelFile: this is a barrel file
export { BenchmarkRunner } from "./benchmark-runner";
// Performance aggregation
export { PerformanceAggregator } from "./performance-aggregator";
// Server management
export { buildAndServeNextApp, cleanupServer } from "./server";
// Types
export type {
	BenchmarkDetails,
	BenchmarkResult,
	BundleStrategy,
	Config,
	CookieBannerConfig,
	CookieBannerData,
	CookieBannerMetrics,
	CoreWebVitals,
	NetworkMetrics,
	NetworkRequest,
	ResourceTimingData,
	ServerInfo,
} from "./types";
// Statistics utilities
export {
	calculateCoefficientOfVariation,
	calculateStatistics,
	calculateTrimmedMean,
	isStable,
} from "./statistics";
// Utilities
export { formatTime, getPackageManager, readConfig } from "./utils";
