'use strict';
// ============================================================
// 演示门 ②：fit 词表「双端对拍」纪律（示意，不含真实词表）
// 对应真实仓库：utils/fitTaxonomy.js 的 canonicalFit
// 对应铁律：CONTEXT ③「词表归一化」
// ============================================================
// 为什么要有这道门：
//   前端录入用口语词（宽松/OVERSIZE/垮塌感），云端用规范词（loose）。
//   两端必须经同一 canonical 归一，否则「同一件衣服」会被当成两件
//   → 缓存分裂、去重错乱、推荐抖动。这道门验证「归一」本身正确且幂等。
const assert = require('assert');

// 示意版词表：真实词表属业务资产，不公开。这里只用 2 组同义词演示纪律。
const SYNONYMS = {
  '宽松': 'loose', 'oversize': 'loose', '垮塌感': 'loose',
  '修身': 'slim', '紧身': 'slim', 'fit': 'slim',
};

function canonical(raw) {
  const key = String(raw == null ? '' : raw).trim().toLowerCase();
  return SYNONYMS[key] || key; // 未知词原样透传，但必须稳定
}

// 门：同义口语词 → 同一规范词（双端对拍的核心）
(function gate_synonymsCollapse() {
  assert.strictEqual(canonical('宽松'), canonical('OVERSIZE'));
  assert.strictEqual(canonical('紧身'), canonical('fit'));
  assert.strictEqual(canonical('垮塌感'), canonical('loose'));
})();

// 门：canonical 幂等（对拍自身稳定，否则缓存键会漂移）
(function gate_idempotent() {
  const x = canonical('宽松');
  assert.strictEqual(canonical(x), x, 'canonical 必须幂等');
  assert.strictEqual(canonical(canonical(canonical('垮塌感'))), canonical('垮塌感'));
})();

// 门：未知词稳定透传（不因大小写/空格分裂）
(function gate_unknownStable() {
  assert.strictEqual(canonical('Cotton'), canonical('cotton'));
  assert.strictEqual(canonical('  linen  '), canonical('linen'));
})();

console.log('PASS fitRoundTrip');
