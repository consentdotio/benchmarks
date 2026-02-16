import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type PackageManagerInfo = {
	command: string;
	args: string[];
};

function fromName(name: string): PackageManagerInfo | null {
	if (name.startsWith("pnpm")) {
		return { command: "pnpm", args: [] };
	}
	if (name.startsWith("yarn")) {
		return { command: "yarn", args: [] };
	}
	if (name.startsWith("npm")) {
		return { command: "npm", args: ["run"] };
	}
	return null;
}

/**
 * Detect and return the available package manager
 * @returns Package manager command and args
 */
export function getPackageManager(): PackageManagerInfo {
	const userAgent = process.env.npm_config_user_agent || "";
	const userAgentResult = fromName(userAgent);
	if (userAgentResult) {
		return userAgentResult;
	}

	try {
		const rootPackageJsonPath = join(process.cwd(), "package.json");
		if (existsSync(rootPackageJsonPath)) {
			const packageJson = JSON.parse(
				readFileSync(rootPackageJsonPath, "utf-8")
			) as {
				packageManager?: string;
			};
			if (packageJson.packageManager) {
				const packageManagerResult = fromName(packageJson.packageManager);
				if (packageManagerResult) {
					return packageManagerResult;
				}
			}
		}
	} catch {
		// Ignore parse/read errors and continue fallback detection
	}

	if (existsSync(join(process.cwd(), "pnpm-lock.yaml"))) {
		return { command: "pnpm", args: [] };
	}
	if (existsSync(join(process.cwd(), "yarn.lock"))) {
		return { command: "yarn", args: [] };
	}

	try {
		const output = execSync("npm -v", { encoding: "utf-8" });
		if (output) {
			return { command: "npm", args: ["run"] };
		}
	} catch {
		try {
			const output = execSync("yarn -v", { encoding: "utf-8" });
			if (output) {
				return { command: "yarn", args: [] };
			}
		} catch {
			try {
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
	// Fallback if all checks succeed but output is falsy (shouldn't happen in practice)
	return { command: "npm", args: ["run"] };
}
