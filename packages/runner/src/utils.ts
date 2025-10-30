import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '@consentio/benchmark';

export function readConfig(configPath?: string): Config | null {
	try {
		const path = configPath || join(process.cwd(), 'config.json');
		const configContent = readFileSync(path, 'utf-8');
		return JSON.parse(configContent) as Config;
	} catch (error) {
		console.error(`Failed to read config.json:`, error);
		return null;
	}
}

export function formatTime(ms: number): string {
	if (ms < 1000) {
		return `${ms.toFixed(0)}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

export async function getPackageManager(): Promise<{
	command: string;
	args: string[];
}> {
	try {
		const { execSync } = await import('node:child_process');
		const output = execSync('npm -v', { encoding: 'utf-8' });
		if (output) {
			return { command: 'npm', args: ['run'] };
		}
	} catch {
		try {
			const { execSync } = await import('node:child_process');
			const output = execSync('yarn -v', { encoding: 'utf-8' });
			if (output) {
				return { command: 'yarn', args: [] };
			}
		} catch {
			try {
				const { execSync } = await import('node:child_process');
				const output = execSync('pnpm -v', { encoding: 'utf-8' });
				if (output) {
					return { command: 'pnpm', args: [] };
				}
			} catch {
				// Default to npm if no package manager is found
				return { command: 'npm', args: ['run'] };
			}
		}
	}
	// Default to npm if no package manager is found
	return { command: 'npm', args: ['run'] };
}

