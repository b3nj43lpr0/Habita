import { $, esc, modal, toast } from './dom.js';
import { icon } from './icons.js';

// «Control desde el celular»: activar el servidor de la red de la casa y mostrar el QR que vincula
// el teléfono. La clave va en el QR; renovarla desvincula los celulares anteriores.
export function createPhone() {
  const phone = window.habita?.desktop?.phone;

  async function open() {
    if (!phone) return;
    let status = await phone.status().catch(() => ({ running: false }));
    const paint = () => modal(`
     <span class="dialog-emblem">${icon('tablet', 32)}</span>
     <h2>Control desde el celular</h2>
     <p>Controla luces, aires, televisores y escenas desde el navegador del celular, conectado al mismo Wi-Fi que este computador. No hace falta instalar nada ni pasa por internet.</p>
     <label class="phone-toggle"><input type="checkbox" id="phone-enabled" ${status.running ? 'checked' : ''}> Permitir el control desde celulares de esta red</label>
     ${status.running ? `
      <div class="phone-code"><img src="${status.qr}" alt="Código QR para abrir Habita en el celular" width="220" height="220">
       <div><p><strong>Escanéalo con la cámara del celular.</strong> Se abre el panel de Habita ya vinculado; guárdalo en la pantalla de inicio para tenerlo a mano.</p><small>Dirección: ${esc(status.address)}</small></div></div>
      <small class="phone-note">Si Windows pregunta, permite que Habita use las redes privadas. Quien tenga este código puede controlar tu casa mientras esté en tu Wi-Fi.</small>` : ''}
     <div class="dialog-actions">${status.running ? '<button type="button" id="phone-rotate" class="secondary">Renovar código</button>' : ''}<button type="button" data-close class="primary">Listo</button></div>`, () => {
      $('#phone-enabled').onchange = async event => {
        try { status = await phone.set(event.target.checked); } catch (error) { toast(error.message); }
        paint();
      };
      const rotate = $('#phone-rotate');
      if (rotate) rotate.onclick = async () => { status = await phone.rotate(); paint(); toast('Código renovado: los celulares vinculados antes deben escanearlo otra vez.'); };
    });
    paint();
  }

  phone?.onShow(open);
  return { open, available: !!phone };
}
