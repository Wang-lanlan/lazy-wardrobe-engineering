# AI-PIPELINE-CHEATSHEET · 懒懒衣橱全链路速查（新会话 AI 先读这份）

> **什么时候读**：要改 `aiRecommend` / `genLookImage` / 推荐页 / 档案页 / 上传页任何一环之前。
> **怎么用**：第 1 节地图定位环节 → 第 2 节表查文件职责 → 第 3~5 节查键/判定/checklist。
> **分工**：本文件只放「流程 + 文件路径 + 公式 + 指针」；为什么这么设计读
> `docs/METHODOLOGY.md`（复盘叙事版）；环境变量/测试命令/坑位编号查 `CONTEXT.md` ③/④。
> 快照日期：2026-09-10 下午（抠图改 GoodsMatting ADR-0016；懒懒签名全产品下线；保存相册链路抽出）。
> 
> 2026-09-10 下午增量：§0.5 补抠图部署前置与签名要点；**新增 §0.6 保存到相册链路**；
> 懒懒签名 bloggerNote 标注为已下线（§1 地图 / §2 契约）；收藏页双列顺序契约与验证门入表。
>
> 2026-09-10 晚增量（tickets/0008-01+02）：**旧试穿链路整体退役**——推荐页单按钮「演绎」；
> 演绎模型换代 `qwen-image-3.0`（**显式 prompt_extend:false**）；§3 缓存键公式删旧试穿键、
> 演绎键补 renderSalt+provider+模型标签；出口自证三件套 modelUsed/rewriteStatus/usageInfo；
> lib 拆解（toHttps→lib/url.js 全 provider 共用、取件逻辑改名 pickRenderSlots）；
> 模型换代全程与 Why 见 tickets/0008 与 METHODOLOGY §4.7。
>
> 2026-09-15 增量（spec 0011，票 01–08）：**出图入口从一个变两个**——AI 方案卡 + 手动搭配卡
>（`utils/lookDiy.js#buildManualLook` 构造、住推荐页独立字段 `manualLook`），两者走**同一条
> genLookImage 链路**（同一套缓存键 / 同一个额度池，不新增云函数）；§3 baseKey 纳入用户备注
>（PROMPT_VERSION v8）；新增**覆盖率自证**（手动卡专属开关 `coverage`，出图后视觉模型逐件判
> 可见性，结果随 genCache 落库、不进缓存键）；收藏页来源三筛→四筛（新增「自己搭的」）；
> 衣橱卡片「搭」入口 + 跨 tab 一次性交接槽（ADR-0017）。**需部署 genLookImage（2026-09-15.2）**。
>
> 2026-09-17 增量（票 0009 + 0012/0013）：**演绎改为两趟串行**——pass1 人衣主体 → pass2 以产出为
> 基底、只叠加 ≤2 件有实拍图的配饰（鞋 > 帽 > 包）；两趟**各自独立缓存键**（`key` / `p2Key`）、
> 预算闸可跳过第二趟并诚实报 `partial`、pass1 后写检查点以便超时时**只补跑 pass2**。
> 契约与代价见 `docs/adr/0018-two-pass-render.md`；成本口径见 README「费用」。

---

## 0.5 入口侧：衣橱数据从哪来（spec 0006，2026-09-09 落地；2026-09-10 抠图改 GoodsMatting）

