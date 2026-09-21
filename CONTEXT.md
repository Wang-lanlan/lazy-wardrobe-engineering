# CONTEXT · 懒懒衣橱（项目全貌 + 术语表）

> **本文件是项目唯一入口**：任何新会话（人或 AI）动手改代码前，先读完此文件。
> 四层结构：① 文档导航 ② 术语表 ③ 架构快照 ④ 活跃问题。
> 术语表保持「只回答这个词指什么」；实现细节（集合名/字段/环境变量/测试命令）在第 ③ 层与 `docs/SETUP.md`。

最后更新：2026-09-15 二（**spec 0011 手动搭配全链路落地（票 01–08）——需部署 genLookImage（BUILD_TAG `2026-09-16.3`）+ 重新编译前端**：⓪ 喂图自证（票 0012-01：renderRoles/inputImages 落库回传，脚注旁标「N 图齐喂/仅喂 M 图：X 未进输入」）+ **底图服装替换指令**（票 0012-03：PROMPT_VERSION v9，真机实证旧句致模型保留底图裤子，旧缓存全失效重出）+ **覆盖率三态**（票 0012-02：COVERAGE_VERSION v2，脚注 ✓ 穿上身 / △ 出现未上身 / ✗ 找不到）+ **还原度微调与回退**（票 0012-04/05：v10 身形锚定+材质遵循后真机回归 → **v11 二分砍 fabric 从句**，身形锚保留）+ **特征级验真**（票 0012-06：coverage v3 带参考图对账，治名字级误判）；① 选品页（每类 1 件、同品类替换、收纳件可选、已选栏两组「会进画面/只按文字描述画」当场摊开）；② 推荐页「自己搭的」独立一区（`manualLook` 独立字段，不混 `looks`，防「换一批」误伤）；③ 手动卡演绎出口与 AI 卡**同一条链路**（同一个 `api.genLook`、同一套缓存键、同一个额度池，不新增云函数）；④ 渲染令牌升级为**全局卡标识**（`IDLE`/AI 卡下标/`MANUAL`，两区共用、一次只出一张）；⑤ 手动卡可收藏，收藏页来源**三筛→四筛**（新增「自己搭的」，判据 `provenance.source === 'self'` 精确相等、历史文档不受影响）；⑥ 衣橱卡片「搭」入口（有图才出现，与「拍照」由同一二值决定互斥；跨 tab 结果走一次性交接槽 ADR-0017）；⑦ **覆盖率自证**（出图后视觉模型逐件判「图上可见吗」，手动卡专属开关 `coverage`，不进缓存键、结果随 genCache 落库、40s 预算守卫绝不危害主结果）。**本轮修掉的既有缺陷**：缓存键漏备注（v8）/ 来源分类前提被推翻 / `loadMeta` 提前 return 导致手动区漏清且指纹被永久遗忘。**新增测试门**：`dev/pick-items-page.test.js`、`utils/manualPickHandoff.test.js`、`dev/pageStub.js`（共用桩，非门）。各票细节见 `docs/tickets/0011-manual-outfit/`）
2026-09-11 五（**识别轮询总超时 30s → 90s（纯前端，无需部署）**：09-10 诊断改造的自证计数器拿到首个 E1 实锤——真机弹「识别超时（30s）：已轮询 15 次，收到返回 15 次，最后一次状态：processing」，**M≈N 且 processing = E1 后台比前端慢**（poll 链路零故障；且此前已查 meta 里 rt- 文档最终 done，后台能跑完只是慢）。30s 窗口罩不住 Qwen3-VL 排队慢 + 回退链首个模型吃满 httpsJSON 50s 超时后再试第二个（理论最坏 ~100s+）。`upload-item.js#POLL_TIMEOUT` 与 `item-edit.js#TIMEOUT` 同步改 90000，互指注释已加（铁律六）。重新编译即验。残余风险：若 90s 仍稳定超时且 M≈N，说明模型耗时逼近回退链上限，下一步该动云端（SF_VL_MODELS 顺序 / 换模型 / 收紧单模型超时），不要再拉前端窗口）
2026-09-11 五（**spec 0010 / 票 0010-01 落地——图片拆两字段 + 取图规则唯一**：单品图片从「一个 `img` 字段三处消费（衣橱展示 / AI 描述 / 出图素材）」拆成**并列两份**——`img` 原图（唯一真源、**任何抠图操作都不写它**，故可回退、可无限重抠）+ `imgCut` 抠图结果（可空）。新增**取图唯一规则**「抠图结果优先、为空回退原图」，两端各一份互指：小程序侧 `utils/itemImage.js`（`pickItemImage`/`allItemImages`）、云侧 `cloudfunctions/genLookImage/lib/itemImage.js`（**双端对拍**守卫在 `utils/itemImage.test.js`）。展示侧在列表出口派生 `imgView`（`utils/api.js#listItems`），衣橱网格与推荐页读它、不再自己写兜底；删除单品改为清两个文件。**顺手修掉一个既有缺陷**：读图描述缓存此前只比 `descVersion`（文档声称的「fileID 进缓存键」没落地）→ 新增 `descImg`（本次实际读的那张图），换图 / 补抠图 / 取消抠图后描述才会失效重读。**BUILD_TAG → `2026-09-11.1`**（`REQUIRED_CLOUD_BUILD` 已同步），**需部署 genLookImage**。⚠️ 已知限制：字段拆分前经**上传页**入库的单品，其 `img` 里存的其实是抠图产物、原图已丢——展示照常，但「重抠」无原图可用，唯一路径是**重拍**（本轮不做数据迁移、不做界面标记）。**三处图片写入口已全部改为并存**：上传页（抠图不再覆盖原图，确认环节可「取消抠图」退回、退掉后同位置变「重新抠图」）、衣橱卡片「拍照」（重拍即清抠图）、编辑页（「AI 抠图」+「取消抠图」）。抠图两段式下沉为共用执行器 `utils/matting.js`（两页同一份）。本轮票面：01/02/03 已实现；04 文档同步 待做）
2026-09-10 四（**tickets/0008-01+02 落地——旧试穿入口退役 + 演绎模型换代**：①旧试穿入口退役（纯前端）：推荐页双按钮收单按钮「演绎」，删 `onGenImage`/`generating`/`lookTryonable`；**genImage 在推荐页彻底退场**（收藏页读 DB 历史文档，不受影响）；档案页文案「试穿模特图」→「演绎模特图」（**字段值不变**）。②演绎模型换代（云函数，`BUILD_TAG=2026-09-10.1`）：`QWEN_EDIT_MODEL` 默认 `qwen-image-edit-plus-2025-10-30` → **`qwen-image-3.0`**（快照→主线，预警期 30 天→3 个月）；**显式 `prompt_extend:false`**（3.0 默认 true 会改写 lookPrompt 措辞且无报错）+ `n:1`；t2i 模型名提成 env `WANX_T2I_MODEL`（原硬编码两处）；新增三自证 **modelUsed / rewriteStatus / usageInfo**（命中缓存与新生成两出口都回传，genCache 同步入库 modelUsed）；早期专用模型链路整体删除（相关函数/键域/测试文件均已移除），`toHttps` 迁 `lib/url.js`（**全 provider 共用件**）、取件逻辑改名 `pickRenderSlots` 迁 `lib/renderSlots.js`、轮询改名 `pollDashScopeTask`；provider 白名单拒绝该早期模型名（不静默换渠道）。**需部署 genLookImage + 重新编译前端**（REQUIRED_CLOUD_BUILD 已同步 2026-09-10.1）；A/B 对比窗口：10-10 前用 env 在控制台来回切新旧模型）
2026-09-10 三（**识别超时诊断：给 poll 轮询加自证计数器**——真机首次跑上传页报「AI 识别失败 / 识别超时（30s）」，且每次都超。诊断链：①该文案唯一出处是 `pages/upload-item/upload-item.js#pollRecognition` 的 tick，成立前提是 `start` 已拿到 taskId → **排除**云函数未部署 / 缺 SILICONFLOW_KEY / 模型 403-400-欠费（三者各有专属文案，本项目错误分类够细，正好帮着排除）；②用户查 `meta` 里最新 `rt-` 文档是 **`done`** → 后台跑完了、fire-and-forget 有效、函数超时够用，**「recognizeItem 是唯一没有 config.json timeout 的调模型云函数」这条假设被证伪**（被砍只会留 `processing`）。剩余两支：**E1 后台比前端慢**（30s 之后才写成 done，前 30s 每次 poll 都合法读到 processing）；**E2 poll 在客户端侧被掐断**（fire-and-forget 的后台任务占住函数实例、poll 排队 → 每轮都被 `wx.cloud.callFunction` 3s 硬超时掐掉 → 被 `.catch(→setTimeout(tick))` 静默吞掉）。⚠️ **关键教训：云函数日志区分不了这两支**——客户端超时只掐断「等结果」，不阻止云函数执行并打日志，两种病因日志里 `action=poll` 都约 20 条。故改前端自证：`upload-item.js` 与 `item-edit.js` 的 `pollRecognition` **各加 `polls` / `oks` / `lastStatus` 三个计数器**（页面 js 间不能 require，同构逻辑各存一份、互指注释，铁律六），超时文案改为「已轮询 N 次，收到返回 M 次，最后一次状态 X」。判读：**M≈N 且 processing → E1；M≈0 → E2**。纯前端改动，重新编译即验）
2026-09-10 二（**T09c 落地——上传页预览态「取消这张」入口**（识别成功但不要这张时跳过入库直接下一张；与「确认入库」并列显式入口，缓解「看着不对的图必须先确认才能跳过」的反向焦虑）：`queue.js#markSkipped` 接受态从 `['upload-failed','recognize-failed']` 扩到 `['upload-failed','recognize-failed','previewing']`；previewing 块新增 `.btn-skip` 按钮绑 `onCancelPreview`（与 `onSkipUpload`/`onSkipRecognize` 同构）；`advance` 仍不接 previewing（须先 skip/confirm 才前进）；queue 单测翻转原"`previewing` 态 skip no-op"断言并新增 4 张全流程用例（含预览取消路径）；spec 决策 5 补充入口说明（决策 5 本意是「显式状态转换」，与新增「取消这张」不冲突）。守卫 dev/upload-queue.test.js 全绿）
2026-09-10 一（**抠图整体改为腾讯云数据万象 GoodsMatting**——ADR-0016，取代 ADR-0015。用户拍板「全量走 GoodsMatting」：客户端色键与百炼绿幕重绘**整体退役**（色键算法天花板：单参考色+二值硬阈值→打洞/锯齿；百炼是生成式重绘，**有静默改衣风险**，对「衣橱=推荐真源」不可接受）。新云函数 `mattingGoods`（第 7 个，取代 mattingAI，start/poll 仿 recognizeItem）：`getTempFileURL` 拿临时链接 → COS 签名 GET `?ci-process=GoodsMatting&detect-url=…` 真抠图输出透明 PNG → 回传微信云存储（**detect-url 模式，COS 桶可空置，云存储仍是唯一真源**）。错误七分类 `lib/parse.js` + `retryable` 由云端算出回传前端（不在前端复刻名单，铁律三/六）。**需用户：①注册腾讯云+实名 ②建 COS 桶并绑定数据万象 ③开通「AI 内容识别」 ④SecretId/SecretKey→环境变量 `COS_SECRET_ID`/`COS_SECRET_KEY`/`COS_BUCKET`/`COS_REGION` ⑤**云开发控制台手动删掉已部署的 mattingAI**（删本地源码不删云端）。⚠️ 价格核准：GoodsMatting **0.01 元/次**（2023-12-01 调价后实际价 = 通用抠图 0.02 元/次 × 抵扣 2:1；ADR-0015 原写即正确，0.14 元是调价前旧价——本文件 09-10 初稿曾误「更正」为 0.14 元，已撤销），免费 1000 次/2 月。守卫 cossign.test.js(24)/parse.test.js(25)）
2026-09-09 十一（**T09b 热修——抠图触发盲区**（用户真机反馈海边实拍烂图）：色键「抠错但 coverage 正常」的实景图走不到 AI 兜底 → matting.js chromakey 新增**背景纯度 purity**（边缘带中距参考色≤阈值的占比），shouldFallback 改双参数（coverage 越界 或 purity <0.6 → 不可信 → 自动 AI 绿幕重绘）；缺 purity 参数安全默认回退。**依赖票 09 部署完成**——mattingAI 未部署/未配 Key 时这类图会弹「AI 增强未成功」+ 原图兜底。**（已被 09-10 的 ADR-0016 整体取代）**）
2026-09-09 十（**票 09 落地——AI 抠图兜底**：新云函数 `mattingAI`（第 7 个，start/poll 仿 recognizeItem，百炼 wanx2.1-imageedit 绿幕重绘 #00FF00——非纯白：白色衣物在纯白底会被色键误抠）；前端色键 LOW_QUALITY 失败→自动 AI 增强（`_aiTried` 每张 1 次，重抠不重置防重复计费）→下载绿幕图重跑色键→正常入库；欠费（Arrearage/AllocationDepleted）→原图兜底不再重试；queue 状态机不动（AI 在 bg-removing 内部）。**需用户：①百炼（华北2）注册+API Key→云函数环境变量 DASHSCOPE_API_KEY ②难图实测绿幕生成质量 ③mattingAI 上传部署**。凭证 DASHSCOPE_API_KEY 已入 3.3；守卫 mattingai.test.js 已入 3.4）
2026-09-09 九（**ADR 0015 立项——上传抠图升级**：色键失败难图自动走百炼 wanx2.1-imageedit 白底重绘（0.14 元/张，新账号 500 张免费）再色键——AI 只规整背景不抠图（生成模型无 alpha），色键零改动；新增云函数 mattingAI（start/poll 仿 recognizeItem）+ 凭证 DASHSCOPE_API_KEY（用户配置）；ready 待实施，票 0006/09。同日调研记录：腾讯云 GoodsMatting 0.01 元/次为备选（跨账号打通待验证）、硅基流动无抠图模型、rembg 自托管云函数塞不下）
2026-09-09 八（**0007-01 档案去 tab**：tabBar 5→4（上传/衣橱/推荐/收藏），档案降级为普通页——唯一入口 = 衣橱右上角既有「档案」按钮（switchTab→navigateTo），recommend 旧试穿拦阻弹窗「去档案」同步 navigateTo + 文案指路「衣橱右上角」；图标 png 保留；默认首页不变（pages[0]=上传页）。纯前端，重新编译即验。守卫 upload-entry.test.js 断言已同步）
2026-09-09 七（**T03 落地——fit 升级 expand–contract 全部闭环**：①前端批——item-edit 版型改按品类动态 chips 多选（fit 编辑三件套从 panel.js 下沉 utils/fitTaxonomy，item-edit 与 upload-item 单一实现）、loadItem 旧 string 自愈数组、onSave 落数组、wardrobe 卡片 fitDisplay 适配（数组→'宽松 / 长款'，string 原样兜底）；②contract——slotMap/lookPrompt 归一化收敛单路径（先切分再逐段首命中=写入位置序），**已知收敛差异：逆序串主导版型从别名序变位置序（种子/AI 无此形态，有意）**；③itemDoc scene/status 受控透传、applyRecognition 死代码清理。⚠️ 口径：受控写路径只产数组 + 读侧全量兼容双形态——存量 DB/seed/recognizeItem 仍 string 不阻塞。测试门新增 item-edit-fit.test.js）
2026-09-09 六（T08 落地，**spec 0006 上传页主线全部实现**：底部双列调整面板——左字段右选项实时联动、颜色 16 色块、**fit 按品类动态展开**（fitGroups 消费 FIT_BY_CATEGORY，裙装/鞋亚类依赖组、无 fit 品类隐藏）；纯函数 `panel.js`（buildDraft/toggleFitOption 替换保位/切品类重校验不留脏值）；canonicalFit 补「子串抑制」——重校验时长标签（中长款）依赖失败被丢后内嵌短标签（长款）不得溜进另一依赖维度（**双端同构已同步**，铁律六）；itemDoc scene/status 改受控透传（面板用户选择不丢）；I1 闭环：识别失败 modal 确认后自动展开手动填写面板→面板内确认入库；PALETTE 共享/ recognition 代次令牌见 09-09 五）
2026-09-09 五（T07 落地：上传页接 AI 识别——recognizeItem start/poll 复用 item-edit 模式（1.5s/30s），**代次令牌防重试/跳过后的旧轮询竞态**，result 空→走失败路径不锁死；字段预览只读 + 「确认入库」必点 → api.addItem 落库（fit 走 canonicalFit 归一化数组、scene/status 默认「通用/在用」、source='bulk-upload'、防晒衣→外套+标签）；PALETTE 从 item-edit 提取至 utils/constants（页面 js 间不能 require——会执行 Page()）；识别失败=modal+重试/跳过，**I1 强制手动确认面板留 T08**。全部纯前端，无需部署云函数）
2026-09-09 四（T06 落地：色键抠图——`pages/upload-item/matting.js` 纯算法（边缘带逐通道中位数采样背景 + Chebyshev 距离 threshold 30/255 + coverage 兜底 >0.92/<0.05 回退）+ 离屏 canvas IO 壳；队列状态机升级全流程版：uploaded 不再前进指针，bg-done/skipped 才可 advance（T07 将在 bg-done 后接识别）；抠图成功 PNG 传云存储覆盖 fileID（衣橱米白透出），失败红字「这张识别难度大，建议重拍」+ 重新抠图/用原图继续（M1；**与 spec 决策 4「不阻塞」的取舍：停下二选一是为满足决策 10「重新抠图」按钮，不算卡死**）；已知边界：白衬衫白墙（coverage≈0.5 半透明）不触发 fallback，真机调 threshold 时观察；全失败 modal（决策 12）已补）
2026-09-09 三（T05 落地：上传页接入选图（showActionSheet 拍照 1 张/相册 9 张）+ 串行上传队列——状态机纯函数 `pages/upload-item/queue.js`，完成 toast「已处理 X 张，跳过 Y 张」；T06 起在 uploaded 后续接抠图。守卫 `dev/upload-queue.test.js`）
2026-09-09 二（T01+T04 落地：① fit 字段词表 `fitTaxonomy` 双端同构落地——`fit:string[]` 品类路由归一化 `{fit, dropped}`，spec 0006 决策 8 / ADR 0014，expand–contract 中间态见 3.4 脚注；② 上传入口骨架 T04——tabBar 4→5「上传」list[0] + pages[0]（**用户拍板 A：打开即上传页**，推翻 grill 期「selected 仍指向衣橱」——微信无此配置，物理互斥）、衣橱 FAB 退场（筛选预选新增随之消亡）、item-edit 无 id 拦截只留编辑、守卫 `dev/upload-entry.test.js`；上传页识别 T07–T08 待做。均纯前端+纯函数，无需部署云函数）
2026-09-08 晚二（①「刷新灵感」按钮 + refreshCases 云函数整体退役（USE_FRESH_CASES 从未启用，按钮刷了也白刷；云函数 7→6，fresh 案例层同步退役）；②温度档三件修法（真机反馈「19℃ 与 30℃ 推荐一样、19℃ 配短裤」）：tempBand 低温日（预报最低<18℃，SHORTS_LOW 常量）禁短裤——**衣橱有长靴则短裤+裙装例外放行且强制「配长筒靴+厚袜」（有配套才开门；低温日鞋/裙/短裤豁免 season 过滤，同 hot 档外套先例）**+全季节禁短袖；prompt 明示「按今日预报最高 X℃」+ 当季优先规则；recommendCore 回传 band 自证（档位/温度/候选数），前端脚注展示。全绿待部署）

