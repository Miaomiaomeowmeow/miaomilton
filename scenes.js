// 汉密尔顿：10 美元当「音乐盒」。歌：Hamilton (Original Broadway Cast Recording)，Spotify 专辑 1kCHru7uhxBUdzkm4gzRQc（曲目表 spotify-album-tracks.json）
// 歌词一句不抄，说明都是自己的话。设计见 ../设计-汉密尔顿.md

// 钞票实际比例 156 × 66.3 mm；贴图 2048 × 867
export const BILL = { w: 2.36, h: 1.0 };

// 热点：贴图上的椭圆（u、v 从左下角算，0～1），side = 'front' / 'back'
// 背面贴图在网页里是左右镜像着贴的，这里写的是看背面图本身时的 u
export const SPOTS = {
  portrait: { side: 'front', c: [.43, .52], r: [.13, .42], kind: 'main' },
  torch: { side: 'front', c: [.205, .52], r: [.09, .3], kind: 'egg' },
  people: { side: 'front', c: [.735, .52], r: [.18, .12], kind: 'egg' },
  ten: { side: 'front', c: [.89, .255], r: [.045, .065], kind: 'egg' },
  watermark: { side: 'back', c: [.137, .47], r: [.06, .24], kind: 'egg' },
  treasury: { side: 'back', c: [.5, .42], r: [.3, .23], kind: 'egg' },
};

// 主线 3 幕：都在头像那里立起来的纸舞台上演（舞台模型等参考图定了再做）
export const ACTS = [
  { no: 'I', zh: '亚历山大·汉密尔顿', en: 'Alexander Hamilton',
    line: '开场：大家一个个站出来，讲这个加勒比小岛上来的孤儿、穷移民，怎么一路到了纽约。钞票上他站起来离开的地方，补上了美国宪法的开头「We the People」（我们人民）：一个人的位置由人民接上，他的故事也由大家来讲。',
    lineEn: 'The company steps forward one by one to tell how an orphaned immigrant from a Caribbean island made his way to New York. Where he stood up and left the note, the opening of the Constitution writes itself in: “We the People.” His place is taken up by the people, and his story is told by all of us.',
    track: '4TTV7EcfroSLWzXRY6gLv6' },
  { no: 'II', zh: '我的机会', en: 'My Shot',
    line: '酒馆里，几个年轻人举起杯子：这一回，谁也别想让他们错过机会。',
    lineEn: 'In a tavern, a few young revolutionaries raise their glasses and swear this chance will not slip by.',
    track: '4cxvludVmQxryrnx1m9FqL' },
  { no: 'III', zh: '满足', en: 'Satisfied',
    line: '婚礼上安吉莉卡举杯祝福；然后时间倒带，回到他们初见那一晚，从她的角度再看一遍。（把转台逆时针转一圈：在舞台上往右拖，或滚轮往上）',
    lineEn: 'At the wedding Angelica raises a toast. Then time rewinds to the night they met, replayed through her eyes. (Turn the stage back one full turn: drag right on it, or scroll up.)',
    track: '3dP0pLbg9OfVwssDjp9aT0' },
];

// 彩蛋：藏在钞票上真有的图案里，随时能点，不按顺序
export const EGGS = {
  torch: { zh: '约克镇', en: 'Yorktown (The World Turned Upside Down)',
    how: '自由女神的火炬', howEn: 'The Statue of Liberty torch',
    line: '约克镇大胜。汉密尔顿和法国人拉法耶特一起唱出那句赞美移民的名句；原版演出每到这里，都要多奏几小节等观众的掌声停下来。',
    lineEn: 'Victory at Yorktown. Hamilton and the French-born Lafayette share the famous line in praise of immigrants — and to this day the show adds a few bars of music to wait out the cheering.',
    track: '733tju3KUeatsbjcTRQ04i' },
  people: { zh: '不停歇', en: 'Non-Stop',
    how: '手写的 We the People', howEn: 'The handwritten “We the People”',
    line: '为了让大家接受新宪法，他不停地写、写、写——《联邦党人文集》一大半出自他手。',
    lineEn: 'To win the country over to the new Constitution he writes and writes — most of the Federalist Papers are his.',
    track: '7qfoq1JFKBUEIvhqOHzuqX' },
  ten: { zh: '决斗十诫', en: 'Ten Duel Commandments',
    how: '会变色的 10', howEn: 'The colour-shifting 10',
    line: '决斗的十条规矩，从一数到十。十美元，十条规矩。',
    lineEn: 'The ten rules of a duel, counted from one to ten. Ten dollars, ten commandments.',
    track: '3lXyAQ0kekAvY5LodpWmUs' },
  watermark: { zh: '谁生，谁死，谁来讲你的故事', en: 'Who Lives, Who Dies, Who Tells Your Story',
    how: '对着光才看得见的水印', howEn: 'The watermark you only see against the light',
    line: '他走后，伊丽莎又活了五十年：创办孤儿院，站出来反对奴隶制，替他把故事讲完。',
    lineEn: 'After he is gone, Eliza lives fifty more years — founding an orphanage, speaking out against slavery, and telling his story.',
    track: '7EsSVPxaYoAZjQwhspJBs2' },
  treasury: { zh: '美国财政部', en: 'The U.S. Treasury',
    how: '背面的大楼', howEn: 'The building on the back',
    line: '他是美国第一任财政部长，所以印在钞票上。2015 年财政部本想让一位女性登上新的 10 美元；这部剧太火，2016 年改成他留下，废奴英雄哈丽特·塔布曼改上 20 美元。',
    lineEn: 'He was the first Secretary of the Treasury — that is why he is on the note. In 2015 the Treasury planned to put a woman on a new $10; the musical was so popular that in 2016 he stayed, and abolitionist Harriet Tubman was moved to the $20 instead.',
    track: null },
};

// 全站播放器定案（声音与版权说明.md「★ 播放器定案」）：国外 Spotify，国内网易云外链播放器，QQ 音乐只给跳转。
// 网易云编号（专辑 75389451，华纳版）；vip = 会员歌，非会员可能放不了（10-24 在国外网络下没法实测，要国内再试）
export const NETEASE = {
  '4TTV7EcfroSLWzXRY6gLv6': { id: 1343245024, vip: true },   // Alexander Hamilton
  '4cxvludVmQxryrnx1m9FqL': { id: 1343244632, vip: true },   // My Shot
  '3dP0pLbg9OfVwssDjp9aT0': { id: 1343244637, vip: true },   // Satisfied
  '733tju3KUeatsbjcTRQ04i': { id: 1343245031, vip: false },  // Yorktown
  '7qfoq1JFKBUEIvhqOHzuqX': { id: 1343244644, vip: true },   // Non-Stop
  '3lXyAQ0kekAvY5LodpWmUs': { id: 1343245029, vip: true },   // Ten Duel Commandments
  '7EsSVPxaYoAZjQwhspJBs2': { id: 1343244658, vip: false },  // Who Lives, Who Dies, Who Tells Your Story
};
