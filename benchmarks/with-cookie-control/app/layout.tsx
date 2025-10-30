import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "benchmark",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* Cookie Control Script */}
				<script
					src="https://cc.cdn.civiccomputing.com/9/cookieControl-9.10.1.min.js"
					type="text/javascript"
				/>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: its okay to set inner html
					dangerouslySetInnerHTML={{
						__html: `
							var config = {
								apiKey: 'ce6586e299e7333a8c22432a32c1972fd859a49c',
								product: 'COMMUNITY',
								optionalCookies: [
									{
										"name": "analytics",
										"label": "Analytical Cookies",
										"description": "Analytical cookies help us to improve our website by collecting and reporting information on its usage.",
										"cookies": [],
										"onAccept": function () {},
										"onRevoke": function () {}
									},
									{
										"name": "marketing",
										"label": "Marketing Cookies",
										"description": "We use marketing cookies to help us improve the relevancy of advertising campaigns you receive.",
										"cookies": [],
										"onAccept": function () {},
										"onRevoke": function () {}
									}
								]
							};

							CookieControl.load(config);
						`,
					}}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: its okay to set inner html
					type="text/javascript"
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
