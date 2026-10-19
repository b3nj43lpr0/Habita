const {app,BrowserWindow}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const output=path.join(__dirname,'../.research');
app.setPath('userData',path.join(output,'slider-profile'));
const timer=setTimeout(()=>{console.error('La revisión de sliders excedió 60 segundos');app.exit(1);},60000);
app.whenReady().then(async()=>{
  const errors=[];
  const win=new BrowserWindow({show:false,width:1500,height:960,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  try{
    await win.loadFile(path.join(__dirname,'../dist/index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const $=s=>document.querySelector(s),assert=(v,m)=>{if(!v)throw Error(m);};
      const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      $('[data-select-lamp]').click();await frame();
      const sliders=[...document.querySelectorAll('input[type="range"]')];
      assert(sliders.length>=8,'Se revisan propiedades, ambiente y lámparas');
      for(const input of sliders){const style=getComputedStyle(input);assert(style.height==='34px'&&style.padding==='0px','Altura y padding uniformes');}
      let slider=$('[data-linked="w"]'),number=$('[data-field="w"]'),original=number.value,fill=slider.style.getPropertyValue('--fill');
      slider.focus();slider.value=slider.min;slider.dispatchEvent(new Event('input'));await frame();
      assert(Number(number.value)===Number(slider.min),'Valor mínimo sincronizado');assert(slider.style.getPropertyValue('--fill')==='0%','Relleno en mínimo');
      slider.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await frame();
      assert(number.value===original&&slider.style.getPropertyValue('--fill')===fill,'Escape restaura medida y relleno');
      slider.value=String(Number(original)+.1);slider.dispatchEvent(new Event('input'));slider.dispatchEvent(new Event('change'));await frame();
      slider=$('[data-linked="w"]');assert(document.activeElement===slider,'El teclado conserva el foco después de confirmar');
      $('#undo').click();await frame();$('[data-select-lamp]').click();await frame();
      for(const input of document.querySelectorAll('.property-range')){const r=input.getBoundingClientRect(),field=input.closest('.field').getBoundingClientRect();assert(r.width>100&&r.left>=field.left&&r.right<=field.right+1,'Slider contenido en su fila');}
      await document.fonts.ready;await frame();
      return {uniformSliders:sliders.length,minimum:true,cancelFill:true,keyboardFocus:true,bounds:true};
    })()`);
    fs.writeFileSync(path.join(output,'sliders-preview.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(1100,800);
    await win.webContents.executeJavaScript('new Promise(resolve=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),400))');
    const compact=await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=document.querySelector('.property-range').getBoundingClientRect(),p=document.querySelector('.inspector').getBoundingClientRect();resolve(r.width>100&&r.left>=p.left&&r.right<=p.right);})))`);
    if(!compact||errors.length)throw Error(JSON.stringify({compact,errors}));
    fs.writeFileSync(path.join(output,'sliders-compact.png'),(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({status:'passed',...result,compact,errors}));clearTimeout(timer);app.exit(0);
  }catch(error){console.error(error);clearTimeout(timer);app.exit(1);}
});
