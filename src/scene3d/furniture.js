import * as THREE from 'three';
import { byId } from '../model/catalog.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { surfaceTexture } from './surfaces.js';

export function furniture(item, preview=false) {
  const a=byId(item.asset), g=new THREE.Group();
  const soft=['sofa','bed','chair','rug','pouf','curtain'].includes(a.kind);
  const timber=['table','round','cabinet','wardrobe','shelf','kitchen','door','tv','console','bench','crib','planter','stairs'].includes(a.kind);
  const colored=new THREE.MeshPhysicalMaterial({color:item.color,roughness:soft?.96:.65,sheen:soft?.55:0,sheenRoughness:.8,sheenColor:'#fff3dd',map:soft?surfaceTexture('fabric'):timber?surfaceTexture('wood'):null});
  const wood=new THREE.MeshStandardMaterial({color:'#bd9b76',roughness:.65,map:surfaceTexture('wood')});
  const dark=new THREE.MeshStandardMaterial({color:'#343e48',roughness:.6});
  const white=new THREE.MeshStandardMaterial({color:'#eeebe2',roughness:.78});
  const metal=new THREE.MeshStandardMaterial({color:'#a2a9a7',metalness:.6,roughness:.3});
  const mesh=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!mat.transparent;m.receiveShadow=true;g.add(m);return m;};
  const box=(w,h,d,x=0,y=h/2,z=0,mat=colored)=>mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(w,h,d)*(soft?.3:.14)),mat,x,y,z);
  const cylinder=(r1,r2,h,x=0,y=h/2,z=0,mat=colored)=>mesh(new THREE.CylinderGeometry(r1,r2,h,32),mat,x,y,z);
  const legs=(height=.7,x=.4,z=.35)=>{for(const xx of [-x,x]) for(const zz of [-z,z])box(.055,height,.055,xx,height/2,zz,wood);};
  switch(a.kind) {
    case 'sofa': {
      box(.96,.16,.92,0,.2,0,wood);box(1,.48,.17,0,.63,-.4);
      box(.13,.47,.91,-.44,.5);box(.13,.47,.91,.44,.5);
      for(let i=0;i<(item.w>1.4?3:1);i++) {const n=item.w>1.4?3:1;box(.74/n-.015,.18,.7,-.37+(.74/n)*(i+.5),.4,.025);box(.74/n-.02,.26,.12,-.37+(.74/n)*(i+.5),.65,-.27);}
      legs(.15,.35,.32);break;
    }
    case 'bed':
      box(.97,.16,.97,0,.21,0,wood);box(1,.8,.065,0,.48,-.47);box(.94,.2,.9,0,.4,.01,white);
      box(.95,.05,.58,0,.525,.16);box(.39,.1,.21,-.24,.55,-.28,white);box(.39,.1,.21,.24,.55,-.28,white);legs(.15,.4,.38);break;
    case 'table':
      box(1,.07,1,0,.94);legs(.9,.43,.4);break;
    case 'round':
      cylinder(.5,.5,.08,0,.94);cylinder(.07,.18,.9,0,.45,0,wood);break;
    case 'chair':
      box(.94,.1,.9,0,.51);box(.95,.43,.12,0,.79,-.4);legs(.47,.37,.32);break;
    case 'stool': cylinder(.47,.47,.1,0,.95);legs(.9,.3,.3);break;
    case 'cabinet':
    case 'wardrobe': {
      box(1,.94,1,0,.5);box(1,.04,1,0,.99,0,wood);
      const n=a.kind==='wardrobe'?3:2;
      for(let i=0;i<n;i++){box(.95/n-.015,.83,.018,-.475+(.95/n)*(i+.5),.5,.51);box(.018,.12,.025,-.475+(.95/n)*(i+.5),.58,.53,metal);}break;
    }
    case 'tv':
      box(1,.28,1,0,.17,0,wood);box(.78,.58,.035,0,.7,.03,dark);box(.72,.5,.015,0,.7,.055,new THREE.MeshStandardMaterial({color:'#253940',emissive:'#8fc3ff',emissiveIntensity:0,roughness:.28})).userData.tvScreen=true;box(.13,.12,.2,0,.38,0,dark);break;
    case 'shelf':
      box(.045,1,.96,-.477,.5,0,wood);box(.045,1,.96,.477,.5,0,wood);
      for(let i=0;i<5;i++){box(1,.025,1,0,i/4,0,wood);if(i<4)for(let j=0;j<4;j++)box(.07,.14,.5,-.35+j*.11,i/4+.09,.1,j%2?colored:white);}break;
    case 'rug':box(1,1,1);break;
    case 'kitchen':
    case 'sink':
    case 'stove': {
      box(.98,.9,.97,0,.45);box(1,.07,1,0,.95,0,white);
      box(.018,.76,.02,0,.48,.5,wood);box(.2,.018,.04,.2,.75,.52,metal);
      if(a.kind==='sink') {box(.6,.02,.58,0,.99,0,metal);box(.49,.025,.46,0,1.005,0,dark);cylinder(.015,.015,.18,0,1.08,-.3,metal);box(.2,.02,.025,.08,1.17,-.3,metal);}
      if(a.kind==='stove'){for(const x of [-.25,.25])for(const z of [-.25,.25])cylinder(.15,.15,.015,x,.995,z,dark);box(.75,.46,.018,0,.46,.51,dark);box(.7,.03,.04,0,.76,.53,metal);}break;
    }
    case 'fridge':box(1,1,1);box(.96,.005,.015,0,.7,.51,dark);box(.04,.25,.04,.35,.49,.54,metal);box(.04,.16,.04,.35,.84,.54,metal);break;
    case 'toilet':
      cylinder(.32,.26,.45,0,.26,.15,white);mesh(new THREE.SphereGeometry(.48,24,16),white,0,.49,.15).scale.set(.9,.24,.63);box(.85,.7,.28,0,.64,-.33,white);break;
    case 'shower': {
      box(1,.04,1,0,.02,0,white);
      const glass=new THREE.MeshStandardMaterial({color:item.color,transparent:true,opacity:.24,roughness:.15,depthWrite:false,side:THREE.DoubleSide});
      box(1,.96,.018,0,.5,-.49,glass);box(.018,.96,1,-.49,.5,0,glass);box(.025,1,.025,-.49,.5,-.49,metal);cylinder(.012,.012,.7,.2,.6,-.46,metal);box(.3,.015,.15,.2,.96,-.35,metal);break;
    }
    case 'bath':box(1,.85,1,0,.44,0,white);box(.8,.03,.8,0,.88,0,new THREE.MeshStandardMaterial({color:'#a9c4c2',roughness:.2}));break;
    case 'plant': {
      cylinder(.25,.18,.33,0,.17,0,new THREE.MeshStandardMaterial({color:'#bfa88a'}));cylinder(.025,.04,.7,0,.6,0,wood);
      for(let i=0;i<9;i++){const angle=i*2.4, y=.46+i*.052;const leaf=mesh(new THREE.SphereGeometry(1,12,8),colored,Math.cos(angle)*.18,y,Math.sin(angle)*.18);leaf.scale.set(.17,.17,.26);leaf.rotation.set(.4,angle,.5);}break;
    }
    case 'lamp':
      cylinder(.3,.36,.04,0,.02,0,dark);cylinder(.018,.018,.73,0,.4,0,metal);
      cylinder(.26,.45,.27,0,.84,0,new THREE.MeshStandardMaterial({color:item.color,emissive:'#ffd49a',emissiveIntensity:1.15,roughness:.85})).userData.lampShade=true;break;
    case 'ac': {
      // Equipo split de muro: la cara frontal mira hacia +z, como el resto del catálogo.
      box(1,.8,.9,0,.5,0);box(.98,.08,.86,0,.12,.05,white);box(.9,.05,.08,0,.18,.45,dark);
      // Aleta bajo la salida de aire: gira sobre su borde trasero; el flujo la abre y la hace oscilar.
      {const flap=box(.92,.025,.16,0,.075,.3,white);flap.geometry.translate(0,0,.08);flap.userData.acFlap=true;}
      box(.07,.06,.02,.38,.68,.46,new THREE.MeshStandardMaterial({color:'#1d242c',emissive:'#5db2ff',emissiveIntensity:0,roughness:.4})).userData.acDisplay=true;break;
    }
    case 'door':
      box(.9,.98,.15,0,.49,0);box(.035,.06,.1,.32,.48,.13,metal);box(.04,1.02,1,-.48,.51,0,wood);box(.04,1.02,1,.48,.51,0,wood);box(1,.025,1,0,1.01,0,wood);break;
    case 'screen':
      box(1,1,.6,0,.5,0,dark);box(.96,.92,.1,0,.5,.32,new THREE.MeshStandardMaterial({color:'#1f2a31',emissive:'#8fc3ff',emissiveIntensity:0,roughness:.25})).userData.tvScreen=true;break;
    case 'console':
      box(1,.7,1,0,.5);box(1,.04,1,0,.87,0,wood);for(const x of [-.33,0,.33])box(.3,.5,.02,x,.5,.51,dark);legs(.15,.45,.42);break;
    case 'soundbar':box(1,1,1,0,.5,0);box(.96,.6,.02,0,.5,.51,dark);break;
    // Aspiradora robot: disco con tapa, parachoques al frente y un piloto que indica su estado.
    case 'vacuum':cylinder(.5,.5,.8,0,.4,0);cylinder(.4,.4,.12,0,.86,0,dark);box(.62,.5,.1,0,.32,.45,dark);
      Object.assign(cylinder(.07,.07,.08,0,.94,.22,new THREE.MeshStandardMaterial({color:'#2a3238',emissive:'#5be38c',emissiveIntensity:0,roughness:.3})).userData,{vacuumLed:true});break;
    case 'speaker':box(1,1,1,0,.5);box(.82,.38,.02,0,.7,.51,dark);box(.82,.26,.02,0,.3,.51,dark);break;
    case 'pouf':cylinder(.5,.5,1,0,.5);break;
    case 'bench':box(1,.12,1,0,.9);legs(.84,.44,.4);break;
    case 'appliance':box(1,1,1);box(.96,.12,.02,0,.9,.51,dark);box(.6,.03,.04,0,.78,.53,metal);break;
    case 'hood':box(1,.16,1,0,.08,0,metal);box(.36,.84,.36,0,.58,-.3,metal);box(.8,.01,.8,0,0,0,dark);break;
    case 'microwave':box(1,1,1);box(.6,.7,.02,-.14,.5,.51,new THREE.MeshStandardMaterial({color:'#11161b',roughness:.15}));box(.2,.7,.02,.36,.5,.51,metal);break;
    case 'mirror':box(1,1,1,0,.5,0);box(.9,.9,.3,0,.5,.4,new THREE.MeshStandardMaterial({color:'#dfe9ee',metalness:1,roughness:.04}));break;
    case 'washer':{
      box(1,1,1,0,.5,0);box(.96,.13,.02,0,.9,.51,metal);
      mesh(new THREE.CylinderGeometry(.32,.32,.04,32),metal,0,.44,.51).rotation.x=Math.PI/2;
      mesh(new THREE.CylinderGeometry(.25,.25,.05,32),new THREE.MeshStandardMaterial({color:'#2b3640',roughness:.15}),0,.44,.52).rotation.x=Math.PI/2;break;
    }
    case 'towel':
      for(const x of [-.47,.47])box(.06,1,1,x,.5,0,metal);for(const y of [.15,.5,.85])box(1,.05,.3,0,y,0,metal);box(.7,.62,.12,0,.55,.2);break;
    case 'crib':
      box(1,.08,1,0,.36,0,white);box(.94,.1,.94,0,.45,0);
      for(const x of [-.475,.475])for(const z of [-.475,.475])box(.05,1,.05,x,.5,z,wood);
      for(const z of [-.475,.475]){box(1,.04,.05,0,.98,z,wood);for(let i=1;i<8;i++)box(.025,.45,.025,-.475+i*.119,.73,z,wood);}
      for(const x of [-.475,.475]){box(.05,.04,1,x,.98,0,wood);for(let i=1;i<10;i++)box(.025,.45,.025,x,.73,-.475+i*.095,wood);}break;
    case 'monitor':
      box(.35,.04,.6,0,.02,0,dark);box(.08,.36,.08,0,.2,-.1,dark);box(1,.62,.15,0,.67,0,dark);
      box(.95,.56,.02,0,.67,.08,new THREE.MeshStandardMaterial({color:'#1f2a31',emissive:'#8fc3ff',emissiveIntensity:.25,roughness:.25}));break;
    case 'drawers':
      box(1,1,1,0,.5);for(const y of [.18,.5,.82]){box(.92,.28,.02,0,y,.51,white);box(.3,.03,.04,0,y+.08,.53,metal);}break;
    case 'lounger':
      box(1,.16,.68,0,.32,.16,wood);box(1,.08,.66,0,.43,.16);box(1,.08,.42,0,.62,-.33).rotation.x=-.85;legs(.26,.42,.45);break;
    case 'bbq':
      box(.62,.36,1,0,.72,0);box(.62,.2,.92,0,.98,-.03,dark);box(.18,.04,.9,.42,.82,0,wood);box(.18,.04,.9,-.42,.82,0,wood);
      for(const x of [-.27,.27])for(const z of [-.42,.42])box(.04,.56,.04,x,.28,z,metal);break;
    case 'planter':{
      box(1,.85,1,0,.43);box(.94,.04,.9,0,.86,0,new THREE.MeshStandardMaterial({color:'#4b3a2a',roughness:1}));
      const leaves=new THREE.MeshStandardMaterial({color:'#6b8b5f',roughness:.8});
      for(const x of [-.32,-.1,.12,.34]){const bush=mesh(new THREE.SphereGeometry(1,12,8),leaves,x,.98,0);bush.scale.set(.15,.14,.36);}break;
    }
    case 'parasol':
      cylinder(.12,.15,.05,0,.025,0,dark);cylinder(.012,.012,.95,0,.5,0,metal);mesh(new THREE.ConeGeometry(.5,.18,8),colored,0,.9,0);break;
    // La tela se recoge hacia la izquierda (cortina) o hacia arriba (persiana) según su apertura.
    case 'curtain':box(1,.03,.3,0,.985,0,metal);Object.assign(box(1,.95,.7,0,.475,0).userData,{coverFabric:true,coverAxis:'x'});break;
    case 'blind':box(1,.06,1,0,.97,0,white);Object.assign(box(.98,.92,.5,0,.46,0).userData,{coverFabric:true,coverAxis:'y'});break;
    case 'stairs':
      // Sube hacia el fondo (-z local): el frente es el primer peldaño.
      for(let i=0;i<12;i++)box(1,(i+1)/12,1/12,0,(i+1)/24,.5-(i+.5)/12,i%2?colored:wood);break;
    case 'window': {
      const glass=new THREE.MeshStandardMaterial({color:item.color,transparent:true,opacity:.35,roughness:.2,metalness:.15});
      box(.97,.97,.08,0,.5,0,glass);for(const x of [-.48,0,.48])box(.035,1,1,x,.5,0,white);box(1,.035,1,0,.02,0,white);box(1,.035,1,0,.98,0,white);break;
    }
  }
  // Normalizar las piezas para que el conjunto mida exactamente lo indicado.
  const bounds=new THREE.Box3().setFromObject(g), size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
  for(const child of g.children) child.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
  g.scale.set(item.w/size.x,item.h/size.y,item.d/size.z);
  g.position.set(preview?0:item.x,preview?0:(item.elevation||0)+(a.kind==='window'?(item.sill||0):0),preview?0:item.z);
  g.rotation.y=(preview?0:item.rotation)*Math.PI/180;
  g.userData.itemId=item.id;
  g.traverse(o=>{if(o.isMesh)o.userData.itemId=item.id;});
  return g;
}

