import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "@consentio/benchmark";

export const ONE_SECOND = 1000;
export function readConfig(configPath?: string): Config | null {
	try {
		const path = configPath || join(process.cwd(), "config.json");
		const configContent = readFileSync(path, "utf-8");
		return JSON.parse(configContent) as Config;
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: console error is needed for debugging
		console.error("Failed to read config.json:", error);
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
	requiresScriptArgSeparator: boolean;
}> {
	function parsePackageManager(packageManager: string | undefined): {
		command: string;
		args: string[];
		requiresScriptArgSeparator: boolean;
	} | null {
		if (!packageManager) {
			return null;
		}
		if (packageManager.startsWith("pnpm@")) {
			return {
				command: "pnpm",
				args: [],
				requiresScriptArgSeparator: false,
			};
		}
		if (packageManager.startsWith("yarn@")) {
			return {
				command: "yarn",
				args: [],
				requiresScriptArgSeparator: false,
			};
		}
		if (packageManager.startsWith("npm@")) {
			return {
				command: "npm",
				args: ["run"],
				requiresScriptArgSeparator: true,
			};
		}
		return null;
	}

	let currentDir = process.cwd();
	while (true) {
		if (existsSync(join(currentDir, "pnpm-lock.yaml"))) {
			return {
				command: "pnpm",
				args: [],
				requiresScriptArgSeparator: false,
			};
		}
		if (existsSync(join(currentDir, "yarn.lock"))) {
			return {
				command: "yarn",
				args: [],
				requiresScriptArgSeparator: false,
			};
		}
		if (existsSync(join(currentDir, "package-lock.json"))) {
			return {
				command: "npm",
				args: ["run"],
				requiresScriptArgSeparator: true,
			};
		}

		const packageJsonPath = join(currentDir, "package.json");
		if (existsSync(packageJsonPath)) {
			try {
				const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
					packageManager?: string;
				};
				const detected = parsePackageManager(pkg.packageManager);
				if (detected) {
					return detected;
				}
			} catch {
				// Ignore malformed package.json and continue fallback detection.
			}
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	try {
		const { execSync } = await import("node:child_process");
		const output = execSync("pnpm -v", { encoding: "utf-8" });
		if (output) {
			return {
				command: "pnpm",
				args: [],
				requiresScriptArgSeparator: false,
			};
		}
	} catch {
		try {
			const { execSync } = await import("node:child_process");
			const output = execSync("yarn -v", { encoding: "utf-8" });
			if (output) {
				return {
					command: "yarn",
					args: [],
					requiresScriptArgSeparator: false,
				};
			}
		} catch {
			try {
				const { execSync } = await import("node:child_process");
				const output = execSync("npm -v", { encoding: "utf-8" });
				if (output) {
					return {
						command: "npm",
						args: ["run"],
						requiresScriptArgSeparator: true,
					};
				}
			} catch {
				// Default to npm if no package manager is found
				return {
					command: "npm",
					args: ["run"],
					requiresScriptArgSeparator: true,
				};
			}
		}
	}
	// Default to npm if no package manager is found
	return {
		command: "npm",
		args: ["run"],
		requiresScriptArgSeparator: true,
	};
}
