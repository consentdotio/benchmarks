import { setTimeout } from 'node:timers/promises';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import * as p from '@clack/prompts';
import color from 'picocolors';

const DB_PACKAGE_PATH = join(process.cwd(), 'packages', 'db');
const DRIZZLE_CONFIG_PATH = join(DB_PACKAGE_PATH, 'drizzle.config.ts');

function ensureDbPackage() {
	if (!existsSync(DB_PACKAGE_PATH)) {
		p.log.error('Database package not found. Make sure you are running this from the project root.');
		process.exit(1);
	}
	
	if (!existsSync(DRIZZLE_CONFIG_PATH)) {
		p.log.error('Drizzle config not found. Make sure drizzle.config.ts exists in packages/db/');
		process.exit(1);
	}
}

function runDrizzleCommand(command: string): void {
	try {
		p.log.step(`Running: ${color.cyan(`drizzle-kit ${command}`)}`);
		execSync(`cd ${DB_PACKAGE_PATH} && pnpm drizzle-kit ${command}`, {
			stdio: 'inherit',
			encoding: 'utf-8'
		});
	} catch (error) {
		p.log.error(`Failed to run drizzle-kit ${command}`);
		if (error instanceof Error) {
			p.log.error(error.message);
		}
		process.exit(1);
	}
}

export async function dbCommand(subcommand?: string) {
	console.clear();
	await setTimeout(1000);

	p.intro(`${color.bgBlue(color.white(' database '))} ${color.dim('v0.1.0')}`);
	
	ensureDbPackage();

	let selectedCommand = subcommand;

	if (!selectedCommand) {
		const command = await p.select({
			message: 'What would you like to do?',
			options: [
				{
					value: 'push',
					label: 'Push schema changes',
					hint: 'Push schema directly to database (good for development)'
				},
				{
					value: 'generate',
					label: 'Generate migrations',
					hint: 'Generate SQL migration files from schema changes'
				},
				{
					value: 'migrate',
					label: 'Run migrations',
					hint: 'Apply migration files to the database'
				},
				{
					value: 'studio',
					label: 'Open database studio',
					hint: 'Browse and edit your database with Drizzle Studio'
				},
				{
					value: 'status',
					label: 'Check migration status',
					hint: 'See which migrations have been applied'
				}
			]
		});

		if (p.isCancel(command)) {
			p.cancel('Operation cancelled.');
			return;
		}

		selectedCommand = command;
	}

	switch (selectedCommand) {
		case 'push':
			await pushCommand();
			break;
		case 'generate':
			await generateCommand();
			break;
		case 'migrate':
			await migrateCommand();
			break;
		case 'studio':
			await studioCommand();
			break;
		case 'status':
			await statusCommand();
			break;
		default:
			p.log.error(`Unknown subcommand: ${selectedCommand}`);
			p.log.info('Available commands: push, generate, migrate, studio, status');
			process.exit(1);
	}
}

async function pushCommand() {
	p.log.step('Pushing schema changes to database...');
	p.log.info('This will apply schema changes directly to your database.');
	p.log.warn('This is recommended for development only!');
	
	const confirm = await p.confirm({
		message: 'Are you sure you want to push schema changes?',
		initialValue: false
	});

	if (p.isCancel(confirm) || !confirm) {
		p.cancel('Push cancelled.');
		return;
	}

	runDrizzleCommand('push');
	p.log.success('Schema pushed successfully!');
	p.outro('Database is now up to date with your schema.');
}

async function generateCommand() {
	p.log.step('Generating migration files...');
	p.log.info('This will create SQL migration files based on schema changes.');
	
	runDrizzleCommand('generate');
	p.log.success('Migration files generated!');
	p.log.info('Review the generated files in packages/db/drizzle/ before applying them.');
	p.outro(`Run ${color.cyan('cli db migrate')} to apply the migrations.`);
}

async function migrateCommand() {
	p.log.step('Running migrations...');
	p.log.info('This will apply pending migration files to your database.');
	
	const confirm = await p.confirm({
		message: 'Are you sure you want to run migrations?',
		initialValue: true
	});

	if (p.isCancel(confirm) || !confirm) {
		p.cancel('Migration cancelled.');
		return;
	}

	try {
		runDrizzleCommand('migrate');
		p.log.success('Migrations completed successfully!');
		p.outro('Database is now up to date.');
	} catch (error) {
		p.log.error('Migration failed!');
		if (error instanceof Error) {
			p.log.error(error.message);
		}
		process.exit(1);
	}
}

async function studioCommand() {
	p.log.step('Opening Drizzle Studio...');
	p.log.info('This will start a web interface to browse and edit your database.');
	p.log.info('Press Ctrl+C to stop the studio when you\'re done.');
	
	try {
		runDrizzleCommand('studio');
	} catch {
		// Studio command might be interrupted by Ctrl+C, which is normal
		p.log.info('Studio closed.');
	}
}

// Same project root finding logic as in db package
function findProjectRoot(): string {
  let currentDir = process.cwd();
  
  while (currentDir !== dirname(currentDir)) {
    if (existsSync(join(currentDir, 'pnpm-workspace.yaml')) || 
        existsSync(join(currentDir, 'package.json'))) {
      if (existsSync(join(currentDir, 'packages'))) {
        return currentDir;
      }
    }
    currentDir = dirname(currentDir);
  }
  
  return process.cwd();
}

async function statusCommand() {
	p.log.step('Checking migration status...');
	
	try {
		// Check if database exists at project root
		const projectRoot = findProjectRoot();
		const dbPath = join(projectRoot, 'benchmarks.db');
		if (!existsSync(dbPath)) {
			p.log.warn('Database file does not exist yet.');
			p.log.info(`Run ${color.cyan('cli db push')} or ${color.cyan('cli db migrate')} to create it.`);
			return;
		}

		// Check migrations folder
		const migrationsPath = join(DB_PACKAGE_PATH, 'drizzle');
		if (!existsSync(migrationsPath)) {
			p.log.warn('No migrations found.');
			p.log.info(`Run ${color.cyan('cli db generate')} to create migration files.`);
			return;
		}

		// List migration files
		const { readdir } = await import('node:fs/promises');
		const migrationFiles = await readdir(migrationsPath, { withFileTypes: true });
		const migrations = migrationFiles
			.filter(dirent => dirent.isDirectory())
			.map(dirent => dirent.name)
			.sort();

		if (migrations.length === 0) {
			p.log.info('No migration files found.');
		} else {
			p.log.info(`Found ${migrations.length} migration(s):`);
			for (const migration of migrations) {
				p.log.info(`  - ${migration}`);
			}
		}

		p.log.success('Status check complete.');
	} catch (error) {
		p.log.error('Failed to check status.');
		if (error instanceof Error) {
			p.log.error(error.message);
		}
	}
} 