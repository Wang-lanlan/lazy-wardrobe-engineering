# ADR 0011 — 衣橱录入升级为「拍照 + AI 预填 + 确认」

- 状态：**已实施（2026-09-02）**，录入页已接 AI 预填 + 厚度/标签字段；recognizeItem 云函数已建（未部署验证）
- 关联：ADR 0009（单品实物图不进生成链路 / 拼贴为主 + 试衣试点）、ADR 0010（温度驱动 / 依赖单品 season 标签准确）

## 背景（为什么不再用手动表单）

1. **手动录入太烦**：单品有 category / season / material / color / fit / scene / tags 等多个字段，
   一件件手动区分（尤其"这件是春秋还是四季""加绒还是薄"）是重度负担，使用者明确拒绝。
2. **54 件单品 `img` 全为 null**（云端真源 `seedImport/items.json`），拼贴/试衣/识别都缺素材。
3. **标签不准会污染过滤逻辑**（ADR 0010）：风衣误标「春秋」→ 偏热档误放；加绒卫衣误标「四季」→ 炎热档误放。
   根因是"人手动标"既烦又易错。

## 决策

衣橱录入从「手动填表单」升级为：

```
拍照 → 上传云存储 → recognizeItem 云函数 → 硅基流动 Qwen-VL 提取结构化属性
     → 前端预填单品表单 → 使用者确认/微调 → 落库
```

**关键约束：AI 预填 ≠ AI 独裁。** `season` 与「厚度/加绒」标签由使用者**最后拍板**，
AI 只给建议、不自动落库。原因：`season` 是 ADR 0010 过滤逻辑最依赖的字段，AI 标错比人标错更隐蔽。

## 技术可行性（已查实）

- 硅基流动提供视觉模型 **`Qwen/Qwen3-VL-8B-Instruct`**（及 32B/72B 系列），OpenAI 兼容 `chat/completions` 端点
  `https://api.siliconflow.cn/v1`，复用现有 `SILICONFLOW_KEY`，**零新增凭证/成本**。
- 单张图识别约 1–2k tokens，按 ¥4.13/M tokens 计，单次成本可忽略。
- 微信云存储 fileID → `cloud.getTempFileURL` 拿临时 URL → 作为 `image_url` 传给模型
  （临时 URL 调用时有效即可；或 base64 直传，但 33% 体积膨胀，优先用 URL）。

## 识别范围（视觉可靠 vs 不可靠，决定哪些字段自动填）

| 可靠性 | 字段 | 处理 |
|---|---|---|
| ✅ 可靠（视觉特征） | category、color、material 大类、fit 版型、是否连帽 | AI 自动填，使用者确认即可 |
| ❌ 不可靠（非图像特征） | **season**、**厚度/加绒（tags）** | AI 只给建议，**强制使用者选择**后才落库 |

## 一次拍照，四处受益（与 ADR 0009 / 0010 的协同）

| 受益项 | 来源 |
|---|---|
| 单品实物图 `img` | 拍照本身（解决 ADR 0009 的 54 件无图） |
| 拼贴真实素材 | 同一张 `img`（ADR 0009 拼贴为主） |
| 试衣素材（若平拍） | 同一张 `img` 满足 aitryon 平拍要求（ADR 0009 试点） |
| 结构化属性自动填 | Qwen-VL 提取，根治手动标错（ADR 0010 标签陷阱） |

## 不做的

- ❌ AI 全自动免确认直接落库（season/厚度隐患不可发现）
- ❌ 在 `tempBand` 里继续堆维度补丁（标签来源改为 AI 提取后，标签级排除逻辑保留当兜底即可）

## 照片形态（已定：统一平拍）

所有单品按试衣标准**平拍**：单件铺开、背景干净、四周少留白（满足 aitryon 平拍要求）。
一张照片同时是实物图 + 拼贴素材 + 试衣素材 + 识别源，四处受益闭环。

平拍硬指标（来自 aitryon 官方 + ADR 0009）：
- 服饰平铺、单一主体且完整
- 背景干净，四周不宜留白过多
- 5KB–5M，边长 150–4096，jpg/png/jpeg/bmp/heic
- 只能走 HTTP/HTTPS 链接（拍完传云存储）

