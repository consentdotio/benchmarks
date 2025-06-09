import { spawn } from "node:child_process";
import { getPackageManager } from "../utils";
import type { ServerInfo } from "../types";

export async function buildAndServeNextApp(
  appPath?: string
): Promise<ServerInfo> {
  const pm = await getPackageManager();
  const cwd = appPath || process.cwd();

  // Build the app
  console.log("[Build] Building Next.js app...");
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
  console.log("[Build] Starting Next.js server...");
  const port = Math.floor(Math.random() * (9000 - 3000 + 1)) + 3000;
  console.log("command", [
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
        console.log("[Build] Server is ready!");
        return { serverProcess, url };
      }
    } catch {
      // Ignore error and retry
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    retries++;
  }

  throw new Error("Server failed to start");
}

export function cleanupServer(serverInfo: ServerInfo): void {
  if (serverInfo.serverProcess) {
    serverInfo.serverProcess.kill();
  }
}
