# Auditoría de propuestas — 2026-10-25

La conexión **ya está implementada** en 2.8.28; falta la prueba real en Brave, no crear el enlace desde cero.

- `private-sync.js` captura, concilia y almacena `actinver/portfolio-latest.json` en el repositorio privado.
- `order-preflight.js` (`orderLoadPrivatePortfolio`, `orderPreview`, `orderDrafts`) obtiene esa cartera, 226 cotizaciones públicas y el ranking, valida antigüedad, conciliación, posiciones, liquidez y diversificación; calcula títulos, precio límite MXN y costo para hasta cinco borradores.
- `popup.js` enseña las propuestas con botones de copiar. No realiza ni envía operaciones.
- Las propuestas requieren cotizaciones recientes (máximo 15 minutos) y cartera reciente (35 minutos).
- `output/session_watch.md` muestra oportunidades pero no tiene los datos privados para cantidades; `output/ordenes-borrador.json` corresponde al flujo anterior de CSV y no al preflight actual de la extensión.

**Pendiente:** comprobar en Brave la versión instalada y el botón de preparación tras sincronizar mercado y cartera dentro del horario bursátil. Registrar estado y resultados sin publicar saldos personales. No se modificó funcionalidad ni se ejecutaron compras en esta auditoría.