```
【入口侧：单品从拍照到入库】
pages/upload-item/               # tabBar 第 1 个（打开默认页，0007-01 后共 4 tab）
  upload-item.js                 # 页面壳：只做 IO（chooseMedia/uploadImage/callFunction）
  queue.js                       # 全流程状态机（纯函数）：pending→uploading→uploaded→bg-removing→bg-done→recognizing→previewing→confirmed
                                 #   失败退路：upload-failed/bg-failed/recognize-failed 各有 retry；skipped 终态防锁死
                                 #   advance() 只对可前进态生效——上传/抠图成功都不前进，单张走完整链才前进
cloudfunctions/mattingGoods/     # 抠图：腾讯云数据万象 GoodsMatting（透明 PNG 真抠图，ADR-0016）
                                 #   getTempFileURL 拿临时链接 → COS 签名 GET ?ci-process=GoodsMatting&detect-url=… → 回传云存储
                                 #   同步接口套 start/poll 外壳（客户端 3s 硬超时）；失败七分类 + retryable 回传前端
                                 #   lib/cosSign.js 自签：sha1 + 七段 Authorization + UrlEncode 额外编码 !'()*
                                 #   ⚠️ 旧链路已退役：pages/upload-item/matting.js（客户端色键）+ cloudfunctions/mattingAI（百炼绿幕重绘）
                                 #   ⚠️ 部署前置（卡用户侧）：腾讯云实名 → 建 COS 桶并绑数据万象 → 开「AI 内容识别」
                                 #      → 配 COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION → 控制台**手动删旧 mattingAI**
                                 #   detect-url 模式：图片不进 COS，桶可空置 → 存储/流量费为 0，只有调用费（0.01 元/次）
  itemDoc.js                     # AI 结果 → items 文档：fit 走 canonicalFit 数组、scene/status 默认、source='bulk-upload'
  panel.js                       # 调整面板状态纯函数（薄壳，re-export utils/fitTaxonomy 的三件套）
utils/fitTaxonomy.js             # fit 编辑三件套（fitGroups/toggleFitOption/setCategory）+ fitDisplay——item-edit 与 upload-item 共用
                                 #   fit 数据自愈：存量 string 读侧归一化数组，编辑保存即落数组
pages/item-edit/                 # 编辑页只留编辑场景（fit 已是动态 chips 多选）
pages/profile/                   # 档案页已去 tab（0007-01）——唯一入口：衣橱右上角按钮 + recommend 拦阻弹窗，navigateTo
```

入口侧一句话契约：
| 环节 | 契约（违反即 bug） |
|---|---|
| 识别/抠图轮询 | start/poll + **代次令牌**（重试/跳过后旧轮询全部作废，防假弹窗与双循环） |
| result 空 | poll done 但 result 空 → **走失败路径**，绝不进 previewing（预览空+无按钮=锁死） |
| 确认入库 | **必点**，previewing 不可 advance（AI 永不自动写库） |
| 抠图失败 | 红字提示 + 重抠/用原图继续——**回退不阻塞**，但必须有退路（防锁死）；弹窗按 `retryable` 分岔（欠费/未开通/签名/权限不诱导重试） |
| 落库形状 | 只经 itemDoc.buildItemDoc（fit 数组/受控默认/source），页面不手拼字段 |

---

## 0.6 出口侧：结果怎么落到用户手上（2026-09-10 下午）

```
utils/saveImage.js               # 保存到相册：downloadFile(fileID) → saveImageToPhotosAlbum({filePath: tempFilePath})
                                 #   ⚠️ 相册接口只吃**本地临时路径**，不能直接喂 cloud:// fileID（最经典错法）
                                 #   失败不 reject，返回结构化 {ok, stage, stageText, errMsg, privacy, needSetting}
                                 #   privacy（后台没声明相册权限→去 mp 后台）与 needSetting（用户拒过授权→去设置）
                                 #   **必须是两类**——解法完全不同，合并成一句话等于没提示
                                 #   wx 对象以入参注入 → Node 可直接单测（utils/saveImage.test.js，9/9）
pages/recommend/recommend.js#onSaveImage  ┐
pages/looks/looks.js#onSaveImage          ┴ 两页共用上面这一个模块；曾经各写一份且 .catch 吞错，别走回头路

pages/looks/sourceFilter.js#splitColumns  # 收藏页双列分列（交替：1→左 2→右…），契约=最新一条在左上角
                                          #   顺序契约有断言：sourceFilter.test.js T7（防有人"顺手"换回 CSS 分列）
```

