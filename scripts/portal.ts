import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePortalHtml } from './report-slot.js';

export interface PortalPageSpec {
  series: string;
  relativeFile: string;
  title: string;
  subtitle: string;
  emoji: string;
  indexHref: string;
  reportPrefix: string;
  assetPrefix: string;
  classinshopHref: string;
  teacherinHref: string;
}

export const PORTAL_PAGES: PortalPageSpec[] = [
  {
    series: 'classinshop',
    relativeFile: 'index.html',
    title: 'ClassInShop 测试报告',
    subtitle: 'CI 自动发布 · Enhanced Report 在线托管',
    emoji: '🎯',
    indexHref: './reports-index.json',
    reportPrefix: './',
    assetPrefix: './',
    classinshopHref: './',
    teacherinHref: './teacherin/',
  },
  {
    series: 'teacherin',
    relativeFile: 'teacherin/index.html',
    title: 'TeacherIn 测试报告',
    subtitle: 'CI 自动发布 · Enhanced Report 在线托管',
    emoji: '📘',
    indexHref: '../reports-index.json',
    reportPrefix: '../',
    assetPrefix: '../',
    classinshopHref: '../',
    teacherinHref: './',
  },
];

const TEMPLATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'portal/report-portal.html');

export function renderReportPortalHtml(page: PortalPageSpec): string {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  return template
    .replaceAll('{{PORTAL_TITLE}}', page.title)
    .replaceAll('{{PORTAL_SUBTITLE}}', page.subtitle)
    .replaceAll('{{PORTAL_EMOJI}}', page.emoji)
    .replaceAll('{{PORTAL_SERIES}}', page.series)
    .replaceAll('{{PORTAL_INDEX_HREF}}', page.indexHref)
    .replaceAll('{{PORTAL_REPORT_PREFIX}}', page.reportPrefix)
    .replaceAll('{{PORTAL_ASSET_PREFIX}}', page.assetPrefix)
    .replaceAll('{{PORTAL_NAV_CLASSINSHOP_HREF}}', page.classinshopHref)
    .replaceAll('{{PORTAL_NAV_TEACHERIN_HREF}}', page.teacherinHref)
    .replaceAll('{{PORTAL_NAV_CLASSINSHOP_ACTIVE}}', page.series === 'classinshop' ? ' is-active' : '')
    .replaceAll('{{PORTAL_NAV_TEACHERIN_ACTIVE}}', page.series === 'teacherin' ? ' is-active' : '')
    .replaceAll(
      '{{PORTAL_BODY_CLASS}}',
      page.series === 'teacherin' ? 'series-teacherin' : 'series-classinshop',
    );
}

export function writeReportPortals(repoRoot: string): string[] {
  return PORTAL_PAGES.map((page) => {
    const dest = path.join(repoRoot, page.relativeFile);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, ensurePortalHtml(renderReportPortalHtml(page)), 'utf8');
    return page.relativeFile;
  });
}
