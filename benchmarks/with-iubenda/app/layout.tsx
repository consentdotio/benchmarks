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
				{/* Iubenda Cookie Banner + Configuration */}
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: its okay to set inner html
					dangerouslySetInnerHTML={{
						__html: `
							window._iub = window._iub || [];

							_iub.csConfiguration = {
								cookiePolicyId: 252372,
								siteId: 1,
								lang: 'en',
								logLevel: 'error',
								enableRemoteConsent: false,
								consentOnScroll: false,
								enableUspr: true,
								enableLgpd: true,
								countryDetection: true,
								perPurposeConsent: true,
								whitelabel: false,
								googleUrlPassthrough: true,
								floatingPreferencesButtonDisplay: true,
								consentOnContinuedBrowsing: false,
								promptToAcceptOnBlockedElements: true,
								hasEmailMarketing: true,
								emailMarketing: {
									styles:{
										backgroundColor:'#FFFFFF',
										buttonsBackgroundColor:'#0073CE',
										buttonsTextColor:'#FFFFFF',
										footerBackgroundColor:'#1CC691',
										footerTextColor:'#FFFFFF',
										textColor:'#000000'
									},
									customI18n:{
										step1:{
											title:'Useful compliance updates, sent monthly',
											body: 'Join over 500,000 subscribers and get a monthly 3-minute email with updates on privacy laws and our products. Cancel any time.'
										},
										successMessage: "We've just sent you an email. You'll need to confirm your subscription before you get our newsletter."
									}
								},
								banner: {
									position: "float-top-center",
									acceptButtonDisplay: true,
									customizeButtonDisplay: true,
									rejectButtonDisplay: true,
									useCustomBrand: true,
									brandTextColor: "#FFF",
									brandBackgroundColor: "#1CC691",
									acceptButtonColor: "#0073CE",
									acceptButtonCaptionColor: "white",
									customizeButtonColor: "#DADADA",
									customizeButtonCaptionColor: "#4D4D4D",
									rejectButtonColor: "#0073CE",
									rejectButtonCaptionColor: "white",
									textColor: "black",
									backgroundColor: "white",
									logo: "/assets/site/general/logo-whiteongreen-18a11ce988ecc91e9cd5433bcdc55e4023983ea75b8542ca108728f511881cf1.svg",
									closeButtonRejects: true,
									prependOnBody: true
								}
							};
						`,
					}}
				/>
				<script
					async
					charSet="UTF-8"
					src="https://cdn.iubenda.com/cs/iubenda_cs.js"
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
