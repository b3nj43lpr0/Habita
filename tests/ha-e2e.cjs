// Prueba de punta a punta: la app real (desktop/main.cjs) contra el laboratorio de Home Assistant
// (tools/lab/fake-home-assistant.cjs) en 127.0.0.1. Ejecutar con: npm run test:e2e
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
// Si otra ventana tapa la de la prueba, Windows deja de dibujarla y capturePage falla
// (UnknownVizError). La prueba debe pasar aunque el equipo se esté usando.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

const profile = path.join(__dirname, '..', '.research', 'ha-e2e-profile');
fs.rmSync(profile, { recursive: true, force: true });
app.setPath('userData', profile);
const { startFakeHomeAssistant } = require('../tools/lab/fake-home-assistant.cjs');
const entity = 'light.living_pie';

const fail = error => { console.error(error); app.exit(1); };
setTimeout(() => fail(new Error('La prueba no terminó en 60 segundos.')), 60000);

startFakeHomeAssistant({ port: 0 }).then(lab => {
  const { url, token, calls } = lab;
  const main = require('../desktop/main.cjs');
  app.whenReady().then(async () => {
    const win = BrowserWindow.getAllWindows()[0];
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    // Los errores de la página vuelven como texto: los objetos Error no siempre cruzan executeJavaScript.
    const run = async code => {
      const result = await win.webContents.executeJavaScript(`(async()=>{const $=s=>document.querySelector(s),check=(v,m)=>{if(!v)throw Error(m);},wait=(ms=300)=>new Promise(r=>setTimeout(r,ms));try{return {value:await (async()=>{${code}})()};}catch(e){return {error:String(e&&e.message||e)};}})()`).catch(error => { throw new Error(`${error.message} en: ${code.trim().slice(0, 80)}`); });
      if (result.error) throw new Error(`${result.error} en: ${code.trim().slice(0, 90)}`);
      return result.value;
    };
    await run(`localStorage.clear();`);
    win.webContents.reload();
    await new Promise(resolve => win.webContents.once('did-finish-load', resolve));

    const bad = await run(`try{await window.habita.homeAssistant.configure(${JSON.stringify(url)},'token-incorrecto-0123456789');return 'aceptado';}catch(e){return e.message;}`);
    if (!/rechazó el token/.test(bad)) throw Error(`Token incorrecto: ${bad}`);
    const secrets = await run(`return JSON.stringify(await window.habita.homeAssistant.status())+JSON.stringify(localStorage);`);
    if (secrets.includes(token)) throw Error('El token llegó al renderer');

    const linked = await run(`
      $('#home-assistant').click();await wait(100);
      $('#ha-url').value=${JSON.stringify(url)};$('#ha-token').value=${JSON.stringify(token)};
      $('#ha-form').requestSubmit();await wait(800);
      check($('#ha-feedback').dataset.status==='connected',$('#ha-feedback').textContent);
      check($('#device-status').dataset.status==='connected','Indicador de estado');
      $('#dialog').close();
      const lampId=JSON.parse(localStorage.getItem('habita-project')||'null')?.items.find(i=>i.asset==='floor-lamp')?.id
        ||[...document.querySelectorAll('[data-select-device]')][0].dataset.selectDevice;
      document.querySelector('[data-select-device="'+lampId+'"]').click();await wait();
      const select=$('[data-device]');check(select,'Selector de luz real');
      select.value=${JSON.stringify(entity)};select.dispatchEvent(new Event('change'));await wait();
      check(Number($('[data-light="brightness"]').value)===100,'La maqueta toma el brillo real');
      check($('.device-state.online')?.textContent.includes('lámpara de pie'),'Estado del dispositivo visible');
      const range=$('[data-light="brightness"]');range.value='40';range.dispatchEvent(new Event('input'));range.dispatchEvent(new Event('change'));await wait(600);
      return lampId;`);
    const call = calls.at(-1);
    if (call?.service !== 'turn_on' || call.service_data.brightness_pct !== 40 || call.target.entity_id !== entity) throw Error(`Servicio enviado: ${JSON.stringify(calls)}`);

    lab.external(entity, e => { e.state = 'off'; e.attributes.brightness = null; });
    const live = await run(`
      await wait(500);
      const item=JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.id===${JSON.stringify(linked)});
      check(item.light.on===false,'El apagado real se refleja en la maqueta');
      check($('.light-power').getAttribute('aria-pressed')==='false','El control muestra la luz apagada');
      check(!$('#undo').disabled,'Historial previo intacto');
      return item.light;`);

    // Aire acondicionado: vincular, cambiar el modo desde la maqueta y reflejar un cambio externo.
    const climate = await run(`
      $('[data-asset="ac"]').click();await wait();
      const select=$('.climate-controls [data-device]');check(select,'Selector de equipo real del aire');
      check([...select.options].every(o=>!o.value||o.value.startsWith('climate.')),'Solo se ofrecen aires');
      select.value='climate.living';select.dispatchEvent(new Event('change'));await wait();
      check($('.climate-controls .light-power').getAttribute('aria-pressed')==='true','El aire toma el estado real');
      check($('.climate-current')?.textContent.includes('25,5'),'Temperatura actual de la habitación');
      $('.climate-controls [data-mode="heat"]').click();await wait(600);
      return JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.asset==='ac').id;`);
    if (lab.entities.get('climate.living').state !== 'heat') throw Error('El modo calor no llegó al aire');
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'ha-climate.png'), (await win.webContents.capturePage()).toPNG());
    lab.external('climate.living', e => { e.attributes.temperature = 19; });
    await run(`await wait(500);const ac=JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.id===${JSON.stringify(climate)});check(ac.climate.target===19,'Temperatura cambiada desde fuera');`);

    // Enchufe: una lámpara de mesa vinculada a un switch solo enciende y apaga.
    await run(`
      $('[data-asset="lamp"]').click();await wait();
      const select=$('.lamp-controls [data-device]');
      check([...select.options].some(o=>o.value==='switch.lampara_enchufe'),'Los enchufes se ofrecen para lámparas');
      select.value='switch.lampara_enchufe';select.dispatchEvent(new Event('change'));await wait();
      check($('.device-link')?.textContent.includes('solo enciende y apaga'),'Aviso de equipo sin brillo');
      $('.light-power').click();await wait(600);`);
    if (lab.entities.get('switch.lampara_enchufe').state !== 'on') throw Error('El enchufe no se encendió');

    // Televisor: vincular el media_player, encender, volumen en vivo, entrada y un cambio externo.
    const tvBefore = calls.length;
    const tvId = await run(`
      $('[data-action="close"]')?.click();await wait();
      const id=JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.asset==='tv').id;
      document.querySelector('[data-select-device="'+id+'"]').click();await wait();
      const select=$('.tv-controls [data-device]');check(select,'Selector de televisor real');
      check([...select.options].every(o=>!o.value||o.value.startsWith('media_player.')),'Solo se ofrecen televisores');
      select.value='media_player.living_tv';select.dispatchEvent(new Event('change'));await wait();
      check($('.tv-controls .light-power').getAttribute('aria-pressed')==='false','El televisor toma el estado real');
      check(Number($('[data-tv="volume"]').value)===20,'El volumen real se refleja');
      $('.tv-controls .light-power').click();await wait(600);
      const range=$('[data-tv="volume"]');
      for(let v=22;v<=50;v+=2){range.value=String(v);range.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,8));}
      await wait(400);range.dispatchEvent(new Event('change'));await wait(600);
      const source=$('[data-tv="source"]');check(source,'Lista de entradas');
      source.value='Netflix';source.dispatchEvent(new Event('change'));await wait(600);
      return id;`);
    const tvReal = lab.entities.get('media_player.living_tv');
    const volumeCalls = calls.slice(tvBefore).filter(c => c.service === 'volume_set').length;
    if (tvReal.state !== 'on' || tvReal.attributes.volume_level !== .5 || tvReal.attributes.source !== 'Netflix') throw Error(`Televisor real: ${JSON.stringify(tvReal)}`);
    if (volumeCalls < 2 || volumeCalls > 12) throw Error(`El volumen envió ${volumeCalls} órdenes`);
    lab.external('media_player.living_tv', e => { e.attributes.is_volume_muted = true; });
    await run(`await wait(500);const tv=JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.id===${JSON.stringify(tvId)});
      check(tv.tv.muted===true&&tv.tv.on===true,'El silencio externo se refleja');
      check($('[data-mute="true"]').getAttribute('aria-pressed')==='true','El control muestra el silencio');`);
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'ha-tv.png'), (await win.webContents.capturePage()).toPNG());

    // Sensores de la habitación: temperatura y humedad en el panel y en el selector de espacios.
    await run(`
      $('[data-action="close"]')?.click();await wait();
      $('#room-chips [data-room="living"]').click();await wait();
      const t=$('[data-room-sensor="temperature"]'),h=$('[data-room-sensor="humidity"]');check(t&&h,'Selectores de sensores');
      check([...t.options].every(o=>!o.value||o.value.startsWith('sensor.temperatura')),'Solo sensores de temperatura');
      t.value='sensor.temperatura_living';t.dispatchEvent(new Event('change'));await wait();
      h.value='sensor.humedad_living';h.dispatchEvent(new Event('change'));await wait();
      check($('#room-chips [data-room="living"] .room-sensor')?.textContent==='25,5 °C · 58 %',$('#room-chips [data-room="living"]').textContent);`);
    lab.external('sensor.humedad_living', e => { e.state = '61'; });
    await run(`await wait(500);check($('#room-chips [data-room="living"] .room-sensor').textContent==='25,5 °C · 61 %','La humedad se actualiza en vivo');`);

    // Consumo: sensores de potencia en el living (W) y la cocina (kW), total y mapa de calor.
    const energy = await run(`
      const p=$('[data-room-sensor="power"]');check(p,'Selector de consumo');
      p.value='sensor.consumo_living';p.dispatchEvent(new Event('change'));await wait();
      $('#room-chips [data-room="kitchen"]').click();await wait();
      const k=$('[data-room-sensor="power"]');k.value='sensor.consumo_cocina';k.dispatchEvent(new Event('change'));await wait();
      check($('#room-chips [data-room="kitchen"] .room-sensor')?.textContent==='1.250 W','Los kW se muestran en W');
      $('#energy').click();await wait(300);
      check($('#energy').getAttribute('aria-pressed')==='true','Mapa de consumo activo');
      return $('#energy-total').textContent.trim();`);
    if (energy !== '1.590 W en la casa') throw Error(`Consumo total: ${energy}`);
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'energy-e2e.png'), (await win.webContents.capturePage()).toPNG());
    await run(`$('#energy').click();await wait();$('#room-chips [data-room="living"]').click();await wait();`);

    // Sensor de apertura: la ventana del living se vincula desde el panel de la habitación.
    await run(`
      const id=JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.asset==='window'&&i.z===4).id;
      document.querySelector('[data-select-device="'+id+'"]').click();await wait();
      const select=$('.contact-controls [data-device]');check(select,'Selector de sensor de apertura');
      check([...select.options].every(o=>!o.value||o.value.startsWith('binary_sensor.')),'Solo sensores de apertura');
      select.value='binary_sensor.ventana_living';select.dispatchEvent(new Event('change'));await wait();
      check($('.contact-controls .device-state.online')?.textContent.includes('cerrada'),'Ventana cerrada');`);
    lab.external('binary_sensor.ventana_living', e => { e.state = 'on'; });
    await run(`await wait(500);check($('.contact-controls .device-state.online')?.textContent.includes('abierta'),'La ventana se informa abierta');`);
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'sensors-e2e.png'), (await win.webContents.capturePage()).toPNG());
    // Cortina: se agrega al living, se vincula, se cierra y luego se deja al 40 %.
    const curtain = await run(`
      $('#room-chips [data-room="living"]').click();await wait();
      $('[data-tab="objects"]').click();await wait();
      $('[data-asset="curtain"]').click();await wait();
      const select=$('.cover-controls [data-device]');check(select,'Selector de cortina real');
      check([...select.options].every(o=>!o.value||o.value.startsWith('cover.')),'Solo se ofrecen cortinas');
      select.value='cover.living_cortina';select.dispatchEvent(new Event('change'));await wait();
      $('.cover-controls [data-position="0"]').click();await wait(600);
      const range=$('[data-cover="position"]');range.value='40';range.dispatchEvent(new Event('input'));range.dispatchEvent(new Event('change'));await wait(600);
      return JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.asset==='curtain').id;`);
    const coverCalls = calls.filter(c => c.domain === 'cover').map(c => c.service_data.position);
    if (lab.entities.get('cover.living_cortina').attributes.current_position !== 40 || coverCalls.join() !== '0,40') throw Error(`Cortina real: ${coverCalls}`);
    lab.external('cover.living_cortina', e => { e.attributes.current_position = 75; });
    await run(`await wait(500);check(JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.id===${JSON.stringify(curtain)}).cover.position===75,'La cortina refleja el cambio externo');`);
    // Escena real: se guarda con todo encendido, se apaga desde fuera y la escena lo restaura.
    const scene = await run(`
      $('[data-action="close"]').click();await wait();
      $('#save-scene').click();await wait(100);$('#scene-name').value='Película';$('#scene-form').requestSubmit();await wait();
      check($('[data-scene]')?.textContent.includes('Película'),'Escena guardada');
      return JSON.parse(localStorage.getItem('habita-project')).scenes.length;`);
    lab.external('climate.living', e => { e.state = 'off'; });
    lab.external('switch.lampara_enchufe', e => { e.state = 'off'; });
    lab.external('media_player.living_tv', e => { e.state = 'off'; });
    await run(`await wait(500);$('[data-scene]').click();await wait(800);`);
    if (lab.entities.get('climate.living').state !== 'heat' || lab.entities.get('switch.lampara_enchufe').state !== 'on') throw Error('La escena no movió los equipos reales');
    if (lab.entities.get('media_player.living_tv').state !== 'on') throw Error('La escena no encendió el televisor real');

    // Automatización: al abrirse la ventana del living se activa «Película».
    await run(`
      $('[data-action="close"]')?.click();await wait();
      $('#new-automation').click();await wait(100);
      $('#automation-name').value='Ventilar';$('#automation-type').value='contact';$('#automation-type').dispatchEvent(new Event('change'));
      check(!$('#automation-contact').hidden&&$('#automation-item').options.length===1,'Solo puertas y ventanas con sensor');
      $('#automation-form').requestSubmit();await wait();
      check($('.automation-row')?.textContent.includes('Al abrir Ventana'),$('.automation-list')?.textContent);`);
    lab.external('binary_sensor.ventana_living', e => { e.state = 'off'; });
    lab.external('climate.living', e => { e.state = 'off'; });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (lab.entities.get('climate.living').state !== 'off') throw Error('Cerrar la ventana no debía activar la escena');
    lab.external('binary_sensor.ventana_living', e => { e.state = 'on'; });
    await new Promise(resolve => setTimeout(resolve, 900));
    if (lab.entities.get('climate.living').state !== 'heat') throw Error('La automatización no activó la escena al abrir la ventana');

    // Arrastre en vivo: la luz real sigue el slider con pocas órdenes y sin saltos por los ecos.
    const before = calls.length;
    const drag = await run(`
      document.querySelector('[data-select-device="'+${JSON.stringify(linked)}+'"]').click();await wait();
      if($('.light-power').getAttribute('aria-pressed')==='false'){$('.light-power').click();await wait(600);}
      const range=$('[data-light="brightness"]');
      for(let v=10;v<=60;v+=2){range.value=String(v);range.dispatchEvent(new Event('input'));await new Promise(r=>setTimeout(r,8));}
      await wait(500);
      const during=Number(range.value);
      range.dispatchEvent(new Event('change'));await wait(600);
      const item=JSON.parse(localStorage.getItem('habita-project')).items.find(i=>i.id===${JSON.stringify(linked)});
      const log=await window.habita.homeAssistant.log();
      return {during,saved:item.light.brightness,log};`);
    const dragCalls = calls.slice(before).filter(c => c.target.entity_id === entity && c.service === 'turn_on');
    const real = Math.round(lab.entities.get(entity).attributes.brightness / 2.55);
    if (drag.during !== 60 || drag.saved !== 60 || real !== 60) throw Error(`Arrastre en vivo: ${JSON.stringify({ during: drag.during, saved: drag.saved, real })}`);
    if (dragCalls.length < 2 || dragCalls.length > 18) throw Error(`El arrastre envió ${dragCalls.length} órdenes: ${dragCalls.map(c => c.service_data.brightness_pct).join(',')}`);
    if (!drag.log.some(line => line.includes(entity) && line.includes('light.turn_on')) || drag.log.join('\n').includes(token)) throw Error('Registro de eventos');

    lab.dropClients();
    const reconnect = await run(`await wait(2500);return $('#device-status').dataset.status;`);
    if (reconnect !== 'connected') throw Error(`Reconexión: ${reconnect}`);

    // Asistente de IA por MCP: el servidor real, lanzado con Node como lo haría Claude Desktop.
    await main.setAiAccess(true);
    const { spawn } = require('node:child_process');
    const mcp = spawn('node', [main.mcpServerPath()], { env: { ...process.env, HABITA_ACCESS_FILE: main.aiAccessPath() }, stdio: ['pipe', 'pipe', 'inherit'] });
    const replies = new Map();
    let nextId = 1;
    require('node:readline').createInterface({ input: mcp.stdout }).on('line', line => { const m = JSON.parse(line); replies.get(m.id)?.(m); });
    const ask = (method, params) => new Promise(resolve => { const id = nextId++; replies.set(id, resolve); mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    const tool = async (name, args = {}) => { const m = await ask('tools/call', { name, arguments: args }); if (m.result.isError) throw Error(`${name}: ${m.result.content[0].text}`); return m.result.structuredContent; };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
    const homeView = await tool('get_home');
    if (JSON.stringify(homeView).includes(entity) || !homeView.lights.some(l => l.id === linked && l.device.linked)) throw Error(`get_home: ${JSON.stringify(homeView.lights)}`);
    await tool('set_lights', { ids: [linked], brightness: 25 });
    await pause(600);
    const aiBrightness = Math.round(lab.entities.get(entity).attributes.brightness / 2.55);
    if (aiBrightness !== 25) throw Error(`La IA no movió la luz real: ${aiBrightness}`);
    await tool('set_air_conditioners', { ids: [climate], mode: 'cool', target: 22 });
    await pause(600);
    const acReal = lab.entities.get('climate.living');
    if (acReal.state !== 'cool' || acReal.attributes.temperature !== 22) throw Error(`La IA no movió el aire: ${acReal.state} ${acReal.attributes.temperature}`);
    if (!homeView.tvs.some(t => t.id === tvId && t.device.linked)) throw Error('get_home sin televisores');
    await tool('set_tvs', { ids: [tvId], volume: 15, muted: false });
    await pause(600);
    const aiTv = lab.entities.get('media_player.living_tv').attributes;
    if (aiTv.volume_level !== .15 || aiTv.is_volume_muted) throw Error(`La IA no movió el televisor: ${JSON.stringify(aiTv)}`);
    await tool('activate_scene', { scene: 'pelicula' });
    await pause(800);
    if (lab.entities.get('climate.living').state !== 'heat') throw Error('La IA no activó la escena');
    const aiSaved = await run(`await wait(300);const p=JSON.parse(localStorage.getItem('habita-project'));const log=await window.habita.homeAssistant.log();
      return {lamp:p.items.find(i=>i.id===${JSON.stringify(linked)}).light.brightness,ac:p.items.find(i=>i.asset==='ac').climate.mode,log:log.filter(l=>l.split('\t')[1]==='IA').length,undo:!$('#undo').disabled};`);
    if (aiSaved.ac !== 'heat' || !aiSaved.undo || aiSaved.log < 4) throw Error(`Cambios de la IA en la maqueta: ${JSON.stringify(aiSaved)}`);
    mcp.kill();
    await main.setAiAccess(false);
    if (fs.existsSync(main.aiAccessPath())) throw Error('El token de IA sigue en disco al desactivar');

    // Modo control: sin editor, con el panel de equipos al estilo house-control.
    await run(`
      $('[data-action="close"]')?.click();await wait();
      $('#control-mode').click();await wait(400);
      check(document.body.classList.contains('control-mode')&&getComputedStyle($('.library')).display==='none','Editor oculto');
      check($('.cp-card .cp-power')&&$('.cp-scenes')&&document.querySelectorAll('.cp-tile').length,'Cabecera, escenas y tarjetas de equipos');
      $('.cp-room[data-room="living"]').click();await wait();
      check($('.cp-room.active').textContent.includes('Living')&&$('.cp-list-head b').textContent==='Living y comedor','Equipos del living');
      const lamp=$('.cp-tile.dimmable');const before=lamp.classList.contains('on');lamp.click();await wait(300);
      check($('.cp-tile.dimmable').classList.contains('on')!==before,'Tocar la tarjeta enciende o apaga la lámpara');
      $('.cp-tile.dimmable .cp-more').click();await wait();
      check($('.cp-sheet .cp-big')&&$('.cp-sheet input[type="range"]'),'Hoja de la lámpara con brillo');
      check($('.selection-actions').hidden,'Sin barra flotante en modo control');
      $('[data-back]').click();await wait();
      check(getComputedStyle($('[data-action="rotate"]')).display==='none','Sin acciones de edición');`);
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'control-e2e.png'), (await win.webContents.capturePage()).toPNG());
    await run(`$('#control-mode').click();await wait(400);check(!document.body.classList.contains('control-mode'),'Vuelve al editor');`);

    // Pisos: agregar un segundo piso (copia el contorno), poner un objeto arriba y volver.
    const floors = await run(`
      $('[data-action="close"]')?.click();await wait();
      $('#room-chips [data-add-level]').click();await wait(400);
      let p=JSON.parse(localStorage.getItem('habita-project'));
      check(p.levels?.length===2,'Segundo piso creado');
      const up=p.levels[1].id;
      check(p.rooms.filter(r=>r.level===up).length===5,'Contorno copiado');
      check($('#room-chips .level-chip.active')?.textContent.includes('Piso 2'),'Piso activo en la barra');
      check(document.querySelectorAll('#room-chips [data-room]').length===6,'Solo las habitaciones del piso activo');
      $('[data-tab="objects"]').click();await wait();
      $('[data-asset="bed"]').click();await wait();
      p=JSON.parse(localStorage.getItem('habita-project'));
      check(p.items.at(-1).level===up,'El objeto nuevo queda en el segundo piso');
      $('#room-chips [data-level="base"]').click();await wait();
      check(document.querySelectorAll('#room-chips [data-room]').length===6&&$('#room-chips [data-room="living"]'),'Vuelve al primer piso');
      $('[data-view="3d"]').click();await wait(400);
      $('#room-chips [data-level="'+up+'"]').click();await wait(400);
      return {levels:p.levels.length,up};`);
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'floors-e2e.png'), (await win.webContents.capturePage()).toPNG());
    await run(`$('#room-chips [data-level="base"]').click();await wait();`);

    // Plano de referencia: abrir un .habita con imagen, ver sus controles y calibrar con dos clics.
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const plan = await run(`
      const p=JSON.parse(localStorage.getItem('habita-project'));
      p.plan={image:${JSON.stringify(png)},x:0,z:0,w:10,d:8,opacity:.5,locked:true};
      const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(p)],'plano.habita'));
      const input=$('#file-input');input.files=dt.files;input.dispatchEvent(new Event('change'));await wait(600);
      $('[data-tab="rooms"]').click();await wait();
      check($('#plan-opacity')&&$('#plan-lock').checked,'Controles del plano');
      $('#plan-calibrate').click();await wait(500);
      check($('[data-view="2d"]').classList.contains('active')&&!$('#drawing-hint').hidden,'Calibración en el plano 2D');
      const canvas=$('#scene canvas'),r=canvas.getBoundingClientRect();
      const tap=(x,y)=>{for(const type of ['pointerdown','pointerup'])canvas.dispatchEvent(new PointerEvent(type,{clientX:r.left+x,clientY:r.top+y,button:0,pointerId:1,bubbles:true}));};
      tap(r.width/2-120,r.height/2);await wait(100);tap(r.width/2+120,r.height/2);await wait(300);
      const measured=Number($('#plan-distance').value);check(measured>0,'Distancia medida');
      $('#plan-distance').value='5';$('#plan-form').requestSubmit();await wait(600);
      check($('[data-view="2d"]').classList.contains('active'),'Sigue en el plano 2D: '+document.querySelector('[data-view].active')?.dataset.view);
      return {measured,w:JSON.parse(localStorage.getItem('habita-project')).plan.w};`);
    if (Math.abs(plan.w - 10 * 5 / plan.measured) > .1) throw Error(`Calibración del plano: ${JSON.stringify(plan)}`);
    fs.writeFileSync(path.join(__dirname, '..', '.research', 'plan-e2e.png'), (await win.webContents.capturePage()).toPNG());

    // Con la casa conectada, cerrar la ventana la deja en la bandeja en vez de salir.
    win.close();
    await new Promise(resolve => setTimeout(resolve, 300));
    if (win.isDestroyed() || win.isVisible()) throw Error('Cerrar no dejó Habita en la bandeja');
    win.show();

    fs.writeFileSync(path.join(__dirname, '..', '.research', 'ha-e2e.png'), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({ status: "passed", badToken: bad, serviceCall: call.service_data, live, climate: lab.entities.get("climate.living").state, scene, tv: { volumeCalls, source: tvReal.attributes.source }, cover: coverCalls, energy, floors, plan, dragCalls: dragCalls.length, logLines: drag.log.length, reconnect, ai: { brightness: aiBrightness, saved: aiSaved } }));
    app.exit(0);
  }).catch(fail);
});
