# SETUP · 懒懒衣橱 搭建与运维手册

本文件回答**「怎么做」**：从零重建、凭证配置、踩过的坑、后续二次开发。
概念定义见 `CONTEXT.md`，决策理由见 `docs/adr/`。

最后更新：2026-08-30

---

## 0. 当前实例（换号时记得更新这里）

| 项 | 值 |
|---|---|
| AppID | `wxdxxxxxxxxxxxx`（已脱敏，部署时替换为你自己的） |
| 云环境 ID | `cloudbase-xxxxxxxx`（已脱敏，部署时替换为你自己的） |
| 主体类型 | 个人 |
| 分发形态 | 体验版（不提审，见 ADR 0002） |

**这两个值在代码里的位置**（换号时只需改这两处）：

- `project.config.json` → `appid`
- `app.js` → 顶部 `CLOUD_ENV`

---

## 1. 架构速览

```
微信小程序（原生，不用 uni-app / Taro）
   │
   ├─ 云数据库
   │    ├─ items      单品
   │    ├─ meta       设置档（单例）：穿搭档案 + 参考照 + 额度计数
   │    ├─ looks      收藏方案
   │    └─ genCache   上身图缓存（组合 → 图）＋ 天气缓存（固定 id `weather`）
   │
   ├─ 云存储
   │    ├─ wardrobe/   单品照片（手机补拍）
   │    ├─ reference/  参考照（仅 1 张）
   │    └─ looks/      生成的 AI 上身图
   │
   └─ 云函数（5 个）
        ├─ aiRecommend   → 云开发 AI+（DeepSeek）出 3 套候选方案
        ├─ genLookImage  → 硅基流动生图（可插拔 provider）
        ├─ getWeather    → 高德，按「城市+小时」缓存
        ├─ seedImport    → 一次性灌入 54 件清单（幂等，可重复跑）
        └─ exportData    → 导出 JSON
```

**术语到落点的映射**（`CONTEXT.md` 里按领域角色命名，此处给真名）：

| CONTEXT 概念 | 实际集合 |
|---|---|
| 单品记录 | `items` |
| 设置档（单例） | `meta` |
| 收藏方案记录 | `looks` |
| 上身图缓存记录 | `genCache` |

---

## 2. 前置：4 项凭证

| 凭证 | 获取方式 | 费用 |
|---|---|---|
| AppID | mp.weixin.qq.com → 注册小程序（个人主体，类目「工具 > 效率」） | 免费 |
| 高德 Web 服务 key | console.amap.com → 创建应用 → 添加 Key → 服务平台选 **Web服务** | 免费额度 |
| 硅基流动 API key | siliconflow.cn → 左侧「API 密钥」→ 新建 | 按张计费，无套餐 |
| 参考照 | 自行拍摄：正面大半身、光线均匀、**穿贴身基础款**（背心+legging 最佳）、背景干净 | — |

> 参考照质量直接决定上身图效果。宽大衣物会让模型学错身形轮廓。**没拍到合适的之前，先别生成上身图**，推荐与收藏功能不受影响。

---

## 3. 从零部署（8 步）

### 第 1 步：填 AppID
微信开发者工具打开 `wardrobe-miniapp` → 右上角「详情」→「基本信息」改 AppID，或直接改 `project.config.json` 的 `appid`。

### 第 2 步：开通云开发
顶部工具栏点「云开发」→ 新建环境（选按量付费/免费额度）→ 复制**环境 ID** → 填进 `app.js` 的 `CLOUD_ENV`。

### 第 3 步：建 4 个集合
云开发控制台 → 数据库 → 新建集合：`items` / `meta` / `looks` / `genCache`。
**每个建完都要点进去 →「权限设置」→ 选「仅创建者可读写」。**

### 第 4 步：上传 5 个云函数
在**左侧文件树**（不是控制台）对 `cloudfunctions/` 下 5 个文件夹**逐个右键 →「上传并部署：云端安装依赖」**。
必须选"云端安装依赖"，因为用了 `wx-server-sdk`。

### 第 5 步：配环境变量 + 改超时
云开发控制台 → 云函数 → 点函数名 →「配置」→「环境变量」：

