export type {
  Config,
  BenchmarkResult,
  BenchmarkDetails,
  LayoutShiftEntry,
} from "../../types";

export interface WindowWithCookieMetrics extends Window {
  __cookieBannerMetrics: {
    pageLoadStart: number;
    bannerDetectionStart: number;
    bannerFirstSeen: number;
    bannerInteractive: number;
    layoutShiftsBefore: number;
    layoutShiftsAfter: number;
    detected: boolean;
    selector: string | null;
  };
}

export interface NetworkRequest {
  url: string;
  size: number;
  duration: number;
  startTime: number;
  isScript: boolean;
  isThirdParty: boolean;
}

export interface CookieBannerMetrics {
  detectionStartTime: number;
  bannerRenderTime: number;
  bannerInteractiveTime: number;
  bannerScriptLoadTime: number;
  bannerLayoutShiftImpact: number;
  bannerNetworkRequests: number;
  bannerBundleSize: number;
  bannerMainThreadBlockingTime: number;
  isBundled: boolean;
  isIIFE: boolean;
  bannerDetected: boolean;
  bannerSelector: string | null;
}

export interface CookieBannerData {
  detected: boolean;
  selector: string | null;
  bannerRenderTime: number | null;
  bannerInteractiveTime: number | null;
  bannerHydrationTime: number;
  layoutShiftImpact: number;
  viewportCoverage: number;
}

export interface BundleStrategy {
  isBundled: boolean;
  isIIFE: boolean;
  bundleType: string | string[] | undefined;
}

export interface ResourceTimingData {
  timing: {
    navigationStart: number;
    domContentLoaded: number;
    load: number;
    scripts: {
      bundled: {
        loadStart: number;
        loadEnd: number;
        executeStart: number;
        executeEnd: number;
      };
      thirdParty: {
        loadStart: number;
        loadEnd: number;
        executeStart: number;
        executeEnd: number;
      };
    };
  };
  size: {
    total: number;
    bundled: number;
    thirdParty: number;
    cookieServices: number;
    scripts: {
      total: number;
      initial: number;
      dynamic: number;
      thirdParty: number;
      cookieServices: number;
    };
    styles: number;
    images: number;
    fonts: number;
    other: number;
  };
  resources: {
    scripts: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isDynamic: boolean;
      isCookieService: boolean;
      dnsTime: number;
      connectionTime: number;
    }>;
    styles: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    images: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    fonts: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
    }>;
    other: Array<{
      name: string;
      size: number;
      duration: number;
      startTime: number;
      isThirdParty: boolean;
      isCookieService: boolean;
      type: string;
    }>;
  };
  language: string;
  duration: number;
}
