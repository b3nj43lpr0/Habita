# Habita Studio: hoja de ruta

## Prioridad actual

Editor local para Windows: plano 2D y maqueta 3D sincronizados, habitaciones,
medidas en metros, puertas y ventanas, catálogo de muebles con variantes de
tamaño, materiales, historial y archivos de proyecto.

Implementado en 0.1.1: traslado de pisos y ocho tiradores para redimensionar en
2D, ajuste a bordes, transporte opcional de muebles y un paso de Deshacer por
gesto. Recorrido en primera persona con WASD, ojos a 1,65 m, velocidad de 1,8 m/s,
mouse capturado o arrastre con cursor libre y colisiones básicas con paredes,
aberturas y cajas de muebles. Durante el recorrido se muestran techos y puertas
abiertas. Son espacios rectangulares en un mismo nivel.

Implementado en 0.1.2: geometría con bordes redondeados, materiales de tela y
madera generados localmente, entorno de iluminación, sombras filtradas,
oclusión ambiental y resplandor moderado. Paneles flotantes y transiciones
suaves inspirados en la referencia. La cuadrícula queda en el plano 2D.
Los modelos se reutilizan al editar pisos y mover muebles; la escena quieta
no se vuelve a dibujar hasta que cambian la cámara, la iluminación o el modelo.

Revisión 0.1.3 tras volver a observar los estados del video: tarjetas de vidrio
con bordes iluminados, degradados azul/ámbar/violeta y controles compactos.
Panel flotante plegable de ambientes y sliders funcionales de luz y calidez.
Sliders de propiedades con previsualización y confirmación al soltar. Los
presets son de visualización; no representan dispositivos conectados.

## Referencias nuevas y adaptación 0.1.4 (14 de octubre de 2026)

- https://x.com/0xProbabillity/status/2110131745094029472
  Publicación recuperada mediante el espejo público FxTwitter; video observado
  en navegador. Amplía la demostración de la casa en la barra de menú y muestra
  controles de brillo, calidez y color según el dispositivo. Adaptación al editor:
  acciones contextuales próximas al mueble y modo ampliado de maqueta.
- https://x.com/dom_scholz/status/2110040364564275291
  Publicación y video recuperados; muestra una oficina 3D con selección espacial
  y controles flotantes. El autor destaca la satisfacción de uso y el sonido.
  Adaptación: respuesta visual al pulsar, aparición breve de la barra y sonidos
  originales sintetizados, opcionales y apagados inicialmente. No se copian
  recursos, audio ni código del autor.

La UI/UX existente se conserva. Estas adaptaciones no incorporan domótica real,
conexiones de red, agentes, ni una integración con la barra de menú de macOS.

Ampliación 0.1.5: controles individuales de lámparas con encendido, intensidad,
temperatura visual y color. La emisión del material, el halo y la fuente puntual
responden al mismo estado. Se conservan por objeto en `.habita`, con validación
de entrada, previsualización reversible y un paso de Deshacer por gesto.
Controles conjuntos por habitación y para toda la casa; listado de lámparas
seleccionables y enfoque suave de cámara. Hasta 16 fuentes puntuales simultáneas
para acotar el coste de renderizado; la lámpara seleccionada tiene prioridad.
La domótica física continúa pendiente según el alcance siguiente.

## Domótica: alcance pendiente

Solicitud guardada: controlar luces, aire acondicionado, TV y otros equipos
desde la casa 3D, como en el video de referencia:
https://x.com/0xProbabillity/status/2109978137794883621

- Vincular un objeto del plano con uno o varios dispositivos físicos.
- Luces: encendido, brillo y color según las capacidades reales.
- Aire acondicionado: encendido, temperatura, modos y lectura de estado.
- TV: encendido, volumen, entradas y funciones compatibles.
- Control individual, por habitación y mediante escenas (Noche, Cine, Salir).
- Mostrar estado real, desconexiones y acciones que no pudieron ejecutarse.
- Evaluar Home Assistant y protocolos locales documentados antes de desarrollar
  conectores propios; la compatibilidad depende del equipo y su API.
- Mantener credenciales fuera de los archivos de diseño y del código del renderer.
- No implementar ni conectar dispositivos ahora. Solicitar modelos y capacidades
  cuando comience esta fase; los nombres visuales de los muebles no identifican
  dispositivos de red.

Decisión de arquitectura: los objetos tienen identificadores estables. Una futura
tabla de vinculaciones referenciará esos identificadores sin mezclar secretos ni
acciones físicas con la geometría, el historial o la carga de proyectos.

## Ampliaciones del editor

- Catálogo externo GLB con miniaturas, licencias y escala verificadas.
- Materiales y modelos CC0 de Kenney y Poly Haven, seleccionados y optimizados.
- Varios niveles, escaleras, techumbres y terrenos.
- Importar planos como imagen con calibración mediante una medida conocida.
- Medición de circulación y barrido de puertas; comprobación de intersecciones
  con paredes y geometría irregular.
- Comparar distribuciones alternativas y guardar versiones nombradas.
- Iluminación más detallada y recorridos entre niveles.

## Referencias investigadas

- Sweet Home 3D: https://www.sweethome3d.com/features/
  Referencia funcional de plano, catálogo, aberturas y visualización sincronizada.
- Blueprint3D: https://github.com/furnishup/blueprint3d
  Referencia de separación entre modelo, editor 2D y representación 3D. Su README
  documenta dependencias antiguas y refactorizaciones pendientes; no se incorpora
  como dependencia ni se copia su implementación.
- Three.js: https://threejs.org/docs/pages/OrthographicCamera.html
  y https://threejs.org/docs/pages/GLTFLoader.html
  Motor de visualización y futura carga de modelos.
- Kenney Furniture Kit: https://kenney.nl/assets/furniture-kit
  La página indica 140 assets y licencia CC0. No integrados en esta versión.
- Poly Haven: https://polyhaven.com/license
  Licencia CC0 de assets; no equivale a licencia del contenido completo del sitio.

No se ha identificado el código de la app del video ni se afirma haberlo
descompilado. REA está conectado, pero estas referencias ofrecen documentación o
código público suficiente para las decisiones iniciales.
