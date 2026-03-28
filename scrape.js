import axios from "axios";
import axiosRetry from "axios-retry";
import { parseStringPromise } from "xml2js";
import TurndownService from "turndown";
import { load, contains } from "cheerio";
import pLimit from "p-limit";
import config from "./input-sites.js";
import fs from "fs";

// Configuration from environment variables
const CONCURRENCY = Number.parseInt(process.env.CONCURRENCY || "5", 10);
const DELAY_MS = Number.parseInt(process.env.DELAY_MS || "500", 10);

// Tags to remove during HTML sanitization (configurable via env var)
const TAGS_TO_REMOVE = (process.env.REMOVE_TAGS || 'style,svg,script,noscript,iframe,canvas,form')
	.split(',')
	.map(t => t.trim())
	.filter(Boolean);

// Configure retry logic with exponential backoff
axiosRetry(axios, {
	retries: 3,
	retryDelay: axiosRetry.exponentialDelay, // 1s, 2s, 4s
	retryCondition: (error) => {
		// Retry on network errors and 5xx responses
		return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
			(error.response?.status >= 500 && error.response?.status < 600);
	},
	onRetry: (retryCount, error, requestConfig) => {
		console.log(`  ↻ Retry ${retryCount}/3 for ${requestConfig.url}`);
	}
});

const turndown = new TurndownService({ headingStyle: "atx" });

// Helper for delay between requests (rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeUrl(raw) {
	if (!raw) return raw;
	return raw.trim();
}

async function fetchText(url) {
	const res = await axios.get(url, { responseType: "text", timeout: 30000, headers: { "User-Agent": "Mozilla/5.0 (compatible; web-scrapper/1.0)" } });
	return typeof res.data === "string" ? res.data : String(res.data);
}

async function fetchSitemapUrls(sitemapUrl) {
	const xml = await fetchText(sitemapUrl);
	const parsed = await parseStringPromise(xml, { explicitArray: true, mergeAttrs: true });
	const urls = new Set();
	// urlset -> url -> loc
	if (parsed.urlset && parsed.urlset.url) {
		for (const urlNode of parsed.urlset.url) {
			const loc = urlNode.loc?.[0];
			if (loc) urls.add(loc.trim());
		}
	}
	// sitemapindex -> sitemap -> loc (nested sitemap); fetch recursively
	if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
		for (const sm of parsed.sitemapindex.sitemap) {
			const loc = sm.loc?.[0];
			if (loc) {
				const nested = await fetchSitemapUrls(loc.trim());
				for (const u of nested) urls.add(u);
			}
		}
	}
	return Array.from(urls);
}

function toClassSelector(className) {
	return `.${className.split(" ").join(".")}`;
}

function collectIntoContainer($, elements) {
	if (elements.length === 0) return null;
	const container = $('<div class="extracted-sections"></div>');
	elements.forEach(elem => container.append($(elem).clone()));
	return container;
}

