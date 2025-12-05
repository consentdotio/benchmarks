// Constants for statistics calculations
const PERCENTILE_95 = 95;
const PERCENTILE_99 = 99;
const DEFAULT_TRIM_PERCENT = 10;
const PERCENTAGE_CONVERSION = 100;
const STABILITY_THRESHOLD = 15;

/**
 * Calculate statistical metrics for an array of numbers (inspired by Mitata's approach)
 */
export function calculateStatistics(values: number[]): {
	mean: number;
	median: number;
	stddev: number;
	min: number;
	max: number;
	p95: number;
	p99: number;
} {
	if (values.length === 0) {
		return {
			mean: 0,
			median: 0,
			stddev: 0,
			min: 0,
			max: 0,
			p95: 0,
			p99: 0,
		};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const variance =
		values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
	const stddev = Math.sqrt(variance);
	const median = getMedian(sorted);
	const p95 = getPercentile(sorted, PERCENTILE_95);
	const p99 = getPercentile(sorted, PERCENTILE_99);

	const lastIndex = sorted.length - 1;
	const maxValue = lastIndex >= 0 ? sorted[lastIndex] : 0;
	return {
		mean,
		median,
		stddev,
		min: sorted[0],
		max: maxValue,
		p95,
		p99,
	};
}

/**
 * Calculate median from sorted array
 */
function getMedian(sorted: number[]): number {
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
}

/**
 * Calculate percentile from sorted array
 */
function getPercentile(sorted: number[], percentile: number): number {
	const index = (percentile / PERCENTAGE_CONVERSION) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;

	if (lower === upper) {
		return sorted[lower];
	}

	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate robust average using trimmed mean (removes outliers)
 */
export function calculateTrimmedMean(
	values: number[],
	trimPercent = DEFAULT_TRIM_PERCENT
): number {
	if (values.length === 0) {
		return 0;
	}

	if (values.length <= 2) {
		return values.reduce((a, b) => a + b, 0) / values.length;
	}

	const sorted = [...values].sort((a, b) => a - b);
	const trimCount = Math.floor(
		(values.length * trimPercent) / PERCENTAGE_CONVERSION
	);
	const trimmed = sorted.slice(trimCount, values.length - trimCount);

	if (trimmed.length === 0) {
		return sorted[Math.floor(sorted.length / 2)];
	}

	return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

/**
 * Calculate coefficient of variation (CV) as a measure of stability
 */
export function calculateCoefficientOfVariation(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}

	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const variance =
		values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
	const stddev = Math.sqrt(variance);

	if (mean === 0) {
		return 0;
	}

	return (stddev / mean) * PERCENTAGE_CONVERSION;
}

/**
 * Check if values are statistically stable (low coefficient of variation)
 */
export function isStable(
	values: number[],
	threshold = STABILITY_THRESHOLD
): boolean {
	const cv = calculateCoefficientOfVariation(values);
	return cv < threshold;
}
