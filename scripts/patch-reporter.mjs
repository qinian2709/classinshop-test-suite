#!/usr/bin/env node
/**
 * Postinstall: add dashboardWidgets.environment / metrics to playwright-enhanced-reporter.
 *
 * Upstream only gates overview+metrics via `overview`. We split:
 * - overview → summary cards
 * - environment → Environment Details panel (default off)
 * - metrics → Performance Metrics panel
 *
 * Safety rules (previous CI breakages):
 * - Never put target-file `${...}` inside a JS template literal in THIS script
 * - Never introduce undeclared temps like `_n` (upstream var list skips `_n`)
 * - Match both LF and CRLF
 * - Never fail pnpm install
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const reporterPath = join(
  projectRoot,
  'node_modules',
  'playwright-enhanced-reporter',
  'dist',
  'html-generator.js',
);
const typesPath = join(
  projectRoot,
  'node_modules',
  'playwright-enhanced-reporter',
  'dist',
  'types.d.ts',
);

function main() {
  if (!existsSync(reporterPath)) {
    console.log('⚠️  playwright-enhanced-reporter not installed, skipping patch');
    return;
  }

  let content = readFileSync(reporterPath, 'utf-8');
  let patched = false;

  // 1. Add environment / metrics keys — no undeclared `_n` / `_q`
  if (!content.includes('dashboardWidgets.environment')) {
    const needleRe =
      /speedboard: \(_o = dashboardWidgets\.speedboard\) !== null && _o !== void 0 \? _o : true,\r?\n        \};/;
    const replacement = [
      'speedboard: (_o = dashboardWidgets.speedboard) !== null && _o !== void 0 ? _o : true,',
      // Avoid TS emit temps (_n is NOT in upstream `var` list).
      '            environment: dashboardWidgets.environment == null ? false : dashboardWidgets.environment,',
      '            metrics: dashboardWidgets.metrics == null ? true : dashboardWidgets.metrics,',
      '        };',
    ].join('\n');
    if (!needleRe.test(content)) {
      console.warn('⚠️  patch #1 needle not found, skipping');
    } else {
      content = content.replace(needleRe, replacement);
      patched = true;
    }
  }

  // 2. Gate Environment Details + Metrics separately (was both under w.overview)
  if (!content.includes('w.environment ? this.generateEnvironmentDetailsSection')) {
    const needle =
      "${w.overview ? this.generateMetricsSection(metrics, passRate, failRate, avgDuration) : ''}";
    // String concat so THIS script does not evaluate ${w...}
    const replacement =
      "${w.environment ? this.generateEnvironmentDetailsSection(metrics, appInfo) : ''}\n" +
      "        ${w.metrics ? this.generateMetricsSection(metrics, passRate, failRate, avgDuration) : ''}";
    if (!content.includes(needle)) {
      if (content.includes('w.metrics ? this.generateMetricsSection')) {
        console.log('ℹ️  patch #2 already applied, skipping');
      } else {
        console.warn('⚠️  patch #2 needle not found, skipping');
      }
    } else {
      content = content.replace(needle, replacement);
      patched = true;
    }
  }

  // 3. Pull Environment Info out of generateOverviewSection into its own method
  if (!content.includes('static generateEnvironmentDetailsSection(')) {
    const needleRe = /<\/div>\r?\n[ \t]*\r?\n[ \t]*<!-- Environment Info Row -->/;
    const replacement =
      '</div>`;\n' +
      '    }\n' +
      '    static generateEnvironmentDetailsSection(metrics, appInfo) {\n' +
      '        return `\n' +
      '        <!-- Environment Info Row -->';
    if (!needleRe.test(content)) {
      console.warn('⚠️  patch #3 needle not found, skipping');
    } else {
      content = content.replace(needleRe, replacement);
      patched = true;
    }
  }

  // 4. Test Suites panel: internal scroll when many suite cards (overflow:hidden clips content)
  // NOTE: do NOT set min-height:0 on .suite-list — it collapses suite-card rows in flex layout.
  // NOTE: #suites .x_content max-height beats .x_panel.collapsed unless we add a higher-specificity override.
  const suiteScrollPatch = `
        /* patched: scroll long suite lists inside Test Suites panel */
        #suites .x_content {
            justify-content: flex-start;
            overflow-x: hidden;
            overflow-y: auto;
            max-height: min(70vh, 2000px);
        }

        #suites .x_panel.collapsed .x_content {
            max-height: 0;
            overflow: hidden;
            padding: 0 20px;
        }`;

  const suiteScrollPatchOld =
    /\r?\n\r?\n        \/\* patched: scroll long suite lists inside Test Suites panel \*\/\r?\n        #suites \.x_content \{\r?\n            justify-content: flex-start;\r?\n            overflow-x: hidden;\r?\n            overflow-y: auto;\r?\n            max-height: min\(70vh, 2000px\);\r?\n        \}(?:\r?\n\r?\n        #suites \.suite-list \{\r?\n            min-height: 0;\r?\n        \})?/;

  if (content.includes('#suites .suite-list {\n            min-height: 0;\n        }')) {
    content = content.replace(suiteScrollPatchOld, suiteScrollPatch);
    patched = true;
  } else if (
    content.includes('#suites .x_content {') &&
    !content.includes('#suites .x_panel.collapsed .x_content {')
  ) {
    content = content.replace(suiteScrollPatchOld, suiteScrollPatch);
    patched = true;
  } else if (!content.includes('#suites .x_content {')) {
    const suiteListRe =
      /\.suite-list \{\r?\n            display: flex;\r?\n            flex-direction: column;\r?\n            gap: 12px;\r?\n        \}/;
    const suiteListReplacement = `.suite-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }${suiteScrollPatch}`;
    if (!suiteListRe.test(content)) {
      console.warn('⚠️  patch #4 needle not found, skipping');
    } else {
      content = content.replace(suiteListRe, suiteListReplacement);
      patched = true;
    }
  }

  if (patched) {
    writeFileSync(reporterPath, content, 'utf-8');
    console.log('✅ playwright-enhanced-reporter patched');
  } else {
    console.log('ℹ️  playwright-enhanced-reporter already patched, skipping');
  }

  if (existsSync(typesPath)) {
    let typesContent = readFileSync(typesPath, 'utf-8');
    if (!typesContent.includes('environment?: boolean;')) {
      const oldInterface = `export interface DashboardWidgetConfig {
    overview?: boolean;`;
      const newInterface = `export interface DashboardWidgetConfig {
    overview?: boolean;
    environment?: boolean;
    metrics?: boolean;`;
      if (typesContent.includes(oldInterface)) {
        typesContent = typesContent.replace(oldInterface, newInterface);
        writeFileSync(typesPath, typesContent, 'utf-8');
        console.log('✅ playwright-enhanced-reporter types patched');
      } else {
        console.warn('⚠️  types patch needle not found, skipping');
      }
    }
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`⚠️  patch-reporter failed (non-fatal): ${message}`);
  process.exit(0);
}
