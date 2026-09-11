# Carminello Agenti

App (blu) per i rappresentanti Carminello. Stesso database del negozio e della dashboard.

- Un agente si registra dall'app ("Diventa agente"); il titolare lo approva dalla dashboard (pagina Agenti) e gli assegna la provvigione.
- L'agente registra i clienti sul posto (Partita IVA → dati da VIES; il cliente riceve l'email per scegliere la password) oppure condivide il suo link/QR.
- Vede solo i suoi clienti: ordini, ritmo, avvisi "da chiamare", note proprie, provvigioni per mese (maturate / ricevute / in attesa).
- Notifiche push quando un suo cliente ordina.

Pubblicata su GitHub Pages: https://alleysrl.github.io/carminello-agenti/

File: `index.html`, `assets/js/app.js` (tutta l'app), `assets/js/stats.js` (stesse regole della dashboard), `assets/css/style.css`, `sw.js` (push), `manifest.webmanifest`.
