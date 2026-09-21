# SETUP — 小程序穿搭推荐（韩系 grounding + 降本方案）

本文档归档「兼容网页版韩女搭配 + 降本」方案的**实际部署配置与刷新流程**（对应 ADR 0007）。
所有内容以 `cloudfunctions/` 下已落地代码为准，不写理想化措辞。

---

## 1. 架构总览

整条链路被切成 7 个独立部分，每段有离线验证门兜底：

| 部分 | 产物 | 验证门 |
|---|---|---|
| 1 内容大脑 | `cloudfunctions/aiRecommend/references/brain.json`（8 章规则 + 韩国案例库）+ `schema-check.js` | `node references/schema-check.js` |
| 2 大脑加载器 | `lib/brainLoader.js`（四级降级） | `node lib/brainLoader.test.js` |
| 3 提示词构建器 | `lib/promptBuilder.js`（注入 inspo） | `node lib/promptBuilder.test.js` |
| 4 推荐编排 | `index.js` 串联 + `lib/recommendCore.js` | `node lib/index.integration.test.js`（真实 A/B 需 `SILICONFLOW_KEY`） |
| 5 界面渲染 | 推荐页 + 收藏页渲染 `inspo` | `node ../../utils/looks.test.js` |
| 6 刷新灵感 | `cloudfunctions/refreshCases/`（Tavily）→ `freshCases` 集合 + 前端按钮 | `node lib/freshCases.test.js` + `node ../../cloudfunctions/aiRecommend/lib/freshCases.test.js` |
| 7 技能收口 | ootd 技能读同一份 brain.json + 本文件 | 见第 5 节 |

**单一真源**：`brain.json` 同时被小程序云函数与 ootd 技能读取，由刷新流程统一维护，禁止在别处另存一份规则。

---

## 2. 部署前置

### 2.1 依赖
两个云函数都依赖 `wx-server-sdk`（云开发 Node 运行时已内置，无需额外安装；`package.json` 已声明）。
`recommendCore.js` / `refreshCases` 使用 Node 全局 `fetch`（云开发 Node 16+ 支持，无需 `node-fetch`）。

### 2.2 云函数环境变量

**`aiRecommend`**（必填：文本模型 key；可选：大脑覆盖层 / 刷新叠加层）

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `SILICONFLOW_KEY` | 是* | 空 | 硅基流动 API key；留空且非 cloudbase 环境则推荐失败。*若用云开发 AI+（`TEXT_PROVIDER=cloudbase`）可免 |
| `TEXT_PROVIDER` | 否 | `auto` | `auto`=优先硅基流动，失败回退云开发 AI+；`siliconflow`/`cloudbase` 二选一 |
| `SF_TEXT_MODEL` | 否 | `deepseek-ai/DeepSeek-V3` | 硅基流动文本模型（极便宜，单次 <¥0.01） |
| `CB_TEXT_MODEL` | 否 | `hunyuan-v3` | 云开发 AI+ 模型 |
| `BRAIN_URL` | 否 | 空 | 静态 URL 覆盖层（A'）。**不设也能用**——见第 3 节 |
| `BRAIN_FILE_ID` | 否 | 空 | 云存储 `looks/brain.json` 副本 fileID，作为 URL 失败后的二级兜底 |
| `USE_FRESH_CASES` | 否 | 未设 | 设为 `1` 才启用 Part 6 的「刷新灵感」叠加（读 `freshCases` 集合） |
| `FRESH_CASES_COLLECTION` | 否 | `freshCases` | 刷新案例存放的集合名 |

**`refreshCases`**（仅启用「刷新灵感」按钮时需要）

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `TAVILY_KEY` | 是* | 空 | Tavily 搜索 API key。免费档 1000 credits/月，自用几乎永远花不到钱（一次刷新≈3 credits）。*不设则返回明确错误，不影响主链路 |
| `FRESH_CASES_COLLECTION` | 否 | `freshCases` | 与 `aiRecommend` 的 `FRESH_CASES_COLLECTION` 保持一致 |

### 2.3 云数据库集合
- `items` / `looks` / `meta`：原有集合，不变。
- `freshCases`（新增，仅启用按钮时需要）：doc `current` 存最新刷新结果 `{ cases:[...], season, updatedAt }`。

---

## 3. brain.json 真源与刷新

### 3.1 保底真源：本地打包（部署即生效）
`brain.json` 位于 `cloudfunctions/aiRecommend/references/brain.json`，**随云函数包一起上传**。
`brainLoader` 的读取顺序是：

