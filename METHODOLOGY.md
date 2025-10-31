# Benchmark Methodology

This document explains how CookieBench measures and evaluates cookie banner performance. Our methodology prioritizes transparency, reproducibility, and real-world user experience.

## Introduction

CookieBench measures the performance impact of cookie consent solutions on web applications. We focus on metrics that directly impact user experience, following industry standards like Core Web Vitals and Lighthouse.

## Measurement Approach

### Banner Render Time vs Visibility Time

We track two distinct metrics for banner appearance:

**Banner Render Time** (Technical Metric):

- Measures when the banner element first appears in the DOM
- Recorded when the element has dimensions (`width > 0`, `height > 0`) and is not hidden
- Represents technical implementation performance
- This metric is tracked for reference but not used in primary scoring

**Banner Visibility Time** (User-Perceived Metric):

- Measures when the banner becomes visible to users
- Uses opacity threshold of **0.5** to account for CSS animations and transitions
- Represents actual user experience - when users can see and interact with the banner
- This metric is used for scoring and primary comparisons

**Why This Distinction Matters**:

- A banner that renders instantly but fades in slowly should score differently than one that renders slower but is immediately visible
- CSS animations can delay user-perceived visibility even after technical rendering
- Measuring visibility aligns with Core Web Vitals' focus on user experience

### Opacity Threshold

We use an opacity threshold of **0.5** (50% opacity) to determine visibility:

- An element with opacity ≤ 0.5 is considered not visible to users
- An element with opacity > 0.5 is considered visible
- This accounts for CSS fade-in animations that gradually reveal the banner
- This threshold balances technical accuracy with user perception

### Measurement Baseline

All timing measurements start from `navigationStart`:

- Includes Time to First Byte (TTFB)
- Includes server response time
- Includes network latency
- Aligns with Core Web Vitals measurement standards
- Represents total time from page load initiation to metric completion

This means results reflect the complete user experience, including server-side performance and network conditions.

## Network Conditions

### Current Implementation

Currently, benchmarks run on **localhost** with **no network throttling**:

- Ideal network conditions (~9-35ms TTFB)
- No bandwidth limitations
- No latency simulation
- Results reflect optimal performance

**Impact on Results**:

- Results represent best-case performance
- Real-world performance will vary based on network conditions
- Differences between implementations are isolated from network variability
- Fair comparison when all implementations tested under same conditions

### Future Considerations

We are evaluating network throttling options:

- **Cable Profile** (5 Mbps, 28ms latency): Minimal impact, maintains speed
- **Fast 3G** (1.6 Mbps, 562ms latency): More realistic, significantly impacts TTFB
- **Slow 4G**: Balanced approach for modern connections

Any future changes to network conditions will be clearly documented and versioned.

## Metrics Tracked

### Primary Metrics (Used for Scoring)

**Banner Visibility Time**:

- Time from `navigationStart` until banner opacity > 0.5
- Primary metric for UX scoring
- Accounts for CSS animations
- Measured in milliseconds

**Banner Interactive Time**:

- Time from `navigationStart` until banner buttons become clickable
- Measures when users can actually interact with the banner
- Uses `offsetParent` check to verify clickability

**Layout Shift Impact**:

- Cumulative Layout Shift (CLS) caused by banner appearance
- Measures visual stability impact
- Lower is better (0 = no layout shift)

**Viewport Coverage**:

- Percentage of viewport covered by banner
- Calculated as: `(visibleArea / viewportArea) * 100`
- Accounts for partial visibility (banners extending beyond viewport)

**Network Impact**:

- Total size of banner-related network requests
- Number of network requests
- Download time for banner resources

### Secondary Metrics (Tracked for Reference)

**Banner Render Time**:

- Technical render time (when element appears in DOM)
- Not used for scoring
- Available for technical analysis

**Banner Hydration Time**:

- Time from render to interactive: `interactiveTime - renderTime`
- Measures JavaScript execution and event binding time
- Useful for understanding banner implementation performance

## Scoring Methodology

### How Scores Are Calculated

Our scoring system evaluates multiple categories:

**Performance Score** (40% weight):

- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Time to Interactive (TTI)
- Total Blocking Time (TBT)
- Time to First Byte (TTFB)

**Bundle Strategy Score** (25% weight):

- Bundle type (Bundled vs IIFE)
- Third-party dependencies
- Bundler type
- TypeScript usage

**Network Impact Score** (20% weight):

- Total bundle size
- Third-party size
- Network requests count
- Script load time

**Transparency Score** (10% weight):

- Open source status
- Company information
- Tech stack transparency

**User Experience Score** (5% weight):

- Layout stability (CLS)
- Banner render time (uses visibility time)
- Viewport coverage

### Banner Visibility Time Scoring

Banner visibility time is scored within the User Experience category:

- **≤ 25ms**: Excellent (35 points)
- **≤ 50ms**: Very Good (25 points)
- **≤ 100ms**: Good (15 points)
- **≤ 200ms**: Fair (10 points)
- **> 200ms**: Poor (5 points)

**Note**: Scoring uses `bannerVisibilityTime` (opacity-based), not `bannerRenderTime` (technical). This ensures scores reflect actual user experience.

## Reproducibility

### Configuration Requirements

Each benchmark requires a `config.json` file with:

- Cookie banner selectors (CSS selectors to detect the banner)
- Service hosts (domains used by the cookie service)
- Tech stack information
- Iteration count

### Running Benchmarks

```bash
# Run benchmarks
pnpm benchmark

# View results
pnpm results
```

### What Affects Results

**Consistent Factors**:

- Browser engine (Chromium)
- Viewport size (1280x720)
- Detection selectors
- Measurement methodology

**Variable Factors**:

- Server performance (if testing SSR)
- System load
- Network conditions (currently localhost)

**Best Practices**:

- Run multiple iterations (default: 20)
- Ensure consistent server state
- Clear browser cache between runs
- Use same environment for all comparisons

## Limitations

### Current Limitations

1. **Network Conditions**:
   - No throttling means results reflect optimal conditions
   - Real-world performance will vary
   - Future: Network throttling support

2. **Measurement Window**:
   - Some metrics collected over 1-second window
   - CLS may need longer observation periods
   - Future: Configurable observation windows

3. **Banner Detection**:
   - Requires accurate CSS selectors
   - May miss dynamically loaded banners
   - Detection timeout: 10 seconds

4. **Animation Timing**:
   - Opacity threshold may not account for all animation types
   - Transform-based animations not measured
   - Future: Enhanced animation detection

### Future Improvements

- Network throttling support
- More granular animation detection
- Configurable observation windows
- Enhanced banner detection algorithms
- Real-world performance simulation

## Transparency Statement

We believe in transparent benchmarking:

- **Open Methodology**: This document explains exactly how we measure
- **Open Source**: Benchmark code is available for review
- **Reproducible**: Anyone can run the same benchmarks
- **Honest Metrics**: We measure user-perceived visibility, not just technical render time
- **Clear Limitations**: We document what we measure and what we don't

## Industry Standards Alignment

Our methodology aligns with:

- **Core Web Vitals**: User-centric performance metrics
- **Lighthouse**: Measurement approaches and thresholds
- **WebPageTest**: Performance testing practices
- **W3C Performance Timeline**: Standard timing APIs

We measure what matters to users, not just what's technically possible.

## Questions or Feedback

If you have questions about our methodology or suggestions for improvement, please open an issue on our GitHub repository.

---

**Last Updated**: 2025-10-31  
**Version**: 2.0
