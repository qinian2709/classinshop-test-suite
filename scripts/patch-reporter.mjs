#!/usr/bin/env node
/**
 * Postinstall script to patch playwright-enhanced-reporter for dashboard widget splitting.
 * This adds 'environment' and 'metrics' control keys to the dashboardWidgets config.
 *
 * IMPORTANT: replacement strings that contain `${...}` for the TARGET file must escape
 * as `\${...}` so Node does not evaluate them inside this patch script.
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

  // 1. Add environment and metrics to w object
  if (!content.includes('dashboardWidgets.environment')) {
    const needle =
      'speedboard: (_o = dashboardWidgets.speedboard) !== null && _o !== void 0 ? _o : true,\n        };';
    const replacement = [
      'speedboard: (_o = dashboardWidgets.speedboard) !== null && _o !== void 0 ? _o : true,',
      '            environment: (_n = dashboardWidgets.environment) !== null && _n !== void 0 ? _n : false,',
      '            metrics: (_p = dashboardWidgets.metrics) !== null && _p !== void 0 ? _p : true,',
      '        };',
    ].join('\n');
    if (!content.includes(needle)) {
      console.warn('⚠️  patch #1 needle not found, skipping');
    } else {
      content = content.replace(needle, replacement);
      patched = true;
    }
  }

  // 2. Split overview metrics rendering into environment + metrics widgets
  // Target file should contain template literals like ${w.environment ? ...}
  if (!content.includes('w.environment ? this.generateEnvironmentDetailsSection')) {
    const needle =
      "${w.overview ? this.generateMetricsSection(metrics, passRate, failRate, avgDuration) : ''}";
    // Escape ${ so THIS script does not evaluate `w` at runtime.
    const replacement =
      '${w.environment ? this.generateEnvironmentDetailsSection(metrics, appInfo) : \'\'}\n' +
      '        ${w.metrics ? this.generateMetricsSection(metrics, passRate, failRate, avgDuration) : \'\'}';
    if (!content.includes(needle)) {
      // Already patched to overview+metrics form, or upstream changed.
      if (content.includes('w.metrics ? this.generateMetricsSection')) {
        console.log('ℹ️  patch #2 already applied or upstream differs, skipping');
      } else {
        console.warn('⚠️  patch #2 needle not found, skipping');
      }
    } else {
      content = content.replace(needle, replacement);
      patched = true;
    }
  }

  // 3. Extract Environment Details into its own method
  // Upstream uses whitespace-only blank line: "</div>\n        \n        <!-- Environment..."
  if (!content.includes('static generateEnvironmentDetailsSection(')) {
    const needleRe =
      /<\/div>\r?\n[ \t]*\r?\n[ \t]*<!-- Environment Info Row -->/;
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

  if (patched) {
    writeFileSync(reporterPath, content, 'utf-8');
  }

  // Patch types.d.ts
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

  if (patched) {
    console.log('✅ playwright-enhanced-reporter patched successfully');
  } else {
    console.log('ℹ️  playwright-enhanced-reporter already patched, skipping');
  }
}

try {
  main();
} catch (error) {
  // Never fail pnpm install because of an optional reporter patch.
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`⚠️  patch-reporter failed (non-fatal): ${message}`);
  process.exit(0);
}
