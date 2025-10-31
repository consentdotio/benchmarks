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

# View detailed benchmark results
cookiebench results

# View scores from existing results (available via CLI only)
cookiebench scores

# Sync results to database (admin only)
cookiebench save

# Manage database (admin only)
cookiebench db push
```

## Commands

### benchmark

Run performance benchmarks on configured applications.

```bash
# Interactive mode - select multiple benchmarks to run
cookiebench benchmark

# Run a specific benchmark
cookiebench benchmark benchmarks/c15t-nextjs
```

**Interactive Multi-Select Mode:**

When run without arguments, the command will:
1. Scan the `benchmarks/` directory for available benchmarks
2. Present a multi-select interface (use space to toggle selections)
3. Show iteration counts from each config file
4. Ask for iterations override (or press Enter to use config values)
5. Ask if you want to show the results panel after completion
6. Run selected benchmarks sequentially
7. Show a summary of completed benchmarks
8. Automatically display results for the benchmarks you just ran (if enabled, skips selection menu)

**Single Benchmark Mode:**

When a specific path is provided:
1. Read `config.json` from the specified path
2. Build and serve the Next.js app (or use remote URL if configured)
3. Run benchmarks for the specified number of iterations
4. Calculate performance scores
5. Save results to `results.json`
6. Display scores

**Features:**
- ✅ Multi-select with space bar toggle
- ✅ View default iterations from config files
- ✅ Override iterations for all benchmarks or use individual config values
- ✅ Sequential execution with progress indicators
- ✅ Automatic results panel for completed benchmarks (no extra selection needed)
- ✅ Comprehensive metrics: scores, insights, Core Web Vitals, resource breakdown, network waterfall
- ✅ Error handling - continues to next benchmark on failure
- ✅ Summary report at the end

**Example:**
```
? Select benchmarks to run:
  ◼ baseline
  ◼ c15t-nextjs
  ◼ cookieyes

● info  Config iterations: baseline: 5, c15t-nextjs: 3, cookieyes: 5

? Number of iterations (press Enter to use config values):
› Default: 5

  [Just press Enter to use config values, or type a number to override all]

? Show results panel after completion? › Yes
```

### results

View comprehensive benchmark results with detailed metrics and analysis.

```bash
# Interactive mode - select which benchmarks to view (all selected by default)
cookiebench results

# View results for a specific app
cookiebench results c15t-nextjs

# View all results
cookiebench results __all__
```

**Interactive Multi-Select Mode:**

When run without arguments, you can:
1. Select which benchmarks to view using space bar (all selected by default)
2. Press Enter to view detailed results for selected benchmarks
3. View baseline comparisons and deltas

**Features:**

Displays a detailed panel for each selected benchmark with:

1. **🎯 Overall Score** - Color-coded score (0-100) with grade (Excellent/Good/Fair/Poor/Critical)
   - 🟢 Green (90+) = Excellent
   - 🟡 Yellow (70-89) = Good/Fair  
   - 🔴 Red (<70) = Poor/Critical

2. **💡 Key Insights** - Auto-generated bullet points highlighting strengths and areas for improvement

3. **🍪 Cookie Banner Impact** - Banner visibility, viewport coverage, network impact, bundle strategy

4. **⚡ Core Web Vitals** - FCP, LCP, TTI, CLS with performance ratings

5. **📦 Resource Breakdown** - Detailed size analysis by type (JS, CSS, Images, Fonts, Other)

6. **📊 Performance Impact Summary** - Loading strategy, render performance, network overhead, layout stability

7. **🌐 Network Chart** - ASCII waterfall visualization showing resource loading timeline with color-coded bars

8. **📋 Resource Details** - Sortable table with resource names, types, sources, sizes, and durations

**Notes:**
- Interactive multi-select UI - choose which benchmarks to view
- All benchmarks selected by default for quick viewing
- Aggregates results from all `results.json` files in benchmark directories
- Calculates scores on-demand from raw metrics
- Baseline comparison with delta values
- No database writes (read-only)
- Automatically shown after running benchmarks (if enabled)

**Example:**
```
? Select benchmarks to view (use space to toggle, all selected by default):
  ◼ baseline (benchmarks/baseline)
  ◼ c15t-nextjs (benchmarks/c15t-nextjs)
  ◼ cookieyes (benchmarks/cookieyes)

● info  Viewing results for: baseline, c15t-nextjs, cookieyes
```

### scores

**Available via direct CLI only** - View calculated scores from existing benchmark results.

```bash
# Interactive: choose which app to view
cookiebench scores

# View scores for a specific app
cookiebench scores c15t-nextjs

# View scores for all apps
cookiebench scores __all__
```

Features:
- Reads existing `results.json` files from benchmark directories
- Uses pre-calculated scores if available, or calculates them on-demand
- Displays detailed score breakdowns by category
- Shows insights and recommendations
- Much faster than re-running full benchmarks

**Note:** This command is not shown in the interactive menu. Use the `results` command instead for a comprehensive view with all metrics, or access `scores` directly via CLI for score-only output.

### save

**🔒 Admin Only** - Sync benchmark results to database.

```bash
# Interactive: choose which benchmarks to save
cookiebench save

# Save a specific benchmark
cookiebench save c15t-nextjs

# Save all benchmarks (can also select in interactive mode)
cookiebench save __all__
```

**Requirements:**
- `CONSENT_ADMIN=true` environment variable must be set
- `API_URL` for the database endpoint
- `DATABASE_URL` and `DATABASE_AUTH_TOKEN` for database access

Features:
- Multi-select interface for choosing which benchmarks to sync
- Sends results to API endpoint (oRPC)
- Persists to Turso/SQLite database
- Confirmation prompt before syncing
- Shows success/failure count

**Note:** This command is hidden from the menu and unavailable unless you have admin access. Contact the Consent.io team for access credentials if needed.

### db

**🔒 Admin Only** - Manage the benchmark database.

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
  "name": "my-app-cookieyes",
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
# Logging level (optional, default: info)
LOG_LEVEL=debug  # error | warn | info | debug
# Note: Use LOG_LEVEL=debug to see detailed processing information

# Admin access (required for save and db commands)
CONSENT_ADMIN=true

# Database configuration (required for save command)
DATABASE_URL=libsql://your-turso-db.turso.io
DATABASE_AUTH_TOKEN=your-auth-token

# API endpoint for saving results (required for save command)
API_URL=http://localhost:3000
```

### Admin Commands

Some commands require admin access and are only available when `CONSENT_ADMIN=true` is set:

- `save` - Sync benchmark results to database (admin only)
- `db` - Manage database schema and migrations (admin only)

**For Consent.io team members:**
```bash
# Enable admin mode
export CONSENT_ADMIN=true

# Now admin commands are available
cookiebench save
cookiebench db push
```

**For public users:**
The `benchmark`, `results`, and `scores` commands work without admin access. Admin commands will be hidden from the menu and show an error if attempted.

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