## 实施步骤

1. 新建 `cloudfunctions/recognizeItem/index.js`：fileID → tempURL → Qwen-VL（chat/completions，
   强制 JSON 输出）→ 解析容错 → 返回结构化属性。
   - 复用 `SILICONFLOW_KEY`，端点 `https://api.siliconflow.cn/v1/chat/completions`，模型 `Qwen/Qwen3-VL-8B-Instruct`（默认回退链含 32B）。
   - system 要求只输出 JSON（category/color/material/fit/hat/season/tags），并给受控枚举约束
     （category 必须是 CATS 之一，season 必须是 {春夏,四季,春秋,秋冬} 之一）。
   - 容错：模型偶尔返回 ```json 包裹，需剥壳；解析失败返回空建议而非报错。
2. 平拍引导 UI：单品编辑页拍照前展示平拍标准（单件铺开/背景干净/少留白），降低不合格率。
3. 单品编辑页：拍照/选图 → 上传云存储 → 调 recognizeItem → 预填表单；
   `season` 与 `厚度/加绒` 字段预填但高亮「待你确认」，保存前校验非空（防 AI 标错落库）。
4. `lib/recognizeItem.test.js`：JSON 解析容错（markdown 包裹、字段缺失降级）。
5. 识别结果建议缓存（同一 fileID 不重复调），控制调用次数。

## 验证优先级

**先建 recognizeItem 做识别 PoC**（调一次 API 看 JSON 输出准不准），再接前端——
识别准度是整条链前提，且验证成本最低（一次 API 调用），避免先改 UI 才发现识别不准返工。

## 何时重开

- 使用者反馈「识别不准」→ 调 prompt 或换更大 VL 模型（如 Qwen3-VL-8B → 32B/72B）
- 试衣试点启动 → 照片形态必须统一为平拍（见待定）

## 实施记录（2026-09-02）

三岔路已按使用者拍板落地：
- **防晒衣** → 沿用「外套 + 防晒标签」方案（不新增品类）。录入页加 `tags` 多选（防晒/连帽）；`tempBand` 的防晒例外仍读 `tags['防晒']`，未动。
- **薄厚** → 独立字段 `thickness`（薄/适中/厚/加绒），不走 tags。`tempBand.isCategoryForbidden` 改为同时读 `item.thickness`（`hasThickness` 辅助），炎热档 `薄` 放行、`厚/加绒` 视为保暖型被禁。
- **AI 识别** → 新建 `cloudfunctions/recognizeItem`（默认 `Qwen/Qwen3-VL-8B-Instruct`，复用 `SILICONFLOW_KEY`）；纯逻辑拆 `lib/recognizeCore.js`（`normalize` 受控词归一化 + 别名映射，13/13 单测）；录入页拍照后「✨ AI 识别并预填」→ 调 `api.recognizeItem` → 预填表单（`season/厚度` 高亮待确认）。

改动文件：
- `utils/constants.js`：新增 `THICKNESS`/`TAGS` 枚举并导出。
- `cloudfunctions/aiRecommend/lib/tempBand.js`：加 `hasThickness`，轻薄/保暖判定兼读 thickness 字段。
- `pages/item-edit/{js,wxml,wxss}`：厚度下拉、标签多选、平拍引导、AI 识别按钮、预填提示。
- `utils/api.js`：加 `recognizeItem` 封装。
- `cloudfunctions/recognizeItem/{index.js,package.json,lib/recognizeCore.js,lib/recognizeCore.test.js}`：新云函数。

⚠️ 待办：recognition 云函数需**部署**（云端安装依赖模式）后才可在真机触发；识别准度需一次真机拍照验证（PoC 门槛，ADR 0011 验证优先级）。

## 首次真机故障修复：「取临时链接失败」（2026-09-02 晚）

**现象**：录入页点「✨ AI 识别并预填」，toast 显示 `识别失败：取临时链接失败…`（被截断，看不到真病因）。

**根因：参数契约不一致，两层各包了一次。**

- `utils/api.js` 写成 `const recognizeItem = fileID => call('recognizeItem', { fileID })`（散参风格）；
- 而 `item-edit.js` 按 payload 风格调 `api.recognizeItem({ fileID })`；
- 云函数于是收到 `{ fileID: { fileID: 'cloud://...' } }`，把这个**对象**塞进 `getTempFileURL` 的 `fileList`。
  SDK 的 `fileList` 元素支持两种形态：**字符串**，或 `{fileID, maxAge}`（此时 `maxAge` 必填）。
  传了缺 `maxAge` 的对象 → 参数校验直接抛错 → 被 catch 成「取临时链接失败」。

> 对照：`genLookImage` 同样调 `getTempFileURL`，但传的是字符串 `[metaDoc.refImage]`，所以只有 recognizeItem 挂。

**次级问题（让排查变难的元凶）**：`wx.showToast` 的 `title` 超过约 14 个汉字会被**静默截断**，
`识别失败：取临时链接失败：<真病因>` 正好把真病因截没了。长错误必须用 `showModal`。

**修复**：
1. `utils/api.js`：`recognizeItem` 改为 **payload 直传**（与 `recommend`/`genLook` 一致），并写注释钉死这个坑。
2. `lib/recognizeCore.js`：新增纯函数 `pickFileID(event)` —— 剥开嵌套对象/数组拿裸字符串，
   且**只认 `cloud://`**，`wxfile://` 本地临时路径在发起云调用前就拒绝（附带说明性错误文案）。
