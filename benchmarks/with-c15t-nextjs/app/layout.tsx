import type { Metadata } from 'next';

/*
 * If you're using Next.js, we recommend installing the @c15t/nextjs package.
 * The Next.js package is a wrapper around the React package that provides
 * additional features for Next.js.
 */

import {
	ConsentManagerDialog,
	ConsentManagerProvider,
	CookieBanner,
} from '@c15t/nextjs';
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
			<body>
				<ConsentManagerProvider
					options={{
						mode: 'c15t',
						backendURL: 'https://consent-io-europe-benchmarks.c15t.dev',
					}}
				>
					<CookieBanner />
					<ConsentManagerDialog />
					{children}
				</ConsentManagerProvider>
			</body>
		</html>
	);
}
