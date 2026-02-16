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
					src="https://app.enzuzo.com/scripts/cookiebar/ede431e2-968b-11eb-9cc0-2358d2c9e564"
					type="text/javascript"
				/>
				{/* <script
					type="text/javascript"
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
				/> */}
			</head>
			<body>{children}</body>
		</html>
	);
}
