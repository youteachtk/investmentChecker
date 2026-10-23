## v2.8.7 — recarga automática de Brave tras actualización local

El actualizador de Windows sigue descargando y copiando los archivos publicados. La extensión activa detecta un manifest.json de versión posterior en disco mediante lectura local, espera al menos un minuto para evitar una copia incompleta y, si no está sincronizando, llama a chrome.runtime.reload(). Desde la primera activación de v2.8.7, esta función elimina la necesidad de pulsar Recargar en actualizaciones posteriores, siempre que el actualizador local esté activo. No cambia ni ejecuta compras; la inspección de V sigue siendo de solo lectura. Si Brave mantiene en memoria una versión más antigua que v2.8.7, no puede activar esta funcionalidad desde GitHub sin una recarga inicial.

## v2.8.6 — inspección guiada de un formulario real (23/oct/2026)

El botón de inspección ahora busca la fila de Visa (V) en Capitales dentro de una pestaña temporal. Únicamente abre el menú «Comprar o vender» y, si encuentra una opción «Comprar» inequívoca dentro de un menú de compra/venta, abre ese formulario sin completar ni enviar órdenes. Identifica de manera estructurada controles de cantidad, precio, tipo y vigencia; no captura valores, números de cuenta ni saldos. Guarda únicamente resultado y tipos de controles en `actinver/order-ui-probe.json` del repositorio privado. Si un control es ambiguo detiene la prueba; si el formulario no se abre registra su etapa exacta. Nunca pulsa enviar, confirmar o finalizar. No se ha validado aún contra una sesión autenticada real; el envío automático de órdenes sigue deshabilitado.

## v2.8.5 — cotizaciones independientes de la cartera (23/oct/2026)

El recolector de 145 ACCIONES, 56 ETFs y 25 FONDOS y el envio al workflow publico permanecen iguales a la version verificada. Se corrige el acoplamiento de arranque: antes, las cotizaciones esperaban a que finalizara la lectura de cartera privada; si GitHub privado o la navegacion fallaba, el popup podia quedar eternamente en "trabajando". Ahora la captura publica comienza en su propia pestaña temporal de Brave inmediatamente y la cartera privada se lee en paralelo desde la pestana original, sin modificarla. No se ejecutan operaciones. Prueba nueva: la lectura privada queda deliberadamente suspendida mientras debe arrancar la publica.

## 2.8.4 — Captura probada protegida, mejoras 2.8 separadas (23/oct/2026)

**Restauración selectiva sin retroceder de versión:** `collector.js` es idéntico bit a bit al de la 2.7.1 que logró entregar las 226 cotizaciones en la sesión real de Brave. En `background.js` las funciones de captura, navegación aislada, gestión de pestañas y `startSync` son exactamente las mismas que en 2.7.1; se restauró la comunicación directa `START_SYNC`. Se retiró del arranque la cola/alarmas experimentales de 2.8.3, responsables de la complejidad que impedía confirmar la ejecución. Ya no se altera la captura para mostrar un indicador de progreso: el popup **calcula el progreso** a partir de los mensajes habituales de Capitales (Acciones 145, ETFs 56 y Fondos 25). La versión 2.8.4 mantiene el aspecto de la serie 2.8, la verificación de GitHub y los controles para propuestas, lotes y revisión de operaciones, sin activar el envío de órdenes.

Se conservó una copia comprobable en `tests/fixtures/verified_2_7_1_*.js.txt`; `test_stable_collector_contract.js` impide modificar la secuencia de captura y el lector sin romper CI. `test_worker_boot.js` prueba el servicio completo con el arranque directo, y `test_popup_progress.js` verifica Acciones → ETFs → 226 a partir de mensajes del recolector original. El empaquetado ejecuta además las pruebas de saldo privado, navegación, ejecución aislada, finalización del frame, borradores de compra y revisión sin clics.

**Importante:** GitHub confirmó las pruebas unitarias/integradas y el empaquetado, pero una nueva captura real de la 2.8.4 aún debe verificarse en Brave. Los tokens siguen en el almacenamiento de la extensión, siempre que el usuario actualice sobre la misma carpeta y no la elimine. La aprobación del lote no realiza compras ni ventas.

## v2.8.3 — Recuperación de inicio en Brave (23/oct/2026)

