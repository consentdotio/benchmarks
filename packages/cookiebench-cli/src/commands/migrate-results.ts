import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import color from "picocolors";
import { findProjectRoot } from "../utils/project-root";
import type { CliLogger } from "../utils/logger";

type GenericRecord = Record<string, unknown>;

async function findResultsFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findResultsFiles(fullPath)));
		} else if (entry.name === "results.json") {
			files.push(fullPath);
		}
	}
	return files;
}

function scaleNumeric(value: unknown, multiplier: number): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return 0;
	}
	return value * multiplier;
}

function migrateDetail(
	detail: GenericRecord,
	multiplier: number
): GenericRecord {
	const migrated = JSON.parse(JSON.stringify(detail)) as GenericRecord;
	const size = migrated.size as GenericRecord | undefined;
	if (size) {
		size.total = scaleNumeric(size.total, multiplier);
		size.bundled = scaleNumeric(size.bundled, multiplier);
		size.thirdParty = scaleNumeric(size.thirdParty, multiplier);
		size.cookieServices = scaleNumeric(size.cookieServices, multiplier);

		const scripts = size.scripts as GenericRecord | undefined;
		if (scripts) {
			scripts.total = scaleNumeric(scripts.total, multiplier);
			scripts.initial = scaleNumeric(scripts.initial, multiplier);
			scripts.dynamic = scaleNumeric(scripts.dynamic, multiplier);
			scripts.thirdParty = scaleNumeric(scripts.thirdParty, multiplier);
			scripts.cookieServices = scaleNumeric(scripts.cookieServices, multiplier);
		}

		size.styles = scaleNumeric(size.styles, multiplier);
		size.images = scaleNumeric(size.images, multiplier);
		size.fonts = scaleNumeric(size.fonts, multiplier);
		size.other = scaleNumeric(size.other, multiplier);
	}

	const resources = migrated.resources as GenericRecord | undefined;
	if (resources) {
		for (const key of [
			"scripts",
			"styles",
			"images",
			"fonts",
			"other",
		] as const) {
			const list = resources[key] as GenericRecord[] | undefined;
			if (!Array.isArray(list)) {
				continue;
			}
			for (const item of list) {
				item.size = scaleNumeric(item.size, multiplier);
			}
		}
	}

	const timing = migrated.timing as GenericRecord | undefined;
	if (timing) {
		const thirdParty = timing.thirdParty as GenericRecord | undefined;
		if (thirdParty) {
			thirdParty.totalImpact = scaleNumeric(thirdParty.totalImpact, multiplier);
			const cookieServices = thirdParty.cookieServices as
				| GenericRecord
				| undefined;
			if (cookieServices) {
				cookieServices.totalSize = scaleNumeric(
					cookieServices.totalSize,
					multiplier
				);
			}
		}
	}

	const thirdPartyTopLevel = migrated.thirdParty as GenericRecord | undefined;
	if (thirdPartyTopLevel) {
		thirdPartyTopLevel.totalImpact = scaleNumeric(
			thirdPartyTopLevel.totalImpact,
			multiplier
		);
		const cookieServices = thirdPartyTopLevel.cookieServices as
			| GenericRecord
			| undefined;
		if (cookieServices) {
			cookieServices.totalSize = scaleNumeric(
				cookieServices.totalSize,
				multiplier
			);
		}
	}

	return migrated;
}

