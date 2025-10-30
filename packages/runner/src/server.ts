import { spawn } from "node:child_process";
import type { Logger } from "@c15t/logger";
import { getPackageManager, ONE_SECOND } from "@consentio/shared";
import type { ServerInfo } from "./types";

export async function buildAndServeNextApp(
	logger: Logger,
	appPath?: string
): Promise<ServerInfo> {
	const pm = await getPackageManager();
	if (!pm) {
		throw new Error("No package manager found");
	}

	const cwd = appPath || process.cwd();

	// Build the app
	logger.info("Building Next.js app...");
	const buildProcess = spawn(pm.command, [...pm.args, "build"], {
		cwd,
		stdio: "inherit",
	});

	await new Promise<void>((resolve, reject) => {
		buildProcess.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Build failed with code ${code}`));
			}
		});
	});

	// Start the server
	logger.info("Starting Next.js server...");
	// biome-ignore lint/style/noMagicNumbers: working with random port
	const port = Math.floor(Math.random() * (9000 - 3000 + 1)) + 3000;
	logger.debug("Server command:", [
		...pm.args,
		"start",
		"--",
		"--port",
		port.toString(),
	]);
	const serverProcess = spawn(
		pm.command,
		[...pm.args, "start", "--", "--port", port.toString()],
		{
			cwd,
			stdio: ["inherit", "pipe", "inherit"],
		}
	);

	// Wait for server to be ready
	const url = `http://localhost:${port}`;
	let retries = 0;
	const maxRetries = 30;

	while (retries < maxRetries) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				logger.success("Server is ready!");
				return { serverProcess, url };
			}
		} catch {
			// Ignore error and retry
		}

		await new Promise((resolve) => setTimeout(resolve, ONE_SECOND));
		retries += 1;
	}

	// Kill the server process before throwing to prevent resource leak
	if (!serverProcess.killed) {
		serverProcess.kill();
		// Wait briefly for process to exit gracefully
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				// Force kill if it didn't exit gracefully
				try {
					if (!serverProcess.killed) {
						serverProcess.kill("SIGKILL");
					}
				} catch {
					// Ignore if already dead
				}
				resolve();
			}, ONE_SECOND);

			serverProcess.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}
	throw new Error("Server failed to start");
}

export function cleanupServer(serverInfo: ServerInfo): void {
	if (serverInfo.serverProcess) {
		serverInfo.serverProcess.kill();
	}
}