---

## 0. 使用纪律（写给下一次改代码的 AI）

1. **动手前必读**：③.5 平台硬限制速查 + ④ 活跃问题——硬限制每条都是真机踩过的坑，活跃问题里可能有别人未完成的决策。
2. **改完代码必须同步本文件**：修掉一个活跃问题 → 更新 ④ 层状态并标日期；引入新概念 → 补 ② 术语表；发现新的平台坑 → 补 ③.5 速查。
3. **ADR 级决策**（难逆转 / 无上下文会显得奇怪 / 真实取舍的结果）→ 新建 `docs/adr/00XX-*.md`，不写进本文件。
4. **回归门**：改 `cloudfunctions/` 或 `utils/` 后，跑 ③.4 的 dev 测试门，全绿才算完成。
5. 本文件 ④ 层的每条都带日期——**超过一个月未核对的内容视为可疑，先向用户求证再行动**。

---

## 1. 文档导航（我想知道 X → 去哪份文档）

| 想知道 | 去哪 | 状态（2026-09-03 核对） |
|---|---|---|
| 这个词指什么 | 本文件 ② | ✅ 最新 |
| 系统长什么样 / 怎么跑测试 | 本文件 ③ | ✅ 最新 |
| 现在有什么没做完的 | 本文件 ④ | ✅ 最新 |
| 从零部署（8 步） | `README.md` | ⚠️ **已知失真**：云函数表停在 5 个（实际 6 个：缺 `recognizeItem`，且 `refreshCases` 已于 2026-09-08 退役不在表内）；genLookImage 环境变量表缺 `WANX_T2I_MODEL` 说明；「演绎出图十几秒到一分钟」未反映现状 |
| 韩女穿搭→推荐→出图全链路的方法论与事故复盘（人读） | `docs/METHODOLOGY.md` | ✅ 2026-09-08 新建（快照当日代码；细节清单以本文件 ③/④ 为准） |
| 全链路流程/键公式/溯源判定/改码 checklist（AI 速查） | `docs/AI-PIPELINE-CHEATSHEET.md` | ✅ 2026-09-08 新建 |
| 重建 / 凭证 / 坑位清单 | `docs/SETUP.md` | ⚠️ **已知失真**：坑位清单止于 08-30，ADR-0012 系列新坑（协议归一 / meta 多文档自愈 / 词表归一化）不在其中；其中「所有读 meta 的地方都带 `orderBy('_id','asc')`」一条**已被 09-03 的自愈逻辑取代**（见 ③.5 第 7 条），勿照旧文改回去 |
| 当初为什么这么定 | `docs/adr/`（17 条） | ✅ 最新到 0017（跨 tab 传值用一次性交接槽；0016 抠图改 GoodsMatting；0015 已作废留档） |
| 正在做的事（票 / 规格） | `docs/tickets/`（票）· `docs/specs/`（规格） | ⚠️ 票最新到 **0008 模型换代迁移（4 票，2026-09-10）**，未完成；规格到 0006 |
| 最初的设计稿 | `DESIGN.md` | 已作废，仅历史留档（文件头已自我声明） |
| ADR-0007 时代部署清单 | `DEPLOY.md` | 历史留档 |
| 会话级工作日志与铁律 | `.workbuddy/memory/`（agent 记忆，非仓库文档） | ✅ 但随记忆清除会丢——**重要结论必须沉淀进本文件或 ADR** |

---

## 2. 术语表

### 2.1 衣橱域

**单品（Item）**
衣橱里可被单独搭配的一件衣物或配件。它是推荐与生图的最小引用单位。

**上传页（upload-item）**
tabBar 第 1 个 tab（spec 0006 T04 骨架已落地；0007-01 后 tabBar 共 4 个：上传/衣橱/推荐/收藏——「档案」已去 tab 降级为普通页，唯一入口 = 衣橱右上角「档案」按钮 + recommend 拦阻弹窗直达）：极简中央 ＋ 号 + 提示，一站式承载「选图→抠图→识别→字段确认→入库」（T05–T08 渐次接入）。**打开小程序默认落在此页**（用户拍板 A：upload-item 为 pages[0]；微信 tabBar 无默认选中配置，「上传最左」与「打开在衣橱」物理互斥）。新增单品的唯一入口——衣橱页 FAB 已删除，item-edit 拒绝无 id 误入（navigateBack + switchTab 兜底），只留编辑场景。

**在用 / 收纳（Status）**
单品的两种状态，互斥且必有其一：
- *在用* —— 参与 AI 推荐，正常展示。
- *收纳* —— 仍留在衣橱里、仍可查看编辑，但**不参与 AI 推荐**，展示上弱化。用于「过季、洗了、不想穿但舍不得删」。

**品类（Category）**
单品的粗分类，受控枚举：内搭 / 外套 / 长裤 / 短裤 / 裙装 / 帽子 / 鞋 / 包 / 配饰。
它同时决定两件事：衣橱页的筛选分组，以及一套搭配被描述成文字时的出场顺序。

**单品属性**
描述单品的若干维度：颜色、材质、版型、季节、场景。
它们是推荐模型判断「能不能搭在一起」的依据——属性缺失会直接降低推荐质量。
**版型（fit）正在从复合中文字符串升级为标签数组 + 品类路由词表**（T01 落地，ADR 0014）：新数据 `fit: string[]`（如 `["oversize","长款"]`），归一化走 `fitTaxonomy.canonicalFit(category, fit)` 按 9 品类差异化维度校验，返回 `{ fit, dropped }`（丢弃标签标脏自证）。迁移（expand–contract）完成前旧 `fit: string` 仍是存量形态，读侧须兼容两种形态；案例约束比较走 `slotMap.canonicalFit`（T03 contract 后单路径：先切分再逐段首命中=写入位置序，迁移等价守卫 dev/slotmap-array.test.js E 段）。

**平拍图（Flat-lay Photo）**
单品的实物拍摄图（原图 `items.img`），一件一图、完整入镜、背景干净。
它是**演绎出图的画面输入**（图 2/图 3 参考）——有实图的衣物才谈得上保真，没实图的只能靠文字近似。**拍摄规范不变**：一件一图、背景干净、完整入镜。
⚠️ 2026-09-11 起拍摄规范补了一条**材质要求**（spec 0010）：底要用**硬质平整面**（桌面/地板），**别用织物**（床单/被单/毛巾/毛毯/地毯/沙发/窗帘）。抠图接口的世界模型里只有「商品」，织物底的纹理与衣物同源，会被判成商品的一部分整片保留——这是「抠图扣不干净、残留一大块」的主因。浅色衣物另配深色底（同明度会被当背景吃掉，表现为打洞）。

**抠图结果（Cut Image，`items.imgCut`）**
单品的透明底 PNG，由抠图云函数产出，**可空**。2026-09-11（spec 0010）起与平拍图**并列存两份**：
- `img` = 原图，**唯一真源，任何抠图操作都不写它** → 因此抠坏了 / 取消抠图都能回退，可无限重抠；
- `imgCut` = 抠图结果，用户手动抠（编辑页「AI 抠图」）或上传页自动抠成功后写入，点「取消抠图」即落空。

**取图唯一规则**：全项目取用单品图片一律「**抠图结果优先，为空回退原图**」。
规则本体：小程序侧 `utils/itemImage.js`（`pickItemImage` / `allItemImages`）、云侧 `cloudfunctions/genLookImage/lib/itemImage.js`——
**两端各存一份、必须逐例等价**（云函数不能 require 小程序侧代码），守卫 `utils/itemImage.test.js` 含双端对拍。
展示侧（衣橱网格 / 推荐页卡片）读列表出口派生的 `imgView`（`utils/api.js#listItems`），**页面与 wxml 不要自己写 `imgCut || img` 兜底**。

**读图描述（Desc，`items.desc`）**
演绎前用视觉模型把单品图读成一段固定句式描述，替代「颜色+材质+名字」属性 token。
缓存键 = **读的是哪张图（`descImg`）+ 模板版本（`descVersion`）**。2026-09-11（spec 0010）补上图片半边——
此前只比版本，文档声称的「fileID 进缓存键」实际没落地，换图 / 补抠图 / 取消抠图后描述都不失效（画面用新图、prompt 里却是旧图的描述）。存量 desc 无 `descImg` → 必然重读一次后自愈。

### 2.2 方案域

**手动搭配（Manual Look）**【spec 0011，2026-09-15 落地】
用户**自己一件件挑**出来的方案，与 AI 推荐的候选方案并存于推荐页：AI 三套住 `looks` 数组、
手动卡住独立字段 `manualLook`（「换一批」清 AI 区时不得误伤它）。与 AI 方案的差别全在**内容**不在形状
（title 是拼的品类组合、reason/tip/inspo 为空串、provenance 只有 `{ source: 'self' }`——不编造溯源），
因此演绎 / 收藏 / 保存三个出口零分支复用。三条边界：
① **画面只有三个图位**（人像 + 上装 1 + 下装 1）：鞋/包/帽/配饰无论有没有图都进不了画面
（`categoryToSlot` 返 null），选品页「只按文字描述画」那一组把这点当场摊开——这是已接受的取舍，
覆盖率脚注（票 0011-07）负责观测「到底丢多少」；
② 收藏页来源第三类「**自己搭的**」按 `provenance.source === 'self'` 精确判定（来源四筛）；
③ 每类最多 1 件、至少 1 件即可确认（同品类再选 = 替换，`utils/lookDiy.js` 是它的唯一纯逻辑真源）。

**候选方案（Candidate Look）**
推荐页一次性产出的搭配结果，**仅存在于内存，尚未持久化**。
离开页面、刷新或重新生成即消失。候选方案**必须被显式收藏**，才会转为收藏方案留存下来。

**收藏方案（Saved Look）**
候选方案被收藏后落库的持久记录。在候选方案基础上多了用户自定的**标签**和一份**单品名称快照**。

**快照与删除的边界规则**
收藏方案保存的是名称快照而非引用：**单品被删除后，收藏方案仍显示那件衣服的名字，但无法定位原单品**。有意为之，不报错、不联动删除。

**拼贴（Collage）**
方案默认的展示形态——把所引用的单品图横向排列。**零成本、即时呈现**。

**套内单品契约 / 叠穿闸门（spec 0005）**
同一套候选方案内每类单品最多 1 件；两条例外：① 内搭最多 2 件，且必须通过叠穿闸门
（`aiRecommend/lib/layering.js`）：可见层次差（袖长差或衣长差的**正面证据**）+ 内紧外松，
任一信息缺失/无法归类即从严拒（降级单内搭）。② 长裤 + 裙装可同套叠穿（裤打底、半裙
罩外，两个独立品类天然放行——2026-09-08 真机反馈补，规则 11 显式豁免）。违规件丢弃
并挂 `droppedIds` 自证。prompt 硬规则是「希望」那一半，解析层 `enforceSetContract`
是「没法不遵守」的那一半；叠穿的**画面**表达由演绎分层措辞承担（无外套时内搭是
「上装」而非「内层」；裤裙同套时裙装是「罩在裤外的层次裙」）。

**上身图（Look Image）**
把一套方案**渲染**成「穿在身上」的效果图。走文生图或图生图（外部生图服务），**产生费用**。模型「画」出来的衣服不一定忠实于实物。

**历史渲染图（Legacy Look Image）**
部分早期方案存过一种「把平拍图真实穿到人像上」的效果图，依赖一种已停服的专用模型（2026-10-10 下线、无对等替代），相关入口早已移除。
保留此说明是防历史文档/收藏页里还存着这类图被误判为坏数据——`pages/looks` 仍会渲染它们。
保真诉求现由「演绎 + 衣物保真硬约束」承担（tickets/0008-03 待实施）。

**种草件（Wish Item）**
衣橱里**没有**、但 AI 认为值得补的单品。**不可穿**——只是购买建议，不占单品记录、不进推荐引用。每套方案最多 2 件。

**每套方案的底线**
每套方案**至少包含 1 件衣橱里的真实单品**。全部由种草件构成的方案会被直接丢弃。

