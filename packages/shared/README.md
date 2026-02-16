# @consentio/shared

Shared utilities, constants, and helper functions used across all Consentio benchmark packages.

## Purpose

This package contains common functionality that is used by multiple packages in the monorepo:
- `@consentio/benchmark` - Core benchmarking logic
- `@consentio/runner` - Benchmark orchestration
- `cookiebench` - CLI tool

## Contents

### Constants

- **Time constants**: `ONE_SECOND` (1000ms), `HALF_SECOND` (500ms), `TTI_BUFFER_MS` (1000ms)
- **Size constants**: `BYTES_TO_KB` (1024), `KILOBYTE` (1024)
- **Percentage constants**: `PERCENTAGE_MULTIPLIER` (100), `PERCENTAGE_DIVISOR` (100)

### Utilities

#### Time Formatting
- **`formatTime(ms: number): string`** - Convert milliseconds to human-readable format
  - Returns `"150ms"` for values < 1 second
  - Returns `"1.50s"` for values ≥ 1 second

#### Byte Formatting
- **`formatBytes(bytes: number): string`** - Format bytes to human-readable string with appropriate units
  - Returns `"0 bytes"`, `"1.50 KB"`, `"2.00 MB"`, etc.

#### Config Management
- **`readConfig<T>(path?: string): T | null`** - Read and parse JSON config files
  - Defaults to `./config.json` if no path provided
  - Returns `null` if file cannot be read
  - Generic type parameter allows for type-safe config objects

#### Package Manager Detection
- **`getPackageManager(): Promise<{ command: string; args: string[] }>`** - Detect and return available package manager (npm/yarn/pnpm)

#### Conversion Helpers
- **`bytesToKB(bytes: number): number`** - Convert bytes to kilobytes
- **`decimalToPercentage(decimal: number): number`** - Convert 0.75 → 75
- **`percentageToDecimal(percentage: number): number`** - Convert 75 → 0.75

## Usage

```typescript
import { 
  ONE_SECOND, 
  formatTime, 
  formatBytes,
  readConfig,
  bytesToKB 
} from '@consentio/shared';

// Format time
console.log(formatTime(1500)); // "1.50s"
console.log(formatTime(150));  // "150ms"

// Format bytes
console.log(formatBytes(1536)); // "1.50 KB"
console.log(formatBytes(2097152)); // "2.00 MB"

// Read config
const config = readConfig<MyConfigType>('./my-config.json');

// Use constants
await setTimeout(ONE_SECOND);

// Convert sizes
const sizeInKB = bytesToKB(2048); // 2
```

## Integration Status

✅ **@consentio/benchmark** - Fully integrated
  - Uses shared constants for time and size conversions
  - Imports directly via `@consentio/shared`

✅ **@consentio/runner** - Fully integrated
  - Re-exports shared utilities with proper Config typing
  - Provides typed wrappers: `formatTime`, `getPackageManager`, `readConfig`

✅ **cookiebench CLI** - Fully integrated  
  - Re-exports shared utilities and constants via `utils/index.ts`
  - Provides typed `readConfig` wrapper for CLI Config type
  - All duplicate implementations removed

## Benefits

- ✅ Single source of truth for shared functionality
- ✅ No code duplication across packages
- ✅ Easier maintenance and testing
- ✅ Smaller bundle sizes
- ✅ Type-safe utilities with proper TypeScript support
- ✅ Consistent behavior across all packages


