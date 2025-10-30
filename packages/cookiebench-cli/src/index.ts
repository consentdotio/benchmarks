import { setTimeout } from 'node:timers/promises';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { benchmarkCommand } from './commands/benchmark';
import { resultsCommand } from './commands/results';
import { dbCommand } from './commands/db';

function onCancel() {
	p.cancel('Operation cancelled.');
	process.exit(0);
}

async function main() {
	console.clear();
	await setTimeout(1000);

	// Check for command line arguments
	const args = process.argv.slice(2);
	const command = args[0];

	// If no command specified, show the prompt
	if (command) {
		// Direct command execution
		switch (command) {
			case 'benchmark':
				await benchmarkCommand();
				break;
			case 'results':
				await resultsCommand();
				break;
			case 'db':
				await dbCommand(args[1]);
				break;
			default:
				console.error(`Unknown command: ${command}`);
				console.log('Available commands: benchmark, results, db');
				process.exit(1);
		}
	} else {
		p.intro(`${color.bgCyan(color.black(' cookiebench '))}`);

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
				await benchmarkCommand();
				break;
			case 'results':
				await resultsCommand();
				break;
			case 'db':
				await dbCommand();
				break;
		}
	}
}

main().catch(console.error);
