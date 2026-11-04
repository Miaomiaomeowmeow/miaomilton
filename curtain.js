// 结尾（用户 11-03：折星太长 → 加歌、加介绍；最后加一页广告，「我们是做 advertising 的」）
// 折星这 12 秒：底下那条换成这部剧的介绍，一句一句换；星飞上天以后：画面中间出广告页（没有底板，细线 + 字 + 光晕，跟全站一套）
// 介绍的事实出处：官方网站 hamiltonmusical.com；普利策奖官网 pulitzer.org（2016 戏剧奖）；托尼奖官网 tonyawards.com（2016，11 项）
export const FINALE_TRACK = '0NJWhm3hUwIZSy5s0TGJ8q';   // The Story of Tonight（用户 11-03：终曲跟水印彩蛋重复了 → 换这首，「今晚的故事会被讲下去」，全站没用过）
const LINES = [
  ['作词、作曲、编剧：林-曼努尔·米兰达。灵感来自罗恩·切尔诺 2004 年写的汉密尔顿传记。', 'Book, music and lyrics by Lin-Manuel Miranda, inspired by Ron Chernow’s 2004 biography of Hamilton.'],
  ['2015 年在纽约公共剧院首演，同年 8 月登上百老汇理查德·罗杰斯剧院。', 'It opened at The Public Theater in 2015, then moved to Broadway’s Richard Rodgers Theatre that August.'],
  ['用嘻哈、R&B 和百老汇唱法讲美国建国，开国元勋大多由有色人种演员来演。', 'The story of America then, told by America now — hip-hop, R&B and Broadway, with a cast of color as the founders.'],
  ['2016 年拿下 11 项托尼奖（含最佳音乐剧），还有普利策戏剧奖。', 'In 2016 it won 11 Tony Awards, including Best Musical, and the Pulitzer Prize for Drama.'],
];
const TICKETS = 'https://hamiltonmusical.com/';
const LOTTERY = 'https://hamiltonmusical.com/lottery/';   // 官方 10 美元电子抽票（#Ham4Ham），11-03 核对过：进的是纽约场 Tickets & FAQ，写着所有场次都有 10 美元抽票；各地规则不同，以官网为准
const SITE = 'miaomiaomeowmeow.github.io/miaomilton';
let timer = 0, ad = null;

// 折星开始时调：lines 依次填进底条（fill 是 main.js 的 fillCard）
export function playStory(fill, en) {
  clearInterval(timer); let i = 0;
  const show = () => { const [zh, e] = LINES[i % LINES.length]; fill({ num: '★', ring: 'HAMILTON · AN AMERICAN MUSICAL · ', ringZh: '汉密尔顿 · 一部美国音乐剧 · ', zh: '关于这部剧', en: 'About the Show', line: zh, lineEn: e, track: FINALE_TRACK, keep: i > 0 }); i++; };
  show(); timer = setInterval(() => { if (i >= LINES.length) { clearInterval(timer); return; } show(); }, 3000);
}
export function stopStory() { clearInterval(timer); }

// 星飞上天以后：广告页
// 求职官 11-03：把「10 美元」这个点子讲出来——2016 年财政部决定把汉密尔顿留在 10 美元上；官方 #Ham4Ham 抽票正好是 10 美元一张
export function showAd(en, onReplay, got) {
  hideAd(); const L = (zh, e) => en ? e : zh;
  ad = document.createElement('div'); ad.id = 'ad';
  ad.innerHTML = `<div class="ad-box">
    <div class="ad-small">${L('一部美国音乐剧', 'AN AMERICAN MUSICAL')}</div>
    <div class="ad-big">Hamilton</div>
    <div class="ad-rule"><span></span><i></i><span></span></div>
    <div class="ad-line">${L('正在百老汇和世界各地上演', 'Now playing on Broadway and around the world')}</div>
    <div class="ad-ten">${L('你手里的 10 美元，也许就是一张《汉密尔顿》的票。', 'Your $10 could be a seat at Hamilton.')}</div>
    <div class="ad-btns"><a class="ad-btn" href="${TICKETS}" target="_blank" rel="noopener">${L('去官网买票', 'Get tickets')}<b>↗</b></a><a class="ad-btn ad-btn2" href="${LOTTERY}" target="_blank" rel="noopener">${L('试试 10 美元抽票', 'Try the $10 lottery')}<b>↗</b></a></div>
    <div class="ad-links"><button class="ad-save" type="button">${L('存一张明信片，发给朋友', 'Save a postcard to share')}</button><span>·</span><button class="ad-replay" type="button">${L('再看一遍', 'Play again')}</button></div>
    <div class="ad-fine">${L('Miaomiao 的同人作品 · 与官方制作无关', 'A fan work by Miaomiao · not affiliated with the official production')}</div>
  </div>`;
  ad.querySelector('.ad-replay').addEventListener('click', e => { e.stopPropagation(); hideAd(); onReplay(); });
  ad.querySelectorAll('.ad-btn').forEach(b => b.addEventListener('click', e => e.stopPropagation()));
  ad.querySelector('.ad-save').addEventListener('click', e => { e.stopPropagation(); savePostcard(en, got || []); });
  document.body.appendChild(ad); requestAnimationFrame(() => ad && ad.classList.add('on'));
}
export const adOpen = () => !!ad;
export function hideAd() { if (!ad) return; const a = ad; ad = null; a.classList.remove('on'); setTimeout(() => a.remove(), 500); }

