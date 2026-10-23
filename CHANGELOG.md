# Historial de versiones

Lo nuevo de cada versión de Habita Studio, de la más reciente a la más antigua. Lo que
viene está en [docs/ROADMAP.md](docs/ROADMAP.md).

## 0.10.0 · Se actualiza sola, PDF, circulación, materiales y sol real

- **Actualización automática**: al abrir Habita se revisa si hay una versión nueva. El instalador la
  descarga solo y en la barra de abajo aparece **Actualizar a …**: un clic cierra Habita, instala y
  la vuelve a abrir. La versión portable avisa y abre la página de descarga.
- **PDF del plano** (botón de documento arriba de la maqueta o «PDF del plano» en Tu proyecto): portada
  con la vista 3D, plano de cada piso con medidas, puertas y muebles, tabla de espacios, revisión de
  circulación, materiales y lista de compras.
- **Espacios en L o en T**: en el panel de una habitación, **Unir con** un espacio vecino quita el muro
  entre ambos (y la puerta que hubiera en él). **Separar** lo vuelve a poner.
- **Muros en diagonal**: nueva categoría *Estructura* con **Muro libre**, **Muro bajo** y **Pilar**;
  se giran a cualquier ángulo con *Rotación* y el imán de paredes no los mueve.
- **Puertas**: el plano 2D muestra por dónde abre cada una; **Cambiar sentido de apertura** en su panel.
  Si al abrirse choca con un mueble, aparece el aviso.
- **Revisión de circulación** (Tu proyecto → Circulación): pasos de menos de 60 cm entre muebles grandes
  o contra la pared, y puertas que chocan. Se marcan en rojo en el plano.
- **Calculadora de materiales**: piso a comprar (con margen por cortes), litros de pintura (sin puertas
  ni ventanas) y metros de guardapolvo por espacio. Con precios, se suman a la lista de compras.
- **Terminaciones de piso** (pestaña Materiales o panel de la habitación): madera, flotante, cerámica,
  porcelanato, alfombra, cemento pulido, deck y pasto, con su textura en la maqueta.
- **Sol real** (Tu proyecto → Sol real): ciudad, mes, hora y hacia dónde mira la casa; la luz y las
  sombras entran por donde corresponde. **Ver el día completo** recorre del amanecer al atardecer.
- **18 objetos nuevos**: sofá esquinero, camarote, piano, vitrina, zapatero, secadora, lavadero,
  cuadro, repisa, perchero, lámpara colgante (controlable como las otras lámparas), árbol, pasto,
  piscina, cerco y la estructura.
- **Modelos 3D descargados**: «Importar modelo 3D (.glb)» en la biblioteca agrega muebles bajados de
  internet (hasta 3 MB cada uno). Quedan guardados dentro del archivo `.habita`.

## 0.9.1 · Muebles que se ajustan a las paredes

- **Imán de paredes**: al arrastrar un mueble a menos de 25 cm de un muro, queda pegado a la
  cara interior de la pared, sin hueco ni solape, y gira para dar la espalda al muro
  (camas, sofás, clósets, cocina…). Las sillas, plantas, lámparas y alfombras se pegan sin girar.
- En una esquina se apoya en las dos paredes, y junto a otro mueble pegado al mismo muro
  (por ejemplo módulos de cocina) se arrima a su costado.
- Al girar un mueble que estaba contra la pared, vuelve a apoyarse en ella.
- Con **Movimiento libre** (botón «Ajuste a 10 cm») o al mover un grupo, el imán no actúa.

## 0.9.0 · Casa conectada, control remoto, IA que edita y herramientas de diseño

Editor:
- **Nueva casa** (botón + de la barra superior): casa de ejemplo, departamento, estudio,
  una habitación o plano vacío. Reemplazar la casa se puede deshacer.
- **Cotas en el plano 2D**: medidas exteriores de la casa, medidas del objeto elegido y
  su distancia libre a cada muro, en vivo al arrastrar. Botón **Cotas** para ocultarlas.
- **Medir** (tecla M): huincha entre dos puntos; se pega a las esquinas y con Shift mide recto.
- **Notas en el plano** (tecla N o pestaña Espacios): etiquetas de colores en 2D y 3D.
- **Lista de compras**: precio y enlace de tienda por mueble (sección «Compra»), total del
  proyecto y exportación a CSV.
