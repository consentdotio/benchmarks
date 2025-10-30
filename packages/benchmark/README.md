# @consentio/benchmark

Core benchmark measurement logic for cookie banner performance testing.

## Overview

This package provides the core functionality for detecting and measuring cookie banner performance impact. It includes collectors for cookie banners, network monitoring, and resource timing.

## Features

- **Cookie Banner Detection**: Automatically detects cookie banners using configurable selectors
- **Network Monitoring**: Tracks network requests and calculates size/timing metrics
- **Resource Collection**: Collects detailed resource timing data from the browser
- **Bundle Strategy Detection**: Identifies bundling approaches (IIFE, ESM, CJS, bundled)
- **Performance Metrics**: Measures layout shift, render time, and viewport coverage

## Installation

```bash
pnpm add @consentio/benchmark
```

## Usage

```typescript
import {
  CookieBannerCollector,
  NetworkMonitor,
  ResourceTimingCollector,
  determineBundleStrategy,
  BENCHMARK_CONSTANTS,
} from '@consentio/benchmark';
import { chromium } from '@playwright/test';

// Create config
const config = {
  name: 'my-app',
  iterations: 5,
  cookieBanner: {
    selectors: ['.cookie-banner', '#cookie-consent'],
    serviceHosts: ['cookiecdn.com'],
    serviceName: 'CookieService',
    waitForVisibility: true,
    measureViewportCoverage: true,
    expectedLayoutShift: true,
  },
  techStack: {
    bundleType: 'esm',
    // ...
  },
  // ...
};

// Initialize collectors
const cookieBannerCollector = new CookieBannerCollector(config);
const networkMonitor = new NetworkMonitor(config);
const resourceCollector = new ResourceTimingCollector();

// Use with Playwright
const browser = await chromium.launch();
const page = await browser.newPage();

// Setup detection and monitoring
await cookieBannerCollector.setupDetection(page);
await networkMonitor.setupMonitoring(page);

// Navigate to page
await page.goto('https://example.com');

// Collect metrics
const bannerData = await cookieBannerCollector.collectMetrics(page);
const resourceData = await resourceCollector.collect(page);
const networkRequests = networkMonitor.getNetworkRequests();

await browser.close();
```

## API

### CookieBannerCollector

- `constructor(config: Config)`: Create a new collector
- `initializeMetrics()`: Initialize cookie banner metrics tracking
- `setupDetection(page: Page)`: Set up browser-side detection script
- `collectMetrics(page: Page)`: Collect metrics from the page

### NetworkMonitor

- `constructor(config: Config)`: Create a new monitor
- `setupMonitoring(page: Page)`: Set up network request interception
- `getNetworkRequests()`: Get collected network requests
- `getMetrics()`: Get network metrics
- `calculateNetworkImpact()`: Calculate network impact metrics
- `reset()`: Reset collected data

### ResourceTimingCollector

- `collect(page: Page)`: Collect detailed resource timing data

### Utilities

- `determineBundleStrategy(config: Config)`: Determine bundle strategy from config
- `BENCHMARK_CONSTANTS`: Constants for detection intervals, timeouts, etc.
- `BUNDLE_TYPES`: Bundle type constants (IIFE, ESM, CJS, BUNDLED)

## Types

See the [types file](./src/types.ts) for complete type definitions.

## License

MIT

