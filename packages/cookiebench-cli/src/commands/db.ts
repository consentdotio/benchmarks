import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { cancel, confirm, intro, isCancel, select } from "@clack/prompts";
import { ONE_SECOND } from "@consentio/shared";
import color from "picocolors";
import { isAdminUser } from "../utils/auth";
import type { CliLogger } from "../utils/logger";

const DB_PACKAGE_RELATIVE_PATH = join("packages", "db");

function ensureDbPackage(logger: CliLogger, projectRoot: string) {
	const dbPackagePath = join(projectRoot, DB_PACKAGE_RELATIVE_PATH);
	const drizzleConfigPath = join(dbPackagePath, "drizzle.config.ts");

	if (!existsSync(dbPackagePath)) {
		logger.error(
			"Database package not found. Make sure you are running this from the project root."
		);
		process.exit(1);
	}

	if (!existsSync(drizzleConfigPath)) {
		logger.error(
			"Drizzle config not found. Make sure drizzle.config.ts exists in packages/db/"
		);
		process.exit(1);
	}
}

function runDrizzleCommand(
	logger: CliLogger,
	projectRoot: string,
	command: string
): void {
	const dbPackagePath = join(projectRoot, DB_PACKAGE_RELATIVE_PATH);

	try {
		logger.step(`Running: ${color.cyan(`drizzle-kit ${command}`)}`);
		execFileSync("pnpm", ["drizzle-kit", command], {
			cwd: dbPackagePath,
			stdio: "inherit",
		});
	} catch (error) {
		logger.error(`Failed to run drizzle-kit ${command}`);
		if (error instanceof Error) {
			logger.error(error.message);
		}
		process.exit(1);
	}
}

export async function dbCommand(logger: CliLogger, subcommand?: string) {
	// Double-check admin access (safeguard)
	if (!isAdminUser()) {
		logger.error("This command requires admin access");
		process.exit(1);
	}

	logger.clear();
	await setTimeout(ONE_SECOND);

	intro(`${color.bgBlue(color.white(" database "))} ${color.dim("v0.1.0")}`);

	const projectRoot = findProjectRoot();
	ensureDbPackage(logger, projectRoot);

	let selectedCommand = subcommand;

	if (!selectedCommand) {
		const command = await select({
			message: "What would you like to do?",
			options: [
				{
					value: "push",
					label: "Push schema changes",
					hint: "Push schema directly to database (good for development)",
				},
				{
					value: "generate",
					label: "Generate migrations",
					hint: "Generate SQL migration files from schema changes",
				},
				{
					value: "migrate",
					label: "Run migrations",
					hint: "Apply migration files to the database",
				},
				{
					value: "studio",
					label: "Open database studio",
					hint: "Browse and edit your database with Drizzle Studio",
				},
				{
					value: "status",
					label: "Check migration status",
					hint: "See which migrations have been applied",
				},
			],
		});

		if (isCancel(command)) {
			cancel("Operation cancelled.");
			return;
		}

		selectedCommand = command;
	}

	switch (selectedCommand) {
		case "push":
			await pushCommand(logger, projectRoot);
			break;
		case "generate":
			await generateCommand(logger, projectRoot);
			break;
		case "migrate":
			await migrateCommand(logger, projectRoot);
			break;
		case "studio":
			await studioCommand(logger, projectRoot);
			break;
		case "status":
			await statusCommand(logger, projectRoot);
			break;
		default:
			logger.error(`Unknown subcommand: ${selectedCommand}`);
			logger.info(
				"Available commands: push, generate, migrate, studio, status"
			);
			process.exit(1);
	}
}

async function pushCommand(logger: CliLogger, projectRoot: string) {
	logger.step("Pushing schema changes to database...");
	logger.info("This will apply schema changes directly to your database.");
	logger.warn("This is recommended for development only!");

	const confirmCommand = await confirm({
		message: "Are you sure you want to push schema changes?",
		initialValue: false,
	});

	if (isCancel(confirmCommand) || !confirmCommand) {
		cancel("Push cancelled.");
		return;
	}

	runDrizzleCommand(logger, projectRoot, "push");
	logger.success("Schema pushed successfully!");
	logger.outro("Database is now up to date with your schema.");
}

function generateCommand(logger: CliLogger, projectRoot: string) {
	logger.step("Generating migration files...");
	logger.info("This will create SQL migration files based on schema changes.");

	runDrizzleCommand(logger, projectRoot, "generate");
	logger.success("Migration files generated!");
	logger.info(
		"Review the generated files in packages/db/drizzle/ before applying them."
	);
	logger.outro(`Run ${color.cyan("cli db migrate")} to apply the migrations.`);
}

async function migrateCommand(logger: CliLogger, projectRoot: string) {
	logger.step("Running migrations...");
	logger.info("This will apply pending migration files to your database.");

	const confirmCommand = await confirm({
		message: "Are you sure you want to run migrations?",
		initialValue: true,
	});

	if (isCancel(confirmCommand) || !confirmCommand) {
		cancel("Migration cancelled.");
		return;
	}

	try {
		runDrizzleCommand(logger, projectRoot, "migrate");
		logger.success("Migrations completed successfully!");
		logger.outro("Database is now up to date.");
	} catch (error) {
		logger.error("Migration failed!");
		if (error instanceof Error) {
			logger.error(error.message);
		}
		process.exit(1);
	}
}

function studioCommand(logger: CliLogger, projectRoot: string) {
	logger.step("Opening Drizzle Studio...");
	logger.info(
		"This will start a web interface to browse and edit your database."
	);
	logger.info("Press Ctrl+C to stop the studio when you're done.");

	try {
		runDrizzleCommand(logger, projectRoot, "studio");
	} catch {
		// Studio command might be interrupted by Ctrl+C, which is normal
		logger.info("Studio closed.");
	}
}

// Same project root finding logic as in db package
function findProjectRoot(): string {
	let currentDir = process.cwd();

	while (currentDir !== dirname(currentDir)) {
		if (
			(existsSync(join(currentDir, "pnpm-workspace.yaml")) ||
				existsSync(join(currentDir, "package.json"))) &&
			existsSync(join(currentDir, "packages"))
		) {
			return currentDir;
		}
		currentDir = dirname(currentDir);
	}

	return process.cwd();
}

async function statusCommand(logger: CliLogger, projectRoot: string) {
	logger.step("Checking migration status...");

	try {
		const dbPath = join(projectRoot, "benchmarks.db");
		if (!existsSync(dbPath)) {
			logger.warn("Database file does not exist yet.");
			logger.info(
				`Run ${color.cyan("cli db push")} or ${color.cyan("cli db migrate")} to create it.`
			);
			return;
		}

		// Check migrations folder
		const migrationsPath = join(
			projectRoot,
			DB_PACKAGE_RELATIVE_PATH,
			"drizzle"
		);
		if (!existsSync(migrationsPath)) {
			logger.warn("No migrations found.");
			logger.info(
				`Run ${color.cyan("cli db generate")} to create migration files.`
			);
			return;
		}

		// List migration files
		const { readdir } = await import("node:fs/promises");
		const migrationFiles = await readdir(migrationsPath, {
			withFileTypes: true,
		});
		const migrations = migrationFiles
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)
			.sort();

		if (migrations.length === 0) {
			logger.info("No migration files found.");
		} else {
			logger.info(`Found ${migrations.length} migration(s):`);
			for (const migration of migrations) {
				logger.info(`  - ${migration}`);
			}
		}

		logger.success("Status check complete.");
	} catch (error) {
		logger.error("Failed to check status.");
		if (error instanceof Error) {
			logger.error(error.message);
		}
	}
}
