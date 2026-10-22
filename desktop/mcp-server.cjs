#!/usr/bin/env node
// Servidor MCP de Habita (stdio). Lo lanza un asistente de IA de este equipo (Claude Desktop,
// Claude Code u otro cliente MCP) y reenvía cada herramienta a Habita abierto, por el puente
// local de desktop/ai-bridge.cjs. Solo usa módulos de Node: Habita lo copia a la carpeta de datos
// para que funcione también con el ejecutable portable.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const accessFile = process.env.HABITA_ACCESS_FILE ||
  path.join(process.env.APPDATA || path.join(require('node:os').homedir(), '.config'), 'habita-studio', 'ai-access.json');

const room = { type: 'string', description: 'Habitación por id o nombre, por ejemplo "Dormitorio".' };
const ids = { type: 'array', items: { type: 'string' }, description: 'Identificadores de objetos según get_home. Sin ids ni room, se aplica a toda la casa.' };
const tools = [
  {
    name: 'get_home',
    description: 'Describe la casa de Habita: habitaciones, luces y aires acondicionados con su estado, si están vinculados a un equipo real, y las escenas guardadas.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'set_lights',
    description: 'Cambia luces de la casa. Las vinculadas a Home Assistant cambian también en la realidad. Pedir brillo, calidez o color enciende la luz.',
    inputSchema: {
      type: 'object',
      properties: {
        ids, room,
        on: { type: 'boolean' },
        brightness: { type: 'number', minimum: 0, maximum: 100, description: 'Brillo en %.' },
        warmth: { type: 'number', minimum: 0, maximum: 100, description: 'Luz blanca: 0 fría, 100 cálida.' },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Color RGB, por ejemplo #ff8800.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'set_air_conditioners',
    description: 'Cambia aires acondicionados de la casa. Los vinculados a Home Assistant cambian también en la realidad.',
    inputSchema: {
      type: 'object',
      properties: {
        ids, room,
        on: { type: 'boolean' },
        mode: { type: 'string', enum: ['cool', 'heat', 'dry', 'fan', 'auto'] },
        target: { type: 'number', minimum: 16, maximum: 30, description: 'Temperatura objetivo en °C, en pasos de 0,5.' },
        fan: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
        swing: { type: 'boolean', description: 'Aleta oscilando (true) o fija (false).' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'set_tvs',
    description: 'Cambia televisores de la casa: encendido, volumen, silencio o entrada. Los vinculados a Home Assistant cambian también en la realidad, solo en lo que el equipo admite.',
    inputSchema: {
      type: 'object',
      properties: {
        ids, room,
        on: { type: 'boolean' },
        volume: { type: 'number', minimum: 0, maximum: 100, description: 'Volumen en porcentaje.' },
        muted: { type: 'boolean' },
        source: { type: 'string', description: 'Nombre de la entrada, por ejemplo HDMI 1 o Netflix.' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'get_plan',
    description: 'Describe el plano: pisos, habitaciones (x, z del centro; w ancho y d fondo en metros), objetos con su modelo, posición y giro, y el catálogo de modelos disponibles para add_item.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'add_room',
    description: 'Agrega una habitación rectangular (requiere que el usuario permita editar el plano). Las habitaciones pueden compartir muros pero no encimarse. Sirve para reconstruir una casa a partir de fotos o de un plano.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, w: { type: 'number', minimum: .5, maximum: 50 }, d: { type: 'number', minimum: .5, maximum: 50 }, level: { type: 'string', description: 'Id del piso; por omisión, el primero.' } }, required: ['x', 'z', 'w', 'd'], additionalProperties: false },
    annotations: { destructiveHint: false }
  },
  {
    name: 'update_room',
    description: 'Cambia el nombre, la posición o las medidas de una habitación.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, w: { type: 'number' }, d: { type: 'number' } }, required: ['id'], additionalProperties: false }
  },
  {
    name: 'remove_room',
    description: 'Quita una habitación (sus muebles se conservan). El usuario puede deshacerlo en Habita.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    annotations: { destructiveHint: true }
  },
  {
    name: 'add_item',
    description: 'Agrega un mueble o equipo del catálogo (ver get_plan). Con «room» y sin x/z queda al centro de esa habitación; las puertas y ventanas se pegan al muro más cercano.',
    inputSchema: { type: 'object', properties: { asset: { type: 'string' }, room: { type: 'string', description: 'Id o nombre de la habitación.' }, x: { type: 'number' }, z: { type: 'number' }, rotation: { type: 'number' }, name: { type: 'string' }, w: { type: 'number' }, d: { type: 'number' }, h: { type: 'number' }, level: { type: 'string' } }, required: ['asset'], additionalProperties: false }
  },
  {
    name: 'update_item',
    description: 'Mueve, gira, cambia medidas, color o nombre de un objeto.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, x: { type: 'number' }, z: { type: 'number' }, rotation: { type: 'number' }, name: { type: 'string' }, w: { type: 'number' }, d: { type: 'number' }, h: { type: 'number' }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, required: ['id'], additionalProperties: false }
  },
  {
    name: 'remove_item',
    description: 'Quita un objeto del plano. El usuario puede deshacerlo en Habita.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    annotations: { destructiveHint: true }
  },
  {
    name: 'activate_scene',
    description: 'Activa una escena guardada en Habita (luces, aires, televisores y cortinas a la vez).',
    inputSchema: { type: 'object', properties: { scene: { type: 'string', description: 'Id o nombre de la escena.' } }, required: ['scene'], additionalProperties: false }
  }
];

async function callHabita(name, args) {
  let access;
  try {
    access = JSON.parse(fs.readFileSync(accessFile, 'utf8'));
  } catch {
    throw new Error('Habita no está abierto o el acceso para IA está desactivado. Actívalo desde el ícono de Habita en la bandeja de Windows.');
  }
  let res;
  try {
    res = await fetch(`${access.url}/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access.token}` },
      body: JSON.stringify({ name, arguments: args }),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error('No se pudo contactar a Habita. Ábrelo y vuelve a intentar.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Habita respondió ${res.status}.`);
  if (!body.ok) throw new Error(body.error || 'Habita no pudo completar la orden.');
  return body.result;
}

const send = message => process.stdout.write(JSON.stringify(message) + '\n');

async function handle(message) {
  const { id, method, params } = message;
  const answer = result => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, text) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message: text } });
  switch (method) {
    case 'initialize':
      return answer({
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        // Habita escribe su versión aquí al copiar este archivo (desktop/main.cjs).
        serverInfo: { name: 'habita', version: 'dev' },
        instructions: 'Controla la casa de Habita Studio. Llama primero a get_home para conocer habitaciones, objetos y escenas. Para cambiar la distribución (habitaciones y muebles) usa get_plan y las herramientas add_/update_/remove_, que el usuario debe permitir; cada cambio se puede deshacer en Habita.'
      });
    case 'ping':
      return answer({});
    case 'tools/list':
      return answer({ tools });
    case 'tools/call': {
      const name = params?.name;
      if (!tools.some(tool => tool.name === name)) return fail(-32602, `Herramienta desconocida: ${name}`);
      try {
        const result = await callHabita(name, params.arguments || {});
        return answer({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result });
      } catch (error) {
        return answer({ content: [{ type: 'text', text: error.message }], isError: true });
      }
    }
    default:
      if (method?.startsWith('notifications/')) return;
      return fail(-32601, `Método no soportado: ${method}`);
  }
}

readline.createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }); }
  handle(message).catch(error => message.id !== undefined && send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } }));
});
