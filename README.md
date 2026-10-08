# investmentChecker

Research pipeline for Reto Actinver 2026, using public market data and GitHub Actions. **Not an automated broker.**

- `data/universe.csv`: Actinver instruments as exported, without private account data.
- `scripts/analyze.py`: ticker resolution, daily history, indicators and a transparent momentum/risk ranking.
- `.github/workflows/analyze.yml`: weekday scheduled and manual research runs.
- `output/`: generated machine-readable market data and summary.

**Important:** external market quotes are not the same as Actinver simulator execution prices. Suffixes and exchange listings need verification. Instruments lacking a trustworthy mapping are marked `unresolved`, never silently substituted. Leveraged and inverse ETFs are excluded from default recommendations pending review of competition rules.

Data providers can rate limit or omit symbols. A missing series is not evidence of a bad investment. The algorithm uses historical evidence only and does not forecast guaranteed returns. GitHub scheduled jobs can run late. No portfolio trades, passwords, tokens or personal data are stored.

Run manually from Actions > Analyze Actinver universe > Run workflow. The outputs are committed back to `output/`.