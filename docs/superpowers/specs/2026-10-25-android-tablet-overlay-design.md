# InvestmentChecker Android — especificación (2026-10-25)

## Objetivo
Versión Android **independiente de Windows** para Samsung Galaxy Tab S7+ (pantalla 12.4 pulgadas). La computadora puede permanecer apagada. Comparte el motor de recomendaciones y el histórico de cambios del repositorio InvestmentChecker, sin depender de la extensión Brave de Windows.

## Flujo solicitado
1. Abrir InvestmentChecker Android y pulsar «Actualizar compras de hoy».
2. Abrir Actinver en Brave de Android e iniciar sesión manualmente.
3. Obtener cotizaciones, portafolio, saldo, órdenes y movimientos **solo si es técnicamente posible y está permitido**; la viabilidad de esta lectura es una condición por validar en el dispositivo.
4. Verificar vigencia de cada fuente, calcular recomendaciones (instrumento, títulos enteros, precio límite MXN, importe estimado) y etiquetar claramente cualquier simulación con datos históricos.
5. Mostrar las recomendaciones en panel superpuesto a Brave.
6. El usuario copia los datos, **los introduce personalmente** y pulsa «Comprar» por sí mismo. La aplicación jamás rellena ni envía formularios de órdenes.

## Interfaz Android
- Ventana flotante mediante permiso Android SYSTEM_ALERT_WINDOW / TYPE_APPLICATION_OVERLAY; siempre visible al seleccionar Brave, sin robar foco de teclado.
- Movible **arrastrando el encabezado** y ajustable en tamaño; minimizar solo mediante acción explícita. Recordar posición y tamaño.
- Controles mínimos; propuestas legibles y campos copiables por separado.
- Adaptación al teclado virtual, rotación y límites de pantalla; evitar tapar controles críticos de Actinver.

## Decisiones técnicas y límites
- Aplicación Android nativa (Kotlin); módulo separado `android/` sin modificar ni reemplazar la versión Windows v2.8.30.
- El navegador externo Brave y una aplicación Android independiente no comparten libremente DOM/cookies; la lectura automática de datos de una sesión de Brave no está demostrada. No prometerla hasta validar una integración permitida (por ejemplo, mecanismo oficial/exportación autorizada). En ausencia de integración, mostrar claramente estado «datos no sincronizados» y no presentar propuestas como vigentes.
- No guardar contraseñas ni cookies de Actinver en GitHub; jamás subir saldos/posiciones privadas al repositorio público.
- Respetar la regla 17 del concurso: no automatizar registro, rellenado ni envío de órdenes.
- Las actualizaciones de la aplicación no serán descargas sorpresa; seguir el mecanismo que se apruebe para Android.

## Opciones evaluadas
1. **App nativa con superposición sobre Brave (seleccionada para el panel):** conserva navegador habitual y permite trabajar mientras la calculadora está visible. Limitación: el acceso a datos privados de Brave es independiente y necesita validación.
2. **WebView integrado con panel en la misma aplicación:** facilita eventualmente extraer datos de páginas autorizadas, pero Actinver podría restringir navegadores embebidos; usuario prefirió Brave.
3. **Vista dividida Android:** simple de implementar, pero rechazada; el panel debe flotar sobre Brave.

## Criterios de aceptación
- La tablet funciona aunque el PC esté apagado.
- Al interactuar con Brave, la superposición sigue visible y puede arrastrarse.
- El teclado en Actinver recibe pulsaciones normales; tocar el panel solo actúa en sus controles.
- Se puede copiar cada dato de propuestas verificadas.
- Si la sesión no existe o los datos están caducados, la app no simula una sincronización exitosa.
- El software no envía órdenes de compra.
- La versión Windows sigue operativa.
