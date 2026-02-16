import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export function findProjectRoot(startDir = process.cwd()): string {
	let currentDir = startDir;

	while (currentDir !== dirname(currentDir)) {
		const hasWorkspaceFile = existsSync(join(currentDir, "pnpm-workspace.yaml"));
		const hasBenchmarksDir = existsSync(join(currentDir, "benchmarks"));
		const hasPackagesDir = existsSync(join(currentDir, "packages"));

		if (hasWorkspaceFile && hasBenchmarksDir && hasPackagesDir) {
			return currentDir;
		}

		currentDir = dirname(currentDir);
	}

	return startDir;
}

export function resolveBenchmarkPath(
	projectRoot: string,
	appPath: string
): string {
	if (isAbsolute(appPath)) {
		return appPath;
	}

	const directPath = join(projectRoot, appPath);
	if (existsSync(join(directPath, "config.json"))) {
		return directPath;
	}

	return join(projectRoot, "benchmarks", appPath);
}
