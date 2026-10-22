import * as THREE from 'three';

const cache=new Map();
// Texturas pequeñas, locales y deterministas; se comparten entre los modelos.
export function surfaceTexture(kind){
  if(cache.has(kind))return cache.get(kind);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#eeeae2';ctx.fillRect(0,0,128,128);
  if(kind==='wood'){
    for(let i=0;i<76;i++){
      ctx.strokeStyle=`rgba(98,72,45,${.025+(i%5)*.007})`;ctx.lineWidth=.5+(i%3)*.4;
      ctx.beginPath();for(let x=0;x<=128;x+=4){const y=i*1.8+Math.sin(x*.045+i)*1.6;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    }
  }else{
    for(let y=0;y<128;y+=2)for(let x=0;x<128;x+=2){const t=(Math.sin(x*12.98+y*78.23)*43758.54)%1;ctx.fillStyle=t>.2?'#ffffff20':'#534f4610';ctx.fillRect(x,y,1,1);}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(kind==='wood'?2:4,kind==='wood'?2:4);texture.anisotropy=4;cache.set(kind,texture);return texture;
}

let glow;
export function glowTexture(){
  if(glow)return glow;
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,238,192,.8)');g.addColorStop(.14,'rgba(255,212,148,.38)');g.addColorStop(.45,'rgba(255,188,112,.1)');g.addColorStop(1,'rgba(255,180,100,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  glow=new THREE.CanvasTexture(c);glow.colorSpace=THREE.SRGBColorSpace;return glow;
}
