import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 纸舞台测试页 + 给 main.js 用的 createStage()。模型和动画来自 blender/stage/build_stage.py，接口见 blender/stage/接口.md
// 写法照 main.js：同一个相机、同一套钞票光照；平躺的纸片和钞票一模一样，所以平躺时直接不画（露出底下真的钞票）

// ================= createStage：主对话直接 import 这个 =================
const L = 'vec3 L=normalize(vec3(-.3,1.,.45));';   // 和 main.js 钞票同一盏光
const VERT = `attribute vec2 uv1;
  uniform mat4 uRootInv;
  varying vec2 vUv,vUv1; varying vec3 vN,vWP,vRP,vRN; varying float vUpY;
  void main(){
    vUv=uv; vUv1=uv1;
    vUpY=(uRootInv*modelMatrix*vec4(0.,1.,0.,0.)).y;   // 这块纸板自己还平躺着吗（合上时自己的“上”就是纸面的上）
    vec4 wp=modelMatrix*vec4(position,1.); vWP=wp.xyz;
    vN=normalize(mat3(modelMatrix)*normal);
    vRP=(uRootInv*wp).xyz; vRN=normalize(mat3(uRootInv)*vN);   // 在钞票自己的坐标里：离纸面多高、朝哪
    gl_Position=projectionMatrix*viewMatrix*wp;
  }`;
const FRAG = `uniform sampler2D mapBill,mapBillBack,mapAtlas; uniform float uGlow;
  varying vec2 vUv,vUv1; varying vec3 vN,vWP,vRP,vRN; varying float vUpY;
  void main(){
    vec3 c;
    #if 1
      if(abs(vRP.y)<.016&&(abs(vRN.y)>.995||vUpY>.9995)) discard;   // 平躺着、贴着纸面（正面或背面）：跟底下的钞票一模一样（或压在别的纸下面；人影平躺时由主页面的头像盖着），不画
    #endif
    #if KIND==0||KIND==2
      c=texture2D(mapBill,vec2(vUv.x,1.-vUv.y)).rgb;
      c*=1.-.32*smoothstep(.004,.12,vRP.y)*(1.-.5*abs(vRN.y));   // 抬离纸面的钞票面暗一点，看得出是一张翘起来的纸
    #endif
    #if KIND==2   // 火炬、转台面：立起来 / 升起来以后换成干净的火炬图、舞台地板
      vec3 a=texture2D(mapAtlas,vec2(vUv1.x,1.-vUv1.y)).rgb;
      c=mix(c,a*(1.+uGlow*vec3(.35,.22,.08)),max(smoothstep(.02,.3,1.-abs(vRN.y)),smoothstep(.006,.04,vRP.y)));
    #endif
    #if KIND==1
      c=texture2D(mapAtlas,vec2(vUv.x,1.-vUv.y)).rgb;
    #endif
    #if KIND==4   // 背面的彩蛋（财政部大楼）：背面贴图，UV 已按网页的左右镜像算好
      c=texture2D(mapBillBack,vec2(vUv.x,1.-vUv.y)).rgb;
      c*=1.-.25*smoothstep(.004,.12,-vRP.y)*(1.-.5*abs(vRN.y));
    #endif
    #if KIND==3
      c=vec3(.035,.027,.022);
    #endif
    vec3 n=normalize(gl_FrontFacing?vN:-vN); ${L}
    vec3 V=normalize(cameraPosition-vWP);
    float dif=.58+.5*max(dot(n,L),0.);
    float spec=pow(max(dot(reflect(-L,n),V),0.),24.)*.06;
    gl_FragColor=vec4(c*dif+spec,1.);
    #include <colorspace_fragment>
  }`;
const KINDS = { Bill: 0, Stage: 1, BillTorch: 2, BillFloor: 2, Sil: 3, BillBack: 4 };

export async function loadStageBytes(url = './assets/stage.glb') {
  const packed = 'DecompressionStream' in globalThis;   // 照圣母院：有 gz 就下 gz（53 KB），浏览器自己解
  const r = await fetch(packed ? url + '.gz' : url);
  return packed ? await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await r.arrayBuffer();
}

