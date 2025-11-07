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
		<html lang="cs" suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `
                    window.CookieConsentTranslations = {
                        locale: 'cs-CZ',
                        tabAgree: {
                            title: 'Souhlas',
                            body: '<p><strong>Tato webová stránka používá cookies</strong></p><p>K personalizaci obsahu a reklam, poskytování funkcí sociálních médií a analýze naší návštěvnosti využíváme soubory cookie.</p>',
                        },
                        tabAbout: {
                            title: 'O aplikaci',
                            body: '<p>Cookies jsou malé textové soubory, které mohou být používány webovými stránkami, aby učinily uživatelský zážitek více efektivní.</p>',
                        },
                        tabDetail: {
                            title: 'Detail',
                            necessary: {
                                title: 'Nutné',
                                perex: 'Nutné cookies pomáhají, aby byla webová stránka použitelná.',
                            },
                            preferences: {
                                title: 'Preferenční',
                                perex: 'Preferenční cookies umožňují, aby si webová stránka zapamatovala informace.',
                            },
                            statistics: {
                                title: 'Statistické',
                                perex: 'Statistické cookies pomáhají majitelům webových stránek.',
                            },
                            marketing: {
                                title: 'Marketingové',
                                perex: 'Marketingové cookies jsou používány pro sledování návštěvníků.',
                            },
                        },
                        buttonEdit: { label: 'Nastavit' },
                        buttonAllowAll: { label: 'Povolit vše' },
                        buttonRejectAll: { label: 'Odmítnout vše' },
                        buttonConfirm: { label: 'Potvrdit' },
                        badge: { label: 'Upravit nastavení cookies' },
                        dialog: { label: 'Vaše nastavení cookies' },
                        lastUpdated: 'Prohlášení o cookies bylo naposledy aktualizováno %date.',
                    };

                    window.CookieConsentSettings = {
                        tabAgree: { showButtonRejectAll: true },
                        tabAbout: { showButtonRejectAll: true },
                        enableDarkMode: true,
                        disableBadge: true,
                        disableCross: false,
                        disableHeader: false,
                    };
                    `,
					}}
				/>
				<script
					src="https://cdn.jsdelivr.net/gh/danielsitek/dgp-cookie-consent@1.8.0/dist/cookies.min.js"
					type="text/javascript"
					async
				/>
			</head>
			<body>{children}</body>
		</html>
	);
}
