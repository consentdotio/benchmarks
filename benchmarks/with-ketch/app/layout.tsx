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
					type="text/javascript"
					src="https://global.ketchcdn.com/web/v3/config/switchbitcorp/switchbit/boot.js"
					async
					defer
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