**组合（Combo）**
上身图的**生成与计费单位**：单品集合 + 场景。二者任一变化即视为新组合，重新生成并再次计费。同一组合重复请求命中缓存免费用。
**演绎图的组合缓存键**：`baseKey + '-' + renderSalt + '-' + provider + '-' + keyTag`
（renderSalt = 参与画面的 fileID 串 md5 截 12；`keyTag = renderModelTag + '@' + QWEN_EDIT_SIZE`；
renderModelTag = `QWEN_EDIT_MODEL` 或 `WANX_T2I_MODEL`，**只作 `modelUsed` 给人看的模型名**）。
换模型 / 换输出尺寸 = 键自动变 = 旧图失效重出，**无需人工 +1**。
⚠️ **size 也进键**（2026-09-17）：`QWEN_EDIT_SIZE` 从硬编码提成 env 后，「改尺寸不换键」会命中旧尺寸的缓存图
（铁律①同类病）→ 故尺寸参与 `keyTag`；但**不并进 `renderModelTag`**（那会把「模型名」污染成「模型名@尺寸」，
而 `modelUsed` 要回传前端给人看）。早期专用模型的专属键已随链路删除，不再产生新记录。

**换模型怎么改（2026-09-17.6 起：只改控制台 env，零代码）**
① 演绎编辑模型 → `QWEN_EDIT_MODEL`；② 输出尺寸 → `QWEN_EDIT_SIZE`；③ 无底图文生图 → `WANX_T2I_MODEL`；
④ 混元分支 → `HUNYUAN_IMAGE_MODEL`；⑤ 硅基流动主模型 → `SF_I2I_MODEL` / `SF_T2I_MODEL`；
⑥ 硅基流动**兜底模型** → `SF_I2I_FALLBACK` / `SF_T2I_FALLBACK`（主模型 403 时的退路，平时不生效**最易漏**）。
⚠️ **改完 env 必须重新部署**（常量在 `require` 时求值，不是热更新）；
⚠️ 判据是**日志里的 `[cfg]` 行**（每次调用打印生效配置）——不要靠出图反推。
⚠️ **刻意不 env 化的两处**（别"顺手"改）：`ai.createImageModel('hunyuan-image')` 是云开发 AI+ 的**能力标识**（不是模型名，配错=调不到能力）；DashScope 的**端点路径**与协议形态（同步 messages / 异步双段）绑死，换端点是换整段代码而非换 URL。
⚠️ 模型名进键 ⇒ **生产实际跑哪个模型从代码里读不出来**（默认值在 `||` 右侧、覆盖在控制台）——这正是 [0008-model-lifecycle-migration] 那次「以为跑 3.0、实际跑 edit-plus」的根因；`[cfg]` 行与 `modelUsed` 是两个补丁。

**命中缓存（Cached）**
某组合此前已生成过，本次直接复用旧图，**不消耗额度、不产生费用**。

### 2.3 画像域

**穿搭档案（Profile）**
一组描述「你这个人怎么穿好看」的个人特征（身形、肤色、雷区、想多穿），同时喂给**推荐模型**和**生图提示词**。

**雷区（Avoid）**
明确排斥的穿搭特征，作为**负向约束**同时作用于推荐与生图两端。

**参考照（Reference Photo）**
档案里的一张人像照片。**2026-09-11 起档案页不再提供「自拍 / 演绎模特图」二选一**，只剩两态：
- 没传 → 演绎改用**内置虚拟模特底图**（环境变量 `RENDER_BASE_MODEL_IMG` 配的那张；未配则退纯文生图）；
- 传了（**上传即生效**，`refImageType` 记为 `model`）→ 作演绎出图的人像底图：不要求本人出镜、不要求露脸，但底图人物的身高/体重/肩宽/肤色须接近用户——**底图身材决定出图可不可信**。

⚠️ **为什么撤掉「自拍」选项**：`self` 在云侧与「没设置」走**同一个分支**（都不进画面、都用内置底图、键都不含人像指纹）——它不是第三种状态而是否定态，只会让「传了图到底生不生效」说不清（UI 里还白占一张存储）。

**参考照类型（refImageType）** —— 已降级为**系统记账**，不再是用户选项。
受控值仍为 `self` / `model` / `reference` / `tryon-model`；云侧判定口径不变（`model`/`reference`/`tryon-model` 生效，`self` 与缺省 **fail-closed 不进画面**，宁可禁错不可漏放）。
前端只在**上传时**写入 `model`；加载时若检测到「有图但类型不生效」（旧数据遗留），档案页给一行条件提示、**不静默启用**——一张可能含正脸的图不该在我们看不见的地方突然进画面。
**切类型 / 移除都绝不联动删除照片资源**（曾因「切类型顺带删图」造成用户图片丢失）。

### 2.4 灵感与溯源域（ADR-0008 / 0012）

**灵感案例（Case）**
一条可被注入推荐 prompt 的穿搭参考。三个来源：
- *博主案例（personal）* —— 韩国博主 IG 一手验证入库，独立文件、独立名额，永不参与封顶；
- *公开案例（brain）* —— 统一大脑案例库；
- *新鲜案例（fresh）* —— **已于 2026-09-08 退役**（原 Tavily 按需刷新，按钮删除后无入口；历史条目残留不参与推荐）。
三者的字段类型不统一（season/scene 有的是数组有的是字符串），比较前必须归一化。

**案例硬约束（Constraints）**
案例携带的结构化配方：mustContain（角色+版型，如「外套 oversize + 内搭 slim + 长裤 regular」）、colorMatch、layeringRule、colorRule。
**「参考了该案例」的唯一定义 = 生成的 set 真穿出了 mustContain**——不是文字里提到了谁。

**双闸（Two Gates）**
案例进入注入前的两道过滤：
- *闸 1 季节交集* —— 案例季节与当日温度档允许的季节有交集（**字符级**交集：「夏秋」∩「春夏」=「夏」）；
- *闸 2 可满足性* —— 案例硬约束能被当前衣橱满足。
两闸后零案例 → 诚实退回纯衣橱搭配，**不挂案例、不硬凑**。

**温度档（Temp Band）**
按当日高低温划分的 5 档，与季节联合决定单品准入（如 ≥28℃ 禁保暖外套、冬季 low<20℃ 禁短袖）。**推荐跟着温度走，不跟日历走**。

**溯源（Provenance）**
每套推荐结果标注「参考了谁」的机制，四态：
- *satisfied* —— set 真满足某注入案例的硬约束，署名该案例；
- *not-satisfied* —— 自报了案例 id 但 set 不满足其约束；
- *not-injected* —— 自报了未被注入的案例（编造）；
- *no-ref* —— 无任何案例参考（纯衣橱搭配，合法的诚实降级）。
**结构满足是主证据，文本重叠只用于并列候选排序**——真实 LLM 的措辞不含案例受控词，拿文本当闸门会把忠实 look 也挡成 no-ref（2026-09-03「案例全失踪」事故根因）。

**结构孪生（Structural Twin）**
两条案例的 mustContain 完全一致（仅颜色/层叠规则不同）。同一套 look 可同时满足多条，自动映射落注入序在前者。诚实但有信息量损失，展示层合并方案待定（见 ④-4）。

### 2.5 成本域

**额度（Quota）**
按自然月计算的上身图生成上限。超出后停止生成并提示，下月自动重置。
额度是**体验护栏**而非计费依据——真正计费发生在外部生图服务侧。

**按需生成**
上身图**从不自动生成**。拼贴是默认形态，用户主动点「看上身效果」才触发生成与计费。不点即零成本。

### 2.6 持久化概念

按**领域角色**命名；真名与结构见 ③.2 与 `docs/SETUP.md`。

| 概念 | 角色 |
|---|---|
| 单品记录 | 存所有单品及其状态、属性、平拍图 |
| 设置档 | **单例**——聚合穿搭档案、参考照及类型、额度计数；历史遗留可能存在**多文档**，读取须自愈（见 ③.5 第 7 条） |
| 收藏方案记录 | 存所有收藏方案及其标签、名称快照 |
| 上身图缓存记录 | 存「组合 → 已生成图」映射；天气快照也存在这里（固定 id），刻意**不放**设置档 |

**跨页状态（内存态，不落库、不跨进程）**

| 概念 | 角色 |
|---|---|
| 跨 tab 交接槽 | **一次性**的模块级单槽（`utils/manualPickHandoff.js`，ADR-0017）：衣橱页把选品结果放进去 → `switchTab` 去推荐页 → 推荐页在列表就绪后 `take()` 一次。**取即清**，所以 tab 来回切不会反复重建同一张卡。它不是"全局状态"：只承载一个字段、用完即空、进程重启即消失（故意不用 `wx.setStorageSync`——那会让一条早该消失的结果复活成幽灵卡片） |

### 2.7 术语使用禁区

| 不要这样说 | 应该这样说 |
|---|---|
| 「方案」（不指明状态） | 「候选方案」或「收藏方案」 |
| 「配上图片」 | 「拼贴」（零成本）还是「上身图 / 演绎图」（AI 画，计费） |
| 「同一套衣服」 | 「同一组合」——但组合还包含场景；演绎图缓存键含模型名 |
| 「天气」 | 「天气快照」——推荐时点的天气，作为上下文传给模型 |
| 「参考照」 | 2026-09-11 起不再分类型（原「自拍/演绎模特图」二选一已撤）——传了即生效，没传用内置虚拟模特底图 |
| 「参考了博主某案例」 | 溯源态是哪一态？只有 *satisfied* 才算真参考 |

---

## 3. 架构快照（中粒度；字段级细节见 `docs/SETUP.md` 与各 ADR）

### 3.1 云函数全景（7 个；2026-09-10 mattingAI→mattingGoods，refreshCases 已退役）

| 云函数 | 职责一句话 | 环境变量（只列名） |
|---|---|---|
| `aiRecommend` | 出 3 套候选方案：双闸注入案例 → LLM → 硬约束过滤 → 溯源 | `SILICONFLOW_KEY`（可选，配了就走硅基流动，否则走云开发 AI+） |
| `genLookImage` | 演绎出图（多图融合 / 纯文生图兜底），组合缓存与月额度 | `SILICONFLOW_KEY`、`SF_I2I_MODEL`、`SF_I2I_FALLBACK`（默认 `Qwen/Qwen-Image`；2026-09-17.6 去硬编码）、`SF_T2I_MODEL`、`SF_T2I_FALLBACK`（默认 `black-forest-labs/FLUX.1-schnell`；同上）、`IMG_PROVIDER`、`MONTHLY_LIMIT`、`WANX_KEY`、`QWEN_EDIT_MODEL`（默认 `qwen-image-3.0`）、`QWEN_EDIT_SIZE`（默认 `960*1696`；2026-09-17 从硬编码提炼，1K/2K 同价档探针用）、`WANX_T2I_MODEL`（默认 `wan2.6-t2i`）、`HUNYUAN_IMAGE_MODEL`（默认 `HY-Image-v3.0-I2I-ToB-v1.0.1`；2026-09-17.6 去硬编码）、`SF_VL_MODELS`（读图描述回退链，与 `recognizeItem` 共用） |
| `getWeather` | 高德天气，extensions=all 返高低温，按城市+小时缓存 | `AMAP_KEY` |
| `mattingGoods` | 上传抠图：腾讯云数据万象 GoodsMatting **真抠图**（透明 PNG），detect-url 模式；start/poll 两段式 | `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`（默认 `ap-shanghai`；需桶绑数据万象+开通「AI 内容识别」） |
| `recognizeItem` | 拍照识别单品属性；**异步 start/poll 两段式**（客户端 3s 硬超时逼出来的架构） | （走云开发 AI+） |
| `seedImport` | 灌入 54 件初始清单（幂等） | 无 |
| `exportData` | 导出 JSON | 无 |

### 3.2 数据库集合与云存储

集合：`items`（含平拍图 `img` + 抠图结果 `imgCut`，取图规则见 ② 术语表「取图唯一规则」）、`meta`（单例，见 ③.5 第 7 条）、`looks`、`genCache`（组合缓存 + 天气快照固定 id）、**`renderTasks`**（`genLookImage` 异步任务文档，2026-09-17.7 新增，见下方⚠️）。
云存储：`wardrobe/`（单品照片）、`reference/`（参考照）、`looks/`（生成图）。

> ⚠️ **`renderTasks` 为什么必须独立成集合**（2026-09-17.7，spec 0008-07）：`recognizeItem` / `mattingGoods` 的 task 文档都写在 `meta` 里，**但本函数的 task 绝不能跟着学**。理由是**同一集合、两种读法**：那两个函数读 `meta` 是 `doc(taskId)` 直读；而 `genLookImage` 读 `meta` 是**全量扫描 + 打分挑选**（`_openid` 收敛 → 含 `refImage/refImageType` 优先 → **并列取 `_id` 最大者**）。task 文档必带 `_openid`、又不含那两个字段，`_id` 是 `gl-{时间戳}`（几乎必然全库最大）⇒ 在「用户自己也没传过真人模特图」的账号上会**被选中当 metaDoc**，导致 `personBased` 塌成 false、`baseModelFileID` 回落到内置底图 ⇒ **换模特图不换缓存键**（＝2026-09-05 真机坑「换了模特图还是旧模特」的同构复现）。⇒ 处置是**物理隔离**，一行都不改那段挑选逻辑。守卫见门清单 `dev/async-shell.test.js` 的集合断言 + `shortcut-check-async-shell.js` ②。

### 3.3 外部服务

| 服务 | 用途 | 凭证 |
|---|---|---|
| 硅基流动 | 文生图 / 图生图 / LLM 推荐 | `SILICONFLOW_KEY` |
| 阿里云百炼 DashScope | 演绎 qwen-image-3.0 / 纯文生图兜底 wan2.6-t2i | `WANX_KEY` |
| 腾讯云数据万象 CI | 商品抠图 GoodsMatting（透明 PNG 真抠图） | `COS_SECRET_ID`/`COS_SECRET_KEY`/`COS_BUCKET`/`COS_REGION` |
| 高德 | 天气 | `AMAP_KEY` |
| 云开发 AI+ | DeepSeek 推荐兜底链路 | 无需 key，需控制台启用模型 |

### 3.4 dev 测试门（改代码后必跑，全绿才算完成）

⚠️ 只列**条目与路径**，不写测试门总数与「N/N」这类聚合数字——断言数会随维护漂移，
文档里的数字迟早对不上（2026-09-10 的老教训）。想知道条数就跑一遍，各门自己会打印。

本地 Node 22 离线可跑（测试用 `Module._load` 劫持 SDK/https，不触网）：

