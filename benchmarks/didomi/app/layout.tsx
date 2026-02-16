import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DidomiClient } from "./didomi-client";

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
			<body>
				<DidomiClient />
				{children}
			</body>
		</html>
	);
}
