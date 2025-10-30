import { createLogger, type Logger } from "@c15t/logger";
import { log, note, outro } from "@clack/prompts";
import { inspect } from "node:util";
import color from "picocolors";

// Define standard log levels
export type LogLevel = "error" | "warn" | "info" | "debug";
export const validLogLevels: LogLevel[] = ["error", "warn", "info", "debug"];
export type CliLogger = Logger & CliExtensions;

// Define CLI-specific extension levels with their method signatures
export type CliExtensions = {
	message: (message: string, ...args: unknown[]) => void;
	note: (message: string, title?: string) => void;
	outro: (message: string) => void;
	step: (message: string) => void;
	clear: () => void;
};

const formatArgs = (args: unknown[]): string => {
	if (args.length === 0) {
		return "";
	}
	return `\n${args
		.map((arg) => {
			try {
				return `  - ${JSON.stringify(arg, null, 2)}`;
			} catch {
				// Fallback to util.inspect for circular references or other serialization errors
				return `  - ${inspect(arg, { depth: null })}`;
			}
		})
		.join("\n")}`;
};

/**
 * Formats a log message with appropriate styling based on log level
 *
 * @param logLevel - The log level to format for
 * @param message - The message to format
 * @param args - Additional arguments to format
 * @returns The formatted message string
 */
export const formatLogMessage = (
	logLevel: LogLevel | string,
	message: unknown,
	args: unknown[] = []
): string => {
	const messageStr = typeof message === "string" ? message : String(message);
	const formattedArgs = formatArgs(args);

	switch (logLevel) {
		case "error": {
			return `${color.bgRed(color.black(" error "))} ${messageStr}${formattedArgs}`;
		}
		case "warn": {
			return `${color.bgYellow(color.black(" warning "))} ${messageStr}${formattedArgs}`;
		}
		case "info": {
			return `${color.bgCyan(color.black(" info "))} ${messageStr}${formattedArgs}`;
		}
		case "debug": {
			return `${color.bgBlack(color.white(" debug "))} ${messageStr}${formattedArgs}`;
		}
		case "success": {
			return `${color.bgGreen(color.white(" success "))} ${messageStr}${formattedArgs}`;
		}
		default: {
			// Handle unexpected levels
			const levelStr = logLevel as string;
			return `[${levelStr.toUpperCase()}] ${messageStr}${formattedArgs}`;
		}
	}
};

/**
 * Logs a message with the appropriate clack prompt styling
 * Can be used before logger initialization
 *
 * @param logLevel - The log level to use
 * @param message - The message to log
 * @param args - Additional arguments to include
 */
export const logMessage = (
	logLevel: LogLevel | "success" | string,
	message: unknown,
	...args: unknown[]
): void => {
	const formattedMessage = formatLogMessage(logLevel, message, args);

	switch (logLevel) {
		case "error":
			log.error(formattedMessage);
			break;
		case "warn":
			log.warn(formattedMessage);
			break;
		case "info":
		case "debug":
			log.info(formattedMessage);
			break;
		case "success":
			log.success(formattedMessage);
			break;
		default:
			log.message(formattedMessage);
	}
};

// This function creates a logger instance based on the provided level
// It includes the custom log handler for clack integration.
export const createCliLogger = (level: LogLevel = "info"): CliLogger => {
	// Create the base logger with standard levels
	const baseLogger = createLogger({
		level,
		appName: "cookiebench",
		log: (
			logLevel: LogLevel | "success",
			message: string,
			...args: unknown[]
		) => {
			// Level filtering is primarily handled by the createLogger factory's level setting.
			// This function now just focuses on routing output.
			logMessage(logLevel, message, ...args);
		},
	});

	// Extend the logger with CLI-specific methods
	const extendedLogger = baseLogger as CliLogger;

	// Add message method (plain text without prefix)
	extendedLogger.message = (message: string) => {
		log.message(message);
	};

	// Add note method (creates a note box)
	extendedLogger.note = (message: string, title?: string) => {
		const messageStr = typeof message === "string" ? message : String(message);
		note(messageStr, title);
	};

	// Add step method
	extendedLogger.step = (message: string) => {
		log.step(message);
	};

	// Add outro method (uses plain message)
	extendedLogger.outro = (message: string) => {
		outro(message);
	};

	// Add clear method
	extendedLogger.clear = () => {
		// biome-ignore lint/suspicious/noConsole: this is a CLI tool
		console.clear();
	};

	return extendedLogger;
};

// Export a default logger instance
export const logger = createCliLogger();
