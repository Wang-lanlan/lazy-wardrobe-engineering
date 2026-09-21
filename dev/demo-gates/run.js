'use strict';
// ============================================================
// dev/demo-gates/run.js —— 自包含演示门运行器
// 与真实仓库 dev/run-gates.js 同构，但**零依赖私有模块**，clone 即跑：
//     node dev/demo-gates/run.js
// 退出码 0 = 全绿；非 0 = 有门转红（CI 可直接用）。
// ============================================================
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const NODE = process.execPath;
const HERE = __dirname;

const gates = fs.readdirSync(HERE)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(HERE, f))
  .sort();

let failed = 0;
for (const g of gates) {
  const name = path.basename(g);
  try {
    execFileSync(NODE, [g], { stdio: 'pipe' });
    console.log('  PASS  ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL  ' + name);
    const out = ((e.stdout || '').toString() + (e.stderr || '').toString()).trim();
    if (out) console.error('        ' + out.split('\n').join('\n        '));
  }
}

console.log('\n演示门：' + (gates.length - failed) + '/' + gates.length + ' PASS');
process.exit(failed ? 1 : 0);
