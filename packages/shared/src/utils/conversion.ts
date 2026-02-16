import { KILOBYTE, PERCENTAGE_MULTIPLIER } from "../constants";

/**
 * Convert bytes to kilobytes
 * @param bytes - Size in bytes
 * @returns Size in kilobytes
 */
export function bytesToKB(bytes: number): number {
	return bytes / KILOBYTE;
}

/**
 * Format bytes to human-readable string with appropriate units
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.50 KB", "2.00 MB")
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return "0 bytes";
	}
	const safeBytes = Math.max(0, bytes);
	const sizes = ["bytes", "KB", "MB", "GB", "TB", "PB"];
	const rawIndex = Math.floor(Math.log(safeBytes) / Math.log(KILOBYTE));
	const unitIndex = Math.max(0, Math.min(rawIndex, sizes.length - 1));
	const normalizedValue = safeBytes / KILOBYTE ** unitIndex;
	const safeValue = Number.isFinite(normalizedValue) ? normalizedValue : 0;
	return `${Number.parseFloat(safeValue.toFixed(2))} ${sizes[unitIndex]}`;
}

/**
 * Convert decimal to percentage
 * @param decimal - Decimal value (e.g., 0.75)
 * @returns Percentage value (e.g., 75)
 */
export function decimalToPercentage(decimal: number): number {
	return decimal * PERCENTAGE_MULTIPLIER;
}

/**
 * Convert percentage to decimal
 * @param percentage - Percentage value (e.g., 75)
 * @returns Decimal value (e.g., 0.75)
 */
export function percentageToDecimal(percentage: number): number {
	return percentage / PERCENTAGE_MULTIPLIER;
}
