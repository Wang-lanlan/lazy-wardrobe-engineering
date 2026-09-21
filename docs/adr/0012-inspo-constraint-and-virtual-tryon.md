# ADR-0012 — 灵感硬约束 + 气温双闸选案例 + 真·虚拟试衣

- 状态：Accepted（grill-with-docs 设计会诊定稿，2026-09-03）
- 落地状态：决策一 / 二 / 三 **代码已实现并通过离线校验**（T1–T10）；**唯一未闭环是凭证**——`WANX_KEY` 待用户开通并配置（T11），配好后即可真机试衣。
- 决策人：用户（A/A/A 三选）
- 上游：ADR-0008 双轨溯源、ADR-0009 单品图必须进生成、ADR-0010 气温驱动非日历、ADR-0011 平拍图录入

---

## 1. 背景与问题（三处断裂，经代码逐条确认）

问诊结论：三个问题共享一个根因——**「博主的穿搭思路」从头到尾没接进生成链路**，外带两处独立泄漏。

| 断口 | 现象 | 根因（代码定位） |
|---|---|---|
| 断口1 | 30℃ 仍注入「毛绒开衫」思路（p-010） | `recommendCore.js` 案例按**日历月份** `getSeason()` 选季；`tempBand`（气温档）只过滤衣橱单品 + 往 prompt 塞硬规则，**不重筛注入的案例** |
| 断口2 | 推荐第一套与博主思路零关联 | `promptBuilder.renderCases` 把 `transferable` 当**软文本**喂 prompt；`provenance.js` 只校验 `inspoId` 合法、**不校验 set 是否真体现该思路**；`recommendCore` 让 LLM 自由挑 id 再「建议」标 inspoId |
| 断口3 | 小程序无试衣入口；即使有按钮也不是你的衣 | `genLookImage` 是**孤儿函数**（pages/ 无调用）；默认 `siliconflow` 文生图——把衣服当文字让模型「画」；`genByAitryon`（index.js:233）是**空壳**：只传 `prompt`+`base_image_url`，**无 garment URL**，`X-DashScope-Async:'disable'` 写反（应 `enable`+轮询 `task_id`），且同步当异步用 |

---

## 2. 决策（三项全选 A）

### 决策一：transferable 升级为「生成硬约束」
把博主思路从「装饰品」变成「生成时被强制满足的结构」。

- `references/personal-cases.json` 与 `brain.json` 每个案例新增结构化 `constraints` 字段（见 §4 草案）。
- `recommendCore` 在把某案例挂到某套 set 时，必须保证该 set **结构性满足** constraints：
  - 做法一（候选池预过滤）：先用 constraints 收缩候选衣橱，再交给 LLM 挑；
  - 做法二（结构化 schema 卡 LLM）：把 constraints 写进 LLM 的强约束 schema，输出不满足即重试。
  - 两者可叠加。目标是让「挂秀智丹宁套装」的 set 必然含「1 宽松外套 + 1 修身内搭 + 1 同色下装」。
- `provenance.js` 从「校验 inspoId ∈ 注入集合」升级为「**校验 set 各项是否真满足对应 constraints**」；编造/不匹配则降级为 `FALLBACK_INSPO`（不带 url/caseId）。

### 决策二：气温双闸选案例（断口1 在 A 下升级为「不该注入」）
A 方案下硬约束会逼 AI 凑一套符合案例版型的衣服，若 30℃ 还注入 p-010 就会与温度规则打架。故注入前做两道闸：

- **闸1（季节）**：`case.season` 必须与当前 `tempBand.allowSeasons` 有交集，否则不注入（30℃→炎热，只收春夏/四季案例）。
- **闸2（可满足性）**：在 `tempBand` 过滤后的衣橱中，案例 `constraints.mustContain` 每一项都能找到对应单品，才注入。
- **兜底**：两闸过后**零案例** → 退回纯衣橱搭配（不挂任何案例约束），绝不硬塞满足不了的思路。

### 决策三：真·虚拟试衣（aitryon，用你实拍衣图穿身上）
用户愿意提供平拍图，故走真实上身而非文生图伪解。

