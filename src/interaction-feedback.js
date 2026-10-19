// Sonidos propios sintetizados localmente, siempre a petición del usuario.
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
      const t=context.currentTime,osc=context.createOscillator(),gain=context.createGain();
      const frequency=kind==='place'?660:kind==='undo'?330:480;
      osc.type='sine';osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*.7,t+.07);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.035,t+.004);gain.gain.exponentialRampToValueAtTime(.0001,t+.09);
      osc.connect(gain);gain.connect(context.destination);osc.start(t);osc.stop(t+.1);
    } catch {} // El editor continúa funcionando si no hay salida de audio.
  }
  button.onclick=()=>{enabled=!enabled;try{localStorage.setItem('habita-sound',String(enabled));}catch{}paint();play('place');};
  paint();
  return {play};
}
