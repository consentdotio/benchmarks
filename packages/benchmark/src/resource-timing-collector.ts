import type { Logger } from "@c15t/logger";
import type { Page } from "@playwright/test";
import type { Config } from "./types";
import type { ResourceTimingData } from "./types";

export class ResourceTimingCollector {
	private readonly logger: Logger;
	private readonly config: Config;

	constructor(logger: Logger, config: Config) {
		this.logger = logger;
		this.config = config;
	}

	/**
	 * Collect detailed resource timing data from the browser.
	 * Sizes are emitted in bytes.
	 */
	async collect(page: Page): Promise<ResourceTimingData> {
		this.logger.debug("Collecting resource timing data...");

		return await page.evaluate((cookieServiceHosts: string[]) => {
			const HOST_LABEL_COUNT_TWO = 2;
			const HOST_LABEL_COUNT_THREE = 3;
			const IPV4_PART_COUNT = 4;
			const IPV4_PART_MAX_LENGTH = 3;
			const MAX_IPV4_PART_VALUE = 255;

			const perfEntries = performance.getEntriesByType(
				"navigation"
			)[0] as PerformanceNavigationTiming;
			const resourceEntries = performance.getEntriesByType(
				"resource"
			) as PerformanceResourceTiming[];

			const SECOND_LEVEL_PUBLIC_SUFFIXES = new Set([
				"co.uk",
				"org.uk",
				"gov.uk",
				"ac.uk",
				"net.uk",
				"co.jp",
				"or.jp",
				"go.jp",
				"ne.jp",
				"co.kr",
				"co.in",
				"co.id",
				"co.nz",
				"com.au",
				"net.au",
				"org.au",
				"com.br",
				"com.mx",
				"com.tr",
				"com.cn",
				"com.hk",
				"com.sg",
				"com.tw",
				"com.sa",
				"com.ar",
				"com.pl",
				"com.ua",
				"com.ph",
				"com.my",
				"com.vn",
			]);

			const normalizeHost = (host: string): string => {
				const trimmed = host.trim().toLowerCase();
				if (!trimmed) {
					return "";
				}
				try {
					const parsed = trimmed.includes("://")
						? new URL(trimmed).hostname
						: trimmed;
					const withoutDot = parsed.endsWith(".")
						? parsed.slice(0, -1)
						: parsed;
					return withoutDot.startsWith("www.")
						? withoutDot.slice("www.".length)
						: withoutDot;
				} catch {
					return "";
				}
			};

			const isIpv4Address = (host: string): boolean => {
				const parts = host.split(".");
				if (parts.length !== IPV4_PART_COUNT) {
					return false;
				}
				return parts.every((part) => {
					if (!part || part.length > IPV4_PART_MAX_LENGTH) {
						return false;
					}
					const codePoints = [...part];
					if (codePoints.some((char) => char < "0" || char > "9")) {
						return false;
					}
					const value = Number(part);
					return (
						Number.isInteger(value) &&
						value >= 0 &&
						value <= MAX_IPV4_PART_VALUE
					);
				});
			};

			const getRegistrableDomain = (host: string): string => {
				const normalized = normalizeHost(host);
				if (!normalized) {
					return "";
				}
				if (
					normalized === "localhost" ||
					normalized.includes(":") ||
					isIpv4Address(normalized)
				) {
					return normalized;
				}

				const labels = normalized.split(".").filter(Boolean);
				if (labels.length <= HOST_LABEL_COUNT_TWO) {
					return normalized;
				}

				const lastTwo = labels.slice(-HOST_LABEL_COUNT_TWO).join(".");
				if (
					SECOND_LEVEL_PUBLIC_SUFFIXES.has(lastTwo) &&
					labels.length >= HOST_LABEL_COUNT_THREE
				) {
					return labels.slice(-HOST_LABEL_COUNT_THREE).join(".");
				}
				return lastTwo;
			};

			const getHostname = (name: string): string => {
				try {
					return normalizeHost(new URL(name, window.location.origin).hostname);
				} catch {
					return "";
				}
			};

			const normalizedServiceHosts = cookieServiceHosts
				.map(normalizeHost)
				.filter(Boolean)
				.map((host) => ({
					host,
					registrableDomain: getRegistrableDomain(host),
				}));

			const isFirstParty = (entry: PerformanceResourceTiming) => {
				const hostname = getHostname(entry.name);
				const firstPartyHost = normalizeHost(window.location.hostname);
				if (!(hostname && firstPartyHost)) {
					return false;
				}

				if (
					hostname === firstPartyHost ||
					hostname.endsWith(`.${firstPartyHost}`)
				) {
					return true;
				}

				const hostnameRegistrableDomain = getRegistrableDomain(hostname);
				const firstPartyRegistrableDomain = getRegistrableDomain(firstPartyHost);
				return (
					Boolean(hostnameRegistrableDomain) &&
					hostnameRegistrableDomain === firstPartyRegistrableDomain
				);
			};

			const isCookieService = (entry: PerformanceResourceTiming) => {
				const hostname = getHostname(entry.name);
				if (!hostname) {
					return false;
				}
				const hostnameRegistrableDomain = getRegistrableDomain(hostname);
				return normalizedServiceHosts.some(
					(serviceHost) =>
						hostname === serviceHost.host ||
						hostname.endsWith(`.${serviceHost.host}`) ||
						(Boolean(serviceHost.registrableDomain) &&
							hostnameRegistrableDomain === serviceHost.registrableDomain)
				);
			};

			const scriptEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "script"
			);
			const styleEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "link" && entry.name.endsWith(".css")
			);
			const imageEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "img"
			);
			const fontEntries = resourceEntries.filter(
				(entry) => entry.initiatorType === "font"
			);
			const otherEntries = resourceEntries.filter(
				(entry) =>
					!["script", "link", "img", "font"].includes(entry.initiatorType)
			);

