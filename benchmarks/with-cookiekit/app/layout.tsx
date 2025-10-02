'use client';

/*
 * If you're using Next.js, we recommend installing the @c15t/nextjs package.
 * The Next.js package is a wrapper around the React package that provides
 * additional features for Next.js.
 */

import {
	CookieManager
} from 'react-cookie-manager';
import type { ReactNode } from 'react';


export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<CookieManager>{children}</CookieManager>
			</body>
		</html>
	);
}