Corrige el bloqueo de la 2.8.2 que dejaba el popup diciendo «Brave no confirmó el inicio después de 12 segundos» mientras los contadores permanecían en 0/226. El usuario ya verificó en Brave que la vía antigua `START_SYNC` podía dejar la promesa de `chrome.runtime.sendMessage` sin respuesta. Ahora el popup escribe una solicitud persistente con un identificador único y activa DOS mecanismos del navegador: `WAKE_MANUAL_SYNC` para despertar inmediatamente al proceso de fondo, y `chrome.alarms` como vía de recuperación cuando el mensaje no recibe respuesta. Ambos leen y procesan el mismo identificador; un bloqueo en memoria y un identificador consumido impiden iniciar dos capturas.

El estado diferencia claramente `Esperando proceso de fondo de Brave`, `Solicitud aceptada`, `Sincronización no iniciada` y `Proceso de fondo no respondió`. El panel ya no depende de que el servicio conteste a `START_SYNC` para registrar el clic, ni afirma que sincronizó hasta que el flujo de captura y GitHub confirma su trabajo. El fallo de un sistema de alarmas también produce un error visible. No cambia el manejo de Capitales o Mi portafolio ni la cartera privada. No ejecuta órdenes.

Nuevas pruebas automatizadas: `tests/test_manual_sync_recovery.js` fuerza que `sendMessage` no responda y comprueba que la solicitud persista para el alarm; `tests/test_worker_boot.js` carga juntos el trabajador y los módulos importados, prueba la activación inmediata y verifica que el evento de recuperación no duplica la lectura. **Todavía es necesario comprobar la versión instalada en el Brave real**; las pruebas de GitHub no equivalen a controlar ese navegador desde aquí.

## v2.8.2 — Inicio de sincronización confirmado y visible (23/oct/2026)

Se corrigió el problema de popup en la 2.8.1: «Iniciando sincronización completa…» se mostraba ANTES de que el servicio de fondo confirmara el arranque. Abrir la pestaña de Capitales podía tardar hasta 25 segundos, y la extensión no respondía al popup mientras esperaba la carga. Si el arranque se detenía, el indicador podía permanecer en 0/226 sin explicar el punto exacto.

Ahora la tarea confirma `{ok:true,stage:'INICIADA'}` inmediatamente después de crear su pestaña secundaria inactiva y continúa la carga/lectura en segundo plano, guardando estados separados de apertura, carga Angular, lectura privada, cotizaciones y envío. Si falla la carga, el estado visible muestra un error concreto; si Brave no responde a la solicitud de inicio durante 12 segundos, el popup muestra un error de confirmación en vez de mantener «Iniciando…» sin límite. Continúan funcionando los detalles de categoría, página y contador del 0 al 226 de 2.8.1 y la verificación manual de la fecha del archivo validado por GitHub. `test_sync_fast_ack.js` garantiza en CI que el arranque retorna antes de que termine de cargar Capitales.

No cambia los selectores ni la paginación verificada de los 226 instrumentos; la pantalla principal permanece intacta. No envía ni ejecuta órdenes. **La versión necesita prueba real en Brave para confirmar la sincronización, además de las pruebas automáticas.**

## v2.8.1 — Progreso visible y verificación real de GitHub (23/oct/2026)

Se restauró el evento `chrome.storage.onChanged` del popup: en 2.8.0 se borró accidentalmente la llamada `refresh()`, por lo que el mensaje podía quedar congelado incluso con actividad de fondo. El popup ahora actualiza en vivo y también cada 1.5 segundos mientras esté abierto. El lector de Capitales transmite solamente indicadores inocuos (categoría ACCIONES/ETFs/FONDOS, número de página, cantidad capturada y etapa), que se guardan en `syncProgress` y se muestran junto a una barra 0–226. La UI avisa si pasan tres minutos sin actualizaciones o si una sincronización supera siete minutos, para evitar un estado eterno «trabajando».

Un botón `Verificar 226 cotizaciones en GitHub` consulta bajo demanda el archivo público validado, presenta fecha y cantidad, y diferencia **enviado a GitHub** de **validado por GitHub**. No descarga posiciones privadas ni necesita más permisos. Se conserva la pestaña secundaria inactiva: el usuario no tiene que ver los cambios de páginas de Angular. La prueba `test_popup_progress.js` simula actualizaciones de 20, 175 y 226 instrumentos; los tests anteriores protegen el recolector y la cartera.

