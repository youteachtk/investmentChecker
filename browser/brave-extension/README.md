## v2.3.0 — Pestañas por posición, datos por transición (20/oct/2026)

Se sustituyó el reconocimiento por nombres por una máquina de estados basada en la interfaz:

- Reconoce la barra de tres pestañas por `role=tablist` o por estructura/disposición horizontal; usa posiciones 1, 2 y 3, sin comparar los textos de las pestañas.
- Comprueba que **cambien los identificadores de las filas de la tabla** después de cambiar pestaña/página; los cambios de precio por sí solos no cuentan. Se apoya además en estado seleccionado visible, cuando Actinver lo ofrece.
- Detecta la página por botones numéricos y un contador de filas; rechaza páginas duplicadas y aborta si no hay exactamente 145 acciones, 56 ETFs y 25 fondos.
- La **validación final del catálogo** sigue en GitHub Actions, no en el código de captura de Brave: GitHub comprueba que los 226 instrumentos recibidos pertenecen al universo autorizado, antes de publicar las cotizaciones.
- La cartera privada continúa independiente de los retrasos de tablas públicas. Ninguna función compra ni vende valores.

Pruebas: un simulador de DOM verifica cambio de pestañas demorado, avance de páginas, y 226 instrumentos con símbolos ficticios; una prueba estática impide volver a depender de nombres específicos. Falta validación sobre la sesión real de Brave después de actualizar.

## v2.2.2 — Corregido fallo ETFs y lectura de cartera independiente (20/oct/2026)

El monitor puede tardar más de 18 segundos en actualizar la tabla de ETFs aunque el botón de ETFs ya esté seleccionado. El recolector ahora concede hasta 60 segundos en cambios de categoría y reintenta el botón automáticamente mientras mantiene la comprobación exacta de primera emisora por categoría; NO acepta acciones como ETFs y solo publica la captura pública si los 226 instrumentos están completos.

La lectura privada empieza al mismo tiempo que la de cotizaciones, no al finalizarla: un fallo de ETFs o del token público no bloquea el intento de leer saldo y posiciones. La navegación por "Tu inversión" espera a que React presente el menú y la tabla; no requiere cambiar de pestaña manualmente. Mensajes de estado separados reflejan éxitos y fallos reales.

Los tokens que ya aparecen guardados/verificados se preservan al actualizar la misma carpeta de la extensión. La extensión nunca ejecuta operaciones, ni coloca órdenes, y solo transmite información de cartera a un repositorio comprobado como privado. La navegación automática aún debe validarse contra la sesión de Brave del usuario.

## v2.2.0 — Una sola sincronización, instalación estable (19/oct/2026)

**Ya no hay dos paneles ni dos botones de captura.** La ventana tiene un único botón **Sincronizar todo ahora** y un solo estado. Tokens y diagnóstico permanecen dentro de **Configuración y diagnóstico** (plegado). Conserva las llaves `githubToken`, `privateToken`, `privateRepo` y `privateEnabled` guardadas por v2.1: **no las pide otra vez**.

**Automático:** al abrir Actinver en Brave con la sesión activa, y aproximadamente cada 30 minutos mientras continúe abierto, InvestmentChecker intenta sincronizar las 226 cotizaciones públicas y la cartera privada. Las solicitudes de ChatGPT a GitHub activan el mismo proceso unido. Si no hay una pestaña de Monitores, abre una temporal en segundo plano. Tras enviar cotizaciones, intenta leer saldo y localizar las posiciones usando un segundo tab temporal, navegando únicamente por controles de inversión/portafolio; al terminar lo cierra. Nunca opera, compra ni vende ni accede a contraseñas o números de cuenta.

**Instalación consistente:** descarga `browser/investmentChecker-brave-v2.2.0.zip` y extráelo. Dentro hay siempre **`investmentChecker/`**, **`ACTUALIZAR.cmd`** y **`ACTUALIZAR.ps1`**. Ejecuta `ACTUALIZAR.cmd` en Windows; intenta localizar la carpeta de extensión instalada en las Preferencias de Brave o, si no es posible, solicita que la selecciones una única vez. Copia automáticamente los archivos verificados SIN eliminar la extensión y SIN modificar sus tokens. Por seguridad Brave requiere recargar la extensión una vez en `brave://extensions`; GitHub por sí solo no actualiza extensiones desempaquetadas.

**Privacidad:** 226 cotizaciones al repositorio GitHub público ya existente. Saldos y posiciones solamente a `youteachtk/investmentChecker-private`, que debe permanecer `private:true`. Se verifica privacidad con token local antes de subir cualquier dato. Si no hay un token privado validado o no puede leerse con certeza la tabla de posiciones, NO publica datos privados ni inventa posiciones.

**Validación pendiente:** los cambios de React y la navegación por el menú «Tu inversión» deben probarse en la sesión real: una comprobación estática no demuestra que la extracción de posiciones vaya a funcionar en todas las pantallas. En ese caso la extensión informa cartera pendiente, pero las cotizaciones públicas siguen funcionando.