- **Versiones**: guardar la distribución actual con nombre, compararla con otra y volver a ella.
- Selección múltiple (Shift o Ctrl + clic, Ctrl + A), alinear y repartir; flechas para
  mover, Ctrl + D, Ctrl + C / Ctrl + V; avisos con **Deshacer**.

Maqueta:
- **Paredes según vista**: los muros que dan a la cámara se bajan solos al girar.
- **Noche** con paredes oscuras y lámparas que iluminan su entorno.
- Contorno al pasar el mouse, destello al encender una lámpara, vuelo de cámara al elegir
  un espacio y sonidos para encender, apagar y activar escenas.
- **Video del recorrido**: una vuelta a la casa o un paseo por los espacios, en MP4 o WebM.

Casa conectada:
- **Aspiradora robot** (`vacuum.*`), **Philips Hue** directo desde su puente (sin Home
  Assistant) y búsqueda de Home Assistant en la red.
- **Vincular por habitación**: propone el equipo real de cada objeto según las áreas de
  Home Assistant y los nombres.
- **Diagnóstico**: revisa la conexión, cada vínculo y las órdenes fallidas; copia un informe.
- **Panel rápido** en la bandeja (clic en el ícono) que se asoma cuando algo cambia desde
  fuera; el ícono muestra luces encendidas y temperatura.
- **Control desde el celular**: activar en la bandeja o en «Conectar tu casa real», escanear
  el QR y usar el panel desde el navegador del teléfono, en el mismo Wi-Fi.
- **IA que edita la casa**: `get_plan`, `add_room`, `update_room`, `remove_room`, `add_item`,
  `update_item` y `remove_item`, solo con el permiso «Permitir que la IA edite el plano»;
  cada cambio se puede deshacer y la actividad se ve en la barra de estado. El acceso puede
  apagarse solo después de 30 minutos, 1 hora o 4 horas.

`npm run lab` también levanta un puente Hue simulado (escribe «b» para pulsar su botón).

## 0.8.4 · Revisión de interfaz

- Avisos con **Deshacer** al eliminar y al deshacer; deshacer conserva la selección.
- Búsqueda de la biblioteca sin tildes y categorías en una fila desplazable.
- La barra de acciones se apoya sobre el contorno del objeto y ya no lo tapa.
- *Ambiente* empieza plegado y recuerda su estado; se quitó el botón duplicado de ambiente.
- El zoom pasó a la columna de botones flotantes y la casa se encuadra en el espacio libre.
- El inspector aplica cada campo al confirmarlo (sin botón «Aplicar cambios»).
- Flechas para mover, Ctrl + D, Ctrl + C / Ctrl + V, selección múltiple con alinear y repartir.
- Textos de al menos 10,5 px, nombre del proyecto visiblemente editable y botones más cómodos.
- El recorrido parte en la habitación más grande, mirando hacia su centro.
- Cotas en el plano 2D con la distancia libre del objeto elegido a cada muro.

## 0.8.1 a 0.8.3 · Sliders, aire animado y detalles de house-control