3. `index.js`：改用 `pickFileID`；`getTempFileURL` 返回后**检查 `status`/`errMsg`** 并带进错误信息
   —— 原来只判空会把「文件不存在/不属于本环境/无权限」吞成一句无信息的「临时链接为空」
   （与高德天气「HTTP 200 + status:0」同构的吞病因问题）。
4. `pages/item-edit/item-edit.js`：识别失败统一走 `recognizeFail()` → `wx.showModal` 显示完整错误 + `console.error` 留全量对象。

**测试**：
- `lib/recognizeCore.test.js` 10 → **13 组**（新增 pickFileID 正常/嵌套故障回归/拒绝本地路径三组）。
- 新增 `dev/e2e-recognize.js`（**4/4**）：用 `Module._load` 劫持 `wx-server-sdk` 与 `https`，
  端到端跑 `main()` 并断言「真正传给 `getTempFileURL` 的 `fileList` 是字符串数组」。
  这类参数形态 bug 纯函数单测照样能全绿放过去，必须有这层验证。

## 二次真机故障修复：「HTTP 403」（2026-09-02 晚）

**现象**：修好取链接后，识别走到硅基流动请求，报错 `硅基流动请求异常：HTTP 403…`
（「轨迹六点」是「硅基流动」的误识；toast/modal 截断了错误体，看不到硅基流动原始码）。

**根因：视觉模型 403，不是 key 问题。**
- `aiRecommend` 用**同一个 `SILICONFLOW_KEY`** 调**文本模型**成功 → key 有效、有余额、授权正常。
- 403 是**视觉模型专属**：硅基流动对 `Qwen/Qwen2.5-VL-72B-Instruct` 这类大模型要求
  「账号已激活/有余额」，没开就 403（`{"code":20003,"message":"The model does not exist"}`
  或权限类错误）。原代码把模型**写死成 72B**，所以稳定 403。

**修复（改成模型回退链 + 错误信息带原始码）**：
1. `index.js`：`SF_VL_MODEL` 单值 → `SF_VL_MODELS` 数组（默认
   `Qwen/Qwen2.5-VL-7B-Instruct,Qwen/Qwen2.5-VL-72B-Instruct,Qwen/Qwen2-VL-7B-Instruct`），
   **先试免费倾向的 7B，再试 72B**；可用环境变量 `SF_VL_MODELS`（逗号分隔）覆盖，无需改代码即可换成账号已开的模型。
2. 去掉 `response_format: {type:'json_object'}` —— 部分 VL 模型会因此对 json_object 直接拒绝（400/403），
   改由 SYSTEM 提示词约束 + `recognizeCore.stripFences` 兜底解析。
