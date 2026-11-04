import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 主线三幕舞台上的黑纸剪影（ham-star 对话做的 acts.glb，接口见 blender/acts/接口.md；写法照 acts-test.js）
// 第一幕：两层甲板上 6 个人一个个立起；第二幕：转台上酒馆桌 + 三人，点杯子举杯；第三幕：安吉莉卡祝酒，拖转台倒带后她到正中

export const ACT_SEC = { Act1Rise: 2.4, Act2Table: 1.6, Act2Cheers: .8, Act3Toast: 1.6, Act3Rewind: 1 };

export async function createActs({ stage }) {
  const packed = 'DecompressionStream' in globalThis;   // 有 gz 就下 gz（46 KB）
  const r = await fetch(packed ? './assets/acts.glb.gz' : './assets/acts.glb');
  const bytes = packed ? await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await r.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, './assets/');
  const silMat = new THREE.ShaderMaterial({   // 和舞台上汉密尔顿同一个黑、同一盏光
    side: THREE.DoubleSide,
    vertexShader: `varying vec3 vWP; void main(){ vec4 wp=modelMatrix*vec4(position,1.); vWP=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `varying vec3 vWP;
      void main(){ vec3 n=normalize(cross(dFdx(vWP),dFdy(vWP))); vec3 L=normalize(vec3(-.3,1.,.45));
        vec3 c=vec3(.035,.027,.022)*(.58+.5*max(dot(n,L),0.));
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
  const root = gltf.scene;
  root.traverse(o => { if (o.isMesh) { o.material = silMat; o.frustumCulled = false; } });
  stage.holder.add(root);   // 和 stage.glb 同一套坐标
  const mixer = new THREE.AnimationMixer(stage.holder);   // 根要用 stage.holder：第二、三幕以后会挪到转台下面
  const A = {}, prog = {};
  for (const c of gltf.animations) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; A[c.name] = a; prog[c.name] = 0; }
  const table = root.getObjectByName('Act2Table');
  let attached = false;
  const acts = {
    root, table, prog,
    attach() {   // 舞台立好（StagePop = 1）时把第二、三幕挪到转台下面，倒带时跟着转；只做一次
      if (attached) return; attached = true;
      root.updateMatrixWorld(true);
      for (const n of ['Act2', 'Act3']) stage.turntable.attach(root.getObjectByName(n));
    },
    set(name, p) {
      const a = A[name]; if (!a) return;
      prog[name] = Math.min(Math.max(p, 0), 1);
      const d = a.getClip().duration; a.time = prog[name] >= 1 ? d : prog[name] * d * .99999;
      mixer.update(0);
      stage.sil.visible = stage.get('SilUp') > 0 && !(prog.Act3Toast > 0);   // 第三幕自己带一个汉密尔顿（倒带时要退到后面），舞台上那个先藏起来
    },
    get: name => prog[name] || 0,
    async compile(renderer, scene, camera) { await renderer.compileAsync(scene, camera); },
  };
  return acts;
}