/** parent：钞票那个 mesh（main.js 的 bill，XY 平面、+Z 朝上）。billTexture：main.js 已经装好的正面贴图。 */
export async function createStage({ parent, billTexture, atlasTexture, bytes, wake = () => {} }) {
  const gltf = await new GLTFLoader().parseAsync(bytes || await loadStageBytes(), './assets/');
  const holder = new THREE.Group(); holder.rotation.x = Math.PI / 2;   // 模型是钞票平放在 XZ、Y 朝上；挂到 XY 平面的钞票上要转回来
  holder.add(gltf.scene); parent.add(holder);
  const root = gltf.scene;
  const uniforms = { mapBill: { value: billTexture }, mapBillBack: { value: billTexture }, mapAtlas: { value: atlasTexture }, uRootInv: { value: new THREE.Matrix4() }, uGlow: { value: 0 } };
  const mats = {};
  for (const [name, k] of Object.entries(KINDS)) mats[name] = new THREE.ShaderMaterial({ uniforms, defines: { KIND: k }, vertexShader: VERT, fragmentShader: FRAG });
  const torchGlow = { value: 0 };
  mats.Flame = new THREE.ShaderMaterial({ uniforms: { ...uniforms, uGlow: torchGlow }, defines: { KIND: 2 }, vertexShader: VERT, fragmentShader: FRAG });
  const byName = {};
  root.traverse(o => {
    byName[o.name] = byName[o.name] || o;
    if (o.isMesh) {
      const n = o.material.name, flame = /^Flame/.test(o.parent.name) || /^Flame/.test(o.name);
      o.material = flame && n === 'BillTorch' ? mats.Flame : (mats[n] || mats.Bill);
    }
  });
  // 地上一块软影子：舞台立起来时慢慢出现（不用实时影子）
  const shadowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uA: { value: 0 }, uT: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP=position.xz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uA,uT; varying vec2 vP;
      void main(){
        float a=uA*.42*(1.-smoothstep(.15,1.,length((vP-vec2(-.05,-.2))/vec2(.5,.33))));
        a+=uT*.45*(1.-smoothstep(.55,1.,length((vP-vec2(-.1,.22))/vec2(.24,.21))));
        gl_FragColor=vec4(0.,0.,0.,a); }`,
  });
  const sg = new THREE.PlaneGeometry(1.4, 1.1, 1, 1); sg.rotateX(-Math.PI / 2); sg.translate(-.05, .0006, 0);
  const shadow = new THREE.Mesh(sg, shadowMat); shadow.renderOrder = -1; root.add(shadow);

  const mixer = new THREE.AnimationMixer(root);
  const clips = {}, actions = {}, prog = { SilUp: 0, StagePop: 0, TorchPop: 0, YorktownPop: 0 };
  for (const c of gltf.animations) {
    clips[c.name] = c; prog[c.name] = prog[c.name] || 0;
    const a = actions[c.name] = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true;
  }
  const turntable = byName.Turntable, sil = byName.HamiltonSil, laf = byName.YorkLafayette;
  const torchParts = ['Torch', 'Flame1', 'Flame2', 'Flame3'].map(n => byName[n]).filter(Boolean);
  function apply() {
    for (const k in actions) actions[k].time = prog[k] * clips[k].duration;
    mixer.update(0);
    holder.visible = Object.values(prog).some(v => v > 0);   // 全合上就整个不画（平躺的人影是黑的，要等主页面“脸缩成人影”之后才露出来）
    sil.visible = prog.SilUp > 0;
    if (laf) laf.visible = prog.YorktownPop > 0;   // 拉法耶特：Yorktown 彩蛋才出来
    torchParts.forEach(o => o.visible = prog.TorchPop > 0);   // 立体火炬：合上时是压扁的，不画
    shadowMat.uniforms.uA.value = prog.StagePop; shadowMat.uniforms.uT.value = Math.min(1, Math.max(0, (prog.StagePop - .82) / .18));
    wake();
  }
  apply();
  return {
    root, holder, mixer, clips, mats, turntable, sil, laf, torchGlow,
    /** 拨到某段的某处：clip = 'SilUp' | 'StagePop' | 'TorchPop'，p = 0（平躺）～1（立好）。倒着拨就是合上 */
    set(clip, p) { prog[clip] = Math.min(Math.max(p, 0), 1); apply(); },
    get: clip => prog[clip],
    /** 每帧画之前调一次（钞票倾斜、翻面后要更新“纸面在哪”） */
    beforeRender() { root.updateWorldMatrix(true, false); uniforms.uRootInv.value.copy(root.matrixWorld).invert(); },
    async compile(renderer, scene, camera) {   // 先把 5 种着色器在加载画面后面编好（照 web-no-lag）
      const vis = holder.visible; holder.visible = true; sil.visible = true;
      const keep = { ...prog }; Object.keys(prog).forEach(k => prog[k] = 1); apply();
      await renderer.compileAsync(scene, camera);
      this.beforeRender(); renderer.render(scene, camera);   // 真画一帧：Windows 的显卡要第一次画的时候才把着色器链好（不画这一下，立起来时会顿 50～70 ms）
      Object.keys(prog).forEach(k => prog[k] = .02); apply(); this.beforeRender(); renderer.render(scene, camera);   // 再画一帧“刚开始立、大部分还平躺不画”的样子（不画这一下，第一次立起来的第一帧会慢 30～45 ms）
      Object.assign(prog, keep); apply(); holder.visible = vis;
    },
  };
}

/** 彩蛋（eggs.glb，用到才装）：TreasuryPop（背面财政部大楼）、DuelPaces（十步决斗）；YorktownPop 在 stage.glb 里，传了 stage 就能用 eggs.set 拨。parent / 贴图同 createStage，另要背面贴图 billBackTexture。 */
export async function createEggs({ parent, billTexture, billBackTexture, atlasTexture, bytes, wake = () => {}, stage = null }) {   // stage：传 createStage 的结果，eggs.set('YorktownPop') 就转给它（拉法耶特挂在舞台的转台上）
  const gltf = await new GLTFLoader().parseAsync(bytes || await loadStageBytes('./assets/eggs.glb'), './assets/');
  const holder = new THREE.Group(); holder.rotation.x = Math.PI / 2;
  holder.add(gltf.scene); parent.add(holder);
  const root = gltf.scene;
  const uniforms = { mapBill: { value: billTexture }, mapBillBack: { value: billBackTexture }, mapAtlas: { value: atlasTexture }, uRootInv: { value: new THREE.Matrix4() }, uGlow: { value: 0 } };
  const mats = {};
  for (const [name, k] of Object.entries(KINDS)) mats[name] = new THREE.ShaderMaterial({ uniforms, defines: { KIND: k }, vertexShader: VERT, fragmentShader: FRAG });
  root.traverse(o => { if (o.isMesh) o.material = mats[o.material.name] || mats.Bill; });
  const byName = {}; root.traverse(o => { byName[o.name] = byName[o.name] || o; });
  const digits = ['Digit1', 'Digit0'].map(n => byName[n]).filter(Boolean), duelists = ['DuelHamilton', 'DuelBurr'].map(n => byName[n]).filter(Boolean);
  const mixer = new THREE.AnimationMixer(root);
  const clips = {}, actions = {}, prog = {};
  for (const c of gltf.animations) {
    clips[c.name] = c; prog[c.name] = 0;
    const a = actions[c.name] = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true;
  }
  function apply() {
    for (const k in actions) actions[k].time = prog[k] * clips[k].duration;
    mixer.update(0);
    holder.visible = Object.values(prog).some(v => v > 0);   // 全合上就整个不画
    const d = prog.DuelPaces || 0;   // 决斗：「1」「0」转到侧面那一刻换成两个人
    digits.forEach(o => o.visible = d < .2); duelists.forEach(o => o.visible = d >= .2);
    wake();
  }
  apply();
  return {
    root, holder, mixer, clips, mats,
    set(clip, p) { if (!(clip in actions)) return stage && stage.set(clip, p); prog[clip] = Math.min(Math.max(p, 0), 1); apply(); },   // 不是 eggs.glb 里的动画（YorktownPop）就交给舞台
    get: clip => clip in actions ? prog[clip] : stage && stage.get(clip),
    beforeRender() { root.updateWorldMatrix(true, false); uniforms.uRootInv.value.copy(root.matrixWorld).invert(); },
    async compile(renderer, scene, camera) {   // 编着色器 + 真画两帧（全开、刚开始），理由同 createStage
      const keep = { ...prog };
      for (const v of [1, .3, .006]) { Object.keys(prog).forEach(k => prog[k] = v); apply(); if (v === 1) await renderer.compileAsync(scene, camera); this.beforeRender(); renderer.render(scene, camera); }
      Object.assign(prog, keep); apply();
    },
  };
}

// ================= 测试页 =================
if (document.querySelector('#scene[data-stage-test]')) runTest();

async function runTest() {
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
  const BILL = { w: 2.36, h: 1.0 };

  // 桌面（同 main.js 早先的丝绒）
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vP;
      void main(){
        float d=length(vP*vec2(.62,1.));
        vec3 c=mix(vec3(.11,.025,.03),vec3(.012,.006,.007),smoothstep(.2,2.6,d));
        float n=fract(sin(dot(floor(vP*180.),vec2(12.9898,78.233)))*43758.5453);
        c*=.94+.08*n;
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // 平钞票：正面 / 背面贴图（背面左右镜像贴，同 main.js）+ main.js 那套光。网址带 #back = 翻到背面测彩蛋⑥ 财政部大楼；#duel = 测彩蛋④ 十步决斗
  const BACK = location.hash === '#back', DUEL = location.hash === '#duel', EGGS = BACK || DUEL;
  const billU = { map: { value: null }, mapB: { value: null } };
  const bill = new THREE.Mesh(new THREE.PlaneGeometry(BILL.w, BILL.h), new THREE.ShaderMaterial({
    uniforms: billU, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vN,vWP; void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.); vWP=wp.xyz; vN=normalize(mat3(modelMatrix)*vec3(0.,0.,1.)); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform sampler2D map,mapB; varying vec2 vUv; varying vec3 vN,vWP;
      void main(){ bool back=!gl_FrontFacing; vec3 c=back?texture2D(mapB,vec2(1.-vUv.x,vUv.y)).rgb:texture2D(map,vUv).rgb; vec3 n=back?-vN:vN; ${L} vec3 V=normalize(cameraPosition-vWP);
        float dif=.58+.5*max(dot(n,L),0.); float spec=pow(max(dot(reflect(-L,n),V),0.),24.)*.08;
        gl_FragColor=vec4(c*dif+spec,1.);
        #include <colorspace_fragment>
      }`,
  }));
  const pivot = new THREE.Group(); pivot.add(bill); scene.add(pivot);
  pivot.rotation.x = -Math.PI / 2; pivot.position.y = .02;
  if (BACK) bill.rotation.y = Math.PI;   // 跟 main.js 翻面一样：钞票绕自己的竖轴转半圈

  function placeCamera() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    renderer.setSize(w, h, false); camera.aspect = aspect;
    const dist = 2.75, needW = BILL.w * 1.18, hfov = 2 * Math.atan(needW / 2 / dist);
    camera.fov = Math.max(38, Math.min(2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI, 90));
    camera.position.set(0, dist * .82, dist * .57); camera.lookAt(LOOK); camera.updateProjectionMatrix();
  }
  addEventListener('resize', () => { placeCamera(); wake(); });
  placeCamera();

  let raf = 0, last = 0, ready = false, dragging = false, downAt = null;
  const S = { m: 0, mTo: 0, torch: 0, torchTo: 0, yaw: 0, pitch: 0 };
  const wake = () => { if (ready && !raf) raf = requestAnimationFrame(draw); };   // 模型装好之前别画
  const loadTex = url => new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
  const bar = $('#load-bar'); let got = 0; const step = () => { got++; bar.style.width = (got / 4 * 100) + '%'; };
  mark('bootStart');
  const [tf, ta, tb, bytes] = await Promise.all([loadTex('./assets/bill-front.webp').then(t => (step(), t)), loadTex('./assets/stage-atlas.webp').then(t => (step(), t)),
    loadTex('./assets/bill-back.webp'), loadStageBytes(EGGS ? './assets/eggs.glb' : undefined).then(b => (step(), b))]);
  billU.map.value = tf; billU.mapB.value = tb;
  const stage = EGGS ? await createEggs({ parent: bill, billTexture: tf, billBackTexture: tb, atlasTexture: ta, bytes, wake })
    : await createStage({ parent: bill, billTexture: tf, atlasTexture: ta, bytes, wake });
  await stage.compile(renderer, scene, camera);
  renderer.initTexture(tf); renderer.initTexture(ta); renderer.initTexture(tb);
  step(); mark('ready');
  stage.beforeRender(); renderer.render(scene, camera); mark('firstFrame'); perf.firstFrameMs = perf.marks.firstFrame;
  if (EGGS) $('#torch').style.display = 'none';   // 彩蛋测试时没有火炬键
  $('#loading').classList.add('gone');

  // 主线：0～.3 人影立起来（SilUp），.3～1 舞台一片片立起来（StagePop）；火炬单独一个键
  const MAIN_SEC = DUEL ? 6 : 2.6, TORCH_SEC = 2;   // 决斗十步走慢一点；火炬 + 拉法耶特一共 2 秒
  function applyMain() {
    if (EGGS) stage.set(BACK ? 'TreasuryPop' : 'DuelPaces', S.m);   // 彩蛋：滑块拨大楼 / 决斗
    else { stage.set('SilUp', S.m / .3); stage.set('StagePop', (S.m - .3) / .7); }
    $('#scrub').value = Math.round(S.m * 1000);
    $('#play').textContent = S.mTo > .5 ? '⏴' : '▶'; $('#play').setAttribute('aria-label', S.mTo > .5 ? '合上' : '立起来');
  }
  function draw() {
    const now = performance.now();
    if (last) { perf.frames.push(Math.round((now - last) * 10) / 10); if (perf.frames.length > 600) perf.frames.splice(0, 300); }
    const dt = last ? Math.min((now - last) / 1000, .06) : 0; last = now;
    let busy = false;
    if (S.m !== S.mTo) { S.m = S.mTo > S.m ? Math.min(S.mTo, S.m + dt / MAIN_SEC) : Math.max(S.mTo, S.m - dt / MAIN_SEC); applyMain(); busy = true; }
    if (S.torch !== S.torchTo) {
      S.torch = S.torchTo > S.torch ? Math.min(S.torchTo, S.torch + dt / TORCH_SEC) : Math.max(S.torchTo, S.torch - dt / TORCH_SEC);
      stage.set('TorchPop', S.torch); stage.set('YorktownPop', (S.torch - .45) / .55); if (stage.torchGlow) stage.torchGlow.value = Math.max(0, (S.torch - .6) / .4); busy = true;   // 火炬立好后拉法耶特站上转台
      $('#torch').setAttribute('aria-pressed', S.torchTo > .5);
    }
    if (!dragging && (Math.abs(S.yaw) > .001 || Math.abs(S.pitch) > .001)) { S.yaw *= .9; S.pitch *= .9; busy = true; }
    pivot.rotation.x = -Math.PI / 2 + S.pitch; pivot.rotation.y = S.yaw;
    stage.beforeRender();
    renderer.render(scene, camera);
    if (busy || dragging) raf = requestAnimationFrame(draw); else { raf = 0; last = 0; }
  }
  $('#play').addEventListener('click', () => { S.mTo = S.mTo > .5 ? 0 : 1; wake(); });
  $('#torch').addEventListener('click', () => { S.torchTo = S.torchTo > .5 ? 0 : 1; wake(); });
  $('#scrub').addEventListener('input', e => { S.m = S.mTo = e.target.value / 1000; applyMain(); wake(); });
  // 拖动倾斜（看模型跟着钞票走）
  canvas.addEventListener('pointerdown', e => { dragging = true; downAt = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch }; canvas.setPointerCapture(e.pointerId); wake(); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    S.yaw = THREE.MathUtils.clamp(downAt.yaw + (e.clientX - downAt.x) * .002, -.45, .45);
    S.pitch = THREE.MathUtils.clamp(downAt.pitch + (e.clientY - downAt.y) * .002, -.35, .35); wake();
  });
  canvas.addEventListener('pointerup', () => { dragging = false; wake(); });
  ready = true; applyMain(); wake();

  window.__stage = {
    stage, S, renderer, camera, scene, wake,
    setMain: m => { S.m = S.mTo = m; applyMain(); wake(); },
    play: () => { S.mTo = 1; wake(); }, close: () => { S.mTo = 0; wake(); },
    torch: v => { S.torchTo = v; wake(); }, setTorch: v => { S.torch = S.torchTo = v; stage.set('TorchPop', v); stage.set('YorktownPop', (v - .45) / .55); if (stage.torchGlow) stage.torchGlow.value = Math.max(0, (v - .6) / .4); wake(); },
    idle: () => !raf,
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs.length }),
    gpu: () => { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; },
  };
}
