/** biome-ignore-all lint/suspicious/noConsole: its okay to show it working */
"use client";

import { DidomiSDK, type IDidomiObject } from "@didomi/react";
import { useCallback, useState } from "react";

const DEBUG_DIDOMI =
	process.env.NEXT_PUBLIC_DEBUG_DIDOMI === "true" ||
	process.env.DEBUG_DIDOMI === "true";
const TOKEN_VISIBLE_CHARS = 4;

function redactToken(token: string): string {
	if (!token) {
		return "****";
	}
	const last4 = token.slice(-TOKEN_VISIBLE_CHARS);
	return `****${last4}`;
}

export function DidomiClient() {
	const [didomiObject, setDidomiObject] = useState<IDidomiObject | null>(null);

	const onDidomiReady = useCallback((didomi: IDidomiObject) => {
		setDidomiObject(didomi);
		if (!DEBUG_DIDOMI) {
			return;
		}

		console.log("Didomi ready", {
			consentRequired: didomi.isConsentRequired(),
			vendor1Consent: didomi.getUserConsentStatusForVendor(1)
				? "granted"
				: "denied",
			vendor1CookiesConsent: didomi.getUserConsentStatus("cookies", 1)
				? "granted"
				: "denied",
		});
	}, []);

	const onConsentChanged = useCallback(
		(cwtToken: string) => {
			if (!(didomiObject && DEBUG_DIDOMI)) {
				return;
			}

			console.log("Didomi consent changed", {
				cwtToken: redactToken(cwtToken),
				consentRequired: didomiObject.isConsentRequired(),
				vendor1Consent: didomiObject.getUserConsentStatusForVendor(1)
					? "granted"
					: "denied",
				vendor1CookiesConsent: didomiObject.getUserConsentStatus("cookies", 1)
					? "granted"
					: "denied",
			});
		},
		[didomiObject]
	);

	const handleNoticeHidden = useCallback(() => {
		if (DEBUG_DIDOMI) {
			console.log("Didomi notice hidden");
		}
	}, []);

	const handleNoticeShown = useCallback(() => {
		if (DEBUG_DIDOMI) {
			console.log("Didomi notice shown");
		}
	}, []);

	return (
		<DidomiSDK
			apiKey="7dd8ec4e-746c-455e-a610-99121b4148df"
			embedTCFStub={true}
			gdprAppliesGlobally={true}
			iabVersion={2}
			onConsentChanged={onConsentChanged}
			onNoticeHidden={handleNoticeHidden}
			onNoticeShown={handleNoticeShown}
			onReady={onDidomiReady}
		/>
	);
}