function extractSectionHtml($, { 
	warpSessionClass, 
	warpSessionTag, 
	warpSessionClasses, 
	warpSessionTags,
	selector,
	selectors,
	selectorId,
	selectorIds,
	excludeClasses
}) {
	let el = null;

	// Combined: selectorId first, then warpSessionClasses (when both provided)
	if (selectorId && warpSessionClasses && Array.isArray(warpSessionClasses)) {
		const matchedElements = [];
		const idList = Array.isArray(selectorId) ? selectorId : [selectorId];
		for (const id of idList) {
			const found = $(`#${id}`);
			if (found && found.length > 0) {
				found.each((_, elem) => matchedElements.push(elem));
			}
		}
		const idRoots = [...matchedElements];
		for (const className of warpSessionClasses) {
			const found = $(toClassSelector(className));
			if (found && found.length > 0) {
				found.each((_, elem) => {
					const isInsideId = idRoots.some(root => contains(root, elem) || root === elem);
					if (!isInsideId) matchedElements.push(elem);
				});
			}
		}
		el = collectIntoContainer($, matchedElements);
	}

	// Priority 1: Direct CSS selector (most flexible)
	if (selector) {
		el = $(selector).first();
	}

	// Priority 2: Multiple CSS selectors
	if ((!el || el.length === 0) && selectors && Array.isArray(selectors)) {
		for (const sel of selectors) {
			el = $(sel).first();
			if (el && el.length > 0) break;
		}
	}

	// Priority 3: Multiple ID selectors (collects ALL matching IDs)
	if ((!el || el.length === 0) && selectorIds && Array.isArray(selectorIds)) {
		const matchedElements = [];
		for (const id of selectorIds) {
			const found = $(`#${id}`);
			if (found && found.length > 0) {
				found.each((_, elem) => matchedElements.push(elem));
			}
		}
		el = collectIntoContainer($, matchedElements);
	}

	// Priority 4: ID selector (accepts both string and array)
	if ((!el || el.length === 0) && selectorId) {
		if (Array.isArray(selectorId)) {
			const matchedElements = [];
			for (const id of selectorId) {
				const found = $(`#${id}`);
				if (found && found.length > 0) {
					found.each((_, elem) => matchedElements.push(elem));
				}
			}
			el = collectIntoContainer($, matchedElements);
		} else {
			el = $(`#${selectorId}`).first();
		}
	}

	// Priority 5: Single CSS class (existing)
	if ((!el || el.length === 0) && warpSessionClass) {
		el = $(toClassSelector(warpSessionClass)).first();
	}

	// Priority 6: Multiple CSS classes (collects ALL matching)
	if ((!el || el.length === 0) && warpSessionClasses && Array.isArray(warpSessionClasses)) {
		const matchedElements = [];
		for (const className of warpSessionClasses) {
			const found = $(toClassSelector(className));
			if (found && found.length > 0) {
				found.each((_, elem) => matchedElements.push(elem));
			}
		}
		el = collectIntoContainer($, matchedElements);
	}

	// Priority 7: Single HTML tag (existing)
	if ((!el || el.length === 0) && warpSessionTag) {
		el = $(warpSessionTag).first();
	}

	// Priority 8: Multiple HTML tags (collects ALL matching)
	if ((!el || el.length === 0) && warpSessionTags && Array.isArray(warpSessionTags)) {
		const matchedElements = [];
		for (const tagName of warpSessionTags) {
			const found = $(tagName);
			if (found && found.length > 0) {
				found.each((_, elem) => matchedElements.push(elem));
			}
		}
		el = collectIntoContainer($, matchedElements);
	}

	if (!el || el.length === 0) return null;
	
	// Remove elements with excluded classes from within the extracted section
	if (excludeClasses) {
		// Support both array format and object format for parent-child exclusions
		if (Array.isArray(excludeClasses) && excludeClasses.length > 0) {
			// Simple format: excludeClasses: ["sidebar", "ads"]
			// Removes all elements with these classes anywhere in the extracted section
			for (const excludeClass of excludeClasses) {
				const excludeSelector = toClassSelector(excludeClass);
				el.find(excludeSelector).remove();
			}
		} else if (typeof excludeClasses === 'object' && !Array.isArray(excludeClasses)) {
			// Object format: excludeClasses: { "parent-class": ["child-class1", "child-class2"] }
			// Removes child classes only when they appear inside the specified parent class
			for (const [parentClass, childClasses] of Object.entries(excludeClasses)) {
				if (Array.isArray(childClasses)) {
					const parentSelector = toClassSelector(parentClass);
					for (const childClass of childClasses) {
						const childSelector = toClassSelector(childClass);
						// Find parent, then remove child within that parent
						el.find(parentSelector).each((_, parentElem) => {
							$(parentElem).find(childSelector).remove();
						});
					}
				}
			}
		}
	}
	
	return $.html(el);
}

function sanitizeHtml(html) {
	const $ = load(html);
	
	// Remove unwanted tags completely (including their content)
	$(TAGS_TO_REMOVE.join(',')).remove();
	
	// Remove inline style attributes
	$('[style]').removeAttr('style');
	
	// Remove data-* attributes (reduces noise in output)
	$('*').each((_, el) => {
		const attrs = el.attribs || {};
		for (const attr of Object.keys(attrs)) {
			if (attr.startsWith('data-')) {
				delete el.attribs[attr];
			}
		}
	});
	
	return $;
}

function extractH1FromHtml($) {
	return $("h1").first().text().trim() || "";
}

function extractTitle($) {
	const title = $("title").first().text().trim();
	if (title) return title;
	return $("h1").first().text().trim() || "Untitled";
}

function extractMetaDescription($) {
	const content = $('meta[name="description"]').attr("content") || "";
	return content.trim() || "";
}

async function scrapePage(url, selectorOptions) {
	const html = await fetchText(url);
	const $page = load(html);
	const sectionHtml = extractSectionHtml($page, selectorOptions);
	
	// Skip page if no matching section found
	if (!sectionHtml) {
		return null;
	}
	
	// Sanitize HTML and extract metadata (parse section once)
	const $sanitized = sanitizeHtml(sectionHtml);
	const sanitizedHtml = $sanitized.html();
	
	// Prefer h1 from scraped content as title; fallback to page title
	const h1FromSection = extractH1FromHtml($sanitized);
	const title = h1FromSection || extractTitle($page);
	const description = extractMetaDescription($page);
	const md = turndown.turndown(sanitizedHtml);
	return { url, title, description, htmlData: sanitizedHtml, mdData: md };
}

function applyPattern(urls, pattern, urlEndsWith, urlPrefixes) {
	let filtered = urls;
	if (pattern) {
		filtered = filtered.filter((u) => u.includes(pattern));
	}
	if (urlEndsWith) {
		filtered = filtered.filter((u) => u.endsWith(urlEndsWith));
	}
	if (urlPrefixes && Array.isArray(urlPrefixes) && urlPrefixes.length > 0) {
		filtered = filtered.filter((u) => urlPrefixes.some((prefix) => u.startsWith(prefix)));
	}
	return filtered;
}

