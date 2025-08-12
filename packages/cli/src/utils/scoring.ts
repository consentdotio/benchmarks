import Table from "cli-table3";
import type { BenchmarkScores } from '../types';

// Type definitions for better type safety
interface AppData {
	id?: number;
	name: string;
	baseline: boolean;
	company: string | null;
	techStack: string;
	source: string | null;
	tags: string | null;
}

interface MetricsData {
	fcp: number;
	lcp: number;
	cls: number;
	tti: number;
	tbt: number;
	totalSize: number;
	thirdPartySize: number;
	bannerVisibilityTime: number;
	viewportCoverage: number;
	resourceCount?: number;
	scriptLoadTime?: number;
	isBundled?: boolean;
	isIIFE?: boolean;
}

interface ResourceData {
	size: number;
	isThirdParty: boolean;
}

interface BenchmarkData {
	bannerRenderTime?: number;
	bannerInteractionTime?: number;
	layoutShift?: number;
}

interface TechStackData {
	languages: string[];
	frameworks: string[];
	bundler: string;
	bundleType: string;
	packageManager: string;
	typescript: boolean;
}

interface CompanyData {
	name?: string;
	avatar?: string;
}

interface SourceData {
	license?: string;
	github?: string;
	repository?: string;
	openSource?: boolean;
	type?: string;
}

interface CategoryScores {
	performance: number;
	bundleStrategy: number;
	networkImpact: number;
	transparency: number;
	userExperience: number;
}

interface ScoreDetail {
	metric: string;
	value: string | number;
	score: number;
	maxScore: number;
	reason: string;
}

interface ScoreWeights {
	performance: number;
	bundleStrategy: number;
	networkImpact: number;
	transparency: number;
	userExperience: number;
}

// Default scoring weights
const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
	performance: 0.4, // 40% - Core Web Vitals and performance metrics
	bundleStrategy: 0.25, // 25% - First-party vs third-party, bundling approach
	networkImpact: 0.2, // 20% - Network requests, bundle size, third-party impact
	transparency: 0.1, // 10% - Open source, company info, tech stack disclosure
	userExperience: 0.05, // 5% - Layout stability, interaction responsiveness
};

