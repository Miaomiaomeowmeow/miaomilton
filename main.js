import * as THREE from 'three';
import { BILL, SPOTS, ACTS, EGGS } from './scenes.js';
import { createStage, createEggs, loadStageBytes } from './stage-test.js';   // 纸舞台（ham-stage 对话做的，接口见 blender/stage/接口.md）
import { createStar } from './finale.js';   // 结尾折星（ham-star 对话做的，接口见 blender/star/接口.md）
import { createPeople, INK_GLSL, ERASE_GLSL, peopleUniforms } from './people.js';
import { createActs, ACT_SEC } from './acts.js';   // 主线三幕舞台上的剪影（ham-star 对话做的，接口见 blender/acts/接口.md）   // 彩蛋③ We the People（ham-star 对话做的，接口见 blender/people/接口.md）

const perf = window.__perf = { t0: performance.now(), frames: [], longTasks: [], marks: {} };
try { new PerformanceObserver(l => l.getEntries().forEach(e => perf.longTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
const mark = n => { perf.marks[n] = Math.round(performance.now()); };

const $ = s => document.querySelector(s);
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0607');
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
const LOOK = new THREE.Vector3(0, 0, .08);

// ---------- 背景：虚化的街道（钞票本来就在大场景里；大场景做好前先用一张提前虚化好的街道图占位） ----------
let bgTex = null;
function fitBackground() {   // 按画面比例裁切，像 CSS 的 cover
  if (!bgTex || !bgTex.image) return;
  const ia = bgTex.image.width / bgTex.image.height, ca = innerWidth / innerHeight;
  bgTex.repeat.set(ca < ia ? ca / ia : 1, ca < ia ? 1 : ia / ca);
  bgTex.offset.set((1 - bgTex.repeat.x) / 2, (1 - bgTex.repeat.y) / 2);
}

// ---------- 钞票：一张分了细格的平面，折叠、透光、变色都在着色器里算 ----------
const spotKeys = Object.keys(SPOTS);
const uniforms = {
  mapF: { value: null }, mapB: { value: null }, mapMask: { value: null }, mapFill: { value: null }, mapSil: { value: null }, mapWrite: { value: null }, uWrite: { value: 0 },
  uW: { value: BILL.w }, uH: { value: BILL.h },
  uFold1: { value: 1 }, uFold2: { value: 1 },   // 1 = 折着，0 = 摊平（钱包里的钱：先对折，再对折）
  uShift: { value: 0 },   // 倾斜多少：右下角的 10 从铜色变绿
  uSpots: { value: spotKeys.map(k => new THREE.Vector4(...SPOTS[k].c, ...SPOTS[k].r)) },
  uSpotBack: { value: spotKeys.map(k => SPOTS[k].side === 'back' ? 1 : 0) },
  uHover: { value: -1 }, uHint: { value: 0 }, uTime: { value: 0 },
  uWater: { value: 0 },   // 对着光：水印浮出来
  ...peopleUniforms(),
  uEliza: { value: 0 }, mapEliza: { value: null },   // 水印：他的脸淡掉，伊丽莎的影子投在纸上（她替他讲完故事）
  uTre: { value: 0 }, uDuel: { value: 0 }, mapTreMask: { value: null }, mapTenMask: { value: null }, mapTorchMask: { value: null }, mapTorchFill: { value: null }, uTorch: { value: 0 },   // 两张剪空遮罩（ham-stage 做的，白 = 剪走）   // uDuel：十步决斗里「1」「0」立起来以后，右下角原来的 10 剪空   // 背面大楼立起来多少：原来印着大楼的那块变成空白纸（看得出被剪起来了）   // 彩蛋③：揭走的红字在钞票上褪掉（uT = 0 时不变）
  uEnd: { value: 0 }, uStarHover: { value: 0 },   // 结尾：折纸虚线 + 金星浮出来（0～1）；鼠标放在金星上
  uCurl: { value: 0 }, uCurlB: { value: 0 },   // 纸角微微卷起：uCurl 正面左下角（往正面卷），uCurlB 正面右下角（往背面卷，翻过来看就是背面的左下角）；1 = 平时，1.5 = 鼠标放上去
  uSil: { value: 0 },   // 头像变人影：0 原样，.5 人影那块变黑，>.5 人影纸片站起来、原处剪空
};
const billMat = new THREE.ShaderMaterial({
  uniforms, side: THREE.DoubleSide,
  vertexShader: `uniform float uW,uH,uFold1,uFold2,uCurl,uCurlB; varying vec2 vUv; varying vec3 vN; varying vec3 vWP;
    const float PI=3.14159265;
    void main(){
      vUv=uv;
      vec3 p=position, n=vec3(0.,0.,1.);
      // 左下角纸角微微卷起（用户 10-24：别折过来，像纸自己翘起一点、是弯的，带一点小皱）：越过斜线的那块绕成一段圆弧
      float K=uCurl*5.*(1.-uFold1)*(1.-uFold2), sd=-(p.x+p.y)-(uW*.5+uH*.5-.27);
      if(sd>0.&&K>0.){ vec3 N=vec3(-.70710678,-.70710678,0.); float d=sd*.70710678, th=d*K, ca=cos(th), sa=sin(th);
        float wr=.0035*sin((p.x-p.y)*46.)*smoothstep(0.,.08,d)*uCurl;   // 卷起那块上的小皱
        p=p-N*d+N*(sa/K)+vec3(0.,0.,(1.-ca)/K+wr); n=vec3(-N.x*sa,-N.y*sa,ca); }
      // 正面右下角往背面卷（用户 10-24：一个角翻过去、一个角翻回来）：翻到背面时它在左下角、朝人翘起来
      float KB=uCurlB*4.*(1.-uFold1)*(1.-uFold2), sdB=(p.x-p.y)-(uW*.5+uH*.5-.27);
      if(sdB>0.&&KB>0.){ vec3 N=vec3(.70710678,-.70710678,0.); float d=sdB*.70710678, th=d*KB, ca=cos(th), sa=sin(th);
        float wr=.0035*sin((p.x+p.y)*46.)*smoothstep(0.,.08,d)*uCurlB;
        p=p-N*d+N*(sa/KB)-vec3(0.,0.,(1.-ca)/KB+wr); n=vec3(N.x*sa,N.y*sa,ca); }
      // 第一折：右半张绕中线翻到左半张上面
      float a1=uFold1*PI;
      if(p.x>0.){ float c=cos(a1), s=sin(a1); p=vec3(p.x*c, p.y, p.x*s+.003*(1.-c)*.5); n=vec3(-s*n.z,n.y,c*n.z); }
      // 第二折：上半张绕横线翻到下半张上面
      float a2=uFold2*PI;
      if(position.y>0.){ float c=cos(a2), s=sin(a2); p=vec3(p.x, p.y*c-p.z*s, p.y*s+p.z*c+.008*(1.-c)*.5); n=vec3(n.x, n.y*c-n.z*s, n.y*s+n.z*c); }
      p.x+=uW*.25*uFold1; p.y+=uH*.25*uFold2;   // 折着的小方块放在正中
      vec4 wp=modelMatrix*vec4(p,1.); vWP=wp.xyz;
      vN=normalize(mat3(modelMatrix)*n);
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader: `uniform sampler2D mapF,mapB,mapMask,mapFill,mapSil,mapWrite; uniform float uWrite,uTre,uDuel,uEliza,uTorch; uniform sampler2D mapEliza,mapTorchMask,mapTorchFill; uniform sampler2D mapTreMask,mapTenMask; uniform float uT; uniform float uStart[14];
    ${INK_GLSL} uniform float uShift,uHint,uTime,uWater,uSil,uEnd,uStarHover; uniform vec4 uSpots[6]; uniform float uSpotBack[6]; uniform int uHover;
    varying vec2 vUv; varying vec3 vN; varying vec3 vWP;
    float ell(vec2 uv, vec4 s){ return length((uv-s.xy)/s.zw); }
    float seg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
    float sdStar5(vec2 p, float r, float rf){   // 五角星的距离（iq 的写法）
      const vec2 k1=vec2(.809016994375,-.587785252292); const vec2 k2=vec2(-k1.x,k1.y);
      p.x=abs(p.x); p-=2.*max(dot(k1,p),0.)*k1; p-=2.*max(dot(k2,p),0.)*k2; p.x=abs(p.x); p.y-=r;
      vec2 ba=rf*vec2(-k1.y,k1.x)-vec2(0.,1.); float h=clamp(dot(p,ba)/dot(ba,ba),0.,r);
      return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y); }
    void main(){
      bool back=!gl_FrontFacing;
      vec2 uv=back?vec2(1.-vUv.x,vUv.y):vUv;   // 背面图左右镜像贴，翻过来看才是正的
      vec3 c=back?texture2D(mapB,uv).rgb:texture2D(mapF,uv).rgb;
      if(!back && uSil>0.){   // 平面的人变立体的人：头像里人影那块先变黑、其余淡成纸色 → 人影纸片站起来离开纸面，原处留下人形的剪空
        float a=smoothstep(0.,.5,uSil), k=smoothstep(.5,.6,uSil);
        vec2 mk=texture2D(mapMask,uv).rg; float ms=texture2D(mapSil,uv).r, m=mk.r;   // R = 剪空的人形（只在上下边框之间），G = 换成修补图的范围（含头发压着的那截上边框）
        vec3 ink=vec3(.03,.025,.025);
        // 剪空处的底：钞票自己的纸面往里延伸（tools/make_portrait_fill.py 修补好的那块，用户 10-24：背景延伸过来、别发白）
        vec2 fu=(uv-vec2(.27832,0.))/vec2(.30518,.95156);
        vec3 paper=(fu.x>0.&&fu.x<1.&&fu.y<1.)?texture2D(mapFill,fu).rgb:c;
        // 剪开的纸边：一点毛刺，内侧细细一圈纸芯稍亮、外侧一道很淡的影子（不要明显）
        float fib=fract(sin(dot(floor(uv*vec2(1400.,600.)),vec2(12.9898,78.233)))*43758.5453);
        float mm=smoothstep(.42,.58,m+(fib-.5)*.22);
        float rim=1.-smoothstep(0.,.14,abs(m-.5+(fib-.5)*.12));
        vec3 c1=mix(c,mix(paper,ink,ms),a*max(m,ms));
        vec3 c2=mix(c,paper,max(mm,mk.g*(1.-step(.02,m))));
        c2=mix(c2,paper*1.07,rim*.5*step(.5,m))*(1.-.16*rim*step(m,.5));
        vec2 wt=texture2D(mapWrite,uv).rg;   // 空出来的人形里，用钞票的红油墨一行行写出宪法开头「We the People…」：他的位置由人民补上
        c2=mix(c2,vec3(.40,.11,.07),wt.r*smoothstep(wt.g-.015,wt.g,uWrite)*mm*.95);
        c=mix(c1,c2,k);
      }
      if(!back){   // 右下角变色油墨：倾斜时铜色 ↔ 绿色
        ${ERASE_GLSL}
        float m=1.-ell(uv,uSpots[3]); m=smoothstep(0.,.25,m);
        if(uDuel>0.) c=mix(c,vec3(.80,.70,.45),texture2D(mapTenMask,uv).r*smoothstep(.02,.12,uDuel));
        if(uTorch>0.){   // 火炬立起来了：钞票上原来那支橙色的换成修补好的纸面（印章、小字留着，tools/make_torch_fill.py）
          vec2 tu=(uv-vec2(.11963,.08074))/vec2(.2002,.76932);
          if(tu.x>0.&&tu.x<1.&&tu.y>0.&&tu.y<1.) c=mix(c,texture2D(mapTorchFill,tu).rgb,smoothstep(.2,.6,texture2D(mapTorchMask,uv).r)*smoothstep(.05,.3,uTorch));
        }   // 「1」「0」被剪起来了，原处只剩纸
        float ink=1.-smoothstep(.25,.75,dot(c,vec3(.33)));
        vec3 tint=mix(vec3(1.35,1.0,.62),vec3(.62,1.12,.7),uShift);
        c=mix(c,c*tint,m*ink);
      } else if(uTre>0.){   // 背面大楼立起来以后，原处剪空露出纸（范围照 eggs-layout：楼最宽 X -0.70～+0.71，台阶下沿到楼顶）
        c=mix(c,vec3(.80,.70,.45),texture2D(mapTreMask,uv).r*smoothstep(.15,.5,uTre));   // 照整栋楼的轮廓（含柱子、门、旗、两边的树）
      }
      if(back){   // 背面左边水印窗：真钞那里本来就没印东西，比纸面亮一截；压暗压暖一点，跟周围纸色接近（用户 10-24：太白）
        float wm=1.-smoothstep(.8,1.05,length((uv-uSpots[4].xy)/uSpots[4].zw));
        c*=mix(vec3(1.),vec3(.88,.73,.55),wm*(1.-uWater)*.85);   // 照窗边纸面量的颜色比（线性：纸 .59/.43/.18，窗 .68/.60/.33）
      }
      if(back && uWater>0.){   // 水印窗对着光：浮出头像（借正面头像那一块的明暗）
        vec2 q=(uv-uSpots[4].xy)/uSpots[4].zw;
        float m=1.-smoothstep(.75,1.,length(q));
        vec2 puv=vec2(.43-q.x*.12,.55+q.y*.36);
        float lum=dot(texture2D(mapF,puv).rgb,vec3(.33));
        c=mix(c,vec3(1.,.95,.82)*(.55+.55*lum),m*uWater*.85);
        c+=vec3(.25,.2,.1)*uWater*(1.-smoothstep(0.,1.4,length(q)));
        if(uEliza>0.){   // 伊丽莎的剪影（226×528）放进水印窗：窗宽 ±0.14、高 ±0.24（钞票单位）
          vec2 e=vec2(q.x*.14/.19+.5, q.y*.24/.44+.5);
          float a=(e.x>0.&&e.x<1.&&e.y>0.&&e.y<1.)?texture2D(mapEliza,e).a:0.;
          c=mix(c,vec3(1.,.95,.82)*.95,uEliza*m*.6);   // 他的脸先淡成一片光
          c=mix(c,vec3(.10,.07,.05),a*uEliza*m*.92);
        }
      }
      // 能点的地方：一圈金边（刚摊开时亮一下，平时淡淡的，鼠标放上去最亮）
      if(uEnd>0.){   // 三幕看完：像钞票上印了一张折纸说明（吉泽-兰德列特画法：虚线 = 沿这里折，箭头 = 往哪折）；折星动画就是先沿竖中线、再沿横中线对折
        vec2 g=(uv-.5)*vec2(2.36,1.);   // 钞票单位，正中为 0，y 朝上
        float lw=.0068, gap=1.-smoothstep(.1,.11,length(g));   // 线粗一点，金星周围留白
        float dv=(1.-smoothstep(lw*.5,lw,abs(g.x)))*step(.42,fract(g.y*9.));
        float dh=(1.-smoothstep(lw*.5,lw,abs(g.y)))*step(.42,fract(g.x*9.+.3));
        float ra=length(g-vec2(0.,.08));   // 弯箭头：右半张从上面翻到左边
        float arc=(1.-smoothstep(lw*.5,lw*1.1,abs(ra-.3)))*step(.2,g.y)*step(abs(g.x),.26);
        vec2 T=vec2(-.262,.205);
        float head=1.-smoothstep(lw*.5,lw*1.1,min(seg(g,T,T+vec2(-.045,.042)),seg(g,T,T+vec2(.036,.05))));
        float ink=max(max(dv,dh)*(1.-gap),max(arc,head));   // 竖、横两条虚线（折星 v6：先竖折，再横折一下打开留折痕）
        c=mix(c,vec3(.42,.10,.06),ink*.9*uEnd);   // 用钞票上的红墨水色，和黑色雕版花纹分得开
        // 正中的小金星：像钞票上烫的金箔（用户 10-24：别像贴上去的一块，别整块盖住脸）——半透明，底下的雕版花纹透出来；边上压纹，倾斜时一道反光
        float st=sdStar5(g,.078,.45), fill=1.-smoothstep(-.0015,.0015,st);
        vec2 gr=normalize(vec2(sdStar5(g+vec2(.002,0.),.078,.45)-st,sdStar5(g+vec2(0.,.002),.078,.45)-st)+1e-5);   // 往外的方向
        float bev=smoothstep(-.012,0.,st)*fill, lit=dot(gr,normalize(vec2(-.6,.8)));   // 光从左上来
        vec3 foil=c*vec3(1.30,.98,.52)+vec3(.12,.08,.02);
        foil+=vec3(.40,.30,.12)*bev*max(lit,0.)-vec3(.10,.08,.05)*bev*max(-lit,0.);
        float sheen=smoothstep(.75,1.,sin((g.x+g.y)*22.-uShift*7.-uStarHover*3.));
        foil+=vec3(.55,.42,.18)*sheen*(.35+.4*uStarHover);
        c=mix(c,foil,fill*uEnd);
      }
      vec3 add=vec3(0.);
      for(int i=0;i<6;i++){
        if((uSpotBack[i]>.5)!=back) continue;
        if(i==0 && uSil>.01) continue;   // 头像已经变成人影，不再圈
        float d=ell(uv,uSpots[i]);
        float ring=smoothstep(.93,.985,d)*(1.-smoothstep(1.,1.06,d));
        float dash=step(.5,fract(atan(uv.y-uSpots[i].y,(uv.x-uSpots[i].x)*2.36)*6.366+uTime*.15));
        float k=uHint*.55*dash;
        if(i==uHover){ k=1.; c*=1.+.06*(1.-smoothstep(.8,1.,d)); }
        add+=vec3(.95,.72,.3)*ring*k;
      }
      vec3 n=normalize(back?-vN:vN);
      vec3 L=normalize(vec3(-.3,1.,.45));
      vec3 V=normalize(cameraPosition-vWP);
      float dif=.58+.5*max(dot(n,L),0.);
      float spec=pow(max(dot(reflect(-L,n),V),0.),24.)*.08;
      gl_FragColor=vec4(c*dif+spec+add,1.);
      #include <colorspace_fragment>
    }`,
});
const billGeo = new THREE.PlaneGeometry(BILL.w, BILL.h, 160, 68);
const bill = new THREE.Mesh(billGeo, billMat);
const pivot = new THREE.Group();   // 倾斜、落下都动它；翻面动 bill 自己
pivot.add(bill); scene.add(pivot);
pivot.rotation.x = -Math.PI / 2;
const state = { drop: 0, flip: 0, flipTo: 0, yaw: 0, pitch: 0, phase: 'load', camK: 0, peopleTo: 0 };
let stage = null, stageReady = null, star = null, starReady = null, people = null, peopleReady = null, eggs = null, eggsReady = null, stageAtlas = null, acts = null, actsReady = null;

// ---------- 相机：钞票视角（斜着往下看）↔ 舞台视角（放低、推近，像效果图那样看到砖墙和人影正面）；结尾跟着星抬头 ----------
const VIEW = {
  bill: { pos: new THREE.Vector3(), look: LOOK.clone(), fov: 40 },
  stage: { pos: new THREE.Vector3(-.26, .78, 2.05), look: new THREE.Vector3(-.26, .2, -.1), fov: 40 },   // 火炬（X -0.7）和舞台（X -0.47～+0.37）都要完整进画面
  treasury: { pos: new THREE.Vector3(0, .62, 1.85), look: new THREE.Vector3(0, .24, -.25), fov: 40 },   // 背面大楼立起来时：放低、推近到楼前
  duel: { pos: new THREE.Vector3(.62, .42, 1.05), look: new THREE.Vector3(.86, .06, .2), fov: 40 },   // 十步决斗：推到右下角那个 10
};
const fitFov = (needW, dist, aspect, min) => Math.max(min, Math.min(2 * Math.atan(needW / 2 / dist / aspect) * 180 / Math.PI, 90));
function placeCamera() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false);
  camera.aspect = aspect;
  const dist = 2.9;
  VIEW.bill.fov = fitFov(BILL.w * 1.2, dist, aspect, 38);
  VIEW.bill.pos.set(0, dist * .68, dist * .73);   // 钞票在前，后面露出虚化的街道
  VIEW.stage.fov = fitFov(1.7, VIEW.stage.pos.distanceTo(VIEW.stage.look), aspect, 34);
  VIEW.treasury.fov = fitFov(1.75, VIEW.treasury.pos.distanceTo(VIEW.treasury.look), aspect, 34);
  VIEW.duel.fov = fitFov(.9, VIEW.duel.pos.distanceTo(VIEW.duel.look), aspect, 34);
  aimCamera();
}
const camLook = new THREE.Vector3(), tmpV = new THREE.Vector3(), camEnd = new THREE.Vector3();
const smooth = (a, b, t) => { t = Math.min(Math.max((t - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
function aimCamera() {
  const k = smooth(0, 1, state.camK), to = VIEW[state.camView || 'stage'];
  camera.position.lerpVectors(VIEW.bill.pos, to.pos, k);
  camLook.lerpVectors(VIEW.bill.look, to.look, k);
  camera.fov = VIEW.bill.fov + (to.fov - VIEW.bill.fov) * k;
  if (star && star.root.visible) {   // 结尾：前 5.3 秒在桌上一折一折（镜头不动，看着钞票），拿起来立住时再跟着星，飞的时候往上抬（以后接大场景：抬到街道夜空）
    star.body.getWorldPosition(tmpV);
    camLook.lerp(tmpV, smooth(.81, .93, star.p.fold));   // 折星 v6：5.50/6.65 秒拿起来
    camEnd.set(0, tmpV.y + .45 - .2 * star.p.rise, 3.3 + 1.2 * star.p.rise);
    camera.position.lerp(camEnd, smooth(.81, .98, star.p.fold));
  }
  camera.lookAt(camLook);
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => { placeCamera(); fitBackground(); placePlayer(); wake(); });

// ---------- 载入 ----------
const texLoader = new THREE.TextureLoader();
const loadTex = url => new Promise((res, rej) => texLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
async function boot() {
  mark('bootStart');
  const bar = $('#load-bar'); let got = 0; const step = () => { got++; bar.style.width = (got / 4 * 100) + '%'; };
  const [f, b, bg] = await Promise.all(['bill-front', 'bill-back', 'street-blur'].map(n => loadTex(`./assets/${n}.webp`).then(t => (step(), t))));
  uniforms.mapF.value = f; uniforms.mapB.value = b;
  bgTex = bg; bgTex.anisotropy = 1; scene.background = bgTex; fitBackground();
  const mask = await new Promise((res, rej) => texLoader.load('./assets/portrait-mask.png', res, undefined, rej));   // 头像剪空遮罩（tools/make_portrait_fill.py）
  uniforms.mapMask.value = mask;
  loadTex('./assets/portrait-fill.webp').then(t => { uniforms.mapFill.value = t; });   // 剪空处修补图（tools/make_portrait_fill.py），用到时才露出来
  await renderer.compileAsync(scene, camera);   // 着色器在加载画面后面编好
  renderer.initTexture(f); renderer.initTexture(b); renderer.initTexture(bg);
  step(); mark('ready');
  renderer.render(scene, camera); mark('firstFrame'); perf.firstFrameMs = perf.marks.firstFrame;
  $('#loading').classList.add('gone'); setTimeout(() => { $('#loading').style.display = 'none'; }, 700);   // 淡出后直接拿掉，免得有的浏览器停在半透明
  state.phase = 'drop'; state.t0 = performance.now();
  wake();
}
placeCamera();
boot();

// 纸舞台：钞票停稳后下载（53 KB + 贴图 160 KB）并编好着色器（照 web-no-lag：用到之前先在看不见的时候建好）
function loadStage() {
  if (stageReady) return stageReady;
  stageReady = (async () => {
    const plain = url => new Promise((res, rej) => texLoader.load(url, res, undefined, rej));
    const [bytes, atlas, silmask, write] = await Promise.all([loadStageBytes(), loadTex('./assets/stage-atlas.webp'),
      plain('./assets/stage-silmask.webp'), plain('./assets/we-the-people.png')]);   // we-the-people.png 由 tools/make_we_the_people.py 生成
    uniforms.mapSil.value = silmask; uniforms.mapWrite.value = write; stageAtlas = atlas;
    Promise.all([plain('./assets/stage-torchmask.webp'), loadTex('./assets/torch-fill.webp')]).then(([m, f]) => { uniforms.mapTorchFill.value = f; uniforms.mapTorchMask.value = m; });   // 火炬遮罩（ham-stage）+ 去掉火炬的修补图
    stage = await createStage({ parent: bill, billTexture: uniforms.mapF.value, atlasTexture: atlas, bytes, wake });
    addRim(stage.sil); hamRims.forEach(r => { r.visible = true; });   // 金边一起编好着色器
    await stage.compile(renderer, scene, camera); hamRims.forEach(r => { r.visible = false; }); redraw();
    mark('stageReady');
    whenIdle(loadActs); whenIdle(loadPeople); whenIdle(loadEggs);
    return stage;
  })();
  return stageReady;
}
// 三幕剪影：纸舞台编好以后、画面停稳时装（46 KB）并编好着色器；舞台立好时才挪到转台下
function loadActs() {
  if (actsReady) return actsReady;
  actsReady = (async () => {
    await loadStage();
    acts = await createActs({ stage });
    act3Ham = acts.root.getObjectByName('Act3Hamilton'); addRim(act3Ham);   // 先记住：舞台立好后第三幕会被挪到转台下面
    await acts.compile(renderer, scene, camera); redraw();
    mark('actsReady');
    if (state.popped) acts.attach();
    return acts;
  })();
  return actsReady;
}
function actTargets(i) {   // 切到第 i 幕：这一幕的人立起来，别的幕收回去
  state.actTo = { Act1Rise: i === 0 ? 1 : 0, Act2Table: i === 1 ? 1 : 0, Act2Cheers: 0, Act3Toast: i === 2 ? 1 : 0 };
  if (i !== 2 && acts) acts.set('Act3Rewind', 0);
  loadActs().then(wake);
}
// 立体书彩蛋（ham-stage 做的 eggs.glb，接口见 blender/stage/接口.md「彩蛋」）：背面大楼 TreasuryPop；以后加进去的 YorktownPop、DuelPaces 同一套接
const EGG_CLIP = { treasury: 'TreasuryPop', ten: 'DuelPaces' };   // 火炬旁的拉法耶特 YorktownPop 在 stage.glb 里，见 torchEgg
const EGG_SEC = { TreasuryPop: 2.4, DuelPaces: 6 };   // 拨完一段要几秒（合上快一倍）
function loadEggs() {
  if (eggsReady) return eggsReady;
  eggsReady = (async () => {
    await loadStage();
    const plain = url => new Promise((res, rej) => texLoader.load(url, res, undefined, rej));
    [uniforms.mapTreMask.value, uniforms.mapTenMask.value] = await Promise.all([plain('./assets/eggs-treasurymask.webp'), plain('./assets/eggs-tenmask.webp')]);
    eggs = await createEggs({ parent: bill, billTexture: uniforms.mapF.value, billBackTexture: uniforms.mapB.value, atlasTexture: stageAtlas, bytes: await loadStageBytes('./assets/eggs.glb'), wake });
    await eggs.compile(renderer, scene, camera); redraw();
    mark('eggsReady');
    return eggs;
  })();
  return eggsReady;
}
function eggTo(key, v) {   // 某个立体彩蛋立起来（1）/ 合上（0）；模型里还没有这一段就什么都不做
  const clip = EGG_CLIP[key]; if (!clip) return;
  loadEggs().then(() => {
    if (!eggs.clips[clip]) return; state.eggTo = state.eggTo || {}; state.eggTo[clip] = clip === 'TreasuryPop' && v ? .79 : v;   // 大楼停在门打开之前（.80 起是开门，用户 10-24：白门看不懂）
    if (clip === 'TreasuryPop' || clip === 'DuelPaces') { state.camView = clip === 'TreasuryPop' ? 'treasury' : 'duel'; state.camTo = v; }   // 镜头推近，立体感才看得出（决斗的人只有 0.13 高，要推到右下角）
    wake();
  });
}
// 彩蛋③ We the People：纸舞台编好以后、画面停稳时悄悄装（55 KB）并预热；点红字时还没装好就当场装
function loadPeople() {
  if (peopleReady) return peopleReady;
  peopleReady = (async () => {
    people = await createPeople({ parent: bill, uniforms });
    await people.compile(renderer, scene, camera); redraw();
    mark('peopleReady');
    return people;
  })();
  return peopleReady;
}
// 折星：舞台立好以后，等画面停稳 1.5 秒（没人在动）才悄悄装（76 KB）并预热；装的时候正好有动画就再等，免得撞上转台倒带顿一下
function whenIdle(fn) {   // 等画面停稳 1.5 秒（没人在动、没有动画）再做；正好在动就再等
  setTimeout(() => { if (!raf && !dragging) fn(); else whenIdle(fn); }, 1500);
}
let starQueued = false;
function idleLoadStar() { if (!starQueued) { starQueued = true; whenIdle(loadStar); } }
// 折星装好先预热；点 ★ 时还没装好就当场装
function loadStar() {
  if (starReady) return starReady;
  starReady = (async () => {
    star = await createStar({ scene, mapF: uniforms.mapF.value, mapB: uniforms.mapB.value });
    star.root.position.copy(pivot.position);
    await star.compile(renderer, camera); redraw();
    mark('starReady');
    return star;
  })();
  return starReady;
}

// ---------- 渲染：只在需要时画（停稳就睡） ----------
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = t => Math.min(Math.max(t, 0), 1);
let raf = 0, last = 0, dragging = false;
function draw() {
  const now = performance.now();
  if (last) { perf.frames.push(Math.round((now - last) * 10) / 10); if (perf.frames.length > 600) perf.frames.splice(0, 300); }
  last = now;
  let busy = false;
  uniforms.uTime.value = now / 1000;
  if (state.phase === 'drop') {   // 折着的钞票落到桌上 → 先打开第二折 → 再打开第一折
    const t = now - state.t0;
    const d = clamp01(t / 700), u2 = clamp01((t - 800) / 750), u1 = clamp01((t - 1650) / 850);
    pivot.position.set(0, (1 - ease(d)) * 1.1, (1 - ease(d)) * -1.6);   // 从街上飞过来，落到眼前
    pivot.rotation.z = (1 - ease(d)) * .7;
    uniforms.uFold2.value = 1 - ease(u2);
    uniforms.uFold1.value = 1 - ease(u1);
    if (t > 2600) { state.phase = 'idle'; state.hintT = now; mark('unfolded'); setHint(); refreshTip(true); setTimeout(loadSpotify, 900); setTimeout(loadStage, 300); }   // 停稳后再装 Spotify（核显上装它会定住约 1 秒）、编纸舞台
    busy = true;
  }
  // 刚摊开时金边亮一下，3 秒后变淡
  if (state.phase === 'idle' && !state.unpopT0) {
    const k = (now - state.hintT) / 1000, target = k < 3 ? 1 : .35;
    uniforms.uHint.value += (target - uniforms.uHint.value) * .06;
    if (Math.abs(uniforms.uHint.value - target) > .005) busy = true;
  }
  // 翻面
  if (Math.abs(state.flip - state.flipTo) > .001) { state.flip += (state.flipTo - state.flip) * .09; busy = true; } else state.flip = state.flipTo;
  bill.rotation.y = state.flip * Math.PI;
  bill.position.z = Math.sin(state.flip * Math.PI) * .45;   // 翻的时候抬起来一点
  // 倾斜：松手后慢慢回正
  if (!dragging && (Math.abs(state.yaw) > .001 || Math.abs(state.pitch) > .001)) { state.yaw *= .9; state.pitch *= .9; busy = true; }
  pivot.rotation.x = -Math.PI / 2 + state.pitch;
  pivot.rotation.y = state.yaw;
  uniforms.uShift.value = clamp01(Math.hypot(state.yaw, state.pitch) / .3);
  if (dragging && downAt && performance.now() - downAt.t > 450 && uniforms.uShift.value > .97 && !active && !state.flipTo && state.phase === 'idle' && !state.popped && !state.popT0) { dragging = false; state.yaw = state.pitch = 0; open('ten'); }   // 倾斜到 10 完全变绿：两个人立起来走十步
  // 点头像：人影那块变黑 → 人影站起来走上转台 → 舞台一片片立起 → 火炬立起 → 开场；镜头同时放低推近
  if (state.popT0) {
    const t = (now - state.popT0) / 1000;
    uniforms.uSil.value = t < .6 ? .5 * clamp01(t / .5) : Math.min(1, .5 + (t - .6) * 5);
    stage.set('SilUp', (t - .6) / .8); stage.set('StagePop', (t - 1.3) / 1.8); stage.set('TorchPop', (t - 2.9) / 1.3);
    state.camK = clamp01(t / 2.6);
    if (t > .65 && !state.writeT0) state.writeT0 = now;   // 人影一离开纸面就开始写字（用户 10-24：不要等）
    if (t > 4.3) { state.popT0 = 0; state.popped = true; state.poppedAt = now; state.torchTo = 1; if (acts) acts.attach(); showAct(0); }   // 舞台立好：火炬也定在立着、三幕挪到转台下
    busy = true;
  }
  // 结尾第一步：舞台倒着合上、人影躺回头像、镜头回到钞票
  if (state.unpopT0) {
    const t = (now - state.unpopT0) / 1000;
    if (stage.clips.YorktownPop) stage.set('YorktownPop', Math.min(stage.get('YorktownPop'), 1 - t / .4)); state.yorkTo = 0;
    stage.set('TorchPop', 1 - t / .8); stage.set('StagePop', 1 - (t - .4) / 1.4); stage.set('SilUp', 1 - (t - 1.6) / .6);
    uniforms.uSil.value = t < 2.2 ? 1 : Math.max(0, .5 - (t - 2.2) * 1.25);
    state.writeT0 = 0; uniforms.uWrite.value = Math.min(uniforms.uWrite.value, Math.max(0, 1 - (t - 1) / .6));   // 人影躺回来之前，字先淡掉
    state.camK = 1 - clamp01(t / 2.4);
    uniforms.uHint.value *= .9; uniforms.uHover.value = -1;
    if (t > 2.7 && state.closeOnly) {   // 只合上（要翻到背面）：回到平的钞票，接着翻
      state.unpopT0 = 0; state.popped = false; state.torchTo = 0; state.glowTo = 0; stage.turntable.rotation.y = 0; uniforms.uSil.value = 0;
      state.closeOnly = false; setHamHover(false); const then = state.afterClose; state.afterClose = null; if (then) then();

    } else if (t > 2.7 && star) {   // 同一帧换上星：第 0 帧和摊平的钞票一模一样
      state.unpopT0 = 0; state.popped = false; state.torchTo = 0; state.glowTo = 0; stage.turntable.rotation.y = 0;
      pivot.visible = false; star.root.visible = true; star.set(0, 0); state.starT0 = now;
    }
    busy = true;
  }
  // 结尾第二步：折成星 → 往上飞
  if (state.starT0) {
    const t = now - state.starT0;
    star.set(clamp01(t / star.foldMs), clamp01((t - star.foldMs - 300) / star.riseMs));
    if (t > star.foldMs + 300 + star.riseMs) { state.starT0 = 0; state.phase = 'done'; mark('finaleDone'); }
    busy = true;
  }
  // 彩蛋③：红字一笔笔卷成纸条叠到印章上（约 5.8 秒）；关掉卡片时倒着收回去（快一倍）
  if (people && people.p !== state.peopleTo) {
    const step = (now - (state.peopleLast || now)) / people.ms * (state.peopleTo ? 1 : 2);
    people.set(state.peopleTo ? Math.min(1, people.p + step) : Math.max(0, people.p - step));
    state.peopleLast = now; busy = true;
  } else state.peopleLast = 0;
  // 写字：一行行写满，约 5.5 秒
  if (state.writeT0) {
    uniforms.uWrite.value = clamp01((now - state.writeT0) / 3800);
    if (uniforms.uWrite.value >= 1) state.writeT0 = 0;
    busy = true;
  }
  // 火炬彩蛋：火炬单独立起 / 收回，火焰亮度（等鼓掌时一闪一闪，鼓掌那一下猛亮）
  if (stage && !state.popT0 && !state.unpopT0 && state.torchTo !== undefined) {
    const cur = stage.get('TorchPop'), dir = Math.sign(state.torchTo - cur);
    if (dir) { stage.set('TorchPop', cur + dir * Math.min(Math.abs(state.torchTo - cur), .02)); busy = true; }
  }
  if (stage && stage.clips.YorktownPop && state.yorkTo !== undefined && stage.get('StagePop') === 1) {   // 火炬立到一半以后，拉法耶特站上转台（1 秒）
    const cur = stage.get('YorktownPop'), ready = stage.get('TorchPop') > .45 || !state.yorkTo;
    if (ready && Math.abs(cur - state.yorkTo) > 1e-3) { stage.set('YorktownPop', cur + Math.sign(state.yorkTo - cur) * Math.min(Math.abs(state.yorkTo - cur), .017)); busy = true; }
  }
  if (stage && state.glowTo !== undefined) {
    let g = state.glowTo * (state.clapWait ? .55 + .45 * Math.sin(now / 160) : 1);
    if (state.popped && state.torchInvite && !(active && active.key === 'torch')) {   // 邀请再点一次：舞台立好后闪 10 秒，之后一直微微亮着（停稳就睡，不一直重画）
      const since = now - (state.poppedAt || now);
      g = Math.max(g, since < 10000 ? .3 + .3 * Math.sin(since / 260) : .35); if (since < 10000) busy = true;
    }
    if (state.glowFlash) { const f = (now - state.glowFlash) / 900; if (f < 1) g = Math.max(g, 1.6 * (1 - f)); else state.glowFlash = 0; }
    if (Math.abs(stage.torchGlow.value - g) > .003 || state.clapWait || state.glowFlash) { stage.torchGlow.value += (g - stage.torchGlow.value) * .15; busy = true; }
  }
  // 立体书彩蛋：往目标拨（立起按 EGG_SEC 的速度，合上快一倍）；大楼合上了才翻面
  if (eggs && state.eggTo) for (const clip in state.eggTo) {
    const cur = eggs.get(clip), to = state.eggTo[clip];
    if (Math.abs(cur - to) > 1e-4) {
      const step = (now - (state.eggLast || now)) / 1000 / (EGG_SEC[clip] || 2) * (to ? 1 : 2);
      eggs.set(clip, to > cur ? Math.min(to, cur + step) : Math.max(to, cur - step)); busy = true;
    }
  }
  state.eggLast = busy ? now : 0;
  if (stage) uniforms.uTorch.value = uniforms.mapTorchMask.value ? stage.get('TorchPop') : 0;
  if (eggs) { uniforms.uTre.value = eggs.get('TreasuryPop') || 0; uniforms.uDuel.value = eggs.get('DuelPaces') || 0; }
  if (state.camTo !== undefined && !state.popT0 && !state.unpopT0 && !state.popped) {   // 背面大楼的镜头：跟着立起 / 合上走
    const d = state.camTo - state.camK;
    if (Math.abs(d) > 1e-3) { state.camK += Math.sign(d) * Math.min(Math.abs(d), .018); busy = true; } else { state.camK = state.camTo; if (!state.camTo) state.camView = 'stage'; }
  }
  if (state.flipPending && (!eggs || eggs.get('TreasuryPop') === 0) && state.camK < .01) { state.flipPending = false; state.flipTo = state.flipTo ? 0 : 1; setHint(); busy = true; }
  // 三幕：往目标拨（立起按 ACT_SEC，收回快 1.6 倍）
  if (acts && state.actTo && state.popped) for (const k in state.actTo) {
    const cur = acts.get(k), to = state.actTo[k];
    if (Math.abs(cur - to) > 1e-4) {
      const step = (now - (state.actLast || now)) / 1000 / (ACT_SEC[k] || 1.6) * (to ? 1 : 1.6);
      acts.set(k, to > cur ? Math.min(to, cur + step) : Math.max(to, cur - step)); busy = true;
    }
  }
  state.actLast = acts && state.actTo && busy ? now : 0;
  // 第三幕倒带：转台倒着转一圈，人影跟着转
  if (state.fwd) {   // 松手后：够了就转满一圈换到下一幕，不够就转回原位
    const f = state.fwd, t = clamp01((now - f.t0) / f.ms);
    stage.turntable.rotation.y = f.from + (f.to - f.from) * ease(t);
    if (t >= 1) { state.fwd = null; stage.turntable.rotation.y = 0; if (f.then) f.then(); }
    busy = true;
  }
  if (state.spinT0) {
    const t = clamp01((now - state.spinT0) / 3200);
    stage.turntable.rotation.y = Math.PI * 2 * ease(t);   // 倒带 = 逆时针
    if (acts) acts.set('Act3Rewind', ease(t));
    if (t >= 1) { state.spinT0 = 0; stage.turntable.rotation.y = 0; turnTip(); }
    busy = true;
  }
  if (Math.abs(state.camK - (state.camKdrawn || 0)) > 1e-4 || (star && star.root.visible)) { aimCamera(); state.camKdrawn = state.camK; }
  // 翻角：钞票停稳后折过来；鼠标放上去掀起一点；舞台立着、动画中收平
  const curlOn = state.phase === 'idle' && !state.popT0 && !state.unpopT0 && Math.abs(state.flip - state.flipTo) < .01 && !(eggs && eggs.get('TreasuryPop') > 0);
  for (const [u, side] of [['uCurl', 'front'], ['uCurlB', 'back']]) {
    const to = curlOn && side === 'front' ? (state.cornerHover ? 1.4 : 1) : 0, U = uniforms[u];   // 只用一个角翻来翻去（用户 10-24）：背面那个角不卷
    if (Math.abs(U.value - to) > .003) { U.value += (to - U.value) * .12; busy = true; } else U.value = to;
  }
  refreshTip();
  // 都探索完了（彩蛋卡片关上、没在动画中）：浮出折纸虚线和金星，提示一句
  if (!state.endShown && state.phase === 'idle' && !active && !state.popT0 && !state.unpopT0 && allExplored()) {
    state.endShown = true; idleLoadStar();   // 金星出来了：画面空闲时先把折星装好，点金星不用等
    if (state.popped) showTip('都探索完了！点汉密尔顿收起舞台，再点钞票正中的金星，折成星', 'You found everything! Click Hamilton to fold the stage away, then the gold star to finish');
    else showTip('都探索完了！点钞票正中的金星，折成星', 'You found everything! Click the gold star in the middle to finish');
  }
  // 结尾：折纸虚线 + 金星浮出 / 淡掉；平放（舞台合着）时点金星：翻回正面、虚线淡掉，同一帧换成星
  const endTo = state.endShown && !state.folding ? 1 : 0;
  if (Math.abs(uniforms.uEnd.value - endTo) > .004) { uniforms.uEnd.value += (endTo - uniforms.uEnd.value) * (endTo ? .04 : .15); busy = true; } else uniforms.uEnd.value = endTo;
  const shTo = state.starHover ? 1 : 0;
  if (Math.abs(uniforms.uStarHover.value - shTo) > .01) { uniforms.uStarHover.value += (shTo - uniforms.uStarHover.value) * .2; busy = true; } else uniforms.uStarHover.value = shTo;
  if (state.foldFlat && star && Math.abs(state.flip) < .01 && uniforms.uEnd.value < .02 && (!eggs || eggs.get('TreasuryPop') === 0)) {
    state.foldFlat = false; pivot.visible = false; star.root.visible = true; star.set(0, 0); state.starT0 = now; busy = true;
  }
  if (state.foldFlat) busy = true;
  // 水印：透光 → 他的脸 → 2.5 秒后变成伊丽莎的影子
  const eTo = active && active.key === 'watermark' && state.elizaT0 && now > state.elizaT0 ? 1 : 0;
  if (Math.abs(uniforms.uEliza.value - eTo) > .003) { uniforms.uEliza.value += (eTo - uniforms.uEliza.value) * .04; busy = true; } else uniforms.uEliza.value = eTo;
  if (active && active.key === 'watermark' && state.elizaT0 && now <= state.elizaT0) busy = true;
  const wTo = active && active.key === 'watermark' ? 1 : 0;
  if (Math.abs(uniforms.uWater.value - wTo) > .005) { uniforms.uWater.value += (wTo - uniforms.uWater.value) * .05; busy = true; } else uniforms.uWater.value = wTo;
  if (uniforms.uHint.value > .01) busy = busy || state.phase === 'idle' && performance.now() - state.hintT < 6000;
  if (stage && acts && acts.get('Act3Toast') > 0) stage.sil.visible = false;   // 第三幕：舞台上的汉密尔顿一直藏着（别的舞台动画会把他重新显示）
  if (stage) stage.beforeRender();
  if (eggs) eggs.beforeRender();
  renderer.render(scene, camera);
  if (busy || dragging) raf = requestAnimationFrame(draw); else { raf = 0; last = 0; if (state.popped && !starReady) idleLoadStar(); }
}
const wake = () => { if (!raf) raf = requestAnimationFrame(draw); };
// 预热（编着色器）会往画面上真画几帧，其中有平放带人脸的钞票（折星用）；画完马上用正常画面盖回去，浏览器显示之前就盖好（用户 10-24：人脸闪一下）
function redraw() {
  if (raf) return;   // 下一帧本来就要画，显示之前会盖掉
  if (stage && acts && acts.get('Act3Toast') > 0) stage.sil.visible = false;
  if (stage) stage.beforeRender();
  if (eggs) eggs.beforeRender();
  renderer.render(scene, camera);
}

// ---------- 点、拖 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e) {
  if (state.phase !== 'idle' || state.popT0 || state.unpopT0 || Math.abs(state.flip - state.flipTo) > .01) return null;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (state.popped && stage) { const t = hamTargets(); if (t.length && ray.intersectObjects(t, true).length) return { key: 'hamilton', back: false }; }   // 点汉密尔顿 = 收起舞台
  if (state.popped && stage && stage.get('TorchPop') > .5) {   // 舞台立着：立体火炬本身也能点
    const parts = ['Torch', 'Flame1', 'Flame2', 'Flame3'].map(n => stage.root.getObjectByName(n)).filter(Boolean);
    if (ray.intersectObjects(parts, true).length) return { key: 'torch', back: false };
  }
  const hit = ray.intersectObject(bill, false)[0]; if (!hit) return null;   // 只算钞票本身（立在上面的纸片没有贴图坐标）
  const nW = new THREE.Vector3(0, 0, 1).transformDirection(bill.matrixWorld);
  const back = nW.dot(ray.ray.direction) > 0;
  const uv = back ? new THREE.Vector2(1 - hit.uv.x, hit.uv.y) : hit.uv;
  const lx = (hit.uv.x - .5) * BILL.w, ly = (hit.uv.y - .5) * BILL.h;   // 左下角卷起的那块
  if (uniforms.uEnd.value > .5 && Math.hypot(lx, ly) < .1) return { key: 'star', back };   // 正中的小金星：折成星
  const cut = BILL.w / 2 + BILL.h / 2 - .36;
  if (uniforms.uCurl.value > .3 && -(lx + ly) > cut) return { corner: 'front', back };   // 同一个角：正面在左下角，翻到背面后在右下角
  const key = spotKeys.find(k => SPOTS[k].side === (back ? 'back' : 'front') && new THREE.Vector2(uv.x, uv.y).sub(new THREE.Vector2(...SPOTS[k].c)).divide(new THREE.Vector2(...SPOTS[k].r)).length() < 1);
  return { key, back };
}
function pickTable(e) {
  if (!acts || !state.actTo || !state.actTo.Act2Table || acts.get('Act2Table') < .9) return false;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(acts.table, true).length > 0;
}
let downAt = null, moved = 0;
canvas.addEventListener('pointerdown', e => {
  if (state.phase === 'done') { replay(); return; }
  if (e.button !== 0 || state.phase !== 'idle') return;
  dragging = true; downAt = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch, t: performance.now(), onStage: hitsStage(e) }; moved = 0;
  canvas.setPointerCapture(e.pointerId); wake();
});
canvas.addEventListener('pointermove', e => {
  // 舞台立着：在舞台上左右拖 = 转转台（跟着手走）；舞台外面拖 = 左右转着看钞票
  if (dragging && downAt && (downAt.turning || (downAt.onStage && Math.abs(e.clientX - downAt.x) > 8 && Math.abs(e.clientX - downAt.x) > Math.abs(e.clientY - downAt.y)))) {
    downAt.turning = true;
    const dx = e.clientX - (downAt.lx ?? downAt.x); downAt.lx = e.clientX; moved = Math.max(moved, Math.abs(e.clientX - downAt.x));
    turnBy(dx * .012); canvas.style.cursor = 'ew-resize'; return;
  }
  if (dragging && downAt) {
    const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y; moved = Math.max(moved, Math.hypot(dx, dy));
    if (moved > 6) {
      state.yaw = THREE.MathUtils.clamp(downAt.yaw + dx * .002, -.45, .45);
      state.pitch = THREE.MathUtils.clamp(downAt.pitch + dy * .002, -.35, .35);
      canvas.style.cursor = 'grabbing';
    }
    wake(); return;
  }
  const h = pick(e), idx = h && h.key ? spotKeys.indexOf(h.key) : -1;
  setHamHover(!!(h && h.key === 'hamilton'));
  const sh = !!(h && h.key === 'star'); if (sh !== !!state.starHover) { state.starHover = sh; wake(); }
  const ch = (h && h.corner) || false; if (ch !== state.cornerHover) { state.cornerHover = ch; wake(); }   // 只在进出翻角时重画
  canvas.style.cursor = idx >= 0 || state.cornerHover || state.hamHover || state.starHover ? 'pointer' : 'grab';
  if (uniforms.uHover.value !== idx) { uniforms.uHover.value = idx; wake(); }
});
canvas.addEventListener('pointerup', e => {
  dragging = false; canvas.style.cursor = '';
  if (downAt && downAt.turning) { releaseTurn(); return; }
  // 左右快速甩一下 = 翻面（照翻页书的「甩一下」：够快就翻过去）；慢慢拖还是倾斜
  if (downAt && !downAt.onStage && state.phase === 'idle') {
    const fx = e.clientX - downAt.x, fy = e.clientY - downAt.y, ft = performance.now() - downAt.t;
    if (Math.abs(fx) > 110 && ft < 420 && Math.abs(fx) > Math.abs(fy) * 2) { state.yaw = state.pitch = 0; flip(); hideTip(true); return; }
  }
  if (moved < 6 && pickTable(e)) { state.actTo.Act2Cheers = state.actTo.Act2Cheers ? 0 : 1; hideTip(true); wake(); return; }   // 第二幕：点桌上的杯子，大家一起举杯
  if (moved < 6 && active && active.act < 0 && clickedEmpty(e)) { closeCard(); return; }   // 彩蛋开着：点钞票外面的空白处就关掉
  if (moved < 6 && state.popped && !state.unpopT0 && clickedEmpty(e)) { closeStage(); return; }   // 舞台立着：点空白处合上舞台（用户 10-24：退出别靠右下角的键）
  if (moved < 6) { const h = pick(e); if (h && h.corner) { flip(); hideTip(true); } else if (h && h.key === 'hamilton') { setHamHover(false); closeStage(); } else if (h && h.key === 'star') foldStar(); else if (h && h.key) { if (active && active.key === h.key && h.key !== 'portrait') closeCard(); else open(h.key); } }   // 点汉密尔顿收起舞台；点金星折星；再点一次同一个彩蛋关掉
  wake();
});
addEventListener('keydown', e => {   // Esc：先关彩蛋；没开彩蛋、舞台立着就合上舞台
  if (e.key !== 'Escape') return;
  if (active && active.act < 0) closeCard(); else if (state.popped && !state.unpopT0) closeStage(); else if (active) closeCard();
});
// 滚轮：鼠标在舞台上时，往下滚 = 顺时针转（下一幕），往上滚 = 逆时针转回去（第三幕是倒带）
let wheelTimer = 0;
canvas.addEventListener('wheel', e => {
  if (!state.popped || !stage || !hitsStage(e)) return;
  e.preventDefault();
  if (turnBy(-e.deltaY * .004)) { clearTimeout(wheelTimer); wheelTimer = setTimeout(releaseTurn, 260); }
}, { passive: false });
// 汉密尔顿的金边：每个人影纸片后面垫一张放大一点的金色纸片（压在后面，只露出一圈边），鼠标放上去才显示
const hamGold = new THREE.MeshBasicMaterial({ color: 0xd9a740, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 });
const hamRims = []; let act3Ham = null;
function addRim(obj) {
  if (!obj) return;
  obj.traverse(o => {
    if (!o.isMesh || o.userData.rim) return;
    o.geometry.computeBoundingBox(); const ctr = o.geometry.boundingBox.getCenter(new THREE.Vector3()), k = 1.07;
    const r = new THREE.Mesh(o.geometry, hamGold); r.userData.rim = true; r.scale.setScalar(k); r.position.copy(ctr).multiplyScalar(1 - k);
    r.visible = false; r.raycast = () => {}; o.add(r); hamRims.push(r);
  });
}
function hamTargets() {   // 现在站在舞台上的汉密尔顿（第三幕换成三幕里的那个）
  const t = [];
  if (stage && shown(stage.sil)) t.push(stage.sil);
  if (act3Ham && acts.get('Act3Toast') > 0 && shown(act3Ham)) t.push(act3Ham);
  return t;
}
function setHamHover(on) {
  if (state.hamHover === on) return;
  state.hamHover = on; hamRims.forEach(r => { r.visible = on; }); wake();
}
function rayAt(e) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function hitsStage(e) {
  if (!state.popped || !stage) return false;
  rayAt(e); return ray.intersectObject(stage.holder, true).some(h => shown(h.object));
}
function clickedEmpty(e) { rayAt(e); return !ray.intersectObject(pivot, true).some(h => shown(h.object)); }
canvas.addEventListener('dblclick', () => flip());
$('#flip').addEventListener('click', () => flip());
function flip() {
  if (state.phase !== 'idle' || state.popT0 || state.unpopT0) return;
  if (state.popped) { closeStage(() => { state.flipTo = state.flipTo ? 0 : 1; setHint(); wake(); }); return; }   // 舞台立着：先合上再翻（纸片会从背面露出来）
  if (eggs && eggs.get('TreasuryPop') > 0) { state.flipPending = true; closeCard(); return; }   // 背面大楼立着：先合上再翻
  state.flipTo = state.flipTo ? 0 : 1; closeCard(); setHint(); wake(); }

// ---------- 主线和彩蛋：说明卡 + Spotify ----------
let active = null;   // {key, act}
function open(key) {
  if (key === 'portrait') {
    if (!state.popped && !state.popT0) { popUp(); return; }   // 第一次点：平面的人站起来、纸舞台立起来，再开场
    if (state.popped) showAct(active && active.act >= 0 ? active.act : 0);
    return;
  }
  const egg = EGGS[key];
  if (key === 'people') loadPeople().then(() => { state.peopleTo = 1; state.peopleLast = 0; wake(); });   // 红字卷成纸条
  state.found = state.found || {}; state.found[key] = true;   // 找到过的彩蛋（结尾前提醒用）
  if (key === 'torch') torchEgg();   // 火炬立起来、亮起来；唱到一半停下来等鼓掌
  if (key === 'watermark') { state.elizaT0 = performance.now() + 2500; if (!uniforms.mapEliza.value) texLoader.load('./assets/eliza-sil.png', t => { uniforms.mapEliza.value = t; wake(); }); }
  eggTo(key, 1);   // 立体书彩蛋：背面大楼立起、火炬旁两个人影、十步决斗
  active = { key, act: -1 };
  fillCard({ kind: '彩蛋 · ' + egg.how + ' · ' + egg.howEn, zh: egg.zh, en: egg.en, line: egg.line, lineEn: egg.lineEn, track: egg.track });
}
async function popUp() {
  if (state.phase !== 'idle' || state.flipTo) return;   // 钞票没展开完、或翻在背面时不立起来
  closeCard(); state.yaw = state.pitch = 0;
  await loadStage();
  state.popT0 = performance.now(); wake();
}
function closeStage(then) {   // 舞台立着时要翻面：先把三幕的人收回、舞台合上，合完再翻（用户 10-24：打开正面以后到不了背面）
  if (!state.popped || state.unpopT0) return;
  closeCard(); $('#acts').hidden = true; document.body.classList.remove('acts-open'); hideTip(true);
  state.yaw = state.pitch = 0; state.spinT0 = 0; state.fwd = null; if (stage) stage.turntable.rotation.y = 0;
  if (acts) { for (const k in acts.prog) acts.set(k, 0); state.actTo = null; }
  state.closeOnly = true; state.afterClose = then; state.unpopT0 = performance.now(); wake();
}
function foldStar() {   // 点金星：舞台立着就先合上再折；平放就翻回正面直接折（正反面都能点）
  if (state.phase !== 'idle' || state.popT0 || state.unpopT0 || state.folding) return;
  state.folding = true; state.starHover = false; clearTimeout(tipTimer); $('#tip').hidden = true;   // 折星时收起提示纸条，重来时再出来
  if (state.popped) { startFinale(); return; }
  closeCard(); $('#acts').hidden = true; document.body.classList.remove('acts-open');
  state.yaw = state.pitch = 0; state.flipTo = 0;
  loadStar().then(() => { state.phase = 'finale'; state.foldFlat = true; wake(); });
}
function startFinale() {   // 主线演完：舞台合上 → 钞票摆正 → 换成星 → 折成星 → 往上飞
  if (!state.popped || state.unpopT0) return;
  closeCard(); $('#acts').hidden = true; document.body.classList.remove('acts-open'); state.folding = true; clearTimeout(tipTimer); $('#tip').hidden = true;   // 折星时收起提示纸条
  state.flipTo = 0; state.yaw = state.pitch = 0; state.spinT0 = 0;
  if (acts) { for (const k in acts.prog) acts.set(k, 0); state.actTo = null; }   // 舞台合上之前，三幕的人先全部收回
  loadStar().then(() => { state.unpopT0 = performance.now(); state.phase = 'finale'; wake(); });
}
function replay() {   // 结尾看完：点一下回到钞票（大场景做好后改成回到街上）
  if (state.phase !== 'done') return;
  state.folding = false; state.endShown = false; uniforms.uEnd.value = 0; state.visited = {}; state.found = {};   // 重来：从头探索
  star.root.visible = false; star.set(0, 0); pivot.visible = true;
  uniforms.uSil.value = 0; uniforms.uWrite.value = 0; uniforms.uFold1.value = uniforms.uFold2.value = 1; state.camK = 0; aimCamera();
  const end = $('#acts .end'); if (end) end.remove();
  state.phase = 'drop'; state.t0 = performance.now(); wake();
}
function showAct(i) {
  const a = ACTS[i];
  state.visited = state.visited || {}; state.visited[i] = true;
  if (state.popped) actTargets(i);
  state.act = i;
  tipHeld = ''; refreshTip(true);
  if (i === 2 && stage) { state.rewind = { acc: 0, done: false, t0: performance.now() }; setTimeout(autoRewind, 6000); }   // 第三幕：把转台往回拖 = 倒带
  if (i === 2) idleLoadStar();   // 折星等画面空闲再装，别撞上倒带
  active = { key: 'portrait', act: i };
  $('#acts').hidden = false; document.body.classList.add('acts-open');
  document.querySelectorAll('#acts button').forEach((b, j) => b.setAttribute('aria-pressed', j === i));
  fillCard({ kind: '主线 · 第 ' + a.no + ' 幕 · Act ' + a.no, zh: a.zh, en: a.en, line: a.line, lineEn: a.lineEn, track: a.track });
}
function fillCard(c) {
  $('#card').hidden = false; document.body.classList.add('card-open');
  $('#card').classList.toggle('no-song', !c.track);
  $('#card-kind').textContent = c.kind;
  $('#card-zh').textContent = c.zh; $('#card-en').textContent = c.en;
  $('#card-line').textContent = c.line; $('#card-line-en').textContent = c.lineEn;
  if (c.track) play(c.track); else stop();
  $('#player').classList.add('away'); clearTimeout(playerTimer); playerTimer = setTimeout(placePlayer, 900);
  wake();
}
function closeCard() {
  if (active && active.key === 'people') state.peopleTo = 0;
  if (active) eggTo(active.key, 0);
  if (active && active.key === 'torch') endTorch();
  active = null; $('#card').hidden = true; document.body.classList.remove('card-open'); stop(); placePlayer();
  document.querySelectorAll('#acts button').forEach(b => b.setAttribute('aria-pressed', false)); wake();
}
$('#card-close').addEventListener('click', closeCard);
// 彩蛋② Yorktown：点火炬 → 火炬立起（舞台没立时单独立）、火焰亮 → 放了几秒停住，等访客鼓掌才接着放
// 原版演出唱到「移民，我们把事办成」那句，观众每场都欢呼，演出要多奏几小节等掌声停下来（NBC 2025）
let clapTimer = 0;
async function torchEgg() {
  await loadStage();
  state.torchTo = 1; state.glowTo = 1; state.clapWait = false; state.yorkTo = state.popped ? 1 : 0; wake();   // 舞台立着才有拉法耶特（要站在转台上）
  state.torchInvite = !state.popped;   // 舞台还没立：拉法耶特这次看不到，舞台立起来以后火炬闪着提示再点一次
  clearTimeout(clapTimer); clapTimer = setTimeout(() => {
    if (!active || active.key !== 'torch') return;
    state.clapWait = true; stop(); $('#clap').hidden = false; wake();   // 停住：音乐停、火焰一闪一闪、出现鼓掌键
  }, 9000);
}
function endTorch() {
  clearTimeout(clapTimer); $('#clap').hidden = true; state.clapWait = false;
  state.glowTo = 0; state.torchTo = state.popped ? 1 : 0; state.yorkTo = 0; wake();
}
$('#clap').addEventListener('click', () => {
  $('#clap').hidden = true; state.clapWait = false; state.glowFlash = performance.now();
  wantPlay = true; try { spotify && spotify.play(); } catch (e) {}
  wake();
});
// 转转台（从上往下看）：rotation 往负 = 顺时针 = 下一幕；往正 = 逆时针 = 回上一幕，第三幕没倒带时 = 倒带
function turnBy(dr) {
  if (!stage || !state.popped || state.unpopT0 || state.spinT0 || state.fwd) return false;
  const rw = state.act === 2 && state.rewind && !state.rewind.done, P = Math.PI;
  stage.turntable.rotation.y = THREE.MathUtils.clamp(stage.turntable.rotation.y + dr, rw ? -P * .6 : -P * 1.2, rw ? P * 2.2 : P * 1.2);
  if (rw) {
    state.rewind.acc = Math.max(0, stage.turntable.rotation.y / (P * 2));
    if (acts) acts.set('Act3Rewind', Math.min(1, state.rewind.acc));   // 安吉莉卡走到正中，汉密尔顿和伊丽莎退后
    if (state.rewind.acc >= 1) { state.rewind.done = true; stage.turntable.rotation.y = 0; if (acts) acts.set('Act3Rewind', 1); mark('rewound'); turnTip(); }
  }
  wake(); return true;
}
function releaseTurn() {   // 松手 / 滚轮停下：转过四分之一圈就转满一圈换幕，不够就转回原位
  if (!stage || state.fwd) return;
  const r = stage.turntable.rotation.y, i = state.act || 0, last = i === 2, now = performance.now();
  if (last && state.rewind && !state.rewind.done) { if (r < 0) state.fwd = { from: r, to: 0, t0: now, ms: 400 }; wake(); return; }   // 倒带转到一半：停在那里，接着转就行
  hideTip(true);
  if (r < -Math.PI * .5) {
    state.fwd = { from: r, to: -Math.PI * 2, t0: now, ms: 900, then: last ? () => closeStage() : null };   // 第三幕演完再往后转 = 收起舞台
    if (!last) showAct(i + 1);   // 一边转一边换：上一幕的人收下去，下一幕的人立起来
  } else if (r > Math.PI * .5 && i > 0) {
    state.fwd = { from: r, to: Math.PI * 2, t0: now, ms: 900 }; showAct(i - 1);
  } else state.fwd = { from: r, to: 0, t0: now, ms: 400 };
  wake();
}
function turnTip() {}   // 第三幕倒带完：先不提示（各种指引等界面风格定了再一起做）
function allExplored() {   // 三幕都看过 + 正面 火炬 / 红字 / 10 + 背面 水印 / 大楼
  const v = state.visited || {}, f = state.found || {};
  return [0, 1, 2].every(i => v[i]) && ['torch', 'people', 'ten', 'watermark', 'treasury'].every(k => f[k]);
}
function autoRewind() {   // 6 秒没人拖：转台自己倒转一圈，这一段一定看得到
  if (state.act !== 2 || !state.rewind || state.rewind.done || state.rewind.acc > .05) return;   // 已经转回第二幕就不自己倒带
  state.rewind.done = true; state.spinT0 = performance.now(); hideTip(true); wake();
}
ACTS.forEach((a, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', false);
  b.innerHTML = `<span>${a.no}</span>${a.en}`; b.title = a.zh;
  b.addEventListener('click', () => showAct(i)); $('#acts').appendChild(b);
});

// 提示纸条（照 ui-flow 二-19）：进来时一句总提示，第一次点完 6 秒后淡掉；第二幕、第三幕卡住那一步各一句就近提示
let tipTimer = 0, tipped = false;
// 用户 10-24：提示要一直在（翻回正面也在），还要有彩蛋清单和最后怎么结束。showTip = 临时说一句，hideTip = 回到「现在能做什么」
let tipHeld = '';
function setTipText(zh, en) { const t = $('#tip'); $('#tip-now').innerHTML = `${zh}<span>${en}</span>`; t.hidden = false; }
function showTip(zh, en) { tipHeld = zh; setTipText(zh, en); clearTimeout(tipTimer); }
function hideTip(soon) { clearTimeout(tipTimer); tipTimer = setTimeout(() => { tipHeld = ''; refreshTip(true); }, soon ? 0 : 6000); }
const EXIT = ['点汉密尔顿或屏幕空白处，收起舞台', 'click Hamilton or anywhere empty to fold the stage away'];
function baseTip() {   // 现在能做什么（跟着状态变）
  if (state.popped) {
    const i = state.act || 0, end = state.endShown ? ['；收起后点金星折成星', ' · then the gold star to finish'] : ['', ''];
    if (i === 0) return [`顺时针转转台进下一幕（在舞台上往左拖，或滚轮往下）· ${EXIT[0]}`, `Turn the stage clockwise for the next act (drag left or scroll down) · ${EXIT[1]}`];
    if (i === 1) return [`点桌上的杯子一起举杯 · 顺时针转转台进下一幕 · ${EXIT[0]}`, `Click the cups to raise a toast · turn the stage clockwise to go on · ${EXIT[1]}`];
    if (state.rewind && !state.rewind.done) return [`逆时针转一圈，时间倒回去（往右拖，或滚轮往上）· ${EXIT[0]}`, `Turn the stage back one full turn to rewind (drag right or scroll up) · ${EXIT[1]}`];
    return [`演完了 · ${EXIT[0]}${end[0]}`, `The show is over · ${EXIT[1]}${end[1]}`];
  }
  if (state.endShown) return ['都探索完了！点钞票正中的金星，折成星', 'You found everything! Click the gold star in the middle to finish'];
  if (state.flipTo) return ['背面：点大楼、对着光看左边的水印 · 点右下角往下弯的角，翻回正面', 'The back: try the building and the watermark · click the bent corner (bottom right) to flip back'];
  return ['点头像开场 · 拖动钞票能倾斜 · 点左下角翘起的角，翻到背面', 'Click the portrait to begin · drag to tilt · click the curled corner (bottom left) to flip'];
}
let tipKey = '';
function refreshTip(force) {   // 状态变了就换「现在能做什么」，清单打勾
  if (state.phase !== 'idle' || state.folding) return;
  const b = baseTip(), f = state.found || {}, v = state.visited || {};
  const key = b[0] + '|' + Object.keys(f).join() + '|' + Object.keys(v).join();
  if (key === tipKey && !force) return; tipKey = key;
  if (!tipHeld) setTipText(b[0], b[1]);
  const EGG = [['torch', '火炬'], ['people', '红字 We the People'], ['ten', '右下角的 10（点它，或倾斜钞票让它变绿）'], ['watermark', '左边的水印（对着光才看得见）'], ['treasury', '财政部大楼']];
  const n = EGG.filter(([k]) => f[k]).length;
  const na = [0, 1, 2].filter(i => v[i]).length;   // 主线也要数上（用户 10-24：只写彩蛋 5/5 会以为找齐了，其实三幕还没看完）
  $('#tip-toggle').textContent = `主线 ${na}/3 · 彩蛋 ${n}/5 · 清单 ${$('#tip-list').hidden ? '▾' : '▴'}`;
  const li = (txt, ok, cls) => `<li class="${ok ? 'ok' : ''}${cls ? ' ' + cls : ''}">${txt}</li>`;
  $('#tip-list').innerHTML = li('主线（点头像）', 0, 'h') + ACTS.map((a, i) => li(`${a.no} ${a.en}`, v[i])).join('')
    + li('正面彩蛋', 0, 'h') + EGG.slice(0, 3).map(([k, t]) => li(t, f[k])).join('')
    + li('背面彩蛋', 0, 'h') + EGG.slice(3).map(([k, t]) => li(t, f[k])).join('')
    + li('怎么玩', 0, 'h') + li('翻面：点左下角翘起的角（翻到背面后它在右下角）') + li('收起舞台：点汉密尔顿或屏幕空白处')
    + li('主线三幕都看过、5 个彩蛋都找到以后：钞票正中出现金星，点它折成星', state.folding);
}
$('#tip-toggle').addEventListener('click', () => { const l = $('#tip-list'); l.hidden = !l.hidden; $('#tip-toggle').setAttribute('aria-expanded', !l.hidden); refreshTip(true); });
function setHint() {
  $('#hint').textContent = state.flipTo
    ? '背面：点大楼，或点左边那块空白的水印窗 · Back: try the building, or the blank watermark window'
    : '点头像开场；火炬、手写字、右下角的 10 各藏一个彩蛋。拖动可以倾斜 · Click the portrait to begin. Drag to tilt.';
}

// Spotify 官方嵌入播放器：钞票摊开、停稳以后才装；平时放在画面外，卡片打开时才挪进卡片（照圣母院 10-23 的经验）
let spotify = null, spotifyReady = null, pending = ACTS[0].track, wantPlay = false;
function loadSpotify() {
  if (spotifyReady) return spotifyReady;
  spotifyReady = new Promise(res => {
    mark('spotifyLoad');
    window.onSpotifyIframeApiReady = api => {
      api.createController($('#spotify-frame'), { width: '100%', height: 80, uri: 'spotify:track:' + pending }, c => {
        spotify = c; mark('spotifyReady');
        c.addListener('ready', () => { if (wantPlay) try { c.play(); } catch (e) {} });
        res(c);
      });
    };
    const sc = document.createElement('script'); sc.src = 'https://open.spotify.com/embed/iframe-api/v1'; sc.async = true; document.body.appendChild(sc);
  });
  return spotifyReady;
}
async function play(track) {
  wantPlay = true; pending = track;
  if (!spotify) await loadSpotify();
  try { spotify.loadUri('spotify:track:' + track); spotify.play(); } catch (e) {}
}
function stop() { wantPlay = false; try { spotify && spotify.pause(); } catch (e) {} }
let playerTimer = 0;
function placePlayer() {
  const p = $('#player'), slot = $('#spotify');
  if ($('#card').hidden || $('#card').classList.contains('no-song')) { p.classList.add('away'); return; }
  const r = slot.getBoundingClientRect(); p.classList.remove('away');
  Object.assign(p.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
}

// ---------- 版权说明 ----------
// 用户 10-23：角上的「声音与版权」按钮先不放；说明文字留在 index.html 的 #credits 里，正式发布前另想放法
$('#credits-close').addEventListener('click', () => $('#credits').close());

window.__ham = { state, uniforms, aim: aimCamera, open, flip, showAct, closeCard, popUp, startFinale, replay, closeStage, foldStar, wake, renderer, camera, scene, get stage() { return stage; }, get acts() { return acts; }, get act3Ham() { return act3Ham; }, get star() { return star; }, get eggs() { return eggs; },
  idle: () => !raf, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs.length }),
  gpu: () => { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } };
if (new URLSearchParams(location.search).has('jump')) import('./jump.js');   // 测试用跳转按钮：网址带 ?jump 才装