出口侧一句话契约：
| 环节 | 契约（违反即 bug） |
|---|---|
| 保存相册调用顺序 | 先 `downloadFile` 拿 tempFilePath 再喂相册；**顺序颠倒或直接传 fileID = 最经典错法**（单测钉死） |
| 保存失败呈现 | 一律 `showModal` + 带**原始 errMsg**。showToast 约 14 字截断，「保存失败」四个字定位不了任何东西 |
| 保存失败分类 | `privacy`（mp 后台未声明相册权限）与 `needSetting`（用户拒过授权）分两类，解法不同 |
| 收藏页双列顺序 | 由 JS 交替分列决定，**不许换回 CSS 分列**（grid 行对齐留空白、column-count 列优先填充导致右列全旧数据） |

---

## 1. 全链路地图（环节 → 文件）

```
【供给侧：案例从哪来】
韩博主 IG 一手 → 三级分级(tier1收/tier2带viaOriginal/tier3拒)
  → cloudfunctions/aiRecommend/references/personal-cases.json   # 14条/5人，含 constraints 硬约束
  → references/personal-bloggers.json                           # 博主库
brain.json                                                       # 8章规则+公开案例，换季整文件刷新
references/brain.json                                            # 随包部署的保底真源（同上文件的本地副本）

【消费侧：aiRecommend 云函数】
index.js                    # 入口：读meta档案 → loadBrain → recommendCore → caseStats回传
lib/brainLoader.js          # 大脑四级降级：内存缓存→URL→随包本地→云存储→内置FALLBACK；每级后合并personal(优先,id去重)
lib/tempBand.js             # 最高温→5档；allowSeasons+coatRule+forbidSleeveless；isItemAllowed 三层单品过滤
lib/caseGate.js             # 双闸：闸1季节字符级交集 + 闸2约束可满足性；零案例返回[]诚实退回
lib/promptBuilder.js        # 组装system/user：规则(带ruleId)+案例grounding(带id+硬约束)+三套结构契约
lib/recommendCore.js        # 编排：温度过滤→双闸→buildPrompt→genText→parseJSON→id白名单→溯源→enforceSet1
lib/provenance.js           # 四态溯源：satisfied/not-satisfied/not-injected/no-ref + autoMapLook结构优先映射
lib/caseMatcher.js          # 文本重叠评分（仅作自动映射的次级排序，不当闸门）
lib/slotMap.js              # role↔category 映射 + canonicalFit 词表归一化
                            #   （原 CATEGORY_TO_OLDTRYON_SLOT 已无消费方，随早期专用试穿模型退役；清理记 CONTEXT ④#10）
lib/bloggerNote.js          # 【已下线 2026-09-10】懒懒签名 provenance+画像确定性组合。推荐页 09-08 移除、
                            #   收藏页 09-10 移除 → **全产品零界面消费方**；云函数仍在生成（有产出无消费，清理待拍板）
index.js#genText            # LLM双provider：硅基流动(公开模型!) → 云开发AI+(hunyuan/deepseek候选)

【前端：pages/recommend/recommend.js】
  api.getWeather → api.recommend（payload直传） → 渲染3套+溯源+caseStats脚注
  顶部 REQUIRED_CLOUD_BUILD ↔ genLookImage BUILD_TAG 比对（两处各存一份，必须同步改）

【出图侧：genLookImage 云函数（按需触发，不点零成本）】
index.js                    # 顺序铁律：先读meta(自愈收敛)+items → 再算缓存键 → 额度 → provider分发
lib/lookPrompt.js           # 演绎prompt构建 + comboKey + PROMPT_VERSION + SCENE_LIBRARY确定性子场景轮换
lib/vlmDescribe.js          # VLM读图描述：分拣/清洗/DESC_SYSTEM/版本缓存（演绎链路前置）
lib/url.js                  # toHttps（OSS 签名 URL http→https 归一）——**全 provider 共用件**，勿随任何 provider 退役删除
lib/renderSlots.js          # pickRenderSlots（原 pickAitryonItems）：演绎参考图取用（现外套优先，票 03 将翻转槽位分配）
lib/usage.js                # localMonth北京时间月 + 额度判定（前端profile.js有同构实现，必须同步）
  缓存 genCache 集合；天气快照固定id也存在这里（刻意不放meta）
  出口自证三件套（0008-02，新生成与命中缓存两出口都回传）：modelUsed（实际请求的模型，genCache 同步入库）
  / rewriteStatus（提示词是否被改写，应恒为 not_use）/ usageInfo（输入图张数+计费档）。
  模型换代只改 env：QWEN_EDIT_MODEL（演绎）/ WANX_T2I_MODEL（t2i 兜底），键自动变无需动代码。
  ⚠️ 演绎为**两趟串行**（2026-09-17）：pass1 人衣主体（一次调用喂 3 图 + 指令）→ pass2 以 pass1 产出为
  基底、只叠加 ≤2 件有实拍图的配饰（鞋 > 帽 > 包）。配饰在 pass2 才有参考图槽；**无实拍图者不进 pass2**
  （否则凭空编样式）。契约与代价见 `docs/adr/0018-two-pass-render.md`。
```

