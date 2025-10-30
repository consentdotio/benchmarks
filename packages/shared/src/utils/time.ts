import { ONE_SECOND } from "../constants";

/**
 * Format milliseconds to human-readable time string
 * @param ms - Time in milliseconds
 * @returns Formatted time string (e.g., "150ms" or "1.50s")
 */
export function formatTime(ms: number): string {
	if (ms < ONE_SECOND) {
		return `${ms.toFixed(0)}ms`;
	}
	return `${(ms / ONE_SECOND).toFixed(2)}s`;
}

