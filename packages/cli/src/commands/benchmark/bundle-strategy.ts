import type { Config } from "../../types";
import type { BundleStrategy } from "./types";
import { BUNDLE_TYPES } from "./constants";

export function determineBundleStrategy(config: Config): BundleStrategy {
  const bundleType = config.techStack?.bundleType;

  const isIIFE =
    bundleType === BUNDLE_TYPES.IIFE ||
    (Array.isArray(bundleType) && bundleType.includes(BUNDLE_TYPES.IIFE));

  const isBundled =
    !isIIFE &&
    (bundleType === BUNDLE_TYPES.BUNDLED ||
      (Array.isArray(bundleType) &&
        (bundleType.includes(BUNDLE_TYPES.ESM) ||
          bundleType.includes(BUNDLE_TYPES.CJS))) ||
      bundleType === BUNDLE_TYPES.ESM ||
      bundleType === BUNDLE_TYPES.CJS);

  return { isBundled, isIIFE, bundleType };
}