Adaptado de la nueva versión de [house-control](https://github.com/0xProbabillity/house-control)
(MIT), con código propio:

- **Sliders nuevos**: carril oscuro con marcas, degradado que se descubre bajo un tirador blanco
  cuadrado y relleno que llega justo hasta el tirador. Cada uno tiene su degradado: brillo,
  calidez (blanco frío a cálido), temperatura del aire (azul a naranja), volumen y medidas.
  Los de lámpara, aire, televisor y cortina tienen botones − y + para avanzar de a un paso.
  Siguen siendo controles nativos: teclado, lector de pantalla y Deshacer funcionan igual.
- **Aire acondicionado animado**: la aleta se abre al encender y, con *Aleta: Oscilar*, barre
  de arriba abajo. El aire sale en abanico, cae y se mece; la velocidad sigue al ventilador.
  El piloto y un halo de luz toman el color del modo, y todo aparece y se apaga con un fundido.
  Respeta «reducir movimiento» de Windows.
- **Oscilación real**: con un equipo vinculado, *Oscilar* usa `climate.set_swing_mode`
  (`both`, `vertical` u `on`, según lo que admita); si ya oscila en otro sentido, se respeta.
  Se guarda en escenas y la IA puede pedirla por MCP (`swing` en `set_air_conditioners`).
- **Etiqueta al pasar el mouse** sobre una lámpara, aire, televisor o cortina en la maqueta:
  nombre y estado (el real, si está vinculado).
- **Atenuar arrastrando**: en *Luces de la casa* (y de cada espacio), arrastrar la fila de una
  lámpara a los lados cambia su brillo, con un solo paso de Deshacer; las flechas izquierda y
  derecha también. Bajo 4 % se apaga.
- **0.8.2 · Modo control como house-control**: el panel derecho del modo control es ahora una
  tarjeta con el estado de la casa («2 de 6 luces encendidas · Aire 23°») y un botón que apaga
  todo (o enciende las luces), las escenas, los espacios con la cuenta de luces encendidas y
  tarjetas por equipo. Tocar una lámpara la enciende o apaga y arrastrarla a los lados la atenúa;
  el aire tiene − 23° + y su encendido en la misma tarjeta. Cada equipo abre una hoja con el
  número grande, el slider con − y +, y tarjetas de opciones (modo, ventilador, aleta) o, en las
  luces de color, el cojín de color y ocho muestras. El fondo del panel toma el color de las luces
  encendidas o del modo del aire. Elegir un equipo en la maqueta abre su hoja.
- **0.8.2**: el aire se anima aunque Windows tenga las animaciones apagadas, el relleno de los
  sliders ya no se asoma por las esquinas del tirador y las estelas del aire son más visibles.
- **0.8.3 · Auditoría**: si el autoguardado no se puede abrir (por ejemplo, después de usar una
  versión más nueva), se respalda en este equipo antes de abrir la casa de ejemplo y ya no se
  pierde con el siguiente cambio. Una automatización ya no acepta un nombre en blanco (dejaba el
  proyecto sin poder abrirse). Abrir Habita por segunda vez ya no corta el acceso de la IA a la
  ventana abierta. El token de Home Assistant guardado solo se reutiliza con la misma dirección.
  Las escenas anteriores a la aleta ya no cuentan como cambio si la casa está igual, y una orden de
  la IA sin efecto no agrega un paso de Deshacer. El CSS perdió 529 declaraciones que nunca se
  aplicaban (comprobado comparando el estilo calculado de cada elemento en 10 estados), y el vidrio
  de la barra superior, la biblioteca y el inspector recuperó su desenfoque: el empaquetador
  descartaba la propiedad estándar y dejaba solo `-webkit-backdrop-filter`, que Chromium no aplica.
- Correcciones: el panel flotante ya no tapa el objeto (se abre a su lado si no cabe encima),
  no queda cortado y su barra de desplazamiento sigue el tema; los avisos aparecen arriba, sin
  tapar la barra de pisos.

## 0.8.0 · Automatizaciones, modo control y consumo

- **Automatizaciones** (hasta 30): activan una escena a una hora y ciertos días, o cuando se
  abre o cierra una puerta o ventana con sensor. Viajan en el `.habita` y corren mientras
  Habita está abierto, también minimizado en la bandeja.
- **Modo control**: el botón de la tableta muestra la casa a pantalla completa solo con los
  equipos, pensado para una tablet. El mismo botón vuelve al editor.
- **Mapa de consumo**: con un sensor de consumo elegido por habitación, *Consumo* colorea
  las habitaciones de verde a rojo según los vatios actuales; gris si no tienen sensor.
- **Televisores por MCP**: la herramienta `set_tvs` (encendido, volumen, silencio y entrada).

## 0.7.0 · Sensores, cortinas y varios pisos

- **Sensores de la habitación**: con la casa conectada, el panel de cada habitación permite
  elegir un sensor de temperatura y uno de humedad (`sensor.*` con `device_class`
  temperature o humidity; los demás sensores no se cargan). La lectura aparece en vivo en el
  selector de espacios y en las etiquetas del plano 2D, por ejemplo «25,5 °C · 58 %».
- **Puertas y ventanas con sensor** (`binary_sensor.*` door, window, opening o garage_door):
  se vinculan desde la barra de la puerta o ventana, o desde *Puertas y ventanas* en el panel
  de la habitación. Abiertas, la maqueta quita la hoja de la puerta o el vidrio de la
  ventana. Son de solo lectura: no se envía ninguna orden.
- **Cortinas y persianas** (`cover.*`): dos objetos nuevos en *Aberturas* que se colocan
  contra el muro. Con un motor que admite posición, un slider de apertura; si solo abre y
  cierra, dos botones. Como los aires, el motor recibe solo el valor final al soltar. En la
  maqueta la cortina se recoge hacia un lado y la persiana hacia arriba. Entran en escenas.
- **Varios pisos**: el selector de espacios muestra los pisos y un botón **+** para agregar
  uno (hasta 8). Un piso nuevo copia el contorno del piso activo, sin muebles. En *Espacios*
  se renombran y eliminan (el primero no se elimina). Se edita un piso a la vez: el plano 2D
  y el recorrido muestran solo el piso activo; la maqueta 3D muestra también los de abajo,
  con paredes completas. Paredes, alertas, superposiciones y controles por habitación se
  calculan piso por piso. Entre pisos hay 20 cm de losa.
- **Escalera recta** (categoría *Estructura*): en el recorrido, pisarla lleva al piso de
  arriba junto a su extremo alto, y pisar su hueco desde arriba baja junto al extremo bajo.
  La escalera sube hacia el fondo del objeto. Pendiente: perforar la losa del piso de arriba
  y ver la subida animada.
- Todos los proyectos anteriores se abren como casas de un piso.

## 0.6.0 · Televisor real, plano de referencia y catálogo ampliado

- **Televisor** (`media_player.*`): el *Mueble de TV* y el nuevo *Televisor de muro* se
  vinculan como las lámparas y los aires (la vinculación queda fuera del `.habita` y el token
  nunca llega a la interfaz). Sus controles muestran solo lo que el equipo declara en
  `supported_features`: encendido (turn_on y turn_off), volumen (volume_set), silencio
  (volume_mute) y entradas (select_source, con su `source_list`). El volumen sigue el slider
  en vivo con la misma cola de una orden en curso por equipo; el resto se envía al soltar y
  solo si cambia algo. La pantalla de la maqueta se ilumina con el televisor encendido.
- Las **escenas** guardan también los televisores; las escenas anteriores siguen abriéndose.
- **Plano de referencia**: en *Espacios → Importar plano* se elige una imagen PNG o JPG con
  el diálogo nativo (una operación más del preload, solo lectura de la imagen elegida). Se
  reduce a 2000 px y se guarda en JPEG dentro del `.habita` (máximo ~3 MB), validada al
  abrir. Se ve solo en el plano 2D, sobre el suelo y bajo muebles y paredes, con opacidad
  ajustable. **Calibrar escala** pide dos clics sobre una medida conocida y su largo real en
  metros; la imagen se escala alrededor del primer punto. Sin bloquear, se arrastra en el
  plano 2D (y mientras tanto tapa la selección de pisos); **Bloquear posición** la fija.
  Deshacer revierte cada importación, calibración, arrastre o cambio de opacidad.
- **Catálogo**: 28 entradas nuevas (61 en total), todas paramétricas y propias, sin archivos
  externos ni licencias de terceros: televisor de muro, rack multimedia, barra de sonido,
  parlante, puf y banco; banqueta, tocador y cuna; lavavajillas, mueble aéreo, campana,
  despensa y microondas; espejo, lavadora, toallero y mueble de baño; escritorio elevable,
  monitor, cajonera y estantería baja; y la nueva categoría *Exterior* con mesa y silla de
  terraza, reposera, parrilla, jardinera y quitasol. Los objetos de muro (televisor, espejo,
  mueble aéreo, campana y toallero) se colocan contra el muro del fondo a su altura de
  montaje. Las medidas son ejemplos editables.
- Pendiente: modelos GLB de Kenney/Poly Haven (CC0) con `GLTFLoader`. Se optó por modelos
  paramétricos para no inflar el ejecutable ni descargar recursos sin verificar su escala.
  (Los televisores por MCP llegaron en 0.8.0.)

## 0.5.0 · Bandeja de Windows y acceso para IA

- **Ícono en la bandeja**: abre Habita, activa escenas sin abrir la ventana y permite
  o quita el acceso para IA. Con la casa conectada (o la IA con acceso), cerrar la
  ventana deja Habita en la bandeja; se cierra del todo con **Salir de Habita**. Una
  segunda apertura muestra la ventana que ya estaba en la bandeja.
- **Acceso para asistentes de IA por MCP**, solo en este equipo y apagado al inicio.
  Se activa con **Permitir acceso para IA en este equipo** en el menú del ícono, y
  **Copiar configuración MCP** deja en el portapapeles el bloque para
  `claude_desktop_config.json` u otro cliente MCP (requiere Node.js instalado).
- Herramientas: `get_home`, `set_lights`, `set_air_conditioners` y `activate_scene`.
  La IA trabaja con habitaciones y objetos del plano, **nunca ve los identificadores
  de Home Assistant ni el token**. Cada orden pasa por el historial (se puede deshacer),
  la maqueta y la misma cola de envío que los controles de la app, y queda en el
  registro de eventos como `IA`.
- Seguridad: el puente escucha solo en `127.0.0.1`, exige un token aleatorio que se
  renueva en cada inicio y se borra al desactivar o salir, y rechaza peticiones de
  páginas web (`Origin`) y nombres de host distintos (rebinding de DNS).
  Herramientas inspiradas en house-control (MIT).
- Pendiente del punto 4: **Tuya / Smart Life por código QR**. Requiere una cuenta
  Smart Life y un equipo Tuya para probarlo; no se implementa a ciegas.

## 0.4.0 · Control en vivo y registro de eventos

- Al arrastrar un slider de una lámpara vinculada, la luz real sigue el gesto en vivo.
  Cada equipo tiene **una orden en curso** y al menos 150 ms entre órdenes; lo que cambia
  mientras tanto se fusiona en una sola orden con el último valor. Un arrastre completo
  cuesta unas pocas órdenes (5 en la prueba de punta a punta, frente a 27 sin fusionar).
- Mientras se arrastra, los ecos de las propias órdenes no mueven el control; al terminar
  la cola, la maqueta adopta el último estado que informó el equipo. Si una orden falla,
  se descarta lo pendiente, se avisa y se vuelve a leer el estado real.
- Los aires acondicionados no se controlan en vivo (cada orden les hace sonar un pitido):
  reciben solo el valor final al soltar.
- **Registro de eventos**: cada orden, su respuesta y su duración, y los cambios de
  conexión, en `%APPDATA%/habita-studio/events.log` (nunca contiene el token; al pasar
  de 512 KB conserva la mitad reciente). Se ve desde **Conectar tu casa real → Ver
  registro**.

## 0.3.0 · Enchufes, aires acondicionados y escenas

- **Enchufes** (`switch.*`): una lámpara puede vincularse a un enchufe inteligente;
  entonces solo enciende y apaga, y el panel lo indica.
- **Aire acondicionado**: nuevo objeto en *Climatización*. Se coloca contra el muro
  del fondo del espacio seleccionado, a 2 m. Su panel controla encendido, modo (frío,
  calor, seco, ventilar, auto), temperatura y ventilador; con un `climate.*` vinculado
  solo ofrece lo que el equipo admite y muestra la temperatura actual de la habitación.
  En la maqueta, un equipo encendido sopla un flujo de aire animado del color de su
  modo (estático con movimiento reducido; oculto en el plano 2D).
- **Escenas**: sin selección, el panel derecho permite guardar el estado de todas las
  luces y aires como una escena con nombre y activarla después. Las escenas viajan en
  el archivo `.habita` (referencian objetos, nunca dispositivos) y, al activarlas, los
  objetos vinculados envían el cambio a sus equipos reales. Cada activación es un solo
  paso de Deshacer.
- Al aire solo se le envían las llamadas que cambian algo (modo, temperatura,
  ventilador), en orden y ajustadas al rango y paso del equipo.

## 0.2.0 · Luces reales con Home Assistant

1. En Home Assistant: tu perfil → Seguridad → **Tokens de acceso de larga duración**
   → Crear token.
2. En Habita, pulsar el **enchufe** de la barra superior (o el indicador de la barra
   inferior), escribir la dirección (`http://homeassistant.local:8123`), pegar el
   token y pulsar **Conectar**.
3. Seleccionar una lámpara de la maqueta y elegir su **Luz real**. Desde ese momento
   la maqueta muestra el estado real (también si cambia desde un interruptor o una
   automatización) y los controles de la lámpara, del espacio y de toda la casa
   envían el cambio al soltar el slider.

Funcionamiento y seguridad:

- La conexión es la API WebSocket de Home Assistant y vive en el proceso principal
  de Electron; la interfaz nunca recibe el token ni abre conexiones de red.
- El token se guarda cifrado con la cuenta de Windows (`safeStorage`/DPAPI) en
  `%APPDATA%/habita-studio/home-assistant.json`. **Olvidar conexión** lo elimina.
- Las vinculaciones lámpara → `light.*` se guardan aparte del proyecto: no entran al
  archivo `.habita`, al historial ni al autoguardado.
- Solo se envían los atributos que cada luz admite (brillo, temperatura en kelvin o
  color RGB). Si un comando falla, se avisa y se vuelve a leer el estado real.
- Si se pierde la conexión, se reintenta sola (1 s a 30 s); un token rechazado no se
  reintenta. Deshacer no envía órdenes físicas: el estado real prevalece.
- Sin la app de escritorio (`npm run dev`), los controles de dispositivos se ocultan.
- `src/main.js` se dividió en módulos dentro de `src/app/` (hoy `src/ui/`): layout,
  biblioteca, inspector, barra contextual, historial, autoguardado y dispositivos. Los
  identificadores que vienen de un archivo `.habita` se escapan siempre antes de insertarse
  en la interfaz.

## 0.1.2 a 0.1.6 · Interfaz de vidrio, lámparas y sliders

En 0.1.6, todos los sliders usan el mismo carril ancho de vidrio, relleno suave
y tirador blanco redondeado de la referencia. El panel derecho muestra medidas
más legibles y permite escribir valores exactos sin las flechas nativas.
Los sliders conservan el foco al confirmar con teclado y Esc restaura también
el relleno visual del carril. Ambiente, calidez y lámparas comparten el diseño.

En 0.1.5, seleccionar una lámpara abre controles de encendido, intensidad,
blanco cálido/frío y color junto a la maqueta. Los cambios se ven al arrastrar;
se confirman al soltar y Esc cancela la previsualización. Cada gesto se puede
deshacer y la configuración se conserva en el archivo `.habita`.
Seleccionar una habitación muestra sus luces y permite encenderlas o apagarlas
en conjunto; sin selección, el panel derecho ofrece las luces de toda la casa.
Pulsar una luz en ese listado la selecciona y centra la cámara suavemente.
El enfoque respeta la preferencia de movimiento reducido.

Son controles de visualización del diseño, sin conexión a equipos reales.
La iluminación es aproximada: hasta 16 fuentes puntuales simultáneas,
priorizando la lámpara seleccionada; todas las pantallas conservan su estado
y resplandor. Las fuentes no simulan fotometría ni proyectan sombras propias.

En 0.1.4, seleccionar un mueble muestra una barra junto a la maqueta para
centrarlo, girarlo, duplicarlo o cerrar la selección. El botón **Ampliar maqueta**
oculta los paneles laterales y permite recuperarlos con el mismo botón.
**Sonido desactivado**, en la barra inferior, habilita sonidos suaves de selección,
edición y ambiente; la preferencia se recuerda localmente. El audio se sintetiza
en el equipo, sin archivos ni servicios externos. El recorrido oculta las acciones
de edición. Se conserva la interfaz de vidrio y las preferencias de ambiente.

En 0.1.3 la interfaz incorpora tarjetas de vidrio con reflejos y degradados,
un panel de ambiente plegable y presets Día, Acogedor, Cine y Noche. Sus sliders
de luz y calidez modifican la visualización y se recuerdan en este equipo.
Los sliders de dimensiones y posición ofrecen una previsualización mientras
se arrastran y guardan el cambio al soltar, con un solo paso de Deshacer.
Los campos numéricos siguen disponibles para medidas exactas.

La versión 0.1.2 incorpora bordes redondeados, materiales locales de tela y madera,
sombras suaves, iluminación ambiental y resplandor en las lámparas. El efecto
visual se aplica en maqueta y recorrido; el plano 2D mantiene una representación
directa con cuadrícula. Las transiciones respetan la preferencia de movimiento
reducido de Windows. Las luces Día/Noche afectan a la visualización, no a equipos
reales.

## 0.1 · Primera versión

33 entradas de catálogo con modelos paramétricos propios, varios tamaños
predefinidos y dimensiones editables. Incluye muebles de living, dormitorio,
cocina, comedor, baño, estudio, decoración, iluminación, climatización, puertas y
ventanas.

Las comprobaciones actuales detectan superposición entre cajas orientadas de
objetos y si sus esquinas quedan fuera de las habitaciones. No comprueban todavía
intersecciones precisas de mallas, colisiones con paredes, barridos de puertas,
circulación, instalaciones, estructura o normativa. Los tamaños del catálogo son
ejemplos editables, no fichas de fabricantes. Los muebles se redimensionan en su
conjunto; no todas las proporciones constructivas se mantienen al deformarlos.

Todavía no se incorporan plantas múltiples, techumbres ni importación GLB.
Las escenas Día/Noche cambian la iluminación visual del editor. Las luces reales
se controlan mediante Home Assistant (ver 0.2.0); el resto de la domótica está en
[docs/ROADMAP.md](docs/ROADMAP.md).