- 用户拍平拍图 → `items.img` 填充（ADR-0011 既有方向，本次真正落地）。
- 修 `genByAitryon`：
  - 传 `top_garment_url` / `bottom_garment_url`（来自 set 单品 `img`，经 `getTempFileURL` 换临时 URL）；
  - 人像底图字段名是 **`person_image_url`**（⚠️ 会诊时记的 `base_image_url` 是错的，已按 DashScope 官方文档订正），值取 `metaDoc.refImage` 的临时 URL；
  - `X-DashScope-Async: 'enable'`，提交后**轮询 `task_id`** 拿结果（异步当同步是本次主要 bug）。
- 推荐结果页加「试衣」入口：调 `genLookImage` + 选中 set 的 `itemIds`。
  ⚠️ 实现上改为**按调用传 `provider: 'aitryon'`**（而非改环境变量 `IMG_PROVIDER`）：
  「试衣」按钮的含义因此恒为「穿你自己的衣服」，不会因改全局环境变量而把文生图链路一起变成试衣，
  也避免两套产物互相污染缓存（试衣图另走 `-aitryon` 后缀的独立缓存键）。
- `genLookImage` 在 aitryon 模式**不**把 `wish` 当文字画：做法是 aitryon 分支**根本不调 `buildPrompt`**
  （试衣只穿真实单品，种草件没有平拍图，天然不参与）。

---

## 3. 需改动文件清单

| 文件 | 改动 |
|---|---|
| `cloudfunctions/aiRecommend/references/personal-cases.json` | 14 条案例补 `constraints` 结构化字段 |
| `cloudfunctions/aiRecommend/references/brain.json` | 同补 `constraints`（保持与 personal 同构） |
| `cloudfunctions/aiRecommend/lib/recommendCore.js` | 双闸注入（闸1 季节 / 闸2 可满足性）+ 约束满足判定 + 兜底退回 |
| `cloudfunctions/aiRecommend/lib/promptBuilder.js` | constraints 进**硬约束 schema**，不再是软文本 |
| `cloudfunctions/aiRecommend/lib/provenance.js` | 约束满足性校验（替换只校验 id 的现状） |
| `cloudfunctions/aiRecommend/lib/tempBand.js` | 导出 `allowSeasons`（每档可注入的季节集合） |
| `cloudfunctions/genLookImage/index.js` | `genByAitryon` 传 garment URL + `person_image_url` + 异步轮询；aitryon 分支不调 `buildPrompt`；支持 `event.provider` 覆盖环境变量；试衣图独立缓存键 |
| `cloudfunctions/genLookImage/lib/aitryon.js` | **新建**：品类→试衣槽位映射 / 试衣单品挑选 / 入参组装 / **`extractAitryonImageUrl`**（真机坑：aitryon 响应字段是 `output.image_url` 而非 `output.results[0].url`，详见 dev 测试夹具） |
| `cloudfunctions/genLookImage/lib/lookPrompt.js` | 不改（aitryon 分支不调用它，wish 自然不进文本） |
| `pages/recommend/*` | 「试衣」按钮（`provider:'aitryon'`）+ 无可试衣平拍图时禁用并提示；`tryonable` 判定放 `utils/looks.js` |
| 环境变量 | 新增 `WANX_KEY`（DashScope）——**唯一未闭环项**，见 §5 |

新增校验脚本：`aiRecommend/dev/t4-gate.test.js`、`aiRecommend/dev/t5-provenance.test.js`、
`genLookImage/dev/aitryon.test.js`、`genLookImage/dev/e2e-aitryon.js`、`utils/looks.test.js`（补 tryonable）。
新增 `aiRecommend/lib/slotMap.js`（类别↔角色↔试衣槽位单一真源）、`aiRecommend/lib/caseGate.js`（双闸选案例）。

---

## 4. 约束 Schema（草案）

```json
{
  "id": "p-002",
  "blogger": "秀智",
  "season": "四季",
  "scene": "休闲",
  "transferable": "全身同色时将层次放进版型而非颜色：oversize 外套 + 修身内搭 + 合身长裤",
  "constraints": {
    "mustContain": [
      { "role": "outer",  "fit": "oversize", "count": 1 },
      { "role": "top",    "fit": "slim",    "count": 1 },
      { "role": "bottom", "fit": "regular", "colorMatch": "same-as-outer", "count": 1 }
    ],
    "layeringRule": "layers-in-fit-not-color",
    "colorRule": "monochrome"
  }
}
```

