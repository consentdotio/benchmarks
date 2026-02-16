import { BYTES_TO_KB, KILOBYTE, PERCENTAGE_MULTIPLIER } from "../constants";

/**
 * Convert bytes to kilobytes
 * @param bytes - Size in bytes
 * @returns Size in kilobytes
 */
export function bytesToKB(bytes: number): number {
	return bytes / BYTES_TO_KB;
}

/**
 * Format bytes to human-readable string with appropriate units
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.50 KB", "2.00 MB")
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 bytes";
	}
	const k = KILOBYTE;
	const sizes = ["bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
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
