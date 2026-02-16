/** biome-ignore-all lint/style/noMagicNumbers: its okay for the figlet word */
import figlet from "figlet";
import color from "picocolors";
import type { CliLogger } from "../utils/logger";

/**
 * Displays the CLI introduction sequence with figlet art
 * @param logger - The CLI logger instance
 * @param version - The CLI version string
 */
export async function displayIntro(
	logger: CliLogger,
	version?: string
): Promise<void> {
	// Generate and display Figlet text (async)
	let figletText = "cookiebench"; // Default
	try {
		figletText = await new Promise((resolve) => {
			figlet.text(
				"cookiebench",
				{
					font: "Slant",
					horizontalLayout: "default",
					verticalLayout: "default",
					width: 80,
					whitespaceBreak: true,
				},
				(err, data) => {
					if (err) {
						logger.debug("Failed to generate figlet text");
						resolve("cookiebench");
					} else {
						resolve(data || "cookiebench");
					}
				}
			);
		});
	} catch (error) {
		logger.debug("Error generating figlet text", error);
	}

	// Display the figlet text with cyan/teal gradient
	const canUseAnsiColors =
		Boolean(color.isColorSupported) &&
		!process.env.NO_COLOR &&
		process.stdout.isTTY;

	const customColor = {
		cyan10: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;10;80;90m${text}\x1b[0m` : text,
		cyan20: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;15;100;110m${text}\x1b[0m` : text,
		cyan30: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;20;120;130m${text}\x1b[0m` : text,
		cyan40: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;25;150;170m${text}\x1b[0m` : text,
		cyan50: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;30;170;190m${text}\x1b[0m` : text,
		cyan75: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;34;211;230m${text}\x1b[0m` : text,
		cyan90: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;45;225;245m${text}\x1b[0m` : text,
		cyan100: (text: string) =>
			canUseAnsiColors ? `\x1b[38;2;65;235;255m${text}\x1b[0m` : text,
	};

	const lines = figletText.split("\n");
	const gradientDenominator = Math.max(1, lines.length - 1);
	const coloredLines = lines.map((line, index) => {
		// Calculate the position in the gradient based on line index
		const position = index / gradientDenominator;

		if (position < 0.1) {
			return customColor.cyan10(line);
		}
		if (position < 0.2) {
			return customColor.cyan20(line);
		}
		if (position < 0.3) {
			return customColor.cyan30(line);
		}
		if (position < 0.4) {
			return customColor.cyan40(line);
		}
		if (position < 0.5) {
			return customColor.cyan50(line);
		}
		if (position < 0.65) {
			return customColor.cyan75(line);
		}
		if (position < 0.8) {
			return customColor.cyan90(line);
		}
		return customColor.cyan100(line);
	});

	// Join all colored lines and send as a single message
	logger.message(coloredLines.join("\n"));

	// Display version if provided
	if (version) {
		logger.message(color.dim(`v${version}`));
	}

	// Spacing before next step
	logger.message("");
}
