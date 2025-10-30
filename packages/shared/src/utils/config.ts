import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generic config type - packages should define their own specific config types
 */
export type BaseConfig = Record<string, unknown>;

/**
 * Read and parse a JSON config file
 * @param configPath - Optional path to config file, defaults to ./config.json
 * @returns Parsed config object or null if file cannot be read
 */
export function readConfig<T extends BaseConfig = BaseConfig>(
	configPath?: string
): T | null {
	try {
		const path = configPath || join(process.cwd(), "config.json");
		const configContent = readFileSync(path, "utf-8");
		return JSON.parse(configContent) as T;
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: console error is needed for debugging
		console.error("Failed to read config.json:", error);
		return null;
	}
}

