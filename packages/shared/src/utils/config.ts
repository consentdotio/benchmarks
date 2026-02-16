import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generic config type - packages should define their own specific config types
 */
export type BaseConfig = Record<string, unknown>;

/**
 * Read and parse a JSON config file
 *
 * Note: `readConfig` only applies the generic `T` type at compile time.
 * It does not validate JSON structure at runtime. If strict runtime safety is
 * required, validate the parsed value for the provided `configPath` before
 * using the returned value.
 *
 * @param configPath - Optional path to config file, defaults to ./config.json
 * @returns Parsed config object or null if file cannot be read
 */
export function readConfig<T extends BaseConfig = BaseConfig>(
	configPath?: string
): T | null {
	try {
		const resolvedPath = configPath || join(process.cwd(), "config.json");
		const configContent = readFileSync(resolvedPath, "utf-8");
		return JSON.parse(configContent) as T;
	} catch (error) {
		process.stderr.write(
			`Failed to read config at ${
				configPath || join(process.cwd(), "config.json")
			}: ${error instanceof Error ? error.message : String(error)}\n`
		);
		return null;
	}
}