## v2.1.0 — cartera privada separada de cotizaciones públicas (19/oct/2026)

El repositorio `youteachtk/investmentChecker` es PÚBLICO y sigue conteniendo solamente cotizaciones públicas de 226 instrumentos. No se almacena aquí información de cuenta.

**Instalación:** descarga `browser/investmentChecker-brave-v2.1.0.zip` (se empaqueta automáticamente en Actions). Descomprime los archivos directamente sobre la MISMA carpeta ya cargada en Brave; no anides subcarpetas. Abre `brave://extensions`, pulsa **Recargar** y comprueba que la versión sea 2.1.0. Reutilizar la carpeta conserva el token público. La extensión instalada no se actualiza automáticamente con un commit de GitHub.

**Configuración privada (una vez):**
1. Crea en GitHub un segundo repositorio **Private**, por ejemplo `youteachtk/investmentChecker-private`. Inicialízalo con README para que tenga rama `main`. No cambies su visibilidad a Public.
2. En GitHub crea un **segundo** fine-grained PAT con acceso únicamente a ese repositorio privado y permiso **Contents: Read and write**. Es diferente del token público de Actions. Nunca lo pegues en ChatGPT, en capturas, en GitHub público ni en las herramientas de desarrollo.
3. En el popup de InvestmentChecker, introduce `owner/repo` y ese token en **Cartera privada → Verificar y activar**. La extensión consulta la API GitHub para confirmar `private:true` y verifica otra vez esa condición **antes de cada envío**. Un repo público queda bloqueado.
4. Abre **Monitores** (para el resumen) y **Tu inversión** / la pantalla donde Actinver muestra la tabla de posiciones (para las emisoras y cantidades). En cada vista la extensión intenta capturar los datos automáticamente al cargar o cambiar de página. Puedes pulsar **Capturar la cartera de esta pestaña** para forzarla. Se necesitan ambas partes con antigüedad menor a 30 minutos; de otro modo no se sube nada.
5. Verifica en el repositorio PRIVADO el archivo `actinver/portfolio-latest.json`. Para que ChatGPT pueda consultarlo necesitarás autorizar al conector GitHub para ese repositorio privado.

**Campos permitidos:** `total_value`, `investments`, `buying_power`, `unsettled`, `change_mxn`, `change_pct`, y tabla de símbolos, cantidades, costo/valuación/precio si la página ofrece esas columnas. Se descartan contraseñas, cookies, nombre del titular, números de cuenta, órdenes y folios. La copia parcial se mantiene solamente en `chrome.storage.local` hasta completar ambas partes.

**Limitación todavía por validar:** el DOM de la vista «Tu inversión» puede variar. Si no hay tabla con cabeceras reconocibles (emisora/símbolo y títulos/cantidad), la extensión NO inventa posiciones y NO sube el snapshot. Hará falta adaptar el parser usando un diagnóstico de cabeceras no sensible. No se ejecutan compras ni ventas.

## v2.0.0 — Sincronización a petición desde ChatGPT

Esta versión permite iniciar una **captura de cotizaciones públicas** con una orden desde ChatGPT: el asistente escribe un comando corto y con vencimiento de cinco minutos en `browser/remote-request.json` del repositorio. Brave comprueba ese archivo aproximadamente cada 30 segundos usando `remote.js` y, si Actinver → Monitores está abierto y la sesión sigue iniciada, captura 226 instrumentos y envía los datos mediante GitHub Actions. El asistente comprueba el resultado validado y propone compras o ventas para aprobación del usuario; no ejecuta operaciones. No funciona con Brave cerrado. El tiempo total incluye polling, extracción y GitHub Actions; no es instantáneo al segundo.

**Actualizar una sola vez:** extraer el ZIP v2.0.0 en la misma carpeta que usa `brave://extensions`, reemplazando los archivos y **añadiendo `remote.js`**. Recargar y verificar que tanto ficha como panel indiquen v2.0.0. El token permanece local. El interruptor «Desactivar solicitudes desde ChatGPT» permite suspender esta función sin afectar sincronización manual. Solo se aceptan `action=capture_public_quotes` y solicitudes nuevas; ninguna orden de ejecución financiera ni información privada se sincroniza. No se garantiza rentabilidad ni ventaja sobre otros participantes.

## v1.5.0 — confirmar la categoría antes de leerla

Corrige un error reproducido en el monitor: al hacer clic en ETFs, Actinver podía actualizar un precio de ACCIONES antes de cargar realmente la tabla de ETFs; el recolector anterior aceptaba cualquier cambio de tabla y fallaba con `esperaba AAXJ, aparece AA1`. Ahora espera a que la primera emisora sea exactamente la esperada, la verifica durante varias observaciones y comprueba que la paginación haya cambiado los datos, no solo su indicador. Una prueba con tablas simuladas y cambios de precios previos capturó los 226 instrumentos sin error. Este ZIP no se ha validado aún con el monitor real del usuario.

