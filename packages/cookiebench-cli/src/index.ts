import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { benchmarkCommand } from './commands/benchmark';
import { resultsCommand } from './commands/results';
import { dbCommand } from './commands/db';
import { scoresCommand } from './commands/scores';
import { createCliLogger, type CliLogger } from './utils/logger';
import { displayIntro } from './components/intro';

// Get log level from env or default to info
const logLevel = (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info';
const logger: CliLogger = createCliLogger(logLevel);

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
				await resultsCommand(logger);
				break;
			case 'scores':
				await scoresCommand(logger, args[1]);
				break;
			case 'db':
				await dbCommand(logger, args[1]);
				break;
			default:
				logger.error(`Unknown command: ${command}`);
				logger.info('Available commands: benchmark, results, scores, db');
				process.exit(1);
		}
	} else {
		const selectedCommand = await p.select({
			message: 'What would you like to do?',
			options: [
				{
					value: 'benchmark',
					label: 'Run a benchmark',
					hint: 'Run a performance benchmark on a URL',
				},
				{
					value: 'results',
					label: 'Results',
					hint: 'Combine and display benchmark results',
				},
				{
					value: 'scores',
					label: 'View scores',
					hint: 'View scores from existing benchmark results',
				},
				{
					value: 'db',
					label: 'Database',
					hint: 'Manage database schema and migrations',
				},
			],
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
			case 'scores':
				await scoresCommand(logger);
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
