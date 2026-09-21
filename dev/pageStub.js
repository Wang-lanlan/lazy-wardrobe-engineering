/**
 * pageStub.js — 页面控制器离线测试的**共用桩**（不是测试门，别当门跑）
 * ------------------------------------------------------------
 * 手法：桩掉 `global.Page` / `global.wx`，把页面 js 当普通 CommonJS 模块 require 出来，
 * 再补一个支持子路径的 `setData` 驱动它。详见 `dev/recommend-page.test.js` 头部的说明。
 *
 * 为什么抽成共用件：这套脚手架（约 30 行，含两处**踩过坑**的细节）原先在两个门里各抄一份。
 * 抄两份的代价不是"多 30 行"，而是**它们会各自漂移**——比如某天有人只在其中一份里补了
 * `a.b` 点路径支持，另一个门就悄悄退化成"断言看到 undefined 但错误指向被测代码"。
 * 这属于纯脚手架，没有"两页将来会分叉"那种正当理由（对比：页面 WXSS 各持一份是有理由的）。
 *
 * 用法：
 *   const { ROOT, capturePage, tick } = require('./pageStub');
 *   const api = require(path.join(ROOT, 'utils/api'));        // 先取引用，稍后可替换方法
 *   const { toasts, setDataCalls, makePage } = capturePage('pages/xxx/xxx.js');
 *   const p = makePage();
 *   p.onLoad({}); await tick();
 */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** wx 的最小桩。各门可用 wxExtra 补充（例如 `cloud.database`），但 showToast/showModal 的
 *  记录器**不可被覆盖**——副作用记录是本手法的价值所在，不该被某个门顺手关掉。
 *
 *  2026-09-17（票 08）补 storage 三件套：演绎改异步轮询后，在途 task 靠 `wx.setStorageSync`
 *  跨页面实例存活（小程序被回收时 `this` 上的 taskId 会丢）。桩里必须是**有状态的内存实现**，
 *  否则「onShow 恢复轮询」这条门根本驱动不起来。 */
const WX_BASE = {
  showLoading() {}, hideLoading() {},
  navigateTo() {}, navigateBack() {}, switchTab() {},
  getLocation() {}, stopPullDownRefresh() {}
};

/** 内存 storage（每个 `capturePage` 一份，用例之间要手动清——见 `_resetWxStorage`）。 */
function makeStorage() {
  const box = {};
  return {
    setStorageSync: (k, v) => { box[k] = v; },
    getStorageSync: k => (k in box ? box[k] : ''),
    removeStorageSync: k => { delete box[k]; },
    /** 测试专用：清空（不是小程序 API，只给门用，避免用例互相污染） */
    _clear: () => { Object.keys(box).forEach(k => delete box[k]); }
  };
}

/**
 * 最小 setData：支持真实小程序认的两种路径写法 —— `'looks[0].renderImage'` 与 `'manualLook.saved'`。
 * ⚠️ 两种都要支持：少了任一种，桩会把 key 原样当顶层字段写进去 → 断言看到 `undefined`，
 *    而错误信息指向**被测代码**，实际是桩的毛病（踩过一次，白查一轮）。
 * 对「给 null 写子路径」直接报错：那在真实运行时也永远是 bug，桩不该替它兜着。
 */
function setByPath(data, key, val) {
  const parts = String(key).replace(/\[(\d+)\]/g, '.$1').split('.');
  const asKey = s => (/^\d+$/.test(s) ? Number(s) : s);
  let cur = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = asKey(parts[i]);
    if (cur[k] === null) throw new Error('setData 写入 null 的子路径：' + key);
    if (cur[k] === undefined) cur[k] = {};
    cur = cur[k];
  }
  cur[asKey(parts[parts.length - 1])] = val;
}

/** 冲掉微任务队列（异步链路里通常要连等两三次） */
const tick = () => new Promise(r => setTimeout(r, 0));

/**
 * 装桩 + require 页面，返回共用句柄。
 * @param {string} relPath 相对仓库根的页面 js 路径
 * @param {Object} [wxExtra] 追加/覆盖到 wx 桩上的字段（`showToast` / `showModal` 除外）
 * @returns {{pageObj:Object, toasts:string[], setDataCalls:string[][], makePage:Function}}
 */
function capturePage(relPath, wxExtra) {
  const toasts = [];
  const setDataCalls = [];
  const storage = makeStorage();
  let pageObj = null;
  global.Page = o => { pageObj = o; };
  global.wx = Object.assign({}, WX_BASE, wxExtra || {}, storage, {
    showToast: o => { toasts.push(o && o.title); },
    showModal: o => { toasts.push('MODAL:' + (o && o.title)); }
  });
  // ⚠️ require 必须在 global.Page 就位之后：页面模块顶层会立刻调 Page({...})
  require(path.join(ROOT, relPath));

  return {
    pageObj,
    toasts,
    setDataCalls,
    storage,
    /** 造一个页面实例：继承页面方法 + 深拷贝初始 data（实例之间互不污染） */
    makePage() {
      const inst = Object.create(pageObj);
      inst.data = JSON.parse(JSON.stringify(pageObj.data));
      inst.setData = function (patch, cb) {
        setDataCalls.push(Object.keys(patch));
        Object.keys(patch).forEach(k => setByPath(inst.data, k, patch[k]));
        if (cb) cb();
      };
      return inst;
    }
  };
}

module.exports = { ROOT, capturePage, setByPath, tick };
