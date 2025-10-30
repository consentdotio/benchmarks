// Re-export types from runner package
export type {
	BenchmarkDetails,
	BenchmarkResult,
	Config,
	ServerInfo,
} from "@consentio/runner";

// CLI-specific scoring types
export type BenchmarkScores = {
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