## 2. 每个环节的一句话契约

| 环节 | 契约（违反即 bug） |
|---|---|
| brainLoader | 个人库是增强层：读取失败返回空数组，**绝不阻断主链路** |
| tempBand | 推荐**跟温度走不跟日历走**；非受控 season 值按「四季」兜底放行，不许静默消失 |
| 案例双闸 | 两闸后零案例 → 返回 `[]` 退纯衣橱搭配，**不硬凑** |
| prompt 注入 | prompt 里的案例集合 = 溯源白名单集合，**必须同一份**（传 usedCases，别让 buildPrompt 重筛） |
| inspoId | 只能原样照抄注入案例的 p-xxx id；满足硬约束才能署名；序号/博主名/子串可确定性还原，越界绝不取 |
| itemIds | 只认安全候选池（温度过滤后）里的 id，幻觉 id 丢弃 |
| 第 1 套 | 必须 100% 衣橱、wish 必空（enforceSet1AllWardrobe 兜底） |
| 懒懒签名（已下线） | 【2026-09-10】两页都不再渲染 bloggerNote；云函数仍生成该字段，属有产出无消费，清理待拍板 |
| 出图触发 | 拼贴零成本默认；演绎图**只在用户点击时生成**，从不自动（旧试穿入口已退役 0008-01）。**入口有两个**（spec 0011）：AI 方案卡的「演绎」+ 手动搭配卡的「演绎」（`pages/pick-items` 选品后确认），走同一条链路 |
| 参考照防线 | refImageType 缺失或 self → 自拍**不进画面**（fail-closed）；演绎用内置虚拟模特底图 |
| 已退役渠道 | 早期专用试穿模型（传其名）→ **显式拒绝**（不静默换渠道、不出图；e2e-render 场景 F 守卫） |
| 配饰进画面 | 帽/鞋/包在 **pass2** 才有参考图槽（≤2 件，鞋 > 帽 > 包）；**无实拍图者不进 pass2**（否则凭空编样式）。第二趟被预算闸跳过 → 诚实报 `partial`。契约见 `docs/adr/0018-two-pass-render.md` |

## 3. 缓存键公式（输入即键，铁律）

