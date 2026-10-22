import * as THREE from 'three';
const cache=new Map();
export function viewBackground(preset='cozy'){
  if(cache.has(preset))return cache.get(preset);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d');
  const palettes={day:['#516b9b','#29344e','#131827'],cozy:['#55516f','#30334a','#101423'],cinema:['#373f7a','#24233f','#0c1021'],night:['#303e65','#1b263f','#0b1020']};
  const colors=palettes[preset]||palettes.cozy,g=ctx.createLinearGradient(0,0,0,512);
  colors.forEach((color,i)=>g.addColorStop(i/2,color));ctx.fillStyle=g;ctx.fillRect(0,0,512,512);
  const halo=(x,y,r,color)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'#00000000');ctx.fillStyle=g;ctx.fillRect(0,0,512,512);};
  halo(440,50,390,preset==='cozy'?'#e4b78170':'#9badef36');halo(5,160,310,'#4879e843');
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;cache.set(preset,texture);return texture;
}
