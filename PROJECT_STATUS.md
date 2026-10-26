# Estado y continuidad de InvestmentChecker

## Cambio 2026-10-26 — Lotes de propuestas según exposición objetivo v2.8.32

- El usuario reiteró que InvestmentChecker debe generar las siguientes propuestas para el tramo final del Reto Actinver, con el objetivo de exposición previamente acordado de 60–70 % (centro de cálculo: 65 %).
- Se sustituye el antiguo tope por lote de min(10 % del efectivo, 8 % del patrimonio) por min(poder de compra, 20 % del patrimonio, diferencia a la exposición del 65 %). Hasta cinco propuestas por lote y hasta 5 % del patrimonio en cada posición nueva, sujetas a títulos enteros, liquidez y filtros existentes.
- La diferencia hacia la meta descuenta inversiones verificadas y saldos sin liquidar; si ya alcanza 65 %, el sistema detiene nuevas propuestas de compra con estado `TARGET_REACHED`.
- El popup explica la meta, exposición comprometida, diferencia y presupuesto por lote, y recuerda verificar órdenes realmente ejecutadas y actualizar la cartera antes de generar otro lote.
- Se conservan por completo la copia manual, la aprobación explícita, la prohibición de autollenado/envío de órdenes y las caducidades de precios y cartera. La versión publicada y la instalada se verifican por separado.
- Publicación validada: commit `6580bcc710c71a2a59c87d3087d5005499f4aae1`, GitHub Actions `40385311947` finalizado correctamente, paquete `browser/investmentChecker-brave-v2.8.32.zip` publicado y control remoto `latest_version=2.8.32`. Pruebas de empaquetado: 21/21 correctas; las pruebas heredadas `test_manual_sync_recovery.js` y `test_sync_fast_ack.js` siguen fallando fuera del workflow, como antes del cambio. Falta verificación de instalación y propuestas reales en Brave.

## Cambio 2026-10-26 — Restaurar popup clásico v2.8.31

- Por solicitud del usuario se revierte **solo** la ventana independiente introducida en 2.8.30.
- La barra de Brave vuelve a abrir `popup.html` como popup nativo, que se cierra al perder el foco, exactamente como en 2.8.29.
- Se elimina el manejador de ventanas persistentes del service worker. No se alteran las rutas de cotizaciones, cartera privada, propuestas ni las restricciones de copia manual.
- Causa del fallo observado en 2.8.30: la ventana independiente quedaba enfocada y `tabs.create` usaba su ventana predeterminada, incompatible con `openerTabId` perteneciente a la ventana de Actinver. Resultado: `Tab opener must be in the same window as the updated tab`, 0/226 instrumentos.
- Prueba de regresión `tests/test_classic_popup.js`: verifica la configuración nativa y ausencia de la apertura de ventana independiente.
- La publicación se valida mediante `.github/workflows/package-extension.yml`; la instalación y sincronización reales en Brave son comprobaciones separadas.

## Cambio 2026-10-25 — Panel persistente v2.8.30

- La acción de la barra de Brave abre `popup.html` en una **ventana independiente y redimensionable** de 440 × 720, en vez de un popup que se cierra al cambiar de foco.
- Un segundo clic recupera y enfoca la ventana existente en lugar de duplicarla.
- El contenido y las restricciones de propuestas/copia manual no cambian. No se ejecutan ni se rellenan órdenes.
- No hay modo «siempre encima»: el usuario puede acomodar la ventana al lado de Actinver usando Windows.
- Prueba `tests/test_persistent_panel.js` comprueba creación y reutilización. Publicación/instalación local deben validarse por separado.

## Cambio preparado — 25 de octubre de 2026

- Versión de código **2.8.29**, pendiente de publicación/instalación hasta confirmar GitHub Actions y Brave.
- Popup reducido a tres acciones principales: sincronizar, generar propuestas, preparar datos para copiar (esta última aparece solamente al seleccionar propuestas vigentes).
- Cuando la generación normal rechaza cotizaciones o cartera caducadas, se ofrece automáticamente una **simulación histórica**, etiquetada y sin opción de aprobación ni copia operativa.
- No se alteraron los límites temporales de las propuestas vigentes, ni se habilitaron operaciones automáticas.
- Pruebas específicas Node: `test_order_preflight`, `test_order_copy_only`, `test_popup_progress`, `test_worker_boot`, `test_stable_collector_contract`, todas correctas en la sesión de desarrollo.
- Pruebas antiguas ajenas al empaquetado actual `test_manual_sync_recovery` y `test_sync_fast_ack` fallan por expectativas del anterior mecanismo manual; requieren revisión independiente.

