import {
	formatBytes as formatBytesShared,
	formatTime as formatTimeShared,
	getPackageManager as getPackageManagerShared,
	HALF_SECOND,
	KILOBYTE,
	ONE_SECOND,
	PERCENTAGE_DIVISOR,
	PERCENTAGE_MULTIPLIER,
	readConfig as readConfigShared,
} from "@consentio/shared";
import type { Config } from "../types";

// Re-export local constants
// biome-ignore lint/performance/noBarrelFile: this is a barrel file
export * from "./constants";

// Re-export shared constants
export {
	HALF_SECOND,
	KILOBYTE,
	ONE_SECOND,
	PERCENTAGE_DIVISOR,
	PERCENTAGE_MULTIPLIER,
};

// Re-export shared utilities
export {
	formatBytesShared as formatBytes,
	formatTimeShared as formatTime,
	getPackageManagerShared as getPackageManager,
};

export function readConfig(configPath?: string): Config | null {
	return readConfigShared<Config>(configPath);
}

