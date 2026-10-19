export const $ = selector => document.querySelector(selector);

// Todo texto que venga del proyecto o de un dispositivo pasa por aquí antes de entrar a innerHTML.
export const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = n => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('visible'), 3500);
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