| 云函数 | 变量 | 值 |
|---|---|---|
| `genLookImage` | `SILICONFLOW_KEY` | 硅基流动 key（**必需**） |
| `genLookImage` | `IMG_PROVIDER` | `siliconflow`（换链路时改这个） |
| `genLookImage` | `SF_I2I_MODEL` | `Qwen/Qwen-Image-Edit-2509`（有参考照） |
| `genLookImage` | `SF_T2I_MODEL` | `Tongyi-MAI/Z-Image-Turbo`（无参考照） |
| `genLookImage` | `MONTHLY_LIMIT` | `60`（改它要同步 `pages/profile/profile.js` 顶部同名常量） |
| `genLookImage` | `WANX_KEY` | 阿里云百炼（DashScope）key，**「演绎」出图必需**（演绎按钮按调用显式传 `provider:'wanx'`） |
| `aiRecommend` | `SILICONFLOW_KEY` | 硅基流动 key（**推荐配**，复用生图那个即可） |
| `aiRecommend` | `TEXT_PROVIDER` | `auto`（硅基流动优先，失败回落 AI+）｜`siliconflow`｜`cloudbase` |
| `aiRecommend` | `SF_TEXT_MODEL` | `deepseek-ai/DeepSeek-V4-Flash-0731` |
| `aiRecommend` | `CB_TEXT_MODEL` | `deepseek-v4-flash`（走 AI+ 时用，需在控制台启用该模型） |
| `getWeather` | `AMAP_KEY` | 高德 key |

> ⚠️ **环境变量是「按云函数」隔离的**：`genLookImage` 上配的 `SILICONFLOW_KEY` **不会**自动给 `aiRecommend` 用，要单独配一次。

其余 2 个函数（`seedImport` / `exportData`）无需配置。

> **⚠️ 同时把执行超时从默认 3 秒改成 60 秒**（`genLookImage` 和 `aiRecommend` 都要）。默认 3 秒跑不完 AI 调用。

### 第 6 步：开通 AI+
云开发控制台 → 左侧「AI+」→ 开通（免费额度）。`aiRecommend` 用它调 DeepSeek。
*若个人主体受限无法开通，可改走硅基流动的 DeepSeek 兼容接口，复用 `SILICONFLOW_KEY`。*

### 第 7 步：导入 54 件清单
编译运行 → 底部「档案」tab → 最下面「导入初始衣橱清单（54 件）」→ 提示新增/跳过数量即成功。
**此操作幂等**，重复点不会产生重复数据（按 名称+品类 去重）。

### 第 8 步：填档案 + 传参考照 + 上传体验版
档案页填身高体重、身形、肤色、雷区、想多穿 → 保存 → 上传参考照。
然后开发者工具右上角「上传」→ 填版本号 → mp.weixin.qq.com → 版本管理 → 开发版本 → **「选为体验版」** → 扫码。

> **不要点「提交审核」**。个人主体 + AI 功能过不了审，见 ADR 0002。

---

## 4. 坑位清单（按踩坑概率排序）

以下是实际部署中**全部**踩过的坑，按遇到概率排序。重建时对着过一遍能省 1 小时。

### ⭐⭐⭐ AI 推荐报错 `Request failed with status code 42`（或类似 AI 调用失败）

**根因**：`ai.createModel(...)` 的参数是**模型组名 GroupName**，不是厂商名、也不是模型 id。

```js
ai.createModel("deepseek")            // ❌ 错误：deepseek 是厂商名
ai.createModel("deepseek-v4-flash")   // ❌ 错误：模型 id 要放进 generateText 的 model 字段
ai.createModel("cloudbase")           // ✅ 正确：主托管模型组
```

官方文档把前两种写法明确列为反面示例。合法 GroupName 只有三种：`cloudbase`（主托管组）、`hunyuan-exp`（限成长计划）、`custom-xxx`（自定义组）。

**当前实现**（已修）：`createModel("cloudbase")` + `generateText({ model: CB_TEXT_MODEL })`，并做了双链路自动兜底。

**两个额外注意点**：
1. **云开发 AI+ 默认不启用任何模型**。走 `cloudbase` 链路前必须去「云开发控制台 → AI → 模型服务」启用目标模型，否则报 `AI_MODEL_NOT_FOUND`。
2. **Node SDK 与小程序端返回结构不同**：Node SDK 返回 `{ text }`，小程序端返回 OpenAI 格式 `{ choices[0].message.content }`。代码已兼容两种，别只取一种。

> 想绕开 AI+ 的模型启用与 Token 资源包问题：给 `aiRecommend` 配上 `SILICONFLOW_KEY`（复用生图那个 key），默认链路就会走硅基流动。

