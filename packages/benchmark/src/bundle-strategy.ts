import { BUNDLE_TYPES } from "./constants";
import type { BundleStrategy, Config } from "./types";

export function determineBundleStrategy(config: Config): BundleStrategy {
	const bundleType = config.techStack?.bundleType;

	const isIIFE =
		bundleType === BUNDLE_TYPES.IIFE ||
		(Array.isArray(bundleType) && bundleType.includes(BUNDLE_TYPES.IIFE));

	const isModuleBundleType =
		bundleType === BUNDLE_TYPES.ESM ||
		bundleType === BUNDLE_TYPES.CJS ||
		bundleType === BUNDLE_TYPES.BUNDLED;

	const isArrayWithModules =
		Array.isArray(bundleType) &&
		(bundleType.includes(BUNDLE_TYPES.ESM) ||
			bundleType.includes(BUNDLE_TYPES.CJS));

	const isBundled = !isIIFE && (isModuleBundleType || isArrayWithModules);

	return { isBundled, isIIFE, bundleType };
}
