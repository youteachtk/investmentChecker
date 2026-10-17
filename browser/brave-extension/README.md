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
