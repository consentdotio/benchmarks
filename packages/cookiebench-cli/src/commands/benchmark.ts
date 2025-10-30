import { writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';
import {
	BenchmarkRunner,
	buildAndServeNextApp,
	cleanupServer,
	readConfig,
	type ServerInfo,
} from '@consentio/runner';
import { calculateScores, printScores, type CliLogger } from '../utils';

/**
 * Find all benchmark directories
 */
async function findBenchmarkDirs(logger: CliLogger): Promise<string[]> {
	const benchmarksDir = 'benchmarks';
	try {
		const entries = await readdir(benchmarksDir, { withFileTypes: true });
		const dirs = entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
			.map((entry) => entry.name);
		return dirs;
	} catch (error) {
		logger.debug('Failed to read benchmarks directory:', error);
		return [];
	}
}

/**
 * Run a single benchmark for a specific app
 */
async function runSingleBenchmark(
	logger: CliLogger,
	appPath: string,
	showScores = true
): Promise<boolean> {
	const configPath = appPath ? join(appPath, 'config.json') : undefined;
	const config = readConfig(configPath);
	if (!config) {
		logger.error(`Failed to read config.json for ${appPath || 'current directory'}`);
		return false;
	}

	try {

		let serverInfo: ServerInfo | null = null;
		let benchmarkUrl: string;

		// Check if remote benchmarking is enabled
		if (config.remote?.enabled && config.remote.url) {
			logger.info(`🌐 Running remote benchmark against: ${config.remote.url}`);
			benchmarkUrl = config.remote.url;
		} else {
			logger.info('🏗️ Building and serving app locally...');
			serverInfo = await buildAndServeNextApp(logger, appPath);
			benchmarkUrl = serverInfo.url;
		}

		const cwd = appPath || process.cwd();

		try {
			// Create benchmark runner and run benchmarks
			const runner = new BenchmarkRunner(config, logger);
			const result = await runner.runBenchmarks(benchmarkUrl);

			// Create app data for transparency scoring
			const appData = {
				name: config.name,
				baseline: config.baseline || false,
				company: config.company ? JSON.stringify(config.company) : null,
				techStack: JSON.stringify(config.techStack),
				source: config.source ? JSON.stringify(config.source) : null,
				tags: config.tags ? JSON.stringify(config.tags) : null,
			};

			// Calculate scores
			const scores = calculateScores(
				{
					fcp:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.firstContentfulPaint,
							0
						) / result.details.length,
					lcp:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.largestContentfulPaint,
							0
						) / result.details.length,
					cls:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.cumulativeLayoutShift,
							0
						) / result.details.length,
					tbt:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.mainThreadBlocking.total,
							0
						) / result.details.length,
					tti:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.timeToInteractive,
							0
						) / result.details.length,
				},
				{
					totalSize:
						result.details.reduce((acc, curr) => acc + curr.size.total, 0) /
						result.details.length,
					jsSize:
						result.details.reduce(
							(acc, curr) => acc + curr.size.scripts.total,
							0
						) / result.details.length,
					cssSize:
						result.details.reduce((acc, curr) => acc + curr.size.styles, 0) /
						result.details.length,
					imageSize:
						result.details.reduce((acc, curr) => acc + curr.size.images, 0) /
						result.details.length,
					fontSize:
						result.details.reduce((acc, curr) => acc + curr.size.fonts, 0) /
						result.details.length,
					otherSize:
						result.details.reduce((acc, curr) => acc + curr.size.other, 0) /
						result.details.length,
				},
				{
					totalRequests:
						result.details.reduce(
							(acc, curr) =>
								acc +
								(curr.resources.scripts.length +
									curr.resources.styles.length +
									curr.resources.images.length +
									curr.resources.fonts.length +
									curr.resources.other.length),
							0
						) / result.details.length,
					thirdPartyRequests:
						result.details.reduce(
							(acc, curr) =>
								acc +
								curr.resources.scripts.filter((s) => s.isThirdParty).length,
							0
						) / result.details.length,
					thirdPartySize:
						result.details.reduce((acc, curr) => acc + curr.size.thirdParty, 0) /
						result.details.length,
					thirdPartyDomains: 5, // Default value
				},
				{
					cookieBannerDetected: (() => {
						// Require consistent detection across ALL iterations for true positive
						const allDetected = result.details.every(
							(r) => r.cookieBanner.detected
						);
						if (!allDetected) {
							logger.warn(
								'⚠️ [SCORING] Banner detection inconsistent or failed - marking as not detected'
							);
						}
						return allDetected;
					})(),
					cookieBannerTiming: (() => {
						// If no banners detected across any iteration, heavily penalize
						const detectionSuccess = result.details.some(
							(r) => r.cookieBanner.detected
						);
						if (!detectionSuccess) {
							logger.warn(
								'⚠️ [SCORING] No banner detected in any iteration - applying penalty'
							);
							return null; // This signals failed detection for scoring
						}

						// Check if any results have null timing (undetected banners)
						const timingValues = result.details.map(
							(r) => r.cookieBanner.visibilityTime
						);
						const hasNullValues = timingValues.some((t) => t === null || t === 0);

						// If we have mixed results (some detected, some not), still penalize
						if (hasNullValues) {
							logger.warn(
								'⚠️ [SCORING] Inconsistent banner detection - applying penalty'
							);
							return null;
						}

						// Only return actual timing if all iterations successfully detected banner
						const validTimings = timingValues.filter(
							(t): t is number => t !== null && t > 0
						);
						return validTimings.length === result.details.length &&
							validTimings.length > 0
							? validTimings.reduce((acc, curr) => acc + curr, 0) /
									validTimings.length
							: null;
					})(),
					cookieBannerCoverage: (() => {
						// Only calculate coverage if banner was consistently detected
						const detectionSuccess = result.details.every(
							(r) => r.cookieBanner.detected
						);
						if (!detectionSuccess) {
							logger.warn(
								'⚠️ [SCORING] Inconsistent detection - setting coverage to 0'
							);
							return 0; // No coverage score if detection failed
						}
						return (
							result.details.reduce(
								(acc, curr) => acc + curr.cookieBanner.viewportCoverage,
								0
							) /
							result.details.length /
							100
						);
					})(),
				},
				{
					domSize: 1500, // Default value
					mainThreadBlocking:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.mainThreadBlocking.total,
							0
						) / result.details.length,
					layoutShifts:
						result.details.reduce(
							(acc, curr) => acc + curr.timing.cumulativeLayoutShift,
							0
						) / result.details.length,
				},
				config.baseline || false,
				appData
			);

			// Format results for results.json
			const resultsData = {
				app: config.name,
				techStack: config.techStack,
				source: config.source,
				includes: config.includes,
				internationalization: config.internationalization,
				company: config.company,
				tags: config.tags,
				results: result.details,
				scores,
				metadata: {
					timestamp: new Date().toISOString(),
					iterations: config.iterations,
					languages: config.techStack.languages,
					isRemote: config.remote?.enabled || false,
					url: config.remote?.enabled ? config.remote.url : undefined,
				},
			};

			// Write results to file
			const outputPath = join(cwd, 'results.json');
			await writeFile(outputPath, JSON.stringify(resultsData, null, 2));
			logger.success(`Benchmark results saved to ${outputPath}`);

			// Print scores if requested
			if (showScores && scores) {
				logger.info('📊 Benchmark Scores:');
				printScores(scores);
			}

			return true;
		} finally {
			// Only cleanup server if we started one
			if (serverInfo) {
				cleanupServer(serverInfo);
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error) {
			logger.error(`Error running benchmark: ${error.message}`);
		} else {
			logger.error('An unknown error occurred during benchmark');
		}
		return false;
	}
}