// 分享出口（求职官 11-03 第 4 条）：一张竖版明信片（1080×1920，Instagram 快拍的尺寸），贴着找到的邮票，带网址；手机上能直接分享，电脑上存成图片
const POST_STAMPS = [['torch', './assets/stamp-torch.webp'], ['people', './assets/stamp-people.webp'], ['ten', './assets/stamp-ten.webp'], ['watermark', './assets/stamp-water.webp'], ['treasury', './assets/stamp-treasury.webp']];
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
export async function drawPostcard(en, got) {   // 只画，不存（测试时也用它看画出来的样子）
  const L = (zh, e) => en ? e : zh, W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), INK = '#4a4532', cs = getComputedStyle(document.documentElement);
  const ink = cs.getPropertyValue('--bill-ink').trim() || INK;
  g.fillStyle = '#e9e0c2'; g.fillRect(0, 0, W, H);
  const bg = await loadImg('./assets/bg-standalone.webp?v=1103');
  if (bg) { const s = Math.max(W / bg.width, H / bg.height); g.globalAlpha = .55; g.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); g.globalAlpha = 1; }
  const wash = g.createRadialGradient(W / 2, H * .47, 80, W / 2, H * .47, 900); wash.addColorStop(0, 'rgba(240,233,206,.96)'); wash.addColorStop(.6, 'rgba(236,228,200,.85)'); wash.addColorStop(1, 'rgba(233,224,194,.35)');
  g.fillStyle = wash; g.fillRect(0, 0, W, H);
  g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(54, 54, W - 108, H - 108); g.lineWidth = 1; g.strokeRect(70, 70, W - 140, H - 140);   // 钞票那种两道边
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = '600 30px Cinzel, Georgia, serif'; g.letterSpacing = '14px'; g.fillText(L('一部美国音乐剧', 'AN AMERICAN MUSICAL'), W / 2, 300);
  g.letterSpacing = '0px'; g.font = '200px "Pinyon Script", Georgia, serif'; g.fillText('Hamilton', W / 2, 500);
  g.font = 'italic 500 50px "Cormorant Garamond", "Songti SC", serif';
  g.fillText(L('我把一张 10 美元折成了一颗星', 'I folded a ten-dollar bill into a star'), W / 2, 640);
  const star = (cx, cy, R, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](cx + rad * Math.cos(a), cy + rad * Math.sin(a)); } g.closePath(); };
  star(W / 2, 800, 70, 28); g.fill();
  const imgs = await Promise.all(POST_STAMPS.map(([, s]) => loadImg(s)));
  const SW = 250, SH = 300, gap = 40, rows = [[0, 1, 2], [3, 4]];
  rows.forEach((row, ri) => row.forEach((idx, ci) => {
    const x = W / 2 - (row.length * SW + (row.length - 1) * gap) / 2 + ci * (SW + gap), y = 950 + ri * (SH + 60), have = got.includes(POST_STAMPS[idx][0]);
    g.save(); g.translate(x + SW / 2, y + SH / 2); g.rotate(have ? ((idx % 2 ? 2 : -3) * Math.PI / 180) : 0);
    g.fillStyle = have ? '#f2ebd4' : 'rgba(242,235,212,.35)'; g.fillRect(-SW / 2, -SH / 2, SW, SH);
    g.setLineDash([3, 7]); g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(-SW / 2 + 6, -SH / 2 + 6, SW - 12, SH - 12); g.setLineDash([]);
    if (have && imgs[idx]) { const im = imgs[idx], s = Math.max((SW - 40) / im.width, (SH - 40) / im.height); g.save(); g.beginPath(); g.rect(-SW / 2 + 20, -SH / 2 + 20, SW - 40, SH - 40); g.clip(); g.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s); g.restore(); }
    g.restore();
  }));
  g.fillStyle = ink; g.font = 'italic 500 44px "Cormorant Garamond", "Songti SC", serif';
  const n = got.length, NUM = ['zero', 'one', 'two', 'three', 'four', 'five'];
  g.fillText(L(`找到了 ${n} 个藏在钞票里的彩蛋，共五个`, `${NUM[n]} of five hidden scenes found`), W / 2, 1640);
  g.font = '600 34px Cinzel, Georgia, serif'; g.letterSpacing = '4px'; g.fillText(SITE, W / 2, 1730);
  g.letterSpacing = '2px'; g.font = '500 22px Cinzel, Georgia, serif'; g.globalAlpha = .7;
  g.fillText(L('Miaomiao 的同人作品 · 与官方制作无关', 'A FAN WORK BY MIAOMIAO · NOT AFFILIATED WITH THE OFFICIAL PRODUCTION'), W / 2, 1800); g.globalAlpha = 1;
  return cv;
}
async function savePostcard(en, got) {
  const cv = await drawPostcard(en, got), blob = await new Promise(r => cv.toBlob(r, 'image/png')); if (!blob) return;
  const file = new File([blob], 'miaomilton-postcard.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `Hamilton, folded from a $10 bill — https://${SITE}/` }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export const __postcard = savePostcard;   // 测试用