import { inRoom } from './levels.js';
export const isLamp=item=>['floor-lamp','lamp'].includes(item?.asset);
export const defaultLight=Object.freeze({on:true,brightness:100,warmth:72,mode:'temperature',color:'#ffb36b'});
export const lightFor=item=>({...defaultLight,...item.light});
export function lightColor(state){
  if(state.mode==='color')return state.color;
  const cool=[183,215,255],warm=[255,191,120];
  return '#'+cool.map((value,i)=>Math.round(value+(warm[i]-value)*state.warmth/100).toString(16).padStart(2,'0')).join('');
}
export function lampsInRoom(project,room){
  return project.items.filter(item=>isLamp(item)&&inRoom(item,room));
}
export function validLight(state){
  return state&&typeof state==='object'&&typeof state.on==='boolean'&&
    [state.brightness,state.warmth].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100)&&
    ['temperature','color'].includes(state.mode)&&typeof state.color==='string'&&/^#[\da-f]{6}$/i.test(state.color);
}
