/**
 * Detect and return the available package manager
 * @returns Package manager command and args
 */
export async function getPackageManager(): Promise<
	| {
			command: string;
			args: string[];
	  }
	| undefined
> {
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
}