```bash
# aiRecommend（在 cloudfunctions/aiRecommend/ 下）
node lib/provenance.test.js        # 溯源三态 + autoMap（20/20）
node lib/caseMatcher.test.js       # 文本匹配（6/6）
node lib/index.integration.test.js # 端到端（6/6，含套内契约+叠穿闸门场景 F）
node lib/brainLoader.test.js       # 大脑加载降级链（13/13）
node lib/promptBuilder.test.js     # 提示词（9/9，含套内数量契约规则注入）
node lib/tempBand.test.js          # 温度档
node dev/t4-gate.test.js           # 双闸
node dev/t5-provenance.test.js
node dev/realdata-gate.test.js     # 真数据词表守卫
node dev/realdata-automap.test.js  # 真数据自动映射守卫（12/12）
node dev/slotmap-array.test.js     # T02 fit 数组迁移：canonicalFit/fitConflicts 首命中主导 + 迁移等价守卫
                                   # ⚠️ 2026-09-10 修正：本条原被误登记在「小程序侧」代码块里（写成 dev/slotmap-array.test.js，该路径不存在，
                                   #    从仓库根跑必然 MODULE_NOT_FOUND）。实际位置在 cloudfunctions/aiRecommend/dev/，即本块。
node lib/bloggerNote.test.js       # 【待决链路】懒懒签名文案（7/7）。bloggerNote 已全产品下线（④#10），测试仍在跑属"有产出无消费"
node dev/diagnose-fallback.js      # 降级诊断（stderr 降级日志属预期）

# genLookImage（在 cloudfunctions/genLookImage/ 下）
# 2026-09-10 / tickets-0008-02：早期专用试穿模型链路已**删除**（相关 e2e/单测/库文件均已不存在；provider 白名单拒绝该早期模型名）。
# 演绎模型已迁 qwen-image-3.0（主线，预警期 3 个月），显式 prompt_extend:false 防 3.0 改写提示词。
node dev/usage.test.js             # 月度额度月份/判定（20/20，含跨月 8 小时边界 + TZ 无关性）
node dev/vlmDescribe.test.js       # 演绎链路读图描述分拣/清洗/版本缓存；
                                   #   spec 0010：desc 缓存键新增**图片半边** descImg（换图/补抠图/取消抠图必重读）；
                                   #   spec 0011 票 07：覆盖率自证（清单提取 / 判定解析的脏值与极性 /
                                   #   genCache 复用结果的版本+结构三道门）；
                                   #   **票 0012-02/06：口径三态 v2 + 特征级验真 v3**（上身/出现/找不到 → worn/present/missing；判定输入带参考图对账，
                                   #   「画了没穿上」从不可见变可见；v1/v2 结构经版本门整体淘汰；判定条目加 ref 不进脚注）
node dev/e2e-render.js             # 演绎链路端到端（VLM 缓存/键隔离/画面指纹/模型换代自证/兜底/退役渠道拒绝/
                                   #   覆盖率自证：开关只在手动卡、随缓存落库复用、不传开关零改动；
                                   #   喂图自证（0012-01）：renderRoles 只含实际喂入（临时链接裁图可见）/
                                   #   张数按请求体实算 / 旧文档无字段回传 null 不猜）← 出图唯一守卫
                                   #   ⚠️ 2026-09-17.7（spec 0008-07）：`exports.main` 改成 start/poll 三分派、
                                   #      **原函数体整体改名为 `runLegacySync`**；e2e 走的是**无 action** 路径，
                                   #      故本文件**一行未改即全绿**（只同步了 2 处 build 断言字符串）= 等价性硬证据。
node dev/async-shell.test.js       # ⚠️ 2026-09-17.7（spec 0008-07 / 票 07）**新增**：异步外壳契约（15 门）——
                                   #   分派（start / poll / 无 action→runLegacySync）/ 契约字段形状 /
                                   #   **task 必进 `renderTasks` 集合（不得进 meta）** / `_openid` + `req` 落全 /
                                   #   poll 只一次 db.get / 后台段业务失败落 error 终态 / 旧路径零 task 副作用。
                                   #   反向验证见 `cloudfunctions/genLookImage/dev/shortcut-check-async-shell.js`（四组必转红）。
                                   # ⚠️ 2026-09-17.8（spec 0008-08 / 票 08）：**前端切 start/poll 轮询**后，本文件
                                   #   **一行未改即全绿**（本票不改云函数 ⇒ 云端全部门不受影响）= 纯前端票的硬证据。
                                   #   配件第二趟（票 0009）：J=帽+鞋进图/包被≤2 上限挤出/twoPass=full/两段缓存落库、
                                   #   J2=配饰临时链接全失败回退 partial 不危害主体、J3=partial 之后同输入重试必重跑第二趟
                                   #   （防「偶发失败被缓存腌成常发」）、J4=换配饰图只重跑第二趟 pass1 命中缓存省一半钱
                                   #   （含 J4c：两段全命中 → cached=true 且零出图）、J5=配饰图缺角时指令只提实际喂入的件（图号不错位）
                                   #   第一趟归属分流（票 0009-03）：K=帽/有图鞋撤出第一趟的画面输入
                                   #   （⚠️ 断言读**第一趟请求体的完整 prompt**，不用 900 字符截断的 promptUsed——配饰 token
                                   #   落在 desc 段尾，用截断版会因为「根本没截到」而假绿）、K2=无图鞋留在第一趟且不空跑第二趟、
                                   #   L=v11 时代的 pass1 缓存被 v12 失配重出（用 comboKey 显式造旧版本键）、
                                   #   **L2=输出尺寸进键**（票 0008-03 探针）：尺寸标签不同的旧缓存失配重出——
                                   #   尺寸从硬编码提成 env 后，「改 size 却命中旧尺寸图」是可达的静默失效（铁律①）
                                   #   第二趟按图号替换 + 指令即键（票 0009-04）：J 断言每行带 `If Image 1 already shows headwear,
                                   #   replace it with the one from Image 2.`（图号零歧义；含糊的「同类物品」模型在张力下不执行）、
                                   #   J6=只改单品名（不动 img）→ p2Key 必须变化且第二趟真的重跑（指令全文是键的输入）、
                                   #   M=v1 时代的 p2 文档不得被命中（版本盐真的参与键、禁止兼容层；baseKey 取自一次真实运行、
                                   #   `-p2-` 段按 v1 旧公式重算——⚠️ 它守的是「没人给 v1 加兼容读取」，
                                   #   **公式漂移不由它守**（那是 J4/J6 的活：直接比对实测 cloudPath，与公式无关）；
                                   #   J 还钉死 p2 文档 `secondPassVersion='v3'`（字面量，升版必须显式改这一行；
                                   #   票 0013-04 把 v2→v3：加了封闭世界约束 + 负向词 → 旧 p2 图必须作废）、
                                   #   J 另守「凭空补件」三层防御（票 0013-04）：② 第二趟指令含封闭世界约束
                                   #   （`Do not add any item that is not shown in the reference images.` + 点名 hat/bag）、
                                   #   ③ 第二趟请求体带 negative_prompt（中英双语，含 hat/帽）、
                                   #   ③' **第一趟请求体 negative_prompt === undefined**（单变量纪律——
                                   #   撤件可见性（票 0009-05）：V=开开关时 accessoryRoute 回传**中文**原因词
                                   #   （`超出第二趟上限`）与 secondPass 真名，且**命中缓存的那一次照报**
                                   #   （观测与缓存解耦——skipped 是 items 的纯函数，不是这一趟生图的产物）、
                                   #   V3=无平拍图 vs 超出上限两种原因词分得开（⚠️ 夹具用**无图帽**：
                                   #   无图鞋是「留在第一趟」、压根没被撤，不该进 skipped）、
                                   #   V4=partial 时 secondPass 照报（前端「配饰第二趟未生效」的判据）、
                                   #   V5=不传开关 → 响应里没有 accessoryRoute 键（AI 卡零改动）
                                   # 覆盖：请求体 model=qwen-image-3.0 / prompt_extend=false / n=1 /
                                   # size 走 QWEN_EDIT_SIZE env（默认 960*1696，1K/2K 同价探针）/
                                   # modelUsed+rewriteStatus+usageInfo 自证 / t2i 走 WANX_T2I_MODEL env / 传该早期模型被拒 / twoPass 自证
                                   # 阶段计时埋点（2026-09-17.4，修 -504003）：`lap(tag, startedAt)` 在 8 处接缝打
                                   #   `[lap] +Nms  <阶段>`（入口/缓存判定/描述完成/pass1 出图/pass1 存云+覆盖率/
                                   #   pass2 出图/落库扣费/返回）——**纯观测、零业务逻辑变更**（预算值与流程顺序全不动）。
                                   #   动机：真机超时日志只有平台级 `Duration: 60000ms`，60 秒里哪一段吃的不可见
                                   # 预算闸（2026-09-17.5，修 -504003）：e2e 场景 W1/W1b（覆盖率预估式闸：
                                   #   已花 35s + 预估 20s > 预算 50s → 跳过且零 VLM 调用，主图照交付；
                                   #   配对场景防「闸恒跳过」）+ W2/W2b（第二趟剩余预算闸：剩余 25s < 30s →
                                   #   主动降级 partial 且只跑一次多图调用；配对场景防「闸恒降级」）。
                                   #   ⚠️ 两组都靠**假时钟**（`simulateElapsed`）才能走到——真实夹具时间差 ~1ms ⇒ 闸不触发；
                                   #   假时钟的一次性偏移在 main 取 startedAt 时消费掉（差值才是闸的判据，常量偏移会被抵消）
                                   # 模型配置 env 化（2026-09-17.6）：H3=硅基流动**兜底模型**走 SF_I2I_FALLBACK /
                                   #   SF_T2I_FALLBACK（主模型返回业务错误 → 第二次请求的 model 必须等于 env 值；
                                   #   图生图与文生图两条路各测一次）+ H4=混元模型名走 HUNYUAN_IMAGE_MODEL
                                   #   （payload.model 与 modelUsed 同源；⚠️ 断言 capability id `hunyuan-image`
                                   #   **仍是字面量**——那是云开发 AI+ 的能力标识、不是模型名，故意不 env 化）+
                                   #   A3=[cfg] 启动配置自证（含兜底模型、且**不含凭据**）+ lap 行在 siliconflow 链路
                                   #   **不得**出现 qwen 模型名（防「观测撒谎」：写死 QWEN_EDIT_MODEL 会把错的模型名报成实际值）
                                   # 产出优先 + 降级可归因（2026-09-17.7，修「演绎必出光脚图」）：
                                   #   W3（pass1 耗时 20s 时第二趟稳跑 full——覆盖率的 6~28s 不再挤掉产出）+
                                   #   W3c（**两趟串行的物理上限**：pass1 吃 30.3s → 剩余不够第二趟 ⇒ 诚实降级。
                                   #        这是「60s 天花板不可绕过」的锚，也是异步化改造的立项依据；若有人放宽闸到
                                   #        「总能跑」，本门转红——那会撞死 60s 上限**连主图都丢**）+
                                   #   W3b（极端慢 45s 仍主动降级且原因自证 budget，与 W3c 配对防闸恒放行）+
                                   #   W4/W4b（覆盖率**跟着交付图落库**：full→落 p2Key 且 pass1 文档为 null；
                                   #        partial→p2 文档 null）+ **覆盖率必须读交付图**（URL 含 p2Key——
                                   #        这是「顺序对调」在离线可观测的唯一切面，mock 读图不吃时间、耗时差证不了顺序）+
                                   #   W5（降级原因受控枚举：no-photo-url 与 budget 分得开；无配饰时不乱报）
                                   #   ⚠️ 假时钟（simulateElapsed）仍是预算组的必要手段，且**新增语义断言**（coverageImgUrls）
                                   #      补足「顺序」这类无法用时间证明的性质

# prompt 纯逻辑（在 wardrobe-miniapp/ 下，不在 cloudfunctions/ 内——测试脚本不进部署包）
node dev/genLookImage/lookPrompt.test.js   # 上身图 prompt 构建门（wish/构图/缓存键/图序指代/配饰锚点/向后兼容/内搭分层动词/版型锚定/
                                           #   用户备注进缓存键 v8，spec 0011/**底图服装替换指令 v9 + 身形锚 v10 + 二分回退 v11，票 0012-03/04/05**：保留范围（含 height/limb proportions）；v10 的 fabric 从句已砍（真机回归）
                                           #   收窄到脸/发型/身形/姿势 + 按图号动态替换指令、缺角不虚指、回退路径逐字不变）；
                                           #   **v12（票 0009-03）：画面构成变化**（配饰撤出第一趟）——版本门 8b 同步升到 v12，
                                           #   每次 bump 都要显式改这道门（这是它存在的意义：版本换代必须被承认）；
                                           #   **0009-04**：新增 `WEAR_NOUN`/`wearNoun`（替换语的位置名词，与 `WEAR`/`wearVerb` 同住——
                                           #   「品类 → 画面措辞」只有这一个出口），其与候选品类的覆盖关系由 secondPassPrompt 门交叉校验
                                           #   **票 0013-01 光脚底图**：buildFraming(withdrawn) 纯函数门——withdrawn 含'鞋'→光脚变体
                                           #   (含 barefoot、不含 and shoes、保留 feet fully inside the frame)；空数组/只含'帽子'→原句(不强制光脚)
                                           #   **v13（票 0008-03）：衣物保真硬约束 + 上装槽内搭优先**——版本门升到 v13；
                                           #   新增 `fidelityClause` 纯函数门（三档：两槽/单槽/无槽，缺角**不虚指**图号、
                                           #   三要素「版型/颜色/材质」齐、含负面指令 + 「场景/光线/姿态自由演绎」划界句）；
                                           #   上装槽由「外套优先」翻转为**内搭优先**（夹具：外套+内搭+下装 → 上装槽是内搭）；
                                           #   新增 `outfitCoverageClause` 门（帽子并入构图主句 + 清单整体验收句）

# 配件第二趟纯逻辑（票 0009，与 lookPrompt 同目录 dev/ 不进部署包）
node dev/genLookImage/secondPassPrompt.test.js  # 第二趟纯函数门：pickAccessories 优先级(鞋>帽>包，2026-09-17 统一)/≤2 件/无图跳过/无配饰品类返回空；
                                                 #   buildPass2Prompt 保持基底(Keep Image 1 EXACTLY unchanged)+佩戴锚点(on the head/on the feet)+不改动其他元素+
                                                 #   Image 2/3 位置指代(≤2 件)+空列表优雅降级；导出常量(ACCESSORY_PRIORITY/ELIGIBLE)齐备；
                                                 #   **票 0009-03 归属分流 routeAccessories**：帽/包一律撤、鞋按有无平拍图分流、`配饰`(项链等)保留、
                                                 #   skipped 带真名 + 受控 why(no-photo/beyond-limit)、边界输入不崩，以及**不变量断言**：
                                                 #   撤掉的每一件要么被 pickAccessories(items) 接手、要么在 skipped 里被报告（不许静默消失）
                                                 #   **票 0009-04 按图号替换**：每行带图号+真名+位置动词+替换语、替换语必须与它那一件同处一行；
                                                 #   位置名词与位置动词**同源**（每个 ACCESSORY_ELIGIBLE 品类在 lookPrompt 里两样都得有，
                                                 #   漏登记 → 替换语静默消失）；未知品类 → 整句省略、绝不写半截句；
                                                 #   空列表 / null 优雅降级；「包」单件单独走一遍（优先级最低，在帽+鞋夹具里
                                                 #   永远被 ≤2 挤出 → 它的替换语只有单件夹具能覆盖到）；
                                                 #   ACCESSORY_SECOND_PASS_VERSION = **v3**（票 0013-04；改措辞必须作废旧 p2 缓存）
                                                 #   **票 0009-05 响应载荷 accessoryRoutePayload**：skipped 的 why 出
                                                 #   **受控中文词**（不是枚举——枚举管规则、中文管呈现，分两列）、
                                                 #   secondPass 出真名、kept 与 routeAccessories 逐字一致；无撤件 → 空数组
                                                 #   （不是 undefined，前端靠 Array 判断）；空/脏输入不崩（⚠️ 归一在这层做：
                                                 #   routeAccessories 自带防御、但它内部的 pickAccessories 没有）
                                                 #   **票 0013-04 封闭世界约束**（治「第二趟凭空补件」——真机实证 p2 无帽输入却出帽）：
                                                 #   `CLOSED_WORLD_CLAUSE` 常量插在「加配饰」句与 per-item 行之间
                                                 #   （Do not add any item that is not shown in the reference images. …）——
                                                 #   注意它**不得挤掉**「Keep Image 1 EXACTLY unchanged」那句（两句各管一头：保基底 / 禁新增）；
                                                 #   `EDIT_NEGATIVE_PROMPT` 常量（中英双语负向词表，帽子/包/配饰/多余衣物），
                                                 #   **只喂第二趟、第一趟绝不带**（单变量证明——第一趟没有新增对象的诉求，带了反而伤基底）；
                                                 #   两句都进 p2Key（指令全文已哈希，改词自动破键，版本盐 +1 属防御性而非必需）；
                                                 #   负向词走 `genByWanx(prompt, urls, negativePrompt)` 第三参——
                                                 #   **不传 = 请求体里没有该键**（刻意用条件展开而非空串：
                                                 #   空串在某些实现里会被当成"有这个参数"，那样"有没有"就不再可观）；
                                                 #   反向验证见 shortcut-check ⑯⑰⑱（一对"加了" + 一条"没加错地方"）
                                                 #   **票 0013-01**：routeAccessories/accessoryRoutePayload 一并返回 withdrawn 品类集合
                                                 #   （鞋被撤→含'鞋'、选鞋无图→不含'鞋'、帽/包撤→含对应品类；withdrawn 是 items 纯函数，与缓存解耦）
                                                 #   **票 0013-02**：buildPass2Prompt 鞋类升级「先脱后穿」强指令（含 `Remove any footwear` +
                                                 #   `wear exactly the shoes` + `matching its color, shape and details`，带图号挂自己行；
                                                 #   帽/包维持通用替换语（不含 remove-footwear）；与 0013-01 互不触碰函数、仅改替换语文本
                                                 #   （p2Key 键结构不变——指令全文仍进键、旧鞋图自然失配重出），反向验证见 shortcut-check ⑫
                                                #   **票 0013-03**：鞋类目归一防御——normalizeAccessoryCategory(cat) 纯函数门（运动鞋/靴子/单鞋/
                                                #   凉鞋/高跟/乐福/板鞋…及老爹鞋/帆布鞋/马丁靴等子类型→'鞋'，其余原样返回、空/异常不抛）
                                                #   在 pickAccessories/routeAccessories/buildPass2Prompt 匹配候选枚举**前**先归一 it.category；
                                                #   不污染衣橱原始 category（报告仍用 it.category）。反向验证见 shortcut-check ⑬（短路归一→子类型鞋不撤、P1c 转红）
