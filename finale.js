import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 结尾：钞票折成星（FoldStar）再往上飞（RiseStar）。模型和动画来自 blender/star/build_star.py（ham-star 对话），接口见 blender/star/接口.md
// 材质照 star-test.js：贴图用 main.js 已经装好的两张钞票图，光照和 main.js 一字不差，所以第 0 帧和摊平的钞票一样

function paperMaterial(mapF, mapB) {
  return new THREE.ShaderMaterial({
    uniforms: { mapF: { value: mapF }, mapB: { value: mapB }, uPoster: { value: 0 }, uBlack: { value: 0 }, uCrease: { value: new THREE.Vector2(0, 0) }, uInk: { value: new THREE.Vector3(INK.r, INK.g, INK.b) } }, side: THREE.DoubleSide,
    vertexShader: `#include <common>
      #include <morphtarget_pars_vertex>
      attribute vec3 _poster; uniform float uPoster;
      varying vec2 vUv; varying vec3 vWP;
      void main(){
        vUv=uv;
        #include <begin_vertex>
        #include <morphinstance_vertex>
        #include <morphtarget_vertex>
        transformed=mix(transformed,_poster,uPoster);   // 飞上天以后压平成海报上那颗标准五角星（形状存在 glb 的 _POSTER 里）
        vec4 wp=modelMatrix*vec4(transformed,1.); vWP=wp.xyz;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: `uniform sampler2D mapF,mapB; uniform float uBlack; uniform vec2 uCrease; uniform vec3 uInk; varying vec2 vUv; varying vec3 vWP;
      void main(){
        bool back=!gl_FrontFacing;
        vec2 uv0=vec2(vUv.x,1.-vUv.y);   // glb 的 v 从上往下数，main.js 的贴图是 flipY 装的
        vec2 uv=back?vec2(1.-uv0.x,uv0.y):uv0;
        vec3 c=back?texture2D(mapB,uv).rgb:texture2D(mapF,uv).rgb;
        if(!back){   // 右下角 10 的铜色（main.js 不倾斜时就是这个颜色）
          float m=1.-length((uv-vec2(.89,.255))/vec2(.045,.065)); m=smoothstep(0.,.25,m);
          float ink=1.-smoothstep(.25,.75,dot(c,vec3(.33)));
          c=mix(c,c*vec3(1.35,1.0,.62),m*ink);
        }
        // 折过的地方留一道压痕：中间一条细暗线、两边一点点亮。x = 竖中线，y = 横中线（比竖的宽一点、深一点，打开后一眼看得出），折线微歪、不笔直（v6，照 star-test.js）
        vec2 pb=(uv0-.5)*vec2(2.36,1.);
        vec2 HN=vec2(.99996,-.00873);
        float sx=dot(pb,HN)+.0025*sin(pb.y*9.+1.)+.0012*sin(pb.y*23.);
        vec2 pf=sx>0.?pb-2.*dot(pb,HN)*HN+HN*.02199:pb;
        float sy=dot(pf,vec2(.01396,.9999))+.002*sin(pf.x*7.+.4)+.001*sin(pf.x*19.);
        vec2 dc=vec2(abs(sx),abs(sy));
        vec2 lw=vec2(.0035,.006);
        vec2 ln=1.-smoothstep(vec2(0.),lw,dc), hl=(1.-smoothstep(lw,lw*3.,dc))-ln;
        c*=1.-dot(ln*vec2(.22,.32),uCrease); c+=c*dot(hl*vec2(.06,.09),uCrease);
        vec3 n=normalize(cross(dFdx(vWP),dFdy(vWP)));
        vec3 L=normalize(vec3(-.3,1.,.45));
        vec3 V=normalize(cameraPosition-vWP);
        float dif=.58+.5*max(dot(n,L),0.);
        float spec=pow(max(dot(reflect(-L,n),V),0.),24.)*.08;
        gl_FragColor=vec4(mix(c*dif+spec,uInk,uBlack),1.);   // 钞票花纹褪成海报那颗星的黑
        #include <colorspace_fragment>
      }`,
  });
}
const INK = new THREE.Color('#0a0605');
function dequantizeStar(mesh) {   // 照 blender/star/接口.md「10-24 v5b」：纸带着缩放 + 平移来还原位置，海报星形状 _poster 没压，两者要对上
  if (!mesh || (mesh.scale.x === 1 && mesh.position.lengthSq() === 0)) return;
  const s = mesh.scale.x, t = mesh.position.clone(), g = mesh.geometry;
  const fix = (a, off) => {
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i) * s + (off ? t.x : 0); out[i * 3 + 1] = a.getY(i) * s + (off ? t.y : 0); out[i * 3 + 2] = a.getZ(i) * s + (off ? t.z : 0);
    }
    return new THREE.BufferAttribute(out, 3);
  };
  g.setAttribute('position', fix(g.attributes.position, true));
  if (g.morphAttributes.position) g.morphAttributes.position = g.morphAttributes.position.map(a => fix(a, false));
  mesh.position.set(0, 0, 0); mesh.scale.set(1, 1, 1); mesh.updateMatrix();
  g.computeBoundingBox(); g.computeBoundingSphere();
}

export async function createStar({ scene, mapF, mapB }) {
  const packed = 'DecompressionStream' in globalThis;   // 有 gz 就下 gz（v6 2.0 MB → 800 KB），浏览器自己解
  const r = await fetch(packed ? './assets/star.glb.gz' : './assets/star.glb');
  const bytes = packed ? await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await r.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, './assets/');
  const root = gltf.scene;
  const paperMat = paperMaterial(mapF, mapB);
  const silMat = new THREE.MeshBasicMaterial({ color: '#0a0605', side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });   // 折的时候没有人，飞上天以后才慢慢出现（用户 10-23/24）
  dequantizeStar(root.getObjectByName('PaperStar'));   // v5b 起模型压成 16 位整数，先还原（不然和海报星形状对不上）
  root.traverse(o => { if (o.isMesh) { const sil = o.name === 'StarSil' || (o.parent && o.parent.name === 'StarSil'); o.material = sil ? silMat : paperMat; o.frustumCulled = false; } });
  // 星背后一圈暖光：黑剪影要有亮底才看得出（照效果图）
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uA; varying vec2 vUv;
      void main(){ float d=length(vUv-.5)*2.; float a=pow(max(1.-d,0.),2.2); gl_FragColor=vec4(vec3(.95,.68,.28)*a*uA,1.); }`,
  });
  const body = root.getObjectByName('StarBody');
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), glowMat);
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, -.06, -.22);   // StarBody 里：星面是 XZ，正面 +Y，上尖朝 -Z
  glow.renderOrder = -1; glow.frustumCulled = false; body.add(glow);
  root.visible = false; scene.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const act = n => { const a = mixer.clipAction(gltf.animations.find(c => c.name === n)); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; return a; };
  const fold = act('FoldStar'), rise = act('RiseStar');
  const smooth = (a, b, t) => { t = Math.min(Math.max((t - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const p = { fold: 0, rise: 0 };
  const star = {
    root, body, p,
    foldMs: fold.getClip().duration * 1000, riseMs: rise.getClip().duration * 1000,
    set(foldP, riseP) {   // 都是 0～1
      p.fold = foldP; p.rise = riseP;
      fold.time = foldP * fold.getClip().duration;
      rise.time = riseP * rise.getClip().duration;
      mixer.update(0);
      const t = foldP * fold.getClip().duration;   // 竖、横两道折痕在折过以后留下（时间点照接口.md）
      paperMat.uniforms.uCrease.value.set(smooth(.6, 1.3, t), smooth(2.5, 3.35, t));   // v6：竖折痕、横折痕（打开后留下）
      paperMat.uniforms.uBlack.value = smooth(.25, .6, riseP);   // 飞上天以后：钞票渐渐变成官方海报那颗星（黑色五角星、顶尖切平、人影站在横线上、金色光底）
      paperMat.uniforms.uPoster.value = smooth(.3, .7, riseP);
      silMat.opacity = smooth(.45, .8, riseP);
      glowMat.uniforms.uA.value = .85 * smooth(.2, .75, riseP);
    },
    async compile(renderer, camera) {   // 预热：编着色器，把折好、飞起的样子各真画一遍再藏起来，第一次折的时候就不顿
      root.visible = true;
      await renderer.compileAsync(scene, camera);
      for (const [a, b] of [[.8, 0], [1, .6], [0, 0]]) { star.set(a, b); renderer.render(scene, camera); }
      root.visible = false;
    },
  };
  star.set(0, 0);
  return star;
}
