# Estado y continuidad de InvestmentChecker

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
