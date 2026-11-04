// 邮票册（点右上 Stamps 打开，用户 11-03 定稿）：跟底条同一套——没有底板、没有边框，细线 + 字 + 一团光晕浮在虚化的画面上。
// 上：五枚邮票 = 五个彩蛋（图案截自钞票本身），找到的贴上去盖邮戳，没找到的只剩虚线齿孔 + 一层淡影 + 一句提示
// 下：三张戏票 = 三幕，照全站的线来画（两道细线、四角内凹），看过的沿齿孔撕下票根
const STAMPS = [
  { k: 'torch', img: 'stamp-torch', pm: 'YORKTOWN · 1781 · ', where: ['火炬', 'THE TORCH'], hint: ['看看火炬？', 'look at the torch?'] },
  { k: 'people', img: 'stamp-people', pm: 'PHILADELPHIA · 1787 · ', where: ['We the People', 'WE THE PEOPLE'], hint: ['那行红色的手写字？', 'the red handwriting?'] },
  { k: 'ten', img: 'stamp-ten', pm: 'WEEHAWKEN · 1804 · ', where: ['会变色的 10', 'THE SHIFTING TEN'], hint: ['会变色的那个 10？', 'the ten that changes colour?'] },
  { k: 'watermark', img: 'stamp-water', pm: 'NEW YORK · 1806 · ', where: ['水印', 'THE WATERMARK'], hint: ['对着光看看？', 'hold it up to the light?'] },
  { k: 'treasury', img: 'stamp-treasury', pm: 'NEW YORK · 1789 · ', where: ['财政部大楼', 'THE TREASURY'], hint: ['翻到背面看看？', 'turn the note over?'] },
];
const STAMP_IMG = { 'stamp-torch': './assets/stamp-torch.webp', 'stamp-people': './assets/stamp-people.webp', 'stamp-ten': './assets/stamp-ten.webp', 'stamp-water': './assets/stamp-water.webp', 'stamp-treasury': './assets/stamp-treasury.webp' };   // 路径写全，打包脚本才找得到
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five'], NUM_ZH = '零一二三四五';
let root = null, onClose = null;

