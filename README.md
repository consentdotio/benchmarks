# CookieBench Benchmarks

A benchmarking tool for measuring the performance impact of cookie consent solutions on web applications.

## Overview

This tool measures various performance metrics when loading web applications with different cookie consent solutions. It helps developers understand the performance implications of their cookie consent implementation choices.

For detailed information about how benchmarks are measured, see [METHODOLOGY.md](./METHODOLOGY.md).

## Metrics Measured

### Core Web Vitals
- **FCP (First Contentful Paint)**: Time until the browser renders the first piece of content
- **LCP (Largest Contentful Paint)**: Time until the largest content element is rendered
- **CLS (Cumulative Layout Shift)**: Measures visual stability
- **TTI (Time to Interactive)**: Time until the page becomes fully interactive

### Additional Metrics
- **Total Time**: Complete page load time
- **Script Load Time**: Time taken to load and execute JavaScript
- **Banner Render Time**: Technical render time (when element appears in DOM)
- **Banner Visibility Time**: User-perceived visibility time (when opacity > 0.5, accounts for CSS animations)
- **Banner Interactive Time**: Time until banner buttons become clickable

See [METHODOLOGY.md](./METHODOLOGY.md) for detailed explanation of render time vs visibility time.

### Resource Size Metrics
- **Total Size**: Combined size of all resources
- **Scripts**:
  - Total script size
  - Initial script size (loaded before DOMContentLoaded)
  - Dynamic script size (loaded after DOMContentLoaded)
- **Styles**: Size of CSS files
- **Images**: Size of image files
- **Fonts**: Size of font files
- **Other**: Size of other resources

## Current Limitations

1. **Bundle Size Measurement**:
   - Currently measures both initial and dynamically loaded resources
   - Categorizes resources by type (scripts, styles, images, fonts)
   - Tracks script loading timing (initial vs dynamic)
   - Future improvements planned for more detailed network request analysis

2. **Performance Metrics**:
   - Metrics are collected over a 1-second window after page load
   - Some metrics (like CLS) may need longer observation periods
   - Network conditions are not simulated (benchmarks run on localhost)
   - See [METHODOLOGY.md](./METHODOLOGY.md) for detailed limitations and measurement approach

## Usage

```bash
# Install dependencies
pnpm install

# Run benchmarks
pnpm benchmark

# Results results
pnpm results
```

## Configuration

Each benchmark implementation requires a `config.json` file with the following structure:

```json
{
  "name": "implementation-name",
  "iterations": 20,
  "techStack": {
    "languages": ["typescript", "javascript"],
    "frameworks": ["react", "nextjs"],
    "bundler": "webpack",
    "packageManager": "npm",
    "bundleType": "esm",
    "typescript": true
  },
  "source": {
    "github": "github.com/org/repo",
    "npm": "package-name",
    "license": "MIT",
    "isOpenSource": true
  },
  "includes": {
    "components": ["react", "javascript"],
    "backend": ["nodejs", "typescript"]
  },
  "tags": ["optional", "tags"]
}
```

### Configuration Fields

- **techStack**: Technical implementation details
  - `languages`: Array of programming languages used
  - `frameworks`: Array of frameworks used
  - `bundler`: Build tool used (e.g., webpack, vite)
  - `packageManager`: Package manager used (e.g., npm, pnpm)
  - `bundleType`: Output format (esm, iife, cjs)
  - `typescript`: Whether TypeScript is used

- **source**: Project source information
  - `github`: GitHub repository URL or false
  - `npm`: NPM package name or false
  - `license`: License type
  - `isOpenSource`: true, false, or "partially"

- **includes**: Implementation details
  - `components`: Array of component types
  - `backend`: false, array of technologies, or "Proprietary"

- **tags**: Optional array of tags for categorization

## Contributing

Contributions are welcome! Areas for improvement:
- More detailed network request analysis
- Resource loading waterfall visualization
- Custom metric collection
- CI/CD integration
- Additional benchmark implementations
- Enhanced configuration options

## License

MIT