```
baseKey    = md5(排序后itemIds + scene + note归一) + '-' + PROMPT_VERSION + wish指纹   # lookPrompt.comboKey
             # v8（spec 0011 / 票 01）：note（用户补充说明）进键——它本就进 prompt 却不进键，
             # 改备注再点演绎会命中旧图且全程静默（铁律一同类病）；归一化 = 去首尾空白 + 小写，
             # '' / undefined / '   ' 三种「没说」得同一个键
演绎键     = baseKey + '-' + renderSalt + '-' + provider + '-' + keyTag
             # renderSalt = 参与画面的 fileID 串（底图+外套+下装）md5 截 12
             # renderModelTag = QWEN_EDIT_MODEL（有底图）或 WANX_T2I_MODEL（t2i 兜底）
             # keyTag = renderModelTag + '@' + QWEN_EDIT_SIZE   ← 2026-09-17：尺寸也进键
             #   （尺寸提成 env 后不换键会命中旧尺寸图 = 铁律一同类病；刻意不并进 renderModelTag
             #     是因为后者同时是回传前端的 modelUsed，掺 @size 会把「模型名」污染成「模型名@尺寸」）
             #（原旧试穿键 baseKey+AITRYON_MODEL+personSalt 已随早期模型退役删除，0008-02）
覆盖率     = **不进键**（票 07）。它不影响画面，进键只会让开/关把同一张图拆成两份缓存；
             结果随 genCache 落库（带 coverageVersion），命中缓存时白拿、不重复花钱
```

- 改 prompt 措辞/构图 → PROMPT_VERSION 人工 +1。（**尺寸不用**——已进 `keyTag`，2026-09-17 起自动换键）
- 换输出尺寸（`QWEN_EDIT_SIZE`）→ `keyTag` 自动变 = 旧图失效重出。
- 换模特图/换平拍图 = 新 fileID = 新指纹 = 自动换键（数据侧无需人工）。
- **顺序铁律：键逻辑依赖谁（meta.refImage / items.img），先读谁再查缓存。**
- 副作用预期：换一次模特图 = 该批缓存全失效重出，调试期烧额度。
- 换模特图 → renderImage 清空 + 键自动换（画面指纹变）——**同一次 setData 完成**（两次互相覆盖的坑仍在）。
- prompt_extend 必须**显式 false**：qwen-image-3.0 默认 true 会改写 lookPrompt 措辞且无任何报错。

## 4. 溯源四态判定树

```
LLM 自报 inspoId
├─ 命中注入白名单（精确id/序号/博主名/子串/来源文本均可还原）
│   ├─ set 真满足该案例 mustContain（slotMap归一化比较）+ 软配色
│   │      → satisfied（verified，前端展示博主+她那套/为什么好看/能迁移的）
│   └─ 不满足 → autoMapLook 找「真满足」的其他注入案例
│          ├─ 找到 → auto-mapped（署名它）
│          └─ 没有 → not-satisfied 降级
├─ 编造/未注入 → not-injected 降级
└─ 空串/「未参考」→ no-ref（合法诚实降级）
所有降级 → FALLBACK_INSPO，不带案例内容三件套
```

结构满足是主闸；文本重叠（caseMatcher）只给并列候选排序——**拿文本当闸门会把忠实 look 全挡成 FALLBACK**（2026-09-03 事故）。

## 5. 改代码 checklist（照此顺序，缺一步 = 白改）

**改前**
1. 读 `CONTEXT.md` ③.5 平台硬限制 + ④ 活跃问题（可能有未完成决策）。
2. 确认改动是否影响画面/键 → 若是，PROMPT_VERSION 或 BUILD_TAG 是否需要动。
3. **版本盐按 grep 全仓跑**，别背清单：`grep -rn "2026-09" cloudfunctions/*/index.js pages/*/*.js cloudfunctions/*/dev/*.js`
   ——2026-09-09 T02 教训：BUILD_TAG 有第三处硬编码（e2e-render.js 守卫），背清单漏了。

**改后（全绿才算完成）**
4. 跑 dev 测试门：**全量命令清单见 `CONTEXT.md` ③.4，逐条跑，别背条数**（条数会漂移，背了必漏）。
   新增纯函数模块时**同时做两件事**：补 `*.test.js` + **把命令登记进 CONTEXT ③.4**
   （2026-09-10 发现 `pages/looks/sourceFilter.test.js` 早已存在却从未登记，等于白写守卫）。
