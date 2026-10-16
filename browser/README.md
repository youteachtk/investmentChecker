# Conexión gratuita Brave → GitHub (sin Work ni Cloudflare)

Este puente sincroniza **solo cotizaciones públicas** del monitor de Actinver. No copia cookies, contraseñas, folios, saldo, posiciones, ni ejecuta operaciones.

## Configuración inicial (una vez)

1. Instala Tampermonkey desde su sitio oficial o la tienda de extensiones de Brave/Chrome.
2. Instala el userscript desde:
   https://raw.githubusercontent.com/youteachtk/investmentChecker/main/browser/actinver-investmentchecker.user.js
3. En GitHub abre Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Owner: **youteachtk**
   - Repository access: **Only select repositories → investmentChecker**
   - Repository permissions: **Actions: Read and write**.
   - No otorgues Contents, Administration ni permisos a otros repositorios.
   - Establece caducidad corta; deberás renovar el token después.
4. Abre Actinver → Monitores en Brave. En el menú de Tampermonkey selecciona **Configurar token de GitHub** y pégalo **allí**, nunca en ChatGPT, capturas, repositorio o consola.
5. En el menú selecciona **Sincronizar las 226 cotizaciones ahora**. La página recorrerá las tablas y comprobará 145 acciones, 56 ETFs y 25 fondos.
6. Verifica en GitHub → Actions → **Receive Actinver quotes from Brave** que la ejecución termine con marca verde. Consulta:
   - `output/actinver_quotes.json` — captura completa con fecha/hora
   - `output/actinver_quote_opportunities.json` — comparación de spread, volumen y puntaje histórico.
7. Opcional: activa **Sincronización cada 30 minutos** desde el menú de Tampermonkey mientras tengas Actinver → Monitores abierto y visible.

## Límites

- Si la tabla cambia o faltan símbolos, se cancela el envío completo; nunca rellena precios faltantes.
- GitHub Actions se ejecuta en minutos, no de manera instantánea; cualquier cotización puede volverse obsoleta.
- No funciona si Brave está cerrado o la sesión expiró. La sincronización periódica podría interrumpir temporalmente la vista de Monitores porque cambia páginas.
- Este repositorio es público: **las cotizaciones enviadas serán públicas**. No envíes información de tu cuenta o portafolio aquí. Los datos privados necesitan un repositorio privado independiente y controles adicionales.
- El token queda almacenado localmente por Tampermonkey. Protege tu equipo; puedes revocar el token desde GitHub en cualquier momento.
- ChatGPT puede leer los archivos a través de GitHub cuando inicies una conversación o mediante una tarea programada con acceso disponible. **No obtiene una conexión continua a tu sesión de Brave.**
- Las compras y ventas requieren autorización expresa y confirmación en Actinver. Esta integración **no coloca órdenes**, ni automatiza clics de compra/venta.
- Verifica las reglas del concurso, el precio de compra vendedor, profundidad, comisión y poder de compra antes de operar.
