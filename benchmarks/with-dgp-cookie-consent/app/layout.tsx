import type { Metadata } from 'next';
import Script from 'next/script';
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
				{/** Add custom styles to consent-dialog to allow benchmarking, cuz selecting elements inside shadow DOM is not yet supported */}
				<style>{`consent-dialog { display: block; }`}</style>
				<Script
					id="dgp-cookie-consent-config"
                    type="text/javascript"
                    strategy="beforeInteractive"
				>
                    {`
                    window.CookieConsentTranslations = {
                        locale: 'en-US',
                        tabAgree: {
                            title: 'Consent',
                            body: '<p><strong>This website uses cookies</strong></p><p>We use cookies to personalize content and ads, provide social media features, and analyze our traffic.</p>',
                        },
                        tabAbout: {
                            title: 'About',
                            body: '<p>Cookies are small text files that can be used by websites to make the user experience more efficient.</p>',
                        },
                        tabDetail: {
                            title: 'Detail',
                            necessary: {
                                title: 'Necessary',
                                perex: 'Necessary cookies help make a website usable.',
                            },
                            preferences: {
                                title: 'Preference',
                                perex: 'Preference cookies enable a website to remember information.',
                            },
                            statistics: {
                                title: 'Statistics',
                                perex: 'Statistics cookies help website owners.',
                            },
                            marketing: {
                                title: 'Marketing',
                                perex: 'Marketing cookies are used to track visitors.',
                            },
                        },
                        buttonEdit: { label: 'Settings' },
                        buttonAllowAll: { label: 'Allow all' },
                        buttonRejectAll: { label: 'Reject all' },
                        buttonConfirm: { label: 'Confirm' },
                        badge: { label: 'Edit cookie settings' },
                        dialog: { label: 'Your cookie settings' },
                        lastUpdated: 'Cookie statement was last updated %date.',
                    };

                    window.CookieConsentSettings = {
                        tabAgree: { showButtonRejectAll: true },
                        tabAbout: { showButtonRejectAll: true },
                        enableDarkMode: true,
                        disableBadge: true,
                        disableCross: false,
                        disableHeader: false,
                    };
                    `}
                </Script>
				<Script
					id="dgp-cookie-consent-script"
					src="https://cdn.jsdelivr.net/gh/danielsitek/dgp-cookie-consent@1.8.0/dist/cookies.min.js"
                    strategy="beforeInteractive"
                    type="text/javascript"
                    async
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
