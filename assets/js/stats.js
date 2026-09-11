/* ============================================================================
   STATISTICHE CLIENTI — tutte le regole degli avvisi stanno qui.
   Ogni cliente viene valutato sul SUO ritmo abituale, non su una soglia fissa.
   ========================================================================== */
const Stats = (function () {
  "use strict";
  const DAY = 86400000;
  const giorni = (a, b) => Math.round((b - a) / DAY);
  function mediana(arr) { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  const STATI = {
    rischio:      { label: "A rischio",     prio: 1, colore: "rischio",   desc: "Non ordina da più di {rischio_x} volte il suo intervallo abituale." },
    ritardo:      { label: "In ritardo",    prio: 2, colore: "ritardo",   desc: "Ha superato di oltre {ritardo_x} volte il suo intervallo abituale: chiamalo." },
    flessione:    { label: "In flessione",  prio: 3, colore: "flessione", desc: "Ordina ancora, ma i cartoni degli ultimi 3 mesi sono calati di oltre il {flessione_pct}% rispetto ai 3 precedenti." },
    perso:        { label: "Perso",         prio: 4, colore: "perso",     desc: "Più di {perso_x} volte il suo intervallo, oppure più di {perso_giorni} giorni senza ordini." },
    senza_ordini: { label: "Mai ordinato",  prio: 5, colore: "neutro",    desc: "Registrato ma non ha mai ordinato." },
    nuovo:        { label: "Nuovo",         prio: 6, colore: "nuovo",     desc: "Un solo ordine: non ha ancora un ritmo. Avviso dopo {nuovo_giorni} giorni." },
    regolare:     { label: "Regolare",      prio: 7, colore: "ok",        desc: "Ha riordinato entro il suo intervallo abituale." }
  };
  const DEFAULT_CFG = { ritardo_x: 1.5, rischio_x: 2.5, perso_x: 3, perso_giorni: 90, nuovo_giorni: 45, flessione_pct: 30 };

  // Statistiche di UN cliente dati i suoi ordini
  function cliente(c, ordini, cfg, now) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg || {}); now = now || new Date();
    const validi = (ordini || []).filter(o => o.stato !== "annullato").sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const n = validi.length;
    const r = { n, cartoni: 0, speso: 0, primo: null, ultimo: null, intervallo: null, giorniDaUltimo: null, atteso: null, x: null, trend: null, cartoni90: 0, cartoniPrec: 0, stato: "senza_ordini", ordini: validi, giorniDaRegistrazione: giorni(new Date(c.created_at), now) };
    validi.forEach(o => { r.cartoni += Number(o.cartoni) || 0; r.speso += Number(o.totale) || 0; });
    if (!n) return r;
    r.primo = new Date(validi[0].created_at); r.ultimo = new Date(validi[n - 1].created_at);
    r.giorniDaUltimo = giorni(r.ultimo, now);
    if (n >= 2) {
      const gaps = []; for (let i = 1; i < n; i++) gaps.push(giorni(new Date(validi[i - 1].created_at), new Date(validi[i].created_at)));
      r.intervallo = Math.max(1, Math.round(mediana(gaps)));
      r.atteso = new Date(r.ultimo.getTime() + r.intervallo * DAY);
      r.x = r.giorniDaUltimo / r.intervallo;
    }
    const t90 = new Date(now - 90 * DAY), t180 = new Date(now - 180 * DAY);
    r.cartoni90 = validi.filter(o => new Date(o.created_at) >= t90).reduce((s, o) => s + Number(o.cartoni || 0), 0);
    r.cartoniPrec = validi.filter(o => { const d = new Date(o.created_at); return d >= t180 && d < t90; }).reduce((s, o) => s + Number(o.cartoni || 0), 0);
    r.trend = r.cartoniPrec > 0 ? Math.round((r.cartoni90 - r.cartoniPrec) / r.cartoniPrec * 100) : null;
    if (n === 1) {
      r.stato = r.giorniDaUltimo > cfg.perso_giorni ? "perso" : r.giorniDaUltimo > cfg.nuovo_giorni ? "ritardo" : "nuovo";
    } else if (r.giorniDaUltimo > cfg.perso_giorni || r.x > cfg.perso_x) r.stato = "perso";
    else if (r.x > cfg.rischio_x) r.stato = "rischio";
    else if (r.x > cfg.ritardo_x) r.stato = "ritardo";
    else if (r.trend !== null && r.trend <= -cfg.flessione_pct) r.stato = "flessione";
    else r.stato = "regolare";
    return r;
  }

  // Frase in italiano che spiega lo stato di un cliente
  function spiega(s) {
    if (s.stato === "senza_ordini") return "Registrato " + s.giorniDaRegistrazione + " giorni fa, non ha ancora ordinato.";
    if (s.n === 1) return "Un solo ordine, " + s.giorniDaUltimo + " giorni fa.";
    let t = "Ordina in media ogni " + s.intervallo + " giorni. Ultimo ordine " + s.giorniDaUltimo + " giorni fa";
    if (s.x > 1) t += ", in ritardo di " + Math.round(s.giorniDaUltimo - s.intervallo) + " giorni";
    else t += ", il prossimo è atteso tra " + Math.round(s.intervallo - s.giorniDaUltimo) + " giorni";
    if (s.trend !== null) t += ". Cartoni ultimi 3 mesi: " + s.cartoni90 + " contro " + s.cartoniPrec + " nei 3 precedenti (" + (s.trend > 0 ? "+" : "") + s.trend + "%)";
    return t + ".";
  }

  // Somme su un periodo (ordini validi)
  function periodo(ordini, da, a) {
    const sel = ordini.filter(o => o.stato !== "annullato" && new Date(o.created_at) >= da && new Date(o.created_at) < a);
    return { n: sel.length, totale: sel.reduce((s, o) => s + Number(o.totale || 0), 0), cartoni: sel.reduce((s, o) => s + Number(o.cartoni || 0), 0), clienti: new Set(sel.map(o => o.user_id)).size };
  }
  // Serie mensile degli ultimi N mesi: [{label, anno, mese, n, totale, cartoni, perTipo:{b2c,b2b,rivenditore}}]
  function mensile(ordini, mesi, now) {
    now = now || new Date(); const out = [];
    for (let i = mesi - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1), f = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const sel = ordini.filter(o => o.stato !== "annullato" && new Date(o.created_at) >= d && new Date(o.created_at) < f);
      const perTipo = { b2c: 0, b2b: 0, rivenditore: 0 }; sel.forEach(o => { perTipo[o.tipo] = (perTipo[o.tipo] || 0) + Number(o.cartoni || 0); });
      out.push({ label: d.toLocaleDateString("it-IT", { month: "short" }).replace(".", ""), anno: d.getFullYear(), mese: d.getMonth(), n: sel.length, totale: sel.reduce((s, o) => s + Number(o.totale || 0), 0), cartoni: sel.reduce((s, o) => s + Number(o.cartoni || 0), 0), perTipo });
    }
    return out;
  }
  return { STATI, DEFAULT_CFG, cliente, spiega, periodo, mensile, giorni };
})();
