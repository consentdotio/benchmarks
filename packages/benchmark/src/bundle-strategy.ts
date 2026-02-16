import { BUNDLE_TYPES } from "./constants";
import type { BundleStrategy, Config } from "./types";

export function determineBundleStrategy(config: Config): BundleStrategy {
	const bundleType = config.techStack?.bundleType;
	const rawBundleType = bundleType as string | string[] | undefined;
	const legacyIffeType = "iffe";

	const isIIFE =
		rawBundleType === BUNDLE_TYPES.IIFE ||
		rawBundleType === BUNDLE_TYPES.IFFE ||
		rawBundleType === legacyIffeType ||
		(Array.isArray(rawBundleType) &&
			(rawBundleType.includes(BUNDLE_TYPES.IIFE) ||
				rawBundleType.includes(BUNDLE_TYPES.IFFE) ||
				rawBundleType.includes(legacyIffeType)));

	const isModuleBundleType =
		rawBundleType === BUNDLE_TYPES.ESM ||
		rawBundleType === BUNDLE_TYPES.CJS ||
		rawBundleType === BUNDLE_TYPES.BUNDLED;

	const isArrayWithModules =
		Array.isArray(rawBundleType) &&
		(rawBundleType.includes(BUNDLE_TYPES.ESM) ||
			rawBundleType.includes(BUNDLE_TYPES.CJS) ||
			rawBundleType.includes(BUNDLE_TYPES.BUNDLED) ||
			rawBundleType.includes(BUNDLE_TYPES.IIFE) ||
			rawBundleType.includes(BUNDLE_TYPES.IFFE) ||
			rawBundleType.includes(legacyIffeType));

	const isBundled = !isIIFE && (isModuleBundleType || isArrayWithModules);

	return { isBundled, isIIFE, bundleType };
}