node dev/shortcut-check-second-pass.js          # ⚠️ **反向验证脚本**（改动第二趟 / 第一趟归属分流逻辑时必须跑一次，逐轮跑 e2e）：
                                                 #   把 new 守卫条件**短路回旧写法** → 期望 e2e **必转红** → 自动还原原文件。
                                                 #   锚点用字面量精确匹配、未命中即报错退出（正则/中文漂移会让替换静默失效 → 假的"转红/转绿"结论）。
                                                 #   每个用例自带 target 文件（守卫不都在 index.js——0009-03/05 的在 lib/secondPassPrompt.js）。
                                                 #   条目：① J3 双重防御（命中判定 twoPass==='full' + partial 落库 fileID=null）
                                                 #        ② J5 配饰「件与图」成对过滤 ③ J4c cached 语义
                                                 #        ④ K 有图鞋必须撤出第一趟（短路成「鞋一律留」）
                                                 #        ⑤ K2 无图鞋必须留在第一趟（短路成「鞋一律撤」）
                                                 #        ⑥ J 短路掉 per-item 替换语（回到「只说 Add」）
                                                 #        ⑦ J6 短路掉 p2Key 里的指令全文（回到只哈希 fileID 串）
                                                 #        ⑧ V 短路「观测与缓存解耦」（撤件报告只在重画那趟报）→ 命中缓存那次空手
                                                 #        ⑨ V 短路 why 的**中文映射**（直接透出枚举 → 脚注印机器话）
                                                 #        ⑩ V5 短路「只在开关下回传」（AI 卡也拿到新字段 → 响应形状变了）
                                                 #        ⑪ P 短路 withdrawn 透传（恒空数组 → 第一趟永远不光脚 → P1 转红，证明鞋撤光脚由 route.withdrawn 驱动）
                                                 #        ⑫ P2 短路鞋分支（删掉「先脱后穿」段 → 鞋退化通用替换语 → P1/J 鞋句转红）
                                                 #        ⑬ P1c 短路鞋类目归一（归一恒失效 → 子类型鞋不撤 → P1c 转红）
                                                 #        ⑭ 短路配饰优先级回 spec 0004 的「包>帽>鞋」（丢的是**鞋** → J「pass2 指令应含鞋」转红）
                                                 #   ⚠️ ⑭ 存在的理由：候选恰 3 类 + 上限 2 件 →「取前 2」在不同顺序下**丢的不是同一样东西**
                                                 #      （鞋>帽>包 丢包 / 包>帽>鞋 丢鞋）。spec 0004 就是那本"现成活陷阱"，别照它改。
                                                 #        ⑮ 短路「输出尺寸进缓存键」（keyTag 只用模型名 → 尺寸标签不同的旧缓存被命中 → L2 转红）
                                                 #        ⑯ 封闭世界约束（0013-04：删掉 CLOSED_WORLD_CLAUSE → 正向防御消失 → J 转红）
                                                 #        ⑰ 负向词必须传进第二趟（0013-04：短路回"编辑分支漏传"的旧写法 → J 转红）
                                                 #        ⑱ 负向词**不得**进第一趟（0013-04：短路成无条件传参 → 单变量被破坏 → J8 转红）
                                                 #        ⑲ 衣物保真硬约束进第一趟（0008-03：删掉 fidelityClause 调用 → G 转红）
                                                 #        ⑳ 保真图号缺角不虚指（0008-03：短路成写死 Image 2/3 → **跑单测** → 缺角断言转红）
                                                 #        (21) 保真不得吞氛围自由（0008-03：删「自由演绎」划界句 → G 转红）
                                                 #        (22) 上装槽内搭优先（0008-03：短路回「外套优先」→ **跑单测** → G1b/T5 转红）
                                                 #        (23) 帽子并入构图主句（0008-03 追加范围：删帽子句 → **跑单测** → 帽子断言转红）
                                                 #        (24) 覆盖率闸必须预估式（2026-09-17.5：短路回「只看已花」→ W1 转红）
                                                 #        (25) 第二趟必须有剩余预算闸（2026-09-17.5：短路成无条件跑 → W2 转红）
                                                 #        (26) 硅基流动兜底模型必须走 env（2026-09-17.6：短路回硬编码字面量 → H3 转红）
                                                 #        (27) 混元模型名必须走 env（2026-09-17.6：短路回硬编码 → H4 转红）
                                                 #        (28) lap 出图日志不得撒谎（2026-09-17.6：短路回写死 QWEN_EDIT_MODEL → A3 转红）
                                                 #  2026-09-17.7 新增四条（产出优先 + 降级可归因）：
                                                 #        (29) 覆盖率必须对**交付图**算（短路回旧顺序「紧跟 pass1」→
                                                 #             覆盖率读的是 pass1 产出、URL 不含 -p2- → W4 转红）
                                                 #   ⚠️ (29) 的教训留档：本用例**初版写错过**——它短路「第二趟排在覆盖率之前」，
                                                 #      但 mock 的 readCoverage 瞬间返回、不吃时间 ⇒ **顺序无法用耗时差证明**，
                                                 #      初版短路后仍全绿 = 「靶子够不着的假守卫」，被脚本自己抓出来。
                                                 #      ⇒ 改守**语义**（覆盖率读的是哪张图）才可离线证。**顺序类性质要换可观测面**。
                                                 #        (30) 覆盖率必须跟交付图落库（短路回「无条件写进 pass1 文档」→ W4 转红）
                                                 #        (31) 第二趟降级原因必须回传（短路成不回传 → W3b/W5 转红）
                                                 #        (32) 降级原因判据必须分得开（短路成「一律报 budget」→ W5 转红）
node dev/shortcut-check-async-shell.js           # ⚠️ **外壳反向验证**（spec 0008-07 / 票 07，与上面那个**分开一个文件**）：
                                                 #   2026-09-17.7 新增四组（跑 dev/async-shell.test.js，非 e2e）：
                                                 #        ① 短路 start 分流（start 也走同步路径）→ 门 4 转红
                                                 #        ② 短路 RENDER_TASKS_COLL 回 'meta' → 门 8 转红（⚠️ 最重要的一道，
                                                 #              守的是「task 不许进 meta」——进则劫持 metaDoc、复现 09-05 真机坑）
                                                 #        ③ 短路「不看 out.error」（一律报 done）→ 门 13 转红
                                                 #        ④ 短路「无 action 也建 task」→ 门 15 转红（守「旧路径零副作用」）
                                                 #   ⚠️ 第 ③ 组的**初始版本是错的**，留档：我原本短路 `runRenderTask` 的 catch 回写，
                                                 #      结果**短路后仍全绿**——因为 `runLegacySync` 把异常都转成 `{error}` **返回**（不抛），
                                                 #      那段 catch 近乎不可达 ⇒ 守不可达的代码＝「靶子够不着」的假守卫。
                                                 #      ⇒ 改为守**可达**的那半边（业务失败必须落 error 终态），才真的会转红。
                                                 #      同族教训见 (29)（顺序类性质要换可观测面）。
                                                 #   新增守卫时**必须同步加一组**，否则新门可能只是"绿的假象"。
                                                 #   ⚠️ 用例可用 `test:` 指定跑哪个验证门（缺省 e2e）——有些守卫只在单测侧可证
                                                 #      （e2e 夹具恒为「三图齐喂」，缺角分支走不到，那是"绿的假象"的另一种形态）
                                                 #   ⚠️ 用例可用 `target:` 跨文件（首个跨文件项是 0008-03 的 lib/renderSlots.js）

# 小程序侧（在 wardrobe-miniapp/ 下）
node utils/looks.test.js           # mapLooks 字段透传（bloggerNote/provenance/inspoVerified）（2/2）
node utils/lookDiy.test.js         # spec 0011 手动搭配纯逻辑：每类 1 件（同品类替换而非追加）/最少件数/标题拼装（不产空标题）/
                                   #   已选栏**两组视图**（会进画面 vs 只按文字描述画，含"选上外套内搭跨组移动"）/
                                   #   无图单品不进画面 / 手动 look 字段形状（含**双端对拍**）。
                                   #   云侧同构份在 genLookImage/lib/renderSlots.js —— 漂移会让选品页对用户撒谎
                                   #   ⚠️ **票 0008-03 翻转**：上装槽由「外套优先」改「内搭优先」——
                                   #   「内搭会跨组移动」的既有 T5 用例已反向更新（外套掉第二组），
                                   #   双端对拍用例 [TOP_BEAT, COAT] / [COAT, TOP_BEAT] 同步（顺序无关性不变）
                                   #   **票 0009-05 撤件可见性 accessoryNote**：四种组合（只有 skipped / 只有 partial /
                                   #   两者 `；` 连接 / 都无 → `''`）+ 旧云端无字段不猜 + 无名条目不留空括号 +
                                   #   「没有配饰时不喊第二趟未生效」（假警报）+ 原因词原样印（映射在云端，前端不重算）
node utils/itemFilter.test.js      # spec 0011 筛选**共用**逻辑（衣橱页 + 选品页同一份）：四维筛选 / 关键词命中范围
                                   #   （名称·颜色·材质·版型，含 fit 为数组的存量形态）/ 脏入参不筛空 /
                                   #   「当前条件」文案 / 按品类分组（未知品类不丢）。抽出的唯一理由＝别让选品页有第二份
node utils/itemImage.test.js       # spec 0010 单品取图**唯一规则**：抠图结果优先→回退原图 / 脏值(含纯空白)防御 /
                                   #   allItemImages 删除时两文件都清且去重（6/6，含**双端对拍**）。
                                   #   云侧同构份在 genLookImage/lib/itemImage.js
node utils/matting.test.js         # spec 0010 抠图执行器「启动→轮询→终态」：done 无产物必须当失败 / retryable 原样
                                   #   透出云端判定 / 取消与真失败可区分 / 超时文案自证轮询次数（8/8）。
                                   #   上传页与编辑页共用这一份，判读错则两页同错
node utils/saveImage.test.js       # 保存到相册：调用顺序/失败分类(privacy vs needSetting)/原始 errMsg 透出（9/9）
node utils/manualPickHandoff.test.js  # spec 0011 跨 tab 交接槽（switchTab 带不了参数，见该模块头注释）：
                                      #   取即清（tab 来回切不反复重建）/ 两边都存副本 / 空交接归一为「没有交接」/ 覆盖写不排队
node pages/looks/sourceFilter.test.js  # 收藏页来源**四筛**（全部/跟博主学的/通用推荐/自己搭的）+ 向后兼容
                                       #   （无 source 字段的历史文档仍落通用推荐）+ 徽标文案/样式（sourceTag）
                                       #   + 入库标识值的格式钉桩 + 双列分列顺序契约（T7 = 最新一条在左上角）
                                       #   + hasDetail 可展开判定（判据必须与展开区字段一一对应）
node pages/recommend/cloudBuild.test.js     # 「云端构建够不够新」判据纯函数：`>=` 而非 `===`——
                                            #   云端比前端**新**必须放行（2026-09-18 第五次同族误报：前端
                                            #   `REQUIRED_CLOUD_BUILD` 忘了跟云端 `BUILD_TAG` 走，精确相等把
                                            #   「更新」判成「旧版本」→ 每次出图弹框 + `return` 吃掉 cached 提示）。
                                            #   ⚠️ **本门是唯一守得住「不得退回精确相等」的守卫**：
                                            #   `dev/recommend-page.test.js` 的夹具 = 要求值本身，短路成 `===` 仍绿。
                                            #   反向验证（已验）：把 `isBuildAtLeast` 短路成 String 相等 → 第 45 行必转红。
node pages/recommend/renderButtons.test.js   # 演绎按钮状态纯函数（两区共用一个渲染令牌：AI 卡下标 / 手动卡 MANUAL，
                                             #   互不误判）+ 换模特图只清 renderImage（清理不得越界到其他字段）（15/15）
node dev/recommend-page.test.js    # 推荐页控制器行为门（用桩驱动页面，**唯一能守「两区同帧清理」的门**）：
                                   #   换模特图两区同帧清 + AI 区为空时手动卡照样清 / 换一批只清 AI 区 /
                                   #   令牌互不误判 / 手动卡出图写回正确卡 / 全局单值令牌 / 在途拦选品入口 /
                                   #   出图期间换模特图 → 结果作废 / 两区收藏各写回自己那张卡 /
                                   #   跨 tab 交接在列表就绪后消费、且只生效一次 /
                                   #   **撤件可见性（票 0009-05）**：出图写回后脚注是**三段拼接**
                                   #   （覆盖率 · 喂图标注 · 撤件/第二趟），旧云端无字段时脚注逐字不变，
                                   #   换模特图后连第三段一起被清（复用同一 coverageText 槽 → 零清槽改动）
                                   #   ⚠️ **2026-09-17.8（spec 0008-08 / 票 08）新增 8 道轮询状态机门**：
                                   #   「start 未终态不得写图」/「done 时图与令牌**同帧**归零」/
                                   #   **「单次失败不判死、连续 3 次才放弃」**（省已花的出图钱）/ 3 次失败走 showModal /
                                   #   「storage 有在途 task → onShow 恢复轮询」（接住小程序被回收）/ 过期记录清掉不恢复 /
                                   #   「notfound 立即终态、不再轮询」/「终态收尾必须清 storage」。
                                   #   ⚠️ 门内用 `withFastTimers` 把轮询间隔压成 0ms（真实 1.5s/3s/5s 离线跑不动），
                                   #      **保留回调与次数**——断的仍是编排，不是被抹掉的时间。
                                   #   ⚠️ 既有 20 组行为门改走 `stubRender`（把 start+poll 拼成一次同步返回）：
                                   #      它们断言的是**行为契约**（结果怎么写回卡），而「同步一次调用」是被本票
                                   #      刻意移除的实现 ⇒ 门不该继续钉住实现，但断言逐字不变。
                                   #   反向验证见 `dev/shortcut-check-async-frontend.js`（六组必转红）。
node dev/pick-items-page.test.js   # 选品页控制器行为门。桩**下移到 DB 层**（`wx.cloud.database()`），
                                   #   真实 listItems 的分页 + sortByCat + imgView 派生整条跑：
                                   #   预选落「会进画面」第一组 / 无图件与无画面槽位的品类（鞋包帽配饰）
                                   #   如实落第二组 / 预选只生效一次（下拉刷新不复活已取消的）/
                                   #    id 已删时静默忽略 / 同品类替换
