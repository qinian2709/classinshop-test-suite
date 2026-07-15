#!/usr/bin/env node
/**
 * Previously patched playwright-enhanced-reporter to split environment/metrics widgets.
 * That patch was fragile (undeclared temps like `_n`, CRLF needles) and broke CI HTML generation.
 *
 * Keep this as a no-op postinstall hook so existing package.json scripts stay valid.
 * Use upstream dashboardWidgets keys only (see playwright.config.ts).
 */
console.log('ℹ️  patch-reporter: skipped (using upstream playwright-enhanced-reporter as-is)');