Última revisión documental: 2026-10-25 (hora de México).
Repositorio: `youteachtk/investmentChecker`, rama `main`.

## Fuente de verdad

1. La versión **publicada en GitHub** se obtiene de `browser/brave-extension/manifest.json`, cotejada con los commits de publicación.
2. La versión **instalada en Brave** se confirma por separado. Nunca se presume que una publicación ya se instaló.
3. Una prueba automatizada no equivale a una prueba real dentro de la sesión de Actinver.
4. Antes de cada nueva sesión, leer este archivo y los commits recientes; no reconstruir el estado solo con recuerdos de chat.
5. Registrar aquí cada decisión, cambio, comprobación, bloqueo y próximo paso, con fecha y referencias a commits. Nunca anotar credenciales, tokens, datos personales o detalles privados de la cartera en este repositorio público.

## Estado confirmado al 25 de octubre de 2026

- **Versión publicada en el repositorio: 2.8.28** (manifiesto `browser/brave-extension/manifest.json`).
- Commit de versión: `bde4b7871eee678354ce9be9f2439fec60ae28e2`: preparación de propuestas de compra con copia manual, sin automatización de formularios.
- Commit de empaquetado más reciente consultado: `87db9d64641c35a30fbc5228408724384f82cd4c`.
- La versión instalada en Brave **no ha sido verificada en esta sesión**.
- Antes se verificó la conciliación de posiciones, movimientos y órdenes programadas; esos resultados históricos no deben presentarse como estado en tiempo real.
- Las propuestas deben calcular emisora, títulos y precio límite sin favorecer de forma fija a Visa ni a otra emisora.
- Las propuestas permiten copiar datos manualmente; no deben introducir datos en el formulario del bróker ni enviar órdenes.
- Hay pruebas de regresión y controles del empaquetado para el flujo de copia manual (commits `bdea3434c323a92ce10bae66a48456a3458bcbb6` y `8e5e6c3220a3a7ff3a98486ca77bf56fd6856d38`).

## Restricciones y decisiones del proyecto

- Operaciones bursátiles solo con autorización explícita; no ejecutar compras por iniciativa del asistente.
- Mantener separadas las cotizaciones públicas, los cálculos de propuesta y los datos privados de Actinver.
- No autollenar ni accionar formularios del bróker mediante scripts/macros.
- Para actualizar la extensión en Windows, se acordó un **único ejecutable reutilizable**, activado manualmente cuando se necesite: sin monitoreo, sin tareas programadas, sin obligar a descargarlo repetidamente.
- No modificar funcionalidad o método de instalación sin explicar la decisión y obtener autorización cuando implique cambiar los acuerdos.
- Trato impersonal: no utilizar nombres ni apelativos para dirigirse al usuario.

## Pendientes verificables

- Comprobar en Brave cuál versión está realmente instalada y si el actualizador manual reutilizable sigue funcionando según lo acordado.
- Validar en la UI instalada los controles de copiar emisora, cantidad y precio límite.
- Verificar caducidad/actualidad de cotizaciones y que una propuesta obsoleta no pueda presentarse como ejecutable.
- Confirmar mediante pruebas de regresión que no hay automatización de la ruta de órdenes del bróker.
- Registrar resultados y próximos pasos tras cada comprobación.

## Bitácora

### 2026-10-25 — Recuperación del estado y regla de documentación

- Se cotejó directamente el repositorio GitHub después de detectar discrepancias en resúmenes conversacionales.
- Se confirmó la versión de **código publicado 2.8.28** con su manifiesto y commits.
- Se estableció que toda continuación del proyecto debe documentarse en GitHub, sin asumir equivalencia entre publicación e instalación local.
- **Próximo paso:** verificar instalación local y comportamiento de la interfaz de propuestas antes de declarar completada la versión.
