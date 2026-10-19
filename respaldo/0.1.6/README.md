# Habita Studio

Primera versión de un editor de casas para Windows, con vista de maqueta 3D y
plano superior sincronizados. Funciona localmente y no requiere cuentas ni APIs.

## Abrir

Usar el ejecutable de `release/` cuando esté disponible. Para desarrollo:

```powershell
npm install
npm run desktop
```

`npm run dev` abre un servidor de prueba local. `npm run pack:win` genera una
aplicación portable de Windows. El primer uso de Electron descarga su runtime.

## Uso

- En **Objetos**, hacer clic en un mueble para incorporarlo al proyecto.
- Seleccionarlo y arrastrarlo en el plano o la maqueta para moverlo.
- Editar medidas, posición, elevación y color en el panel derecho; confirmar con
  **Aplicar cambios** o Enter. Las medidas se expresan en metros.
- Las variantes del catálogo cambian varias dimensiones juntas.
- En **Espacios**, dibujar una habitación indicando dos esquinas. Las habitaciones
  son rectangulares y pueden compartir paredes; no pueden superponerse.
- Para editar un piso, seleccionar su habitación y pulsar **Editar piso en plano
  2D**. Arrastrar el suelo o el control **Mover piso** para trasladarlo y los ocho
  tiradores de sus bordes para redimensionarlo. Las medidas se actualizan en vivo;
  Esc cancela el gesto y Deshacer revierte el arrastre completo.
- **Mover los muebles con el piso** permite transportar su mobiliario. Al cambiar
  las dimensiones del piso, los muebles conservan su tamaño y posición; las
  aberturas exteriores siguen sus paredes. Las aberturas compartidas permanecen
  con la habitación vecina. El ajuste de 10 cm también acerca bordes coincidentes.
- Las puertas y ventanas se insertan en la pared compatible más cercana. Con
  paredes completas se observan los huecos, antepechos y dinteles.
- En **Materiales**, elegir un acabado para la habitación u objeto seleccionado.
- Guardar un archivo `.habita` y volver a abrirlo desde la barra superior.
- El autoguardado conserva el último proyecto en este equipo y perfil de usuario.
- Deshacer con Ctrl+Z, rehacer con Ctrl+Y, girar un objeto con R y eliminar con Supr.
- Rotar la cámara arrastrando un espacio libre; desplazar con el botón derecho;
  acercar o alejar con la rueda. La cámara superior permite editar el plano.
- **Recorrido** permite caminar con WASD y mirar con el mouse. Pulsar **Entrar al
  recorrido** para capturar el mouse; Esc lo libera. Shift aumenta la velocidad.
  Las unidades son las mismas del proyecto (metros), con ojos a 1,65 m. El recorrido
  también admite **Recorrer con cursor libre**, con WASD y arrastre para mirar.
  muestra paredes completas y puertas abiertas, y bloquea paredes y cajas de
  muebles mediante un cuerpo de 40 cm de ancho. No simula escaleras ni desniveles.

## Alcance de la versión 0.1

32 entradas de catálogo con modelos paramétricos propios, varios tamaños
predefinidos y dimensiones editables. Incluye muebles de living, dormitorio,
cocina, comedor, baño, estudio, decoración, iluminación, puertas y ventanas.

Las comprobaciones actuales detectan superposición entre cajas orientadas de
objetos y si sus esquinas quedan fuera de las habitaciones. No comprueban todavía
intersecciones precisas de mallas, colisiones con paredes, barridos de puertas,
circulación, instalaciones, estructura o normativa. Los tamaños del catálogo son
ejemplos editables, no fichas de fabricantes. Los muebles se redimensionan en su
conjunto; no todas las proporciones constructivas se mantienen al deformarlos.

Todavía no se incorporan plantas múltiples, techumbres, importación GLB ni
conexión a dispositivos reales. Las escenas Día/Noche cambian la iluminación
visual del editor. La domótica solicitada está guardada en `ROADMAP.md`.

## Implementación y verificación

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

JavaScript, Three.js, Vite y Electron con renderer aislado. El catálogo y todos
los recursos necesarios están incluidos en el paquete. Los archivos de proyecto
se validan antes de reemplazar el estado; los diálogos de archivos nativos se
exponen mediante dos operaciones específicas del preload.

`npm test` comprueba serialización, dimensiones, deduplicación de paredes,
aberturas y colisiones orientadas. `npm run build` verifica el bundle.

Referencias investigadas y ampliaciones previstas: `ROADMAP.md`.
