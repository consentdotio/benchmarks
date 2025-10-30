import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../types";
import { ONE_SECOND } from "./constants";

// Re-export constants for convenience
// biome-ignore lint/performance/noBarrelFile: this is a barrel file
export * from "./constants";

export function readConfig(): Config | null {
	try {
		const configPath = join(process.cwd(), "config.json");
		const configContent = readFileSync(configPath, "utf-8");
		return JSON.parse(configContent) as Config;
	} catch {
		// Error will be logged by caller
		return null;
	}
}

export function formatTime(ms: number): string {
	if (ms < ONE_SECOND) {
		return `${ms.toFixed(0)}ms`;
	}
	return `${(ms / ONE_SECOND).toFixed(2)}s`;
}

export async function getPackageManager(): Promise<{
	command: string;
	args: string[];
}> {
	try {
		const { execSync } = await import("node:child_process");
		const output = execSync("npm -v", { encoding: "utf-8" });
		if (output) {
			return { command: "npm", args: ["run"] };
		}
	} catch {
		try {
			const { execSync } = await import("node:child_process");
			const output = execSync("yarn -v", { encoding: "utf-8" });
			if (output) {
				return { command: "yarn", args: [] };
			}
		} catch {
			try {
				const { execSync } = await import("node:child_process");
				const output = execSync("pnpm -v", { encoding: "utf-8" });
				if (output) {
					return { command: "pnpm", args: [] };
				}
			} catch {
				// Default to npm if no package manager is found
				return { command: "npm", args: ["run"] };
			}
		}
	}
	// Default to npm if no package manager is found
	return { command: "npm", args: ["run"] };
}
