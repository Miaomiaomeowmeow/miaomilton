import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 彩蛋③ We the People → Non-Stop：红色手写字一笔笔翘起来、卷成纸卷、在财政部印章上叠成一小摞（他不停地写）
// 模型和动画来自 blender/people/build_people.py（ham-star 对话），接口见 blender/people/接口.md；着色器照 people-test.js

// 红墨水按颜色认（和 find_letters.py 同一个判法；贴图解出来是线性色，先转回 sRGB 再比）；笔画编号图盖住 uIdRect = (u0, u1, v0, v1)
export const INK_GLSL = `
  uniform sampler2D mapIds,mapPFill; uniform vec4 uIdRect;
  float inkMask(vec3 lin){ vec3 c=pow(max(lin,vec3(0.)),vec3(1./2.2)); float r=c.r+.001;
    return (1.-smoothstep(.82,.90,c.g/r))*smoothstep(.40,.50,c.b/r)*smoothstep(.40,.55,c.r); }
  // 编号图三合一：R = 第几笔（碎片范围 = 墨水外放宽约 4 像素的毛边），G = 离碎片边多远（像素，里面为正）
  vec4 idTex(vec2 uv){ vec2 q=vec2((uv.x-uIdRect.x)/(uIdRect.y-uIdRect.x),(uIdRect.w-uv.y)/(uIdRect.w-uIdRect.z));
    if(q.x<0.||q.x>1.||q.y<0.||q.y>1.) return vec4(0.); return texture2D(mapIds,q); }
  float strokeId(vec2 uv){ return floor(idTex(uv).r*255./16.+.5)-1.; }
  float chipDist(vec2 uv){ return (idTex(uv).g*255.-128.)/24.; }
  float fibre(vec2 uv){ vec2 p=floor(uv*vec2(2048.,867.)*1.4); return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }   // 纸纤维的细碎
  const vec3 PAPER_BG=vec3(.75,.65,.37);   // 钞票空白处的纸色（线性色 ≈ sRGB .88 .82 .64）
  // 修补好的钞票底（people-fill.webp：字那一块的红字补掉、扭索纹细线接上，范围同 uIdRect，TextureLoader 默认 flipY 装）
  vec3 fillTex(vec2 uv){ return texture2D(mapPFill,vec2((uv.x-uIdRect.x)/(uIdRect.y-uIdRect.x),(uv.y-uIdRect.z)/(uIdRect.w-uIdRect.z))).rgb; }
  float eraseMask(vec3 lin){ vec3 c=pow(max(lin,vec3(0.)),vec3(1./2.2)); float r=c.r+.001;   // 褪字用的范围比 inkMask 宽一点，笔画边缘不留印子
    return (1.-smoothstep(.86,.93,c.g/r))*smoothstep(.36,.46,c.b/r)*smoothstep(.35,.50,c.r); }
  vec3 deInk(vec3 lin){   // 墨水褪掉以后露出的纸色：照钞票空白处的比例（sRGB 里 绿/红 0.93、蓝/红 0.70），红墨水比纸暗一点所以再提亮
    vec3 c=pow(max(lin,vec3(0.)),vec3(1./2.2)); float r=min(c.r*1.09,1.);
    return pow(vec3(r,r*.927,r*.70),vec3(2.2)); }
`;
// 钞票着色器里要加的那一步：被抠走的那块换成这张钞票原来的底（修补图）+ 一点纤维细碎和很淡的毛边（彩蛋没开时 uT = 0，什么都不变）
export const ERASE_GLSL = `
        vec4 T=idTex(uv); float id=floor(T.r*255./16.+.5)-1.;   // 编号图只读一次
        if(id>=0.){ float st=2.; for(int i=0;i<14;i++) if(float(i)==id) st=uStart[i];
          float k=smoothstep(st,st+.02,uT), sd=(T.g*255.-128.)/24., f=fibre(uv);
          // 被抠走的那一小块：表面那层连字一起揭走，露出浅一点、毛一点的纸；边上一圈很淡的毛边暗线（用户 10-24：细碎、不突兀）
          vec3 base=fillTex(uv);   // 钞票原来的底：米黄 + 扭索纹（用户 10-24：不能是白底）
          vec3 torn=base*(.985+.05*(f-.5));   // 表层连字揭走，露出的就是这张钞票的底，只多一点纤维细碎
          float inside=smoothstep(-.4,.9,sd);
          float rim=(1.-smoothstep(0.,2.2,abs(sd-.3)))*(.55+.45*f);   // 边上一圈很淡的毛边
          float fleck=step(.88,f)*(1.-smoothstep(0.,2.8,-sd))*step(sd,0.);   // 毛边外面零星几点碎屑
          c=mix(c,torn,max(inside,fleck*.7)*k);
          c*=1.-.06*rim*k; }
`;
export const peopleUniforms = () => ({ mapIds: { value: null }, mapPFill: { value: null }, uIdRect: { value: new THREE.Vector4(0, 1, 0, 1) }, uT: { value: 0 }, uStart: { value: new Array(14).fill(2) } });

function stripMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, transparent: true,
    vertexShader: `#include <common>
      #include <morphtarget_pars_vertex>
      attribute float _stroke; varying float vStroke; varying float vH;
      varying vec2 vUv; varying vec3 vWP;
      void main(){
        vUv=uv; vStroke=_stroke;
        #include <begin_vertex>
        #include <morphinstance_vertex>
        #include <morphtarget_vertex>
        vH=transformed.y;
        vec4 wp=modelMatrix*vec4(transformed,1.); vWP=wp.xyz;
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: `uniform sampler2D mapF; varying vec2 vUv; varying vec3 vWP; varying float vStroke; varying float vH;
    ${INK_GLSL}
    void main(){
      vec2 uv=vec2(vUv.x,1.-vUv.y);   // glb 的 v 从上往下数（glTF 规矩），翻回钞票的
      vec3 c=texture2D(mapF,uv).rgb;
      // 碎片 = 这一笔的红字连同外面一圈毛边纸（形状来自编号图），正面就是钞票本身，背面是钞票的纸色
      vec4 T=idTex(uv);   // 编号图只读一次
      float mine=abs(floor(T.r*255./16.+.5)-1.-vStroke)<.5?1.:0.;
      float sd=(T.g*255.-128.)/24., f=fibre(uv);
      float a=mine*smoothstep(-.6,.6,sd);
      if(a<.02) discard;
      float up=smoothstep(.0015,.006,vH);   // 离开纸面多少
      vec3 col;
      if(gl_FrontFacing) col=c*(1.-.12*up*(1.-smoothstep(0.,1.6,sd))*(.5+.5*f));   // 平着时就是钞票原样；翘起来后毛边稍微暗一点、看得出是撕下来的
      else col=fillTex(uv)*(.97+.06*f);   // 背面：这块钞票的底（米黄 + 扭索纹），不是白的
      vec3 n=normalize(cross(dFdx(vWP),dFdy(vWP)));
      vec3 L=normalize(vec3(-.3,1.,.45)); vec3 V=normalize(cameraPosition-vWP);
      float dif=.58+.5*max(dot(n,L),0.); float spec=pow(max(dot(reflect(-L,n),V),0.),24.)*.08;
      gl_FragColor=vec4(col*dif+spec,a);
      #include <colorspace_fragment>
      }`,
  });
}

/** parent：main.js 的钞票 mesh（XY 平面、+Z 朝上，翻面时纸条跟着翻）；uniforms：main.js 钞票的 uniforms（要带 mapF + peopleUniforms() 那几个） */
export async function createPeople({ parent, uniforms }) {
  const packed = 'DecompressionStream' in globalThis;   // 有 gz 就下 gz（82 KB），浏览器自己解
  const r = await fetch(packed ? './assets/people.glb.gz' : './assets/people.glb');
  const bytes = packed ? await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await r.arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, './assets/');
  const strips = gltf.scene.getObjectByName('PeopleStrips');
  const ids = strips.material.map;   // 笔画编号图：要原样的灰度
  ids.colorSpace = THREE.NoColorSpace; ids.magFilter = ids.minFilter = THREE.NearestFilter; ids.generateMipmaps = false; ids.needsUpdate = true;
  uniforms.mapIds.value = ids;
  const fill = await new THREE.TextureLoader().loadAsync('./assets/people-fill.webp'); fill.colorSpace = THREE.SRGBColorSpace;   // 字那一块修补好的钞票底（blender/people/make_fill.py），抠走处和碎片背面用
  uniforms.mapPFill.value = fill;
  const rect = JSON.parse(strips.userData.idRegion); uniforms.uIdRect.value.set(rect[0], rect[1], rect[2], rect[3]);
  uniforms.uStart.value = JSON.parse(strips.userData.strokeStart);
  strips.material = stripMaterial(uniforms); strips.frustumCulled = false;   // 纸条会飞出原来的包围盒
  const holder = new THREE.Group(); holder.rotation.x = Math.PI / 2;   // glb 是 Y 朝上，钞票 mesh 里是 Z 朝上
  holder.add(gltf.scene); parent.add(holder); holder.visible = false;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const curl = mixer.clipAction(gltf.animations.find(a => a.name === 'PeopleCurl'));
  curl.setLoop(THREE.LoopOnce, 1); curl.clampWhenFinished = true; curl.play(); curl.paused = true;
  const people = {
    ms: curl.getClip().duration * 1000, p: 0,
    set(p) { people.p = p; curl.time = p * curl.getClip().duration; mixer.update(0); uniforms.uT.value = p; holder.visible = p > 0; },
    async compile(renderer, scene, camera) {   // 预热：编着色器，把 p = .5、1 的样子各真画一遍再回到 0，第一次点就不顿
      await renderer.compileAsync(scene, camera);
      for (const p of [.5, 1, 0]) { people.set(p); renderer.render(scene, camera); }
    },
  };
  people.set(0);
  return people;
}
