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
				<script
					async
					charSet="UTF-8"
					data-domain-script="fff8df06-1dd2-491b-88f6-01cae248cd17"
					src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
				/>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: its okay to set inner html
					dangerouslySetInnerHTML={{ __html: "function OptanonWrapper() {}" }}
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
