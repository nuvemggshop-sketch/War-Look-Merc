# FPV Tactical Ops - Simulador Web de Dron FPV

Simulador 3D en primera persona (FPV) ambientado en un entorno de guerra moderno desarrollado con **Three.js**, **HTML5/CSS3** y **Web Audio API**.

## Cómo ejecutar el proyecto
1. Crea la estructura de carpetas exactamente como se indica y guarda cada archivo en su ubicación correspondiente.
2. **Ejecución directa:** Haz doble clic sobre `index.html` para abrirlo en cualquier navegador moderno (Chrome, Edge, Firefox, Brave). No requiere servidor local ni instalación de dependencias, ya que carga Three.js desde CDN y evita bloqueos CORS.
3. *(Opcional)* Si deseas usar un servidor local: `npx serve .` o la extensión *Live Server* de VS Code.

## Controles
### Teclado + Ratón
- **W / A / S / D:** Desplazamiento horizontal
- **Espacio / Shift:** Ascender / Descender
- **Ratón (clic en pantalla para bloquear puntero):** Orientación libre FPV
- **Clic Izquierdo / F:** Disparar proyectil táctico
- **E / Ctrl:** Turbo (consume batería rápidamente)

### Mando PS4 / DualSense
Conecta el mando por USB o Bluetooth y pulsa cualquier botón en la pantalla inicial para que el navegador lo detecte automáticamente:
- **Stick Izquierdo:** Movimiento horizontal
- **Stick Derecho:** Cámara FPV (Yaw / Pitch)
- **R2 / L2:** Subir / Bajar altitud
- **R1 / Cuadrado:** Disparar
- **Cruz (X):** Turbo

## Reserva de drones
Dispones de **8 drones FPV kamikaze** por partida. El HUD muestra la reserva con iconos y el contador `DRONES`, y el informe final incluye cuántas unidades se han usado. Cada dron destruido obliga a volver a la trinchera y lanzar manualmente el siguiente.

## Escuadrón amigo
Tu escuadrón de 4 soldados aliados (Ríos, Vega, Méndez y Torres) combate a tu lado con una máquina de estados táctica:

- **PATRULLA:** vigilan el perímetro y escanean el horizonte.
- **COMBATE:** priorizan a los mercenarios que te están apuntando y disparan en ráfagas con compensación de caída.
- **CUBIERTO:** si reciben fuego, retroceden a su cobertura, se agachan y regeneran salud.
- **CAÍDO:** si los derriban, quedan en el suelo y se reincorporan al frente tras unos segundos.
- Emiten **callouts de radio** en el killfeed ("¡Contacto!", "¡Enemigo a la vista!").
- **El escuadrón conserva su estado entre drones:** salud, bajas y posiciones no se reinician cuando pierdes una unidad.
- El panel **ESCUADRÓN AMIGO** muestra su estado en tiempo real y los amigos aparecen marcados en verde en el radar.

## IA enemiga y leyes de la física
Los mercenarios ya no disparan a través de obstáculos:

- **Línea de visión real:** antes de abrir fuego comprueban terreno, ruinas, torres y sacos de arena. Si un muro se interpone, no disparan.
- **Memoria de objetivo:** si pierden la visión, avanzan y flanquean la última posición conocida.
- **Ráfagas tácticas:** agrupan disparos, predicen tu movimiento y compensan la caída de la bala.
- **Cobertura:** se agachan al recibir fuego cercano o cuando están heridos.
- **Refuerzos:** tras el primer minuto llegan nuevos contactos desde el norte.
- **Física de proyectiles:** las balas tienen gravedad real (`9.8 m/s²`), trazadoras orientadas y colisión por segmento contra terreno y muros (no atraviesan paredes finas).
- **Muerte animada:** los cuerpos caen, se deslizan y se retiran de la escena.

## Gráficos y ambiente
- Cielo con degradado de atardecer, montañas de silueta, ceniza ambiental y humo.
- Sombras suavizadas, tone mapping ACES y luces de fuego/reflectores móviles.
- Destellos de disparo, ondas expansivas, chispas de impacto y sacudida de cámara.
- HUD con tipografías tácticas (Orbitron, Rajdhani, Share Tech Mono), radar con barrido, animación de puntuación y alertas de batería crítica.

## Trinchera y lanzamiento
Cuando pierdes un dron, la cámara pasa a la trinchera y la batalla continúa a tu alrededor:

- Puedes **mirar alrededor con el ratón** mientras esperas.
- El lanzamiento no es automático: pulsa el botón **LANZAR SIGUIENTE DRON FPV** o las teclas **Espacio / Enter / F** cuando estés listo.
- El escuadrón sigue disparando y recibiendo fuego mientras decides.
- El HUD oculta la telemetría del dron destruido (crosshair, batería y radar) y conserva el panel del escuadrón y el estado de la misión.

## Condiciones de Victoria
1. Destruir los **6 objetivos estratégicos** marcados con balizas rojas (disparando o impactando contra ellos).
2. Sobrevivir al menos **02:00 minutos** en la zona de combate.
3. Volar hacia el **haz luminoso verde (Zona de Extracción)** una vez cumplidos los dos puntos anteriores.