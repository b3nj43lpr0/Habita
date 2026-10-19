// Aire acondicionado animado: estelas translúcidas que salen por la aleta y caen con el aire frío,
// aleta que se abre al encender y oscila, piloto y un halo de luz del color del modo. Todo
// aparece y se apaga con un fundido. Idea inspirada en house-control (MIT); implementación
// propia con un InstancedMesh para que todas las estelas cuesten una sola llamada de dibujo.
import * as THREE from 'three';
import { modeColors } from './climate.js';

const streaks = 64;
const reach = 2.4;
const fanSpeed = { auto: .42, low: .26, medium: .42, high: .62 };
const forward = new THREE.Vector3(0, 0, 1);
const head = new THREE.Vector3(), tail = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
const scale = new THREE.Vector3(), quat = new THREE.Quaternion(), matrix = new THREE.Matrix4();
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

// `from`: estado de la animación anterior, para que reconstruir la escena no la reinicie.
export function createAirflow(item, base = 0, model = null, from = null) {
  const group = new THREE.Group();
  // Mezcla normal y no aditiva: sobre pisos claros lo aditivo se satura a blanco y no se ve.
  const material = new THREE.MeshBasicMaterial({ color: modeColors.cool, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .03, 1), material, streaks);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.visible = false;
  // Halo del color del modo sobre el muro y el piso. Siempre presente (intensidad 0 apagado)
  // para no cambiar el número de luces y obligar a recompilar los materiales.
  const wash = new THREE.PointLight(0xffffff, 0, 3.4, 2);
  wash.position.set(0, -.5, .75);
  group.add(mesh, wash);
  // Cada estela tiene una posición fija a lo ancho, una fase, una velocidad y un vaivén propios.
  const seeds = Array.from({ length: streaks }, (_, i) => ({
    // Secuencias independientes: con .618 y .382 (que suman 1) el ancho dependería de la fase
    // y todas las estelas caerían en una sola línea.
    phase: (i * .618034) % 1, u: ((i * .754878) % 1) * 2 - 1, speed: .8 + ((i * .569840) % 1) * .5, wobble: (i * 2.399) % (Math.PI * 2),
  }));
  let flap = null, display = null;
  model?.traverse(child => { if (child.userData.acFlap) flap = child; if (child.userData.acDisplay) display = child; });

  const tint = new THREE.Color(modeColors.cool), goalTint = tint.clone();
  let goal = 0, power = 0, angle = 38, clock = 0, last = null, speed = fanSpeed.auto, swing = false, shown = true;
  if (from) { ({ power, angle, clock } = from); tint.copy(from.tint); }

  function place() {
    group.position.set(item.x, base + (item.elevation || 0) + item.h * .08, item.z);
    group.rotation.set(0, item.rotation * Math.PI / 180, 0);
    group.translateZ(item.d / 2);
  }

  function sample(seed, t, out) {
    const a = THREE.MathUtils.degToRad(angle), d = reach * t;
    const sway = Math.sin(clock * 1.6 + seed.wobble + t * 5) * .035 * t;
    return out.set(seed.u * (item.w * .45 + .5 * t) + sway, -Math.sin(a) * d - .35 * t * t, Math.cos(a) * d);
  }

  function update(seconds) {
    const dt = last === null ? 0 : Math.min(.1, Math.max(0, seconds - last));
    last = seconds;
    power += (goal - power) * ease(dt, 3.5);
    if (Math.abs(goal - power) < .002) power = goal;
    tint.lerp(goalTint, ease(dt, 5));
    clock += dt;
    // Con oscilación la aleta barre de arriba abajo; sin ella queda en un ángulo medio.
    angle += ((swing ? 38 + Math.sin(clock * .9) * 26 : 38) - angle) * ease(dt, 4);
    if (flap) flap.rotation.x = THREE.MathUtils.degToRad(angle * .9 + 10) * power;
    if (display) { display.material.emissive.copy(tint); display.material.emissiveIntensity = power * 1.4; }
    wash.color.copy(tint);
    wash.intensity = shown ? power * 1.4 : 0;
    material.color.copy(tint);
    material.opacity = .75 * power;
    mesh.visible = shown && power > .004;
    if (!mesh.visible) return;
    for (let i = 0; i < streaks; i++) {
      const seed = seeds[i], t = (seed.phase + clock * speed * seed.speed) % 1;
      sample(seed, t, head);
      sample(seed, Math.max(0, t - .085), tail);
      dir.subVectors(head, tail);
      const length = dir.length();
      quat.setFromUnitVectors(forward, length > 1e-5 ? dir.divideScalar(length) : forward);
      // Aparecen y se desvanecen en los extremos del recorrido: se afinan en vez de oscurecerse.
      const fade = Math.pow(Math.sin(Math.PI * t), .7);
      matrix.compose(mid.addVectors(head, tail).multiplyScalar(.5), quat, scale.set(fade, fade, Math.max(length, 1e-4)));
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // `instant`: sin animación (movimiento reducido o primera carga).
  function setState(next, visible = true, instant = false) {
    goal = next?.on ? 1 : 0;
    goalTint.set(modeColors[next?.mode] || modeColors.cool);
    speed = fanSpeed[next?.fan] || fanSpeed.auto;
    swing = !!next?.swing;
    shown = visible;
    if (instant) { power = goal; tint.copy(goalTint); angle = 38; }
  }

  place();
  const snapshot = () => ({ power, angle, clock, tint: tint.clone() });
  return { group, update, setState, place, snapshot, get active() { return goal > 0 || power > 0; } };
}
