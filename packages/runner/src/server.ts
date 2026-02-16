import { spawn } from "node:child_process";
import type { Logger } from "@c15t/logger";
import type { ServerInfo } from "./types";
import { getPackageManager, ONE_SECOND } from "./utils";

export async function buildAndServeNextApp(
	logger: Logger,
	appPath?: string
): Promise<ServerInfo> {
	const pm = await getPackageManager();
	const cwd = appPath || process.cwd();

	// Build the app
	logger.info("Building Next.js app...");
	const buildProcess = spawn(pm.command, [...pm.args, "build"], {
		cwd,
		stdio: "inherit",
	});

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		const onError = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			reject(
				new Error(
					`Build process failed to start or crashed early: ${error.message}`
				)
			);
		};
		const onClose = (code: number | null) => {
			if (settled) {
				return;
			}
			settled = true;
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Build failed with code ${code}`));
			}
		};
		buildProcess.once("error", onError);
		buildProcess.once("close", onClose);
	});

	// Start the server
	logger.info("Starting Next.js server...");
	// biome-ignore lint/style/noMagicNumbers: working with random port
	const port = Math.floor(Math.random() * (9000 - 3000 + 1)) + 3000;
	logger.debug("Server command:", [
		...pm.args,
		"start",
		...(pm.requiresScriptArgSeparator ? ["--"] : []),
		"--port",
		port.toString(),
	]);
	const startArgs = [
		...pm.args,
		"start",
		...(pm.requiresScriptArgSeparator ? ["--"] : []),
		"--port",
		port.toString(),
	];
	const serverProcess = spawn(pm.command, startArgs, {
		cwd,
		stdio: ["inherit", "pipe", "inherit"],
	});

	// Wait for server to be ready
	const url = `http://localhost:${port}`;
	let retries = 0;
	const maxRetries = 30;
	const requestTimeoutMs = 5000;
	let crashErrorMessage: string | null = null;
	const onServerExit = (code: number | null, signal: NodeJS.Signals | null) => {
		crashErrorMessage = `Server process exited before ready (code: ${code}, signal: ${signal})`;
	};
	const onServerError = (error: Error) => {
		crashErrorMessage = `Server process failed before ready: ${error.message}`;
	};
	serverProcess.once("exit", onServerExit);
	serverProcess.once("error", onServerError);

	while (retries < maxRetries) {
		if (crashErrorMessage !== null) {
			logger.error(crashErrorMessage);
			serverProcess.kill();
			serverProcess.removeListener("exit", onServerExit);
			serverProcess.removeListener("error", onServerError);
			throw new Error(crashErrorMessage);
		}

		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => {
			controller.abort();
		}, requestTimeoutMs);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (response.ok) {
				clearTimeout(timeoutHandle);
				serverProcess.removeListener("exit", onServerExit);
				serverProcess.removeListener("error", onServerError);
				logger.success("Server is ready!");
				return { serverProcess, url };
			}
		} catch {
			// Ignore error and retry
		} finally {
			clearTimeout(timeoutHandle);
		}

		await new Promise((resolve) => setTimeout(resolve, ONE_SECOND));
		retries += 1;
	}

	serverProcess.removeListener("exit", onServerExit);
	serverProcess.removeListener("error", onServerError);
	serverProcess.kill();
	throw new Error("Server failed to start");
}

export function cleanupServer(serverInfo: ServerInfo): void {
	if (serverInfo.serverProcess) {
		serverInfo.serverProcess.kill();
	}
}