No se envían operaciones a Actinver; la aprobación por lote de 2.8.0 sigue limitada a preparar propuestas. La primera captura real con la 2.8.1 aún debe confirmarse.

## v2.8.0 — Propuestas virtuales y autorización por lote (23/oct/2026)

Nuevo módulo `order-preflight.js` calcula en Brave borradores de compra sin depender de la programación horaria del motor GitHub privado. Lee los últimos 226 precios ya validados, el ranking histórico público y el archivo de cartera del repositorio PRIVADO verificado. Los rechaza si cotizaciones tienen más de 15 minutos o la cartera más de 35 minutos, si no concilian saldos, si faltan posiciones o se repiten títulos; excluye apalancados. Conserva restricciones de concentración 20% por acción, inversión máxima de 65% del poder de compra, hasta 5 emisoras nuevas, diferenciales y profundidad y comisión estimada. Tras nueva sincronización, reintenta generar el borrador cuando el proceso de GitHub termina la validación, sin enviar órdenes.

El popup muestra los títulos, cantidades, límites y coste máximo estimado. La persona selecciona exactamente qué operaciones quiere preparar y consiente explícitamente una sola vez para ese borrador (vence a los 5 minutos). Una aprobación **no autoriza cambios de precio, nuevos instrumentos ni transacciones posteriores**. Todo permanece local/privado; jamás se filtra cartera a GitHub público.

La función `order-ui-probe.js` realiza inspección **estructural y sin clics** de los controles de operaciones de Capitales en una pestaña inactiva y escribe únicamente contadores y nombres genéricos al archivo privado `actinver/order-ui-probe.json`. Puede activarse desde el popup o, de forma remota, mediante una solicitud GitHub de tipo `inspect_order_ui`; no admite instrucciones de trading remotas. La inspección no extrae credenciales, saldos, ticker alguno ni HTML. Sirve para diseñar el adaptador del formulario de compra y las dos confirmaciones reales.

**Las órdenes siguen sin ejecutarse.** El flujo de ingreso al portal todavía requiere validar en una sesión real la ventana de compra, sus campos, la segunda confirmación, y verificar después el folio de orden. No se automatiza un formulario desconocido y no se usan endpoints ocultos ni se saltan controles de seguridad del Reto. El objetivo de esta versión es preparar y autorizar lotes con el usuario antes de activar un ejecutor probado. Los tests garantizan que ninguna acción de inspección pulse controles ni envíe compras.

## v2.7.1 — Corregido “Frame with ID 0 was removed” (23/oct/2026)

La causa era la carrera entre la respuesta de `COLLECT_DONE` y el cierre inmediato de la pestaña secundaria. El trabajador cerraba su pestaña **antes de que `collector.js` terminara su promesa**, por lo que Brave emitía un error de marco eliminado incluso cuando GitHub ya había aceptado las 226 cotizaciones. Ahora el cierre ocurre en `injectQuotesWithRetry`, después de que la ejecución del script finaliza. Si el frame se elimina por una recarga auténtica de Actinver, el error se clasifica como transitorio y se reintenta solo en otra pestaña secundaria propia. Si el envío público fue confirmado en la misma ejecución, el error tardío no pisa el estado exitoso ni duplica la carga.

Los tests protegen las 226 cotizaciones, la cartera privada, la navegación aislada y la finalización del script después del envío a GitHub. Se mantienen los permisos, tokens y pantallas del usuario; no se ejecutan órdenes. **La prueba real en Brave aún queda pendiente.**

## v2.7.0 — Cotizaciones sin mover la página visible (22/oct/2026)

La captura pública de 145 Acciones, 56 ETFs y 25 Fondos ahora utiliza **siempre una pestaña secundaria inactiva de Capitales**, aunque la pestaña visible del usuario ya esté en Capitales. Las categorías y el paginador se recorren en esa pestaña separada, no en la pantalla del usuario. La pestaña temporal usa el mismo dominio de Actinver y un vínculo con la sesión existente; se cierra tras un envío exitoso o un fallo de captura.

