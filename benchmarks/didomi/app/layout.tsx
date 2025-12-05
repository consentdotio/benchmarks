/** biome-ignore-all lint/suspicious/noConsole: its okay to show it working */
"use client";

import { DidomiSDK, type IDidomiObject } from "@didomi/react";
import { type ReactNode, useCallback, useState } from "react";

export default function RootLayout({
	children,
}: Readonly<{
	children: ReactNode;
}>) {
	const [didomiObject, setDidomiObject] = useState<IDidomiObject | null>(null);

	const onDidomiReady = useCallback((didomi: IDidomiObject) => {
		setDidomiObject(didomi);
		console.log(
			"Didomi Ready - Is consent required?:",
			didomi.isConsentRequired()
		);
		console.log(
			"Didomi Ready - Consent for vendor IAB 1:",
			didomi.getUserConsentStatusForVendor(1)
		);
		console.log(
			"Didomi Ready - Consent for vendor IAB 1 and cookies:",
			didomi.getUserConsentStatus("cookies", 1)
		);
	}, []);

	const onConsentChanged = useCallback(
		(cwtToken: string) => {
			if (!didomiObject) {
				return;
			}
			console.log("Didomi Consent Changed - cwtToken:", cwtToken);
			console.log(
				"Didomi Consent Changed - Is consent required?:",
				didomiObject.isConsentRequired()
			);
			console.log(
				"Didomi Consent Changed - Consent for vendor IAB 1:",
				didomiObject.getUserConsentStatusForVendor(1)
			);
			console.log(
				"Didomi Consent Changed - Consent for vendor IAB 1 and cookies:",
				didomiObject.getUserConsentStatus("cookies", 1)
			);
		},
		[didomiObject]
	);

	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<DidomiSDK
					apiKey="7dd8ec4e-746c-455e-a610-99121b4148df"
					embedTCFStub={true}
					gdprAppliesGlobally={true}
					iabVersion={2}
					onConsentChanged={onConsentChanged}
					onNoticeHidden={() => console.log("Didomi Notice Hidden")}
					onNoticeShown={() => console.log("Didomi Notice Shown")}
					onReady={onDidomiReady}
				/>
				{children}
			</body>
		</html>
	);
}
