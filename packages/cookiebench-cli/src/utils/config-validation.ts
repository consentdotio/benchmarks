import { readFileSync } from "node:fs";
import type { Config } from "../types";

const ROOT_KEYS = new Set([
	"$schema",
	"name",
	"url",
	"testId",
	"id",
	"iterations",
	"baseline",
	"remote",
	"runProfile",
	"measurement",
	"cookieBanner",
	"internationalization",
	"techStack",
	"source",
	"includes",
	"company",
	"tags",
]);

const BUNDLE_TYPES = new Set(["esm", "cjs", "iife", "bundled"]);
const CACHE_MODES = new Set(["cold", "warm", "mixed"]);
const NETWORK_PROFILES = new Set(["none", "slow4g", "fast3g"]);
const I18N_DETECTION = new Set(["browser", "ip", "manual", "none"]);
const I18N_STRING_LOADING = new Set(["bundled", "server", "none"]);
const LANGUAGES = new Set(["typescript", "javascript"]);

type ValidationIssue = {
	path: string;
	message: string;
};

export class ConfigValidationError extends Error {
	readonly issues: ValidationIssue[];

	constructor(message: string, issues: ValidationIssue[]) {
		super(message);
		this.name = "ConfigValidationError";
		this.issues = issues;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoUnknownKeys(
	issues: ValidationIssue[],
	path: string,
	value: Record<string, unknown>,
	allowed: Set<string>
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			issues.push({
				path: `${path}.${key}`,
				message: "Unknown property",
			});
		}
	}
}

function assertString(
	issues: ValidationIssue[],
	path: string,
	value: unknown
): value is string {
	if (typeof value !== "string" || value.trim().length === 0) {
		issues.push({ path, message: "Expected non-empty string" });
		return false;
	}
	return true;
}

function assertBoolean(
	issues: ValidationIssue[],
	path: string,
	value: unknown
): value is boolean {
	if (typeof value !== "boolean") {
		issues.push({ path, message: "Expected boolean" });
		return false;
	}
	return true;
}

function assertNumber(
	issues: ValidationIssue[],
	path: string,
	value: unknown,
	validator?: (num: number) => boolean,
	hint?: string
): value is number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		issues.push({ path, message: "Expected number" });
		return false;
	}
	if (validator && !validator(value)) {
		issues.push({ path, message: hint ?? "Invalid numeric value" });
		return false;
	}
	return true;
}

function assertStringArray(
	issues: ValidationIssue[],
	path: string,
	value: unknown,
	allowedValues?: Set<string>
): value is string[] {
	if (!Array.isArray(value)) {
		issues.push({ path, message: "Expected array" });
		return false;
	}

	for (const [index, item] of value.entries()) {
		if (typeof item !== "string" || item.trim().length === 0) {
			issues.push({
				path: `${path}[${index}]`,
				message: "Expected non-empty string",
			});
			continue;
		}
		if (allowedValues && !allowedValues.has(item)) {
			issues.push({
				path: `${path}[${index}]`,
				message: `Unsupported value "${item}"`,
			});
		}
	}
	return true;
}

function normalizeBundleType(
	bundleType: Config["techStack"]["bundleType"]
): Config["techStack"]["bundleType"] {
	if (Array.isArray(bundleType)) {
		return bundleType.map((value) => (value === "iffe" ? "iife" : value));
	}
	return bundleType === "iffe" ? "iife" : bundleType;
}

