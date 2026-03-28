# Web Scrapper

A Node.js web scraper that extracts content from sitemaps and standalone pages, converts HTML to Markdown, and generates structured output files.

## Features

- **Sitemap Processing**: Automatically expands sitemap URLs and filters by patterns
- **Flexible Selectors**: Support for CSS selectors, IDs, classes, and HTML tags
- **Content Extraction**: Extracts specific sections using CSS selectors or HTML tags
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
| `selector` | string | `"article.post > .content"` | Any valid CSS selector |
| `selectors` | array | `["#main", "article > section"]` | Multiple CSS selectors (tries in order) |
| `selectorId` | string | `"main-content"` | Element ID (shorthand for `#id`) |
| `warpSessionClass` | string | `"main-section"` | Single CSS class |
| `warpSessionClasses` | array | `["main", "content"]` | Array of CSS classes |
| `warpSessionTag` | string | `"main"` | Single HTML tag |
| `warpSessionTags` | array | `["main", "body"]` | Array of HTML tags |

The scraper tries selectors in the priority order listed above, stopping at the first match.

### Configuration Structure
```javascript
export default {
  siteMap: [
    // Using any CSS selector
    { url: "https://example.com/sitemap.xml", selector: "main article.content" },
    
    // Multiple selectors - tries each until one matches
    { url: "https://docs.example.com/sitemap.xml", selectors: ["article.doc", "div.content", "main"] },
    
    // ID selector
    { url: "https://wiki.example.com/sitemap.xml", selectorId: "wiki-content" },
    
    // Class selector with pattern filter
    { url: "https://example.com/sitemap.xml", warpSessionClass: "content-wrapper", sitemapPattern: "/docs" },
    
    // Combined: ID with class fallback
    { url: "https://help.example.com/sitemap.xml", selectorId: "help-article", warpSessionClass: "article-body" }
  ],
  standAlonePages: [
    // Complex CSS selector with attribute
    { url: "https://example.com/features.html", selector: "section[data-section='features'] .content" },
    
    // Multiple fallback selectors
    { url: "https://example.com/about.html", selectors: ["#about-content", ".about-section", "main > article"] },
    
    // Simple class selector
    { url: "https://example.com/page.html", warpSessionClasses: ["main", "article-content"] }
  ]
};
```

## Usage

### Quick Test (Limited Pages)
```bash
MAX_PAGES=5 yarn run scrape
```

### Full Scrape (All Pages)
```bash
yarn run scrape
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

#### Skip Reason Categories

| Reason | Description |
|--------|-------------|
| `SELECTOR_NOT_FOUND` | Page was reachable but CSS selector didn't match any element |
| `NETWORK_ERROR` | Connection refused, DNS not found, timeout |
| `HTTP_ERROR` | Server returned 4xx or 5xx status code |
| `UNKNOWN_ERROR` | Other unexpected errors |

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
   - Try selectors in order: `warpSessionClass` → `warpSessionClasses` → `warpSessionTag` → `warpSessionTags`
   - Extract matching section or skip if none found
   - Convert HTML to Markdown
6. **Output Generation**:
   - Write successful scrapes to `output-data.js`
   - Write skipped pages to `skipped-pages.js`
   - Display progress and summary statistics

## Selector Priority

The scraper tries selectors in this order:
1. Direct CSS selector (`selector`) - most flexible, any valid CSS selector
2. Multiple CSS selectors (`selectors`) - tries each until one matches
3. ID selector (`selectorId`) - shorthand for `#id`
4. Single CSS class (`warpSessionClass`)
5. Multiple CSS classes (`warpSessionClasses`) - tries each until one matches
6. Single HTML tag (`warpSessionTag`)
7. Multiple HTML tags (`warpSessionTags`) - tries each until one matches

## Error Handling

- **Automatic Retry**: Network errors and 5xx responses trigger up to 3 retries with exponential backoff (1s, 2s, 4s)
- **Network Errors**: After retries exhausted, logged as failed pages in `skipped-pages.js`
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

## Dependencies

- `axios`: HTTP requests
- `axios-retry`: Automatic retry with exponential backoff
- `cheerio`: HTML parsing and DOM manipulation
- `p-limit`: Concurrency control for parallel requests
- `turndown`: HTML to Markdown conversion
- `xml2js`: XML parsing for sitemaps
