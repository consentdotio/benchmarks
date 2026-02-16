import type { ChildProcess } from "node:child_process";

// Re-export common types from benchmark package
export type {
	BundleStrategy,
	Config,
	CookieBannerConfig,
	CookieBannerData,
	CookieBannerMetrics,
	CoreWebVitals,
	NetworkMetrics,
	NetworkRequest,
	PerfumeMetrics,
	ResourceTimingData,
} from "@consentio/benchmark";

// Server types
export type ServerInfo = {
	serverProcess: ChildProcess;
	url: string;
};

// Benchmark result types
export type BenchmarkDetails = {
	duration: number;
	size: {
		total: number;
		bundled: number;
		thirdParty: number;
		scripts: {
			total: number;
			initial: number;
			dynamic: number;
		};
		styles: number;
		images: number;
		fonts: number;
		other: number;
	};
	timing: {
		navigationStart: number;
		domContentLoaded: number;
		load: number;
		firstPaint: number;
		firstContentfulPaint: number;
		largestContentfulPaint: number;
		timeToInteractive: number;
		cumulativeLayoutShift: number;
		// Enhanced metrics from Perfume.js
		timeToFirstByte: number;
		firstInputDelay: number | null;
		interactionToNextPaint: number | null;
		navigationTiming: {
			timeToFirstByte: number;
			domInteractive: number;
			domContentLoadedEventStart: number;
			domContentLoadedEventEnd: number;
			domComplete: number;
			loadEventStart: number;
			loadEventEnd: number;
		};
		networkInformation?: {
			effectiveType: string;
			downlink: number;
			rtt: number;
			saveData: boolean;
		};
		cookieBanner: {
			renderStart: number;
			renderEnd: number;
			interactionStart: number;
			interactionEnd: number;
			layoutShift: number;
			detected: boolean;
			selector: string | null;
			serviceName: string;
			visibilityTime: number | null;
			viewportCoverage: number;
		};
		thirdParty: {
			dnsLookupTime: number;
			connectionTime: number;
			downloadTime: number;
			totalImpact: number;
			cookieServices: {
				hosts: string[];
				totalSize: number;
				resourceCount: number;
				dnsLookupTime: number;
				connectionTime: number;
				downloadTime: number;
			};
		};
		mainThreadBlocking: {
			total: number;
			cookieBannerEstimate: number;
			percentageFromCookies: number;
		};
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
	language: string;
	resources: {
		scripts: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			isDynamic: boolean;
		}>;
		styles: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
		}>;
		images: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
		}>;
		fonts: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
		}>;
		other: Array<{
			name: string;
			size: number;
			duration: number;
			startTime: number;
			isThirdParty: boolean;
			type: string;
		}>;
	};
	dom?: {
		size?: number;
	};
	cookieBanner: EnhancedCookieBannerTiming;
	thirdParty: ThirdPartyMetrics;
};

export type BenchmarkResult = {
	name: string;
	baseline: boolean;
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
	details: BenchmarkDetails[];
	average: {
		firstContentfulPaint: number;
		largestContentfulPaint: number;
		timeToInteractive: number;
		totalBlockingTime: number;
		speedIndex: number;
		timeToFirstByte: number;
		firstInputDelay: number;
		interactionToNextPaint: number;
		cumulativeLayoutShift: number;
		domSize: number;
		totalRequests: number;
		totalSize: number;
		jsSize: number;
		cssSize: number;
		imageSize: number;
		fontSize: number;
		otherSize: number;
		thirdPartyRequests: number;
		thirdPartySize: number;
		thirdPartyDomains: number;
		thirdPartyCookies: number;
		thirdPartyLocalStorage: number;
		thirdPartySessionStorage: number;
		thirdPartyIndexedDB: number;
		thirdPartyCache: number;
		thirdPartyServiceWorkers: number;
		thirdPartyWebWorkers: number;
		thirdPartyWebSockets: number;
		thirdPartyBeacons: number;
		thirdPartyFetch: number;
		thirdPartyXHR: number;
		thirdPartyScripts: number;
		thirdPartyStyles: number;
		thirdPartyImages: number;
		thirdPartyFonts: number;
		thirdPartyMedia: number;
		thirdPartyOther: number;
		thirdPartyTiming: {
			total: number;
			blocking: number;
			dns: number;
			connect: number;
			ssl: number;
			send: number;
			wait: number;
			receive: number;
		};
		cookieBannerTiming: {
			firstPaint: number;
			firstContentfulPaint: number;
			domContentLoaded: number;
			load: number;
		};
	};
	scores?: {
		totalScore: number;
		grade: "Excellent" | "Good" | "Fair" | "Poor" | "Critical";
		categoryScores: {
			performance: number;
			bundleStrategy: number;
			networkImpact: number;
			transparency: number;
			userExperience: number;
		};
		categories: Array<{
			name: string;
			score: number;
			maxScore: number;
			weight: number;
			details: Array<{
				name: string;
				score: number;
				maxScore: number;
				weight: number;
				status: "excellent" | "good" | "fair" | "poor";
				reason: string;
			}>;
			status: "excellent" | "good" | "fair" | "poor";
			reason: string;
		}>;
		insights: string[];
		recommendations: string[];
	};
};

type EnhancedCookieBannerTiming = {
	detected: boolean;
	selector: string | null;
	serviceName: string;
	visibilityTime: number | null;
	viewportCoverage: number;
};

type ThirdPartyMetrics = {
	cookieServices: {
		hosts: string[];
		totalSize: number;
		resourceCount: number;
		dnsLookupTime: number;
		connectionTime: number;
		downloadTime: number;
	};
	totalImpact: number;
};
