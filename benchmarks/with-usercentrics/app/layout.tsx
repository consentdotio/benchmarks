import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
	title: 'benchmark',
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
					src="https://web.cmp.usercentrics.eu/ui/loader.js"
					id="usercentrics-cmp"
					data-ruleset-id="NFEcTLx7a"
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
