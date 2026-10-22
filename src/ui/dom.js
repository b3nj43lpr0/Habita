export const $ = selector => document.querySelector(selector);

// Todo texto que venga del proyecto o de un dispositivo pasa por aquí antes de entrar a innerHTML.
export const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = n => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

// Con `action` ({ label, run }) el aviso ofrece un botón, como «Deshacer», y dura un poco más.
export function toast(message, action = null) {
  const element = $('#toast');
  element.textContent = message;
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.onclick = () => { element.classList.remove('visible'); action.run(); };
    element.append(button);
  }
  element.classList.toggle('with-action', !!action);
  element.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('visible'), action ? 6000 : 3500);
}

// Texto sin tildes ni mayúsculas, para buscar «sillon» y encontrar «Sillón».
export const plain = text => String(text).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

// Listas que se desplazan a los lados: avisan con un degradado que hay más contenido y aceptan la
// rueda del mouse (que normalmente solo desplaza en vertical).
export function scrollHints(element) {
  if (!element || element.dataset.hints) return;
  element.dataset.hints = 'true';
  const paint = () => {
    element.classList.toggle('more-start', element.scrollLeft > 2);
    element.classList.toggle('more-end', element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  };
  element.addEventListener('scroll', paint, { passive: true });
  element.addEventListener('wheel', event => {
    if (element.scrollWidth <= element.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    element.scrollLeft += event.deltaY;
  }, { passive: false });
  new ResizeObserver(paint).observe(element);
  new MutationObserver(paint).observe(element, { childList: true, subtree: true });
  paint();
}

export function modal(html, after) {
  const dialog = $('#dialog');
  $('#dialog-body').innerHTML = html;
  dialog.showModal();
  dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close());
  after?.();
}

export function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
