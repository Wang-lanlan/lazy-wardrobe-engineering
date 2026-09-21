# ADR-0017 · 跨 tab 传值用「一次性交接槽」（模块级内存单槽）

- 状态：采纳（2026-09-15，spec 0011 / 票 0011-06）
- 关联：`docs/specs/0011-manual-outfit.md`、`docs/tickets/0011-manual-outfit/06-wardrobe-compose-entry.md`、CONTEXT ③.5 第 19 条（三条平台限制）、ADR-0001（云开发库是衣橱唯一真源）

## 背景

票 0011-06 给衣橱卡片加了「搭」入口：滑到某件 → 点一下 → 进选品页（该件已预选）→ 挑完确认 →
**推荐页**的「自己搭的」区出现拼贴卡。

入口在**衣橱页**，结果要在**推荐页**，而这两页是两个 tab。于是撞上三条微信限制（CONTEXT ③.5#19）：

1. `wx.switchTab` **不能带参数**（只接受 `url`，query 被静默忽略）；
2. tabBar 页面不能用 `wx.navigateTo` 打开（会静默 fail）；
3. 路由的 `events` 事件通道**只在「上级 → 下级页面」之间成立**——选品页 emit 的 `picked`
   只能回到「开它的那一页」。衣橱页开的就回到衣橱页，而衣橱页没有「自己搭的」那一区。

所以「衣橱页开选品页 → 结果送到推荐页」这件事，**必须有一个中间落脚点**。

## 决策

新增 `utils/manualPickHandoff.js`：**模块级内存单槽**，只有 `put(ids)` / `take()` 两个操作。

```
衣橱页 onCompose → navigateTo 选品页(?item=<id>) → [events.picked] → 衣橱页 _toRecommend
  → handoff.put(ids) → wx.switchTab(推荐页)
  → 推荐页 onShow → loadItems().then(() => _takeHandoff()) → handoff.take() → 建手动卡
```

三条硬性契约（都有门：`utils/manualPickHandoff.test.js`）：

- **取即清**：`take()` 取走即置空。所以 tab 来回切不会反复重建同一张手动卡。
- **两边都存副本**：`put` 与 `take` 都不共享数组引用，调用方之后改自己的数组不影响槽。
- **空交接归一为「没有交接」**：空数组 / `null` / 非数组 / 全空值一律落 `null`，下游不必为
  「空交接」多写一个分支。

外加一条消费侧纪律（在消费方的注释里，因为它属于消费方的时序）：

- **列表没就绪时不许消费**。`loadItems()` 内部 `.catch` 吞错后仍 resolve，所以加载失败也会走到
  消费点一次；此时 `pickItems` 没值，id 解析不出任何单品、`applyManualPick` 静默早退，而槽已
  take 掉、**永不重试**。用户看到的是「点完确认什么都没发生」且毫无提示。故消费前先判
  `!this.pickItems || this.data.itemsError`，不满足就**留着槽**，等下一次 `onShow` 再消费。

## 为什么不选另外三条路

| 方案 | 为什么不选 |
|---|---|
| 全局状态 / 事件总线 / `getApp().globalData` | 它让「这次会话上一步做了什么」到处可读，是**隐式耦合**。本项目一直在避免（对比 `utils/itemFilter.js#emptyFilter()` 是工厂函数，就是为了不让两页共享同一个可变默认值）。交接槽只承载一个字段、用完即空——它是一个**通道**，不是一份可被读写的状态 |
| `wx.setStorageSync` / 落库 | 那是**持久**的。app 被杀掉后再打开，一条早该消失的选品结果会复活成「我什么时候搭过这个」的幽灵卡片；落库还要处理脏数据与清理，为一个中间结果付这个代价不值得。内存槽天然随进程消失 |
| 让选品页自己 `switchTab` 去推荐页 | 方向反了：选品页是**通用**的（推荐页与衣橱页都会开它），让它知道「结果该去哪」等于把两个入口的差异塞进它。谁开的页谁负责送回去——这也是路由事件通道本来的语义 |
| 把「自己搭的」区也搬到衣橱页 | 手动卡要和 AI 三套放在一起才有意义（同一个人像底图、同一套演绎出口、同一个额度池）；搬走会让「看效果」变成两处 |

## 影响与代价

- **多了一个模块级可变单例**（`let pending = null`）。这是本项目里**唯一**一处刻意的模块级可变状态，
  所以它必须自带 ADR（本文件），否则下一次会话读到它会以为是谁手滑写的。
- 消费侧写成了 `loadItems().then(() => this._takeHandoff())`（两处入口都如此）。这个 `.then` 的形状
  是**有语义的**：它表达「列表就绪之后才消费」。别按风格偏好把它改成不依赖顺序的写法。
- 门：`utils/manualPickHandoff.test.js`（契约）、`dev/recommend-page.test.js`（消费时序，含
  「加载失败不消费 → 下次补上」）、`dev/pick-items-page.test.js`（预选侧）、
  `dev/upload-entry.test.js` F 段（接线结构：`catchtap` 不冒泡 / 跨 tab 必须 `switchTab`）。
