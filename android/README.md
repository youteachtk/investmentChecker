# InvestmentChecker para Android (primera base técnica)

Objetivo: Samsung Galaxy Tab S7+, aplicación independiente de Windows, con panel flotante movible sobre Brave. El usuario introduce y confirma cada compra manualmente.

## Estado

- Implementado: pantalla de inicio, solicitud de permiso de superposición, servicio con notificación visible, panel flotante que puede arrastrarse, botón para cerrarlo, acceso al sitio público del concurso.
- Pendiente: redimensionamiento manual del panel, restauración de posición, lectura de datos privados y cotizaciones, conexión con el motor de propuestas, generación/verificación de propuestas, acciones de copia.
- **No se muestran propuestas inventadas ni vigentes antes de una sincronización verificada.**
- Sin APK publicado todavía: se requiere una compilación Gradle/Android SDK y prueba en la tablet.

## Compilación

Importar el directorio `android/` como proyecto en Android Studio y ejecutar `:app:assembleDebug`. El APK de desarrollo quedará en `app/build/outputs/apk/debug/app-debug.apk`. Android 13 de la Galaxy Tab S7+ es compatible con `minSdk = 26`.

## Seguridad

El permiso `SYSTEM_ALERT_WINDOW` es necesario para mantener el panel sobre Brave. El panel no usa servicios de accesibilidad, no lee contraseñas ni rellena órdenes. No confundir el permiso de superposición con autorización para leer el DOM de Brave: son capacidades diferentes.
