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
let timer = 0, ad = null;

// 折星开始时调：lines 依次填进底条（fill 是 main.js 的 fillCard）
export function playStory(fill, en) {
  clearInterval(timer); let i = 0;
  const show = () => { const [zh, e] = LINES[i % LINES.length]; fill({ num: '★', ring: 'HAMILTON · AN AMERICAN MUSICAL · ', ringZh: '汉密尔顿 · 一部美国音乐剧 · ', zh: '关于这部剧', en: 'About the Show', line: zh, lineEn: e, track: i === 0 ? FINALE_TRACK : undefined, keep: i > 0 }); i++; };
  show(); timer = setInterval(() => { if (i >= LINES.length) { clearInterval(timer); return; } show(); }, 3000);
}
export function stopStory() { clearInterval(timer); }

// 星飞上天以后：广告页
export function showAd(en, onReplay) {
  hideAd(); const L = (zh, e) => en ? e : zh;
  ad = document.createElement('div'); ad.id = 'ad';
  ad.innerHTML = `<div class="ad-box">
    <div class="ad-small">${L('一部美国音乐剧', 'AN AMERICAN MUSICAL')}</div>
    <div class="ad-big">Hamilton</div>
    <div class="ad-rule"><span></span><i></i><span></span></div>
    <div class="ad-line">${L('正在百老汇和世界各地上演', 'Now playing on Broadway and around the world')}</div>
    <a class="ad-btn" href="${TICKETS}" target="_blank" rel="noopener">${L('去官网买票', 'Get tickets')}<b>↗</b></a>
    <button class="ad-replay" type="button">${L('再看一遍', 'Play again')}</button>
    <div class="ad-fine">${L('Miaomiao 的同人作品 · 与官方制作无关', 'A fan work by Miaomiao · not affiliated with the official production')}</div>
  </div>`;
  ad.querySelector('.ad-replay').addEventListener('click', e => { e.stopPropagation(); hideAd(); onReplay(); });
  ad.querySelector('.ad-btn').addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(ad); requestAnimationFrame(() => ad && ad.classList.add('on'));
}
export function hideAd() { if (!ad) return; const a = ad; ad = null; a.classList.remove('on'); setTimeout(() => a.remove(), 500); }
