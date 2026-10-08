# investmentChecker

Research pipeline for Reto Actinver 2026, using public market data and GitHub Actions. **Not an automated broker.**

- `data/universe.csv`: Actinver instruments as exported, without private account data.
- `scripts/analyze.py`: ticker resolution, daily history, indicators and a transparent momentum/risk ranking.
- `.github/workflows/analyze.yml`: weekday scheduled and manual research runs.
- `output/`: generated machine-readable market data and summary.

**Important:** external market quotes are not the same as Actinver simulator execution prices. Suffixes and exchange listings need verification. Instruments lacking a trustworthy mapping are marked `unresolved`, never silently substituted. Leveraged and inverse ETFs are excluded from default recommendations pending review of competition rules.

Data providers can rate limit or omit symbols. A missing series is not evidence of a bad investment. The algorithm uses historical evidence only and does not forecast guaranteed returns. GitHub scheduled jobs can run late. No portfolio trades, passwords, tokens or personal data are stored.

Run manually from Actions > Analyze Actinver universe > Run workflow. The outputs are committed back to `output/`.
## Cotizaciones de Actinver y seguridad de órdenes (octubre 2026)

El reporte programado nunca considera cotizaciones guardadas como actuales. `scripts/order_drafts.py` muestra `BLOCKED_STALE_QUOTES` por defecto. Para permitir borradores, primero debe actualizarse manualmente `data/quotes-snapshot.csv` con una exportación fresca de Actinver y solo después establecer `ALLOW_SNAPSHOT_DRAFTS=1` en una ejecución manual. Esta variable no está configurada en el flujo automático.

El registro `data/quotes-snapshot.csv` contiene únicamente un subconjunto ilustrativo de cotizaciones anteriores, no la totalidad del mercado ni datos en vivo. La actualización de precios del proveedor externo no actualiza automáticamente la profundidad ni el spread del simulador. Nunca ejecutar órdenes utilizando precios de un reporte obsoleto.

La estrategia y el tamaño de cada posición son investigación experimental. Revisa las reglas oficiales vigentes del concurso, cotizaciones, liquidez y órdenes pendientes antes de operar.
