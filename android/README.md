# InvestmentChecker para Android (primera base técnica)

Objetivo: Samsung Galaxy Tab S7+, aplicación independiente de Windows, con panel flotante movible sobre Brave. El usuario introduce y confirma cada compra manualmente.

## Estado

- Implementado: pantalla de inicio, solicitud de permiso de superposición, servicio con notificación visible, panel flotante arrastrable y ajustable en ancho, persistencia de posición/tamaño, botón para cerrarlo, acceso al inicio de sesión del concurso.
- Implementado: carga **de solo lectura** de cotizaciones públicas, ranking y cartera desde un repositorio GitHub privado configurado en la tablet; token cifrado con Android Keystore; motor idéntico al de Brave extraído en el proceso de compilación; propuestas solo si la política de vigencia y saldo se cumple; copia individual de emisora, títulos y precio límite.
- Pendiente: capturar y sincronizar el portafolio directamente desde una sesión de Actinver abierta en la tablet. La consulta del repositorio privado **no sustituye** esa captura: si los datos están vencidos la app debe bloquear las propuestas.
- **No se muestran propuestas inventadas ni vigentes antes de una sincronización verificada.**
- Sin APK publicado todavía: se requiere una compilación Gradle/Android SDK y prueba en la tablet.

## Compilación

Importar el directorio `android/` como proyecto en Android Studio y ejecutar `:app:assembleDebug`. El APK de desarrollo quedará en `app/build/outputs/apk/debug/app-debug.apk`. Android 13 de la Galaxy Tab S7+ es compatible con `minSdk = 26`.

## Seguridad

El permiso `SYSTEM_ALERT_WINDOW` es necesario para mantener el panel sobre Brave. La app no usa servicios de accesibilidad, no lee contraseñas de Actinver ni rellena órdenes. El token de GitHub se guarda cifrado en el dispositivo, nunca en el repositorio público. El motor compartido rechaza información caducada y simulaciones históricas. No confundir el permiso de superposición con autorización para leer el DOM de Brave: son capacidades diferentes.