// Helper function to format time values
function formatTime(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

// Helper function to format byte values
function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return '0 bytes';
	}
	const k = 1024;
	const sizes = ['bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

// Helper function to determine if a solution is open source
function isOpenSourceSolution(
	app: AppData,
	sourceInfo: SourceData | null,
	tags: string
): boolean {
	// Check source information for open source indicators
	if (sourceInfo) {
		// Check for open source license
		const license = sourceInfo.license?.toLowerCase() || '';
		const openSourceLicenses = [
			'mit',
			'apache',
			'gpl',
			'bsd',
			'lgpl',
			'mpl',
			'isc',
			'unlicense',
			'cc0',
			'wtfpl',
			'zlib',
			'artistic',
			'epl',
			'cddl',
		];

		if (openSourceLicenses.some((lic) => license.includes(lic))) {
			return true;
		}

		// Check GitHub repository
		if (sourceInfo.github || sourceInfo.repository?.includes('github.com')) {
			return true;
		}

		// Check if explicitly marked as open source
		if (sourceInfo.openSource === true || sourceInfo.type === 'open-source') {
			return true;
		}
	}

	// Check tags for open source indicators
	const lowerTags = tags.toLowerCase();
	if (
		lowerTags.includes('open source') ||
		lowerTags.includes('opensource') ||
		lowerTags.includes('oss') ||
		lowerTags.includes('free') ||
		lowerTags.includes('community')
	) {
		return true;
	}

	// Check app name for known open source solutions
	const appName = app.name.toLowerCase();
	const knownOpenSource = [
		'c15t',
		'cookieconsent',
		'klaro',
		'tarteaucitron',
		'osano',
		'react-cookie-consent',
		'vanilla-cookieconsent',
		'baseline',
	];

	if (knownOpenSource.some((name) => appName.includes(name))) {
		return true;
	}

	return false;
}

// Helper function to parse tech stack
function parseTechStack(techStackJson: string): TechStackData {
	try {
		const techStack = JSON.parse(techStackJson);
		return {
			languages: techStack.languages || [],
			frameworks: techStack.frameworks || [],
			bundler: techStack.bundler || 'unknown',
			bundleType: techStack.bundleType || 'unknown',
			packageManager: techStack.packageManager || 'unknown',
			typescript: techStack.typescript || false,
		};
	} catch {
		return {
			languages: [],
			frameworks: [],
			bundler: 'unknown',
			bundleType: 'unknown',
			packageManager: 'unknown',
			typescript: false,
		};
	}
}

// Helper function to parse company info
function parseCompany(companyJson: string | null): CompanyData | null {
	if (!companyJson) {
		return null;
	}
	try {
		return JSON.parse(companyJson);
	} catch {
		return null;
	}
}

// Helper function to parse source info
function parseSource(sourceJson: string | null): SourceData | null {
	if (!sourceJson) {
		return null;
	}
	try {
		return JSON.parse(sourceJson);
	} catch {
		return null;
	}
}

// Calculate performance score (out of 100) with more sensitive thresholds
function calculatePerformanceScore(metrics: MetricsData): {
	score: number;
	maxScore: number;
	details: ScoreDetail[];
} {
	const details: ScoreDetail[] = [];
	let totalScore = 0;
	const maxScore = 100;

	// Ensure all metrics are finite numbers
	const fcp = Number.isFinite(metrics.fcp) ? metrics.fcp : 0;
	const lcp = Number.isFinite(metrics.lcp) ? metrics.lcp : 0;
	const cls = Number.isFinite(metrics.cls) ? metrics.cls : 0;
	const tti = Number.isFinite(metrics.tti) ? metrics.tti : 0;
	const tbt = Number.isFinite(metrics.tbt) ? metrics.tbt : 0;

	// FCP Score (20 points) - More sensitive for fast sites
	const fcpScore = fcp <= 50 ? 20 : fcp <= 100 ? 18 : fcp <= 200 ? 15 : fcp <= 500 ? 10 : 5;
	totalScore += fcpScore;
	details.push({
		metric: 'First Contentful Paint',
		value: formatTime(fcp),
		score: fcpScore,
		maxScore: 20,
		reason: fcp <= 50 ? 'Excellent' : fcp <= 100 ? 'Very Good' : fcp <= 200 ? 'Good' : fcp <= 500 ? 'Fair' : 'Poor',
	});

	// LCP Score (25 points) - More sensitive for banner rendering
	const lcpScore = lcp <= 100 ? 25 : lcp <= 300 ? 20 : lcp <= 500 ? 15 : lcp <= 1000 ? 10 : 5;
	totalScore += lcpScore;
	details.push({
		metric: 'Largest Contentful Paint',
		value: formatTime(lcp),
		score: lcpScore,
		maxScore: 25,
		reason: lcp <= 100 ? 'Excellent' : lcp <= 300 ? 'Very Good' : lcp <= 500 ? 'Good' : lcp <= 1000 ? 'Fair' : 'Poor',
	});

	// CLS Score (20 points)
	const clsScore = cls <= 0.01 ? 20 : cls <= 0.05 ? 15 : cls <= 0.1 ? 10 : cls <= 0.25 ? 5 : 0;
	totalScore += clsScore;
	details.push({
		metric: 'Cumulative Layout Shift',
		value: cls.toFixed(3),
		score: clsScore,
		maxScore: 20,
		reason: cls <= 0.01 ? 'Excellent' : cls <= 0.05 ? 'Very Good' : cls <= 0.1 ? 'Good' : cls <= 0.25 ? 'Fair' : 'Poor',
	});

	// TTI Score (20 points) - Cookie banners should be interactive quickly
	const ttiScore = tti <= 1000 ? 20 : tti <= 1500 ? 15 : tti <= 2000 ? 10 : tti <= 3000 ? 5 : 0;
	totalScore += ttiScore;
	details.push({
		metric: 'Time to Interactive',
		value: formatTime(tti),
		score: ttiScore,
		maxScore: 20,
		reason: tti <= 1000 ? 'Excellent' : tti <= 1500 ? 'Very Good' : tti <= 2000 ? 'Good' : tti <= 3000 ? 'Fair' : 'Poor',
	});

	// TBT Score (15 points) - Main thread blocking
	const tbtScore = tbt <= 50 ? 15 : tbt <= 200 ? 10 : tbt <= 500 ? 5 : 0;
	totalScore += tbtScore;
	details.push({
		metric: 'Total Blocking Time',
		value: formatTime(tbt),
		score: tbtScore,
		maxScore: 15,
		reason: tbt <= 50 ? 'Excellent' : tbt <= 200 ? 'Good' : tbt <= 500 ? 'Fair' : 'Poor',
	});

	return { score: totalScore, maxScore, details };
}

// Calculate bundle strategy score (out of 100)
function calculateBundleScore(
	metrics: MetricsData,
	techStack: TechStackData,
	resourceData: ResourceData[]
): {
	score: number;
	maxScore: number;
	details: ScoreDetail[];
} {
	const details: ScoreDetail[] = [];
	let totalScore = 0;
	const maxScore = 100;

	// Bundle strategy (40 points)
	const bundleScore = metrics.isBundled ? 40 : metrics.isIIFE ? 20 : 10;
	totalScore += bundleScore;
	details.push({
		metric: 'Bundle Strategy',
		value: metrics.isBundled ? 'Bundled' : metrics.isIIFE ? 'IIFE' : 'Unknown',
		score: bundleScore,
		maxScore: 40,
		reason: metrics.isBundled
			? 'First-party bundled'
			: metrics.isIIFE
				? 'External script'
				: 'Unknown strategy',
	});

	// Third-party dependency ratio (30 points)
	const thirdPartyResources = resourceData.filter((r) => r.isThirdParty);
	const thirdPartyRatio =
		thirdPartyResources.length / Math.max(resourceData.length, 1);
	const thirdPartyScore =
		thirdPartyRatio <= 0.1 ? 30 : thirdPartyRatio <= 0.3 ? 20 : thirdPartyRatio <= 0.5 ? 10 : 0;
	totalScore += thirdPartyScore;
	details.push({
		metric: 'Third-party Dependencies',
		value: `${thirdPartyResources.length}/${resourceData.length}`,
		score: thirdPartyScore,
		maxScore: 30,
		reason:
			thirdPartyRatio <= 0.1
				? 'Minimal third-party'
				: thirdPartyRatio <= 0.3
					? 'Low third-party'
					: thirdPartyRatio <= 0.5
						? 'Moderate third-party'
						: 'Heavy third-party',
	});

	// Modern bundler (20 points)
	const modernBundlers = [
		'webpack',
		'vite',
		'rollup',
		'esbuild',
		'turbopack',
		'rspack',
		'rslib',
		'nextjs',
	];
	const bundlerScore =
		techStack && modernBundlers.includes(techStack.bundler.toLowerCase())
			? 20
			: 10;
	totalScore += bundlerScore;
	details.push({
		metric: 'Bundler',
		value: techStack?.bundler || 'Unknown',
		score: bundlerScore,
		maxScore: 20,
		reason:
			techStack && modernBundlers.includes(techStack.bundler.toLowerCase())
				? 'Modern bundler'
				: 'Legacy/unknown bundler',
	});

	// TypeScript usage (10 points)
	const tsScore = techStack?.typescript ? 10 : 0;
	totalScore += tsScore;
	details.push({
		metric: 'TypeScript',
		value: techStack?.typescript ? 'Yes' : 'No',
		score: tsScore,
		maxScore: 10,
		reason: techStack?.typescript ? 'Type safety' : 'No type safety',
	});

	return { score: totalScore, maxScore, details };
}

// Calculate network impact score (out of 100)
function calculateNetworkScore(
	metrics: MetricsData,
): {
	score: number;
	maxScore: number;
	details: ScoreDetail[];
} {
	const details: ScoreDetail[] = [];
	let totalScore = 0;
	const maxScore = 100;

	// Ensure metrics are finite numbers
	const totalSize = Number.isFinite(metrics.totalSize) ? metrics.totalSize : 0;
	const thirdPartySize = Number.isFinite(metrics.thirdPartySize) ? metrics.thirdPartySize : 0;
	const resourceCount = Number.isFinite(metrics.resourceCount)
		? metrics.resourceCount || 0
		: 0;
	const scriptLoadTime = Number.isFinite(metrics.scriptLoadTime)
		? metrics.scriptLoadTime || 0
		: 0;

	// Total size impact (35 points) - More sensitive for lightweight solutions
	const totalSizeKB = totalSize / 1024;
	const sizeScore =
		totalSizeKB <= 50 ? 35 : totalSizeKB <= 100 ? 25 : totalSizeKB <= 200 ? 15 : totalSizeKB <= 500 ? 10 : 5;
	totalScore += sizeScore;
	details.push({
		metric: 'Total Bundle Size',
		value: formatBytes(totalSize),
		score: sizeScore,
		maxScore: 35,
		reason:
			totalSizeKB <= 50
				? 'Ultra lightweight'
				: totalSizeKB <= 100
					? 'Lightweight'
					: totalSizeKB <= 200
						? 'Moderate'
						: totalSizeKB <= 500
							? 'Heavy'
							: 'Very heavy',
	});

	// Third-party size impact (25 points)
	const thirdPartySizeKB = thirdPartySize / 1024;
	const thirdPartyNetworkScore =
		thirdPartySizeKB === 0 ? 25 : thirdPartySizeKB <= 50 ? 15 : thirdPartySizeKB <= 100 ? 10 : 5;
	totalScore += thirdPartyNetworkScore;
	details.push({
		metric: 'Third-party Size',
		value: formatBytes(thirdPartySize),
		score: thirdPartyNetworkScore,
		maxScore: 25,
		reason:
			thirdPartySizeKB === 0
				? 'Zero third-party'
				: thirdPartySizeKB <= 50
					? 'Minimal third-party'
					: thirdPartySizeKB <= 100
						? 'Moderate third-party'
						: 'Heavy third-party',
	});

	// Network requests (25 points)
	const requestScore =
		resourceCount <= 3 ? 25 : resourceCount <= 5 ? 20 : resourceCount <= 10 ? 15 : resourceCount <= 15 ? 10 : 5;
	totalScore += requestScore;
	details.push({
		metric: 'Network Requests',
		value: resourceCount.toString(),
		score: requestScore,
		maxScore: 25,
		reason:
			resourceCount <= 3
				? 'Minimal requests'
				: resourceCount <= 5
					? 'Low requests'
					: resourceCount <= 10
						? 'Moderate requests'
						: resourceCount <= 15
							? 'Many requests'
							: 'Too many requests',
	});

	// Script load time (15 points)
	const scriptScore =
		scriptLoadTime <= 50 ? 15 : scriptLoadTime <= 100 ? 10 : scriptLoadTime <= 200 ? 5 : 0;
	totalScore += scriptScore;
	details.push({
		metric: 'Script Load Time',
		value: formatTime(scriptLoadTime),
		score: scriptScore,
		maxScore: 15,
		reason:
			scriptLoadTime <= 50
				? 'Very fast loading'
				: scriptLoadTime <= 100
					? 'Fast loading'
					: scriptLoadTime <= 200
						? 'Moderate loading'
						: 'Slow loading',
	});

	return { score: totalScore, maxScore, details };
}

// Calculate transparency score (out of 100)
function calculateTransparencyScore(
	isOpenSource: boolean,
	company: CompanyData | null,
	techStack: TechStackData
): {
	score: number;
	maxScore: number;
	details: ScoreDetail[];
} {
	const details: ScoreDetail[] = [];
	let totalScore = 0;
	const maxScore = 100;

	// Open source bonus (60 points)
	const openSourceScore = isOpenSource ? 60 : 0;
	totalScore += openSourceScore;
	details.push({
		metric: 'Open Source',
		value: isOpenSource ? 'Yes' : 'No',
		score: openSourceScore,
		maxScore: 60,
		reason: isOpenSource ? 'Transparent & auditable' : 'Proprietary solution',
	});

	// Company transparency (25 points)
	const companyScore = company ? 25 : 10;
	totalScore += companyScore;
	details.push({
		metric: 'Company Info',
		value: company ? 'Available' : 'Limited',
		score: companyScore,
		maxScore: 25,
		reason: company ? 'Clear attribution' : 'Limited transparency',
	});

	// Tech stack disclosure (15 points)
	const techScore = techStack && techStack.bundler !== 'unknown' ? 15 : 5;
	totalScore += techScore;
	details.push({
		metric: 'Tech Stack',
		value: techStack ? 'Disclosed' : 'Unknown',
		score: techScore,
		maxScore: 15,
		reason: techStack && techStack.bundler !== 'unknown' ? 'Technical transparency' : 'Limited tech info',
	});

	return { score: totalScore, maxScore, details };
}

// Calculate user experience score (out of 100)
function calculateUXScore(
	metrics: MetricsData,
	benchmarkData: BenchmarkData
): {
	score: number;
	maxScore: number;
	details: ScoreDetail[];
} {
	const details: ScoreDetail[] = [];
	let totalScore = 0;
	const maxScore = 100;

	// Layout stability (40 points)
	const cls = Number.isFinite(metrics.cls) ? metrics.cls : 0;
	const clsScore = cls <= 0.01 ? 40 : cls <= 0.05 ? 30 : cls <= 0.1 ? 20 : cls <= 0.25 ? 10 : 0;
	totalScore += clsScore;
	details.push({
		metric: 'Layout Stability',
		value: cls.toFixed(3),
		score: clsScore,
		maxScore: 40,
		reason:
			cls <= 0.01
				? 'No layout shifts'
				: cls <= 0.05
					? 'Minimal shifts'
					: cls <= 0.1
						? 'Minor shifts'
						: cls <= 0.25
							? 'Some shifts'
							: 'Significant shifts',
	});

	// Banner render time (35 points)
	const renderTime = Number.isFinite(benchmarkData.bannerRenderTime)
		? benchmarkData.bannerRenderTime || 0
		: metrics.bannerVisibilityTime || 0;
	const renderScore = renderTime <= 25 ? 35 : renderTime <= 50 ? 25 : renderTime <= 100 ? 15 : renderTime <= 200 ? 10 : 5;
	totalScore += renderScore;
	details.push({
		metric: 'Banner Render Time',
		value: formatTime(renderTime),
		score: renderScore,
		maxScore: 35,
		reason:
			renderTime <= 25
				? 'Instant render'
				: renderTime <= 50
					? 'Very fast render'
					: renderTime <= 100
						? 'Fast render'
						: renderTime <= 200
							? 'Moderate render'
							: 'Slow render',
	});

	// Viewport coverage impact (25 points)
	const coverage = Number.isFinite(metrics.viewportCoverage) ? metrics.viewportCoverage : 0;
	const coverageScore = coverage <= 10 ? 25 : coverage <= 20 ? 20 : coverage <= 30 ? 15 : coverage <= 50 ? 10 : 5;
	totalScore += coverageScore;
	details.push({
		metric: 'Viewport Coverage',
		value: `${coverage.toFixed(1)}%`,
		score: coverageScore,
		maxScore: 25,
		reason:
			coverage <= 10
				? 'Minimal intrusion'
				: coverage <= 20
					? 'Low intrusion'
					: coverage <= 30
						? 'Moderate intrusion'
						: coverage <= 50
							? 'High intrusion'
							: 'Very intrusive',
	});

	return { score: totalScore, maxScore, details };
}

// Generate insights based on scores
function generateInsights(
	categoryScores: CategoryScores,
	metrics: MetricsData,
	resourceData: ResourceData[],
	isOpenSource: boolean
): string[] {
	const insights: string[] = [];

	// Performance insights
	if (categoryScores.performance >= 90) {
		insights.push(
			'Outstanding performance metrics across all Core Web Vitals.'
		);
	} else if (categoryScores.performance < 60) {
		insights.push(
			'Performance optimization needed - focus on reducing load times and layout shifts.'
		);
	}

	// Bundle strategy insights
	if (metrics.isBundled) {
		insights.push(
			'Excellent bundle strategy - first-party bundling reduces network overhead and improves reliability.'
		);
	} else if (metrics.isIIFE) {
		insights.push(
			'Consider bundling strategy to reduce third-party dependencies and improve performance.'
		);
	}

	// Open source insights
	if (!isOpenSource) {
		insights.push(
			'Consider open source alternatives for better transparency and community support.'
		);
	} else {
		insights.push(
			'Open source solution provides transparency and community-driven development.'
		);
	}

	// Network insights
	const thirdPartyResources = resourceData.filter((r) => r.isThirdParty);
	if (thirdPartyResources.length === 0) {
		insights.push(
			'Zero third-party dependencies minimize privacy concerns and improve reliability.'
		);
	} else if (thirdPartyResources.length > 5) {
		insights.push(
			'High number of third-party requests may impact performance and privacy.'
		);
	}

	return insights;
}

// Generate recommendations based on scores
function generateRecommendations(
	categoryScores: CategoryScores,
	metrics: MetricsData,
	resourceData: ResourceData[]
): string[] {
	const recommendations: string[] = [];

	// Performance recommendations
	if (categoryScores.performance < 80) {
		if (metrics.fcp > 100) {
			recommendations.push(
				'Optimize First Contentful Paint by reducing render-blocking resources.'
			);
		}
		if (metrics.lcp > 300) {
			recommendations.push(
				'Improve Largest Contentful Paint by optimizing critical resource loading.'
			);
		}
		if (metrics.cls > 0.05) {
			recommendations.push(
				'Reduce Cumulative Layout Shift by reserving space for dynamic content.'
			);
		}
		if (metrics.tbt > 50) {
			recommendations.push(
				'Reduce Total Blocking Time by optimizing JavaScript execution.'
			);
		}
	}

	// Bundle strategy recommendations
	if (categoryScores.bundleStrategy < 70) {
		if (!metrics.isBundled) {
			recommendations.push(
				'Consider bundling cookie consent code with your main application bundle.'
			);
		}
		const thirdPartyRatio =
			resourceData.filter((r) => r.isThirdParty).length /
			Math.max(resourceData.length, 1);
		if (thirdPartyRatio > 0.3) {
			recommendations.push(
				'Reduce third-party dependencies to improve reliability and performance.'
			);
		}
	}

	// Network recommendations
	if (categoryScores.networkImpact < 70) {
		if (metrics.totalSize > 100 * 1024) {
			recommendations.push(
				'Reduce bundle size through code splitting and tree shaking.'
			);
		}
		if (metrics.thirdPartySize > 0) {
			recommendations.push(
				'Eliminate or reduce third-party resources for better performance.'
			);
		}
	}

	return recommendations;
}

// Get score grade based on total score
function getScoreGrade(score: number): BenchmarkScores['grade'] {
	if (score >= 90) return 'Excellent';
	if (score >= 80) return 'Good';
	if (score >= 70) return 'Fair';
	if (score >= 60) return 'Poor';
	return 'Critical';
}

// Get category status based on score percentage
function getCategoryStatus(
	score: number,
	maxScore: number
): 'excellent' | 'good' | 'fair' | 'poor' {
	const percentage = (score / maxScore) * 100;
	if (percentage >= 90) return 'excellent';
	if (percentage >= 75) return 'good';
	if (percentage >= 60) return 'fair';
	return 'poor';
}

// Main scoring function with CLI-compatible interface
export function calculateScores(
	metrics: {
		fcp: number;
		lcp: number;
		cls: number;
		tbt: number;
		tti: number;
	},
	bundleMetrics: {
		totalSize: number;
		jsSize: number;
		cssSize: number;
		imageSize: number;
		fontSize: number;
		otherSize: number;
	},
	networkMetrics: {
		totalRequests: number;
		thirdPartyRequests: number;
		thirdPartySize: number;
		thirdPartyDomains: number;
	},
	transparencyMetrics: {
		cookieBannerDetected: boolean;
		cookieBannerTiming: number | null;
		cookieBannerCoverage: number;
	},
	userExperienceMetrics: {
		domSize: number;
		mainThreadBlocking: number;
		layoutShifts: number;
	},
	isBaseline = false,
	appData?: AppData
): BenchmarkScores {
	if (isBaseline) {
		return {
			totalScore: 100,
			grade: 'Excellent',
			categoryScores: {
				performance: 100,
				bundleStrategy: 100,
				networkImpact: 100,
				transparency: 100,
				userExperience: 100,
			},
			categories: [
				{
					name: 'Performance',
					score: 100,
					maxScore: 100,
					weight: 1,
					details: [
						{
							name: 'Core Web Vitals',
							score: 100,
							maxScore: 100,
							weight: 1,
							status: 'good',
							reason: 'Baseline measurement',
						},
					],
					status: 'good',
					reason: 'Baseline measurement',
				},
				{
					name: 'Bundle Strategy',
					score: 100,
					maxScore: 100,
					weight: 1,
					details: [
						{
							name: 'Bundle Size',
							score: 100,
							maxScore: 100,
							weight: 1,
							status: 'good',
							reason: 'Baseline measurement',
						},
					],
					status: 'good',
					reason: 'Baseline measurement',
				},
				{
					name: 'Network Impact',
					score: 100,
					maxScore: 100,
					weight: 1,
					details: [
						{
							name: 'Network Requests',
							score: 100,
							maxScore: 100,
							weight: 1,
							status: 'good',
							reason: 'Baseline measurement',
						},
					],
					status: 'good',
					reason: 'Baseline measurement',
				},
				{
					name: 'Transparency',
					score: 100,
					maxScore: 100,
					weight: 1,
					details: [
						{
							name: 'Cookie Banner',
							score: 100,
							maxScore: 100,
							weight: 1,
							status: 'good',
							reason: 'Baseline measurement',
						},
					],
					status: 'good',
					reason: 'Baseline measurement',
				},
				{
					name: 'User Experience',
					score: 100,
					maxScore: 100,
					weight: 1,
					details: [
						{
							name: 'User Experience',
							score: 100,
							maxScore: 100,
							weight: 1,
							status: 'good',
							reason: 'Baseline measurement',
						},
					],
					status: 'good',
					reason: 'Baseline measurement',
				},
			],
			insights: [],
			recommendations: [],
		};
	}

	// Create app data structure
	const app: AppData = appData || {
		name: 'unknown',
		baseline: false,
		company: null,
		techStack: '{}',
		source: null,
		tags: null,
	};

	// Create metrics data
	const metricsData: MetricsData = {
		fcp: metrics.fcp,
		lcp: metrics.lcp,
		cls: metrics.cls,
		tti: metrics.tti,
		tbt: metrics.tbt,
		totalSize: bundleMetrics.totalSize,
		thirdPartySize: networkMetrics.thirdPartySize,
		bannerVisibilityTime: transparencyMetrics.cookieBannerTiming || 0,
		viewportCoverage: transparencyMetrics.cookieBannerCoverage * 100,
		resourceCount: networkMetrics.totalRequests,
		scriptLoadTime: 0, // TODO: Calculate from timing data
		isBundled: networkMetrics.thirdPartyRequests === 0,
		isIIFE: networkMetrics.thirdPartyRequests > 0,
	};

	// Create mock resource data
	const resourceData: ResourceData[] = [
		{ size: bundleMetrics.jsSize, isThirdParty: false },
		{ size: bundleMetrics.cssSize, isThirdParty: false },
		...Array(networkMetrics.thirdPartyRequests).fill({ size: networkMetrics.thirdPartySize / Math.max(networkMetrics.thirdPartyRequests, 1), isThirdParty: true }),
	];

	// Create benchmark data
	const benchmarkData: BenchmarkData = {
		bannerRenderTime: transparencyMetrics.cookieBannerTiming || 0,
		bannerInteractionTime: userExperienceMetrics.mainThreadBlocking,
		layoutShift: userExperienceMetrics.layoutShifts,
	};

	// Parse app data
	const techStack = parseTechStack(app.techStack);
	const company = parseCompany(app.company);
	const sourceInfo = parseSource(app.source);
	const tags = app.tags || '';
	const isOpenSource = isOpenSourceSolution(app, sourceInfo, tags);

	// Calculate individual category scores
	const performanceScore = calculatePerformanceScore(metricsData);
	const bundleScore = calculateBundleScore(metricsData, techStack, resourceData);
	const networkScore = calculateNetworkScore(metricsData);
	const transparencyScore = calculateTransparencyScore(
		isOpenSource,
		company,
		techStack
	);
	const uxScore = calculateUXScore(metricsData, benchmarkData);

	// Calculate weighted total score using more balanced weights
	const weights = DEFAULT_SCORE_WEIGHTS;
	const totalScore = Math.round(
		(performanceScore.score / performanceScore.maxScore) *
			100 *
			weights.performance +
			(bundleScore.score / bundleScore.maxScore) *
				100 *
				weights.bundleStrategy +
			(networkScore.score / networkScore.maxScore) *
				100 *
				weights.networkImpact +
			(transparencyScore.score / transparencyScore.maxScore) *
				100 *
				weights.transparency +
			(uxScore.score / uxScore.maxScore) * 100 * weights.userExperience
	);

	// Create category scores
	const categoryScores = {
		performance: Math.round((performanceScore.score / performanceScore.maxScore) * 100),
		bundleStrategy: Math.round((bundleScore.score / bundleScore.maxScore) * 100),
		networkImpact: Math.round((networkScore.score / networkScore.maxScore) * 100),
		transparency: Math.round((transparencyScore.score / transparencyScore.maxScore) * 100),
		userExperience: Math.round((uxScore.score / uxScore.maxScore) * 100),
	};

	// Create score categories
	const categories = [
		{
			name: 'Performance',
			score: performanceScore.score,
			maxScore: performanceScore.maxScore,
			weight: weights.performance,
			details: performanceScore.details.map(d => ({
				name: d.metric,
				score: d.score,
				maxScore: d.maxScore,
				weight: 1,
				status: getCategoryStatus(d.score, d.maxScore),
				reason: d.reason,
			})),
			status: getCategoryStatus(performanceScore.score, performanceScore.maxScore),
			reason: `Performance score: ${performanceScore.score}/${performanceScore.maxScore}`,
		},
		{
			name: 'Bundle Strategy',
			score: bundleScore.score,
			maxScore: bundleScore.maxScore,
			weight: weights.bundleStrategy,
			details: bundleScore.details.map(d => ({
				name: d.metric,
				score: d.score,
				maxScore: d.maxScore,
				weight: 1,
				status: getCategoryStatus(d.score, d.maxScore),
				reason: d.reason,
			})),
			status: getCategoryStatus(bundleScore.score, bundleScore.maxScore),
			reason: `Bundle strategy score: ${bundleScore.score}/${bundleScore.maxScore}`,
		},
		{
			name: 'Network Impact',
			score: networkScore.score,
			maxScore: networkScore.maxScore,
			weight: weights.networkImpact,
			details: networkScore.details.map(d => ({
				name: d.metric,
				score: d.score,
				maxScore: d.maxScore,
				weight: 1,
				status: getCategoryStatus(d.score, d.maxScore),
				reason: d.reason,
			})),
			status: getCategoryStatus(networkScore.score, networkScore.maxScore),
			reason: `Network impact score: ${networkScore.score}/${networkScore.maxScore}`,
		},
		{
			name: 'Transparency',
			score: transparencyScore.score,
			maxScore: transparencyScore.maxScore,
			weight: weights.transparency,
			details: transparencyScore.details.map(d => ({
				name: d.metric,
				score: d.score,
				maxScore: d.maxScore,
				weight: 1,
				status: getCategoryStatus(d.score, d.maxScore),
				reason: d.reason,
			})),
			status: getCategoryStatus(transparencyScore.score, transparencyScore.maxScore),
			reason: `Transparency score: ${transparencyScore.score}/${transparencyScore.maxScore}`,
		},
		{
			name: 'User Experience',
			score: uxScore.score,
			maxScore: uxScore.maxScore,
			weight: weights.userExperience,
			details: uxScore.details.map(d => ({
				name: d.metric,
				score: d.score,
				maxScore: d.maxScore,
				weight: 1,
				status: getCategoryStatus(d.score, d.maxScore),
				reason: d.reason,
			})),
			status: getCategoryStatus(uxScore.score, uxScore.maxScore),
			reason: `User experience score: ${uxScore.score}/${uxScore.maxScore}`,
		},
	];

	// Generate insights and recommendations
	const insights = generateInsights(
		categoryScores,
		metricsData,
		resourceData,
		isOpenSource
	);
	const recommendations = generateRecommendations(
		categoryScores,
		metricsData,
		resourceData
	);

	return {
		totalScore,
		grade: getScoreGrade(totalScore),
		categoryScores,
		categories,
		insights,
		recommendations,
	};
}

// Function to print scores in a table format
export function printScores(scores: BenchmarkScores): void {
	// Create a table for overall scores
	const overallTable = new Table({
		head: ['Category', 'Score', 'Status'],
		style: { head: ['cyan'] },
	});

	// Add overall score
	overallTable.push([
		'Overall',
		`${scores.totalScore}/100`,
		scores.grade,
	]);

	// Add category scores
	for (const category of scores.categories) {
		overallTable.push([
			category.name,
			`${category.score}/100`,
			category.status,
		]);
	}

	console.log('\nOverall Scores:');
	console.log(overallTable.toString());

	// Create a table for detailed scores
	const detailsTable = new Table({
		head: ['Category', 'Metric', 'Score', 'Reason'],
		style: { head: ['cyan'] },
	});

	// Add detailed scores
	for (const category of scores.categories) {
		for (const detail of category.details) {
			detailsTable.push([
				category.name,
				detail.name,
				`${detail.score}/100`,
				detail.reason,
			]);
		}
	}

	console.log('\nDetailed Scores:');
	console.log(detailsTable.toString());

	// Print insights
	if (scores.insights.length > 0) {
		console.log('\nInsights:');
		for (const insight of scores.insights) {
			console.log(`• ${insight}`);
		}
	}

	// Print recommendations
	if (scores.recommendations.length > 0) {
		console.log('\nRecommendations:');
		for (const recommendation of scores.recommendations) {
			console.log(`• ${recommendation}`);
		}
	}
}
