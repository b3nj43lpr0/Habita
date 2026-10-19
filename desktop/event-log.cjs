// Registro de texto de lo que se envió a los equipos reales y lo que respondieron, junto a la
// configuración del usuario. Es lo primero que mirar cuando un equipo no reacciona.
// Nunca contiene tokens. Idea de house-control (MIT, Copyright (c) 2026 0xProbability).
const fs = require('node:fs/promises');

function createEventLog(file, { limit = 512 * 1024 } = {}) {
  let queue = Promise.resolve();

  async function trim() {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size <= limit) return;
    // Al superar el límite se conserva la mitad más reciente, desde un inicio de línea.
    const text = await fs.readFile(file, 'utf8');
    const half = text.slice(Math.floor(text.length / 2));
    await fs.writeFile(file, half.slice(half.indexOf('\n') + 1), 'utf8');
  }

  return {
    append(fields) {
      const line = [new Date().toISOString(), ...fields].map(value => String(value).replace(/[\r\n\t]+/g, ' ')).join('\t') + '\n';
      queue = queue.then(() => fs.appendFile(file, line, 'utf8')).then(trim).catch(() => {});
      return queue;
    },
    async read(lines = 200) {
      await queue;
      const text = await fs.readFile(file, 'utf8').catch(() => '');
      return text.split('\n').filter(Boolean).slice(-lines);
    },
    file
  };
}

module.exports = { createEventLog };
