# Web Scrapper

A Node.js web scraper that extracts content from sitemaps and standalone pages, converts HTML to Markdown, and generates structured output files.

## Features

- **Sitemap Processing**: Automatically expands sitemap URLs and filters by patterns
- **Specific Selectors**: Support for CSS selectors, IDs, classes, and HTML tags used extract specific sections
- **Markdown Conversion**: Converts extracted HTML to clean Markdown format
- **Concurrent Scraping**: Configurable parallel requests with rate limiting
- **Automatic Retry**: Exponential backoff retry on network failures
- **Progress Tracking**: Real-time progress logging with success/failure indicators
- **Skip Handling**: Automatically skips pages without matching content
- **Dual Output**: Generates both successful scrapes and skipped pages reports

## Setup

```bash
yarn install
```

## Project Structure

```
web-scrapper/
├── scrape.js          # Main scraper entrypoint
├── input-sites.js     # Scraping targets & selector configuration
├── package.json       # Dependencies & npm scripts
├── README.md          # This file
├── output-data.js     # (generated) Successful scrape results
└── skipped-pages.js   # (generated) Pages that couldn't be scraped
```

## Configuration

Edit `input-sites.js` to configure your scraping targets:

### Selector Types (Priority Order)

| Property | Type | Example | Description |
|----------|------|---------|-------------|
| `selectors` | array | `["article.post > .content", "main"]` | CSS selectors (tries in order, stops at first match) |
| `selectorIds` | array | `["main-content", "article"]` | Element IDs (collects all matching) |
| `warpSessionClasses` | array | `["main-section", "content"]` | CSS classes (collects all matching) |
| `warpSessionTags` | array | `["main", "article"]` | HTML tags (collects all matching) |
| `excludeClasses` | array/object | `["sidebar", "ads"]` | Classes to remove from extracted section |

All selectors accept **arrays only**. The scraper tries selectors in the priority order listed above, stopping at the first match.

### Configuration Structure
```javascript
export default {
  siteMap: [
    // CSS selectors - tries each until one matches
    { url: "https://docs.example.com/sitemap.xml", selectors: ["article.doc", "div.content", "main"] },
    
    // ID selectors
    { url: "https://wiki.example.com/sitemap.xml", selectorIds: ["wiki-content"] },
    
    // Class selectors with pattern filter
    { url: "https://example.com/sitemap.xml", warpSessionClasses: ["content-wrapper"], sitemapPattern: "/docs" },
    
    // Combined: IDs with class fallback
    { url: "https://help.example.com/sitemap.xml", selectorIds: ["help-article"], warpSessionClasses: ["article-body"] }
  ],
  standAlonePages: [
    // CSS selector with attribute
    { url: "https://example.com/features.html", selectors: ["section[data-section='features'] .content"] },
    
    // Multiple fallback selectors
    { url: "https://example.com/about.html", selectors: ["#about-content", ".about-section", "main > article"] },
    
    // Class selectors with exclusions
    { url: "https://example.com/page.html", warpSessionClasses: ["main", "article-content"], excludeClasses: ["sidebar", "ads"] }
  ]
};
```

## Usage

### Quick Test (Limited Pages)
```bash
MAX_PAGES=5 yarn run scrape
```

### With Concurrency Settings
```bash
# Fast scraping: 10 concurrent requests, 200ms delay
CONCURRENCY=10 DELAY_MS=200 yarn run scrape

# Slow/respectful scraping: 2 concurrent requests, 2 second delay
CONCURRENCY=2 DELAY_MS=2000 yarn run scrape

# Combined settings
MAX_PAGES=50 CONCURRENCY=5 DELAY_MS=500 yarn run scrape
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PAGES` | `0` (all) | Maximum number of pages to scrape |
| `CONCURRENCY` | `5` | Number of concurrent requests |
| `DELAY_MS` | `500` | Delay between requests in milliseconds |
| `REMOVE_TAGS` | `style,svg,script,noscript,iframe,canvas,form` | Comma-separated list of HTML tags to remove during sanitization |

## Output Files

### `output-data.js`
Contains successfully scraped pages with:
- `url`: Page URL
- `title`: Page title
- `htmlData`: Extracted HTML section
- `mdData`: Markdown conversion

### `skipped-pages.js`
Contains pages that couldn't be scraped with:
- `url`: Page URL
- `reason`: Why it was skipped (see Skip Reason Categories below)
- `message`: Human-readable explanation
- `selectors`: The selectors that were attempted
- `errorCode`: Error code (if applicable)


## Complete Flow

1. **Configuration**: Read `input-sites.js` for scraping targets
2. **Sitemap Expansion**: 
   - Fetch sitemap XML files
   - Parse and extract all URLs
   - Apply `sitemapPattern` filtering if specified
3. **Target Collection**: Combine sitemap URLs with standalone pages
4. **Deduplication**: Remove duplicate URL/selector combinations
5. **Scraping Process**:
   - Fetch each page HTML
   - Try selectors in order: `selectors` → `selectorIds` → `warpSessionClasses` → `warpSessionTags`
   - Extract matching section or skip if none found
   - Convert HTML to Markdown
6. **Output Generation**:
   - Write successful scrapes to `output-data.js`
   - Write skipped pages to `skipped-pages.js`
   - Display progress and summary statistics

## Selector Priority

The scraper tries selectors in this order:
1. CSS selectors (`selectors`) - tries each until one matches
2. ID selectors (`selectorIds`) - collects all matching elements
3. CSS classes (`warpSessionClasses`) - collects all matching elements
4. HTML tags (`warpSessionTags`) - collects all matching elements


## Error Handling

- **Automatic Retry**: Network errors and 5xx responses trigger up to 3 retries with exponential backoff (1s, 2s, 4s)
- **Missing Selectors**: Pages skipped and recorded in `skipped-pages.js`
- **Invalid URLs**: Handled gracefully with error logging
- **Timeout**: 30-second timeout per page request
- **4xx Errors**: Not retried (404, 403, etc.) - logged as failed immediately

## HTML Sanitization

Before converting HTML to Markdown, the scraper removes unwanted tags that would pollute the output:
- `<style>` - CSS rules become garbage text in Markdown
- `<svg>` - SVG paths are unreadable in Markdown
- `<script>` - JavaScript code in output
- `<noscript>`, `<iframe>`, `<canvas>`, `<form>` - Non-content elements

The sanitizer also removes:
- Inline `style` attributes from all elements
- All `data-*` attributes (reduces noise in output)

### Customizing Sanitization

Override the default tags to remove:

```bash
# Only remove style and script tags
REMOVE_TAGS="style,script" yarn run scrape

# Remove additional tags
REMOVE_TAGS="style,svg,script,noscript,iframe,canvas,form,nav,footer" yarn run scrape
```

## Example Output

```
Scraping total 100 pages (concurrency: 5, delay: 500ms)
Scraping 1 out of 100...
✓ Scraped: https://example.com/page1
Scraping 2 out of 100...
⚠ Skipped (selector not found): https://example.com/page2
Scraping 3 out of 100...
  ↻ Retry 1/3 for https://example.com/page3
  ↻ Retry 2/3 for https://example.com/page3
✗ Failed (NETWORK_ERROR): https://example.com/page3 Network unreachable: ETIMEDOUT

Wrote output-data.js with 95 records
Wrote skipped-pages.js with 5 records
```
