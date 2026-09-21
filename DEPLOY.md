# 部署操作清单（Deployment Checklist）

> 适用：`wardrobe-miniapp` 的「统一大脑 + 韩国案例 grounding」方案（ADR 0007）。  
> 全部代码已在本地验证（Part 1–7 验证门全绿），本清单只负责把它**部署到云开发并启用**。  
> 逐条勾选，遇到 ⚠️ 步骤先确认再继续。

---

## 0. 前置条件

- [x] 微信开发者工具已安装，且能打开本 `wardrobe-miniapp` 项目
- [x] 云开发环境已开通，环境 ID = `cloudbase-xxxxxxxx`（AppID `wxdxxxxxxxxxxxx`，均已脱敏，部署时替换为你自己的）
- [x] 已开通「云函数」与「云数据库」能力
- [x] 准备凭据：`SILICONFLOW_KEY`（**必填**）、`TAVILY_KEY`（仅启用刷新按钮时填）
- [x] 已确认两个云函数目录存在：`cloudfunctions/aiRecommend/`、`cloudfunctions/refreshCases/`

---

## 1. 部署主推荐云函数 `aiRecommend`（必做）

> 作用：加载大脑（8 章规则 + 韩国案例）→ 组 prompt → 调 LLM → 返回带 `inspo` 的 3 套方案。

- [x] 开发者工具左侧「云开发」→ 确认环境已选 `cloudbase-xxxxxxxx`（已脱敏）
- [x] 在文件树 **右键 `cloudfunctions/aiRecommend`** → 「上传并部署：云端安装依赖」（不要选「不上传 node_modules」以外的异常项）
- [x] 上传完成后，**右键 `aiRecommend`** → 「配置/详情」→「环境变量」→ 填入下表：

| 变量名                      | 必填 | 取值                             | 说明                                                       |
| ------------------------ | -- | ------------------------------ | -------------------------------------------------------- |
| `SILICONFLOW_KEY`        | ✅  | 你的硅基流动 key                     | 真实 LLM 调用；缺它会直接报错                                        |
| `TEXT_PROVIDER`          | ⬜  | `siliconflow`（默认）或 `cloudbase` | 留空走硅基流动                                                  |
| `SF_TEXT_MODEL`          | ⬜  | `deepseek-ai/DeepSeek-V3`（默认）  | 极便宜，单次 <¥0.01                                            |
| `CB_TEXT_MODEL`          | ⬜  | 仅 `TEXT_PROVIDER=cloudbase` 时填 | 云开发 AI 模型名                                               |
| `BRAIN_URL`              | ⬜  | 空即可                            | **v1 已随包内置 `references/brain.json`，不配也能用完整大脑**（四级降级本地保底） |
| `BRAIN_FILE_ID`          | ⬜  | 空即可                            | 云存储兜底副本，无则跳过该层                                           |
| `USE_FRESH_CASES`        | ⬜  | 空（先不填）                         | 启用「刷新灵感」叠加层时填 `1`（见第 3 步）                                |
| `FRESH_CASES_COLLECTION` | ⬜  | `freshCases`（默认）               | fresh 案例库集合名，一般不用改                                       |

- [x] 保存环境变量后，**再右键 `aiRecommend` → 上传并部署一次**（让环境变量生效）
- [ ] 冒烟测试：小程序里随便选场景生成一次，确认能返回 3 套方案、且界面出现「✨ 灵感来源：…」（说明 `inspo` 已透传）

---

## 2. 开通云数据库集合（仅启用按钮时需要）

> `refreshCases` 把新鲜案例写进云库，`aiRecommend` 读它叠加。不启用按钮可跳过。

- [x] 云开发控制台 →「数据库」→ 新建集合 **`freshCases`**（权限设为「仅创建者可读写」即可，自用）
- [ ] 集合结构：`doc('current')` 存一份 `{ cases: [...], updatedAt, season, count }`，代码会自动 upsert，无需手动建字段

---

## 3. 部署「刷新灵感」按钮链路（可选，按需做）

> 作用：点按钮 → `refreshCases` 调 Tavily 免费档抓当下韩国案例 → 写 `freshCases` 库 → 下次推荐叠加。  
> 成本：Tavily 免费档 1000 credits/月，自用实际 ≈¥0。

- [x] **先完成第 2 步**（建好 `freshCases` 集合）
- [x] 右键 `cloudfunctions/refreshCases` → 「上传并部署：云端安装依赖」
- [x] 右键 `refreshCases` → 环境变量 → 填：
  - [x] `TAVILY_KEY` = 你的 Tavily API key（**必填**，否则调用直接返回「未配置」错误）
  - [ ] `FRESH_CASES_COLLECTION` = `freshCases`（默认，一般不改）
- [x] 保存后**再上传并部署一次 `refreshCases`**
- [ ] 回到 `aiRecommend` 环境变量，**新增 `USE_FRESH_CASES=1`** → 保存 → **再上传并部署一次 `aiRecommend`**
- [x] 小程序推荐页应出现「🔄 刷新灵感」按钮；点一下 → 等 2–4 秒 → 下次生成即叠加当下案例

---

## 4. 首次真实验证（务必做）

- [ ] 主链路：生成一次，确认 `inspo` 字段出现且是真实案例来源（如「新浪《…》公式一」），不是「通用韩系原则」占位（占位说明该场景没匹配到案例，属正常）
- [ ] 按钮（若启用）：点「刷新灵感」后生成一次，确认方案里出现最近抓到的新鲜案例来源
- [ ] ⚠️ **Tavily 质量陪验**：首次启用按钮后，把一次生成结果贴给我，我帮你判断案例质量——若太水，按 ADR 预案降级为「只出趋势词、不进主案例库」

---

## 5. 回滚 / 故障处理

| 现象                        | 处理                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------- |
| 生成报错「未配置 SILICONFLOW_KEY」 | 检查 `aiRecommend` 环境变量是否填对并重新部署                                                      |
| `inspo` 全显示「通用韩系原则，无特定参考」 | 正常（场景无匹配案例）；想要更多可刷新大脑或点按钮                                                           |
| 按钮点了无效果                   | 确认 `USE_FRESH_CASES=1` 已设且 `aiRecommend` 已重新部署；确认 `freshCases` 集合已建、`TAVILY_KEY` 已填 |
| 整个大脑拉不到                   | 已四级降级（URL→本地包→云存储→内置），最坏退化为内置 6 条原则，**主功能不崩**                                       |
| 想退回旧版                     | 云函数可「版本管理」回滚，或直接 git 还原 `aiRecommend/index.js`                                      |

---

## 6. 后续维护

- [ ] **换季刷新案例库**：把 `references/brain.json` 的 cases 更新后，重新部署 `aiRecommend`（本地包即生效，无需 URL）
- [ ] **规则升级**：改 `brain.json` 的 `rules.chapters` → 重新部署 `aiRecommend`
- [ ] **Tavily 额度**：自用几乎不会超免费档；若超，单价 ≈¥0.17/次，仍可控
- [ ] 小程序与 ootd 技能共用同一份 `brain.json`，改一处即两端同步（已收口，不再漂移）