### ⭐⭐⭐ 云函数写入的数据前端查不到

**现象**：点了「导入 54 件」，控制台能看到 54 条记录，但小程序衣橱页显示 0 件。

**根因**：云函数以**管理员身份**写库，写入的记录**没有 `_openid`**（归属人）。而集合权限是「仅创建者可读写」，前端用个人身份查询时，看不到这些"不属于任何人"的记录。

**修复**：`seedImport` 云函数里用 `cloud.getWXContext().OPENID` 显式写入 `_openid`，并补写历史记录。
**重要**：改完必须**重新上传该云函数**，否则云端跑的还是旧代码。

> 这是云开发最经典的坑。任何"云函数写、前端读"的场景都会中招。

### ⭐⭐⭐ tabBar 缺少图标 → 整个项目编译失败

**现象**：一堆红色编译错误，看起来像代码问题。

**根因**：微信小程序要求 tabBar 每一项必须有 `iconPath` 和 `selectedIconPath`，**缺图标会导致整个项目编译不过**。

**修复**：`images/` 下放图标（81×81 PNG），在 `app.json` 的 tabBar 里补全路径。

### ⭐⭐ `borderStyle` 只能是 black 或 white

**现象**：`app.json: tabBar.borderStyle 字段需为 string, string`

**根因**：写成了 `"light"`。微信小程序只接受 `"black"` / `"white"` 两个值。

### ⭐⭐ 基础库版本过低

**现象**：模拟器启动失败，提示基础库版本过低。

**修复**：右上角「详情」→「本地设置」→「调试基础库」调到 **3.5.0 或更高**（当前用 3.5.2）。若下拉列表最高只有 2.x，需先升级微信开发者工具。

### ⭐⭐ 微信原生 input 的垂直 padding 不生效

**现象**：输入框文字/placeholder 被上下裁切。

**根因**：`input` 是**原生组件**，垂直方向的 `padding` 和 `min-height` 经常不生效。

**修复**：改用**固定 `height` + 与之匹配的 `line-height`**（档案页 44px、衣橱搜索框 46px）。同时用 `placeholder-style` 单独指定 placeholder 字号，避免 placeholder 与正文字号不一致导致溢出。

> 注意 `app.wxss` 里可能残留全局表单样式，会和页面样式打架——改样式时**全局和页面都要检查**。

### ⭐⭐ tabBar 页面不能用 navigateTo

**现象**：点了跳转没反应或报错。

**根因**：tabBar 里注册的页面必须用 `wx.switchTab`，`wx.navigateTo` 会失败。
档案页加入 tabBar 后，跳转它的地方都要从 `navigateTo` 改成 `switchTab`。

### ⭐⭐ Z-Image-Turbo 是纯文生图，传参考图会报错

**现象**：有参考照时首次生成报错。

**根因**：Z-Image-Turbo **不支持图生图**。有参考照必须走 Qwen-Image-Edit 系列。
另外 **Qwen-Image-Edit 系列不接受 `image_size` 参数**，传了会报错。

**修复**：代码已按"有无参考照"自动选模型并分别构造请求体。换模型时**不要顺手把 `image_size` 加回去**。

### ⭐ 改了前端代码，手机上没变化

**根因**：改代码后必须在开发者工具右上角重新点**「上传」**，体验版才会更新。
改**数据**（衣橱内容、档案信息）则不用上传，直接生效。

### ⭐ 别人搜不到我的小程序

**不是故障**。只有**正式版**能被搜索，体验版不能。分发方式：加入体验成员（mp.weixin.qq.com → 管理 → 成员管理 → 体验成员，个人主体上限 15 人），或由已使用者在小程序内点右上角「…」转发卡片。见 ADR 0002。

### ⭐ 换了缓存键后旧缓存成为孤儿

改了 `comboKey` 的计算方式后（见 ADR 0005），旧记录永远不会被命中，但会长期占用存储。
影响极小，需要时按创建时间筛选清理。

### ⚠️ 天气缓存刻意放在 genCache，不要搬回 meta

meta 是**单例文档**。早期把天气缓存写在 meta 里，而 `getWeather` 云函数在 meta 不存在时会 `add` 一条——这与客户端保存档案形成竞态，可能产出**两份 meta**。
一旦有两份，各处 `limit(1)` 无排序会随机读到其中一份，造成「参考照传了却读不到」「额度计数乱跳」这类**间歇性**故障。