# ⚠️ dev/pageStub.js 是上面几个「页面控制器行为门」的**共用桩，不是测试门**，别把它当门跑。
#    它承载两处踩过坑的细节：setData 要同时支持 `a[0].b` 与 `a.b` 两种路径写法；
#    给 null 写子路径要直接报错（真实运行时那也永远是 bug）。
#    2026-09-17.8（票 08）补 `wx` storage 三件套（内存实现，有状态）——演绎改异步后，
#    在途 task 靠 `wx.setStorageSync` 跨页面实例存活，桩里不能是空函数，否则「onShow 恢复」驱动不起来。
node dev/shortcut-check-async-frontend.js  # ⚠️ **前端轮询守卫反向验证**（spec 0008-08 / 票 08，
                                   #   与 `cloudfunctions/genLookImage/dev/shortcut-check-async-shell.js`
                                   #   **分开一个文件**：那版碰云函数、本版碰 `pages/recommend/recommend.js`
                                   #   与 `utils/lookDiy.js`，混在一起会让「哪道门守哪件事」变糊）。
                                   #   跑 `dev/recommend-page.test.js`（第六组跑 `utils/lookDiy.test.js`），
                                   #   六组必转红：终态才写图 / 单次失败不判死 / onGenerate 渲染令牌守卫 /
                                   #   onShow 恢复在途 task / 终态清 storage / budget 不得承诺「重试可补上」。
                                   #   ⚠️ 锚点未命中即报错（否则会得到"短路成功"的假结论）。
                                   #   ⚠️ 实战教训：初版第 ⑤ 组**短路后确实转红，但红的是另一组的断言**
                                   #      （残留 storage 漏到后面用例）——反向验证不仅要求「必转红」，
                                   #      还要求**红在正确的那条断言上**；前者靠人读输出，后者靠用例间隔离。
node dev/fitTaxonomy.test.js       # fit 品类路由词表前端份 + 双端对拍守卫（T01，内部 require 云端 lib/fitTaxonomy 做对拍）
node dev/api.listItems.test.js     # utils/api.js listItems/listLooks：突破小程序端 20 条硬上限的 skip 分页 + 长裤/短裤回归 + 排序
node cloudfunctions/recognizeItem/lib/recognizeCore.test.js  # 识别核心纯函数（13/13）：剥 fence/解析/归一/品类兜底/pickFileID 拒本地路径
node cloudfunctions/mattingGoods/dev/cossign.test.js  # COS 请求签名：UrlEncode/HttpString/七段 Authorization/快照（ADR-0016）
node cloudfunctions/mattingGoods/dev/parse.test.js    # 数据万象错误七分类 + retryable（signature/arrears/notactivated/ratelimit/image/permission/unknown）
node dev/item-edit-fit.test.js     # T03 编辑页 fit 数组化：string 自愈/换品类重校验/保存落数组
node dev/item-edit-image.test.js   # spec 0010 编辑页图片四态清理矩阵：换图/移除必清 imgCut（防「新照片配旧抠图」）/
                                   #   抠图只写 imgCut 绝不覆盖 img / 取消抠图后可再抠 / 派生视图同帧落盘（10/10）
node dev/upload-entry.test.js      # 入口守卫：tabBar 4 个/pages[0]=上传/FAB 退场/item-edit 无 id 拦截/档案去 tab（0007）/抠图走 mattingGoods（ADR-0016）/**推荐页仅保留「演绎」单入口（旧双按钮已合并，0008-01）+ genImage 真依赖在收藏页、推荐页不得有代码级引用（0008-01）**
node dev/upload-queue.test.js      # T05–T07 上传全流程状态机：串行推进/失败重试/跳过退路/抠图+识别段/advance 门
node dev/item-doc.test.js          # T07 落库文档构建：fit 数组归一化/受控默认值/防晒衣映射/source 溯源
node dev/panel.test.js             # T08 调整面板纯函数：draft 构建/fit 品类动态分组/点选替换保位/切品类重校验
```

fit 词表（T01 / spec 0006 决策 8 / ADR 0014）云函数份测试在
`cloudfunctions/aiRecommend/dev/fitTaxonomy.test.js`（在 aiRecommend/ 下跑）。
T02（云函数批）+ T03（前端批 + contract）已完成：`slotMap.canonicalFit/fitConflicts`、
`layering`、genLookImage `fitPhrase` 兼容双形态并收敛单路径（先切分再逐段首命中）；fit
编辑三件套（fitGroups/toggleFitOption/setCategory）下沉 `utils/fitTaxonomy`（item-edit 与
upload-item 共用）；fit 编辑三件套测试 `dev/panel.test.js` + 编辑页守卫 `dev/item-edit-fit.test.js`。
**fit 升级闭环完成**——存量 DB/seed/recognizeItem 仍 string（读侧兜底），经编辑保存自愈。

### 3.5 平台硬限制速查（每条都是真机踩过的坑）

1. **小程序端 `limit` 默认/最大 = 20**，云函数端 100；`limit(200)` 静默截断到 20。全量须 `skip` 分页或挪云函数。
2. **云函数单次调用 60s 硬上限**；客户端 `wx.cloud.callFunction` 更短（~~实测 3s~~ **⚠️ 待核实 2026-09-15**：这条与 `genLookImage` 同步链路实测定时约 30 秒的事实**相互矛盾**——同步演绎能跑 30s 就证明客户端等得远不止 3s。两个数字可能各对一半（3s 或许是**冷启动/首次调用**的观测，长连接后续调用不受此限），核实前**不要基于「3s」这条结论做任何架构判断**（例如「必须异步拆段」）。核实办法：真机对同一云函数连续两次同步调用计时；结果回写本条 | `recognizeItem` 的 start/poll 范本成立与否也依赖此条）
3. **云函数 JS 首行禁 shebang**，否则上传包整体 parse 失败；测试脚本放 `dev/`。
4. **云函数写数据必须带 `_openid`**（`Object.assign({_openid: OPENID}, …)`），否则前端查不到。
5. **SiliconFlow `image_size` 白名单** `[512x512,768x1024,1024x576,576x1024]`；全身图用 `576x1024`；Qwen-Image-Edit 系列不接受 `image_size`。
6. **生成 + 缓存 key 必须带版本盐**：改 prompt → `PROMPT_VERSION`；改模型 → 键里的模型标签（`renderModelTag`）自动变，无需人工 +1；换人像底图 / 换单品平拍图（数据侧变化）→ 画面指纹（`renderSalt`）变。凡「影响画面的输入」变化都必须换键，否则旧图被继续命中（换人像底图仍出旧脸 = 此坑数据版）。2026-09-10：早期专用模型的专属键已随链路删除。
7. **meta 单例多文档自愈**：读全部 → **先按 `_openid === OPENID` 收敛到本人文档** → 再优先选含 `refImage`/`refImageType` 字段的 → 并列时 `_id` 大者优先。（旧方案 `orderBy('_id','asc').limit(1)` 读最早那条，正是「新字段丢失」事故根因，SETUP.md 旧文勿照做。）⚠️ **云函数是管理员权限，会读到库里所有人的 meta；小程序端受「仅创建者可读写」限制只能读到自己的**——不按 `_openid` 收敛，就会出现「档案页写 A 文档、云函数读 B 文档」，表现为「换了人像底图，AI 仍出旧脸」，而档案页照常提示「已更新」，毫无自诊线索（2026-09-05 真机坑；守卫 `e2e-render.js` 场景 I，已反证过断言非恒真）。
8. **`getTempFileURL` 的 `fileList`** 元素须为字符串或 `{fileID, maxAge}`（maxAge 必填）；返回须查 `fileList[0].status`。
9. **`wx.showToast` title 约 14 汉字截断**——拼接后端错误一律用 `wx.showModal`。
10. **URL 协议归一双层防御**：lib 层 `toHttps`（http→https）+ 抽取出口归一 + 下载入口再归一。阿里 OSS 签名 URL 默认 http，直接 `https.get` 会抛 `Protocol "http:" not supported`。
11. **云函数参数契约**：payload 直传（`call('fn', payload)`），禁散参 `call('fn',{a})` 多包一层；云函数侧用纯函数收敛入参。
12. **词表归一化**：fit 复合中文先过 `canonicalFit`；季节比较用字符级交集；品类必须用官方枚举。合成夹具测不出词表断裂——`realdata-gate` / `realdata-automap` 强制用真实数据跑。
13. **高德天气** `status:"0"` 才是错误（key 无效/额度），只看 HTTP 码会吞真因。
14. **外部链接被拦**（IG/小红书/抖音）：url 只作溯源文本 + 复制入口，禁设计成点击跳转。
15. **页面级「切类型」动作绝不动对应资源字段**；删云文件须等写库成功后。
16. **月度额度按北京时间（UTC+8）算月**：禁 `new Date().toISOString().slice(0,7)`——那是 UTC 月、慢 8 小时，每月 1 号 00:00–08:00 的生成会被记到上个月。云函数走 `genLookImage/lib/usage.js#localMonth`（`getTime()+8h` 后用 `getUTC*` 读，不随容器 TZ 漂移），前端 `pages/profile/profile.js` 有一份同构实现（小程序不能 require cloudfunctions 目录），**改一处必须同步另一处**；`MONTHLY_LIMIT` 同理两处各存一份（云函数环境变量默认 80 + 前端顶部常量 80），没有单一真源。票 0009 两趟渲染下每套最多 2 张（pass1+pass2）、按张数扣，月上限提到 80（≈40 套/月）。两端打架的症状：档案页显示「已用 0 / 80」，云函数却判「额度用完」。
17. **改完云函数必须「上传并部署」才生效，且前端要能自证云端跑的是哪一版**：`genLookImage/index.js` 顶部有 `BUILD_TAG`（**当前 `2026-09-18.4`** —— **异步外壳 start/poll**（spec 0008-07 / 票 07）：`exports.main` 改三分派 `action='start'`（建 task + fire-and-forget 后台段，立即回 `{taskId,status,build}`）/ `action='poll'`（一次 `db.get` 读 task）/ **无 action → `runLegacySync`**（＝原完整同步链路，**前端当前走此处**）；task 文档进**新集合 `renderTasks`**（⚠️ **不得进 `meta`**，理由见 ③.2 该集合处的长注释）；`stage` 受控枚举 queued/rendering/done/error。⚠️ **前端逻辑一行未改**，只把 `pages/recommend/recommend.js#REQUIRED_CLOUD_BUILD` 升为 `.7` + 重编译（**必需**：当时 `_warnIfOldBuild` 判据是**精确相等**——⚠️ **2026-09-18 已改为「不低于」**，见 `pages/recommend/cloudBuild.js`：云端比前端**新**不再误报，云端升号也不再需要同步前端常量）。⇒ **本版部署后线上行为零变化**（可独立验收）；切前端轮询是 B 票（票夹 `08-async-genlook-frontend.md`，**尚未拆票**）。
     - ⚠️ **部署需先建集合**：云开发控制台新建 `renderTasks`（权限「仅创建者可读写」），否则 `start` 写 task 直接失败。
     - 号段说明：`.7` 分配给**异步化**；此前口头提过的「覆盖率后移 + `PASS2_BUDGET_MS` 修正」**从未升号**（那部分仍写在本条历史里）⇒ `.6` = 「未部署的 0009-05 + 0013 合集」。
     - **2026-09-18 一日四跳**（全部围绕「演绎出图」的时长/配饰/自证）：`.1` 预算闸阈值回退 `35600→30000`（`b9973c1` 把 pass1 实测 29.7~35.7s 与闸冲突，第二趟结构性必跳）→ `.2` pass2 委托独立 invocation（**治标过头**：串行叠加把总时长翻倍到 133s）→ `.3` 修 `delegatePass2` 的 `await` + 默认尺寸 `960*1696→768*1344` → `.4` **撤销委托回同实例两趟** + 尺寸 `768*1344→640*1120` + VLM 描述前置（`action:'describe'`）+ pass1 检查点 `stage:'pass1-done'` + 「补生成」重试（只重跑 pass2）。
       ⚠️ 同批修掉一个**自证型缺陷**：`REQUIRED_CLOUD_BUILD` 停在 `2026-09-17.7` 忘了跟走，而 `_warnIfOldBuild` 当时是**精确相等** ⇒ 云端 `.4` ≠ 前端 `.7` ⇒ **每次出图弹「云端还是旧版本…功能不会生效」**（内容与事实相反），用户反复部署也消不掉；其 `return false` 还吃掉 `cached` 提示。**判据已改为「不低于」**（`pages/recommend/cloudBuild.js`，第五次同族复发后从根上改），此后云端升号不再需要碰前端常量。
       ⚠️ **`.4` 尚未部署** ⇒ 部署后 `[cfg]` 应见 `"build":"2026-09-18.4"`、`"qwenSize":"640*1120"`；且**前端必须重新上传**（`REQUIRED_CLOUD_BUILD` / `cloudBuild.js` / 补生成 UI 都是前端代码）。
     - **验收入口（不依赖前端）**：控制台手动 `callFunction({name:'genLookImage', data:{action:'start', itemIds:[...]}})` → 拿 `{taskId,...,build:'2026-09-17.7'}` → 再 `{action:'poll', taskId}` 轮询到 `done`。
     - 历史：`2026-09-17.6` —— **模型配置全 env 化**（三处：① 硅基流动**兜底模型** `SF_I2I_FALLBACK`/`SF_T2I_FALLBACK`（此前写死；主模型换代而兜底不换 = 「换了却没真换」）；② 混元模型名 `HUNYUAN_IMAGE_MODEL`（此前硬编码在 payload，是最后一个「换模型必须改代码」的出口）+ `modelUsed` 由写死的 `'hunyuan-image'` 改为真实模型名；③ 启动打印 `[cfg]` 生效配置）。⚠️ **不改任何模型的实际取值**（默认值即当前生产值）⇒ 缓存键不变、旧图全复用。⚠️ 同时修了一处**观测撒谎**：`lap('pass1 出图返回 (model=…)')` 原写死 `QWEN_EDIT_MODEL`，走 siliconflow/hunyuan 时日志会把错的模型名报成实际值）+ **预算闸**（修 -504003：① 覆盖率闸改**预估式**（判据「已花 + 20s 预估 > 50s」，旧判据「已花 > 40s」真机失效过一次——pass1 出图 29.9s 放行后又吃 28.7s，主图丢了）；② 第二趟加**剩余预算闸**（`PASS2_BUDGET_MS=30s`，剩余不够就**主动降级** `twoPass='partial'`，不再被动被掐死）；两者均为防御性，命中时只「少一行核对」/「少一件配饰」，**主图绝不丢**）+ **阶段计时埋点**（`lap()` 8 处接缝，纯观测、零业务逻辑变更；动机：真机超时日志里只有平台级 `Duration: 60000ms`，60 秒里哪一段吃的完全不可见）+ 票 0008-03 **衣物保真硬约束 + 上装槽内搭优先**（`PROMPT_VERSION` v12 → **v13**：`fidelityClause` 分两支按图号点名衣物、版型/颜色/材质三要素齐 + 显式允许场景/光线/姿态自由演绎；`pickRenderSlots` 由「外套优先」翻转为**内搭优先**；`outfitCoverageClause` 帽子并入构图主句 + 清单整体验收句）与 0013-04（第二趟封闭世界约束 + `negative_prompt`）**共用一次部署收口**；⚠️ 「配饰优先级统一为 鞋>帽>包」也在本次部署内，此前 `2026-09-16.5` 为票 0009-03 的批次：**第一趟归属分流**——配饰（帽/包，及**有平拍图**的鞋）撤出第一趟的画面输入（`lib/secondPassPrompt.js#routeAccessories`），只交给第二趟照实物画；无平拍图的帽/包撤了没人接 → 记进 skipped 等票 0009-05 点名；`PROMPT_VERSION` v11 → **v12**（画面构成变了、旧图本身是错的 → 旧缓存全失效重出）。真机病灶：第一趟配饰无图位、只有文字 → 模型照「帽子」两字瞎猜（选的鸭舌帽被画成渔夫帽），第二趟再叠加成一顶「三杠标渔夫帽」；2026-09-16.4 / 票 0009：**配件第二趟（twoPass）**——第一趟画人衣主体（现状不动），第二趟以第一趟产出为基底 + ≤2 件有平拍图的配饰（鞋>帽>包）再编辑一次，保持基底只加配饰；响应新增 `twoPass`（none/partial/full）自证；两段独立缓存键（key + p2Key，换配饰图只重跑第二趟省一半钱）；额度按实际生成张数扣（每趟新生成 +1）；PROMPT_VERSION 不动（首趟措辞未变，旧缓存全复用）；2026-09-16.3 / 票 0012-06：**特征级验真**（COVERAGE_VERSION v2 → **v3**）——coverage 判定输入升多图（生成图 + 有图单品参考图），「上身/出现」必须与参考图比对特征；判定条目加 ref（进 genCache 不进脚注）；PROMPT_VERSION 不动（纯观测升级）；2026-09-16.2 / 票 0012-05：**二分回退**（PROMPT_VERSION v10 → **v11**）——v10 真机回归（裤子连续多张不上身），fabric 从句砍掉、身形锚保留，若 v11 仍失败下一步砍身形锚；2026-09-16.1 / 票 0012-04：还原度微调二连（PROMPT_VERSION v9 → v10）——keep 清单点名 height/limb proportions + 替换句挂 exact fabric/color，真机 A/B 驱动；2026-09-15.5 / 票 0012-02：覆盖率口径升**三态**（COVERAGE_VERSION v1 → **v2**，上身/出现/找不到 → worn/present/missing）——真机实证「裤子没上身、脚注却 ✓」，二元口径吞掉「画了没穿上」；2026-09-15.4 / 票 0012-03：主体句加**底图服装替换指令**（PROMPT_VERSION v8 → **v9**）——真机实锤三图齐喂但腿上是底图原裤，旧句「exactly as she is」是帮凶；措辞变 = 全部旧缓存失配重出；2026-09-15.3 / 票 0012-01：喂图自证——`renderRoles`（实际喂入角色序列）/ `inputImages` 随 genCache 落库并回传，**不进缓存键**，旧文档无字段回传 null；2026-09-15.2 / spec 0011 / 票 0011-07：覆盖率自证——出图后用视觉模型逐件判「图上可见吗」，手动卡专属开关 `coverage`，**结果不进缓存键**但随 genCache 落库（带 `coverageVersion`）命中时白拿；2026-09-15.1 / 票 0011-01：组合缓存键纳入用户备注，`PROMPT_VERSION` v7 → **v8**；2026-09-11.1 spec 0010：图片拆两字段 + 取图规则唯一；2026-09-09 T02：fit 数组迁移 slotMap/layering/fitPhrase 兼容 string[]；2026-09-08 spec 0005：套内契约+叠穿闸门+分层措辞+版型锚定+裤裙层次锚点+`VLM_DESC_VERSION` v2），两个出图出口（新生成 / 命中缓存）都回传 `build`；`pages/recommend/recommend.js` 顶部有同构常量 `REQUIRED_CLOUD_BUILD`，不一致就弹「云端还是旧版本」。⚠️ 与 `MONTHLY_LIMIT` 一样是两处各存一份（小程序不能 require cloudfunctions 目录），**改任一边必须同步另一边**，否则前端会一直误报。来历（2026-09-05）：「换了人像底图，AI 仍出旧脸」代码改对、回归全绿，真机却照旧——真因是云函数没部署，而这类错位在界面上完全静默，用户分不清「没部署 / 缓存没失效 / 读到别人文档」三种可能（守卫 `e2e-render.js` 场景 G2b / H2）。