字段释义：
- `mustContain[].role`：`outer / top / bottom / shoes / bag / hat / accessory`（与 `constants.js` 类别枚举对齐）。
- `mustContain[].fit`：`oversize / slim / regular / loose`（来自单品 `fit` 属性）。
- `mustContain[].colorMatch`：`same-as-outer / same-as-top / any`（实现「同色」硬约束）。
- `layeringRule` / `colorRule`：供 prompt 与 provenance 双用的可读规则。

---

## 5. 开放风险（落地前必须正面回答）

1. **凭证缺口（唯一未闭环）**：aitryon 走 DashScope，需**新增 `WANX_KEY`**（阿里云百炼 key，第五项凭证）。代码已就位（缺 key 时报「未配置 WANX_KEY 环境变量」），仅差凭证。配好后再补人像底图 + 单品平拍图即可真机试衣。
2. **人像来源（已决议：不露脸全身照）**：试衣与文生图风格参考共用**同一张全身人像照**，可裁到脖子以下 / 背影 / 遮挡，**不要求露脸**。理由：① 露脸无额外 API 金钱代价（aitryon 按次计费，与是否露脸无关），但有三类隐性代价——隐私（人脸属生物信息，上传至 DashScope 第三方服务器）、效果（虚拟试衣模型脸部身份还原弱，露脸常生成不像你 / 扭曲的脸反减分）、合规（露脸图分享涉肖像权）；② 不露脸让模型专注衣服版型 / 搭配，效果更好更干净。采集：不要求本人出镜，可改用**模特 / 素材图作底图**，但底图人物的身高 / 体重 / 肩宽 / 肤色须与用户一致才有参考价值——aitryon 保留底图身材，底图身材直接决定试衣结果是否可信。正面图非必需，背影 / 侧身 / 遮挡 / 裁到脖子以下均可（脸本就不要求）。来源二选一：① 用户自选一张符合自身身材的模特图上传；② 系统预置少量按身材标签（身高 / 体重 / 肩宽 / 肤色）索引的基模图库，用户挑最接近者。`metaDoc.profile` 须含身高 / 体重 / 肩宽 / 肤色字段，既作文生图链路描述、也作基模图匹配依据。
3. **品类映射**：aitryon 的 `top/bottom_garment_url` 要求单品有 top/bottom 品类标签，`constants.js` 类别枚举需能映射到这两个槽位。
4. **拍摄规范（要求已明确，待用户执行）**：DashScope 对服装图有硬要求——**一件一图**、完整入镜、**背景干净、留白少**、JPG/JPEG/PNG/BMP/HEIC、5 KB–5 MB、边长 150–4096 px；人像底图须「恰好一个完整的人」。已写入 README「开启试衣」章节。**待办：给要试穿的单品补齐平拍图（否则按钮禁用）。**
5. **aitryon 只换两件衣**：接口只接受 1 张 `top_garment_url` + 1 张 `bottom_garment_url`，所以「外套 + 内搭 + 长裤」这类三层搭配只能试穿其中两件（实现上**优先外套**作为上衣，外套缺失时退回内搭）。这是模型能力边界，不是 bug；真机验证时需留意三层搭配的还原度。

---

## 6. 验证（落地后必须有肉眼自证）

全部离线断言已通过（`node` 直接跑，无云依赖）：