3. `bySiliconFlowVL` 逐个尝试，`403/429/业务错误` 不致命、记下一个模型；全部失败抛出
   **聚合错误**（含每个模型的真实错误码，如 `The model does not exist`），便于一眼看出是「模型未开放」还是「key 问题」。
4. `dev/e2e-recognize.js` 4 → **6 组**：E（首个模型 403 → 自动切下一个成功，attempts=2）、
   F（全 403 → 聚合错误含原始码 `The model does not exist`）。

**⚠️ 逃生舱**：若你账号连 7B 都 403，modal 会显示 `所有视觉模型均失败（...）：[...] HTTP 403：<硅基流动原始码>`。
此时去云函数环境变量把 `SF_VL_MODELS` 改成你账号**已开通**的视觉模型（控制台「模型」页可查）。
识别准度 PoC 仍待一次真机拍照验证。

## 三次真机故障修复：400 Model does not exist（2026-09-02 晚）

**现象**：部署二次修复的回退链后，弹窗显示：

```
AI 识别失败
所有视觉模型均失败
（Qwen/Qwen2.5-VL-7B-Instruct / Qwen/Qwen2.5-VL-72B-Instruct / Qwen/Qwen2-VL-7B-Instruct）：
[Qwen/Qwen2-VL-7B-Instruct] HTTP 400：Model does not exist. Please check it carefully.
```

**根因：Qwen2.5-VL / Qwen2-VL 系列在硅基流动已 Deprecated，不是 key/权限问题。**
- 登录硅基流动模型页核实：
  - `Qwen/Qwen2.5-VL-72B-Instruct` → State **Deprecated**
  - `Qwen/Qwen2.5-VL-7B-Instruct` → State **Deprecated**
  - `Qwen/Qwen2-VL-7B-Instruct` → 同样不可用
- 当前 **Available** 且 **Support image input** 的是 **Qwen3-VL** 系列：
  - `Qwen/Qwen3-VL-8B-Instruct`（$0.18/$0.68 per M tokens）
  - `Qwen/Qwen3-VL-32B-Instruct`（$0.20/$0.60 per M tokens）
  - `Qwen/Qwen3-VL-72B-Instruct` 等同系列
- 所以无论 key 有没有权限，旧模型 ID 都会返回 `HTTP 400 Model does not exist`。

**修复（默认回退链切到 Qwen3-VL 系列）**：
1. `cloudfunctions/recognizeItem/index.js`：默认 `SF_VL_MODELS` 从
   `Qwen/Qwen2.5-VL-7B-Instruct,Qwen/Qwen2.5-VL-72B-Instruct,Qwen/Qwen2-VL-7B-Instruct`
   改为 **`Qwen/Qwen3-VL-8B-Instruct,Qwen/Qwen3-VL-32B-Instruct`**。
   - 先 8B（最便宜、响应快），再 32B（准度更好）。
   - 仍可用环境变量 `SF_VL_MODELS` 覆盖，无需改代码。
2. ADR 0011 正文中「技术可行性」与「实施步骤」里的模型名同步改为 `Qwen/Qwen3-VL-8B-Instruct`。
3. 保留 `dev/e2e-recognize.js` 的 6 组断言不变（回退链长度仍为 2，attempts=2 仍成立）。

**待验证**：重新部署 `recognizeItem` 云函数 + 上传前端，真机拍一张平铺单品照做识别 PoC。

## 四次真机故障修复：客户端 3 秒硬超时（2026-09-02 晚，v3→v4）

**现象**：Qwen3-VL 模型切换后弹窗再次变化：

```
AI 识别失败
cloud.callFunction:fail Error: errCode: -504003
errMsg: invoking task timed out after 3 seconds
https://docs.cloudbase.net/error-code/basic/FUNCTIONS_TIME_LIMIT_EXCEEDED
callID: 1788354621747
trace: 21:10:21 start->21:10:24 normal poll->21:10:27 system error
```

