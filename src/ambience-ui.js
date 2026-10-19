const presets=[{id:'day',name:'Día',icon:'sun',brightness:78,warmth:48},{id:'cozy',name:'Acogedor',icon:'sofa',brightness:67,warmth:88},{id:'cinema',name:'Cine',icon:'image',brightness:52,warmth:38},{id:'night',name:'Noche',icon:'moon',brightness:44,warmth:72}];
export function createAmbienceUI(scene,icon){
  let state={preset:'cozy',brightness:67,warmth:88};
  try{const saved=JSON.parse(localStorage.getItem('habita-ambience'));if(saved&&presets.some(p=>p.id===saved.preset)&&[saved.brightness,saved.warmth].every(n=>typeof n==='number'&&n>=0&&n<=100))state=saved;}catch{}
  const dock=document.querySelector('#ambience-dock');
  dock.innerHTML=`<div class="ambience-heading"><div><span class="ambience-symbol">${icon('sun',17)}</span><span>Ambiente<small>Elige cómo se siente tu casa</small></span></div><button id="toggle-ambience" aria-label="Ocultar controles de ambiente" aria-expanded="true">${icon('chevron',15)}</button></div><div class="ambience-content"><div class="mood-presets">${presets.map(p=>`<button class="mood-card mood-${p.id}" data-mood="${p.id}" aria-pressed="${p.id===state.preset}"><span>${icon(p.icon,21)}</span><strong>${p.name}</strong><i></i></button>`).join('')}</div><div class="ambience-sliders"><label class="ambience-control"><span>${icon('sun',14)} Luz ambiente <output id="brightness-value"></output></span><input id="brightness" type="range" min="0" max="100" step="1" aria-label="Luz ambiente" value="${state.brightness}"></label><label class="ambience-control warmth-control"><span>${icon('sun',14)} Calidez <output id="warmth-value"></output></span><input id="warmth" type="range" min="0" max="100" step="1" aria-label="Calidez" value="${state.warmth}"></label></div></div>`;
  const identity=document.querySelector('#home-status');
  identity.innerHTML=`<span class="home-status-icon">${icon('home',19)}</span><div><strong></strong><small></small></div><span class="home-status-dot"></span>`;
  function paint(){
    document.body.dataset.ambience=state.preset;
    dock.querySelectorAll('[data-mood]').forEach(b=>{b.classList.toggle('active',b.dataset.mood===state.preset);b.setAttribute('aria-pressed',String(b.dataset.mood===state.preset));});
    for(const key of ['brightness','warmth']){const range=document.querySelector(`#${key}`);range.value=state[key];range.style.setProperty('--fill',`${state[key]}%`);document.querySelector(`#${key}-value`).textContent=`${state[key]}%`;}
    const p=presets.find(p=>p.id===state.preset);document.querySelector('#light').innerHTML=`${icon(p.icon,17)}<span>${p.name}</span>`;
    try{localStorage.setItem('habita-ambience',JSON.stringify(state));}catch{}
  }
  function apply(){scene.ambience(state.preset);scene.visualTuning(state.brightness,state.warmth);paint();}
  dock.querySelectorAll('[data-mood]').forEach(b=>b.onclick=()=>{const p=presets.find(p=>p.id===b.dataset.mood);state={preset:p.id,brightness:p.brightness,warmth:p.warmth};apply();});
  for(const key of ['brightness','warmth'])document.querySelector(`#${key}`).oninput=event=>{state[key]=Number(event.target.value);scene.visualTuning(state.brightness,state.warmth);paint();};
  document.querySelector('#light').onclick=()=>{const p=presets[(presets.findIndex(p=>p.id===state.preset)+1)%presets.length];state={preset:p.id,brightness:p.brightness,warmth:p.warmth};apply();};
  document.querySelector('#toggle-ambience').onclick=event=>{const collapsed=dock.classList.toggle('collapsed'),button=event.currentTarget;button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Mostrar controles de ambiente':'Ocultar controles de ambiente');};
  apply();
  return {
    refresh(project){identity.querySelector('strong').textContent=project.name;const area=project.rooms.reduce((n,r)=>n+r.w*r.d,0);identity.querySelector('small').textContent=`${project.rooms.length} espacios · ${area.toLocaleString('es-CL',{maximumFractionDigits:1})} m²`;} ,
    setView(view){dock.hidden=view!=='3d';identity.hidden=view!=='3d';}
  };
}
