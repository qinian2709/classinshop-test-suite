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

  // 6. 筛选条：Test Results 三栏下方、Suites 上方（不改饼图数据）
  const FILTERS_POS_MARKER = '<!-- patched: filters below Test Results, above Suites -->';
  const filtersRowHtml =
    '        ' +
    FILTERS_POS_MARKER +
    '\n' +
    '        <div class="row" id="global-filters">\n' +
    '            <div class="col-md-12">\n' +
    '                <div class="filters-container filters-sticky">\n' +
    '                    <div class="filter-group">\n' +
    '                        <label for="search-input"><i class="fas fa-search"></i> Search</label>\n' +
    '                        <input type="text" id="search-input" placeholder="Search test names..." class="filter-input">\n' +
    '                    </div>\n' +
    '                    <div class="filter-group">\n' +
    '                        <label for="status-filter"><i class="fas fa-filter"></i> Status</label>\n' +
    '                        <select id="status-filter" class="filter-select">\n' +
    '                            <option value="">All</option>\n' +
    '                            <option value="passed">Passed</option>\n' +
    '                            <option value="failed">Failed</option>\n' +
    '                            <option value="skipped">Skipped</option>\n' +
    '                        </select>\n' +
    '                    </div>\n' +
    '                    <div class="filter-group">\n' +
    '                        <label for="browser-filter"><i class="fas fa-globe"></i> Browser</label>\n' +
    '                        <select id="browser-filter" class="filter-select">\n' +
    '                            <option value="">All</option>\n' +
    '                        </select>\n' +
    '                    </div>\n' +
    '                    <div class="filter-group">\n' +
    '                        <label for="severity-filter"><i class="fas fa-exclamation-triangle"></i> Severity</label>\n' +
    '                        <select id="severity-filter" class="filter-select">\n' +
    '                            <option value="">All</option>\n' +
    '                            <option value="critical">Critical</option>\n' +
    '                            <option value="high">High</option>\n' +
    '                            <option value="medium">Medium</option>\n' +
    '                            <option value="normal">Normal</option>\n' +
    '                            <option value="low">Low</option>\n' +
    '                        </select>\n' +
    '                    </div>\n' +
    '                    <div class="filter-group">\n' +
    '                        <label for="feature-filter"><i class="fas fa-tag"></i> Feature</label>\n' +
    '                        <select id="feature-filter" class="filter-select">\n' +
    '                            <option value="">All</option>\n' +
    '                        </select>\n' +
    '                    </div>\n' +
    '                    <div class="filter-group">\n' +
    '                        <label for="category-filter"><i class="fas fa-tags"></i> Category</label>\n' +
    '                        <select id="category-filter" class="filter-select">\n' +
    '                            <option value="">All</option>\n' +
    '                        </select>\n' +
    '                    </div>\n' +
    '                    <button id="clear-filters" class="clear-filters-btn"><i class="fas fa-times-circle"></i> Clear Filters</button>\n' +
    '                </div>\n' +
    '            </div>\n' +
    '        </div>\n';
  const overviewInsertNeedle =
    "        ${w.overview ? this.generateOverviewSection(metrics, passRate, failRate, avgDuration, appInfo) : ''}\n";
  const overviewInsertReplacement = overviewInsertNeedle + filtersRowHtml;

  // 6a. 已挂在页顶 → 挪到 overview 后
  if (
    content.includes('id="global-filters"') &&
    !content.includes(FILTERS_POS_MARKER) &&
    content.includes('<!-- patched: global filters sticky bar -->')
  ) {
    const oldTopFiltersRe =
      /\r?\n[ \t]*<!-- patched: global filters sticky bar -->\r?\n[ \t]*<div class="row" id="global-filters">[\s\S]*?<button id="clear-filters"[\s\S]*?<\/button>\r?\n[ \t]*<\/div>\r?\n[ \t]*<\/div>\r?\n[ \t]*<\/div>\r?\n/;
    if (!oldTopFiltersRe.test(content)) {
      console.warn('⚠️  patch #6 relocate: old top filters not found, skipping');
    } else if (!content.includes(overviewInsertNeedle)) {
      console.warn('⚠️  patch #6 relocate: overview needle not found, skipping');
    } else {
      content = content.replace(oldTopFiltersRe, '\n');
      content = content.replace(overviewInsertNeedle, overviewInsertReplacement);
      patched = true;
    }
  }

  // 6b. 首次：从 Details 挪到 overview 后
  if (!content.includes('id="global-filters"')) {
    const detailsFiltersRe =
      /(\r?\n)[ \t]*<!-- Filters Section -->\r?\n[ \t]*<div class="filters-container">[\s\S]*?<\/div>\r?\n([ \t]*<div class="results-summary">)/;
    if (!detailsFiltersRe.test(content)) {
      console.warn('⚠️  patch #6 details filters needle not found, skipping');
    } else if (!content.includes(overviewInsertNeedle)) {
      console.warn('⚠️  patch #6 overview needle not found, skipping');
    } else {
      content = content.replace(detailsFiltersRe, '$1$2');
      content = content.replace(overviewInsertNeedle, overviewInsertReplacement);
      patched = true;
    }
  }

  // 6c. 筛选不改 Test Results 饼图（仅 Suites/Details 跟着变）
  if (
    content.includes('updateChartsFromFilteredRows(filteredRows)') &&
    !content.includes('patched: keep overview pie chart independent of filters')
  ) {
    const chartUpdateNeedle =
      "                if (typeof updateChartsFromFilteredRows === 'function') {\n" +
      '                    updateChartsFromFilteredRows(filteredRows);\n' +
      '                }';
    const chartUpdateReplacement =
      '                // patched: keep overview pie chart independent of filters\n' +
      '                // status/search still filter Suites + Details only';
    if (!content.includes(chartUpdateNeedle)) {
      console.warn('⚠️  patch #6c chart update needle not found, skipping');
    } else {
      content = content.replace(chartUpdateNeedle, chartUpdateReplacement);
      patched = true;
    }
  }

  // 6b. sticky 样式
  if (content.includes('id="global-filters"') && !content.includes('.filters-sticky')) {
    const cssNeedle = '        /* Filters Section */\n        .filters-container {';
    const cssReplacement =
      '        /* patched: sticky global filters under navbar */\n' +
      '        #global-filters {\n' +
      '            position: sticky;\n' +
      '            top: 72px;\n' +
      '            z-index: 900;\n' +
      '            margin: 0 0 16px 0;\n' +
      '        }\n' +
      '        #global-filters .filters-sticky {\n' +
      '            margin-bottom: 0;\n' +
      '            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);\n' +
      '            background: var(--md-surface);\n' +
      '        }\n' +
      '        .legend-item.filterable,\n' +
      '        .metric-card.filterable {\n' +
      '            cursor: pointer;\n' +
      '            transition: transform 0.15s ease, box-shadow 0.15s ease, outline 0.15s ease;\n' +
      '        }\n' +
      '        .legend-item.filterable:hover,\n' +
      '        .metric-card.filterable:hover {\n' +
      '            transform: translateY(-1px);\n' +
      '        }\n' +
      '        .legend-item.filterable.active,\n' +
      '        .metric-card.filterable.active {\n' +
      '            outline: 2px solid var(--md-primary);\n' +
      '            outline-offset: 2px;\n' +
      '        }\n' +
      '        /* Filters Section */\n' +
      '        .filters-container {';
    if (!content.includes(cssNeedle)) {
      console.warn('⚠️  patch #6b css needle not found, skipping');
    } else {
      content = content.replace(cssNeedle, cssReplacement);
      patched = true;
    }
  }

  // 7. Test Results Passed/Failed/Skipped 点击写入 Status 筛选项
  if (!content.includes('function filterByStatus(')) {
    // 7a. overview legend 可点
    const legendPassed =
      '                                <div class="legend-item">\n' +
      '                                    <div class="legend-label">\n' +
      '                                        <i class="fas fa-check-circle passed-color"></i>\n' +
      '                                        <span>Passed</span>';
    const legendPassedNew =
      '                                <div class="legend-item filterable" data-status-filter="passed" onclick="filterByStatus(\'passed\')" title="Filter by Passed">\n' +
      '                                    <div class="legend-label">\n' +
      '                                        <i class="fas fa-check-circle passed-color"></i>\n' +
      '                                        <span>Passed</span>';
    const legendFailed =
      '                                <div class="legend-item">\n' +
      '                                    <div class="legend-label">\n' +
      '                                        <i class="fas fa-times-circle failed-color"></i>\n' +
      '                                        <span>Failed</span>';
    const legendFailedNew =
      '                                <div class="legend-item filterable" data-status-filter="failed" onclick="filterByStatus(\'failed\')" title="Filter by Failed">\n' +
      '                                    <div class="legend-label">\n' +
      '                                        <i class="fas fa-times-circle failed-color"></i>\n' +
      '                                        <span>Failed</span>';
    const legendSkipped =
      '                                <div class="legend-item">\n' +
      '                                    <div class="legend-label">\n' +
      '                                        <i class="fas fa-minus-circle skipped-color"></i>\n' +
      '                                        <span>Skipped</span>';
    const legendSkippedNew =
      '                                <div class="legend-item filterable" data-status-filter="skipped" onclick="filterByStatus(\'skipped\')" title="Filter by Skipped">\n' +
      '                                    <div class="legend-label">\n' +
      '                                        <i class="fas fa-minus-circle skipped-color"></i>\n' +
      '                                        <span>Skipped</span>';

    if (
      content.includes(legendPassed) &&
      content.includes(legendFailed) &&
      content.includes(legendSkipped)
    ) {
      content = content
        .replace(legendPassed, legendPassedNew)
        .replace(legendFailed, legendFailedNew)
        .replace(legendSkipped, legendSkippedNew);
      patched = true;
    } else {
      console.warn('⚠️  patch #7 legend needles not found, skipping legend click');
    }

    // 7b. Performance Metrics 卡片也可点
    const metricPassed = '                            <div class="metric-card passed">';
    const metricFailed = '                            <div class="metric-card failed">';
    const metricTotal = '                            <div class="metric-card total">';
    if (content.includes(metricPassed) && content.includes(metricFailed)) {
      content = content
        .replace(
          metricTotal,
          '                            <div class="metric-card total filterable" data-status-filter="" onclick="filterByStatus(\'\')" title="Clear status filter">',
        )
        .replace(
          metricPassed,
          '                            <div class="metric-card passed filterable" data-status-filter="passed" onclick="filterByStatus(\'passed\')" title="Filter by Passed">',
        )
        .replace(
          metricFailed,
          '                            <div class="metric-card failed filterable" data-status-filter="failed" onclick="filterByStatus(\'failed\')" title="Filter by Failed">',
        );
      patched = true;
    }

    // 7c. filterByStatus + 高亮同步（用 change 事件触发 initializeFilters 内的 applyFilters）
    const filterByCategoryNeedle = '        // Category Filter Function\n        let activeCategory = null;';
    const filterByStatusFn =
      '        // patched: status filter from Test Results / metric cards\n' +
      '        function syncStatusFilterActiveState() {\n' +
      "            const statusFilter = document.getElementById('status-filter');\n" +
      "            const value = statusFilter ? statusFilter.value : '';\n" +
      "            document.querySelectorAll('[data-status-filter]').forEach(el => {\n" +
      "                const key = el.getAttribute('data-status-filter') || '';\n" +
      '                el.classList.toggle(\'active\', !!value && key === value);\n' +
      '            });\n' +
      '        }\n' +
      '        function filterByStatus(status) {\n' +
      "            const statusFilter = document.getElementById('status-filter');\n" +
      '            if (!statusFilter) return;\n' +
      "            const next = statusFilter.value === status ? '' : (status || '');\n" +
      '            statusFilter.value = next;\n' +
      '            syncStatusFilterActiveState();\n' +
      "            statusFilter.dispatchEvent(new Event('change'));\n" +
      '        }\n' +
      '\n' +
      '        // Category Filter Function\n' +
      '        let activeCategory = null;';
    if (!content.includes(filterByCategoryNeedle)) {
      console.warn('⚠️  patch #7 filterByStatus needle not found, skipping');
    } else {
      content = content.replace(filterByCategoryNeedle, filterByStatusFn);
      patched = true;
    }

    // 7d. clear filters 时清高亮
    const clearNeedle =
      "                document.querySelectorAll('.category-tests-section').forEach(section => section.style.display = 'none');\n" +
      '                applyFilters();';
    const clearReplacement =
      "                document.querySelectorAll('.category-tests-section').forEach(section => section.style.display = 'none');\n" +
      "                document.querySelectorAll('[data-status-filter]').forEach(el => el.classList.remove('active'));\n" +
      '                applyFilters();';
    if (content.includes(clearNeedle)) {
      content = content.replace(clearNeedle, clearReplacement);
      patched = true;
    }

    // 7e. 下拉改 Status 时同步高亮
    const statusListenerNeedle =
      "            document.getElementById('status-filter').addEventListener('change', applyFilters);";
    const statusListenerReplacement =
      "            document.getElementById('status-filter').addEventListener('change', function() {\n" +
      '                syncStatusFilterActiveState();\n' +
      '                applyFilters();\n' +
      '            });';
    if (content.includes(statusListenerNeedle)) {
      content = content.replace(statusListenerNeedle, statusListenerReplacement);
      patched = true;
    }
  }

  // 5. Details 的 Status/Search 同步过滤 Test Suites（上游 applyFilters 只改 details 表格）
  if (!content.includes('function filterSuitesPanel(')) {
    const needle =
      "                if (typeof updateChartsFromFilteredRows === 'function') {\n" +
      '                    updateChartsFromFilteredRows(filteredRows);\n' +
      '                }\n' +
      '            }';
    const replacement =
      "                if (typeof updateChartsFromFilteredRows === 'function') {\n" +
      '                    updateChartsFromFilteredRows(filteredRows);\n' +
      '                }\n' +
      '                // patched: sync Test Suites panel with Details status/search filters\n' +
      "                if (typeof filterSuitesPanel === 'function') {\n" +
      '                    filterSuitesPanel(searchValue, statusValue);\n' +
      '                }\n' +
      '            }\n' +
      '\n' +
      '            function filterSuitesPanel(searchValue, statusValue) {\n' +
      "                const suiteCards = document.querySelectorAll('#suites .suite-card');\n" +
      '                suiteCards.forEach(card => {\n' +
      "                    const items = card.querySelectorAll('.suite-test-item');\n" +
      '                    let visibleCount = 0;\n' +
      '                    items.forEach(item => {\n' +
      '                        const statusClass = Array.from(item.classList).find(c => c.indexOf(\'status-\') === 0) || \'\';\n' +
      "                        const status = statusClass.replace('status-', '');\n" +
      "                        const nameEl = item.querySelector('.test-name');\n" +
      "                        const name = (nameEl && nameEl.textContent ? nameEl.textContent : '').toLowerCase();\n" +
      '                        const matchesStatus = !statusValue || status.indexOf(statusValue) !== -1;\n' +
      '                        const matchesSearch = !searchValue || name.indexOf(searchValue) !== -1;\n' +
      '                        const show = matchesStatus && matchesSearch;\n' +
      "                        item.style.display = show ? '' : 'none';\n" +
      '                        if (show) visibleCount++;\n' +
      '                    });\n' +
      '                    const filtering = !!(statusValue || searchValue);\n' +
      "                    card.style.display = !filtering || visibleCount > 0 ? '' : 'none';\n" +
      '                    if (filtering && visibleCount > 0) {\n' +
      "                        const tests = card.querySelector('.suite-tests');\n" +
      "                        if (tests) tests.style.display = 'block';\n" +
      "                        const header = card.querySelector('.suite-header');\n" +
      "                        if (header) header.classList.add('expanded');\n" +
      '                    }\n' +
      '                });\n' +
      '            }';
    if (!content.includes(needle)) {
      console.warn('⚠️  patch #5 needle not found, skipping');
    } else {
      content = content.replace(needle, replacement);
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
