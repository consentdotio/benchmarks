import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	images: {
		localPatterns: [
			{
				pathname: "/**",
				search: "",
			},
		],
		minimumCacheTTL: 60,
	},
};

export default nextConfig;
