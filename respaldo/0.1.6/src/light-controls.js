import { lightFor } from './lighting.js';

export function mountLightControls(host,item,{preview,commit}){
  let state=lightFor(item);
  host.innerHTML=`<div class="light-heading"><span>Luz de la maqueta</span><button class="light-power" aria-label="Encender lámpara" aria-pressed="true"></button></div><label class="lamp-range"><span>Intensidad <output></output></span><input data-light="brightness" type="range" min="0" max="100" step="1" aria-label="Intensidad de la lámpara"></label><div class="light-modes"><button data-mode="temperature">Blanco</button><button data-mode="color">Color</button></div><label class="lamp-range lamp-warmth"><span>Calidez <output></output></span><input data-light="warmth" type="range" min="0" max="100" step="1" aria-label="Calidez de la lámpara"></label><div class="lamp-colors"><label><input type="color" data-light="color" aria-label="Color de la luz"><span>Color de la luz</span></label>${['#ffb36b','#ff786b','#d99bff','#88baff','#90dfc4'].map(color=>`<button data-light-color="${color}" style="--swatch:${color}" aria-label="Luz ${color}"></button>`).join('')}</div>`;
  function paint(){
    const power=host.querySelector('.light-power');power.textContent=state.on?'Encendida':'Apagada';power.setAttribute('aria-pressed',String(state.on));power.setAttribute('aria-label',state.on?'Apagar lámpara':'Encender lámpara');
    for(const key of ['brightness','warmth']){const input=host.querySelector(`[data-light="${key}"]`);input.value=state[key];input.previousElementSibling.querySelector('output').textContent=`${state[key]}%`;input.style.setProperty('--fill',`${state[key]}%`);}
    host.querySelector('[data-light="color"]').value=state.color;
    host.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    host.querySelector('.lamp-warmth').hidden=state.mode!=='temperature';host.querySelector('.lamp-colors').hidden=state.mode!=='color';
  }
  const save=()=>commit({...state});
  host.querySelector('.light-power').onclick=()=>{state.on=!state.on;save();};
  host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;save();});
  host.querySelectorAll('[data-light-color]').forEach(b=>b.onclick=()=>{state.color=b.dataset.lightColor;save();});
  host.querySelectorAll('[data-light]').forEach(input=>{
    input.oninput=()=>{state[input.dataset.light]=input.type==='color'?input.value:Number(input.value);paint();preview({...state});};
    input.onchange=save;
    const cancel=()=>{state=lightFor(item);preview(state);paint();};
    input.onpointercancel=cancel;
    input.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}};
  });
  paint();
}
