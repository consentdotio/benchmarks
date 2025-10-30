# cookiebench

Command-line interface for cookie banner performance benchmarking.

## Overview

This CLI tool provides an interactive interface for running cookie banner benchmarks, viewing results, and managing the benchmark database.

## Installation

```bash
pnpm add -g cookiebench
```

Or use in a workspace:

```bash
pnpm add cookiebench
```

## Usage

### Interactive Mode

Run without arguments for interactive prompts:

```bash
cookiebench
```

### Direct Commands

Run specific commands directly:

```bash
# Run a benchmark
cookiebench benchmark

# View and aggregate results
cookiebench results

# Manage database
cookiebench db push
```

## Commands

### benchmark

Run performance benchmarks on configured applications.

```bash
cookiebench benchmark [appPath]
```

The command will:
1. Read `config.json` from the current directory or specified path
2. Build and serve the Next.js app (or use remote URL if configured)
3. Run benchmarks for the specified number of iterations
4. Calculate performance scores
5. Save results to `results.json`

### results

Aggregate and display benchmark results from multiple apps.

```bash
cookiebench results
```

Features:
- Aggregates results from all `results.json` files in benchmark directories
- Displays comparison table with metrics and deltas from baseline
- Calculates scores for each app
- Saves results to database (if configured)

### db

Manage the benchmark database.

```bash
# Push database schema
cookiebench db push

# View database status
cookiebench db
```

## Configuration

Create a `config.json` file in your project:

```json
{
  "name": "my-app-with-cookieyes",
  "iterations": 5,
  "baseline": false,
  "cookieBanner": {
    "serviceName": "CookieYes",
    "selectors": [
      "#cookieyes-banner",
      ".cky-consent-container"
    ],
    "serviceHosts": [
      "cdn-cookieyes.com"
    ],
    "waitForVisibility": true,
    "measureViewportCoverage": true,
    "expectedLayoutShift": true
  },
  "techStack": {
    "frameworks": ["react", "nextjs"],
    "languages": ["typescript"],
    "bundler": "webpack",
    "bundleType": "esm",
    "packageManager": "pnpm",
    "typescript": true
  },
  "source": {
    "license": "MIT",
    "isOpenSource": true,
    "github": "https://github.com/org/repo",
    "npm": false
  },
  "includes": {
    "backend": false,
    "components": ["button", "banner"]
  },
  "company": {
    "name": "Company Name",
    "website": "https://company.com",
    "avatar": "https://company.com/logo.png"
  },
  "tags": ["cookie-banner", "consent-management"]
}
```

### Remote Benchmarking

To benchmark a remote URL instead of building locally:

```json
{
  "name": "production-app",
  "remote": {
    "enabled": true,
    "url": "https://production.example.com",
    "headers": {
      "Authorization": "Bearer token"
    }
  }
}
```

## Environment Variables

```bash
# Database configuration (optional)
DATABASE_URL=libsql://your-turso-db.turso.io
DATABASE_AUTH_TOKEN=your-auth-token

# API endpoint for saving results (optional)
API_URL=http://localhost:3000
```

## Output

### results.json

Each benchmark creates a `results.json` file with:
- Raw performance metrics for each iteration
- Calculated scores (performance, bundle strategy, network impact, transparency, UX)
- Metadata (timestamp, iterations, configuration)

### Console Output

The CLI displays:
- Progress indicators for each iteration
- Performance metrics (FCP, LCP, CLS, TTI, TBT)
- Cookie banner detection results
- Comprehensive scores with grades (Excellent/Good/Fair/Poor/Critical)
- Insights and recommendations

## Scoring

The tool calculates scores across five categories:

1. **Performance** (30%): FCP, LCP, CLS, TTI, TBT
2. **Bundle Strategy** (25%): Bundle size, loading approach, execution time
3. **Network Impact** (20%): Third-party requests, cookie service overhead
4. **Transparency** (15%): Open source status, documentation, licensing
5. **User Experience** (10%): Banner timing, coverage, layout shifts

## Development

```bash
# Build the CLI
pnpm build

# Run in development
pnpm dev

# Type checking
pnpm check-types

# Linting
pnpm lint
```

## License

MIT