| 脚本 | 断言 | 结果 |
|---|---|---|
| `aiRecommend/dev/t4-gate.test.js` | 30℃ 剔除 p-010、10℃ 注入 p-010、零案例兜底退回纯衣橱 | ✅ |
| `aiRecommend/dev/t5-provenance.test.js` | 约束三轴（结构 / 版型 / 配色）+ 三态（satisfied / not-satisfied / not-injected） | ✅ |
| `genLookImage/dev/aitryon.test.js` | 品类槽位、试衣单品挑选（外套优先 / 缺图降级 / 非衣类排除）、入参组装 | ✅ |
| `genLookImage/dev/e2e-aitryon.js` | 真实发出 `person_image_url` + `top/bottom_garment_url`、`X-DashScope-Async: enable`、按 `task_id` 轮询、独立缓存键、无平拍图友好报错、未指定 provider 回落环境变量 | ✅ |
| `utils/looks.test.js` | `tryonable`（上/下装 + 已拍平拍图，缺一不可） | ✅ |
| `aiRecommend/dev/realdata-gate.test.js` | **用真实种子数据跑双闸**（54 件单品 / 24 条案例），防合成夹具词表失真 | ✅ |
| `aiRecommend/lib/index.integration.test.js` | mock-LLM 全链路：双闸筛 4 条（personal 优先）+ 2 套真满足硬约束的方案溯源可验证 | ✅ |

**落地后追加的两处词表修复（全量回归 18/18 绿）**：
1. **fit 复合中文归一化**：真实衣橱 fit 是「宽松/长款」「直筒/长款」这类复合串，与受控枚举
   （oversize/slim/regular/loose）直接字符串比较会让闸2 判所有案例不可满足 → 决策一/二整体静默失效。
   已在 `slotMap.canonicalFit` 归一化，闸2 与 provenance 均走归一化比较；`realdata-gate.test.js` 守卫。
2. **闸1 季节字符级交集**：案例词表用「夏秋」（brain.json controlledVocab），而档位
   `allowSeasons` 只含 春夏/春秋/秋冬/四季——精确匹配下「夏秋」案例（brain 8 条 + p-009）
   **在任何温度都被静默丢弃**。已改 `caseGate.seasonIntersects` 为字符级交集
   （夏秋∩春夏=夏、夏秋∩秋冬=秋），修复后 p-009 在 30℃/10℃ 均恢复注入；断言进 `realdata-gate.test.js`。

**待真机验证（需 `WANX_KEY`）**：推荐结果页「试衣」按钮点下去，生成图上穿的是该套**实拍单品**而非模型想象。
- 案例池脚注（沿用 ADR-0008）：案例池 30 · 博主 14 · 公开 4 · 新鲜 12；personal 恒 14，不与封顶名额冲突。

---

## 7. 附录（2026-09-03 真机三连反馈：露脸照 / 案例全丢 / 试衣效果差）

**症状**：用户一次贴出三条反馈——①试衣图用的是露脸自拍当模特底图；②三套穿搭思路全变
「通用韩系原则，无特定参考」（韩女博主案例注入却没体现）；③试衣上身效果差。

**修复 1 — 人像底图 type 防御（露脸照）**：档案参考照引入 `refImageType ∈ {self, model, reference, tryon-model}`，
默认 `self`（旧数据同样按 self 保守处理）。全链路 fail-closed：
- 前端 `utils/looks.js lookTryonable`：meta 缺失 / self / 空对象 → 一律禁试衣（**不再保留「无 meta 即放行」的宽容默认**——meta 是异步加载的，宽容分支会把未返回窗口期的自拍喂给模型）；
- `recommend.js onGenImage`：非模特类型先弹窗引导去档案页切换；
- 云函数 `genLookImage/index.js §4`：仅 `model/reference/tryon-model` 才 `getTempFileURL` 作 `person_image_url`，否则抛分类型中文错误；
- 守卫：`genLookImage/dev/e2e-aitryon.js` 场景 D/E（self / 老数据未标类型均被挡回）。
- 档案 UI 配套「参考照类型」切换（切 model 若有旧自拍先删云文件再置空）。

