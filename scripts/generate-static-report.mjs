#!/usr/bin/env node

/**
 * 纯静态 Allure 报告生成器
 * 从 allure-results 目录生成一个自包含的 index.html，双击即看，无需任何服务器。
 *
 * 用法:
 *   node scripts/generate-static-report.mjs <allure-results-dir> [output-dir]
 *
 * 示例:
 *   node scripts/generate-static-report.mjs reports/latest/allure-results reports/latest/static-report
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const resultsDir = path.resolve(args[0] || 'reports/latest/allure-results');
const outputDir = path.resolve(args[1] || 'reports/latest/static-report');

// ── 读取 allure-results ──────────────────────────────────────────────
function collectStepAttachments(steps) {
  const atts = [];
  for (const s of steps) {
    if (s.attachments) atts.push(...s.attachments);
    if (s.steps) atts.push(...collectStepAttachments(s.steps));
  }
  return atts;
}

function collectAllAttachments(results) {
  const atts = [];
  for (const r of results) {
    if (r.attachments) atts.push(...r.attachments);
    if (r.steps) atts.push(...collectStepAttachments(r.steps));
  }
  return atts;
}

function loadResults(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('-result.json'));
  const loaded = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); }
    catch { return null; }
  }).filter(Boolean);

  const attachmentMap = {};
  const allAtts = collectAllAttachments(loaded);
  for (const att of allAtts) {
    const attPath = path.join(dir, att.source);
    if (fs.existsSync(attPath)) {
      const content = fs.readFileSync(attPath, 'utf-8');
      if (att.type === 'application/json') {
        try { attachmentMap[att.source] = JSON.parse(content); }
        catch { attachmentMap[att.source] = content; }
      } else {
        attachmentMap[att.source] = content;
      }
    }
  }
  return { results: loaded, attachments: attachmentMap };
}

// ── 统计 ──────────────────────────────────────────────────────────────
function computeStats(list) {
  const passed = list.filter(r => r.status === 'passed').length;
  const failed = list.filter(r => r.status === 'failed').length;
  const broken = list.filter(r => r.status === 'broken').length;
  const skipped = list.filter(r => r.status === 'skipped').length;
  const total = list.length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const totalDuration = list.reduce((s, r) => s + (r.stop - r.start), 0);
  return { passed, failed, broken, skipped, total, passRate, totalDuration };
}

// ── 格式化 ────────────────────────────────────────────────────────────
function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return m + 'm ' + s + 's';
}

function statusBadge(status) {
  const map = {
    passed:   '<span class="badge passed"><span class="badge-dot"></span>通过</span>',
    failed:   '<span class="badge failed"><span class="badge-dot"></span>失败</span>',
    broken:   '<span class="badge broken"><span class="badge-dot"></span>异常</span>',
    skipped:  '<span class="badge skipped"><span class="badge-dot"></span>跳过</span>',
  };
  return map[status] || '<span class="badge unknown"><span class="badge-dot"></span>' + status + '</span>';
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatJson(obj) {
  try {
    return JSON.stringify(typeof obj === 'string' ? JSON.parse(obj) : obj, null, 2);
  } catch { return String(obj); }
}

// ── 渲染 step 树 ──────────────────────────────────────────────────────
function renderStep(step, depth) {
  const indent = depth * 20;
  const iconMap = { passed: '✓', failed: '✗', broken: '⚠' };
  const icon = iconMap[step.status] || '⊘';
  const cls = step.status || 'unknown';
  const dur = step.stop && step.start ? formatDuration(step.stop - step.start) : '';

  let h = '<div class="step" style="margin-left:' + indent + 'px">';
  h += '<span class="step-icon ' + cls + '">' + icon + '</span>';
  h += '<span class="step-name">' + escapeHtml(step.name) + '</span>';
  if (dur) h += '<span class="step-dur">' + dur + '</span>';
  for (const att of (step.attachments || [])) {
    h += '<span class="step-attachment" title="附件: ' + escapeHtml(att.name) + '">📎</span>';
  }
  h += '</div>';
  for (const child of (step.steps || [])) {
    h += renderStep(child, depth + 1);
  }
  return h;
}

function renderAttachmentBody(att, source, allAttachments) {
  const data = allAttachments[source];
  if (!data) return '<div class="att-empty">(附件未找到)</div>';
  const isJson = att.type === 'application/json' || (att.name && att.name.endsWith('.json'));
  const content = isJson ? formatJson(data) : String(data);
  return '<pre class="' + (isJson ? 'att-json' : 'att-text') + '">' + escapeHtml(content) + '</pre>';
}

// ── HTML 部分 ─────────────────────────────────────────────────────────
function write(s) { return s; }

function htmlHead() {
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>ClassInShop 测试报告</title>\n<style>\n' + cssAll() + '\n</style>\n</head>\n<body>\n';
}

function cssAll() {
  return [
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;background:#f1f5f9;color:#0f172a;line-height:1.6}',
    '.top-bar{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 40px;height:52px;display:flex;align-items:center;justify-content:space-between}',
    '.top-bar .brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;color:#0f172a}',
    '.top-bar .brand-icon{width:28px;height:28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px}',
    '.top-bar .meta{font-size:12px;color:#94a3b8}',
    '.hero{background:#f1f5f9;border-bottom:1px solid #e2e8f0;padding:24px 40px 28px}',
    '.hero h1{font-size:20px;font-weight:700;color:#0f172a;margin-bottom:4px;letter-spacing:-0.2px}',
    '.hero .subtitle{font-size:12px;color:#94a3b8;margin-bottom:20px}',
    '.stat-row{display:flex;gap:10px;flex-wrap:wrap}',
    '.stat-card{display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 18px;min-width:105px}',
    '.stat-card .stat-icon{width:34px;height:34px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}',
    '.stat-icon.passed{background:rgba(34,197,94,0.15);color:#22c55e}',
    '.stat-icon.failed{background:rgba(239,68,68,0.15);color:#ef4444}',
    '.stat-icon.broken{background:rgba(249,115,22,0.15);color:#f97316}',
    '.stat-icon.skipped{background:rgba(148,163,184,0.15);color:#94a3b8}',
    '.stat-icon.rate{background:rgba(99,102,241,0.15);color:#6366f1}',
    '.stat-icon.total{background:rgba(148,163,184,0.1);color:#94a3b8}',
    '.stat-card .stat-body{display:flex;flex-direction:column}',
    '.stat-card .num{font-size:20px;font-weight:700;line-height:1.1;color:#0f172a;font-variant-numeric:tabular-nums}',
    '.stat-card .label{font-size:10px;color:#64748b;margin-top:1px}',
    '.container{max-width:1160px;margin:0 auto;padding:28px 40px}',
    '.filter-bar{display:flex;gap:6px;margin-bottom:24px;flex-wrap:wrap}',
    '.filter-btn,.type-filter-btn{padding:7px 16px;border:1px solid #d1d5db;border-radius:7px;background:#fff;font-size:13px;font-weight:500;color:#4b5563;cursor:pointer;transition:all .15s;user-select:none}',
    '.filter-btn:hover,.type-filter-btn:hover{border-color:#818cf8;color:#4f46e5;background:#eef2ff}',
    '.filter-btn.active,.type-filter-btn.active{background:#4f46e5;color:#fff;border-color:#4f46e5;box-shadow:0 1px 3px rgba(79,70,229,.25)}',
    '.type-badge-fail{font-size:10px;background:#fca5a5;color:#fff;padding:1px 5px;border-radius:3px;margin-left:0;font-weight:600}',
    '.type-badge-pass{font-size:10px;background:#86efac;color:#fff;padding:1px 5px;border-radius:3px;margin-left:0;font-weight:600}',
    '.type-group{margin-bottom:32px}',
    '.type-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:linear-gradient(135deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:10px 10px 0 0;border-bottom:2px solid #e2e8f0}',
    '.type-header-title{font-size:15px;font-weight:700;color:#1e293b}',
    '.type-header-stats{display:flex;gap:8px}',
    '.ths{font-size:11px;font-weight:600;padding:2px 10px;border-radius:4px}',
    '.ths.passed{background:#dcfce7;color:#15803d}',
    '.ths.failed{background:#fee2e2;color:#b91c1c}',
    '.ths.broken{background:#fff7ed;color:#c2410c}',
    '.ths.total{background:#f1f5f9;color:#64748b}',
    '.module{margin-bottom:0}',
    '.module-header{display:flex;align-items:center;gap:10px;padding:10px 16px;background:#fff;border:1px solid #e2e8f0;border-top:none;cursor:pointer;user-select:none;transition:background .12s}',
    '.module-header:hover{background:#f8fafc}',
    '.module-toggle{font-size:9px;color:#94a3b8;transition:transform .15s;width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center}',
    '.module-toggle.collapsed{transform:rotate(-90deg)}',
    '.module-name{flex:1;font-size:13px;font-weight:600;color:#334155}',
    '.module-stats{display:flex;gap:4px;align-items:center}',
    '.ms{font-size:11px;font-weight:600;padding:2px 8px;border-radius:3px}',
    '.ms.passed{background:#dcfce7;color:#15803d}',
    '.ms.failed{background:#fee2e2;color:#b91c1c}',
    '.ms.total{background:transparent;color:#94a3b8;font-weight:400}',
    '.module-body{display:block}',
    '.module-body.collapsed{display:none}',
    '.test-case{margin-left:24px;background:#fff;border:1px solid #e2e8f0;border-top:none;overflow:hidden}',
    '.test-case:first-child{border-top:1px solid #e2e8f0}',
    '.test-case:last-child{border-radius:0 0 8px 8px}',
    '.test-case.failed{border-left:3px solid #ef4444}',
    '.test-case.broken{border-left:3px solid #f97316}',
    '.tc-header{display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;user-select:none;transition:background .12s}',
    '.tc-header:hover{background:#f8fafc}',
    '.tc-toggle{font-size:10px;color:#94a3b8;transition:transform .15s;width:14px;flex-shrink:0}',
    '.tc-toggle.open{transform:rotate(90deg)}',
    '.badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 10px;border-radius:4px;white-space:nowrap;flex-shrink:0}',
    '.badge .badge-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}',
    '.badge.passed{background:#dcfce7;color:#15803d}',
    '.badge.passed .badge-dot{background:#22c55e}',
    '.badge.failed{background:#fee2e2;color:#b91c1c}',
    '.badge.failed .badge-dot{background:#ef4444}',
    '.badge.broken{background:#fff7ed;color:#c2410c}',
    '.badge.broken .badge-dot{background:#f97316}',
    '.badge.skipped{background:#f1f5f9;color:#64748b}',
    '.badge.skipped .badge-dot{background:#94a3b8}',
    '.badge.unknown{background:#f1f5f9;color:#64748b}',
    '.badge.unknown .badge-dot{background:#94a3b8}',
    '.tc-name{flex:1;font-size:13px;font-weight:500;color:#1e293b}',
    '.tc-dur{font-size:12px;color:#94a3b8;flex-shrink:0}',
    '.tc-body{padding:0 16px 16px;border-top:1px solid #f1f5f9}',
    '.tc-meta{display:flex;flex-wrap:wrap;gap:4px;padding:14px 0;border-bottom:1px solid #f1f5f9;margin-bottom:14px}',
    '.tc-meta-item{display:flex;flex-direction:column;gap:2px;padding:6px 12px;background:#f8fafc;border-radius:6px;border:1px solid #f1f5f9;font-size:12px;color:#475569}',
    '.tc-meta-label{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px}',
    '.section-title{font-size:11px;font-weight:600;color:#475569;margin-bottom:10px;text-transform:uppercase;letter-spacing:.3px}',
    '.section-title.error-title{color:#b91c1c}',
    '.tc-steps,.tc-error,.tc-attachments{margin-top:14px}',
    '.step{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px}',
    '.step-icon{font-size:11px;width:16px;text-align:center;flex-shrink:0}',
    '.step-icon.passed{color:#22c55e}',
    '.step-icon.failed{color:#ef4444}',
    '.step-icon.broken{color:#f97316}',
    '.step-name{color:#334155}',
    '.step-dur{font-size:11px;color:#94a3b8;margin-left:auto}',
    '.step-attachment{font-size:12px;cursor:default;opacity:.6}',
    '.tc-error pre,.att-json,.att-text{background:#1e293b;color:#e2e8f0;padding:14px 16px;border-radius:8px;font-family:"SF Mono","Fira Code","Cascadia Code","JetBrains Mono",Menlo,monospace;font-size:12px;line-height:1.65;overflow-x:auto;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}',
    '.tc-error pre{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}',
    'details{margin-top:8px}',
    'details summary{cursor:pointer;font-size:12px;color:#6366f1;font-weight:500}',
    'details pre{background:#1e293b;color:#e2e8f0;padding:12px;border-radius:8px;margin-top:8px;font-size:11px;max-height:300px;overflow:auto}',
    '.att-item{margin-bottom:8px}',
    '.att-header{display:flex;align-items:center;gap:10px;padding:9px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:13px;transition:background .12s}',
    '.att-header:hover{background:#eef2ff;border-color:#c7d2fe}',
    '.att-file-icon{color:#94a3b8;flex-shrink:0}',
    '.att-header:hover .att-file-icon{color:#6366f1}',
    '.att-type{font-size:10px;color:#64748b;background:#e2e8f0;padding:2px 8px;border-radius:4px;margin-left:auto;font-weight:500;text-transform:uppercase;letter-spacing:.3px}',
    '.att-body{margin-top:4px}',
    '.footer{text-align:center;padding:24px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:40px}',
  ].join('\n');
}

function jsAll() {
  return [
    'function toggle(id){var b=document.getElementById(id),a=document.getElementById(id+"-arrow");if(b.style.display==="none"){b.style.display="block";a.classList.add("open")}else{b.style.display="none";a.classList.remove("open")}}',
    'function toggleAtt(id){var b=document.getElementById(id),a=document.getElementById(id+"-arrow");if(b.style.display==="none"){b.style.display="block";a.classList.add("open")}else{b.style.display="none";a.classList.remove("open")}}',
    'function toggleModule(h){var b=h.nextElementSibling,a=h.querySelector(".module-toggle");if(b.classList.contains("collapsed")){b.classList.remove("collapsed");a.classList.remove("collapsed");a.textContent="\\u25bc"}else{b.classList.add("collapsed");a.classList.add("collapsed");a.textContent="\\u25b6"}}',
    'function filterType(type,btn){document.querySelectorAll(".type-filter-btn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");document.querySelectorAll(".type-group").forEach(function(g){g.style.display=(type==="all"||g.dataset.type===type)?"":"none"})}',
    'function filter(status,btn){document.querySelectorAll(".filter-btn").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");document.querySelectorAll(".test-case").forEach(function(tc){if(status==="all"){tc.style.display="";return}tc.style.display=tc.classList.contains(status)?"":"none"});document.querySelectorAll(".module").forEach(function(m){var tcs=m.querySelectorAll(".test-case");var vis=false;for(var i=0;i<tcs.length;i++){if(tcs[i].style.display!=="none"){vis=true;break}}m.style.display=vis?"":"none"})}',
  ].join('\n');
}

// ── 生成页面 ──────────────────────────────────────────────────────────
function buildHtml(results, attachments) {
  const stats = computeStats(results);
  const typeNames = {
    api: '接口测试', core: '核心流程', 'e2e-web': 'Web 端到端',
    'e2e-mobile': 'Mobile 端到端', miniprogram: '小程序',
    'miniprogram-user': '小程序-用户端', 'miniprogram-teacher': '小程序-教师端',
  };

  // 按 测试类型(parentSuite) → 模块(suite) → 用例 三级分组
  const typeModules = {};
  for (const r of results) {
    const t = r.labels?.find(l => l.name === 'parentSuite')?.value || '其他';
    const m = r.labels?.find(l => l.name === 'suite')?.value || 'default';
    if (!typeModules[t]) typeModules[t] = {};
    if (!typeModules[t][m]) typeModules[t][m] = [];
    typeModules[t][m].push(r);
  }

  const typeOrder = Object.keys(typeModules).sort();
  const typeStats = {};
  for (const t of typeOrder) {
    let all = [];
    for (const m of Object.values(typeModules[t])) all = all.concat(m);
    typeStats[t] = computeStats(all);
  }

  let body = '';

  // top-bar
  body += '<div class="top-bar"><div class="brand"><div class="brand-icon">CS</div><span>ClassInShop Test Suite</span></div><span class="meta">' + new Date().toLocaleString() + '</span></div>';

  // hero
  body += '<div class="hero"><h1>测试报告</h1><div class="subtitle">数据源: allure-results</div><div class="stat-row">';
  body += statCard('passed', '✓', stats.passed, '通过');
  body += statCard('failed', '✗', stats.failed, '失败');
  body += statCard('broken', '!', stats.broken, '异常');
  body += statCard('skipped', '⊘', stats.skipped, '跳过');
  body += statCard('rate', '%', stats.passRate + '%', '通过率');
  body += statCard('total', '#', stats.total, '总计');
  body += statCard('total', '⏱', formatDuration(stats.totalDuration), '总耗时');
  body += '</div></div>';

  // container
  body += '<div class="container">';

  // 状态筛选栏
  body += '<div class="filter-bar">';
  body += '<button class="filter-btn active" onclick="filter(\'all\',this)">全部</button>';
  body += '<button class="filter-btn" onclick="filter(\'passed\',this)">✅ 通过</button>';
  body += '<button class="filter-btn" onclick="filter(\'failed\',this)">❌ 失败</button>';
  body += '<button class="filter-btn" onclick="filter(\'broken\',this)">⚠️ 异常</button>';
  body += '<button class="filter-btn" onclick="filter(\'skipped\',this)">⊘ 跳过</button>';
  body += '</div>';

  // 类型筛选栏
  body += '<div class="type-filter-bar">';
  body += '<button class="type-filter-btn active" onclick="filterType(\'all\',this)">全部类型</button>';
  for (const t of typeOrder) {
    const ts = typeStats[t];
    const label = typeNames[t] || t;
    body += '<button class="type-filter-btn" onclick="filterType(\'' + t + '\',this)">' + escapeHtml(label);
    if (ts.failed > 0) body += ' <span class="type-badge-fail">' + ts.failed + '</span>';
    if (ts.passed > 0) body += ' <span class="type-badge-pass">' + ts.passed + '</span>';
    body += '</button>';
  }
  body += '</div>';

  // 类型 -> 模块 -> 用例
  for (const t of typeOrder) {
    const modules = typeModules[t];
    const typeLabel = typeNames[t] || t;
    const ts = typeStats[t];

    body += '<div class="type-group" data-type="' + t + '">';
    body += '<div class="type-header">';
    body += '<span class="type-header-title">' + escapeHtml(typeLabel) + '</span>';
    body += '<span class="type-header-stats">';
    body += '<span class="ths passed">' + ts.passed + ' 通过</span>';
    if (ts.failed > 0) body += '<span class="ths failed">' + ts.failed + ' 失败</span>';
    if (ts.broken > 0) body += '<span class="ths broken">' + ts.broken + ' 异常</span>';
    body += '<span class="ths total">' + ts.total + ' 用例</span>';
    body += '</span></div>';

    for (const [modName, modResults] of Object.entries(modules)) {
      const ms = computeStats(modResults);

      body += '<div class="module">';
      body += '<div class="module-header" onclick="toggleModule(this)">';
      body += '<span class="module-toggle open">▼</span>';
      body += '<span class="module-name">' + escapeHtml(modName) + '</span>';
      body += '<span class="module-stats">';
      body += '<span class="ms passed">' + ms.passed + '</span>';
      if (ms.failed > 0) body += '<span class="ms failed">' + ms.failed + '</span>';
      body += '<span class="ms total">/ ' + ms.total + '</span>';
      body += '</span></div>';
      body += '<div class="module-body">';

      for (const r of modResults) {
        const dur = r.stop - r.start;
        const uid = r.uuid;

        body += '<div class="test-case ' + r.status + '">';
        body += '<div class="tc-header" onclick="toggle(\'' + uid + '\')">';
        body += '<span class="tc-toggle" id="' + uid + '-arrow">▶</span>';
        body += statusBadge(r.status);
        body += '<span class="tc-name">' + escapeHtml(r.name) + '</span>';
        body += '<span class="tc-dur">' + formatDuration(dur) + '</span>';
        body += '</div>';

        body += '<div class="tc-body" id="' + uid + '" style="display:none">';

        // 元信息
        body += '<div class="tc-meta">';
        body += '<span class="tc-meta-item"><span class="tc-meta-label">开始时间</span>' + new Date(r.start).toLocaleString() + '</span>';
        body += '<span class="tc-meta-item"><span class="tc-meta-label">耗时</span>' + formatDuration(dur) + '</span>';
        const pSuite = r.labels?.find(l => l.name === 'parentSuite')?.value;
        const sSuite = r.labels?.find(l => l.name === 'subSuite')?.value;
        if (pSuite) body += '<span class="tc-meta-item"><span class="tc-meta-label">测试类型</span>' + escapeHtml(pSuite) + '</span>';
        if (sSuite) body += '<span class="tc-meta-item"><span class="tc-meta-label">描述</span>' + escapeHtml(sSuite) + '</span>';
        const tags = r.labels?.filter(l => l.name === 'tag').map(l => l.value) || [];
        if (tags.length) body += '<span class="tc-meta-item"><span class="tc-meta-label">标签</span>' + escapeHtml(tags.join(', ')) + '</span>';
        body += '</div>';

        // 步骤
        if (r.steps?.length) {
          body += '<div class="tc-steps"><div class="section-title">执行步骤</div>';
          for (const step of r.steps) body += renderStep(step, 0);
          body += '</div>';
        }

        // 错误
        if (r.statusDetails?.message) {
          body += '<div class="tc-error"><div class="section-title error-title">错误信息</div>';
          body += '<pre>' + escapeHtml(r.statusDetails.message) + '</pre>';
          if (r.statusDetails.trace) {
            body += '<details><summary>堆栈跟踪</summary><pre>' + escapeHtml(r.statusDetails.trace) + '</pre></details>';
          }
          body += '</div>';
        }

        // 附件
        const allAtts = [...(r.attachments || []), ...collectStepAttachments(r.steps || [])];
        if (allAtts.length) {
          body += '<div class="tc-attachments"><div class="section-title">附件 (' + allAtts.length + ')</div>';
          for (const att of allAtts) {
            const attId = uid + '-att-' + att.source.replace(/[^a-zA-Z0-9]/g, '-');
            body += '<div class="att-item">';
            body += '<div class="att-header" onclick="toggleAtt(\'' + attId + '\')">';
            body += '<span class="tc-toggle" id="' + attId + '-arrow">▶</span>';
            body += '<svg class="att-file-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            body += '<span>' + escapeHtml(att.name) + '</span>';
            body += '<span class="att-type">' + escapeHtml(att.type || 'text') + '</span>';
            body += '</div>';
            body += '<div class="att-body" id="' + attId + '" style="display:none">';
            body += renderAttachmentBody(att, att.source, attachments);
            body += '</div></div>';
          }
          body += '</div>';
        }

        body += '</div></div>'; // tc-body, test-case
      }

      body += '</div></div>'; // module-body, module
    }
    body += '</div>'; // type-group
  }

  body += '</div>'; // container

  // footer
  body += '<div class="footer">ClassInShop Test Suite · Powered by Playwright + Allure · 纯静态报告</div>';

  // script
  body += '<script>' + jsAll() + '</script>';

  body += '</body>\n</html>';

  return htmlHead() + body;
}

function statCard(iconClass, icon, num, label) {
  return '<div class="stat-card"><div class="stat-icon ' + iconClass + '">' + icon + '</div><div class="stat-body"><span class="num">' + num + '</span><span class="label">' + label + '</span></div></div>';
}

// ── 主流程 ────────────────────────────────────────────────────────────
console.log('📂 读取: ' + resultsDir);
if (!fs.existsSync(resultsDir)) {
  console.error('❌ allure-results 目录不存在: ' + resultsDir);
  process.exit(1);
}

const { results: loadedResults, attachments: loadedAttachments } = loadResults(resultsDir);
console.log('✓ 加载 ' + loadedResults.length + ' 条测试结果');

if (loadedResults.length === 0) {
  console.error('❌ 没有找到任何测试结果');
  process.exit(1);
}

const htmlOutput = buildHtml(loadedResults, loadedAttachments);

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'index.html'), htmlOutput, 'utf-8');
console.log('✅ 报告已生成: ' + path.join(outputDir, 'index.html'));
console.log('   双击即可在浏览器中打开，无需任何服务器。');
