import type { Page } from "@playwright/test";

// Config types
export type CookieBannerConfig = {
	selectors: string[];
	serviceHosts: string[];
	waitForVisibility: boolean;
	measureViewportCoverage: boolean;
	expectedLayoutShift: boolean;
	serviceName: string;
};

export type Config = {
	name: string;
	url?: string;
	testId?: string;
	id?: string;
	iterations: number;
	baseline?: boolean;
	custom?: (page: Page) => Promise<void>;
	remote?: {
		enabled?: boolean;
		url?: string;
		headers?: Record<string, string>;
	};
	cookieBanner: CookieBannerConfig;
	internationalization: {
		detection: string;
		stringLoading: string;
	};
	techStack: {
		bundler: string;
		bundleType: string | string[];
		frameworks: string[];
		languages: string[];
		packageManager: string;
		typescript: boolean;
	};
	source: {
		github: string | false;
		isOpenSource: boolean | string;
		license: string;
		npm: string | false;
		website?: string;
	};
	includes: {
		backend: string | string[] | false;
		components: string[];
	};
	company?: {
		name: string;
		website: string;
		avatar: string;
	};
	tags?: string[];
};

// Performance API type definitions
export interface LayoutShiftEntry extends PerformanceEntry {
	value: number;
	hadRecentInput: boolean;
}

// Cookie banner types
export interface WindowWithCookieMetrics extends Window {
	__cookieBannerMetrics: {
		pageLoadStart: number;
		bannerDetectionStart: number;
		bannerFirstSeen: number;
		bannerVisibleTime: number; // When banner is actually visible (opacity > 0.5) - for UX metrics
		bannerInteractive: number;
		layoutShiftsBefore: number;
		layoutShiftsAfter: number;
		detected: boolean;
		selector: string | null;
		clsObserver?: PerformanceObserver;
	};
}

export type CookieBannerMetrics = {
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
};

export type CookieBannerData = {
	detected: boolean;
	selector: string | null;
	bannerRenderTime: number; // Technical: when banner is painted to screen
	bannerVisibilityTime: number; // UX: when banner is actually visible to users (opacity > 0.5)
	bannerInteractiveTime: number;
	bannerHydrationTime: number;
	layoutShiftImpact: number;
	viewportCoverage: number;
};

// Network types
export type NetworkRequest = {
	url: string;
	size: number;
	duration: number;
	startTime: number;
	isScript: boolean;
	isThirdParty: boolean;
};

export type NetworkMetrics = {
	bannerNetworkRequests: number;
	bannerBundleSize: number;
};

// Bundle strategy types
export type BundleStrategy = {
	isBundled: boolean;
	isIIFE: boolean;
	bundleType: string | string[] | undefined;
};

// Resource timing types
export type ResourceTimingData = {
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
};

// Core web vitals types
export type CoreWebVitals = {
	paint?: {
		firstPaint?: number;
		firstContentfulPaint?: number;
	};
	largestContentfulPaint?: number;
	cumulativeLayoutShift?: number;
	totalBlockingTime?: number;
	domCompleteTiming?: number;
	pageloadTiming?: number;
	totalBytes?: number;
};

// Perfume.js metrics types
export type PerfumeMetrics = {
	// Core Web Vitals (replacing playwright-performance-metrics)
	firstPaint: number;
	firstContentfulPaint: number;
	largestContentfulPaint: number;
	cumulativeLayoutShift: number;
	totalBlockingTime: number;

	// Enhanced metrics (new)
	firstInputDelay: number | null;
	interactionToNextPaint: number | null;
	timeToFirstByte: number;

	// Detailed navigation timing
	navigationTiming: {
		timeToFirstByte: number;
		domInteractive: number;
		domContentLoadedEventStart: number;
		domContentLoadedEventEnd: number;
		domComplete: number;
		loadEventStart: number;
		loadEventEnd: number;
	};

	// Network information (optional)
	networkInformation?: {
		effectiveType: string;
		downlink: number;
		rtt: number;
		saveData: boolean;
	};
};

export interface WindowWithPerfumeMetrics extends Window {
	__perfumeMetrics?: Record<
		string,
		{
			value: number;
			rating: string;
			attribution?: unknown;
			navigatorInformation?: {
				deviceMemory?: number;
				hardwareConcurrency?: number;
				isLowEndDevice?: boolean;
				isLowEndExperience?: boolean;
				serviceWorkerStatus?: string;
			};
		}
	>;
}
