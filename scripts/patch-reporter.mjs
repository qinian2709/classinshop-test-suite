#!/usr/bin/env node
/**
 * Postinstall script to patch playwright-enhanced-reporter for dashboard widget splitting.
 * This adds 'environment' and 'metrics' control keys to the dashboardWidgets config.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const reporterPath = join(projectRoot, 'node_modules', 'playwright-enhanced-reporter', 'dist', 'html-generator.js');
const typesPath = join(projectRoot, 'node_modules', 'playwright-enhanced-reporter', 'dist', 'types.d.ts');

if (!existsSync(reporterPath)) {
  console.log('⚠️  playwright-enhanced-reporter not installed, skipping patch');
  process.exit(0);
}

let content = readFileSync(reporterPath, 'utf-8');
let patched = false;

// 1. Add environment and metrics to w object
if (!content.includes('dashboardWidgets.environment')) {
  const needle = 'speedboard: (_o = dashboardWidgets.speedboard) !== null && _o !== void 0 ? _o : true,\n        };';
  const replacement = `speedboard: (_o = dashboardWidgets.speedboard) !== null && _o !== void 0 ? _o : true,
            environment: (_n = dashboardWidgets.environment) !== null && _n !== void 0 ? _n : false,
            metrics: (_p = dashboardWidgets.metrics) !== null && _p !== void 0 ? _p : true,
        };`;
  content = content.replace(needle, replacement);
  patched = true;
}

// 2. Update rendering logic - replace w.overview ? this.generateMetricsSection with separate controls
if (!content.includes('w.environment ? this.generateEnvironmentDetailsSection')) {
  const needle = "${w.overview ? this.generateMetricsSection(metrics, passRate, failRate, avgDuration) : ''}";
  const replacement = `${w.environment ? this.generateEnvironmentDetailsSection(metrics, appInfo) : ''}
        ${w.metrics ? this.generateMetricsSection(metrics, passRate, failRate, avgDuration) : ''}`;
  content = content.replace(needle, replacement);
  patched = true;
}

// 3. Extract Environment Details into its own method
if (!content.includes('static generateEnvironmentDetailsSection(')) {
  const needle = '</div>\n\n        <!-- Environment Info Row -->';
  const replacement = '</div>`;\n    }\n    static generateEnvironmentDetailsSection(metrics, appInfo) {\n        return `\n        <!-- Environment Info Row -->';
  content = content.replace(needle, replacement);
  patched = true;
}

if (patched) {
  writeFileSync(reporterPath, content, 'utf-8');
}

// Patch types.d.ts
if (existsSync(typesPath)) {
  let typesContent = readFileSync(typesPath, 'utf-8');
  let typesPatched = false;
  if (!typesContent.includes('environment?: boolean;')) {
    const oldInterface = `export interface DashboardWidgetConfig {
    overview?: boolean;`;
    const newInterface = `export interface DashboardWidgetConfig {
    overview?: boolean;
    environment?: boolean;
    metrics?: boolean;`;
    typesContent = typesContent.replace(oldInterface, newInterface);
    writeFileSync(typesPath, typesContent, 'utf-8');
    typesPatched = true;
  }
  if (typesPatched) {
    console.log('✅ playwright-enhanced-reporter types patched');
  }
}

if (patched || existsSync(typesPath)) {
  console.log('✅ playwright-enhanced-reporter patched successfully');
} else {
  console.log('ℹ️  playwright-enhanced-reporter already patched, skipping');
}
