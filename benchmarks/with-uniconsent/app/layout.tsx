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
				{/* biome-ignore lint/nursery/noSyncScripts: UniConsent's install snippet requires synchronous stubs before the CMP script. */}
				<script src="https://cmp.uniconsent.com/v2/stub.min.js" />
				{/* biome-ignore lint/nursery/noSyncScripts: UniConsent's install snippet requires synchronous stubs before the CMP script. */}
				<script src="https://cmp.uniconsent.com/v2/stubgcm.min.js" />
				<script async src="https://cmp.uniconsent.com/v2/d73d9ba530/cmp.js" />
			</head>
			<body>{children}</body>
		</html>
	);
}