			const calculateSize = (entries: PerformanceResourceTiming[]) =>
				entries.reduce((acc, entry) => {
					const size = entry.transferSize || entry.encodedBodySize || 0;
					return acc + size;
				}, 0);

			const navigationStart = perfEntries.startTime;
			const domContentLoaded =
				perfEntries.domContentLoadedEventEnd - navigationStart;
			const load = perfEntries.loadEventEnd - navigationStart;

			const cookieServiceEntries = resourceEntries.filter(isCookieService);
			const cookieServiceScriptEntries = scriptEntries.filter(isCookieService);

			return {
				timing: {
					navigationStart,
					domContentLoaded,
					load,
					scripts: {
						bundled: {
							loadStart: 0,
							loadEnd: scriptEntries
								.filter((entry) => isFirstParty(entry))
								.reduce((acc, entry) => acc + entry.duration, 0),
							executeStart: 0,
							executeEnd: 0,
						},
						thirdParty: {
							loadStart: 0,
							loadEnd: scriptEntries
								.filter((entry) => !isFirstParty(entry))
								.reduce((acc, entry) => acc + entry.duration, 0),
							executeStart: 0,
							executeEnd: 0,
						},
					},
				},
				size: {
					total: calculateSize(resourceEntries),
					bundled: calculateSize(
						scriptEntries.filter((entry) => isFirstParty(entry))
					),
					thirdParty: calculateSize(
						scriptEntries.filter((entry) => !isFirstParty(entry))
					),
					cookieServices: calculateSize(cookieServiceEntries),
					scripts: {
						total: calculateSize(scriptEntries),
						initial: calculateSize(
							scriptEntries.filter(
								(entry) => entry.startTime < domContentLoaded
							)
						),
						dynamic: calculateSize(
							scriptEntries.filter(
								(entry) => entry.startTime >= domContentLoaded
							)
						),
						thirdParty: calculateSize(
							scriptEntries.filter((entry) => !isFirstParty(entry))
						),
						cookieServices: calculateSize(cookieServiceScriptEntries),
					},
					styles: calculateSize(styleEntries),
					images: calculateSize(imageEntries),
					fonts: calculateSize(fontEntries),
					other: calculateSize(otherEntries),
				},
				resources: {
					scripts: scriptEntries.map((entry) => ({
						name: entry.name,
						size: entry.transferSize || entry.encodedBodySize || 0,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isDynamic: entry.startTime >= domContentLoaded,
						isCookieService: isCookieService(entry),
						dnsTime: entry.domainLookupEnd - entry.domainLookupStart,
						connectionTime: entry.connectEnd - entry.connectStart,
					})),
					styles: styleEntries.map((entry) => ({
						name: entry.name,
						size: entry.transferSize || entry.encodedBodySize || 0,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: isCookieService(entry),
					})),
					images: imageEntries.map((entry) => ({
						name: entry.name,
						size: entry.transferSize || entry.encodedBodySize || 0,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: isCookieService(entry),
					})),
					fonts: fontEntries.map((entry) => ({
						name: entry.name,
						size: entry.transferSize || entry.encodedBodySize || 0,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: isCookieService(entry),
					})),
					other: otherEntries.map((entry) => ({
						name: entry.name,
						size: entry.transferSize || entry.encodedBodySize || 0,
						duration: entry.duration,
						startTime: entry.startTime - navigationStart,
						isThirdParty: !isFirstParty(entry),
						isCookieService: isCookieService(entry),
						type: entry.initiatorType,
					})),
				},
				language: (() => {
					const docLang = (
						document.documentElement.getAttribute("lang") || ""
					).trim();
					return (
						docLang || navigator.language || navigator.languages?.[0] || "en"
					);
				})(),
				duration: load,
			};
		}, this.config.cookieBanner.serviceHosts || []);
	}
}
