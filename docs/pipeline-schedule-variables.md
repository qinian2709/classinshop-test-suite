# Pipeline Schedule 执行配置说明

本文档只说明 **Pipeline Schedule 的执行策略**：跑哪个环境、跑哪些项目、报告如何发布、企微如何通知。

**不包含** 被测系统凭据（Token、手机号、商品 ID、E2E 账号等）——那些属于测试环境依赖，见 [`docs/run-guide.md`](./run-guide.md) 与 [`.env.example`](../.env.example)，在 GitLab CI/CD Variables 中单独维护即可。

适用项目：`classinshop-test-suite`  
配置入口：GitLab → **Settings → CI/CD → Variables**（或 Schedule 条目上单独覆盖）

---

## 1. Schedule 执行流程

Schedule 触发（`CI_PIPELINE_SOURCE=schedule`）后：

1. 读取 `SCHEDULE_TEST_ENV` → 选择被测环境（13 / 14 / im）
2. 读取 `TEST_SUITE_PROJECTS` → 选择 Playwright 项目（`api` / `e2e-web` / `e2e-mobile`）
3. 单次 Job 跑完 → 生成 Enhanced 报告
4. 若配置了 `REPORT_PUBLISH_*` → push 到 Coolify 静态站
5. 发送企微通知（报告链接优先 Coolify URL）

与 **分支推送 / MR** 不同：Schedule **不会**跑 api demo，**默认跑全量 API**。

---

## 2. 创建 Schedule

1. GitLab：**Build → Pipeline schedules → New schedule**
2. Cron 例：`0 2 * * *`（每天 02:00）
3. **Target branch**：定时任务使用的代码分支（如 `14`）
4. 配置下文 **执行变量**（项目级 Variables 或 Schedule 级覆盖）

---

## 3. 执行变量一览

| 变量 | 必须？ | 默认值 | 作用 |
|------|--------|--------|------|
| `SCHEDULE_TEST_ENV` | 可选 | `14` | 被测环境 `13` / `14` / `im` |
| `TEST_SUITE_PROJECTS` | 可选 | `api` | 逗号分隔：`api`、`e2e-web`、`e2e-mobile` |
| `REPORT_PUBLISH_BASE_URL` | 推荐 | — | Coolify 报告站点 URL 前缀 |
| `REPORT_PUBLISH_GIT_REPO` | 推荐 | — | 报告托管 Git 仓库 |
| `REPORT_PUBLISH_GIT_TOKEN` | 推荐 | — | push 报告仓库的 PAT（Masked） |
| `WECOM_WEBHOOK_URL` | 可选 | 见 `config/wecom.ts` | 覆盖默认企微 Webhook |
| `WECOM_PUBLISH_WAIT_SECONDS` | 可选 | `30` | 发企微前等待报告 URL 就绪（秒），`0` 关闭 |
| `REPORT_PUBLISH_MODE` | 可选 | 自动 | `coolify` / `rsync` / `local` |
| `REPORT_PUBLISH_GIT_BRANCH` | 可选 | `main` | 报告仓库分支 |
| `PLAYWRIGHT_IMAGE` | 可选 | 见 `.gitlab-ci.yml` | Runner 镜像（内网可换内部源） |
| `PNPM_VERSION` | 可选 | `10` | pnpm 版本 |

### 必须 vs 可选怎么理解

- **不配也能跑**：`SCHEDULE_TEST_ENV`、`TEST_SUITE_PROJECTS` 都有默认值，Schedule 会按默认跑 **14 环境 + 全量 API**。
- **不配报告三件套**：测试和 GitLab Artifacts 仍有；只是 **不会** push Coolify，企微链接回退 Artifacts。
- **不配 `WECOM_WEBHOOK_URL`**：使用代码内默认 Webhook。

### 在线报告三件套（推荐一起配）

| 变量 | Masked | 示例 |
|------|--------|------|
| `REPORT_PUBLISH_BASE_URL` | 否 | `https://classinshop-test-reports.coolify.eeo-inc.com` |
| `REPORT_PUBLISH_GIT_REPO` | 否 | `https://skills.eeo-inc.com/kailiang.qiu/classinshop-test-reports.git` |
| `REPORT_PUBLISH_GIT_TOKEN` | **是** | GitLab PAT（`write_repository`） |

---

## 4. `TEST_SUITE_PROJECTS` 说明

**仅 Schedule 生效**；分支 Push / MR 固定 api demo，**忽略**此变量。

| 取值 | 含义 |
|------|------|
| 不配置 | 默认 `api` → 全量 `tests/api` |
| `api` | 同上 |
| `api,e2e-web` | API 全量 + PC E2E |
| `api,e2e-web,e2e-mobile` | API + Web + H5 E2E |
| `e2e-web,e2e-mobile` | 仅 E2E，不跑 API |

---

## 5. 与分支 Push / MR 的差异

| 触发方式 | 测试范围 | `TEST_SUITE_PROJECTS` | `SCHEDULE_TEST_ENV` |
|---------|---------|----------------------|---------------------|
| **Schedule** | 由变量控制 | **生效** | **生效** |
| 分支推送 13/14/im | 固定 api demo | 忽略 | 忽略（按分支名推导环境） |
| 合并请求 MR | 固定 api demo | 忽略 | 忽略（默认 14） |

