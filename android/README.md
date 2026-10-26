# InvestmentChecker para Android (captura local de cartera)

Objetivo: Samsung Galaxy Tab S7+, aplicación independiente de Windows, con panel flotante movible sobre Brave. El usuario introduce y confirma cada compra manualmente.

## Estado

- Implementado: pantalla de inicio, solicitud de permiso de superposición, servicio con notificación visible, panel flotante arrastrable y ajustable en ancho, persistencia de posición/tamaño, botón para cerrarlo, acceso al inicio de sesión del concurso.
- Implementado: navegador interno de Actinver para que el usuario inicie sesión y, al pulsar **Leer cartera de esta página**, capture el texto y las tablas visibles de saldos y posiciones. No se leen los valores de contraseñas o formularios, y los datos quedan en almacenamiento privado Android.
- Implementado: carga **de solo lectura** de cotizaciones públicas y ranking; motor idéntico al de Brave extraído en compilación; propuestas solo si la política de vigencia y saldo se cumple; copia individual de emisora, títulos y precio límite.
- Implementado: botón **Actualizar análisis de la PC (GitHub)** sin cuentas ni token. Lee `output/analisis-diario.md` y `output/status.json`, guarda una clasificación local y muestra las cinco primeras emisoras en la superposición; marca como histórico cualquier reporte de más de 24 horas. Es investigación general, no una orden de compra ni una cartera personal sincronizada.
- Pendiente de verificar en la Galaxy Tab S7+: el formato real de las tablas privadas después de iniciar sesión, la cobertura del parser y el comportamiento de la sesión de Actinver dentro de Android WebView. La sesión de Brave no se comparte con el navegador interno.
- **No se muestran propuestas inventadas ni vigentes antes de una sincronización verificada.**
- El APK de prueba se publica en el release `android-test-latest` desde GitHub Actions. La compatibilidad con la cuenta real requiere comprobación en dispositivo.

## Compilación

Importar el directorio `android/` como proyecto en Android Studio y ejecutar `:app:assembleDebug`. El APK de desarrollo quedará en `app/build/outputs/apk/debug/app-debug.apk`. Android 13 de la Galaxy Tab S7+ es compatible con `minSdk = 26`.

## Seguridad

El permiso `SYSTEM_ALERT_WINDOW` es necesario para mantener el panel sobre Brave. La app no usa servicios de accesibilidad, no lee contraseñas de Actinver ni rellena órdenes. No se solicitan credenciales ni tokens de GitHub. El motor compartido rechaza información caducada y simulaciones históricas. No confundir el permiso de superposición con autorización para leer el DOM de Brave: son capacidades diferentes.