三重防护（都别拆）：
1. 天气缓存放 `genCache` 的固定 id 文档，云函数不再写 meta
2. 所有读 meta 的地方都带 `orderBy('_id','asc')` 保证读到同一份
3. 云函数创建 meta 时**必须显式写 `_openid`**，否则客户端在「仅创建者可读写」下读不到

---

## 4b. 推荐是怎么工作的

**只从你的衣橱取材，不接任何外部图片数据。** 早期网页版那套"韩女搭配"只存在于已退役的 `outputs/`，小程序没有数据通道。

推荐引擎（`aiRecommend`）的做法：

1. 把你衣橱的**单品摘要**（品类/名称/颜色/版型/材质/季节/场景）传给大模型
2. 附上**天气快照 + 场景 + 你的补充要求 + 穿搭档案**（身形/肤色/雷区/想多穿）
3. 系统提示词里注入**韩系穿搭风格原则**（比例优先、版型对冲、配色克制、层次感、材质对比、细节收口）
4. 每套方案**必须至少含 1 件你已有的真单品**；缺的关键件进 `wish`（种草清单，每套最多 2 件）
5. 代码兜底：AI 返回的 id 不在你衣橱里的一律过滤；全部为种草件的方案直接丢弃

> 想调风格就改 `aiRecommend` 里的 system 提示词；想让它更保守/更发散就改 `temperature`（当前 0.7，0.9 时 JSON 结构经常崩）。

---

## 4c. 已修复的坑（勿回退）

2026-08-30 修掉的一批 bug。改动时别把下面这些行为改回去。

| 症状 | 根因 | 修复 |
|---|---|---|
| 城市刷新后不对，过一阵再刷才对 | 天气缓存键**只有小时、不含位置**，跨城市后 1 小时内一直返回旧城市 | 缓存键改为「坐标（2 位小数）`#`小时」 |
| 定位城市偏差大 | `wx.getLocation` 用了 `isHighAccuracy: false`，返回缓存/基站定位 | 改为 `true` |
| 衣橱加了衣服，AI 还是显示为空 | 推荐页只有 `onLoad`，**tab 页面的 onLoad 只执行一次**，衣橱数据永不刷新 | 加 `onShow` 重载；并加 `onPullDownRefresh` |
| 网络抖动后永远显示"衣橱是空的" | 加载失败时静默 `allItems = []`，无法自愈 | 失败时置 `itemsError` 并提示，不再污染数据 |
| "有时接口失败" | `temperature: 0.9` 太高 + `parseJSON` 只处理"以 ``` 结尾"，模型多输出一个换行就崩 | 温度降到 0.7；围栏正则改为 `\s*` 容错 |
| 传了参考照，生图却读不到；额度乱跳 | meta 单例出现多份 + 云函数创建 meta 时未写 `_openid` | 见上一节「三重防护」 |
| 编辑单品点「移除图片」，保存后照片还在 | 移除后 patch 为空对象，`update` 不会清除库里的 `img` 字段 | 显式传 `img: null` |
| 收藏页不显示日期 | `dateText` 挂在 Page 上，WXML 不能直接调 Page 方法，是死代码 | 在 `load()` 里算好 `dateText` 再渲染 |
| 报"AI 调用失败：SILICONFLOW返回内容为空"，但 key 已配 | `httpsJSON` 不检查 HTTP 状态码、也不读硅基流动的 `error` 字段，业务错误被当正常响应解析成空，真因被吞 | 见下一节「文本链路错误处理铁律」 |
| AI+ 明明开了却调不通 | 控制台开了 AI+ 不代表启用了具体模型；`deepseek-v4-flash` 等需单独在「AI → 模型服务」启用 | `byCloudbase` 已按 `deepseek-v4-flash → deepseek-v3 → deepseek-v3.2` 顺序尝试，只要启用任意一个即命中 |

---

## 4d. 文本链路错误处理铁律（抄近路必踩）

`aiRecommend` 调外部 LLM，错误必须**原样透出**，绝不能用"返回内容为空"掩盖：

1. `httpsJSON` 必须检查 `res.statusCode`，非 2xx 时 `reject(new Error('HTTP ' + status + '：' + 服务端message))`。
2. `bySiliconFlow` 在解析后若 `res.error` 存在，必须 `throw` 其 `error.message`（余额不足 / key 失效 / 模型不存在都长这样）。
3. 同理云开发 AI+：某个模型没启用会抛 `AI_MODEL_NOT_FOUND`，要让 `byCloudbase` 依次尝试多个候选模型名，而不是第一个失败就整条挂。