La protección `injectQuotesWithRetry` comprueba que la pestaña donde se va a ejecutar `collector.js` haya sido creada por esta sincronización específica. Si Brave descarta una pestaña temporal, se crea **otra temporal**; nunca se usa una pestaña visible como alternativa. Se conserva la secuencia privada → pública para no cerrar el origen mientras la cartera lo necesite.

La prueba `tests/test_isolated_market_capture.js` incluye Capitales abierto, Mi portafolio abierto y la recuperación de una pestaña descartada. El recolector Angular y las comprobaciones de catálogo siguen sin cambios. Para evitar completamente la paginación incluso en segundo plano haría falta verificar los endpoints autorizados que utiliza Actinver: no se presuponen ni inventan llamadas API.

**Comprobación pendiente:** sincronización en la sesión real de Brave con la versión instalada; las pruebas automáticas no sustituyen esta verificación. No compra ni vende.

## v2.6.0 — Mi portafolio en su URL real (21/oct/2026)

La ruta real suministrada por el usuario es **https://www.retoactinver.com/RetoActinver/#/portafolio**. El recolector anterior no tenía permiso para `www.retoactinver.com` y buscaba un menú ficticio llamado «Tu inversión». Ahora se concede el permiso específico al host con `www`, se abre directamente `#/portafolio` en una pestaña secundaria vinculada a la sesión, se espera la carga y se lee únicamente la cartera permitida. Si Actinver redirige a otra ruta, se registra un fallo sin afirmar éxito. Capitales mantiene su captura de 226 instrumentos; si se abre desde otra página, conserva el host de la pestaña de origen.

Las carteras realmente vacías son válidas si el DOM presenta una tabla reconocible sin registros y el balance invertido resulta coherente con cero posiciones. No se fabrican posiciones, importes ni órdenes. El motor de decisiones privado también permite cero tenencias con esa comprobación; **las compras siguen sujetas a precios recientes y aprobación del usuario**.

El test `tests/test_direct_portfolio.js` protege la URL, el permiso de dominio y la detección de redirecciones. **Pendiente:** confirmar la primera captura privada real desde Brave. Al incorporar el permiso `https://www.retoactinver.com/*`, Brave puede pedir que el usuario lo apruebe al recargar la extensión.

## 2.5.1 (21/oct/2026) — Navegación Tu inversión

El diagnóstico privado real de 2.5.0 registró ausencia tanto de resumen como de posiciones. El navegador privado exigía reconocer una tabla específica antes de aceptar el enlace de Tu inversión, aunque éste podía navegar directamente a la cartera o abrir un submenú. La navegación ahora distingue ambas posibilidades, reconoce un cambio de ruta y permite inspeccionar encabezados todavía desconocidos sin confundir el clic con una captura exitosa. No accede a controles de comprar/vender.

El lector de balance busca importes junto a etiquetas aunque Angular los renderice en hermanos o contenedores separados, y conserva la validación de conciliación de totales. El diagnóstico privado ahora registra además la fase de navegación, nunca saldos ni posiciones sin depurar. Las regresiones prueban enlaces directos y submenús, un resumen y posiciones ficticias, y las 226 cotizaciones públicas.

**Pendiente de confirmación real:** todavía se necesita comprobar que el navegador del usuario cree `actinver/portfolio-latest.json`. El ZIP no actualiza Brave automáticamente; no se enviarán operaciones de inversión.

## v2.5.0 — Sincronización privada verificable (21/oct/2026)

Mantiene sin cambios la captura pública de Capitales 2.4.3, que se confirmó 226/226 en la sesión real. Corrige el flujo privado: reconoce el menú Angular «Tu inversión» con iconos y controles anidados; permite inspeccionar la pantalla a la que se navegó aunque tenga otros nombres de columnas; lee etiquetas de saldo con iconos de ayuda; acepta variantes de encabezado de cantidad y títulos; espera a que Angular cargue y confirma la respuesta real del lector, no solo la inyección.

Cuando no logra completar la lectura, escribe únicamente indicadores booleanos y de estado en `actinver/portfolio-diagnostic.json` del repositorio privado verificado. Nunca sube allí HTML sin filtrar, contraseñas, URLs, cuentas ni precios; los saldos/posiciones reconocidos solo se publican en el archivo privado `actinver/portfolio-latest.json`. Si falta algún componente no anuncia un falso éxito.