export function validateBenchmarkConfig(config: unknown): {
	config: Config | null;
	issues: ValidationIssue[];
} {
	const issues: ValidationIssue[] = [];

	if (!isRecord(config)) {
		return {
			config: null,
			issues: [{ path: "config", message: "Expected object" }],
		};
	}

	assertNoUnknownKeys(issues, "config", config, ROOT_KEYS);

	assertString(issues, "name", config.name);
	assertNumber(
		issues,
		"iterations",
		config.iterations,
		(value) => Number.isInteger(value) && value >= 1,
		"Expected integer >= 1"
	);

	if (config.url !== undefined) {
		assertString(issues, "url", config.url);
	}
	if (config.testId !== undefined) {
		assertString(issues, "testId", config.testId);
	}
	if (config.id !== undefined) {
		assertString(issues, "id", config.id);
	}
	if (config.baseline !== undefined) {
		assertBoolean(issues, "baseline", config.baseline);
	}

	// runProfile
	if (!isRecord(config.runProfile)) {
		issues.push({
			path: "runProfile",
			message:
				"Missing required object (expected cacheMode, networkProfile, cpuSlowdownMultiplier)",
		});
	} else {
		const runProfile = config.runProfile;
		assertNoUnknownKeys(
			issues,
			"runProfile",
			runProfile,
			new Set(["cacheMode", "networkProfile", "cpuSlowdownMultiplier"])
		);

		if (assertString(issues, "runProfile.cacheMode", runProfile.cacheMode)) {
			if (!CACHE_MODES.has(runProfile.cacheMode)) {
				issues.push({
					path: "runProfile.cacheMode",
					message: `Unsupported value "${runProfile.cacheMode}"`,
				});
			}
		}
		if (
			assertString(
				issues,
				"runProfile.networkProfile",
				runProfile.networkProfile
			)
		) {
			if (!NETWORK_PROFILES.has(runProfile.networkProfile)) {
				issues.push({
					path: "runProfile.networkProfile",
					message: `Unsupported value "${runProfile.networkProfile}"`,
				});
			}
		}
		assertNumber(
			issues,
			"runProfile.cpuSlowdownMultiplier",
			runProfile.cpuSlowdownMultiplier,
			(value) => value >= 1,
			"Expected number >= 1"
		);
	}

	// measurement
	if (!isRecord(config.measurement)) {
		issues.push({
			path: "measurement",
			message:
				"Missing required object (expected minSuccessfulIterations, maxFailureRate, stabilityThresholdCv)",
		});
	} else {
		const measurement = config.measurement;
		assertNoUnknownKeys(
			issues,
			"measurement",
			measurement,
			new Set([
				"minSuccessfulIterations",
				"maxFailureRate",
				"stabilityThresholdCv",
			])
		);

		assertNumber(
			issues,
			"measurement.minSuccessfulIterations",
			measurement.minSuccessfulIterations,
			(value) => Number.isInteger(value) && value >= 1,
			"Expected integer >= 1"
		);
		assertNumber(
			issues,
			"measurement.maxFailureRate",
			measurement.maxFailureRate,
			(value) => value >= 0 && value <= 1,
			"Expected number between 0 and 1"
		);
		assertNumber(
			issues,
			"measurement.stabilityThresholdCv",
			measurement.stabilityThresholdCv,
			(value) => value >= 0,
			"Expected number >= 0"
		);
	}

	// remote
	if (config.remote !== undefined) {
		if (!isRecord(config.remote)) {
			issues.push({ path: "remote", message: "Expected object" });
		} else {
			const remote = config.remote;
			assertNoUnknownKeys(
				issues,
				"remote",
				remote,
				new Set(["enabled", "url", "headers"])
			);

			const enabled =
				remote.enabled === undefined
					? false
					: assertBoolean(issues, "remote.enabled", remote.enabled) &&
						remote.enabled;

			if (enabled) {
				assertString(issues, "remote.url", remote.url);
			} else if (remote.url !== undefined) {
				assertString(issues, "remote.url", remote.url);
			}

			if (remote.headers !== undefined) {
				if (!isRecord(remote.headers)) {
					issues.push({
						path: "remote.headers",
						message: "Expected object map of string:string",
					});
				} else {
					for (const [header, headerValue] of Object.entries(remote.headers)) {
						if (typeof headerValue !== "string") {
							issues.push({
								path: `remote.headers.${header}`,
								message: "Expected string header value",
							});
						}
					}
				}
			}
		}
	}

	// cookieBanner
	if (!isRecord(config.cookieBanner)) {
		issues.push({ path: "cookieBanner", message: "Missing required object" });
	} else {
		const cookieBanner = config.cookieBanner;
		assertNoUnknownKeys(
			issues,
			"cookieBanner",
			cookieBanner,
			new Set([
				"selectors",
				"serviceHosts",
				"waitForVisibility",
				"measureViewportCoverage",
				"expectedLayoutShift",
				"serviceName",
			])
		);
		assertStringArray(issues, "cookieBanner.selectors", cookieBanner.selectors);
		assertStringArray(
			issues,
			"cookieBanner.serviceHosts",
			cookieBanner.serviceHosts
		);
		assertBoolean(
			issues,
			"cookieBanner.waitForVisibility",
			cookieBanner.waitForVisibility
		);
		assertBoolean(
			issues,
			"cookieBanner.measureViewportCoverage",
			cookieBanner.measureViewportCoverage
		);
		assertBoolean(
			issues,
			"cookieBanner.expectedLayoutShift",
			cookieBanner.expectedLayoutShift
		);
		assertString(issues, "cookieBanner.serviceName", cookieBanner.serviceName);
	}

	// internationalization
	if (!isRecord(config.internationalization)) {
		issues.push({
			path: "internationalization",
			message: "Missing required object",
		});
	} else {
		const internationalization = config.internationalization;
		assertNoUnknownKeys(
			issues,
			"internationalization",
			internationalization,
			new Set(["detection", "stringLoading"])
		);

		if (
			assertString(
				issues,
				"internationalization.detection",
				internationalization.detection
			) &&
			!I18N_DETECTION.has(internationalization.detection)
		) {
			issues.push({
				path: "internationalization.detection",
				message: `Unsupported value "${internationalization.detection}"`,
			});
		}

		if (
			assertString(
				issues,
				"internationalization.stringLoading",
				internationalization.stringLoading
			) &&
			!I18N_STRING_LOADING.has(internationalization.stringLoading)
		) {
			issues.push({
				path: "internationalization.stringLoading",
				message: `Unsupported value "${internationalization.stringLoading}"`,
			});
		}
	}

	// techStack
	if (!isRecord(config.techStack)) {
		issues.push({ path: "techStack", message: "Missing required object" });
	} else {
		const techStack = config.techStack;
		assertNoUnknownKeys(
			issues,
			"techStack",
			techStack,
			new Set([
				"bundler",
				"bundleType",
				"frameworks",
				"languages",
				"packageManager",
				"typescript",
			])
		);
		assertString(issues, "techStack.bundler", techStack.bundler);

		if (typeof techStack.bundleType === "string") {
			const normalized =
				techStack.bundleType === "iffe" ? "iife" : techStack.bundleType;
			if (!BUNDLE_TYPES.has(normalized)) {
				issues.push({
					path: "techStack.bundleType",
					message: `Unsupported value "${techStack.bundleType}"`,
				});
			}
		} else if (Array.isArray(techStack.bundleType)) {
			assertStringArray(
				issues,
				"techStack.bundleType",
				techStack.bundleType as unknown[],
				BUNDLE_TYPES
			);
		} else {
			issues.push({
				path: "techStack.bundleType",
				message: "Expected string or string[]",
			});
		}

		assertStringArray(
			issues,
			"techStack.frameworks",
			techStack.frameworks as unknown[]
		);
		assertStringArray(
			issues,
			"techStack.languages",
			techStack.languages as unknown[],
			LANGUAGES
		);
		assertString(issues, "techStack.packageManager", techStack.packageManager);
		assertBoolean(issues, "techStack.typescript", techStack.typescript);
	}

	// source
	if (!isRecord(config.source)) {
		issues.push({ path: "source", message: "Missing required object" });
	} else {
		const source = config.source;
		assertNoUnknownKeys(
			issues,
			"source",
			source,
			new Set(["github", "isOpenSource", "license", "npm", "website"])
		);

		if (source.github !== undefined && source.github !== false) {
			assertString(issues, "source.github", source.github);
		}
		if (
			typeof source.isOpenSource !== "boolean" &&
			source.isOpenSource !== "partially"
		) {
			issues.push({
				path: "source.isOpenSource",
				message: 'Expected boolean or "partially"',
			});
		}
		assertString(issues, "source.license", source.license);
		if (source.npm !== undefined && source.npm !== false) {
			assertString(issues, "source.npm", source.npm);
		}
		if (source.website !== undefined) {
			assertString(issues, "source.website", source.website);
		}
	}

	// includes
	if (!isRecord(config.includes)) {
		issues.push({ path: "includes", message: "Missing required object" });
	} else {
		const includes = config.includes;
		assertNoUnknownKeys(
			issues,
			"includes",
			includes,
			new Set(["backend", "components"])
		);
		if (includes.backend !== undefined && includes.backend !== false) {
			if (typeof includes.backend !== "string") {
				assertStringArray(
					issues,
					"includes.backend",
					includes.backend as unknown[]
				);
			}
		}
		assertStringArray(
			issues,
			"includes.components",
			includes.components as unknown[]
		);
	}

	if (config.company !== undefined) {
		if (!isRecord(config.company)) {
			issues.push({ path: "company", message: "Expected object" });
		} else {
			const company = config.company;
			assertNoUnknownKeys(
				issues,
				"company",
				company,
				new Set(["name", "website", "avatar"])
			);
			assertString(issues, "company.name", company.name);
			assertString(issues, "company.website", company.website);
			assertString(issues, "company.avatar", company.avatar);
		}
	}

	if (config.tags !== undefined) {
		assertStringArray(issues, "tags", config.tags as unknown[]);
	}

	if (issues.length > 0) {
		return { config: null, issues };
	}

	const normalized = {
		...config,
		techStack: {
			...(config.techStack as Config["techStack"]),
			bundleType: normalizeBundleType(
				(config.techStack as Config["techStack"]).bundleType
			),
		},
	} as Config;

	return { config: normalized, issues };
}

export function formatConfigIssues(issues: ValidationIssue[]): string {
	return issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");
}

export function loadValidatedConfigSync(configPath: string): Config {
	let parsed: unknown;
	try {
		const fileContent = readFileSync(configPath, "utf-8");
		parsed = JSON.parse(fileContent) as unknown;
	} catch (error) {
		throw new ConfigValidationError(
			`Failed to read config file at ${configPath}: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
			[
				{
					path: configPath,
					message: "Could not read or parse JSON",
				},
			]
		);
	}

	const result = validateBenchmarkConfig(parsed);
	if (!result.config) {
		throw new ConfigValidationError(
			`Invalid benchmark config at ${configPath}`,
			result.issues
		);
	}

	return result.config;
}
