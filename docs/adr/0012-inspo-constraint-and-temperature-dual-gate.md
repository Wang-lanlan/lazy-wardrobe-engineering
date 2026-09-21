# ADR-0012 — 灵感硬约束 + 气温双闸选案例

- 状态：Accepted（grill-with-docs 设计会诊定稿，2026-09-03）
- 落地状态：决策一 / 二 代码已实现并通过离线校验（T1–T10）。`WANX_KEY` 为「演绎」链路所需（详见 SETUP.md / README.md 环境变量表），与本文决策一/二无直接关联。
- ⚠️ 本文聚焦决策一（灵感硬约束）与决策二（气温双闸），二者均为**当前在用的生成硬约束**；原决策三已整体下线，不纳入本文档范围。
- 决策人：用户（A/A/A 三选）
- 上游：ADR-0008 双轨溯源、ADR-0009 单品图必须进生成、ADR-0010 气温驱动非日历、ADR-0011 平拍图录入

---

## 1. 背景与问题（两处断裂，经代码逐条确认）

问诊结论：两个问题共享一个根因——**「博主的穿搭思路」从头到尾没接进生成链路**，外带一处独立泄漏。

| 断口 | 现象 | 根因（代码定位） |
|---|---|---|
| 断口1 | 30℃ 仍注入「毛绒开衫」思路（p-010） | `recommendCore.js` 案例按**日历月份** `getSeason()` 选季；`tempBand`（气温档）只过滤衣橱单品 + 往 prompt 塞硬规则，**不重筛注入的案例** |
| 断口2 | 推荐第一套与博主思路零关联 | `promptBuilder.renderCases` 把 `transferable` 当**软文本**喂 prompt；`provenance.js` 只校验 `inspoId` 合法、**不校验 set 是否真体现该思路**；`recommendCore` 让 LLM 自由挑 id 再「建议」标 inspoId |
| 断口3 | 小程序无「把博主思路画出来」的入口 | `genLookImage` 是**孤儿函数**（pages/ 无调用）；默认 `siliconflow` 文生图——把衣服当文字让模型「画」，博主思路完全没进画面 |

---

## 2. 决策（两项全选 A）

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
| `aiRecommend/lib/slotMap.js`（类别↔角色单一真源）、`aiRecommend/lib/caseGate.js`（双闸选案例） | 新建 |

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

1. **词表归一化是双闸能否生效的隐性前提**：真实衣橱的 `fit` 是「宽松/长款」这类复合中文串，与受控枚举（`oversize/slim/regular/loose`）直接字符串比较会让闸2 判所有案例不可满足 → 决策一/二整体静默失效。必须在 `slotMap.canonicalFit` 归一化，且闸2 与 provenance 都走归一化比较。
2. **季节词表需字符级交集**：案例词表用「夏秋」（brain.json controlledVocab），而档位 `allowSeasons` 只含 春夏/春秋/秋冬/四季——精确匹配下「夏秋」案例（brain 8 条 + p-009）**在任何温度都被静默丢弃**。须改 `caseGate.seasonIntersects` 为字符级交集。

---

## 6. 验证（落地后必须有肉眼自证）

全部离线断言已通过（`node` 直接跑，无云依赖）：

| 脚本 | 断言 | 结果 |
|---|---|---|
| `aiRecommend/dev/t4-gate.test.js` | 30℃ 剔除 p-010、10℃ 注入 p-010、零案例兜底退回纯衣橱 | ✅ |
| `aiRecommend/dev/t5-provenance.test.js` | 约束三轴（结构 / 版型 / 配色）+ 三态（satisfied / not-satisfied / not-injected） | ✅ |
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

- 案例池脚注（沿用 ADR-0008）：案例池 30 · 博主 14 · 公开 4 · 新鲜 12；personal 恒 14，不与封顶名额冲突。
