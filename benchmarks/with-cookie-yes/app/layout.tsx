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
				{/* Iubenda Cookie Banner + Configuration */}
				<script id="cookieyes" type="text/javascript" src="https://cdn-cookieyes.com/client_data/830009093fab466a1ff5d9a1/script.js" />
			</head>
			<body>{children}</body>
		</html>
	);
}
