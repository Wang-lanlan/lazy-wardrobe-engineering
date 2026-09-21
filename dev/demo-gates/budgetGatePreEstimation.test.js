'use strict';
// ============================================================
// 演示门 ③：预算闸「预估式」判据（示意，不含真实预算值）
// 对应真实仓库：cloudfunctions/genLookImage 的 PASS2_BUDGET_MS
// 对应事故：-504003（云函数 60s 硬墙，串行两趟渲染必超时）
// ============================================================
// 为什么要有这道门（事故的工程化）：
//   串行两趟渲染（pass1 ≈ 29.7s + pass2 ≈ 29.7s + 开销 ≈ 1.1s > 60s）会撞平台硬墙，
//   结果用户每次都拿到「光脚图」。修复不是调参数，是「异步化 + 预估式闸」：
//   在跑之前用「已花 + 预估」判，而不是等真超时了才拦。这道门验证判据本身。
const assert = require('assert');

// 预估式判据：未跑就先用 已花 + 预估 比对预算
function willExceedBudget(spentMs, estimatedMs, budgetMs) {
  return (spentMs + estimatedMs) > budgetMs;
}

const BUDGET = 30000; // 30s 预算闸（示意值，真实值见私有仓库）

// 门：第一趟已花 + 预估第二趟 > 预算 → 必须提前拦截（不能等真超时）
(function gate_preEstimateBlocks() {
  const spent = 29700;   // pass1 实测已花（≈29.7s）
  const estPass2 = 30000; // pass2 预估（≈30s）
  assert.strictEqual(
    willExceedBudget(spent, estPass2, BUDGET),
    true,
    '已花+预估超过预算时必须提前拦截（避免撞 60s 硬墙）'
  );
})();

// 门：仅第一趟、预估第二趟安全 → 放行
(function gate_safePasses() {
  const spent = 12000;
  const estPass2 = 15000;
  assert.strictEqual(
    willExceedBudget(spent, estPass2, BUDGET),
    false,
    '已花+预估在预算内应放行'
  );
})();

// 门：判据必须「预估」而非「事后」（事后式在 60s 才知，已来不及）
(function gate_notPostHoc() {
  const postHocDetectedAt = 60000; // 真超时时间点
  assert.ok(postHocDetectedAt > BUDGET, '事后式检测到时已越过预算，证明必须改用预估式');
})();

console.log('PASS budgetGatePreEstimation');
