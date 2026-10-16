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
