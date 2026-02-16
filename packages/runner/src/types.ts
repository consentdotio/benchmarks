import type { ChildProcess } from "node:child_process";
import type { BundleType } from "@consentio/benchmark";

export type {
	BundleType,
	BundleStrategy,
	CacheMode,
	Config,
	CookieBannerConfig,
	CookieBannerData,
	CookieBannerMetrics,
	CoreWebVitals,
	MeasurementConfig,
	NetworkMetrics,
	NetworkProfile,
	NetworkRequest,
	PerfumeMetrics,
	ResourceTimingData,
	RunProfile,
} from "@consentio/benchmark";

export type ServerInfo = {
	serverProcess: ChildProcess;
	url: string;
};

export type BenchmarkDetails = {
	duration: number;
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
	timing: {
		navigationStart: number;
		domContentLoaded: number;
		load: number;
		firstPaint: number;
		firstContentfulPaint: number;
		largestContentfulPaint: number;
		timeToInteractive: number;
		cumulativeLayoutShift: number;
		timeToFirstByte: number | null;
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
			domPresenceTime: number;
			userVisibleTime: number;
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
	dom?: {
		size?: number;
	};
	cookieBanner: {
		detected: boolean;
		selector: string | null;
		serviceName: string;
		visibilityTime: number | null;
		domPresenceTime: number;
		userVisibleTime: number;
		viewportCoverage: number;
	};
	thirdParty: {
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
};

export type MetricStatistics = {
	sampleCount: number;
	mean: number;
	p50: number;
	median: number;
	stddev: number;
	cv: number;
	min: number;
	max: number;
	p95: number;
	p99: number;
	ci95Low: number;
	ci95High: number;
};

export type BenchmarkStatistics = {
	fcp: MetricStatistics;
	lcp: MetricStatistics;
	tti: MetricStatistics;
	tbt: MetricStatistics;
	cls: MetricStatistics;
	ttfb: MetricStatistics;
	bannerVisibleTime: MetricStatistics;
};

export type BenchmarkQuality = {
	requestedIterations: number;
	successfulIterations: number;
	failedIterations: number;
	failureRate: number;
	minSuccessfulIterations: number;
	maxFailureRate: number;
	stabilityThresholdCv: number;
	stable: boolean;
	unstableMetrics: string[];
};

export type BenchmarkEnvironment = {
	chromiumVersion: string;
};

export type BenchmarkResult = {
	name: string;
	baseline: boolean;
	techStack: {
		bundler: string;
		bundleType: BundleType | BundleType[];
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
		timeToFirstByte: number;
		interactionToNextPaint: number;
		cumulativeLayoutShift: number;
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
		cookieBannerVisibleTime: number;
		cookieBannerDomPresenceTime: number;
		cookieBannerCoverage: number;
		scriptLoadTime: number;
	};
	statistics: BenchmarkStatistics;
	quality: BenchmarkQuality;
	environment: BenchmarkEnvironment;
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
		indexes?: {
			performanceIndex: number;
			governanceIndex: number;
			combinedIndex: number;
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
				status: "excellent" | "good" | "fair" | "poor" | "critical";
				reason: string;
			}>;
			status: "excellent" | "good" | "fair" | "poor" | "critical";
			reason: string;
		}>;
		insights: string[];
		recommendations: string[];
	};
};