5. 同步检查「两处各存一份」清单：
   - `BUILD_TAG` ↔ 前端 `REQUIRED_CLOUD_BUILD` ↔ e2e-render.js 守卫（三处！）
   - `MONTHLY_LIMIT` ↔ profile.js 常量
   - `localMonth` 云函数版 ↔ 前端同构版
   - ~~slotMap 的专用模型槽位 ↔ 旧库内联映射~~（旧库已删；slotMap 的 CATEGORY_TO_AITRYON_SLOT 无消费方，下次动 aiRecommend 顺手清理）
   - slotMap `FIT_SEP_RE` ↔ fitTaxonomy `SEP_RE` ↔ lookPrompt 内联 `SEP_RE`（三处分隔符表，改一处同步三处）
   - getSeason：recommendCore 版（refreshCases 已于 2026-09-08 退役，现为唯一真源）
   - fit 编辑三件套：`utils/fitTaxonomy.js`（单一实现，item-edit 与 upload-item 共用——勿复制回页面）
6. `CONTEXT.md` ④ 层修掉的问题更新状态并标日期；新概念补 ② 术语表；ADR 级决策新建 `docs/adr/00XX`。

**部署验证顺序（两步缺一即复现）**
6. 云函数「上传并部署」→ 前端重新编译 → 真机验证；看弹窗判定：旧包 / 读错文档 / 正常，三种各有专属提示（BUILD_TAG 机制）。

## 6. 指针表

| 要什么 | 去哪 |
|---|---|
| 为什么这么设计（叙事+事故复盘） | `docs/METHODOLOGY.md` |
| 环境变量名、集合结构、测试命令 | `CONTEXT.md` ③.1/③.2/③.4 + `docs/SETUP.md` |
| 平台硬限制 16+ 条速查 | `CONTEXT.md` ③.5 |
| 活跃问题 | `CONTEXT.md` ④ |
| 决策取舍全过程 | `docs/adr/0007~0014` |
| 上传页链路设计（8 票全程） | `docs/specs/0006-upload-item-page.md` + `docs/tickets/0006-upload-item/` |
| 档案去 tab 决策 | `docs/tickets/0007-profile-untab/01-untab.md` |
| fit 品类路由词表 | `utils/fitTaxonomy.js`（前端含编辑三件套）/ `cloudfunctions/aiRecommend/lib/fitTaxonomy.js`（云函数份）|
| 演绎链路 spec | `docs/specs/0003-render-pipeline-dual-button.md` |
| 旧试穿入口退役 + 模型换代全程（Why / 票 / 坑） | `docs/tickets/0008-model-lifecycle-migration/`（01 入口退役 / 02 迁 qwen-image-3.0+自证 / 03 保真待做 / 04 输入图归一待做）+ METHODOLOGY §4.7 |
| 配饰两趟生图（已落地，生图重点） | `docs/adr/0018-two-pass-render.md` + `docs/tickets/0009-two-pass-rendering/01-accessory-second-pass.md` |
| 词表归一化细节 | `slotMap.js` 头注释（fit 枚举）/ `fitTaxonomy.js`（fit 数组本体）/ `caseGate.js#seasonIntersects`（季节）/ `tempBand.js#ALL_SEASONS`（兜底） |
| meta 自愈与 _openid 收敛 | `genLookImage/index.js` 0) 段注释 + `CONTEXT.md` ③.5-7 |
| 保存到相册（两页共用的出口链路） | `utils/saveImage.js` + `utils/saveImage.test.js`（失败分类与调用顺序守卫） |
| 收藏页来源三筛 / 双列分列顺序契约 | `pages/looks/sourceFilter.js` + `sourceFilter.test.js`（T7 = 最新在左上角） |
| 抠图方案完整取舍（色键→绿幕→真模型） | `docs/adr/0016-matting-via-tencent-ci-goodsmatting.md` + `docs/METHODOLOGY.md` §5.4 |