**根因：客户端 `wx.cloud.callFunction` 硬限制 3 秒超时，无法自定义。**
- 之前的 400/403 失败都是「立即返回」（<1s），所以客户端不超时。
- Qwen3-VL 真实推理 = `getTempFileURL` (~1s) + 硅基流动远端推理 (5-15s) ≈ **6-16 秒**。
- 客户端 21:10:21 启动 → 21:10:24（3 秒后）触发 client-side abort，云函数仍在跑但前端不等了。
- 这其实是「部署生效」的好信号：错误从「Model does not exist」变成「3 秒超时」，说明新代码真的在调 Qwen3-VL，只是耗时超限。

**为什么 `cloud.init({ timeout: 60000 })` 不够**：
那只是**云函数执行超时**（云端允许它跑 60 秒），与**客户端 callFunction 超时**（3 秒硬限制）是两回事。客户端不等，结果照样丢弃。

**修复（v3→v4）：start + poll 异步化**
- `recognizeItem` 加 `action` 路由：
  - `action: 'start'` → 立即生成 `taskId`、写 `meta` 集合 doc（带 `_openid`）、**fire-and-forget 启动后台 `runRecognition`**、返回 `{ taskId, status: 'processing' }`。单次 start 走 `getTempFileURL` + 写 db 几百 ms，远小于 3 秒。
  - `action: 'poll'` → 读 `meta` 集合 doc 当前 `status`（processing / done / error / notfound）+ `result`。单次 poll 仅读 db，几百 ms。
- 后台 `runRecognition(taskId, fileID)` 走完整 `getTempFileURL → 硅基流动 → 解析 → 归一化` 流程，**所有异常都被捕获并写回 task doc**（`status: 'error'` + `error: <message>`），不会抛未捕获异常。
- task doc 复用 `meta` 集合（已有），不新建集合避免迁移。doc id 形如 `rt-{ts}-{rand}`，必带 `_openid`（从 `cloud.getWXContext().OPENID` 取），前端轮询时 SDK 按 `_openid` 自动过滤能读到自己创建的。
- 前端 `pages/item-edit` 的 `onRecognize` 改造：
  - `start` 拿 `taskId` 后调 `pollRecognition(taskId)`
  - 内部 `setInterval` 每 1500ms poll 一次，30s 总超时
  - 单次 poll 失败（网络抖动）不放弃，下次重试
  - `status=done` → `applyRecognition(r.result)` 预填表单
  - `status=error` → `recognizeFail(r.error)` 用 showModal 显示完整错误
- `applyRecognition` 兼容 `{ result }` 包装（poll 返回）和裸 norm 对象（旧同步路径）。

**新增测试覆盖（e2e 6→13 组）**：
- G: start 立即返回 taskId（<1s）+ task doc 带 _openid 写入
- H: 异步完成后 task doc status='done' + result 写入
- I: poll 返回当前 task 状态（processing → done）
- J: start 嵌套 payload 被剥开（线上故障回归）
- K: start 缺 fileID 报错（不浪费一个 task doc）
- L: poll 不存在 taskId 返回 notfound（不抛未捕获异常）
- M: 异步失败 → task status='error' + error 信息写入

**额外发现的 bug**：原代码写 `db.collection(META_COLL).add({_id, ...})`，应是 `.add({data: {_id, ...}})`（云开发 API 规范）。e2e G 一开始失败暴露此问题 → 修正。

**向后兼容**：未传 `action` 仍走旧同步路径，**仅供非小程序客户端/单元测试用**，真机 wx.cloud.callFunction 必超时。

**部署生效验证**：弹窗错误里现在带 `[DEPLOY=v4-async]` + `实际使用模型：Qwen/Qwen3-VL-8B-Instruct / Qwen/Qwen3-VL-32B-Instruct`，一眼可定位。

**逃生舱**：
- task 卡在 processing 30s 不动 → 检查云函数日志确认后台识别流程是否抛了未捕获异常（理论上不会）
- 想完全弃用轮询 → 改用云数据库 `db.watch()` 实时监听 task doc，但同样需要 start + poll 改造
- 仍 403/400 → 弹窗已带原始错误码，按 ADR 0011 前几次的「环境变量换模型」方法处理
