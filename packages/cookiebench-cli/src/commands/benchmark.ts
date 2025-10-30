import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	BenchmarkRunner,
	buildAndServeNextApp,
	cleanupServer,
	readConfig,
	type ServerInfo,
} from '@consentio/runner';
import { calculateScores, printScores } from '../utils/scoring';

export async function benchmarkCommand(appPath?: string): Promise<void> {
	try {
		const config = readConfig(appPath ? join(appPath, 'config.json') : undefined);
		if (!config) {
			throw new Error('Failed to read config.json');
		}

		let serverInfo: ServerInfo | null = null;
		let benchmarkUrl: string;

		// Check if remote benchmarking is enabled
		if (config.remote?.enabled && config.remote.url) {
			console.log(`🌐 Running remote benchmark against: ${config.remote.url}`);
			benchmarkUrl = config.remote.url;
		} else {
			console.log('🏗️ Building and serving app locally...');
			serverInfo = await buildAndServeNextApp(appPath);
			benchmarkUrl = serverInfo.url;
		}

		const cwd = appPath || process.cwd();

		try {
			// Create benchmark runner and run benchmarks
			const runner = new BenchmarkRunner(config);
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
							console.log(
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
							console.log(
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
							console.log(
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
							console.log(
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
			console.log(`✅ Benchmark results saved to ${outputPath}`);

			// Print scores if available
			if (scores) {
				console.log('📊 Benchmark Scores:');
				printScores(scores);
			}
		} finally {
			// Only cleanup server if we started one
			if (serverInfo) {
				cleanupServer(serverInfo);
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(`Error running benchmark: ${error.message}`);
		} else {
			console.error('An unknown error occurred during benchmark');
		}
		process.exit(1);
	}
}