```
① BRAIN_URL（若配置且可达）→ 内存缓存 1h
② 本地打包文件 references/brain.json（随包部署，零外部依赖）
③ 云存储 BRAIN_FILE_ID（可选）
④ 内置硬编码 FALLBACK_BRAIN（仅 6 条核心原则，cases 空）
```

**结论：只要部署了 `aiRecommend`，线上用的就是完整大脑（含韩国案例库），不配任何 URL 也行。** 这是为可靠性加的一层（区别于早期方案里"不配 URL 就退回无案例兜底"的漏洞）。

### 3.2 覆盖层：BRAIN_URL（免重新部署刷新规则）
若想**不重新部署云函数**就更新规则/案例库，把 `brain.json` 托管到一个可覆盖的静态 URL（CloudStudio 静态部署 / 腾讯云 COS / GitHub raw 均可），设 `BRAIN_URL` 指向它。
刷新时由助手重跑检索 → 覆盖该 URL 上的文件 → 下次冷启动自动生效（你零操作）。URL 挂了会自动降级到 ② 本地打包文件，主功能不受影响。

### 3.3 刷新流程

**A. 韩国案例即时刷新（零成本、你零操作）—— 推荐用**
小程序推荐页点「🔄 刷新灵感」→ 调 `refreshCases`（Tavily basic，免费档）→ 洗净后的新案例写 `freshCases.current`。
`aiRecommend` 在 `USE_FRESH_CASES=1` 时把 fresh cases 叠加进推荐（在前、去重、封顶 16）。
> 前提：两个云函数都已部署且配好 `TAVILY_KEY` / `USE_FRESH_CASES=1`。

**B. 规则 + 基础案例库刷新（换季，约 4 次/年）**
由助手执行（你喊"刷新灵感库"或在 CloudStudio 自动化里排期）：
1. 用 ootd 技能的三级检索重抓韩国案例；
2. 更新 `brain.json` 的 `rules` / `cases`（保持 schema 不变）；
3. `node references/schema-check.js` 校验通过；
4. 生效二选一：
   - 设了 `BRAIN_URL` → 覆盖该 URL 上的文件（免部署）；
   - 没设 → 重新上传部署 `aiRecommend`（brain.json 随包更新）。

---

## 4. 启用「刷新灵感」按钮步骤

1. 部署 `refreshCases` 云函数，环境变量填 `TAVILY_KEY`（免费档即可）。
2. 重新部署 `aiRecommend`，加环境变量 `USE_FRESH_CASES=1`（与 `refreshCases` 的 `FRESH_CASES_COLLECTION` 一致）。
3. 微信开发者工具里预览推荐页，点「🔄 刷新灵感」→ 等几秒 → 下次生成即叠加当下韩系案例。
4. **首次真实刷新后陪验一次 Tavily 案例质量**：若内容太水，按 ADR 预案降级为"只出趋势词、不进主案例库"。

> 不启用按钮也不影响主推荐链路：Part 6 代码默认关闭（`USE_FRESH_CASES` 未设），失败仅 warn 不阻断。

---

## 5. Part 7 验证：ootd 技能已收口到同一份大脑

ootd 技能（`~/.workbuddy/skills/ootd-outfit/SKILL.md`）第 4 步与参考表已改读：
`D:/User/outfitSkill/wardrobe-miniapp/cloudfunctions/aiRecommend/references/brain.json`
`references/style-guide.md` 已加「已弃用镜像」头注，明确以 brain.json 为准，杜绝规则漂移。

验证门（离线可跑，证明技能引用的路径能解析出与小程序完全一致的 8 章规则）：
```bash
cd wardrobe-miniapp/cloudfunctions/aiRecommend
node -e "const b=require('./references/brain.json'); console.log('章节数:', b.rules.chapters.length); console.log(b.rules.chapters.map(c=>c.title).join(' / '));"
```
应输出 8 个章节标题，与小程序端 `promptBuilder` 注入的规则一致。

---

## 6. 成本小结

| 项 | 成本 | 说明 |
|---|---|---|
| 文本模型（DeepSeek-V3） | <¥0.01 / 次 | 每次约 3–4k token |
| 韩国案例（基础库） | ¥0 运行时 | 预烘焙进 brain.json，多次复用 |
| 刷新灵感按钮（Tavily） | ≈¥0 | 免费档 1000 credits/月，一次≈3 credits |
| 出图（按需） | 按既有月额度 | 保持"按需 + 额度 + 组合缓存"，不退回网页版每次 3 图 |

质量对齐网页版韩女搭配，运行时成本约为网页版"每次 3 图"打法的 1/30 以下。