function postmark(t, id, ink) {   // 邮戳：一圈 + 一圈字 + 几道波浪线
  let w = '';
  for (let i = 0; i < 3; i++) { let d = ''; for (let x = 0; x <= 130; x += 3) d += (x ? 'L' : 'M') + (x - 24) + ' ' + (42 + i * 7 + 3 * Math.sin(x / 9)); w += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.1"/>`; }
  return `<svg class="pm" viewBox="0 0 96 96"><circle cx="48" cy="48" r="30" fill="none" stroke="${ink}" stroke-width="1.2"/>
    <path id="${id}" d="M24 48 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0" fill="none"/><text font-family="Cinzel" font-weight="600" font-size="6.4" fill="${ink}"><textPath href="#${id}" textLength="148" lengthAdjust="spacing">${t}</textPath></text>${w}</svg>`;
}
function ticket(seen, ink, paper) {   // 四角内凹的框：外一道细线 + 里一道更细的线；齿孔 = 一排稀疏小圆点
  const W = 214, H = 84, R = 13, TX = W * .75;
  const outline = (x0, x1, o) => { const y0 = o, y1 = H - o, q = R - o * .6; x0 += o; x1 -= o;
    return `M${x0 + q} ${y0} H${x1 - q} A${q} ${q} 0 0 0 ${x1} ${y0 + q} V${y1 - q} A${q} ${q} 0 0 0 ${x1 - q} ${y1} H${x0 + q} A${q} ${q} 0 0 0 ${x0} ${y1 - q} V${y0 + q} A${q} ${q} 0 0 0 ${x0 + q} ${y0}Z`; };
  const frame = (x0, x1) => `<path d="${outline(x0, x1, 0)}" fill="${paper}" stroke="${ink}" stroke-width="1"/><path d="${outline(x0, x1, 6)}" fill="none" stroke="${ink}" stroke-width=".5"/>`;
  const perf = x => { let s = ''; for (let y = 10; y <= H - 10; y += 7) s += `<circle cx="${x}" cy="${y}" r=".9" fill="${ink}"/>`; return s; };
  const admit = x => `<text x="${x}" y="${H / 2}" text-anchor="middle" dominant-baseline="central" font-family="Cinzel" font-weight="600" font-size="7" letter-spacing="2" fill="${ink}" transform="rotate(-90 ${x} ${H / 2})">ADMIT ONE</text>`;
  return seen
    ? `<svg viewBox="-4 -4 ${W + 30} ${H + 30}" width="${W + 30}" height="${H + 30}" class="tk-svg">${frame(0, TX)}${perf(TX - 1)}<g transform="translate(12 9) rotate(7 ${TX} ${H})">${frame(TX + 2, W)}${admit(TX + 2 + (W - TX) / 2)}</g></svg>`
    : `<svg viewBox="-4 -4 ${W + 8} ${H + 8}" width="${W + 8}" height="${H + 8}" class="tk-svg">${frame(0, W)}${perf(TX)}${admit(TX + (W - TX) / 2)}</svg>`;
}

// data: { en, found: {torch:true,…}, eggTitle: {torch:'Yorktown',…}, acts: [{no:'I', title:'Alexander Hamilton', seen:true},…] }
export function openAlbum(data, closeCb) {
  closeAlbum(true); onClose = closeCb;
  const L = (zh, en) => data.en ? en : zh, cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--bill-ink').trim() || '#4a4532', paper = 'rgba(242,235,212,.6)';
  const nFound = STAMPS.filter(s => data.found[s.k]).length, nSeen = data.acts.filter(a => a.seen).length;
  root = document.createElement('div'); root.id = 'album'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', L('邮票册', 'Stamp album'));
  const box = document.createElement('div'); box.className = 'al-box'; root.appendChild(box);
  const add = (cls, html, css) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; d.style.cssText = css; box.appendChild(d); return d; };
  const line = '<span class="al-line"></span>';
  add('al-close', `<i></i>${L('关上', 'close')}`, 'right:0;top:20px').addEventListener('click', () => closeAlbum());
  add('al-t al-small', L('藏起来的五幕', 'HIDDEN SCENES'), 'left:500px;top:36px');
  add('al-t al-big', L('邮票册', 'Stamps'), 'left:500px;top:52px');
  add('al-t al-it', `${line}${data.en ? `${NUM[nFound]} of five found` : `找到了 ${NUM_ZH[nFound]} 枚，共五枚`}${line}`, 'left:500px;top:128px');
  STAMPS.forEach((s, i) => {
    const x = 220 + i * 140, y = 178, got = !!data.found[s.k];
    add('al-stamp' + (got ? '' : ' ghost'), `<div class="perf"></div><div class="img" style="background-image:url(${STAMP_IMG[s.img]})"></div>${got ? postmark(s.pm, 'alpm' + i, ink) : ''}`, `left:${x}px;top:${y}px;transform:rotate(${got ? (i % 2 ? 2 : -3) : 0}deg)`);
    add('al-cap' + (got ? '' : ' h'), got ? `${data.eggTitle[s.k]}<small>${L(s.where[0], s.where[1])}</small>` : L(s.hint[0], s.hint[1]), `left:${x - 23}px;top:${y + 142}px`);
  });
  add('al-t', `<span class="al-rule"></span><span class="al-dia"></span><span class="al-rule"></span>`, 'left:500px;top:386px');
  add('al-t al-small', L('三幕', 'THE THREE ACTS'), 'left:500px;top:414px');
  data.acts.forEach((a, i) => {
    const x = 132 + i * 262, long = a.title.length > (data.en ? 12 : 6);   // 长名字缩小一号（英文 Alexander Hamilton、中文 亚历山大·汉密尔顿）
    add('al-tk', `${ticket(a.seen, ink, paper)}<div class="al-tk-t"><b>${L('第 ' + a.no + ' 幕', 'ACT ' + a.no)}</b><span${long ? ' class="long"' : ''}>${a.title}</span></div>`, `left:${x}px;top:446px`);
  });
  add('al-t al-it', `${line}${data.en ? `${NUM[nSeen]} of three seen` : `看过 ${NUM_ZH[nSeen]} 幕，共三幕`}${line}`, 'left:500px;top:560px');
  if (data.onSkip && (nFound < 5 || nSeen < 3)) add('al-t al-skip', L('不想找了？直接看结尾 →', 'No time? Skip to the end →'), 'left:500px;top:606px').addEventListener('click', () => { closeAlbum(true); data.onSkip(); });   // 找不到彩蛋的人会来翻邮票册（求职官 11-03）
  root.addEventListener('click', e => { if (e.target === root) closeAlbum(); });   // 点空白处关上
  document.body.appendChild(root);
  const fit = () => { const s = Math.min(innerWidth / 1100, innerHeight / 700); box.style.transform = `translate(-50%,-50%) scale(${s})`; };
  fit(); root._fit = fit; addEventListener('resize', fit);
  requestAnimationFrame(() => root && root.classList.add('on'));
}
export function closeAlbum(silent) {
  if (!root) return; const r = root; root = null; removeEventListener('resize', r._fit);
  r.classList.remove('on'); setTimeout(() => r.remove(), 300);
  if (!silent && onClose) onClose();
}
export const albumOpen = () => !!root;
