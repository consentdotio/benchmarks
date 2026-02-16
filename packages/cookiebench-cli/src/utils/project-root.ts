import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export function findProjectRoot(startDir = process.cwd()): string {
	let currentDir = startDir;

	while (currentDir !== dirname(currentDir)) {
		const hasWorkspaceFile = existsSync(
			join(currentDir, "pnpm-workspace.yaml")
		);
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

	const fallbackPath = join(projectRoot, "benchmarks", appPath);
	if (existsSync(join(fallbackPath, "config.json"))) {
		return fallbackPath;
	}

	throw new Error(
		`Could not resolve benchmark path for "${appPath}". Expected config.json in ${directPath} or ${fallbackPath}.`
	);
}
