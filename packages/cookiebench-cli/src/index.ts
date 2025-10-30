import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { benchmarkCommand } from './commands/benchmark';
import { resultsCommand } from './commands/results';
import { scoresCommand } from './commands/scores';
import { saveCommand } from './commands/save';
import { dbCommand } from './commands/db';
import { createCliLogger, type CliLogger, isAdminUser } from './utils';
import { displayIntro } from './components/intro';

// Get log level from env or default to info
const logLevel = (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info';
const logger: CliLogger = createCliLogger(logLevel);

// Check admin access for restricted commands
const isAdmin = isAdminUser();

function onCancel() {
	p.cancel('Operation cancelled.');
	process.exit(0);
}

async function main() {
	logger.clear();
	await setTimeout(500);

	// Check for command line arguments
	const args = process.argv.slice(2);
	const command = args[0];

	// Show intro for interactive mode
	if (!command) {
		await displayIntro(logger);
	}

	// If no command specified, show the prompt
	if (command) {
		// Direct command execution
		switch (command) {
			case 'benchmark':
				await benchmarkCommand(logger);
				break;
			case 'results':
				await resultsCommand(logger, args[1]);
				break;
			case 'scores':
				await scoresCommand(logger, args[1]);
				break;
			case 'save':
				if (!isAdmin) {
					logger.error('This command requires admin access');
					process.exit(1);
				}
				await saveCommand(logger, args[1]);
				break;
			case 'db':
				if (!isAdmin) {
					logger.error('This command requires admin access');
					process.exit(1);
				}
				await dbCommand(logger, args[1]);
				break;
			default:
				logger.error(`Unknown command: ${command}`);
				const availableCommands = ['benchmark', 'results', 'scores'];
				if (isAdmin) {
					availableCommands.push('save', 'db');
				}
				logger.info(`Available commands: ${availableCommands.join(', ')}`);
				process.exit(1);
		}
	} else {
		// Build options based on admin access
		const options = [
			{
				value: 'benchmark',
				label: 'Run a benchmark',
				hint: 'Run a performance benchmark on a URL',
			},
			{
				value: 'results',
				label: 'Results',
				hint: 'View detailed benchmark results',
			},
		];

		// Add admin-only commands
		if (isAdmin) {
			options.push({
				value: 'save',
				label: 'Save to database',
				hint: '🔒 Admin: Sync benchmark results to database',
			});
			options.push({
				value: 'db',
				label: 'Database',
				hint: '🔒 Admin: Manage database schema and migrations',
			});
		}

		const selectedCommand = await p.select({
			message: 'What would you like to do?',
			options,
		});

		if (p.isCancel(selectedCommand)) {
			return onCancel();
		}

		// biome-ignore lint/style/useDefaultSwitchClause: <explanation>
		switch (selectedCommand) {
			case 'benchmark':
				await benchmarkCommand(logger);
				break;
			case 'results':
				await resultsCommand(logger);
				break;
			case 'save':
				await saveCommand(logger);
				break;
			case 'db':
				await dbCommand(logger);
				break;
		}
	}
}

main().catch((error) => {
	logger.error('Fatal error:', error);
	process.exit(1);
});