否则现象就是：两条链路都"失败"，但日志只显示"返回内容为空"，无从下手。硅基流动文本模型 id 用 `deepseek-ai/DeepSeek-V4-Flash-0731`（2026-08 官方确有效）；若该 id 过期，查 [SiliconFlow 价格页](https://siliconflow.cn/pricing) 换最新。

---

## 5. 日常维护

| 操作 | 是否需要重新「上传」 |
|---|---|
| 改衣橱数据、档案、参考照 | 否，立即生效 |
| 改前端页面逻辑/样式 | **是** |
| 改云函数代码 | **是**（右键该云函数重新上传部署） |
| 改环境变量 | **是**（改完需重新部署该云函数才生效） |

**生图渠道**由云函数校验，白名单三个：`siliconflow`（默认）｜`wanx`（阿里云百炼，需 `WANX_KEY`）｜`hunyuan`（免 key，最贵）。
⚠️ `IMG_PROVIDER` 只影响**未显式指定 provider 的调用方**——推荐页「演绎」按钮按调用写死 `provider:'wanx'`，改它不会改变「演绎」走哪条链路。

---

## 6. 成本

月成本 **约 1–16 元/月**（出图上界 60 张 × ¥0.24 ≈ ¥14）。完整单价与月费口径见 **[README「费用」一节](../README.md#费用)**，本节不重复列表。

三重护栏：**按需触发**（不点不生成）+ **组合缓存**（同组合+同场景永久复用）+ **每月 60 张上限**（`MONTHLY_LIMIT`）。
不点「看上身效果」则永远 0 成本。

---

## 7. 后续二次开发指引

**加一个新页面**
1. 在 `pages/` 下建目录（`.js` / `.wxml` / `.wxss` / `.json` 四件套）
2. 在 `app.json` 的 `pages` 数组里注册
3. 若要放进底部导航：在 `app.json` 的 `tabBar.list` 里加，**并准备两张图标**（普通态 + 选中态）
4. 从别处跳到 tabBar 页面，记得用 `switchTab` 而非 `navigateTo`

**加一个新云函数**
1. 在 `cloudfunctions/` 下建目录，`index.js` + `package.json`
2. `cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 60000 })` ← **超时必须显式设 60 秒**
3. 前端调用统一走 `utils/api.js` 封装，不要在各页面直接 `wx.cloud.callFunction`
4. 右键上传部署，按需配环境变量

**⚠️ 云函数写库时的铁律**
如果写入的数据需要被**前端**读到，必须显式写入 `_openid`：
```js
const { OPENID } = cloud.getWXContext();
await db.collection('xxx').add({ data: { ...data, _openid: OPENID } });
```
否则会掉进"数据写进去了但前端查不到"那个坑。

**换小程序号 / 换主体（如办了个体工商户要公开）**
1. 注册新小程序 → 拿新 AppID
2. 新开云环境 → 拿新环境 ID
3. 改 `project.config.json` 的 `appid` 和 `app.js` 的 `CLOUD_ENV`
4. 旧数据：用 `exportData` 云函数导出 JSON，在新环境导入
5. 重新走一遍第 3–8 步
6. **若走正式版**：还需补深度合成类目、生成内容标识、隐私协议（涉及肖像需单独授权）

**数据备份**
定期用档案页的导出能力导出 JSON 存本地。云开发本身有备份，但导出一份纯文本心里踏实。

---

## 8. 文档索引

| 文件 | 用途 |
|---|---|
| `CONTEXT.md` | 术语表——「这个词精确指什么」 |
| `docs/SETUP.md` | 本文件——「怎么做」 |
| `docs/adr/0001` | 为何小程序云是唯一真源、本地版退役 |
| `docs/adr/0002` | 为何走体验版不提审、以及公开分发的代价 |
| `docs/adr/0003` | 为何选硅基流动、为何可插拔、模型选择的坑 |
| `docs/adr/0004` | 为何按需生成、为何不弹扣费确认 |
| `docs/adr/0005` | 为何组合缓存键要包含场景 |
| `docs/adr/0006` | 为何迁移时不带图片 |
| `README.md` | 简版部署指引（8 步，给"只想快速跑起来"的场景） |

> `DESIGN.md` 为早期设计稿，**已被 `docs/adr/` 取代**，其中的模型名与成本数据已过期，仅作历史留档，不要再作为依据。
