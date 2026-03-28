export default {
	// ── Examples (uncomment to use) ─────────────────────────────────────
	//
	// Selector priority (highest → lowest):
	//   selectors → selectorIds → warpSessionClasses → warpSessionTags
	//
	// All selectors accept arrays only (no single-string values).
	//
	// Sitemap examples:
	//   { url: "https://example.com/sitemap.xml", selectors: ["main article.content"] }
	//   { url: "https://example.com/sitemap.xml", selectors: ["article.doc", "div.content", "main"] }
	//   { url: "https://example.com/sitemap.xml", selectorIds: ["wiki-content"] }
	//   { url: "https://example.com/sitemap.xml", warpSessionClasses: ["content-wrapper"] }
	//   { url: "https://example.com/sitemap.xml", warpSessionClasses: ["article-body", "kb-doc"] }
	//   { url: "https://example.com/sitemap.xml", warpSessionTags: ["main", "body"], sitemapPattern: "/academy" }
	//   { url: "https://example.com/sitemap.xml", selectorIds: ["help-article"], warpSessionClasses: ["article-body"] }
	//
	// Standalone page examples:
	//   { url: "https://example.com/page.html", selectors: ["section[data-section='features'] .content"] }
	//   { url: "https://example.com/page.html", selectors: ["#about-content", ".about-section", "main > article"] }
	//   { url: "https://example.com/page.html", selectorIds: ["pricing-table"] }
	//
	// Exclude classes (remove unwanted elements from extracted section):
	//
	//   Array format — removes elements with these classes anywhere in the section:
	//   {
	//     url: "https://example.com/page.html",
	//     warpSessionClasses: ["main-section"],
	//     excludeClasses: ["sidebar", "ads", "related-posts"]
	//   }
	//
	//   Object format — removes child classes only inside a specific parent class:
	//   {
	//     url: "https://example.com/page.html",
	//     warpSessionClasses: ["main-section"],
	//     excludeClasses: {
	//       "content-wrapper": ["sidebar", "ads"],
	//       "article-body": ["related-posts"]
	//     }
	//   }
	//
	// Sitemap filters:
	//   sitemapPattern: "/kb/"              — URL must contain this substring
	//   sitemapUrlEndsWith: "/"             — URL must end with this string
	//   sitemapUrlPrefixes: ["https://…"]   — URL must start with one of these
	// ────────────────────────────────────────────────────────────────────

	siteMap: [
		// { url: "https://www.zoho.com/invoice/sitemap.xml", warpSessionClasses: ["resource-content-wrap"], sitemapUrlEndsWith: "/", sitemapUrlPrefixes: ["https://www.zoho.com/invoice/kb/"] },
	],

	standAlonePages: [
		{ url: "https://www.zoho.com/en-in/erp/", warpSessionClasses: ["widgets-wrapper", "powerful-engineering", "layers-section-wrapper", "ai-section", "growth-with-erp-section", "privacy-section", "privacy-info-section"] },
	],
};