**Actualizar**: extrae los cinco archivos directamente en la carpeta cargada por Brave y reemplázalos; no crees una carpeta anidada. En `brave://extensions` pulsa Recargar. La ficha y el popup deben mostrar **v1.5.0**; versiones mezcladas significan que se actualizó una carpeta distinta. Conserva la carpeta cargada para preservar el token.

## v1.4.0 — solución a «Comando no reconocido»

Tras actualizar una extensión unpacked, Brave puede ejecutar un `popup.js` nuevo mientras mantiene el service worker anterior. El ZIP 1.3.0 contenía DIAGNOSE, pero la captura del usuario muestra que el worker estaba desactualizado. En esta versión los botones de diagnóstico e inicio de sincronización consultan pestañas e inyectan el recolector **directamente desde el popup** (sin mensajes START_SYNC/DIAGNOSE al worker); el worker sigue recibiendo PROGRESS/COLLECT_DONE y publicando las cotizaciones en GitHub. Pruebas unitarias locales pasaron con y sin pestaña Actinver, y con worker simulado que responde «Comando no reconocido». La extensión no está validada todavía con la sesión real del usuario. Conservar carpeta para mantener token, extraer el ZIP actualizado y pulsar Recargar en `brave://extensions`.

## v1.3.0 — permiso de pestañas y diagnóstico

En Brave la versión 1.2.0 podía informar cero pestañas de Actinver porque no declaraba el permiso `tabs`. La versión 1.3.0 lo declara explícitamente, busca entre las pestañas sin filtrar por URL previamente y añade el botón **Diagnosticar pestaña de Actinver** que muestra cantidad de pestañas, cuántas corresponden a Actinver y el permiso del sitio, sin mostrar URL privadas de otras pestañas. Descarga el ZIP v1.3.0 desde la conversación, extrae sobre la misma carpeta, recarga la extensión y conserva el token ya guardado. Si el fallo continúa, comparte únicamente el diagnóstico; no compartas el token.

## v1.2.0 — Brave tab discovery fix

Earlier code incorrectly used `currentWindow`, which Brave can resolve to the extension popup instead of the Actinver window. Now the background process queries the permitted Actinver tab across windows. The popup displays its version and detects mixed/stale versions. Update files inside the same unpacked-extension directory and click **Reload** in `brave://extensions`. The existing token stays in the same extension storage. The installation ZIP is available in the associated ChatGPT conversation.

## Update 2026-10-16 — Brave v1.1.0

If v1.0.0 seemed unresponsive, overwrite the files in the SAME installed extension folder and click **Reload** in `brave://extensions`. Version 1.1.0 displays the token state, acknowledges sync immediately, reports progress and errors, and strips Actinver's info icon from symbols. Keep the same extension folder to preserve the locally stored GitHub token. Download the versioned ZIP from the ChatGPT conversation.

# Brave native extension — investmentChecker

Direct Manifest V3 extension for Brave; it does **not** use Tampermonkey or Work.

Source files: `manifest.json`, `popup.html`, `popup.js`, `background.js`, `collector.js`.

## Install

1. Download the packaged ZIP provided in the ChatGPT project conversation or download these five source files in a local directory.
2. Open `brave://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the folder containing `manifest.json`.
3. Open Actinver → Monitores (`https://retoactinver.com/RetoActinver/#/capitales`).
4. Open the **investmentChecker · Actinver** extension popup; paste your previously generated repository-scoped GitHub fine-grained token with Actions Read and write, then click **Guardar token**. Do not share the token in chat.
5. Click **Sincronizar las 226 cotizaciones**. Keep the page open until the extension reports it sent the capture.
6. Verify a successful workflow run at `https://github.com/youteachtk/investmentChecker/actions/workflows/ingest_quotes.yml`. An API acknowledgement is not proof the workflow validated and saved the data.
7. Optionally activate 30-minute auto sync while Actinver Monitores is open in an active tab.

## Privacy, permissions and controls

- Uses only storage, scripting, alarms, and site permissions for `retoactinver.com` and `api.github.com`.
- Collector reads only displayed public market tables (symbols, last price, variation, bids/asks, visible depth). It does not collect cookies, account numbers, orders, portfolio or cash balance.
- Local extension storage contains the GitHub Actions token and sync settings. The token is sent only to GitHub's API, never included in the uploaded snapshot.
- The snapshot is saved in a **public** GitHub repository. Do not add private account information.
- No trading is performed, and no programmatic investment/order authorization is implemented.
- Backend validates exactly 145 ACCIONES, 56 ETFs, and 25 FONDOS and rejects stale, malformed, duplicated or mismatched captures.
- The extension has not been end-to-end verified against a live authenticated Actinver session. If it reports an error, do not assume it succeeded. Validate the actual GitHub workflow status.
- Quote freshness can change in seconds; recheck bid/ask and depth at decision time.
- If Actinver changes DOM layout or ticker catalog, update the collector and validation rules rather than bypassing validation.

Other script: the earlier Tampermonkey `browser/actinver-investmentchecker.user.js` may be disabled; it is not required for this extension.
