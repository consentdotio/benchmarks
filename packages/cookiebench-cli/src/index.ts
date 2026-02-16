#!/usr/bin/env node
import { setTimeout } from "node:timers/promises";
import { cancel, isCancel, select } from "@clack/prompts";
import { HALF_SECOND } from "@consentio/shared";
import { benchmarkCommand } from "./commands/benchmark";
import { dbCommand } from "./commands/db";
import { migrateResultsCommand } from "./commands/migrate-results";
import { resultsCommand } from "./commands/results";
import { saveCommand } from "./commands/save";
import { scoresCommand } from "./commands/scores";
import { displayIntro } from "./components/intro";
import { isAdminUser } from "./utils/auth";
import { type CliLogger, createCliLogger } from "./utils/logger";

// Get log level from env or default to info
const logLevel =
	(process.env.LOG_LEVEL as "error" | "warn" | "info" | "debug") || "info";
const logger: CliLogger = createCliLogger(logLevel);

// Check admin access for restricted commands
const isAdmin = isAdminUser();

function onCancel() {
	cancel("Operation cancelled.");
	process.exit(0);
}

function parseBenchmarkArgs(args: string[]): {
	appPath?: string;
	traceMode?: "off" | "on-failure" | "all";
	profile?: "none" | "slow4g" | "fast3g";
	cacheMode?: "cold" | "warm" | "mixed";
} {
	const parsed: {
		appPath?: string;
		traceMode?: "off" | "on-failure" | "all";
		profile?: "none" | "slow4g" | "fast3g";
		cacheMode?: "cold" | "warm" | "mixed";
	} = {};

	let index = 0;
	while (index < args.length) {
		const token = args[index];
		if (!(token.startsWith("--") || parsed.appPath)) {
			parsed.appPath = token;
			index += 1;
			continue;
		}

		if (token === "--trace") {
			const value = args[index + 1];
			if (value === "off" || value === "on-failure" || value === "all") {
				parsed.traceMode = value;
				index += 2;
				continue;
			}
			throw new Error(
				"Invalid --trace value. Expected one of: off, on-failure, all"
			);
		}

		if (token === "--profile") {
			const value = args[index + 1];
			if (value === "none" || value === "slow4g" || value === "fast3g") {
				parsed.profile = value;
				index += 2;
				continue;
			}
			throw new Error(
				"Invalid --profile value. Expected one of: none, slow4g, fast3g"
			);
		}

		if (token === "--cache-mode") {
			const value = args[index + 1];
			if (value === "cold" || value === "warm" || value === "mixed") {
				parsed.cacheMode = value;
				index += 2;
				continue;
			}
			throw new Error(
				"Invalid --cache-mode value. Expected one of: cold, warm, mixed"
			);
		}

		throw new Error(`Unknown benchmark option: ${token}`);
	}

	return parsed;
}

async function main() {
	logger.clear();
	await setTimeout(HALF_SECOND);

	// Check for command line arguments
	const rawArgs = process.argv.slice(2);
	const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
	const command = args[0];

	// Show intro for interactive mode
	if (!command) {
		await displayIntro(logger);
	}

	// If no command specified, show the prompt
	if (command) {
		// Direct command execution
		switch (command) {
			case "benchmark": {
				const parsed = parseBenchmarkArgs(args.slice(1));
				await benchmarkCommand(logger, parsed.appPath, {
					traceMode: parsed.traceMode,
					profile: parsed.profile,
					cacheMode: parsed.cacheMode,
				});
				break;
			}
			case "results":
				await resultsCommand(logger, args[1]);
				break;
			case "scores":
				await scoresCommand(logger, args[1]);
				break;
			case "migrate-results":
				await migrateResultsCommand(logger, args[1]);
				break;
			case "save":
				if (!isAdmin) {
					logger.error("This command requires admin access");
					process.exit(1);
				}
				await saveCommand(logger, args[1]);
				break;
			case "db":
				if (!isAdmin) {
					logger.error("This command requires admin access");
					process.exit(1);
				}
				await dbCommand(logger, args[1]);
				break;
			default: {
				logger.error(`Unknown command: ${command}`);
				const availableCommands = [
					"benchmark",
					"results",
					"scores",
					"migrate-results",
				];
				if (isAdmin) {
					availableCommands.push("save", "db");
				}
				logger.info(`Available commands: ${availableCommands.join(", ")}`);
				process.exit(1);
			}
		}
		process.exit(0);
	} else {
		// Build options based on admin access
		const options = [
			{
				value: "benchmark",
				label: "Run a benchmark",
				hint: "Run a performance benchmark on a URL",
			},
			{
				value: "results",
				label: "Results",
				hint: "View detailed benchmark results",
			},
			{
				value: "scores",
				label: "Scores",
				hint: "View score-focused benchmark output",
			},
			{
				value: "migrate-results",
				label: "Migrate Results",
				hint: "Upgrade results.json files to schemaVersion 2",
			},
		];

		// Add admin-only commands
		if (isAdmin) {
			options.push({
				value: "save",
				label: "Save to database",
				hint: "🔒 Admin: Sync benchmark results to database",
			});
			options.push({
				value: "db",
				label: "Database",
				hint: "🔒 Admin: Manage database schema and migrations",
			});
		}

		const selectedCommand = await select({
			message: "What would you like to do?",
			options,
		});

		if (isCancel(selectedCommand)) {
			return onCancel();
		}

		// biome-ignore lint/style/useDefaultSwitchClause: this is a CLI tool
		switch (selectedCommand) {
			case "benchmark":
				await benchmarkCommand(logger);
				break;
			case "results":
				await resultsCommand(logger);
				break;
			case "scores":
				await scoresCommand(logger);
				break;
			case "migrate-results":
				await migrateResultsCommand(logger);
				break;
			case "save":
				await saveCommand(logger);
				break;
			case "db":
				await dbCommand(logger);
				break;
		}
	}
}

main().catch((error) => {
	logger.error("Fatal error:", error);
	process.exit(1);
});
