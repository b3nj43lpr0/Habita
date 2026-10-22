// Sonidos propios sintetizados localmente, siempre a petición del usuario. Además del toque, hay
// notas para encender (sube), apagar (baja) y activar una escena (tres notas), como la respuesta
// sonora de la oficina 3D de referencia; no se usa audio de terceros.
export function createFeedback(button) {
  let enabled=false,context,last=0;
  try { enabled=localStorage.getItem('habita-sound')==='true'; } catch {}
  function paint(){button.setAttribute('aria-pressed',String(enabled));button.textContent=enabled?'Sonido activado':'Sonido desactivado';}
  function play(kind='tap') {
    if(!enabled||document.hidden)return;
    const now=performance.now();if(now-last<65)return;last=now;
    try {
      context??=new AudioContext();
      if(context.state==='suspended'){context.resume().catch(()=>{});return;}
      const t=context.currentTime;
      const note=(frequency,start,length=.09,bend=.7,level=.035)=>{
        const osc=context.createOscillator(),gain=context.createGain();
        osc.type='sine';osc.frequency.setValueAtTime(frequency,t+start);osc.frequency.exponentialRampToValueAtTime(frequency*bend,t+start+length*.8);
        gain.gain.setValueAtTime(0,t+start);gain.gain.linearRampToValueAtTime(level,t+start+.004);gain.gain.exponentialRampToValueAtTime(.0001,t+start+length);
        osc.connect(gain);gain.connect(context.destination);osc.start(t+start);osc.stop(t+start+length+.01);
      };
      if(kind==='on'){note(523,0,.08,1);note(784,.06,.14,1);}
      else if(kind==='off'){note(659,0,.08,1);note(440,.06,.14,1,.028);}
      else if(kind==='scene'){note(523,0,.1,1,.03);note(659,.07,.1,1,.03);note(784,.14,.2,1,.03);}
      else note(kind==='place'?660:kind==='undo'?330:480,0);
    } catch {} // El editor continúa funcionando si no hay salida de audio.
  }
  button.onclick=()=>{enabled=!enabled;try{localStorage.setItem('habita-sound',String(enabled));}catch{}paint();play('place');};
  paint();
  return {play};
}