La prueba `tests/test_portfolio_ui.js` usa saldos y cantidades inventados para comprobar la extracción y la confirmación de envío; se ejecuta junto a la prueba de 226 cotizaciones antes de empaquetar. **Esta prueba no sustituye la confirmación de captura privada en la sesión real de Brave**. Las propuestas de compra requieren cotizaciones recientes y cartera privada válida; nunca se ejecutan órdenes sin aprobación.

## v2.4.3 — Diseño real de Fondos (20/oct/2026)

El usuario inspeccionó la tabla activa de Fondos. Tiene nueve columnas: `Fav`, `Información`, `Fondo`, `Categoria`, `Precio`, `1 año`, `3 años`, `5 años`, `Comprar o vender`. No tiene campos de compra/venta de Acciones ni ETFs. La versión 2.4.2 asumía los siete encabezados de bolsa, por eso el informe privado mostró `TIMEOUT` en fase `CATEGORY`, índice `2`, pese a estar seleccionada la pestaña.

El recolector 2.4.3 identifica automáticamente ambos formatos mediante los encabezados visibles. De Fondos transmite el símbolo, precio, categoría y rendimientos a 1, 3 y 5 años; deja vacíos los campos de volumen y posturas de compra/venta, que no existen. El receptor GitHub registra tales campos como `null` y conserva los rendimientos públicos. La prueba de 226 filas simula ambas tablas y los retrasos de Angular.

*Pendiente:* confirmar captura real y sincronización de cartera privada en Brave. Nunca se ejecutan órdenes de inversión.

## v2.4.2 — Fondos sin cotización disponible (20/oct/2026)

Actinver publica los 25 Fondos con emisora válida pero sin último precio ni postura de venta. Antes `validRows` exigía ambos precios y rechazaba toda la categoría, impidiendo concluir la sincronización de 226 registros. Ahora se exige un símbolo por fila, único en la página; los valores ausentes se pasan sin inventar datos y GitHub los convierte en `null`. La validación completa por categoría y universo sigue en el receptor público.

La regresión `tests/test_collector_ui.js` simula retraso en Angular, paginación en bloques de cuatro y 25 fondos sin precios. El código de cotizaciones no ejecuta operaciones.

## v2.4.1 — Arreglo reproducido con el diagnóstico privado (20/oct/2026)

El registro privado señaló fallo READ_PAGE, categoría ETFs (índice 1), página 1. La interfaz Angular cambia visualmente de pestaña y reinicia la paginación antes de reemplazar las filas de la tabla.

Se reprodujo una actualización de filas ocho segundos después del cambio: el código anterior falló con `Emisora duplicada` a los ~19 s; el código corregido reunió las 226 filas al impedir que una pestaña nueva acepte emisoras ya leídas en la anterior. La regresión con retraso está integrada en GitHub Actions antes de empaquetar.

No se modifica ninguna cartera ni se envían datos privados al repositorio público. Sigue pendiente comprobar el resultado dentro de la sesión real de Brave.

## v2.4.0 — DOM real de Capitales verificado (20/oct/2026)

Esta versión reemplaza la identificación supuesta de pestañas y tablas por la estructura real recopilada en la consola de Brave:

- `app-capitales div.tab-btn` tiene tres contenedores; la clase `active` está en el DIV, no en el botón de Angular Material. Se admite incluso el ancho real de 69px del botón de ETFs, antes descartado por error.
- `app-tabla-material table.table-capitales` contiene 10 columnas; su lectura se deriva de los encabezados reales, sin presuponer índices para volumen y precio de venta. Los encabezados son la fuente de correspondencia; se permite que las clases `cdk-column` de las celdas no coincidan con su orden visible.
- `app-paginator .btn-pages` muestra cuatro números por ventana, con flechas anterior/siguiente como primer y último botón; cuando se agotan los cuatro números, avanza a otra ventana y continúa hasta 145 acciones, 56 ETFs y 25 fondos.
- Solo captura cotizaciones públicas; las posiciones y los saldos siguen aislados en GitHub privado. Los errores recopilan exclusivamente estado técnico numérico, nunca las filas, los precios, el HTML ni las credenciales.
- Prueba de regresión con una reproducción de estos selectores auténticos, datos inventados y paginación desplazable. El comportamiento en el navegador real debe confirmarse después de aplicar la versión.

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
