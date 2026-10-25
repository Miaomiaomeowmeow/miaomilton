// 测试用的「跳到某一步」按钮（用户 10-24：每次都要从头点一遍，页面被重新打开还要重来）
// 只在网址带 ?jump 时出现（http://127.0.0.1:4176/hamilton/?jump），访客看不到；按钮都是调 main.js 里的 window.__ham
const H = window.__ham, S = H.state;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(ok, ms = 12000) { const t0 = performance.now(); while (!ok()) { if (performance.now() - t0 > ms) return false; await sleep(80); } return true; }
const calm = () => S.phase === 'idle' && !S.popT0 && !S.unpopT0 && Math.abs(S.flip - S.flipTo) < .01;

async function ready() { await until(() => S.phase === 'idle' || S.phase === 'done'); if (S.phase === 'done') { H.replay(); await until(() => S.phase === 'idle'); } await until(calm); }
async function front() {   // 舞台合上、翻回正面、关掉卡片
  await ready(); H.closeCard();
  if (S.popped) { H.closeStage(); await until(() => !S.popped && calm()); }
  if (S.flipTo) { H.flip(); await until(() => !S.flipPending && calm() && !S.flipTo); }
  await until(calm);
}
async function back() {
  await ready(); H.closeCard();
  if (S.popped) { H.flip(); await until(() => !S.popped && calm() && S.flipTo); }
  else if (!S.flipTo) { H.flip(); await until(() => calm() && S.flipTo); }
  await until(calm);
}
async function stage() { if (!S.popped) { await front(); H.open('portrait'); await until(() => S.popped, 15000); } await until(calm); }
async function act(i) { await stage(); H.showAct(i); }
async function rewound() { await act(2); await sleep(400); if (S.rewind && !S.rewind.done) { S.rewind.done = true; S.spinT0 = performance.now(); H.wake(); } }
async function egg(k, side) { side === 'back' ? await back() : await front(); H.open(k); }
async function explored() {   // 当作三幕都看过、5 个彩蛋都找到：钞票上浮出折纸虚线和金星
  await front(); S.visited = { 0: true, 1: true, 2: true }; S.found = { torch: true, people: true, ten: true, watermark: true, treasury: true }; H.wake();
}
async function fold() { await explored(); await until(() => S.endShown && H.uniforms.uEnd.value > .9); H.foldStar(); }

const STEPS = [
  ['重来（摊开钞票）', () => location.reload()],
  ['正面', front], ['背面', back],
  ['第一幕', () => act(0)], ['第二幕', () => act(1)], ['第三幕', () => act(2)], ['第三幕倒带完', rewound],
  ['彩蛋：火炬', () => egg('torch')], ['彩蛋：红字', () => egg('people')], ['彩蛋：10 决斗', () => egg('ten')],
  ['彩蛋：水印', () => egg('watermark', 'back')], ['彩蛋：大楼', () => egg('treasury', 'back')],
  ['全部探索完（出金星）', explored], ['折成星', fold],
];
const box = document.createElement('div');
box.id = 'jump';
box.innerHTML = '<b role="button" tabindex="0">跳到 · 测试用 ▾</b>' + STEPS.map((s, i) => `<button type="button" data-i="${i}">${s[0]}</button>`).join('');
document.body.appendChild(box);
const foldBox = on => { box.classList.toggle('folded', on); box.querySelector('b').textContent = `跳到 · 测试用 ${on ? '▸' : '▾'}`; };
box.querySelector('b').addEventListener('click', () => foldBox(!box.classList.contains('folded')));
if (innerWidth < 700) foldBox(true);   // 窗口窄：先收起，别挡住钞票
let running = false;
box.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || running) return;
  running = true; box.classList.add('busy'); b.classList.add('on');
  try { await STEPS[+b.dataset.i][1](); } finally { running = false; box.classList.remove('busy'); b.classList.remove('on'); }
});
const css = document.createElement('style');
css.textContent = `#jump{position:fixed;right:12px;top:60px;z-index:30;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(11,6,7,.78);border:1px solid #5a4520;font-size:12px;max-height:calc(100vh - 140px);overflow:auto}
#jump b{color:#d9a740;font-weight:400;letter-spacing:.1em;margin-bottom:2px;cursor:pointer}#jump.folded button{display:none}
#jump button{background:#1d1410;border:1px solid #4a3a20;color:#f3ead6;padding:4px 8px;text-align:left;font-size:12px}
#jump button:hover{border-color:#d9a740}#jump button.on{background:#5a4520}#jump.busy button{opacity:.6}`;
document.head.appendChild(css);