**修复 2 — 溯源自动映射改「结构优先」（案例全丢）**：`provenance.js autoMapLook` 顺序翻转。
旧实现让 `matchCase`（受控词文本重叠 ≥ THRESHOLD）当闸门——真实 LLM 的 reason 是自创措辞、
不照抄案例 transferable 词 → 文本重叠常不足 → 返回 null → 永远走不到约束校验 → 注入案例全白搭。
新实现把 ADR-0012 决策一「参考了该案例 = set 真穿出了它的 mustContain 结构」当**主闸**：
先把本轮注入且被该 look 结构满足的案例筛出来，文本重叠只做并列候选的次级排序（+场景/季节分，
同分保注入序 personal 优先）。诚实性不变量不变：只在 usedCases 里选、必须真满足约束、
无候选仍诚实降级。**新守卫 `dev/realdata-automap.test.js`**（真实种子 54 件 / 24 案例）：
忠实 look（穿齐公式、inspoId 留空、reason 自创）必须找回注入案例（4 场景 12/12），
随机稀疏 look 必须保持 no-ref。
- 观察：p-001/p-007 与 p-002/p-004 是**结构孪生案例**（mustContain 完全一致，仅 colorRule 不同），
  同套 look 同时满足时映射到注入序前者——诚实但提示案例库可合并去重（未处理）。

**试衣效果差 — 记录与对策（暂不改码）**：aitryon 上身「能穿但糙」是**模型能力边界 + 输入质量**
两件事，非 bug，代码层没有银弹：
1. **拍图规范决定上限**：AI 生成图/翻拍图做 garment_url 会直接劣化。要试穿的单品必须按
   README「开启试衣」规范重拍：一件一图、完整入镜、背景干净留白少、正面对称、光线均匀（忌褶皱阴影）。
2. **aitryon 只换 top+bottom 两件**：内搭换不掉是接口边界（外层优先占 top 槽），三层搭配
   （外套+内搭+裤）必然只能还原两层——这是预期行为，不是效果 bug。
3. **模型升级路径（已落地 env 开关）**：DashScope 有 aitryon-plus（质量更高），90 天免费额度各 400 张。
   先按规范重拍验证 aitryon 效果基线，仍不满意再切：`genLookImage` 云函数加环境变量
   `AITRYON_MODEL=aitryon-plus` 即可，无需改逻辑。已实现两处：
   - `lib/aitryon.js buildAitryonInput()` 的 `model: process.env.AITRYON_MODEL || 'aitryon'`；
   - `index.js` 缓存键在切模型时带后缀（`-aitryon-plus`），**否则会命中旧模型缓存图，表现为「部署了但没变化」**
     （默认 `-aitryon` 键不变，现有缓存不浪费）。
   切换后记得清一次 genCache 里旧的 `-aitryon-plus` 记录对应的云端文件（若该键已有缓存）。
4. **人像底图**：背影/侧身/不露脸素材均可，但姿势与体型越接近越稳；与风格参考共用单张。

## 8. 附录二（2026-09-03 真机二轮反馈：「档案里没有试衣模特图」）

**症状**：用户在「试衣模特图」上传一张截掉头部的模特照，点了推荐页「试衣」按钮，
提示「档案里没有标记为『试衣模特图』的参考照（请上传一张不露脸的模特/素材图，
并把类型改为『试衣模特图』）」——但他**已经传过图、也切过类型**。

**两层 bug 套娃**：

1. **前端 `onSetRefType` 副作用反了**：旧的实现里，「切到 model」时如果已有 refImage，
   会强制调 `deleteFile` 并把云端 `refImage` 字段置为 null。设计意图是"用户上传的是自拍，
   切到 model 时应当换成模特图，先把旧自拍删掉提醒重传"——但反直觉、且实际效果是：
   用户**先上传了模特图**（refImage=新 fileID）→ 再点切类型（已经是模特照，不需要再传）→
   弹窗误导「旧照会被移除，请稍后上传新图」→ 用户确认 → **刚上传的图被删、类型倒成了 model**。

2. **多 meta 文档并存下读错**：`db.collection('meta').orderBy('_id','asc').limit(1)`
   只读最早那条；老条目没 `refImage`/`refImageType` 字段（这两个字段是后加的），用户后来
   编辑/上传的是新一条——结果「云函数读到的 meta」与「用户实际编辑的 meta」不一致。
   用户提示因此落在 `isUnknown` 分支（`!t || t 不在允许列表`），看上去像"什么都没传"。

**修复**：
- **去掉反直觉副作用**：`pages/profile/profile.js` `onSetRefType` 只改 `refImageType` 字段，
  `refImage` 不动；若切到 model 还未传图，云函数侧的 refUrl=null 防御会精准给出
  「图还没传」的提示。