export function disposeTree(root) {
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

let thumbRenderer,thumbScene,thumbCamera;
const thumbs=new Map();
export function thumbnail(asset) {
  if(thumbs.has(asset.id))return thumbs.get(asset.id);
  if(!thumbRenderer) {
    thumbRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true});thumbRenderer.setSize(220,150);thumbRenderer.setPixelRatio(1);
    thumbRenderer.outputColorSpace=THREE.SRGBColorSpace;thumbRenderer.toneMapping=THREE.ACESFilmicToneMapping;
    thumbScene=new THREE.Scene();thumbScene.add(new THREE.HemisphereLight('#fff0d9','#657286',3));
    const pmrem=new THREE.PMREMGenerator(thumbRenderer),environment=new RoomEnvironment();thumbScene.environment=pmrem.fromScene(environment,.06).texture;thumbScene.environmentIntensity=.35;environment.dispose();pmrem.dispose();
    const light=new THREE.DirectionalLight('#fff4df',3);light.position.set(3,5,4);thumbScene.add(light);
    thumbCamera=new THREE.PerspectiveCamera(33,220/150,.01,100);
  }
  const item={...asset,asset:asset.id,id:asset.id,rotation:0,x:0,z:0};
  const group=furniture(item,true), size=Math.max(asset.w,asset.d,asset.h);
  thumbScene.add(group);thumbCamera.position.set(size*1.9,size*1.4,size*1.9);thumbCamera.lookAt(0,asset.h*.45,0);
  thumbRenderer.render(thumbScene,thumbCamera);const url=thumbRenderer.domElement.toDataURL();
  thumbScene.remove(group);disposeTree(group);thumbs.set(asset.id,url);return url;
}
