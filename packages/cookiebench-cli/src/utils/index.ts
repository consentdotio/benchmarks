/** biome-ignore-all lint/performance/noBarrelFile: this is a barrel file */
import { readConfig as readConfigShared } from "@consentio/shared";
import type { Config } from "../types";

// Re-export shared constants
// Re-export shared utilities
export {
	formatBytes,
	formatTime,
	getPackageManager,
	HALF_SECOND,
	KILOBYTE,
	ONE_SECOND,
	PERCENTAGE_DIVISOR,
	PERCENTAGE_MULTIPLIER,
} from "@consentio/shared";
// Re-export local constants

export * from "./constants";

export function readConfig(configPath?: string): Config | null {
	return readConfigShared<Config>(configPath);
}
