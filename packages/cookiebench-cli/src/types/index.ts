// Re-export types from runner package
export type {
	BenchmarkDetails,
	BenchmarkResult,
	Config,
	ServerInfo,
} from "@consentio/runner";

export type ScoreLevel = "excellent" | "good" | "fair" | "poor" | "critical";
export type ScoreStatus = ScoreLevel;
export type ScoreGrade = Capitalize<ScoreLevel>;

// CLI-specific scoring types
export type BenchmarkScores = {
	totalScore: number;
	grade: ScoreGrade;
	indexes: {
		performanceIndex: number;
		governanceIndex: number;
		combinedIndex: number;
	};
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
			value?: string | number;
			score: number;
			maxScore: number;
			weight: number;
			status: ScoreStatus;
			reason: string;
		}>;
		status: ScoreStatus;
		reason: string;
	}>;
	insights: string[];
	recommendations: string[];
};
