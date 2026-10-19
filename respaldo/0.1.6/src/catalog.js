// Dimensiones de ejemplo en metros; son editables, no especificaciones de fabricante.
const asset = (id, name, category, kind, w, d, h, color, presets) => ({ id, name, category, kind, w, d, h, color, presets: presets || [[w, d, h]] });
export const catalog = [
  asset('sofa', 'Sofá Nube', 'Living', 'sofa', 2.2, .9, .82, '#b4b7a2', [[1.6,.85,.82],[2.2,.9,.82],[2.8,.95,.85]]),
  asset('sofa-blue', 'Sofá Océano', 'Living', 'sofa', 2.5, .95, .85, '#627b91'),
  asset('armchair', 'Sillón de lectura', 'Living', 'sofa', .9, .9, .85, '#bc8967'),
  asset('coffee', 'Mesa baja Roble', 'Living', 'table', 1.1, .6, .38, '#b18d67', [[.8,.5,.35],[1.1,.6,.38],[1.4,.7,.4]]),
  asset('round', 'Mesa auxiliar', 'Living', 'round', .5, .5, .5, '#d4c4a5'),
  asset('tv', 'Mueble de TV', 'Living', 'tv', 1.8, .4, 1.35, '#b48c64'),
  asset('shelf', 'Librero abierto', 'Living', 'shelf', 1.2, .35, 1.9, '#ae8a61'),
  asset('rug', 'Alfombra Arena', 'Living', 'rug', 2.7, 1.9, .02, '#c7bba1', [[1.6,1.2,.02],[2.7,1.9,.02],[3.4,2.4,.02]]),
  asset('bed', 'Cama Lino', 'Dormitorio', 'bed', 1.6, 2, .95, '#ccc7b5', [[.9,1.9,.95],[1.05,2,.95],[1.5,2,.95],[1.8,2,.95],[2,2,.95]]),
  asset('nightstand', 'Velador', 'Dormitorio', 'cabinet', .45, .4, .5, '#b68f65'),
  asset('wardrobe', 'Clóset modular', 'Dormitorio', 'wardrobe', 1.8, .6, 2.2, '#bcb3a2', [[1.2,.6,2.2],[1.8,.6,2.2],[2.4,.6,2.2]]),
  asset('dresser', 'Cómoda', 'Dormitorio', 'cabinet', 1.1, .45, .85, '#ae8c6c'),
  asset('dining', 'Mesa de comedor', 'Comedor', 'table', 1.8, .9, .75, '#ba9366', [[1.2,.8,.75],[1.8,.9,.75],[2.4,1,.75]]),
  asset('chair', 'Silla curva', 'Comedor', 'chair', .46, .5, .83, '#a6ae99'),
  asset('stool', 'Piso de bar', 'Comedor', 'stool', .4, .4, .75, '#c0a17f'),
  asset('kitchen', 'Módulo de cocina', 'Cocina', 'kitchen', .9, .6, .9, '#b7b7a8', [[.45,.6,.9],[.6,.6,.9],[.9,.6,.9]]),
  asset('sink', 'Lavaplatos', 'Cocina', 'sink', .9, .6, .9, '#c4c6bd'),
  asset('stove', 'Cocina y horno', 'Cocina', 'stove', .6, .6, .9, '#899197'),
  asset('fridge', 'Refrigerador', 'Cocina', 'fridge', .7, .7, 1.85, '#b7bec0'),
  asset('island', 'Isla de cocina', 'Cocina', 'kitchen', 1.8, .9, .92, '#919c8d'),
  asset('toilet', 'Inodoro', 'Baño', 'toilet', .4, .7, .78, '#e4e3dd'),
  asset('vanity', 'Vanitorio', 'Baño', 'sink', .8, .48, .85, '#be9c7a'),
  asset('shower', 'Ducha', 'Baño', 'shower', .9, .9, 2.1, '#b5c7c6', [[.8,.8,2.1],[.9,.9,2.1],[1.2,.9,2.1]]),
  asset('bath', 'Tina', 'Baño', 'bath', .75, 1.7, .55, '#dddcd5'),
  asset('desk', 'Escritorio', 'Estudio', 'table', 1.4, .65, .75, '#c09c71'),
  asset('office-chair', 'Silla de escritorio', 'Estudio', 'chair', .6, .6, 1.05, '#58616b'),
  asset('plant', 'Ficus', 'Decoración', 'plant', .6, .6, 1.35, '#688767'),
  asset('plant-small', 'Planta de interior', 'Decoración', 'plant', .35, .35, .55, '#839267'),
  asset('floor-lamp', 'Lámpara de pie', 'Iluminación', 'lamp', .45, .45, 1.65, '#e0ceb0'),
  asset('lamp', 'Lámpara de mesa', 'Iluminación', 'lamp', .28, .28, .48, '#d9c6a8'),
  asset('door', 'Puerta interior', 'Aberturas', 'door', .8, .14, 2.1, '#b69472', [[.7,.14,2.1],[.8,.14,2.1],[.9,.14,2.1]]),
  asset('window', 'Ventana', 'Aberturas', 'window', 1.4, .14, 1.2, '#c6d8d7', [[.6,.14,.6],[1.2,.14,1],[1.8,.14,1.2],[2.4,.14,1.5]])
];
export const categories = ['Todos', ...new Set(catalog.map(a => a.category))];
export const byId = id => catalog.find(a => a.id === id);
export const isOpening = item => ['door', 'window'].includes(byId(item.asset)?.kind);
export function makeItem(assetId, x = 0, z = 0) {
  const a = byId(assetId);
  return { id: crypto.randomUUID(), asset: a.id, name: a.name, x, z, w:a.w, d:a.d, h:a.h, rotation:0, color:a.color, elevation:0, sill:a.kind === 'window' ? .9 : 0 };
}