function migrateV1ToV2(rawData: GenericRecord): GenericRecord {
	const details = Array.isArray(rawData.results)
		? (rawData.results as GenericRecord[])
		: [];

	const totalSizeCandidates = details
		.map((detail) => {
			const size = detail.size as GenericRecord | undefined;
			return typeof size?.total === "number" ? size.total : 0;
		})
		.filter((value) => value > 0);

	// v1 historically stored KB values (typically in low thousands). v2 stores bytes.
	const likelyKbData =
		totalSizeCandidates.length > 0 &&
		Math.max(...totalSizeCandidates) < 100_000;
	const multiplier = likelyKbData ? 1024 : 1;

	const migratedDetails = details.map((detail) =>
		migrateDetail(detail, multiplier)
	);
	const now = new Date().toISOString();
	const metadata = (rawData.metadata as GenericRecord | undefined) ?? {};
	const timestamp =
		typeof metadata.timestamp === "string" ? metadata.timestamp : now;
	const requestedIterations =
		typeof metadata.iterations === "number"
			? metadata.iterations
			: migratedDetails.length;
	const successfulIterations = migratedDetails.length;
	const failedIterations = Math.max(
		0,
		requestedIterations - successfulIterations
	);
	const failureRate =
		requestedIterations > 0 ? failedIterations / requestedIterations : 0;
	const baselineRole =
		typeof rawData.app === "string" && rawData.app === "baseline"
			? "reference"
			: "candidate";

	return {
		...rawData,
		schemaVersion: 2,
		results: migratedDetails,
		metadata: {
			generatedAtUtc: timestamp,
			runStartedAtUtc: timestamp,
			runCompletedAtUtc: timestamp,
			iterationsRequested: requestedIterations,
			iterationsSuccessful: successfulIterations,
			runProfile:
				typeof metadata.runProfile === "object" && metadata.runProfile !== null
					? metadata.runProfile
					: {
							cacheMode: "cold",
							networkProfile: "none",
							cpuSlowdownMultiplier: 1,
						},
			measurement:
				typeof metadata.measurement === "object" &&
				metadata.measurement !== null
					? metadata.measurement
					: {
							minSuccessfulIterations: Math.max(1, successfulIterations),
							maxFailureRate: 1,
							stabilityThresholdCv: 100,
						},
			quality:
				typeof metadata.quality === "object" && metadata.quality !== null
					? metadata.quality
					: {
							requestedIterations,
							successfulIterations,
							failedIterations,
							failureRate,
							minSuccessfulIterations: Math.max(1, successfulIterations),
							maxFailureRate: 1,
							stabilityThresholdCv: 100,
							stable: true,
							unstableMetrics: [],
						},
			statistics:
				typeof metadata.statistics === "object" && metadata.statistics !== null
					? metadata.statistics
					: {},
			environment:
				typeof metadata.environment === "object" &&
				metadata.environment !== null
					? metadata.environment
					: {},
			baselineRole:
				typeof metadata.baselineRole === "string" &&
				(metadata.baselineRole === "reference" ||
					metadata.baselineRole === "candidate")
					? metadata.baselineRole
					: baselineRole,
			migrationTimestampUtc: now,
			migratedFromSchemaVersion:
				typeof rawData.schemaVersion === "number" ? rawData.schemaVersion : 1,
			migrationUnitScale: multiplier,
		},
	};
}

export async function migrateResultsCommand(
	logger: CliLogger,
	appName?: string
): Promise<void> {
	const projectRoot = findProjectRoot();
	const resultsDir = join(projectRoot, "benchmarks");
	let files: string[] = [];

	try {
		files = await findResultsFiles(resultsDir);
	} catch (error) {
		logger.error(
			`Failed to scan results files: ${error instanceof Error ? error.message : "Unknown error"}`
		);
		return;
	}

	if (files.length === 0) {
		logger.warn("No results.json files found");
		return;
	}

	let migratedCount = 0;
	let skippedCount = 0;

	for (const file of files) {
		try {
			const content = await readFile(file, "utf-8");
			const parsed = JSON.parse(content) as GenericRecord;
			const app =
				typeof parsed.app === "string" && parsed.app.length > 0
					? parsed.app
					: null;

			if (appName && app !== appName) {
				skippedCount += 1;
				continue;
			}

			if (parsed.schemaVersion === 2) {
				skippedCount += 1;
				continue;
			}

			const migrated = migrateV1ToV2(parsed);
			await writeFile(file, JSON.stringify(migrated, null, 2));
			logger.info(`Migrated ${file}`);
			migratedCount += 1;
		} catch (error) {
			logger.error(
				`Failed to migrate ${file}: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	if (migratedCount === 0) {
		logger.warn("No files needed migration");
		return;
	}

	logger.success(
		`${color.bold(String(migratedCount))} results file(s) migrated to schemaVersion 2 (${skippedCount} skipped)`
	);
}
