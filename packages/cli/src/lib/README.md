# Benchmark Library Structure

This directory contains the refactored benchmark modules, organized by functionality for better maintainability and testability.

## Architecture

The benchmark system has been broken down into focused, single-responsibility modules:

### Core Runner

- **`benchmark-runner.ts`** - Main orchestrator that coordinates all collectors and aggregators

### Collectors (`/collectors`)

- **`cookie-banner-collector.ts`** - Detects and measures cookie banner performance impact
- **`network-monitor.ts`** - Monitors network requests and calculates size/timing metrics
- **`resource-timing-collector.ts`** - Collects detailed resource timing data from the browser

### Metrics (`/metrics`)

- **`performance-aggregator.ts`** - Aggregates all collected metrics into final benchmark results

## Benefits of Refactoring

1. **Single Responsibility**: Each module has one clear purpose
2. **Better Testability**: Individual components can be tested in isolation
3. **Improved Maintainability**: Changes to one area don't affect others
4. **Cleaner Code**: Removed ~500 lines from a single 700+ line file
5. **Type Safety**: Better TypeScript interfaces and type definitions
6. **Reusability**: Modules can be used independently or in different combinations

## Usage

```typescript
import { BenchmarkRunner } from "./benchmark-runner";

const runner = new BenchmarkRunner(config);
const results = await runner.runBenchmarks(serverUrl);
```

## Module Dependencies

```
benchmark-runner.ts
├── collectors/
│   ├── cookie-banner-collector.ts
│   ├── network-monitor.ts
│   └── resource-timing-collector.ts
└── metrics/
    └── performance-aggregator.ts
```

Each collector is independent and can be used separately if needed. The performance aggregator combines all metrics into the final benchmark result format.
