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
			</head>
			<body>{children}</body>
		</html>
	);
}
