# @consentio/runner

Benchmark orchestration for running cookie banner performance tests.

## Overview

This package orchestrates benchmark execution, managing browser instances, running iterations, aggregating results, and serving Next.js applications for testing.

## Features

- **Benchmark Orchestration**: Run multiple benchmark iterations with automated browser management
- **Next.js Server Management**: Build and serve Next.js apps for local testing
- **Performance Aggregation**: Calculate averages and aggregate metrics across iterations
- **Config Loading**: Load and validate benchmark configurations
- **Remote & Local Testing**: Support for both remote URLs and local development

## Installation

```bash
pnpm add @consentio/runner @consentio/benchmark
```

## Usage

### Basic Usage

```typescript
import { BenchmarkRunner, readConfig } from '@consentio/runner';

// Load config
const config = readConfig('./config.json');

// Create runner
const runner = new BenchmarkRunner(config);

// Run benchmarks
const results = await runner.runBenchmarks('http://localhost:3000');

console.log('Benchmark complete:', results);
```

### With Server Management

```typescript
import {
  BenchmarkRunner,
  buildAndServeNextApp,
  cleanupServer,
  readConfig,
} from '@consentio/runner';

const config = readConfig();
const serverInfo = await buildAndServeNextApp('./my-next-app');

try {
  const runner = new BenchmarkRunner(config);
  const results = await runner.runBenchmarks(serverInfo.url);
  
  console.log('Results:', results);
} finally {
  cleanupServer(serverInfo);
}
```

### Remote Benchmarking

```typescript
import { BenchmarkRunner } from '@consentio/runner';

const config = {
  name: 'production-test',
  iterations: 5,
  remote: {
    enabled: true,
    url: 'https://production.example.com',
    headers: {
      'Authorization': 'Bearer token',
    },
  },
  // ... other config
};

const runner = new BenchmarkRunner(config);
const results = await runner.runBenchmarks(config.remote.url);
```

## API

### BenchmarkRunner

- `constructor(config: Config)`: Create a new benchmark runner
- `runBenchmarks(serverUrl: string)`: Run multiple benchmark iterations
- `runSingleBenchmark(page: Page, url: string)`: Run a single benchmark iteration

### Server Management

- `buildAndServeNextApp(appPath?: string)`: Build and serve a Next.js app
- `cleanupServer(serverInfo: ServerInfo)`: Stop the server process

### Utilities

- `readConfig(configPath?: string)`: Read and parse config.json
- `formatTime(ms: number)`: Format milliseconds to human-readable string
- `getPackageManager()`: Detect package manager (npm/yarn/pnpm)

### PerformanceAggregator

- `calculateTTI(coreWebVitals, cookieBannerData)`: Calculate Time to Interactive
- `aggregateMetrics(...)`: Merge all collected metrics into final benchmark details
- `calculateAverages(results)`: Calculate average metrics from multiple runs
- `logResults(...)`: Log comprehensive benchmark results

## Configuration

```json
{
  "name": "my-app",
  "iterations": 5,
  "baseline": false,
  "remote": {
    "enabled": false,
    "url": "https://example.com"
  },
  "cookieBanner": {
    "selectors": [".cookie-banner"],
    "serviceHosts": ["cookiecdn.com"],
    "serviceName": "CookieService",
    "waitForVisibility": true,
    "measureViewportCoverage": true,
    "expectedLayoutShift": true
  },
  "techStack": {
    "bundler": "webpack",
    "bundleType": "esm",
    "frameworks": ["react", "nextjs"],
    "languages": ["typescript"],
    "packageManager": "pnpm",
    "typescript": true
  }
}
```

## Types

See the [types file](./src/types.ts) for complete type definitions.

## License

MIT