function extractSelectorOptions(entry) {
	return {
		warpSessionClass: entry.warpSessionClass,
		warpSessionTag: entry.warpSessionTag,
		warpSessionClasses: entry.warpSessionClasses,
		warpSessionTags: entry.warpSessionTags,
		selector: entry.selector,
		selectors: entry.selectors,
		selectorId: entry.selectorId,
		selectorIds: entry.selectorIds,
		excludeClasses: entry.excludeClasses
	};
}

async function gatherTargets() {
	const targets = [];
	for (const entry of config.siteMap || []) {
		const sitemapUrl = normalizeUrl(entry.url);
		const allUrls = await fetchSitemapUrls(sitemapUrl);
		const filtered = applyPattern(allUrls, entry.sitemapPattern, entry.sitemapUrlEndsWith, entry.sitemapUrlPrefixes);
		for (const pageUrl of filtered) {
			targets.push({ 
				url: pageUrl, 
				...extractSelectorOptions(entry)
			});
		}
	}
	for (const page of config.standAlonePages || []) {
		targets.push({ 
			url: normalizeUrl(page.url), 
			...extractSelectorOptions(page)
		});
	}
	// de-dupe by url + all selectors
	const seen = new Set();
	const unique = [];
	for (const t of targets) {
		const key = `${t.url}__${t.selector || ''}__${JSON.stringify(t.selectors || [])}__${t.selectorId || ''}__${JSON.stringify(t.selectorIds || [])}__${t.warpSessionClass || ''}__${t.warpSessionTag || ''}__${JSON.stringify(t.warpSessionClasses || [])}__${JSON.stringify(t.warpSessionTags || [])}__${JSON.stringify(t.excludeClasses || [])}`;
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(t);
		}
	}
	return unique;
}

async function run() {
	try {
		let targets = await gatherTargets();
		const maxPages = Number.parseInt(process.env.MAX_PAGES || "0", 10);
		if (maxPages > 0) {
			targets = targets.slice(0, maxPages);
		}
		
		const totalPages = targets.length;
		console.log(`Scraping total ${totalPages} pages (concurrency: ${CONCURRENCY}, delay: ${DELAY_MS}ms)`);
		
		// Set up concurrent scraping with rate limiting
		const limit = pLimit(CONCURRENCY);
		let completed = 0;

		const scrapeWithProgress = async (target) => {
			await delay(DELAY_MS); // Rate limiting delay
			completed++;
			const currentIndex = completed;
			console.log(`Scraping ${currentIndex} out of ${totalPages}...`);
			
			const selectorOptions = extractSelectorOptions(target);
			
		try {
			const data = await scrapePage(target.url, selectorOptions);
			if (data) {
				console.log("✓ Scraped:", target.url);
				return { success: true, data };
			} else {
				console.log("⚠ Skipped (selector not found):", target.url);
				return { 
					success: false, 
					skipped: {
						url: target.url,
						reason: "SELECTOR_NOT_FOUND",
						message: "Page was reachable but no matching element found",
						selectors: selectorOptions
					}
				};
			}
		} catch (e) {
			// Categorize the error type
			const isNetworkError = e.code === 'ECONNREFUSED' || 
				e.code === 'ENOTFOUND' || 
				e.code === 'ETIMEDOUT' ||
				e.code === 'ECONNRESET' ||
				e.code === 'NET_ERROR' ||
				e.message?.includes('timeout') ||
				e.message?.includes('Navigation');
			const isHttpError = e.response?.status >= 400;
			
			let reason, message;
			if (isNetworkError) {
				reason = "NETWORK_ERROR";
				message = `Network unreachable: ${e.code || e.message}`;
			} else if (isHttpError) {
				reason = "HTTP_ERROR";
				message = `HTTP ${e.response.status}: ${e.response.statusText || 'Error'}`;
			} else {
				reason = "UNKNOWN_ERROR";
				message = e?.message || String(e);
			}
			
			console.warn(`✗ Failed (${reason}):`, target.url, message);
			return { 
				success: false, 
				skipped: {
					url: target.url,
					reason,
					message,
					errorCode: e.code || e.response?.status,
					selectors: selectorOptions
				}
			};
		}
		};

		// Execute all scrapes concurrently with rate limiting
		const allResults = await Promise.all(
			targets.map(t => limit(() => scrapeWithProgress(t)))
		);

		const results = allResults.filter(r => r.success).map(r => r.data);
		const skippedPages = allResults.filter(r => !r.success).map(r => r.skipped);

		const out = `export default ${JSON.stringify(results, null, 2)};\n`;
		fs.writeFileSync("output-data.js", out, "utf8");
		console.log(`\nWrote output-data.js with ${results.length} records`);
		
		// Write skipped pages to separate file
		if (skippedPages.length > 0) {
			const skippedOut = `export default ${JSON.stringify(skippedPages, null, 2)};\n`;
			fs.writeFileSync("skipped-pages.js", skippedOut, "utf8");
			console.log(`Wrote skipped-pages.js with ${skippedPages.length} records`);
		} else {
			console.log("No pages were skipped");
		}
	} catch (e) {
		console.error("Fatal error:", e);
		process.exitCode = 1;
	}
}

run();