- **meta 多文档自愈**：`genLookImage/index.js` 与 `utils/api.js` 的 `getMeta` 同步改为
  「取全部 → 优先选含 `refImage` 或 `refImageType` 字段的 → 并列时 `_id` 大的优先」。
- **错误提示按 hasRefImage 分支**：`genByAitryon` 给出三个分支——「图已有但类型未标」/
  「图未传」/「类型是 self（自拍）」——用户拿到精准文案后不用猜。
- **守卫**：`genLookImage/dev/e2e-aitryon.js` 场景 F（多 meta 文档应自愈到新版）+ 场景 G
  （图已有但类型未标，提示应说「已有一张参考照」而非诱导重传）。

**回归**：e2e 场景 A–G 默认/plus 模式全绿；aiRecommend 全套守卫零扩散；
`utils/looks.test.js` 试衣可行性 fail-closed 全绿。

## 9. 附录九（2026-09-03 傍晚三轮反馈：「换了模特图，试衣还是之前的模特图」）

**症状**：用户在「档案」页重新上传了一张模特图（换人像），回到推荐页对同一套搭配再点
「试衣」，出来的仍是旧模特的脸；换完图「好像没生效」。

**两层 bug 叠加，症状同源**：

1. **试衣缓存键缺「人像指纹」**：`genCache` 键 = 搭配 + 场景 + 种草件 + 模型名（`-aitryon` /
   `-aitryon-plus`），**不含用的是哪张人像底图**。换模特图只是换了 `meta.refImage` 的 fileID
   （上传路径带 `Date.now()`，必为新 fileID），而键不变 → 同套搭配第二次试衣直接命中旧缓存，
   返回旧模特图。与「切模型不换键 → 命中旧模型缓存图」是同一家族事故（PROMPT_VERSION 教训的
   数据侧版本：**影响画面的输入变了就必须换键**，不限于改代码/改模型）。
2. **页面 keeps 的 genImage 让「试衣」静默 no-op**：`pages/recommend/recommend.js onGenImage`
   有 `if (look.genImage) return` 的防重复扣费闸；用户在档案页换图后切回推荐 tab，looks 仍在
   内存且 `genImage` 已存在 → 点「试衣」**什么都不发生**，界面还停着旧图，观感=「换不过来」。

**修复（双端各守一层，互不依赖）**：
- **云函数端（根治缓存）**：`lib/aitryon.js` 新增纯函数 `personSalt(refImageFileID)`（fileID 的
  md5 前 12 位；空值返回 `'noperson'` 防御）；`genLookImage/index.js` 把 meta 读取**前置**到缓存
  查询之前（人像指纹来自 meta.refImage，不先读就凑不出键；metaDoc 反正额度/人像/档案都要用），
  aitryon 键 = `baseKey + '-' + AITRYON_MODEL + '-' + personSalt(meta.refImage)`。
  换图 = 新 fileID = 新盐 = 必然重出；**无需人工 +1**（与 PROMPT_VERSION 的「改逻辑 +1」不同）。
  副作用：所有存量试衣缓存键变化，首次会各重出一张（一次性成本，属预期）。
- **前端（修复观感）**：`pages/recommend/recommend.js loadMeta()` 记录人像指纹
  `meta.refImage`；tab 每次 onShow 比较，指纹变化就把本页所有 `genImage` 清空并提示
  「模特图已更新，可重新试衣」——「试衣」按钮恢复可点。只切 `refImageType`（self↔model）
  不换图 → 指纹不变 → 旧图仍有效、不白费一次生成额度。

**守卫**：
- `aitryon.test.js`：personSalt 单测（同 fileID 稳定 / 异 fileID 必异 / 空值 noperson）。
- `e2e-aitryon.js` 场景 H：同套搭配先出图，换 `meta.refImage` 后第二次调用必须
  `cached=false` 且落盘路径（缓存键）不同——旧键缓存还在场，也不得命中。

**回归**：genLookImage T7 纯逻辑 + e2e 场景 A–H（默认/plus）全绿；lookPrompt 11/11 零扩散。
**待办**：重新上传部署 `genLookImage`（键逻辑在云函数内），前端 `recommend.js` 随主包发布。