18. **数据万象 GoodsMatting 走 COS 请求签名（自签 sha1，不引 SDK）**：`GET ?ci-process=GoodsMatting&detect-url=<公网URL>` 返回 `image/png`（透明底真抠图）。签名七段 Authorization（`q-sign-algorithm`/`q-ak`/`q-sign-time`/`q-key-time`/`q-header-list`/`q-url-param-list`/`q-signature`），链路 KeyTime→SignKey→HttpString→StringToSign→Signature（HMAC-SHA1）；COS 的 UrlEncode 在 `encodeURIComponent` 基础上**额外编码 `!'()*`**。**detect-url 依赖临时链接在抠图期间有效**——`getTempFileURL` 拿到的链接有时效，必须**拿到即用**（不可缓存链接）。前置条件缺一必报错：① 桶已绑数据万象 ② 已开通「AI 内容识别」 ③ 密钥有 `cos:GetObject`+`ci:CreateGoodsMattingJob`。错误体是 XML（COS 风格）或 JSON，七分类 + `retryable` 见 `cloudfunctions/mattingGoods/lib/parse.js`（欠费/未开通/签名/权限四类重试无意义）。⚠️ 价格：0.01 元/次（2023-12-01 调价后实际价 = 通用抠图 0.02 元/次 × 抵扣 2:1；ADR-0015 原写即正确，0.14 元是调价**前**旧价——本文件 09-10 初稿曾误「更正」为 0.14 元，已撤销）、免费 1000 次/2 月。

19. **跨页面传值的三条微信限制**（2026-09-15 spec 0011 / 票 0011-06 踩到，都是真机上**不报错**的那种）：
    ① **`wx.switchTab` 不能带参数**——它只接受 `url`，query 被忽略。要跳到 tab 页并传值，只能借道
    「一次性交接槽」（`utils/manualPickHandoff.js`，ADR-0017）或落库。**不要试图在 url 里塞 `?a=1`**：
    不报错、值静默丢失。
    ② **tabBar 页面不能用 `wx.navigateTo` 打开**——`navigateTo` 只对非 tab 页有效，对 tabBar 页会
    **静默 fail**（不弹错、不跳转）。跳 tab 页一律 `switchTab`。
    ③ **路由的 `events` 事件通道只在「上级 → 下级页面」之间成立**。`navigateTo` 开的子页
    `getOpenerEventChannel().emit('x', …)` 能回到**开它的那一页**；跨 tab、或回到更上层，
    这条通道不存在（子页里 `getOpenerEventChannel` 会抛，必须 try/catch 兜底）。
    → 推论：**「哪个页面开的选品页，结果就回到哪个页面」**。衣橱页开的要送到推荐页 tab，
    所以必须先落槽再 `switchTab`（见该模块头注释里的三点取舍）。

---