---

## 6. 推荐配置示例

以下 **只列执行配置**；Token / 账号等见 [`run-guide.md`](./run-guide.md)。

### 6.1 默认夜间 API 回归 + 在线报告

```text
SCHEDULE_TEST_ENV=14
# TEST_SUITE_PROJECTS 不填 → 默认 api 全量

REPORT_PUBLISH_BASE_URL=https://classinshop-test-reports.coolify.eeo-inc.com
REPORT_PUBLISH_GIT_REPO=https://skills.eeo-inc.com/kailiang.qiu/classinshop-test-reports.git
REPORT_PUBLISH_GIT_TOKEN=<masked>
```

### 6.2 API + Web + H5 全量回归

```text
SCHEDULE_TEST_ENV=14
TEST_SUITE_PROJECTS=api,e2e-web,e2e-mobile

REPORT_PUBLISH_BASE_URL=https://classinshop-test-reports.coolify.eeo-inc.com
REPORT_PUBLISH_GIT_REPO=https://skills.eeo-inc.com/kailiang.qiu/classinshop-test-reports.git
REPORT_PUBLISH_GIT_TOKEN=<masked>
```

### 6.3 仅 E2E（不跑 API）

```text
SCHEDULE_TEST_ENV=14
TEST_SUITE_PROJECTS=e2e-web,e2e-mobile
```

### 6.4 13 环境 + 仅 API

```text
SCHEDULE_TEST_ENV=13
TEST_SUITE_PROJECTS=api
```

---

## 7. 报告过期清理（独立 Schedule）

`classinshop-test-reports` 为静态托管仓，**无 Runner**；清理在 **本仓库** 执行。  
清理会：1) 删除 `reports-index.json` 里超过保留期的历史行（`isLatest` 保留）；2) **orphan 压成单 commit 并 force-with-lease**，让仓库体积跟当前 `latest/` 树走，而不是每次 publish 堆 blob。**不删** `{env}/{target}/latest/` 托管文件。

`classinshop-test-reports` 的 **`main` 必须允许 force push**（Protected branches → Allowed to force push），否则 cleanup Job 会被 GitLab 拒绝。

| 变量 | 必须？ | 作用 |
|------|--------|------|
| `SCHEDULE_TASK` | **是** | 设为 `cleanup-reports` 时只跑清理 Job，不跑测试 |
| `RETENTION_DAYS` | 可选 | 默认 `7` |
| `REPORT_PUBLISH_GIT_REPO` | **是** | 报告仓库 URL（同发布） |
| `REPORT_PUBLISH_GIT_TOKEN` | **是** | push 权限 PAT（Masked） |
| `SQUASH_GIT_HISTORY` | 可选 | 默认开启；设 `0` 则只普通 commit，不压历史 |
| `SCHEDULE_CLEANUP_REPORTS` | Web 用 | Run pipeline 手动触发清理时设为 `1` |

**新建 Schedule 示例**（每天 10:00 北京时间）：

```text
SCHEDULE_TASK=cleanup-reports
RETENTION_DAYS=7
REPORT_PUBLISH_GIT_REPO=https://skills.eeo-inc.com/kailiang.qiu/classinshop-test-reports.git
REPORT_PUBLISH_GIT_TOKEN=<masked，可与夜间回归共用>
```

Cron：`0 10 * * *`，Timezone：`Asia/Shanghai`。Target branch 用 test-suite 常用分支（如 `14`）。

与夜间回归 **分开两条 Schedule**：一条 `SCHEDULE_TASK=cleanup-reports`，一条不配 `SCHEDULE_TASK`（跑测试）。

---

## 8. 排查（执行配置相关）

| 现象 | 检查项 |
|------|--------|
| Schedule 跑了 demo 而非全量 API | 不应发生；若出现，确认 `CI_PIPELINE_SOURCE=schedule` 且未误改 `ci-test-suite.sh` |
| 想跑 E2E 但实际只跑了 API | 是否配置 `TEST_SUITE_PROJECTS` 含 `e2e-web` / `e2e-mobile` |
| 跑错环境 | `SCHEDULE_TEST_ENV` 与 Target branch 是否一致 |
| 企微无 Coolify 链接 | 是否缺少 `REPORT_PUBLISH_*` 三件套 |
| 企微链接 404 | 调大 `WECOM_PUBLISH_WAIT_SECONDS`（默认 30） |
| cleanup force push 被拒 | reports 仓 `main` 未允许 force push；或 publish 与 cleanup 抢同一 SHA，重跑即可 |
| 大量用例 skip / 登录失败 | **非本文档范围** → 见 [`run-guide.md`](./run-guide.md) 配置 Token 等 |

---

## 9. 相关文档

| 文档 | 内容 |
|------|------|
| [`docs/run-guide.md`](./run-guide.md) | Token、手机号、店铺域名、E2E 账号等 **环境依赖** |
| [`.env.example`](../.env.example) | 本地 / CI 凭据变量模板 |
| [`.gitlab-ci.yml`](../.gitlab-ci.yml) | CI 流程与注释 |