/**
 * Main benchmark command with multi-select support
 */
export async function benchmarkCommand(
	logger: CliLogger,
	appPath?: string
): Promise<void> {
	// If a specific app path is provided, run that benchmark directly
	if (appPath) {
		const success = await runSingleBenchmark(logger, appPath, true);
		if (!success) {
			process.exit(1);
		}
		return;
	}

	// Otherwise, show multi-select for available benchmarks
	logger.clear();
	await setTimeout(500);

	p.intro(`${color.bgMagenta(color.white(' benchmark '))}`);

	// Find available benchmarks
	const availableBenchmarks = await findBenchmarkDirs(logger);

	if (availableBenchmarks.length === 0) {
		logger.error('No benchmarks found in the benchmarks/ directory');
		logger.info(
			'Create benchmark directories with config.json files to get started'
		);
		process.exit(1);
	}

	logger.info(
		`Found ${availableBenchmarks.length} benchmark(s): ${color.cyan(availableBenchmarks.join(', '))}`
	);

	// Ask user to select benchmarks
	const selectedBenchmarks = await p.multiselect({
		message: 'Select benchmarks to run (use space to toggle):',
		options: availableBenchmarks.map((name) => ({
			value: name,
			label: name,
			hint: join('benchmarks', name),
		})),
		required: true,
	});

	if (p.isCancel(selectedBenchmarks)) {
		p.cancel('Operation cancelled');
		return;
	}

	if (!Array.isArray(selectedBenchmarks) || selectedBenchmarks.length === 0) {
		logger.warn('No benchmarks selected');
		return;
	}

	// Ask if user wants to see scores after each benchmark
	const showScores = await p.confirm({
		message: 'Show scores after each benchmark?',
		initialValue: true,
	});

	if (p.isCancel(showScores)) {
		p.cancel('Operation cancelled');
		return;
	}

	// Run selected benchmarks sequentially
	const results: Array<{ name: string; success: boolean }> = [];

	for (let i = 0; i < selectedBenchmarks.length; i++) {
		const benchmarkName = selectedBenchmarks[i];
		const benchmarkPath = join('benchmarks', benchmarkName);

		logger.info(
			`\n${color.bold(color.cyan(`[${i + 1}/${selectedBenchmarks.length}]`))} Running benchmark: ${color.bold(benchmarkName)}`
		);

		const success = await runSingleBenchmark(
			logger,
			benchmarkPath,
			showScores === true
		);

		results.push({ name: benchmarkName, success });

		if (!success) {
			logger.error(
				`Failed to complete benchmark for ${benchmarkName}, continuing...`
			);
		}

		// Add spacing between benchmarks
		if (i < selectedBenchmarks.length - 1) {
			logger.message('\n' + '─'.repeat(80) + '\n');
		}
	}

	// Summary
	logger.message('\n');
	p.outro(
		`${color.bold('Summary:')} ${results.filter((r) => r.success).length}/${results.length} benchmarks completed successfully`
	);

	// Show failed benchmarks if any
	const failed = results.filter((r) => !r.success);
	if (failed.length > 0) {
		logger.warn(
			`Failed benchmarks: ${failed.map((r) => r.name).join(', ')}`
		);
	}
}