## 4. 活跃问题（2026-09-03 核对；2026-09-05 逐项代码核验，见各条末「核验」；修掉一条就更新状态并标日期）
| # | 问题 | 状态 | 指向 |
|---|---|---|---|
| 1 | ~~早期专用模型 55s 超时~~ | **已随该模型链路退役关闭**（2026-09-10，tickets/0008-02）：该模型列入百炼 10-10 下线清单且无对等替代，入口与链路均已删除，此问题不存在了 | `docs/tickets/0008-*`；2026-09-10 |
| 2 | **10℃ 双闸零案例**：衣橱无厚款，冬案例硬约束不可满足 → 注入空集合 | 真局限非 bug，诚实降级正确（`caseGate.js:128` `if(!feasible.length) return []`）；可选增强 = 案例库补「厚外套」类以扩大冬季可满足集 | ADR-0012；2026-09-05 核验 |
| 3 | **meta 集合可能存在多条历史文档**：读取已自愈（③.5-7），但脏数据仍在库里 | **代码已修待验证**：`_openid` 收敛 + 含新字段优先 + `_id` 大者优先已落地（`genLookImage/index.js:68-88`），e2e T10 覆盖；残留脏数据**需控制台核对、先备份后清理**（运维动作非代码修复） | ADR-0012 附录 8；2026-09-05 核验 |
| 4 | **结构孪生案例**（p-001/007、p-002/004）：同一 look 满足多条，落注入序在前者 | 诚实但损失信息量（`provenance.js:250-277` 结构满足主闸 + 次级排序选最优）；展示层合并方案待定 = 设计决策非 bug | ADR-0012 附录 7；2026-09-05 核验 |
| 5 | **personal 案例前端渲染形态**：三行内容（items/colorLogic/transferable）后端已进 provenance、前端 `recommend.wxml` 三段式已渲染 | **代码已修待部署**：CONTEXT 原描述「只显示署名·不渲染」已过时，建议标**关闭**；重部署后真机可见折叠三段式（她那套/为什么好看/能迁移的） | ADR-0008 未决项；2026-09-05 核验 |
| 6 | **recommend.js 的 caseStats 渲染遗留**：脚注统计与渲染逻辑历史遗留 | **部分修**：caseStats 已重做为「博主案例是否到云端」自证脚注并正常渲染（`recommend.wxml:139-143`）；仅剩 `aiRecommend/index.js:90` 一处无害 debug `console.log` 待顺手清理 | 当日日志；2026-09-05 核验 |
| 7 | ~~换人像底图后仍显示旧脸~~ | **已被 0008-01/02 取代关闭**（2026-09-10）：旧试穿入口退役、早期模型键域删除；演绎链路的同款问题由「画面指纹 renderSalt + 换人像底图清 renderImage」继续防守（守卫 e2e-render 场景 C/G2） | `docs/tickets/0008-*`；2026-09-10 |
| 8 | **抠图整体改腾讯云数据万象 GoodsMatting**（色键+百炼链路退役，ADR-0016） | **代码完成、本地全绿（30 测试门）；卡在用户侧开通 + 部署**：需用户 ①注册腾讯云+实名 ②建 COS 桶并绑定数据万象 ③开通「AI 内容识别」 ④`COS_SECRET_ID`/`COS_SECRET_KEY`/`COS_BUCKET`/`COS_REGION` 配到 mattingGoods 环境变量 ⑤**云开发控制台手动删除已部署的旧 mattingAI**；然后「上传并部署 mattingGoods」+ 重新编译前端 → 真机传图验抠图质量。失败时按弹窗文案定位（七分类 kind：签名/欠费/未开通/限频/图片/权限/未知） | ADR-0016；2026-09-10 |
| 9 | **保存到相册总失败**（推荐页 + 收藏页点「保存到相册」必失败） | **进行中·根因待定案**：静态排查已排除代码层（调用顺序正确 = 先 downloadFile 拿 tempFilePath 再喂相册；参数绑定正确；fileID 是合法 `cloud://`）。已做：把原先被 `.catch` 吞掉的 errMsg **分类暴露**（`privacy` = 后台未声明相册权限 / `needSetting` = 用户拒过授权），并抽成 `utils/saveImage.js`（**两页共用**，9 条断言）。**待用户真机点一次、把弹窗里的原始错误带回**。最可能根因 = mp 后台《用户隐私保护指引》未勾「相册（仅写入）」（旁证：上传照片正常说明配过读取侧，但**写入是独立一项**，漏了即 100% 失败） | `utils/saveImage.js`；CHEATSHEET §0.6；METHODOLOGY §4.6.2 + §7 事故五 |
| 10 | **bloggerNote 全产品下线后链路仍在产出**（懒懒签名） | **已下线界面·链路清理待拍板**：推荐页 09-08、收藏页 09-10 均已移除渲染，前端四处已删干净 → 云函数 `aiRecommend` 仍在生成、推荐页收藏入库仍写入、4 处测试仍在断言，属"有产出无消费"。清理需重新部署云函数 + 同改 4 测试 + 2 文档，**下次动 aiRecommend 时顺手做掉**。**2026-09-10 追加同批项**：`lib/slotMap.js` 的 `CATEGORY_TO_AITRYON_SLOT`/`categoryAitryonSlot` 已无消费方且名字带已退役模型，同批清理 + 同步 slotmap-array.test.js | METHODOLOGY §3.7；CHEATSHEET §1/§2；`docs/tickets/0008-02` 实施备注 |
| 11 | ✅ **2026-10-10 百炼模型下线：演绎链路断供 → 已解除**（`qwen-image-edit-plus` / `-2025-10-30` 及全族 11 个模型，替换 `qwen-image-3.0`；**同批早期专用试穿模型也下线且无对等替代**） | **01/02 已实施（2026-09-10）**；**A/B 已于 2026-09-17 执行完毕并定案**（`tickets/0008-*/05-model-ab-runbook.md` 第 7 节）：① 帽子维度 **edit-plus 0/3 vs 3.0 0/3 ⇒ 不可结论**（`0/3` 单侧 95% 上界 ≈63%，**不得**宣称「3.0 修好了」）⇒ 按预设判据直接立「封闭世界约束 + 编辑分支补 `negative_prompt`」；② 画质维度（用户主观，n=3/臂）**3.0 人像/模特还原更好、衣橱单品还原更差**，edit-plus 反之 ⇒ **底座维持 3.0、env 覆盖已删并已自证**（生产回代码默认，`modelUsed` = `qwen-image-3.0`；且 **0013 主路径在 3.0 上复验通过** = 鞋撤光脚在新底座仍有效）。**本行断供风险自此解除。** 03 衣物保真约束 + 双衣物槽：**Blocked by 02 已解除**；**两条探针已于 2026-09-17 执行完毕、两条退路均为否**（`-pro` 不改善衣物还原；2K **结构性超时不可用**，见 #12b）⇒ **03 改为「按原设计实施」、不降级**（见 `tickets/0008-*/06-...runbook.md` 第 5/5.5 节）；04 输入图归一 待做。**官方通知期：快照模型 30 天、主线模型 3 个月**——当初钉快照 `-2025-10-30` 才落进 30 天窗口，迁主线即恢复 3 个月 | 公告 notice-118434；`docs/tickets/0008-*`；2026-09-10；**2026-09-17 定案 + 探针收口** |
| 12 | ⚠️ **输入图约束（10MB 硬限 / 建议 384~2048px / 面积 >2,250,000 记 2K 输入档）vs GoodsMatting 输出原图分辨率透明 PNG** | **待验证·独立一票**：`items.img` 现无任何尺寸/体积归一（上传链路未传 `sizeType`，全库无压缩）。**GoodsMatting 一部署即可能报 `BadRequest.InputDownloadFailed` 或静默按 2K 档涨价。** 需先做两个验证：① 透明底进 I2I 是否需先合成底色；② 缩放任数据万象输出链（零新增依赖，待验证链式支持）还是上传前客户端压缩。见票 04 | `docs/tickets/0008-*`/04；2026-09-10 |
| 12b | 🔺 **「同步 + 两趟串行」撑不住更高输出尺寸**（2026-09-17 由探针 B 实测发现）：`genLookImage` 是**同步**云函数、pass1→pass2 **串行**，执行超时上限 60s。把输出提到 2K（`1152*2048`，像素 **+45%**）后**必现** `-504003`（= `FUNCTIONS_TIME_LIMIT_EXCEEDED`，**云函数执行超时**）。**证据**：`looks/` 里只有**第一趟**的产物（第二趟被掐断）、重试必现、超时已确认配 60s；1K 两轮（3.0 / `-pro`）均能跑完。⇒ 是**架构级冲突**（`2K 更慢 × 两趟串行 ≥ 60s`），**不是配置问题、加超时治不了根**（云端上限即 60s）。⚠️ **连带风险已发生**：第一趟图已**生成并计费**却被掐断、前端拿不到（与 0011-07「出图预算被非主结果挤爆」同族）。💡 缓解事实：那张孤儿 pass1 图**键独立于 `p2Key`** ⇒ 重试时 pass1 命中缓存、不重复花钱（`index.js:281`）——**失败别删缓存**这条纪律在此直接省钱 | **要走 2K 的唯一正路 = 把 `genLookImage` 改造成 start/poll 异步双段**（仿 `recognizeItem` / `mattingGoods` 既有外壳），需**独立立票**。⚠️ 异步化时须一并重排 `0011-07` 的覆盖率检查预算。**本项不阻塞任何在途票**（2K 已判定不转正，`QWEN_EDIT_SIZE` env 机制保留待用） | `docs/tickets/0008-*/06-...runbook.md` 第 5.6 节；2026-09-17 |
| 12c | 🔥 **「1K + 两趟串行」同样撑不住**（2026-09-17.7 真机实证，与 12b 同根但**更严重**）——用户点演绎必得**光脚图**：`looks/` 下只有一张（pass1）、脚注「配饰第二趟未生效」。埋点时间账（真机 21:11）：`+29732ms pass1 出图返回 → +30316ms 覆盖率跳过（耗时 0）→ +30491ms pass2 跳过（剩余 29509ms < 预算 30000ms）`。⚠️ **关键澄清（修正一次错误归因）**：覆盖率**没有**吃时间（预估式闸已跳过），**30.3s 全是 pass1 自己吃的** ⇒ **顺序对调救不回这一次**。实测：`pass1 29.7s + pass2 29.7s + 收尾 1.1s = 60.5s > 60s`；且 pass1 出图在**两次独立真机**中稳定 29.7~29.9s（非偶发波动）。⇒ **1K 档的两趟串行就是放不下的**（e2e 场景 W3c 已锚住这个上限）。⚠️ 反过来说：**「有配饰的搭配 = 必然拿不到配饰」**，这不是概率问题 | **2026-09-17.7 已做的（消除无谓浪费 + 让降级可归因）**：① 覆盖率后移到第二趟之后（产出优先于核对）；② `PASS2_BUDGET_MS` 判据修正为「单趟×1.15 安全系数 + 收尾 1.1s = 35600ms」；③ 覆盖率跟着**交付图**落库（原先无条件写 pass1 文档 = 下次命中白拿对不上图的判定）；④ 降级原因受控枚举 `pass2SkipWhy`（budget/no-base/no-photo-url/error/unknown）。**根治仍须同 12b 的异步化**（两条可由同一张票收口）。**2026-09-17 22:58 定案：B 票已拆**（`08-async-genlook-frontend.md`）；**2026-09-18 已实施**（spec `docs/specs/0008-08-async-genlook-frontend.md`，40/40 门绿 + 前端反向验证 6/6 必转红）——grill 十一问的结论：① 前端切 `start`+轮询后 **pass2 获得独立 60s 窗口**（不再与 pass1 共享）⇒ **物理上放得下**；② **不细化 `stage`**（细到 pass1/pass2 要改云函数、破 A 票单变量归因；改用**前端本地计时**给「没死」的确定性）；③ `taskId`+`target` 落 `wx.setStorageSync`，`onShow` 恢复（接住「小程序被系统回收」）；④ `poll` 网络抖动**连续 3 次**才放弃（单次失败不判死，省已花的钱）；⑤ **不加取消入口**（取消只停前端、云端拦不住且**钱不退** ⇒ 歧义大于收益）；⑥ **顺带收掉两个既有缺陷**：`onGenerate`（换一批）缺 `rendering` 守卫（轮询把静默错位窗口 ×2~3）+ `pass2SkipWhy='budget'` 的「重试一次通常可补上」是**空头支票**（本行已证必然复现）改诚实版；⑦ **纯前端票**——云函数一行不改、`BUILD_TAG`/`REQUIRED_CLOUD_BUILD` 均不动、**只需重新编译前端**。⚠️ **待真机验收**（关键读数：日志应出现 `action=start`/`action=poll` 而非只有 `<legacy>`；选带配饰的 look 应真出配饰）。💡 待实测的 ① 退路（降 `QWEN_EDIT_SIZE` 换速度）**仍未跑**：探针脚本 `dev/probe-size-speed.js` 就位（需 `WANX_KEY` + 一张公开参考图，手跑一次）——**它只在「B 票上线后仍不够快」时才有价值** | `docs/specs/0008-08-async-genlook-frontend.md`；`docs/tickets/0008-model-lifecycle-migration/08-*.md`；`cloudfunctions/genLookImage/index.js`（`PASS2_*` 常量 + 覆盖率段）；e2e 场景 W3/W3c/W3b/W4/W4b/W5；2026-09-17 |
| 12d | **`renderTasks` 任务文档无清理策略**（2026-09-17.7 随异步外壳引入）：`start` 每次演绎写一份 task 文档（含 `req` + 终态 `result` 全量），**无 TTL** ⇒ 会无限累积。当前量级（单人自用、月上限 60 张）不痛，但属「早该记下的欠账」。⚠️ **2026-09-17.8（票 08 上线后风险上升）**：前端已真走 `start`/`poll` ⇒ task 文档现在**每点一次演绎就真的会写一份**（此前 A 票部署后前端未调用，等于零产出） | **待决**（不在 A/B 票）：① 落库时写 `expireAt` + 云开发 TTL 索引（最省事）；② 定时云函数清理 N 天前的终态文档；③ 终态时**删掉 `req`** 缩减体积。⚠️ 别忘了 `status='processing'` 的**僵尸 task**（后台段被 60s 硬杀时留下）——它们永远不会到终态，清理策略要能覆盖。**票 08 已在前端兜住这一半**：`onShow` 恢复时丢弃超 120s 的旧记录、轮询本身也有 120s 硬上限 ⇒ 用户侧不会干等，但**云端文档仍会残留** | `cloudfunctions/genLookImage/index.js`（`RENDER_TASKS_COLL`）；`pages/recommend/recommend.js#_resumeRenderTask`；2026-09-17 |
| 13 | **2026-09-16 晚：0009-01 真机验收暴露分工缺口，收口票已立项** → `docs/tickets/0009-two-pass-rendering/02-accessory-ownership.md`（**ready-for-agent**，不新增接缝）：① 第一趟撤帽/包（鞋按有无平拍图分流：有图撤、无图留）；② 第二趟 `Add` 改「按图号替换同位置」；③ 撤掉的件点名进现有脚注（复用 `coverageText` → 零清槽改动）；④ `p2Key` 纳入指令哈希 + 第二趟盐升 `v2` + `PROMPT_VERSION` v12；⑤ Bug C（第二趟无身份锚致脸/身形漂移）留档不动。真机病灶：**第一趟凭空画渔夫帽 + 第二趟与所选鸭舌帽融合**。**配饰（帽/鞋/包）演绎时常丢失**：参考图槽位仅 3（人+上+下），配饰只进 prompt 文字，与几十条指令竞争且画面位置最差（帽在顶/鞋在底）——结构性丢失非偶发 bug | **已立项·待实施 + 观测手段已就位**：两趟生图（第一趟人衣主体，第二趟以第一趟产出为基底 + ≤2 件配饰平拍图「贴」上去，失败回退第一趟）。⚠️ 现状是**单趟**，两趟从未实现；延时翻倍可能撞云函数 60s 上限，首跑计时后再定是否异步拆段。**建议排在 0008-03 之后**。**2026-09-15（spec 0011 / 票 0011-07）：观测手段落地**——手动卡的演绎图现在会出图后用视觉模型逐件判「图上可见吗」并渲染脚注（`lib/vlmDescribe.js#parseCoverage`，结果随 genCache 落库）；**首批数据已采集（2026-09-16，v11 / BUILD_TAG 2026-09-16.2）**：同套搭配（内搭+外套+裤子+帽+包）连出 3 张，**帽子/包 3/3 判 ✗ 且与肉眼一致**——文字-only 件从不进画面，结构性丢失成套实证；内搭 3 张里被判「上身」×2（肉眼未出现，人物穿着外套被名字级对账匹配）——coverage v2 的误判样本，特征级验真（参考图对账）的立项依据。**2026-09-16 15:10（0012-06 v3 部署后两轮验收）**：内搭×/帽子×/包包× 两轮全失败坐实配饰结构性丢失（内搭亦从未成功渲染）；速干裤 ▲→✓ 两次不一致 = v3 如实报、暴露 v11 措辞出图波动（非 0012-06 回归）；牛仔衣（上装）✓ 稳定。0009 证据已极充分，建议排期。**0009 的优先级证据已齐，待排期**。**2026-09-16 15:52 grill 把「内搭没上身」拆为三独立病因**：A=动词强制露下摆（`lookPrompt.js:315`，票 **0012-07** 几何无关化+防变形护栏，待段 V 真机验证）；B=内搭图被 `renderSlots` 丢（同归 top 槽、有外套时图位给外套，**并入 0009 第二趟**）；C=0012-06 判定无遮挡概念（被设计遮挡判 ×，后续票 **0012-08** 改 `worn(occluded)`）。**用户露脐款+长外套的「内搭×」多属 C（判定误报非生成失败）**。**2026-09-16 16:49 段 V 实测证伪动词方案（病因 A）**：旧动词基线两套（短背心+长外套→内搭被换成错件；长内搭+短外套→内搭纹丝不动）证明内搭图从不进 prompt，动词非主杠杆；**0012-07 重立项为内搭第二趟（病因 B，里层遮挡替换，独立实现复用 0009 plumbing），原 `07-inner-verb-geometry.md` 由 `07-inner-second-pass.md` 取代** | `docs/tickets/0009-two-pass-rendering/`；`docs/tickets/0012-render-observability/07-inner-second-pass.md`；2026-09-10；2026-09-15 补观测；2026-09-16 首批数据 + grill 分流 + 动词方案证伪重立项 | **2026-09-16 18:29 启动实施（先做 0009 作两趟框架，配饰=最外层叠加、不涉及遮挡，先测延时/基底保持/缓存键）**：用户决策 配饰优先级 ~~帽>鞋>包~~ **鞋>帽>包**（2026-09-17 复核统一，唯一真源 `secondPassPrompt.js#ACCESSORY_PRIORITY`）、额度按张数扣上限 80 张（两趟各扣 1）。Task 1 纯函数 `lib/secondPassPrompt.js`(pickAccessories/buildPass2Prompt) + `dev/genLookImage/secondPassPrompt.test.js`(9 门绿) + 登记 ③.4 已完成；Task 2/3/4 已完成：index.js 接入第二趟（pass1 产出后调 genByWanx([baseUrl,...accUrls])，失败回退 pass1=partial）+ 两段独立缓存键（key + p2Key，换配饰图只重跑第二趟）+ twoPass 自证（none/partial/full）+ 额度按张数扣；BUILD_TAG 升 `2026-09-16.4` 三处同步（index.js / recommend.js / e2e-render.js 守卫）；全量门绿（secondPassPrompt 9 + recommend-page 18 + vlmDescribe 27 + e2e-render A–I5 + J/J2/J3/J4c/J5）；三条新门已做**反向验证**（短路必转红，见 ③.4 `shortcut-check-second-pass.js`）：J3 防「partial 偶发失败被缓存腌成常发」（命中判定 + 落库 fileID=null 双重防御）、J5 配饰「件与图」成对过滤防图号指代错位、J4c cached 语义（p2 命中也算"本次不扣费"，否则前端不弹提示）。**0009-01 代码完成、本地全绿、已部署验收**（BUILD_TAG 2026-09-16.4）：通过项 首趟不撞 60s / 第二趟基底保持度好 / 内搭+帽+包能上身；**撤销一项验收**——「帽子成功上身」作废（进了画面但不是所选那件：画成了渔夫帽）。**0009-03（第一趟归属分流）已实施**：`routeAccessories` 撤帽/包 + 鞋按有无平拍图分流（住 `lib/secondPassPrompt.js`，与 `pickAccessories` 同文件防漂移）、`index.js` 用 `kept` 调 `buildPrompt`（构建内**不加过滤**，剔除规则只有一处）、`PROMPT_VERSION` v11 → **v12**、`BUILD_TAG` 升 `2026-09-16.5` **四文件同步**（index.js / recommend.js / e2e 守卫 / recommend-page 测试桩）、e2e 新增 K（帽/有图鞋撤出第一趟；⚠️ 断言读**请求体完整 prompt** 而非 900 字符截断的 `promptUsed`——后者会假绿）/ K2（无图鞋留在第一趟且不空跑第二趟）/ L（v11 键缓存被 v12 失配重出）；反向验证新增两组（K 短路「鞋一律留」、K2 短路「鞋一律撤」→ 均转红）；**代码完成、本地全绿，待与 0009-05 一起部署**。**0009-04（第二趟按图号替换同位置 + 指令即键）已实施**：每行追加 `If Image 1 already shows headwear, replace it with the one from Image 2.`（图号零歧义——0012-03 的教训是含糊的「同类物品」模型在张力下不执行；位置名词 `WEAR_NOUN` 与位置动词同住 `lookPrompt.js`，第二趟模块**不另写品类映射**）、`ACCESSORY_SECOND_PASS_VERSION` v1 → **v2**（旧 p2 图是「只加不替换」的叠加产物，本身是错的 → 整体作废、**不写兼容层**）、`p2Key` 哈希 = 配饰 fileID 串 **+ 指令全文** + 盐（⚠️ **叠加不是替换**：只哈希指令会让「换配饰图」命中旧图，只哈希 fileID 会让「改单品名」静默失效）；e2e 新增 J6（只改 name、不动 img → p2Key 必变且第二趟真的重跑）/ M（v1 的 p2 文档不得被命中）；反向验证新增两组（短路 per-item 替换语、短路「指令全文进键」→ 均转红）；**代码完成、本地全绿，待与 0009-05 一起部署**（评审修正：fileID 段改 JSON 序列化防 join 歧义、「包」的替换语补单件门——它在帽+鞋夹具里永远被 ≤2 挤出，此前无一门覆盖）。**0009-05（撤件可见性：脚注第三段）已实施**：`lib/secondPassPrompt.js` 新增 `accessoryRoutePayload(items)`——一次给出 `kept` / `skipped`（`why` 已译成**受控中文词** '无平拍图'/'超出第二趟上限'）/ `secondPass`（真名）；⚠️ **枚举管规则、中文管呈现**刻意分两列（决策 6「前端只拼文案、不重算规则」，中文词全仓只此一处）；`index.js` 在 **pass1 缓存判定之后**一次算完（⚠️ 塞进 `if (!pass1Cached)` 里 = 命中缓存那趟什么都报不出来，而缓存命中是日常最高频路径 → 脚注第三段时有时无），响应在 `coverage` 开关下新增 `accessoryRoute`（与 `renderRoles` 同策略 → AI 卡响应形状零变化）；前端 `utils/lookDiy.js#accessoryNote(route, twoPass)` 拼第三段（skipped → `未画入：棒球帽（无平拍图）、托特包（超出第二趟上限）`；`twoPass==='partial'` 且有 `secondPass` → `配饰第二趟未生效`；两者 `；` 连接；判不出 → `''`），`recommend.js` 三段拼接（①② 之间无分隔符＝既有行为逐字不动、②③ 之间 ` · `）；e2e 新增 V（中文原因词 + **命中缓存照报**，即「观测与缓存解耦」）/V3（no-photo 与 beyond-limit 分得开，⚠️ 夹具必须用**无图帽**——无图鞋是「留在第一趟」、压根没被撤，不该进 skipped）/V4（partial 时 secondPass 照报＝前端提示的判据，落地 0009-01 的 User Story 3）/V5（不传开关无此键）；反向验证新增三组（短路「观测与缓存解耦」/ 短路 why 中文映射 / 短路开关判断 → 均转红，脚本共 10 组）。**⚠️ 实施中自查出的票面缺陷（已回写票 05）**：① 票面 AC 写「`why` → 中文映射在云端」与 §本票不做「两个受控值 'no-photo'/'beyond-limit'」字面冲突 → 以 0009-02 决策 6 + §1 载荷形状为准（**云端出中文词**，枚举留在 `routeAccessories` 给门用）；② 票面示例脚注在 ②③ 段之间是 ` · `、而 §3 只写「追加」→ 取示例（分段才读得开），页面注释写明这条偏离 |
| 14 | **spec 0011 手动搭配链路落地**（选品页 + 手动卡 + 演绎 + 收藏第三类 + 衣橱「搭」入口 + 覆盖率自证），票 01–07 全部实现 | **代码完成、本地全绿（40 测试门）；需部署 genLookImage（BUILD_TAG `2026-09-15.5`）+ 重新编译前端**。**2026-09-15 晚追加：票 0012-01 喂图自证**（诊断「裤子未上身」立票——coverage 脚注分不清「喂了没画 vs 根本没喂」，现 renderRoles/inputImages 随 genCache 落库、脚注旁标注齐喂/缺角点名真名）。本轮**修掉的既有缺陷**：① 组合缓存键漏了用户备注（PROMPT_VERSION v8，改备注命中旧图且静默）；② 收藏页来源分类的前提「不存在用户原创」被手动搭配推翻（新增第三类「自己搭的」，判据 `provenance.source === 'self'` 精确相等，历史文档不受影响）；③ 推荐页 `loadMeta`「AI 区没卡就提前 return」→ 只搭过手动一套的人换模特图后旧图不清、且人像指纹被提前推进导致该次变化被永久遗忘。本轮**新增的防守**：换模特图时手动区与 AI 区**同帧**清理（含覆盖率脚注与图同槽）；出图期间换模特图 → 在途结果作废；覆盖率解析极性单测钉死 | `docs/specs/0011-manual-outfit.md`、`docs/tickets/0011-manual-outfit/`、ADR-0017；2026-09-15 |
