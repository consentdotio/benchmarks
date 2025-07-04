import type { Metadata } from 'next';

/*
 * If you're using Next.js, we recommend installing the @c15t/nextjs package.
 * The Next.js package is a wrapper around the React package that provides
 * additional features for Next.js.
 */
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
			<body>{children}</body>
		</html>
	);
}
