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
const indexPath = join(
  projectRoot,
  'node_modules',
  'playwright-enhanced-reporter',
  'dist',
  'index.js',
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

  const raw = readFileSync(reporterPath, 'utf-8');
  // 上游 npm 包为 CRLF；统一成 LF，后续 needle 才能稳定命中（CI 失败根因）
  let content = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let patched = raw !== content;

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

  // 6d. Clear 与筛选项同一行（勿折行）
  if (
    content.includes('#global-filters .filters-sticky') &&
    !content.includes('#global-filters .clear-filters-btn')
  ) {
    const stickyBlockNeedle =
      '        #global-filters .filters-sticky {\n' +
      '            margin-bottom: 0;\n' +
      '            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);\n' +
      '            background: var(--md-surface);\n' +
      '        }';
    const stickyBlockReplacement =
      '        #global-filters .filters-sticky {\n' +
      '            margin-bottom: 0;\n' +
      '            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);\n' +
      '            background: var(--md-surface);\n' +
      '            flex-wrap: nowrap;\n' +
      '            align-items: flex-end;\n' +
      '            gap: 10px;\n' +
      '            padding: 14px 16px;\n' +
      '        }\n' +
      '        #global-filters .filter-group {\n' +
      '            min-width: 0;\n' +
      '            flex: 1 1 0;\n' +
      '        }\n' +
      '        #global-filters .filter-input,\n' +
      '        #global-filters .filter-select {\n' +
      '            min-width: 0;\n' +
      '            width: 100%;\n' +
      '            font-size: 0.875rem;\n' +
      '            padding: 8px 10px;\n' +
      '        }\n' +
      '        #global-filters .clear-filters-btn {\n' +
      '            flex: 0 0 auto;\n' +
      '            align-self: flex-end;\n' +
      '            white-space: nowrap;\n' +
      '            padding: 8px 14px;\n' +
      '            font-size: 0.875rem;\n' +
      '        }';
    if (!content.includes(stickyBlockNeedle)) {
      console.warn('⚠️  patch #6d nowrap css needle not found, skipping');
    } else {
      content = content.replace(stickyBlockNeedle, stickyBlockReplacement);
      patched = true;
    }
  }

  // 5. Details 的 Status/Search 同步过滤 Test Suites（须在 6c 之前：6c 会删掉 updateCharts 调用）
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
      '            flex-wrap: nowrap;\n' +
      '            align-items: flex-end;\n' +
      '            gap: 10px;\n' +
      '            padding: 14px 16px;\n' +
      '        }\n' +
      '        #global-filters .filter-group {\n' +
      '            min-width: 0;\n' +
      '            flex: 1 1 0;\n' +
      '        }\n' +
      '        #global-filters .filter-input,\n' +
      '        #global-filters .filter-select {\n' +
      '            min-width: 0;\n' +
      '            width: 100%;\n' +
      '            font-size: 0.875rem;\n' +
      '            padding: 8px 10px;\n' +
      '        }\n' +
      '        #global-filters .clear-filters-btn {\n' +
      '            flex: 0 0 auto;\n' +
      '            align-self: flex-end;\n' +
      '            white-space: nowrap;\n' +
      '            padding: 8px 14px;\n' +
      '            font-size: 0.875rem;\n' +
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

  // 8. Suites step 错误被 flex 横向挤成竖条：主行 / 错误 / 子 step 纵向堆叠
  if (!content.includes('patched: step-item stack error/children')) {
    const stepItemCssNeedle =
      '        .step-item {\n' +
      '            display: flex;\n' +
      '            align-items: flex-start;\n' +
      '            gap: 8px;\n' +
      '            padding: 6px 0;\n' +
      '            font-size: 0.9rem;\n' +
      '        }';
    const stepItemCssReplacement =
      '        /* patched: step-item stack error/children */\n' +
      '        .step-item {\n' +
      '            display: flex;\n' +
      '            flex-direction: column;\n' +
      '            align-items: stretch;\n' +
      '            gap: 4px;\n' +
      '            padding: 6px 0;\n' +
      '            font-size: 0.9rem;\n' +
      '            min-width: 0;\n' +
      '            width: 100%;\n' +
      '            box-sizing: border-box;\n' +
      '        }\n' +
      '        .step-main {\n' +
      '            display: flex;\n' +
      '            align-items: flex-start;\n' +
      '            gap: 8px;\n' +
      '            min-width: 0;\n' +
      '            width: 100%;\n' +
      '        }\n' +
      '        .step-main .step-title {\n' +
      '            flex: 1;\n' +
      '            min-width: 0;\n' +
      '            overflow-wrap: anywhere;\n' +
      '            word-break: break-word;\n' +
      '        }\n' +
      '        .step-error, .test-error {\n' +
      '            width: 100%;\n' +
      '            min-width: 0;\n' +
      '            max-width: 100%;\n' +
      '            box-sizing: border-box;\n' +
      '            overflow-wrap: anywhere;\n' +
      '            word-break: break-word;\n' +
      '            white-space: normal;\n' +
      '        }\n' +
      '        .step-error code, .test-error code {\n' +
      '            display: block;\n' +
      '            white-space: pre-wrap;\n' +
      '            overflow-wrap: anywhere;\n' +
      '            word-break: break-word;\n' +
      '        }';
    if (!content.includes(stepItemCssNeedle)) {
      console.warn('⚠️  patch #8 step-item css needle not found, skipping');
    } else {
      content = content.replace(stepItemCssNeedle, stepItemCssReplacement);
      patched = true;
    }
  }

  if (!content.includes('class="step-main"')) {
    const stepOpenNeedle =
      '        <div class="step-item" style="padding-left: ${level * 20}px">\n' +
      "            <i class=\"fas fa-${step.status === 'passed' ? 'check-circle' : step.status === 'failed' ? 'times-circle' : 'minus-circle'} step-status ${step.status}\"></i>\n" +
      '            <span class="step-title">${this.escapeHtml(step.title)}</span>\n' +
      '            <span class="step-duration">${step.duration}ms</span>';
    const stepOpenReplacement =
      '        <div class="step-item" style="padding-left: ${level * 20}px">\n' +
      '            <div class="step-main">\n' +
      "            <i class=\"fas fa-${step.status === 'passed' ? 'check-circle' : step.status === 'failed' ? 'times-circle' : 'minus-circle'} step-status ${step.status}\"></i>\n" +
      '            <span class="step-title">${this.escapeHtml(step.title)}</span>\n' +
      '            <span class="step-duration">${step.duration}ms</span>\n' +
      '            </div>';
    if (!content.includes(stepOpenNeedle)) {
      console.warn('⚠️  patch #8 step html needle not found, skipping');
    } else {
      content = content.replace(stepOpenNeedle, stepOpenReplacement);
      patched = true;
    }
  }

  // 10b. API Requests：断言失败行标红（HTTP 200 也可能耗时断言失败）
  if (!content.includes('patched: api-request assertion failed badge')) {
    const apiItemNeedle =
      '                <div class="api-request-item">\n' +
      '                    <div class="api-request-header" onclick="toggleApiRequestDetails(this)">\n' +
      '                        <span class="api-method method-${req.method.toLowerCase()}">${req.method}</span>\n' +
      '                        <span class="api-url" title="${this.escapeHtml(req.url)}">${this.escapeHtml(req.url)}</span>\n' +
      "                        ${req.responseStatus ? `<span class=\"api-status status-${req.responseStatus >= 200 && req.responseStatus < 300 ? 'success' : req.responseStatus >= 400 ? 'error' : 'warning'}\">${req.responseStatus}</span>` : ''}\n" +
      '                        ${req.duration ? `<span class="api-duration">${req.duration}ms</span>` : \'\'}\n' +
      '                        <i class="fas fa-chevron-down api-toggle"></i>\n' +
      '                    </div>';
    const apiItemReplacement =
      '                <div class="api-request-item${req.assertionFailed ? \' api-request-failed\' : \'\'}">\n' +
      '                    <div class="api-request-header" onclick="toggleApiRequestDetails(this)">\n' +
      '                        <span class="api-method method-${req.method.toLowerCase()}">${req.method}</span>\n' +
      '                        <span class="api-url" title="${this.escapeHtml(req.url)}">${this.escapeHtml(req.url)}</span>\n' +
      "                        ${req.responseStatus ? `<span class=\"api-status status-${req.responseStatus >= 200 && req.responseStatus < 300 ? 'success' : req.responseStatus >= 400 ? 'error' : 'warning'}\">${req.responseStatus}</span>` : ''}\n" +
      '                        ${req.assertionFailed ? \'<span class="api-assert-fail" title="业务/耗时断言失败（HTTP 状态仍可能为 200）">断言失败</span>\' : \'\'}\n' +
      '                        ${req.duration ? `<span class="api-duration${req.assertionFailed ? \' fail\' : \'\'}">${req.duration}ms</span>` : \'\'}\n' +
      '                        <i class="fas fa-chevron-down api-toggle"></i>\n' +
      '                    </div>';
    if (!content.includes(apiItemNeedle)) {
      // 兼容尚未打 #10 URL 补丁的截断版
      const apiItemNeedleTrunc =
        '                <div class="api-request-item">\n' +
        '                    <div class="api-request-header" onclick="toggleApiRequestDetails(this)">\n' +
        '                        <span class="api-method method-${req.method.toLowerCase()}">${req.method}</span>\n' +
        '                        <span class="api-url" title="${this.escapeHtml(req.url)}">${this.escapeHtml(req.url.length > 60 ? req.url.substring(0, 60) + \'...\' : req.url)}</span>\n' +
        "                        ${req.responseStatus ? `<span class=\"api-status status-${req.responseStatus >= 200 && req.responseStatus < 300 ? 'success' : req.responseStatus >= 400 ? 'error' : 'warning'}\">${req.responseStatus}</span>` : ''}\n" +
        '                        ${req.duration ? `<span class="api-duration">${req.duration}ms</span>` : \'\'}\n' +
        '                        <i class="fas fa-chevron-down api-toggle"></i>\n' +
        '                    </div>';
      if (content.includes(apiItemNeedleTrunc)) {
        content = content.replace(apiItemNeedleTrunc, apiItemReplacement);
        patched = true;
      } else {
        console.warn('⚠️  patch #10b api-request item needle not found, skipping');
      }
    } else {
      content = content.replace(apiItemNeedle, apiItemReplacement);
      patched = true;
    }

    const apiDetailsBodyNeedle =
      '                        ${req.responseBody ? `\n' +
      '                            <div class="api-section">\n' +
      '                                <h5><i class="fas fa-arrow-down"></i> Response Body</h5>\n' +
      '                                <pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.responseBody))}</pre>\n' +
      '                            </div>\n' +
      '                        ` : \'\'}\n' +
      '                    </div>';
    const apiDetailsBodyReplacement =
      '                        ${req.responseBody ? `\n' +
      '                            <div class="api-section">\n' +
      '                                <h5><i class="fas fa-arrow-down"></i> Response Body</h5>\n' +
      '                                <pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.responseBody))}</pre>\n' +
      '                            </div>\n' +
      '                        ` : \'\'}\n' +
      '                        ${req.assertions && req.assertions.length ? `\n' +
      '                            <div class="api-section">\n' +
      '                                <h5><i class="fas fa-check-double"></i> Assertions</h5>\n' +
      '                                <ul class="api-assertions${req.assertionFailed ? \' failed\' : \'\'}">${req.assertions.map(a => `<li>${this.escapeHtml(String(a))}</li>`).join(\'\')}</ul>\n' +
      '                            </div>\n' +
      '                        ` : \'\'}\n' +
      '                    </div>';
    if (!content.includes(apiDetailsBodyNeedle)) {
      console.warn('⚠️  patch #10b api assertions details needle not found, skipping');
    } else {
      content = content.replace(apiDetailsBodyNeedle, apiDetailsBodyReplacement);
      patched = true;
    }

    const apiItemCssNeedle =
      '        .api-request-item {\n' +
      '            background: var(--md-surface);\n' +
      '            border: 1px solid var(--md-outline);\n' +
      '            border-radius: 6px;\n' +
      '            margin-bottom: 8px;\n' +
      '            overflow: hidden;\n' +
      '        }';
    const apiItemCssReplacement =
      '        /* patched: api-request assertion failed badge */\n' +
      '        .api-request-item {\n' +
      '            background: var(--md-surface);\n' +
      '            border: 1px solid var(--md-outline);\n' +
      '            border-radius: 6px;\n' +
      '            margin-bottom: 8px;\n' +
      '            overflow: hidden;\n' +
      '        }\n' +
      '        .api-request-item.api-request-failed {\n' +
      '            border-color: var(--status-failed);\n' +
      '            background: var(--status-failed-bg);\n' +
      '        }\n' +
      '        .api-assert-fail {\n' +
      '            flex: 0 0 auto;\n' +
      '            font-size: 0.7rem;\n' +
      '            font-weight: 700;\n' +
      '            color: #fff;\n' +
      '            background: var(--status-failed);\n' +
      '            padding: 2px 8px;\n' +
      '            border-radius: 4px;\n' +
      '            white-space: nowrap;\n' +
      '        }\n' +
      '        .api-duration.fail {\n' +
      '            color: var(--status-failed);\n' +
      '            font-weight: 700;\n' +
      '        }\n' +
      '        .api-assertions {\n' +
      '            margin: 0;\n' +
      '            padding-left: 1.2rem;\n' +
      '            font-size: 0.8rem;\n' +
      '        }\n' +
      '        .api-assertions.failed li {\n' +
      '            color: var(--status-failed);\n' +
      '        }';
    if (!content.includes(apiItemCssNeedle)) {
      console.warn('⚠️  patch #10b api-request css needle not found, skipping');
    } else {
      content = content.replace(apiItemCssNeedle, apiItemCssReplacement);
      patched = true;
    }
  }

  // 11. 步骤/API 聚合：可收起展开；失败默认展开，通过默认收起
  if (!content.includes('patched: step/api collapse aggregate')) {
    const oldStepsFn =
      '    static generateStepsHierarchy(steps, level = 0) {\n' +
      '        return steps.map(step => `\n' +
      '        <div class="step-item" style="padding-left: ${level * 20}px">\n' +
      '            <div class="step-main">\n' +
      "            <i class=\"fas fa-${step.status === 'passed' ? 'check-circle' : step.status === 'failed' ? 'times-circle' : 'minus-circle'} step-status ${step.status}\"></i>\n" +
      '            <span class="step-title">${this.escapeHtml(step.title)}</span>\n' +
      '            <span class="step-duration">${step.duration}ms</span>\n' +
      '            </div>\n' +
      '            ${step.error ? `<div class="step-error"><code>${this.escapeHtml(step.error)}</code></div>` : \'\'}\n' +
      '            ${step.steps && step.steps.length > 0 ? this.generateStepsHierarchy(step.steps, level + 1) : \'\'}\n' +
      '        </div>\n' +
      '    `).join(\'\');\n' +
      '    }';
    const newStepsFn =
      '    // patched: step/api collapse aggregate\n' +
      '    static stepTreeHasFailure(step) {\n' +
      "        if (step.status === 'failed') return true;\n" +
      '        return !!(step.steps && step.steps.some(s => this.stepTreeHasFailure(s)));\n' +
      '    }\n' +
      '    static generateStepsHierarchy(steps, level = 0) {\n' +
      '        return steps.map(step => {\n' +
      '            const kids = step.steps && step.steps.length ? step.steps : null;\n' +
      '            const hasFail = this.stepTreeHasFailure(step);\n' +
      '            const failKids = kids ? kids.filter(s => this.stepTreeHasFailure(s)).length : 0;\n' +
      '            const passKids = kids ? kids.length - failKids : 0;\n' +
      '            const openKids = hasFail;\n' +
      '            return `\n' +
      '        <div class="step-item${hasFail ? \' has-fail\' : \'\'}" style="padding-left: ${level * 20}px">\n' +
      '            <div class="step-main${kids ? \' step-main-toggle\' : \'\'}"${kids ? \' onclick="toggleStepChildren(this)"\' : \'\'}>\n' +
      '            ${kids ? `<i class="fas fa-chevron-${openKids ? \'down\' : \'right\'} step-branch-toggle"></i>` : \'<i class="step-branch-spacer"></i>\'}\n' +
      "            <i class=\"fas fa-${step.status === 'passed' ? 'check-circle' : step.status === 'failed' ? 'times-circle' : 'minus-circle'} step-status ${step.status}\"></i>\n" +
      '            <span class="step-title">${this.escapeHtml(step.title)}</span>\n' +
      '            ${kids ? `<span class="step-agg">${kids.length} 项${failKids ? ` · <b class="fail">${failKids} 失败</b>` : \'\'}${passKids && failKids ? ` · ${passKids} 通过` : \'\'}</span>` : \'\'}\n' +
      '            <span class="step-duration">${step.duration}ms</span>\n' +
      '            </div>\n' +
      '            ${step.error && !(kids && kids.some(s => s.error || s.status === \'failed\')) ? `<div class="step-error"><code>${this.escapeHtml(this.sanitizeErrorMessage(step.error))}</code></div>` : \'\'}\n' +
      '            ${kids ? `<div class="step-children"${openKids ? \'\' : \' style="display: none;"\'}>${this.generateStepsHierarchy(kids, level + 1)}</div>` : \'\'}\n' +
      '        </div>`;\n' +
      '        }).join(\'\');\n' +
      '    }';
    if (!content.includes(oldStepsFn)) {
      console.warn('⚠️  patch #11 steps hierarchy needle not found, skipping');
    } else {
      content = content.replace(oldStepsFn, newStepsFn);
      patched = true;
    }

    // API：失败置顶展开；通过收进可展开分组
    const oldApiSectionStart =
      '    static generateApiRequestsSection(apiRequests) {\n' +
      '        return `\n' +
      '        <div class="api-requests-container">\n' +
      '            <h4><i class="fas fa-exchange-alt"></i> API Requests (${apiRequests.length})</h4>\n' +
      '            ${apiRequests.map((req, index) => `';
    if (
      content.includes(oldApiSectionStart) &&
      !content.includes('patched: api requests aggregate groups')
    ) {
      const apiSectionRe =
        /    static generateApiRequestsSection\(apiRequests\) \{\n        return `\n        <div class="api-requests-container">\n            <h4><i class="fas fa-exchange-alt"><\/i> API Requests \(\$\{apiRequests\.length\}\)<\/h4>\n            \$\{apiRequests\.map\(\(req, index\) => `[\s\S]*?`\)\.join\(''\)\}\n        <\/div>`;\n    }/;
      const newApiSection =
        '    static generateApiRequestsSection(apiRequests) {\n' +
        '        // patched: api requests aggregate groups\n' +
        '        const failed = apiRequests.filter(r => r.assertionFailed);\n' +
        '        const passed = apiRequests.filter(r => !r.assertionFailed);\n' +
        '        const renderReq = (req) => `\n' +
        '                <div class="api-request-item${req.assertionFailed ? \' api-request-failed\' : \'\'}">\n' +
        '                    <div class="api-request-header" onclick="toggleApiRequestDetails(this)">\n' +
        '                        <span class="api-method method-${req.method.toLowerCase()}">${req.method}</span>\n' +
        '                        <span class="api-url" title="${this.escapeHtml(req.url)}">${this.escapeHtml(req.url)}</span>\n' +
        '                        ${req.responseStatus ? `<span class="api-status status-${req.responseStatus >= 200 && req.responseStatus < 300 ? \'success\' : req.responseStatus >= 400 ? \'error\' : \'warning\'}">${req.responseStatus}</span>` : \'\'}\n' +
        '                        ${req.assertionFailed ? \'<span class="api-assert-fail" title="业务/耗时断言失败（HTTP 状态仍可能为 200）">断言失败</span>\' : \'\'}\n' +
        '                        ${req.duration ? `<span class="api-duration${req.assertionFailed ? \' fail\' : \'\'}">${req.duration}ms</span>` : \'\'}\n' +
        '                        <i class="fas fa-chevron-down api-toggle"></i>\n' +
        '                    </div>\n' +
        '                    <div class="api-request-details" style="display: none;">\n' +
        '                        ${req.requestHeaders ? `<div class="api-section"><h5><i class="fas fa-arrow-up"></i> Request Headers</h5><pre class="api-payload">${this.escapeHtml(JSON.stringify(req.requestHeaders, null, 2))}</pre></div>` : \'\'}\n' +
        '                        ${req.requestBody ? `<div class="api-section"><h5><i class="fas fa-arrow-up"></i> Request Body</h5><pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.requestBody))}</pre></div>` : \'\'}\n' +
        '                        ${req.responseHeaders ? `<div class="api-section"><h5><i class="fas fa-arrow-down"></i> Response Headers</h5><pre class="api-payload">${this.escapeHtml(JSON.stringify(req.responseHeaders, null, 2))}</pre></div>` : \'\'}\n' +
        '                        ${req.responseBody ? `<div class="api-section"><h5><i class="fas fa-arrow-down"></i> Response Body</h5><pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.responseBody))}</pre></div>` : \'\'}\n' +
        '                        ${req.assertions && req.assertions.length ? `<div class="api-section"><h5><i class="fas fa-check-double"></i> Assertions</h5><ul class="api-assertions${req.assertionFailed ? \' failed\' : \'\'}">${req.assertions.map(a => `<li>${this.escapeHtml(String(a))}</li>`).join(\'\')}</ul></div>` : \'\'}\n' +
        '                    </div>\n' +
        '                </div>`;\n' +
        '        return `\n' +
        '        <div class="api-requests-container">\n' +
        '            <h4><i class="fas fa-exchange-alt"></i> API Requests (${apiRequests.length})\n' +
        '                ${failed.length ? `<span class="api-sum-fail">${failed.length} 失败</span>` : \'\'}\n' +
        '                ${passed.length ? `<span class="api-sum-pass">${passed.length} 通过</span>` : \'\'}\n' +
        '            </h4>\n' +
        '            ${failed.length ? `<div class="api-failed-group">${failed.map(renderReq).join(\'\')}</div>` : \'\'}\n' +
        '            ${passed.length ? `\n' +
        '            <div class="api-passed-group">\n' +
        '                <div class="api-passed-header" onclick="toggleApiPassedGroup(this)">\n' +
        '                    <i class="fas fa-chevron-right"></i>\n' +
        '                    <span>通过的请求（${passed.length}）— 点击展开</span>\n' +
        '                </div>\n' +
        '                <div class="api-passed-body" style="display: none;">${passed.map(renderReq).join(\'\')}</div>\n' +
        '            </div>` : \'\'}\n' +
        '        </div>`;\n' +
        '    }';
      if (!apiSectionRe.test(content)) {
        console.warn('⚠️  patch #11 api section regex not found, skipping');
      } else {
        content = content.replace(apiSectionRe, newApiSection);
        patched = true;
      }
    }

    const stepCssNeedle =
      '        /* patched: step-item stack error/children */\n';
    if (content.includes(stepCssNeedle) && !content.includes('patched: step collapse css')) {
      const stepCollapseCss =
        '        /* patched: step collapse css */\n' +
        '        .step-main-toggle { cursor: pointer; }\n' +
        '        .step-main-toggle:hover { background: rgba(0,0,0,0.03); border-radius: 4px; }\n' +
        '        .step-branch-toggle { width: 14px; color: rgba(0,0,0,0.45); font-size: 0.75rem; margin-top: 3px; }\n' +
        '        .step-branch-spacer { display: inline-block; width: 14px; }\n' +
        '        .step-agg { font-size: 0.75rem; color: rgba(0,0,0,0.55); white-space: nowrap; }\n' +
        '        .step-agg .fail { color: var(--status-failed); font-weight: 700; }\n' +
        '        .step-children { margin-top: 2px; }\n' +
        '        .step-item.has-fail > .step-main .step-title { font-weight: 600; }\n' +
        '        .api-sum-fail, .api-sum-pass {\n' +
        '            display: inline-block; margin-left: 8px; font-size: 0.75rem;\n' +
        '            padding: 2px 8px; border-radius: 999px; font-weight: 600;\n' +
        '        }\n' +
        '        .api-sum-fail { background: var(--status-failed-bg); color: var(--status-failed); }\n' +
        '        .api-sum-pass { background: var(--status-passed-bg); color: var(--status-passed); }\n' +
        '        .api-passed-group { margin-top: 8px; border: 1px dashed var(--md-outline); border-radius: 6px; }\n' +
        '        .api-passed-header {\n' +
        '            display: flex; align-items: center; gap: 8px; padding: 10px 12px;\n' +
        '            cursor: pointer; font-size: 0.85rem; color: rgba(0,0,0,0.65);\n' +
        '        }\n' +
        '        .api-passed-header:hover { background: var(--md-surface-variant); }\n' +
        '        .api-passed-body { padding: 0 8px 8px; }\n' +
        '        .api-failed-group { margin-bottom: 8px; }\n';
      content = content.replace(stepCssNeedle, stepCollapseCss + stepCssNeedle);
      patched = true;
    }

    const toggleApiNeedle =
      '        // API Request Details Toggle Function\n' +
      '        function toggleApiRequestDetails(headerElement) {';
    const toggleApiExtra =
      '        // patched: step/api collapse helpers\n' +
      '        function toggleStepChildren(mainEl) {\n' +
      "            const item = mainEl.closest('.step-item');\n" +
      "            const kids = item && item.querySelector(':scope > .step-children');\n" +
      "            const icon = mainEl.querySelector('.step-branch-toggle');\n" +
      '            if (!kids) return;\n' +
      "            const open = kids.style.display !== 'none';\n" +
      "            kids.style.display = open ? 'none' : 'block';\n" +
      '            if (icon) {\n' +
      "                icon.className = open ? 'fas fa-chevron-right step-branch-toggle' : 'fas fa-chevron-down step-branch-toggle';\n" +
      '            }\n' +
      '        }\n' +
      '        function toggleApiPassedGroup(headerEl) {\n' +
      "            const group = headerEl.closest('.api-passed-group');\n" +
      "            const body = group && group.querySelector('.api-passed-body');\n" +
      "            const icon = headerEl.querySelector('i');\n" +
      '            if (!body) return;\n' +
      "            const open = body.style.display !== 'none';\n" +
      "            body.style.display = open ? 'none' : 'block';\n" +
      '            if (icon) {\n' +
      "                icon.className = open ? 'fas fa-chevron-right' : 'fas fa-chevron-down';\n" +
      '            }\n' +
      '        }\n' +
      '\n' +
      '        // API Request Details Toggle Function\n' +
      '        function toggleApiRequestDetails(headerElement) {';
    if (!content.includes('function toggleStepChildren(')) {
      if (!content.includes(toggleApiNeedle)) {
        console.warn('⚠️  patch #11 toggle js needle not found, skipping');
      } else {
        content = content.replace(toggleApiNeedle, toggleApiExtra);
        patched = true;
      }
    }
  }

  // 11b. 父 test.step 与子 expect 会各带一份 error——有失败子节点时父级不再渲染 error
  if (
    content.includes('generateStepsHierarchy') &&
    !content.includes("kids.some(s => s.error || s.status === 'failed')")
  ) {
    const dupErrorNeedle =
      '            ${step.error ? `<div class="step-error"><code>${this.escapeHtml(step.error)}</code></div>` : \'\'}\n' +
      '            ${kids ? `<div class="step-children"';
    const dupErrorReplacement =
      '            ${step.error && !(kids && kids.some(s => s.error || s.status === \'failed\')) ? `<div class="step-error"><code>${this.escapeHtml(this.sanitizeErrorMessage(step.error))}</code></div>` : \'\'}\n' +
      '            ${kids ? `<div class="step-children"';
    if (!content.includes(dupErrorNeedle)) {
      console.warn('⚠️  patch #11b dedupe step error needle not found, skipping');
    } else {
      content = content.replace(dupErrorNeedle, dupErrorReplacement);
      patched = true;
    }
  }

  // 12. 步骤断言整体展开/收起；API section（headers/body）各自折叠
  if (!content.includes('function toggleAllStepAsserts(')) {
    const stepsWrapNeedle =
      '                <div class="test-steps" style="display: none;">\n' +
      '                    ${this.generateStepsHierarchy(test.steps)}\n' +
      '                </div>';
    const stepsWrapReplacement =
      '                <div class="test-steps" style="display: none;">\n' +
      '                    <div class="steps-toolbar">\n' +
      '                        <button type="button" class="steps-assert-toggle" data-tree-collapsed="0" onclick="event.stopPropagation(); toggleAllStepAsserts(this)">\n' +
      '                            <i class="fas fa-chevron-down"></i> 收起详细断言\n' +
      '                        </button>\n' +
      '                        <span class="steps-toolbar-hint">展开/收起下方步骤目录树（不展开内部节点）</span>\n' +
      '                    </div>\n' +
      '                    <div class="steps-tree">\n' +
      '                    ${this.generateStepsHierarchy(test.steps)}\n' +
      '                    </div>\n' +
      '                </div>';
    if (content.includes(stepsWrapNeedle)) {
      content = content.replace(stepsWrapNeedle, stepsWrapReplacement);
      patched = true;
    } else {
      console.warn('⚠️  patch #12 steps toolbar needle not found, skipping');
    }

    const stepItemOpenNeedle =
      '            return `\n' +
      '        <div class="step-item${hasFail ? \' has-fail\' : \'\'}" style="padding-left: ${level * 20}px">\n';
    const stepItemOpenReplacement =
      '            const isAssertLeaf = !kids;\n' +
      '            return `\n' +
      '        <div class="step-item${hasFail ? \' has-fail\' : \'\'}${isAssertLeaf ? \' step-assert-leaf\' : \'\'}" style="padding-left: ${level * 20}px">\n';
    if (content.includes(stepItemOpenNeedle) && !content.includes('step-assert-leaf')) {
      content = content.replace(stepItemOpenNeedle, stepItemOpenReplacement);
      patched = true;
    }

    const apiDetailsFlatNeedle =
      '                        ${req.requestHeaders ? `<div class="api-section"><h5><i class="fas fa-arrow-up"></i> Request Headers</h5><pre class="api-payload">${this.escapeHtml(JSON.stringify(req.requestHeaders, null, 2))}</pre></div>` : \'\'}\n' +
      '                        ${req.requestBody ? `<div class="api-section"><h5><i class="fas fa-arrow-up"></i> Request Body</h5><pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.requestBody))}</pre></div>` : \'\'}\n' +
      '                        ${req.responseHeaders ? `<div class="api-section"><h5><i class="fas fa-arrow-down"></i> Response Headers</h5><pre class="api-payload">${this.escapeHtml(JSON.stringify(req.responseHeaders, null, 2))}</pre></div>` : \'\'}\n' +
      '                        ${req.responseBody ? `<div class="api-section"><h5><i class="fas fa-arrow-down"></i> Response Body</h5><pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.responseBody))}</pre></div>` : \'\'}\n' +
      '                        ${req.assertions && req.assertions.length ? `<div class="api-section"><h5><i class="fas fa-check-double"></i> Assertions</h5><ul class="api-assertions${req.assertionFailed ? \' failed\' : \'\'}">${req.assertions.map(a => `<li>${this.escapeHtml(String(a))}</li>`).join(\'\')}</ul></div>` : \'\'}';
    const apiDetailsFoldReplacement =
      '                        ${req.requestHeaders ? `<div class="api-section"><h5 class="api-section-toggle" onclick="toggleApiSection(this)"><i class="fas fa-chevron-right"></i><i class="fas fa-arrow-up"></i> Request Headers</h5><div class="api-section-body" style="display: none;"><pre class="api-payload">${this.escapeHtml(JSON.stringify(req.requestHeaders, null, 2))}</pre></div></div>` : \'\'}\n' +
      '                        ${req.requestBody ? `<div class="api-section"><h5 class="api-section-toggle" onclick="toggleApiSection(this)"><i class="fas fa-chevron-right"></i><i class="fas fa-arrow-up"></i> Request Body</h5><div class="api-section-body" style="display: none;"><pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.requestBody))}</pre></div></div>` : \'\'}\n' +
      '                        ${req.responseHeaders ? `<div class="api-section"><h5 class="api-section-toggle" onclick="toggleApiSection(this)"><i class="fas fa-chevron-right"></i><i class="fas fa-arrow-down"></i> Response Headers</h5><div class="api-section-body" style="display: none;"><pre class="api-payload">${this.escapeHtml(JSON.stringify(req.responseHeaders, null, 2))}</pre></div></div>` : \'\'}\n' +
      '                        ${req.responseBody ? `<div class="api-section"><h5 class="api-section-toggle" onclick="toggleApiSection(this)"><i class="fas fa-chevron-${req.assertionFailed ? \'down\' : \'right\'}"></i><i class="fas fa-arrow-down"></i> Response Body</h5><div class="api-section-body"${req.assertionFailed ? \'\' : \' style="display: none;"\'}><pre class="api-payload">${this.escapeHtml(this.formatJsonSafe(req.responseBody))}</pre></div></div>` : \'\'}\n' +
      '                        ${req.assertions && req.assertions.length ? `<div class="api-section"><h5 class="api-section-toggle" onclick="toggleApiSection(this)"><i class="fas fa-chevron-${req.assertionFailed ? \'down\' : \'right\'}"></i><i class="fas fa-check-double"></i> Assertions</h5><div class="api-section-body"${req.assertionFailed ? \'\' : \' style="display: none;"\'}><ul class="api-assertions${req.assertionFailed ? \' failed\' : \'\'}">${req.assertions.map(a => `<li>${this.escapeHtml(String(a))}</li>`).join(\'\')}</ul></div></div>` : \'\'}';
    if (content.includes(apiDetailsFlatNeedle)) {
      content = content.replace(apiDetailsFlatNeedle, apiDetailsFoldReplacement);
      patched = true;
    } else if (!content.includes('toggleApiSection(this)')) {
      console.warn('⚠️  patch #12 api-section fold needle not found, skipping');
    }

    if (!content.includes('function toggleAllStepAsserts(')) {
      const afterPassedGroup =
        '        function toggleApiPassedGroup(headerEl) {\n' +
        "            const group = headerEl.closest('.api-passed-group');\n" +
        "            const body = group && group.querySelector('.api-passed-body');\n" +
        "            const icon = headerEl.querySelector('i');\n" +
        '            if (!body) return;\n' +
        "            const open = body.style.display !== 'none';\n" +
        "            body.style.display = open ? 'none' : 'block';\n" +
        '            if (icon) {\n' +
        "                icon.className = open ? 'fas fa-chevron-right' : 'fas fa-chevron-down';\n" +
        '            }\n' +
        '        }';
      const withAssertToggles =
        afterPassedGroup +
        '\n' +
        '        // patched: whole steps-tree module toggle + api-section toggles\n' +
        '        function toggleAllStepAsserts(btn) {\n' +
        "            const steps = btn.closest('.test-steps');\n" +
        '            if (!steps) return;\n' +
        "            const tree = steps.querySelector('.steps-tree');\n" +
        '            if (!tree) return;\n' +
        "            const collapsed = btn.getAttribute('data-tree-collapsed') === '1';\n" +
        '            const nextCollapsed = !collapsed;\n' +
        "            btn.setAttribute('data-tree-collapsed', nextCollapsed ? '1' : '0');\n" +
        '            btn.innerHTML = nextCollapsed\n' +
        "                ? '<i class=\"fas fa-chevron-right\"></i> 展开查看详细断言'\n" +
        "                : '<i class=\"fas fa-chevron-down\"></i> 收起详细断言';\n" +
        "            tree.style.display = nextCollapsed ? 'none' : 'block';\n" +
        '        }\n' +
        '        function toggleApiSection(headerEl) {\n' +
        "            const section = headerEl.closest('.api-section');\n" +
        "            const body = section && section.querySelector('.api-section-body');\n" +
        "            const icon = headerEl.querySelector('.fa-chevron-right, .fa-chevron-down');\n" +
        '            if (!body) return;\n' +
        "            const open = body.style.display !== 'none';\n" +
        "            body.style.display = open ? 'none' : 'block';\n" +
        '            if (icon) {\n' +
        "                icon.className = open ? 'fas fa-chevron-right' : 'fas fa-chevron-down';\n" +
        '            }\n' +
        '        }';
      if (content.includes(afterPassedGroup)) {
        content = content.replace(afterPassedGroup, withAssertToggles);
        patched = true;
      } else {
        console.warn('⚠️  patch #12 toggle js needle not found, skipping');
      }
    }

    if (!content.includes('patched: assert toolbar + api-section toggle')) {
      const cssAnchor = '        .api-failed-group { margin-bottom: 8px; }\n';
      const cssExtra =
        '        .api-failed-group { margin-bottom: 8px; }\n' +
        '        /* patched: assert toolbar + api-section toggle */\n' +
        '        .steps-toolbar {\n' +
        '            display: flex; align-items: center; gap: 12px; flex-wrap: wrap;\n' +
        '            margin: 0 0 10px 28px; padding: 8px 10px;\n' +
        '            background: var(--md-surface); border: 1px solid var(--md-outline-variant);\n' +
        '            border-radius: 6px;\n' +
        '        }\n' +
        '        .steps-assert-toggle {\n' +
        '            border: 1px solid var(--md-outline); background: var(--md-surface-variant);\n' +
        '            border-radius: 4px; padding: 4px 10px; font-size: 0.8rem; cursor: pointer;\n' +
        '            display: inline-flex; align-items: center; gap: 6px;\n' +
        '        }\n' +
        '        .steps-assert-toggle:hover { background: var(--md-outline-variant); }\n' +
        '        .steps-toolbar-hint { font-size: 0.75rem; color: rgba(0,0,0,0.5); }\n' +
        '        body.darkmode .steps-toolbar-hint { color: rgba(255,255,255,0.5); }\n' +
        '        .api-section-toggle {\n' +
        '            cursor: pointer; display: flex; align-items: center; gap: 8px;\n' +
        '            margin: 0; user-select: none;\n' +
        '        }\n' +
        '        .api-section-toggle:hover { opacity: 0.85; }\n' +
        '        .api-section-body { margin-top: 8px; }\n';
      if (content.includes(cssAnchor)) {
        content = content.replace(cssAnchor, cssExtra);
        patched = true;
      }
    }
  }

  // 14. 修复：通过断言叶子不再 display:none（否则父节点展开后内部空白）
  if (content.includes('step-assert-pass') && content.includes('hidePassAssert')) {
    const hidePassNeedle =
      '            const isAssertLeaf = !kids;\n' +
      '            const hidePassAssert = isAssertLeaf && step.status === \'passed\';\n' +
      '            return `\n' +
      '        <div class="step-item${hasFail ? \' has-fail\' : \'\'}${isAssertLeaf ? \' step-assert-leaf\' : \'\'}${hidePassAssert ? \' step-assert-pass\' : \'\'}" style="padding-left: ${level * 20}px${hidePassAssert ? \'; display: none\' : \'\'}">\n';
    const hidePassReplacement =
      '            const isAssertLeaf = !kids;\n' +
      '            return `\n' +
      '        <div class="step-item${hasFail ? \' has-fail\' : \'\'}${isAssertLeaf ? \' step-assert-leaf\' : \'\'}" style="padding-left: ${level * 20}px">\n';
    if (content.includes(hidePassNeedle)) {
      content = content.replace(hidePassNeedle, hidePassReplacement);
      patched = true;
    } else {
      console.warn('⚠️  patch #14 hidePassAssert needle not found, skipping');
    }
  }

  // 13. 升级：整体收起/展开 .steps-tree（只显隐模块，不展开内部节点）
  if (
    content.includes('function toggleAllStepAsserts(') &&
    !content.includes('展开查看详细断言')
  ) {
    const toggleFnRe =
      /        \/\/ patched: (?:assert leaf \+ (?:api-section|step tree \+ api-section) toggles|whole steps-tree module toggle \+ api-section toggles)\n        function toggleAllStepAsserts\(btn\) \{[\s\S]*?\n        \}/;
    const newToggleFn =
      '        // patched: whole steps-tree module toggle + api-section toggles\n' +
      '        function toggleAllStepAsserts(btn) {\n' +
      "            const steps = btn.closest('.test-steps');\n" +
      '            if (!steps) return;\n' +
      "            const tree = steps.querySelector('.steps-tree');\n" +
      '            if (!tree) return;\n' +
      "            const collapsed = btn.getAttribute('data-tree-collapsed') === '1';\n" +
      '            const nextCollapsed = !collapsed;\n' +
      "            btn.setAttribute('data-tree-collapsed', nextCollapsed ? '1' : '0');\n" +
      '            btn.innerHTML = nextCollapsed\n' +
      "                ? '<i class=\"fas fa-chevron-right\"></i> 展开查看详细断言'\n" +
      "                : '<i class=\"fas fa-chevron-down\"></i> 收起详细断言';\n" +
      "            tree.style.display = nextCollapsed ? 'none' : 'block';\n" +
      '        }';
    if (toggleFnRe.test(content)) {
      content = content.replace(toggleFnRe, newToggleFn);
      patched = true;
    } else {
      console.warn('⚠️  patch #13 toggle upgrade needle not found, skipping');
    }

    if (!content.includes('class="steps-tree"')) {
      const hierarchyNeedle =
        '                    </div>\n' +
        '                    ${this.generateStepsHierarchy(test.steps)}\n' +
        '                </div>';
      const hierarchyReplacement =
        '                    </div>\n' +
        '                    <div class="steps-tree">\n' +
        '                    ${this.generateStepsHierarchy(test.steps)}\n' +
        '                    </div>\n' +
        '                </div>';
      if (content.includes(hierarchyNeedle)) {
        content = content.replace(hierarchyNeedle, hierarchyReplacement);
        patched = true;
      } else {
        console.warn('⚠️  patch #13 steps-tree wrap needle not found, skipping');
      }
    }

    content = content
      .replace(/data-asserts-collapsed="1"/g, 'data-tree-collapsed="0"')
      .replace(/data-tree-collapsed="1"/g, 'data-tree-collapsed="0"')
      .replace(
        /onclick="(?:event\.stopPropagation\(\); )?toggleAllStepAsserts\(this\)"/g,
        'onclick="event.stopPropagation(); toggleAllStepAsserts(this)"',
      )
      .replace(
        /<i class="fas fa-chevron-(?:right|down)"><\/i> (?:展开全部|收起全部|展开查看详细断言|收起详细断言)/,
        '<i class="fas fa-chevron-down"></i> 收起详细断言',
      )
      .replace(
        /(?:整体展开\/收起下方步骤目录树|控制下方全部步骤分支与断言叶子|默认收起通过(?:的断言叶子；失败断言始终显示|分支与断言；失败分支始终展开))/g,
        '展开/收起下方步骤目录树（不展开内部节点）',
      );
  }

  // 10. API Requests URL：去掉 60 字截断，完整展示 + wrap；title 保留作 hover
  if (!content.includes('patched: api-url show full')) {
    const apiUrlHtmlNeedle =
      '<span class="api-url" title="${this.escapeHtml(req.url)}">${this.escapeHtml(req.url.length > 60 ? req.url.substring(0, 60) + \'...\' : req.url)}</span>';
    const apiUrlHtmlReplacement =
      '<span class="api-url" title="${this.escapeHtml(req.url)}">${this.escapeHtml(req.url)}</span>';
    if (!content.includes(apiUrlHtmlNeedle)) {
      console.warn('⚠️  patch #10 api-url html needle not found, skipping');
    } else {
      content = content.replace(apiUrlHtmlNeedle, apiUrlHtmlReplacement);
      patched = true;
    }

    const apiUrlCssNeedle =
      '        .api-url {\n' +
      '            flex: 1;\n' +
      '            font-family: var(--font-mono);\n' +
      '            font-size: 0.8rem;\n' +
      '            color: rgba(0, 0, 0, 0.7);\n' +
      '            overflow: hidden;\n' +
      '            text-overflow: ellipsis;\n' +
      '            white-space: nowrap;\n' +
      '        }';
    const apiUrlCssReplacement =
      '        /* patched: api-url show full */\n' +
      '        .api-url {\n' +
      '            flex: 1;\n' +
      '            min-width: 0;\n' +
      '            font-family: var(--font-mono);\n' +
      '            font-size: 0.8rem;\n' +
      '            color: rgba(0, 0, 0, 0.7);\n' +
      '            white-space: normal;\n' +
      '            overflow-wrap: anywhere;\n' +
      '            word-break: break-all;\n' +
      '        }';
    if (!content.includes(apiUrlCssNeedle)) {
      console.warn('⚠️  patch #10 api-url css needle not found, skipping');
    } else {
      content = content.replace(apiUrlCssNeedle, apiUrlCssReplacement);
      patched = true;
    }
  }

  // 15. Gate Test Details panel + nav (default off; API logs live in Test Suites)
  if (!content.includes('dashboardWidgets.details')) {
    const detailsWidgetNeedleRe =
      /metrics: dashboardWidgets\.metrics == null \? true : dashboardWidgets\.metrics,\n        \};/;
    const detailsWidgetReplacement =
      'metrics: dashboardWidgets.metrics == null ? true : dashboardWidgets.metrics,\n' +
      '            details: dashboardWidgets.details == null ? false : dashboardWidgets.details,\n' +
      '        };';
    if (!detailsWidgetNeedleRe.test(content)) {
      console.warn('⚠️  patch #15 details widget needle not found, skipping');
    } else {
      content = content.replace(detailsWidgetNeedleRe, detailsWidgetReplacement);
      patched = true;
    }
  }

  if (!content.includes('w.details ? this.generateDetailsSection')) {
    const detailsSectionNeedle = '${this.generateDetailsSection(testResults)}';
    const detailsSectionReplacement = "${w.details ? this.generateDetailsSection(testResults) : ''}";
    if (!content.includes(detailsSectionNeedle)) {
      console.warn('⚠️  patch #15 details section needle not found, skipping');
    } else {
      content = content.replace(detailsSectionNeedle, detailsSectionReplacement);
      patched = true;
    }
  }

  if (!content.includes('w.details ? \'<li><a href="#details"')) {
    const detailsNavNeedle = '<li><a href="#details" class="nav-link">Details</a></li>';
    const detailsNavReplacement =
      "${w.details ? '<li><a href=\"#details\" class=\"nav-link\">Details</a></li>' : ''}";
    if (!content.includes(detailsNavNeedle)) {
      console.warn('⚠️  patch #15 details nav needle not found, skipping');
    } else {
      content = content.replace(detailsNavNeedle, detailsNavReplacement);
      patched = true;
    }
  }

  // 16. Details 隐藏时仍初始化 global-filters（否则 #details-table 缺失会 early-return）
  if (!content.includes('patched: filters without Test Details table')) {
    const initFiltersNeedle =
      '        function initializeFilters() {\n' +
      '            const table = document.querySelector(\'#details-table tbody\');\n' +
      '            if (!table) return;\n' +
      '            \n' +
      '            const rows = Array.from(table.querySelectorAll(\'tr\'));';
    const initFiltersReplacement =
      '        function initializeFilters() {\n' +
      '            const table = document.querySelector(\'#details-table tbody\');\n' +
      '            const hasDetailsTable = !!table;\n' +
      '            \n' +
      '            if (!hasDetailsTable) {\n' +
      '                // patched: filters without Test Details table\n' +
      '                function filterSuitesPanel(searchValue, statusValue) {\n' +
      '                    const suiteCards = document.querySelectorAll(\'#suites .suite-card\');\n' +
      '                    suiteCards.forEach(card => {\n' +
      '                        const items = card.querySelectorAll(\'.suite-test-item\');\n' +
      '                        let visibleCount = 0;\n' +
      '                        items.forEach(item => {\n' +
      '                            const statusClass = Array.from(item.classList).find(c => c.indexOf(\'status-\') === 0) || \'\';\n' +
      '                            const status = statusClass.replace(\'status-\', \'\');\n' +
      '                            const nameEl = item.querySelector(\'.test-name\');\n' +
      '                            const name = (nameEl && nameEl.textContent ? nameEl.textContent : \'\').toLowerCase();\n' +
      '                            const matchesStatus = !statusValue || status.indexOf(statusValue) !== -1;\n' +
      '                            const matchesSearch = !searchValue || name.indexOf(searchValue) !== -1;\n' +
      '                            const show = matchesStatus && matchesSearch;\n' +
      '                            item.style.display = show ? \'\' : \'none\';\n' +
      '                            if (show) visibleCount++;\n' +
      '                        });\n' +
      '                        const filtering = !!(statusValue || searchValue);\n' +
      '                        card.style.display = !filtering || visibleCount > 0 ? \'\' : \'none\';\n' +
      '                        if (filtering && visibleCount > 0) {\n' +
      '                            const tests = card.querySelector(\'.suite-tests\');\n' +
      '                            if (tests) tests.style.display = \'block\';\n' +
      '                            const header = card.querySelector(\'.suite-header\');\n' +
      '                            if (header) header.classList.add(\'expanded\');\n' +
      '                        }\n' +
      '                    });\n' +
      '                }\n' +
      '                function applyFiltersSuitesOnly() {\n' +
      '                    const searchValue = document.getElementById(\'search-input\').value.toLowerCase();\n' +
      '                    const statusValue = document.getElementById(\'status-filter\').value.toLowerCase();\n' +
      '                    filterSuitesPanel(searchValue, statusValue);\n' +
      '                }\n' +
      '                const searchInput = document.getElementById(\'search-input\');\n' +
      '                const statusFilter = document.getElementById(\'status-filter\');\n' +
      '                const clearBtn = document.getElementById(\'clear-filters\');\n' +
      '                if (searchInput) searchInput.addEventListener(\'input\', applyFiltersSuitesOnly);\n' +
      '                if (statusFilter) {\n' +
      '                    statusFilter.addEventListener(\'change\', function() {\n' +
      '                        if (typeof syncStatusFilterActiveState === \'function\') syncStatusFilterActiveState();\n' +
      '                        applyFiltersSuitesOnly();\n' +
      '                    });\n' +
      '                }\n' +
      '                if (clearBtn) {\n' +
      '                    clearBtn.addEventListener(\'click\', function() {\n' +
      '                        if (searchInput) searchInput.value = \'\';\n' +
      '                        if (statusFilter) statusFilter.value = \'\';\n' +
      '                        document.querySelectorAll(\'[data-status-filter]\').forEach(el => el.classList.remove(\'active\'));\n' +
      '                        applyFiltersSuitesOnly();\n' +
      '                    });\n' +
      '                }\n' +
      '                return;\n' +
      '            }\n' +
      '            \n' +
      '            const rows = Array.from(table.querySelectorAll(\'tr\'));';
    if (!content.includes(initFiltersNeedle)) {
      console.warn('⚠️  patch #16 initFilters needle not found, skipping');
    } else {
      content = content.replace(initFiltersNeedle, initFiltersReplacement);
      patched = true;
    }
  }

  // 17. Suites 失败用例内联截图（details 表默认关闭，附件图标看不见）
  if (!content.includes('generateSuiteFailureMediaHTML')) {
    const suiteItemNeedle = '    static generateSuiteTestItem(test) {';
    const suiteItemReplacement =
      '    static generateSuiteFailureMediaHTML(test) {\n' +
      '        // patched: inline failure screenshots in Test Suites\n' +
      '        const attachments = (test && test.attachments) || [];\n' +
      '        const images = attachments.filter(function (item) {\n' +
      "            return item && item.path && String(item.contentType || '').indexOf('image/') === 0;\n" +
      '        });\n' +
      "        if (!images.length) return '';\n" +
      '        const figures = images.map(function (item) {\n' +
      "            const src = String(item.path).replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;');\n" +
      "            const alt = String(item.name || 'screenshot').replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;');\n" +
      "            return '<figure class=\"test-failure-shot\"><img src=\"' + src + '\" alt=\"' + alt + '\" loading=\"lazy\"/><figcaption>' + alt + '</figcaption></figure>';\n" +
      "        }).join('');\n" +
      "        return '<div class=\"test-failure-shots\">' + figures + '</div>';\n" +
      '    }\n' +
      '    static generateSuiteTestItem(test) {';
    if (!content.includes(suiteItemNeedle)) {
      console.warn('⚠️  patch #17 generateSuiteTestItem needle not found, skipping');
    } else {
      content = content.replace(suiteItemNeedle, suiteItemReplacement);
      patched = true;
    }

    const suiteErrorNeedle =
      '            ${test.error ? `<div class="test-error"><code>${this.escapeHtml(this.sanitizeErrorMessage(test.error))}</code></div>${this.generateDiffView(test.error)}` : \'\'}\n' +
      '            ${test.tags && test.tags.length > 0 ? `<div class="test-tags">${test.tags.map(t => `<span class="tag-badge">${this.escapeHtml(t)}</span>`).join(\'\')}</div>` : \'\'}';
    const suiteErrorReplacement =
      '            ${test.error ? `<div class="test-error"><code>${this.escapeHtml(this.sanitizeErrorMessage(test.error))}</code></div>${this.generateDiffView(test.error)}` : \'\'}\n' +
      '            ${this.generateSuiteFailureMediaHTML(test)}\n' +
      '            ${test.tags && test.tags.length > 0 ? `<div class="test-tags">${test.tags.map(t => `<span class="tag-badge">${this.escapeHtml(t)}</span>`).join(\'\')}</div>` : \'\'}';
    if (!content.includes(suiteErrorNeedle)) {
      console.warn('⚠️  patch #17 suite error needle not found, skipping');
    } else {
      content = content.replace(suiteErrorNeedle, suiteErrorReplacement);
      patched = true;
    }
  }

  if (!content.includes('patched: failure screenshot css')) {
    const failureShotCss =
      '        /* patched: failure screenshot css */\n' +
      '        .test-failure-shots {\n' +
      '            display: flex;\n' +
      '            flex-wrap: wrap;\n' +
      '            gap: 12px;\n' +
      '            margin: 8px 16px 12px;\n' +
      '        }\n' +
      '        .test-failure-shot {\n' +
      '            margin: 0;\n' +
      '            max-width: 360px;\n' +
      '        }\n' +
      '        .test-failure-shot img {\n' +
      '            display: block;\n' +
      '            width: 100%;\n' +
      '            max-height: 480px;\n' +
      '            object-fit: contain;\n' +
      '            border: 1px solid var(--md-outline);\n' +
      '            border-radius: 8px;\n' +
      '            background: #fff;\n' +
      '        }\n' +
      '        .test-failure-shot figcaption {\n' +
      '            margin-top: 4px;\n' +
      '            font-size: 0.75rem;\n' +
      '            color: rgba(0,0,0,0.55);\n' +
      '        }\n';
    const cssAnchor = '        .step-error, .test-error {\n';
    if (!content.includes(cssAnchor)) {
      console.warn('⚠️  patch #17 failure screenshot css needle not found, skipping');
    } else {
      content = content.replace(cssAnchor, failureShotCss + cssAnchor);
      patched = true;
    }
  }

  if (patched) {
    writeFileSync(reporterPath, content, 'utf-8');
    console.log('✅ playwright-enhanced-reporter patched');
  } else {
    console.log('ℹ️  playwright-enhanced-reporter already patched, skipping');
  }

  // 9. 重试最终通过时，不把中间失败 attempt 写入报告（Suites/Details/Failed 筛选）
  if (existsSync(indexPath)) {
    const indexRaw = readFileSync(indexPath, 'utf-8');
    let indexContent = indexRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let indexPatched = indexRaw !== indexContent;

    if (!indexContent.includes('patched: only keep final attempt')) {
      const earlyReturnNeedle =
        '        // Extract attachments (screenshots, videos, traces, etc.)\n' +
        '        const attachments = this.extractAttachments(result);';
      const earlyReturnReplacement =
        '        // patched: only keep final attempt (drop superseded failed retries)\n' +
        '        if (!isFinalResult) {\n' +
        '            return;\n' +
        '        }\n' +
        '        // Extract attachments (screenshots, videos, traces, etc.)\n' +
        '        const attachments = this.extractAttachments(result);';
      if (!indexContent.includes(earlyReturnNeedle)) {
        console.warn('⚠️  patch #9 final-attempt needle not found, skipping');
      } else {
        indexContent = indexContent.replace(earlyReturnNeedle, earlyReturnReplacement);
        indexPatched = true;
      }
    }

    // 解析附件里的 durationMs / assertionFailed（供 API Requests 标红）
    if (!indexContent.includes('patched: extract assertionFailed')) {
      const durationExtractNeedle =
        '                                        duration: parsed.duration || ((_h = parsed.timing) === null || _h === void 0 ? void 0 : _h.duration),\n' +
        '                                        timestamp: parsed.timestamp ? new Date(parsed.timestamp) : undefined';
      const durationExtractReplacement =
        '                                        // patched: extract assertionFailed\n' +
        '                                        duration: parsed.durationMs || parsed.duration || ((_h = parsed.timing) === null || _h === void 0 ? void 0 : _h.duration),\n' +
        '                                        assertions: parsed.assertions,\n' +
        '                                        assertionFailed: !!parsed.assertionFailed,\n' +
        '                                        timestamp: parsed.timestamp ? new Date(parsed.timestamp) : undefined';
      if (!indexContent.includes(durationExtractNeedle)) {
        console.warn('⚠️  patch #9b api extract needle not found, skipping');
      } else {
        indexContent = indexContent.replace(durationExtractNeedle, durationExtractReplacement);
        indexPatched = true;
      }
    }

    if (!indexContent.includes('patched: save attachment fallback')) {
      const saveNeedle =
        '                    try {\n' +
        '                        if (attachment.path) {\n' +
        '                            // Copy from existing path\n' +
        '                            await fs.copy(attachment.path, filePath);\n' +
        '                        }\n' +
        '                        else if (attachment.body) {\n' +
        '                            // Write from buffer\n' +
        '                            await fs.writeFile(filePath, attachment.body);\n' +
        '                        }\n' +
        '                        // Update attachment with relative path for HTML\n' +
        '                        attachment.path = `attachments/${filename}`;\n' +
        '                    }\n' +
        '                    catch (error) {\n' +
        '                        console.warn(`⚠️ Failed to save attachment ${attachment.name}:`, error);\n' +
        '                    }';
      const saveReplacement =
        '                    try {\n' +
        '                        // patched: save attachment fallback\n' +
        '                        if (attachment.path && await fs.pathExists(attachment.path)) {\n' +
        '                            await fs.copy(attachment.path, filePath);\n' +
        '                        }\n' +
        '                        else if (attachment.body) {\n' +
        '                            await fs.writeFile(filePath, attachment.body);\n' +
        '                        }\n' +
        '                        else {\n' +
        "                            console.warn(`⚠️ Failed to save attachment ${attachment.name}: missing path/body`);\n" +
        '                            continue;\n' +
        '                        }\n' +
        '                        attachment.path = `attachments/${filename}`;\n' +
        '                    }\n' +
        '                    catch (error) {\n' +
        '                        console.warn(`⚠️ Failed to save attachment ${attachment.name}:`, error);\n' +
        '                    }';
      if (!indexContent.includes(saveNeedle)) {
        console.warn('⚠️  patch #17 save attachment needle not found, skipping');
      } else {
        indexContent = indexContent.replace(saveNeedle, saveReplacement);
        indexPatched = true;
      }
    }

    if (indexPatched) {
      writeFileSync(indexPath, indexContent, 'utf-8');
      console.log('✅ playwright-enhanced-reporter index patched');
    } else {
      console.log('ℹ️  playwright-enhanced-reporter index already patched, skipping');
    }
  }

  if (existsSync(typesPath)) {
    let typesContent = readFileSync(typesPath, 'utf-8');
    if (!typesContent.includes('details?: boolean;')) {
      if (typesContent.includes('metrics?: boolean;') && !typesContent.includes('details?: boolean;')) {
        typesContent = typesContent.replace(
          'metrics?: boolean;',
          'metrics?: boolean;\n    details?: boolean;',
        );
        writeFileSync(typesPath, typesContent, 'utf-8');
        console.log('✅ playwright-enhanced-reporter types patched (details)');
      } else if (!typesContent.includes('environment?: boolean;')) {
        const oldInterface = `export interface DashboardWidgetConfig {
    overview?: boolean;`;
        const newInterface = `export interface DashboardWidgetConfig {
    overview?: boolean;
    environment?: boolean;
    metrics?: boolean;
    details?: boolean;`;
        if (typesContent.includes(oldInterface)) {
          typesContent = typesContent.replace(oldInterface, newInterface);
          writeFileSync(typesPath, typesContent, 'utf-8');
          console.log('✅ playwright-enhanced-reporter types patched');
        } else {
          console.warn('⚠️  types patch needle not found, skipping');
        }
      } else {
        console.warn('⚠️  types patch details needle not found, skipping');
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
