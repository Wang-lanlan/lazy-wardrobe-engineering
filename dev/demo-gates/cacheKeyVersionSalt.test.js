'use strict';
// ============================================================
// 演示门 ①：缓存键「版本盐」纪律（示意，不含真实业务键构造）
// 对应真实仓库：cloudfunctions/genLookImage 的渲染缓存键
// 对应铁律：CONTEXT ①「输入即键」+ 版本盐（BUILD_TAG 进键）
// ============================================================
// 为什么要有这道门：
//   渲染结果由「用户输入」+「不在输入里但影响结果的事实（模型版本/尺寸/后端 BUILD_TAG）」
//   共同决定。若版本变了而键不变，旧缓存会被当成新结果复用 → 偶发 bug 被固化。
//   版本盐把「后端升了版」自然编进键，让旧键自动失效，而不是靠人工比对版本常量。
const assert = require('assert');

// 示意版键构造：仅用于演示纪律，参数与真实实现无关。
function buildKey(params, opt) {
  const parts = [
    'v' + String(opt.version),
    'm' + String(opt.model),
    'sz' + String(opt.size),
    'it' + (params.itemIds || []).join(','),
    'w' + String(params.weather),
  ];
  return parts.join('|');
}

// 门：版本盐变了 → 键必变（否则旧缓存不会被失效）
(function gate_versionChangesKey() {
  const base = { itemIds: ['a', 'b'], weather: 22 };
  const k1 = buildKey(base, { version: 1, model: 'qwen', size: '1024' });
  const k2 = buildKey(base, { version: 2, model: 'qwen', size: '1024' });
  assert.notStrictEqual(k1, k2, '版本盐变化必须改变缓存键');
  assert.ok(k1.includes('v1') && k2.includes('v2'), '键必须嵌入版本盐字面量');
})();

// 门：同输入同版本 → 键稳定（可复现，缓存命中才有意义）
(function gate_stableForSameInput() {
  const base = { itemIds: ['a', 'b'], weather: 22 };
  const o = { version: 3, model: 'qwen', size: '1024' };
  assert.strictEqual(buildKey(base, o), buildKey(base, o), '同输入同版本键必须稳定');
})();

// 门：用户输入变了 → 键必变（铁律①：影响画面的输入变了键就要变）
(function gate_inputChangesKey() {
  const o = { version: 1, model: 'qwen', size: '1024' };
  const kA = buildKey({ itemIds: ['a', 'b'], weather: 22 }, o);
  const kB = buildKey({ itemIds: ['a', 'c'], weather: 22 }, o);
  assert.notStrictEqual(kA, kB, '用户输入(itemIds)变化必须改变键');
})();

console.log('PASS cacheKeyVersionSalt');
