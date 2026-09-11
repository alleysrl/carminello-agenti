/* ============================================================================
   CARMINELLO AGENTI — applicazione per i rappresentanti
   Pagine: home · clienti · scheda cliente · nuovo cliente · provvigioni · profilo
   L'agente vede SOLO i suoi clienti (regole di lettura nel database).
   ========================================================================== */
(function () {
  "use strict";
  const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { storageKey: "carminello-agenti-auth" } });
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n || 0));
  const dateS = d => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const dateL = d => d ? new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const TIPO = { b2c: "Privato", b2b: "Esercente", rivenditore: "Rivenditore" };
  const PM = { carta: "Carta", bonifico: "Bonifico", contrassegno: "Contrassegno" };
  const ST = { da_pagare: "Da pagare", da_spedire: "In preparazione", spedito: "Spedito", annullato: "Annullato" };
  const NOTA_TIPO = { chiamata: "Telefonata", whatsapp: "WhatsApp", email: "Email", visita: "Visita", nota: "Nota" };
  const ESITI = ["riordina", "in pausa", "nessuna risposta", "richiamare", "perso", "altro"];

  let user = null, me = null;
  let D = { clienti: [], ordini: [], note: [], provv: [], cfg: {}, stat: {}, byUser: {}, noteBy: {}, prezziBy: {}, prod: [] };

  function toast(msg, type) {
    let box = el("toast-box"); if (!box) { box = document.createElement("div"); box.id = "toast-box"; document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast " + (type || ""); t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10); setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 4500);
  }
  function modal(html) { el("modal-in").innerHTML = html; el("modal").hidden = false; }
  function closeModal() { el("modal").hidden = true; }
  el("modal").addEventListener("click", e => { if (e.target === el("modal")) closeModal(); });
  const appUrl = () => location.origin + location.pathname.replace(/[^/]*$/, "");
  const wa = n => { let t = String(n || "").replace(/[^\d+]/g, ""); if (!t) return null; if (t.startsWith("+")) t = t.slice(1); else if (!t.startsWith(CONFIG.WHATSAPP_PREFISSO)) t = CONFIG.WHATSAPP_PREFISSO + t; return "https://wa.me/" + t; };
  const nome = c => c.ragione_sociale || ((c.nome || "") + " " + (c.cognome || "")).trim() || c.email || "—";
  const tel = c => (c.telefono || (c.indirizzo && c.indirizzo.telefono) || "").replace(/\s+/g, "");
  const meseLabel = d => new Date(d).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const meseCorrente = () => { const n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-01"; };
  const linkCliente = () => CONFIG.SHOP_URL + "/account.html?agente=" + (me && me.codice_agente || "");
  const linkApp = () => CONFIG.SHOP_URL + "/?agente=" + (me && me.codice_agente || "");   // apre l'app clienti già collegata all'agente
  function qrSvg(testo, px) { try { const q = window.qrcode(0, "M"); q.addData(testo); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace("<svg ", `<svg style="width:${px}px;height:${px}px;max-width:100%;background:#fff;border-radius:10px" `); } catch (e) { return ""; } }
  function qrModal(titolo, link, sotto) {
    modal(`<div style="text-align:center"><h2>${esc(titolo)}</h2>${qrSvg(link, 320)}<p class="small" style="word-break:break-all;margin:.6rem 0">${esc(link)}</p><p class="small muted">${esc(sotto)}</p><button class="btn ghost" id="q-close">Chiudi</button></div>`);
    el("q-close").onclick = closeModal;
  }

  // ================================================================ ACCESSO
  function renderLogin(msg, tab) {
    el("top").hidden = true; document.title = "Carminello Agenti";
    el("view").innerHTML = `
      <div class="login card">
        <img class="logo" src="assets/icons/icon-192.png" alt="">
        <h1 style="text-align:center">Carminello Agenti</h1>
        <p class="muted small" style="text-align:center">Per i rappresentanti Carminello: i tuoi clienti, i loro ordini, le tue provvigioni.</p>
        ${msg ? `<div class="notice warn">${esc(msg)}</div>` : ""}
        <div class="seg" style="justify-content:center"><button id="t-login" class="${tab !== "reg" ? "on" : ""}">Accedi</button><button id="t-reg" class="${tab === "reg" ? "on" : ""}">Diventa agente</button></div>
        <form id="login" ${tab === "reg" ? "hidden" : ""}>
          <div class="field"><label>Email</label><input id="l-email" type="email" autocomplete="email" required></div>
          <div class="field"><label>Password</label><input id="l-pass" type="password" autocomplete="current-password" required></div>
          <div class="err" id="l-err" hidden></div>
          <p id="l-resend" hidden><a href="#" id="l-resend-a">Non hai ricevuto l'email di conferma? Inviala di nuovo</a></p>
          <button class="btn block" type="submit">Entra</button>
          <p class="small" style="text-align:center;margin:.8rem 0 0"><a href="#" id="l-forgot">Password dimenticata?</a></p>
        </form>
        <form id="reg" ${tab === "reg" ? "" : "hidden"} novalidate>
          <div class="notice info small">Ti registri, noi ti contattiamo per concordare la provvigione e attiviamo l'account. Da quel momento registri i tuoi clienti e vedi ordini e provvigioni.</div>
          <div class="row"><div class="field"><label>Nome</label><input id="r-nome" autocomplete="given-name"></div><div class="field"><label>Cognome</label><input id="r-cognome" autocomplete="family-name"></div></div>
          <div class="row"><div class="field"><label>Telefono</label><input id="r-tel" type="tel" autocomplete="tel"></div><div class="field"><label>Email</label><input id="r-email" type="email" autocomplete="email"></div></div>
          <div class="row"><div class="field"><label>Partita IVA (se ce l'hai)</label><input id="r-piva" inputmode="numeric" maxlength="11"></div><div class="field"><label>Ragione sociale (facoltativa)</label><input id="r-rs"></div></div>
          <div class="row"><div class="field"><label>Password (almeno 8 caratteri)</label><input id="r-pass" type="password" autocomplete="new-password" minlength="8"></div><div class="field"><label>Ripeti la password</label><input id="r-pass2" type="password" autocomplete="new-password"></div></div>
          <div class="field"><label style="display:flex;gap:.5rem;align-items:flex-start;font-weight:400"><input type="checkbox" id="r-priv" style="width:auto;margin-top:.2rem"> <span class="small">Ho letto l'<a href="${CONFIG.SHOP_URL}/info.html#privacy" target="_blank" rel="noopener">informativa privacy</a> e accetto di essere contattato da Carminello.</span></label></div>
          <div class="err" id="r-err" hidden></div>
          <button class="btn block" type="submit">Invia la richiesta</button>
        </form>
      </div>`;
    el("t-login").onclick = () => renderLogin(null, "login"); el("t-reg").onclick = () => renderLogin(null, "reg");
    el("login").addEventListener("submit", async e => {
      e.preventDefault(); el("l-err").hidden = true; el("l-resend").hidden = true;
      const email = el("l-email").value.trim();
      const { error } = await db.auth.signInWithPassword({ email, password: el("l-pass").value });
      if (error) {
        const nc = /not confirmed/i.test(error.message || "");
        el("l-err").textContent = nc ? "Devi prima confermare la tua email: apri il link che ti abbiamo inviato (controlla anche la posta indesiderata)." : "Email o password non corretti."; el("l-err").hidden = false;
        if (nc) { el("l-resend").hidden = false; el("l-resend-a").onclick = async ev => { ev.preventDefault(); const r = await db.auth.resend({ type: "signup", email, options: { emailRedirectTo: appUrl() } }); toast(r.error ? r.error.message : "Email inviata di nuovo: controlla la casella", r.error ? "err" : "ok"); }; }
        return;
      }
      boot();
    });
    el("l-forgot").onclick = async e => {
      e.preventDefault(); const email = el("l-email").value.trim(); if (!email) { toast("Scrivi prima la tua email", "err"); return; }
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: appUrl() }); toast(error ? error.message : "Ti abbiamo inviato un'email per scegliere una nuova password", error ? "err" : "ok");
    };
    el("reg").addEventListener("submit", async e => {
      e.preventDefault(); const v = id => el(id).value.trim(); const err = m => { el("r-err").textContent = m; el("r-err").hidden = false; };
      el("r-err").hidden = true;
      if (!v("r-nome") || !v("r-cognome") || !v("r-tel") || !v("r-email")) return err("Compila nome, cognome, telefono ed email.");
      if (el("r-pass").value.length < 8) return err("La password deve avere almeno 8 caratteri.");
      if (el("r-pass").value !== el("r-pass2").value) return err("Le password non coincidono.");
      if (!el("r-priv").checked) return err("Devi accettare l'informativa privacy.");
      const meta = { ruolo: "agente", nome: v("r-nome"), cognome: v("r-cognome"), telefono: v("r-tel"), piva: v("r-piva").replace(/\D/g, ""), ragione_sociale: v("r-rs"), lingua: "it" };
      const { data, error } = await db.auth.signUp({ email: v("r-email"), password: el("r-pass").value, options: { data: meta, emailRedirectTo: appUrl() } });
      if (error) return err(/already|registered|exists/i.test(error.message) ? "Questa email è già registrata: prova ad accedere." : error.message);
      if (data.session) { boot(); return; }
      el("view").innerHTML = `
        <div class="login card">
          <img class="logo" src="assets/icons/icon-192.png" alt="">
          <h1 style="text-align:center">Richiesta ricevuta!</h1>
          <p>Abbiamo inviato un'email a <b>${esc(v("r-email"))}</b>.</p>
          <ol style="line-height:1.8">
            <li><b>Conferma la tua email</b> cliccando il link che ti abbiamo inviato. Controlla anche la posta indesiderata.</li>
            <li><b>Ti contattiamo noi</b> per concordare la provvigione e attivare l'account.</li>
            <li><b>Da quel momento</b> registri i tuoi clienti dall'app e vedi ordini, statistiche e provvigioni.</li>
          </ol>
          <p class="small muted">Hai fretta? Scrivici su <a href="https://wa.me/${CONFIG.WHATSAPP_CARMINELLO}" target="_blank" rel="noopener">WhatsApp</a>.</p>
          <p style="text-align:center"><button class="btn ghost" id="back-login">Torna all'accesso</button></p>
        </div>`;
      el("back-login").onclick = () => renderLogin();
    });
  }

  // Nuova password dal link dell'email
  function renderNuovaPassword() {
    el("top").hidden = true;
    el("view").innerHTML = `<div class="login card"><h1 style="text-align:center">Scegli la nuova password</h1>
      <form id="np"><div class="field"><label>Password</label><input id="n-pass" type="password" minlength="8" autocomplete="new-password"></div><div class="field"><label>Ripeti la password</label><input id="n-pass2" type="password" autocomplete="new-password"></div><div class="err" id="n-err" hidden></div><button class="btn block" type="submit">Salva password</button></form></div>`;
    el("np").addEventListener("submit", async e => {
      e.preventDefault(); if (el("n-pass").value.length < 8) { el("n-err").textContent = "Almeno 8 caratteri."; el("n-err").hidden = false; return; }
      if (el("n-pass").value !== el("n-pass2").value) { el("n-err").textContent = "Le password non coincidono."; el("n-err").hidden = false; return; }
      const { error } = await db.auth.updateUser({ password: el("n-pass").value }); if (error) { el("n-err").textContent = error.message; el("n-err").hidden = false; return; }
      history.replaceState(null, "", location.pathname); toast("Password salvata", "ok"); boot();
    });
  }

  // In attesa di approvazione
  function renderAttesa() {
    el("top").hidden = false; el("nav").innerHTML = "";
    el("user").innerHTML = `<span>${esc(me.nome || me.email)}</span><button id="logout">Esci</button>`; el("logout").onclick = logout;
    el("view").innerHTML = `
      <div class="login card" style="max-width:520px">
        <img class="logo" src="assets/icons/icon-192.png" alt="">
        <h1 style="text-align:center">Ciao ${esc(me.nome || "")}, quasi pronti</h1>
        <div class="notice warn"><b>Il tuo account agente è in attesa di approvazione.</b> Ti contattiamo per concordare la provvigione; appena attivato, questa pagina si sblocca da sola.</div>
        <ol style="line-height:1.8">
          <li>Registrazione ricevuta ✅</li>
          <li>Email confermata ✅</li>
          <li><b>Approvazione da parte di Carminello</b>: in attesa</li>
        </ol>
        <p class="small muted">Hai fretta? Scrivici su <a href="https://wa.me/${CONFIG.WHATSAPP_CARMINELLO}" target="_blank" rel="noopener">WhatsApp +39 379 3504521</a>. Il tuo codice agente sarà <b>${esc(me.codice_agente || "assegnato all'attivazione")}</b>.</p>
        <p style="text-align:center"><button class="btn ghost" id="ricontrolla">Controlla di nuovo</button></p>
      </div>`;
    el("ricontrolla").onclick = boot;
  }

  function uscitaSicura(client, chiave) {
    // 1) cancella la sessione sul dispositivo (non può fallire) 2) avvisa il server 3) pulizia manuale per sicurezza
    return client.auth.signOut({ scope: "local" }).catch(() => {}).then(() => client.auth.signOut({ scope: "global" }).catch(() => {})).finally(() => {
      try { Object.keys(localStorage).forEach(k => { if (k === chiave || k.startsWith(chiave + "-") || (chiave === "" && /^sb-.*-auth-token/.test(k))) localStorage.removeItem(k); }); } catch (_) {}
    });
  }
  async function logout() { await uscitaSicura(db, "carminello-agenti-auth"); user = null; me = null; location.hash = ""; renderLogin(); }

  const DEMO = /[?&]demo=1/.test(location.search);
  function datiDemo() {
    const DAY = 86400000, now = Date.now(); let n = 400;
    const cl = [
      { id: "d1", ragione_sociale: "Pizzeria Da Gigi", nome: "Luigi", cognome: "Verdi", tipo: "b2b", approvato: true, telefono: "3331112233", email: "gigi@esempio.it", indirizzo: { via: "Via Roma 1", citta: "Prato", cap: "59100", prov: "PO" }, created_at: new Date(now - 200 * DAY).toISOString(), ritmo: 14, cart: 6 },
      { id: "d2", ragione_sociale: "Bar Centrale", nome: "Anna", cognome: "Bianchi", tipo: "b2b", approvato: true, telefono: "3334445566", email: "bar@esempio.it", indirizzo: { via: "Piazza Duomo 4", citta: "Firenze", cap: "50122", prov: "FI" }, created_at: new Date(now - 150 * DAY).toISOString(), ritmo: 21, cart: 3, ultimo: 50 },
      { id: "d3", ragione_sociale: "Ingrosso Alimentare Toscana", nome: "Marco", cognome: "Rossi", tipo: "rivenditore", approvato: true, telefono: "3337778899", email: "ingrosso@esempio.it", indirizzo: { via: "Via Industria 12", citta: "Sesto Fiorentino", cap: "50019", prov: "FI" }, created_at: new Date(now - 300 * DAY).toISOString(), ritmo: 30, cart: 20 },
      { id: "d4", ragione_sociale: "Trattoria La Pergola", nome: "Sara", cognome: "Neri", tipo: "b2b", approvato: false, telefono: "3339990011", email: "pergola@esempio.it", indirizzo: { via: "Via del Colle 8", citta: "Pistoia", cap: "51100", prov: "PT" }, created_at: new Date(now - 2 * DAY).toISOString(), ritmo: 0, cart: 0 }
    ];
    const ordini = [], provv = {};
    cl.forEach(c => { if (!c.ritmo) return; let t = now - (c.ultimo || 3) * DAY; while (t > now - 330 * DAY) {
      const d = new Date(t); const sub = c.cart * 32; const pagato = t < now - 5 * DAY; const mese = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
      ordini.push({ id: "o" + n, numero: n++, user_id: c.id, tipo: c.tipo, stato: pagato ? "spedito" : "da_pagare", pagato, metodo_pagamento: "bonifico", cartoni: c.cart, subtotale: sub, totale: sub, provvigione_pct: 20, provvigione: +(sub * 0.2).toFixed(2), created_at: d.toISOString(), agente_id: "agente-demo" });
      const r = provv[mese] = provv[mese] || { agente_id: "agente-demo", mese, ordini: 0, cartoni: 0, fatturato: 0, maturata: 0, liquidata: 0, in_attesa: 0 };
      r.ordini++; r.cartoni += c.cart; if (pagato) { r.fatturato += sub; r.maturata += sub * 0.2; if (t < now - 40 * DAY) r.liquidata += sub * 0.2; } else r.in_attesa += sub * 0.2;
      t -= (c.ritmo + Math.round(Math.random() * 6 - 3)) * DAY; } });
    return { clienti: cl, ordini: ordini.sort((a, b) => b.numero - a.numero), provv: Object.values(provv).sort((a, b) => b.mese.localeCompare(a.mese)), note: [{ id: "n1", user_id: "d2", tipo: "chiamata", esito: "richiamare", testo: "Ha finito le scorte tardi, richiamare lunedì", created_at: new Date(now - 10 * DAY).toISOString() }] };
  }
  async function boot() {
    if (DEMO) {
      user = { id: "agente-demo", email: "demo@esempio.it" }; me = { id: "agente-demo", nome: "Mario", cognome: "Rossi", email: "demo@esempio.it", telefono: "3331234567", ruolo: "agente", approvato: true, provvigione_pct: 20, codice_agente: "MARIO24" };
      el("top").hidden = false; el("user").innerHTML = `<span>Dati di prova</span><button id="logout">Esci</button>`; el("logout").onclick = () => location.search = "";
      await loadAll(); route(); return;
    }
    const { data } = await db.auth.getSession(); user = data.session ? data.session.user : null;
    if (!user) return renderLogin();
    const { data: p, error } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle(); me = p;
    if (error || !p) { await uscitaSicura(db, "carminello-agenti-auth"); return renderLogin("Non riesco a leggere il tuo profilo. Riprova."); }
    if (p.ruolo !== "agente") { await uscitaSicura(db, "carminello-agenti-auth"); return renderLogin(p.ruolo === "admin" ? "Questo è l'account del titolare: usa la dashboard." : "Questo account è un cliente Carminello, non un agente. Per ordinare usa il sito; se vuoi diventare agente scrivici su WhatsApp."); }
    if (!p.approvato) return renderAttesa();
    el("top").hidden = false;
    el("user").innerHTML = `<span>${esc(p.nome || p.email)}</span><button id="logout">Esci</button>`; el("logout").onclick = logout;
    await loadAll(); route(); avviaTempoReale(); swReg();
  }

  // ================================================================ DATI
  async function loadAll() {
    if (DEMO) {
      const d = datiDemo(); D.clienti = d.clienti; D.ordini = d.ordini; D.note = d.note; D.provv = d.provv; D.cfg = Object.assign({}, Stats.DEFAULT_CFG); D.prod = [{ id: "base", nome_it: "Base 33 cm — cartone da 20", pezzi: 20 }];
      D.byUser = {}; D.ordini.forEach(x => { (D.byUser[x.user_id] = D.byUser[x.user_id] || []).push(x); });
      D.noteBy = {}; D.note.forEach(x => { (D.noteBy[x.user_id] = D.noteBy[x.user_id] || []).push(x); });
      D.prezziBy = { d1: { base: 32 }, d2: { base: 33 }, d3: { base: 29 } };
      D.stat = {}; D.clienti.forEach(x => { D.stat[x.id] = Stats.cliente(x, D.byUser[x.id] || [], D.cfg); });
      return;
    }
    const [c, o, n, pv, i, pr, pz] = await Promise.all([
      db.from("profiles").select("*").eq("agente_id", user.id).order("created_at", { ascending: false }),
      db.from("orders").select("*").order("created_at", { ascending: false }).limit(3000),
      db.from("note_clienti").select("*").order("created_at", { ascending: false }),
      db.rpc("provvigioni_mensili"),
      db.from("impostazioni").select("chiave,valore").eq("chiave", "avvisi").maybeSingle(),
      db.from("products").select("id,nome_it,pezzi").eq("canale", "b2b").order("ordine"),
      db.from("prezzi_cliente").select("user_id,product_id,prezzo")
    ]);
    if (c.error || o.error) toast("Errore nel caricamento: " + (c.error || o.error).message, "err");
    D.clienti = c.data || []; D.ordini = (o.data || []).filter(x => x.user_id !== user.id); D.note = n.data || []; D.provv = pv.data || [];
    D.cfg = Object.assign({}, Stats.DEFAULT_CFG, (i.data && i.data.valore) || {}); D.prod = pr.data || [];
    D.byUser = {}; D.ordini.forEach(x => { (D.byUser[x.user_id] = D.byUser[x.user_id] || []).push(x); });
    D.noteBy = {}; D.note.forEach(x => { (D.noteBy[x.user_id] = D.noteBy[x.user_id] || []).push(x); });
    D.prezziBy = {}; (pz.data || []).forEach(x => { (D.prezziBy[x.user_id] = D.prezziBy[x.user_id] || {})[x.product_id] = x.prezzo; });
    D.stat = {}; D.clienti.forEach(x => { D.stat[x.id] = Stats.cliente(x, D.byUser[x.id] || [], D.cfg); });
  }
  const daChiamare = () => D.clienti.filter(c => ["rischio", "ritardo", "flessione"].includes(D.stat[c.id].stato));
  const daAttivare = () => D.clienti.filter(c => c.tipo !== "b2c" && !c.approvato);
  const prezzoTxt = c => { const p = D.prezziBy[c.id] || {}; const r = D.prod.map(x => p[x.id] != null ? money(p[x.id]) + (x.pezzi ? " (" + money(p[x.id] / x.pezzi) + " a base)" : "") : null).filter(Boolean); return r.length ? r.join(" · ") : null; };
  const resto = () => D.provv.reduce((t, r) => t + Number(r.maturata) - Number(r.liquidata), 0);

  // ================================================================ NOTIFICHE
  function beep() {
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const t0 = ctx.currentTime;
      [[880, 0], [1175, 0.18]].forEach(([f, dt]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.3, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.35); o.connect(g).connect(ctx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.4); });
    } catch (e) {}
  }
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  async function swReg() { if (!("serviceWorker" in navigator)) return null; try { return await navigator.serviceWorker.register("sw.js"); } catch (e) { console.error("sw", e); return null; } }
  function b64ToU8(b) { const p = "=".repeat((4 - b.length % 4) % 4); const s = (b + p).replace(/-/g, "+").replace(/_/g, "/"); const r = atob(s); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }
  async function pushAttiva() {
    const reg = await swReg(); if (!reg) return null; await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
    const disp = (isIOS() ? "iPhone/iPad" : /Android/.test(navigator.userAgent) ? "Android" : /Mac/.test(navigator.userAgent) ? "Mac" : "altro") + (standalone() ? " (app)" : " (browser)") + " · agente";
    const { error } = await db.rpc("admin_salva_push", { p_sub: sub.toJSON(), p_dispositivo: disp }); if (error) throw new Error(error.message);
    return sub;
  }
  async function pushStato() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "non_supportato";
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return "spento";
    const sub = await reg.pushManager.getSubscription(); return sub ? "attivo" : "spento";
  }
  async function attivaNotifiche() {
    if (!("Notification" in window)) { toast("Questo browser non supporta le notifiche", "err"); return; }
    if (isIOS() && !standalone()) { toast("Su iPhone: prima aggiungi l'app alla schermata Home (Condividi → Aggiungi alla schermata Home), poi attiva da lì", "err"); return; }
    const r = await Notification.requestPermission(); if (r !== "granted") { toast("Permesso negato: puoi cambiarlo dalle impostazioni del browser", "err"); return; }
    try { const sub = await pushAttiva(); toast(sub ? "Notifiche attivate: ti avvisiamo quando un tuo cliente ordina" : "Notifiche attive solo con l'app aperta", "ok"); }
    catch (e) { toast("Notifiche attive solo con l'app aperta (" + e.message + ")", "err"); }
    route();
  }
  let rtChannel = null;
  function avviaTempoReale() {
    if (rtChannel || DEMO) return;
    rtChannel = db.channel("agenti-ordini").on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, async payload => {
      await loadAll(); const o = payload.new; const c = D.clienti.find(x => x.id === o.user_id);
      if (c) { toast("Nuovo ordine di " + nome(c) + ": " + o.cartoni + " cartoni", "ok"); beep(); }
      route();
    }).subscribe();
    document.addEventListener("visibilitychange", () => { if (!document.hidden && user) refresh(); });
  }

  // ================================================================ NAVIGAZIONE
  const PAGES = [
    ["home", "Home", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>'],
    ["clienti", "Clienti", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><circle cx="17" cy="9" r="3"/><path d="M17 14c3 0 5 2 5 5"/></svg>'],
    ["nuovo", "Nuovo cliente", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>'],
    ["provvigioni", "Provvigioni", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 15l8-6M9 9h.01M15 15h.01"/></svg>'],
    ["profilo", "Profilo", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>']
  ];
  function renderNav(cur) {
    const n = daChiamare().length;
    el("nav").innerHTML = PAGES.map(([k, l, ic]) => `<a href="#/${k}" class="${cur === k ? "on" : ""}">${ic}${l}${k === "home" && n ? `<span class="cnt">${n}</span>` : ""}</a>`).join("");
  }
  function route() {
    if (!me || !me.approvato) return;
    const h = location.hash.replace(/^#\/?/, "") || "home"; const [page, arg] = h.split("/");
    renderNav(page === "cliente" ? "clienti" : page); window.scrollTo(0, 0);
    ({ home: vHome, clienti: vClienti, cliente: () => vCliente(arg), nuovo: vNuovo, provvigioni: vProvvigioni, profilo: vProfilo }[page] || vHome)();
  }
  window.addEventListener("hashchange", () => { if (user) route(); });
  async function refresh() { await loadAll(); route(); }
  const dbw = { rpc: (...a) => DEMO ? Promise.resolve({ error: { message: "Modalità prova: le modifiche non vengono salvate" } }) : db.rpc(...a) };
  function bindRows() { el("view").querySelectorAll("[data-go]").forEach(r => r.addEventListener("click", () => location.hash = r.getAttribute("data-go"))); }

  // ================================================================ HOME
  function vHome() {
    const mc = meseCorrente(); const m = D.provv.find(r => r.mese === mc) || { ordini: 0, cartoni: 0, fatturato: 0, maturata: 0, in_attesa: 0 };
    const chiamare = daChiamare().map(c => ({ c, s: D.stat[c.id], n: (D.noteBy[c.id] || [])[0] })).sort((a, b) => Stats.STATI[a.s.stato].prio - Stats.STATI[b.s.stato].prio);
    const att = daAttivare(); const now = new Date();
    el("view").innerHTML = `
      <div class="page-title"><h1>Ciao ${esc(me.nome || "")}</h1><span class="sub">${meseLabel(mc)}</span></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Clienti</div><div class="v">${D.clienti.length}</div><div class="d">${att.length ? att.length + " in attesa di attivazione" : "tutti attivi"}</div></div>
        <div class="kpi"><div class="l">Ordini del mese</div><div class="v">${m.ordini}</div><div class="d">${m.cartoni} cartoni</div></div>
        <div class="kpi"><div class="l">Provvigione del mese</div><div class="v">${money(m.maturata)}</div><div class="d">${Number(m.in_attesa) ? "+ " + money(m.in_attesa) + " su ordini non ancora pagati" : "su " + money(m.fatturato) + " di merce pagata"}</div></div>
        <div class="kpi ${resto() > 0.005 ? "alert" : ""}"><div class="l">Da ricevere</div><div class="v">${money(resto())}</div><div class="d"><a href="#/provvigioni">dettaglio provvigioni</a></div></div>
      </div>
      ${att.length ? `<div class="notice info">${att.length === 1 ? "Un cliente aspetta" : att.length + " clienti aspettano"} l'attivazione da parte di Carminello (prezzo da concordare): ${att.map(c => `<a href="#/cliente/${c.id}">${esc(nome(c))}</a>`).join(", ")}.</div>` : ""}
      <div class="card"><h2>Da chiamare <span class="muted small">(${chiamare.length})</span></h2>
        ${chiamare.length ? chiamare.map(x => callCard(x)).join("") : '<p class="muted" style="margin:0">Nessuno da chiamare: i tuoi clienti stanno ordinando con il loro ritmo.</p>'}
      </div>
      <div class="card"><h2>Cartoni dei tuoi clienti, ultimi 12 mesi</h2>${barChart(Stats.mensile(D.ordini, 12, now), { val: x => x.cartoni })}</div>
      <div class="card"><h2>Fai scaricare l'app al cliente</h2>
        <div style="display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap">
          <div id="h-qr" style="cursor:pointer" title="Tocca per ingrandire">${qrSvg(linkApp(), 150)}</div>
          <div style="flex:1;min-width:220px">
            <p class="small" style="margin:0 0 .5rem">Il cliente inquadra questo QR con la fotocamera: si apre l'app rossa <b>già collegata a te</b>. Poi si registra come esercente e Carminello lo attiva con il prezzo.</p>
            <p class="small muted" style="margin:0 0 .6rem">Per averla come app sul telefono: Android → menu di Chrome → "Aggiungi a schermata Home"; iPhone → Condividi → "Aggiungi alla schermata Home".</p>
            <div class="actions"><button class="btn" id="h-qr-big">Mostra il QR a schermo intero</button><button class="btn ghost" id="h-share">Condividi il link</button></div>
          </div>
        </div>
      </div>`;
    bindCallButtons(); bindRows(); el("h-share").onclick = condividiLink;
    const apriQr = () => qrModal("Scarica l'app Carminello", linkApp(), "Fai inquadrare il QR al cliente: l'app si apre già collegata a te.");
    el("h-qr").onclick = apriQr; el("h-qr-big").onclick = apriQr;
  }
  function callCard(x) {
    const { c, s, n } = x; const t = tel(c), w = wa(t);
    return `<div class="call ${s.stato}">
      <div>
        <div class="name"><a href="#/cliente/${c.id}">${esc(nome(c))}</a> <span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></div>
        <div class="why">${esc(Stats.spiega(s))}</div>
        <div class="last">${s.n} ordini · ${s.cartoni} cartoni${n ? ` · ultimo contatto ${dateS(n.created_at)}: ${esc(NOTA_TIPO[n.tipo] || n.tipo)}${n.esito ? ", " + esc(n.esito) : ""}` : " · mai contattato"}</div>
      </div>
      <div class="side">
        <div class="actions">${t ? `<a class="btn sm tel" href="tel:${esc(t)}">Chiama</a>` : ""}${w ? `<a class="btn sm wa" href="${w}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div>
        <button class="btn sm ghost" data-nota="${c.id}">Segna contatto</button>
      </div></div>`;
  }
  function bindCallButtons() { el("view").querySelectorAll("[data-nota]").forEach(b => b.onclick = () => notaModal(b.getAttribute("data-nota"))); }
  function notaModal(uid) {
    const c = D.clienti.find(x => x.id === uid);
    modal(`<h2>Contatto con ${esc(nome(c))}</h2>
      <div class="row"><div class="field"><label>Tipo</label><select id="n-tipo">${Object.entries(NOTA_TIPO).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label>Esito</label><select id="n-esito"><option value="">—</option>${ESITI.map(e => `<option>${e}</option>`).join("")}</select></div></div>
      <div class="field"><label>Cosa ha detto / cosa fare</label><textarea id="n-testo" placeholder="Es. ripasso martedì, ordina la settimana prossima…"></textarea></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn ghost" id="n-cancel">Annulla</button><button class="btn" id="n-save">Salva</button></div>`);
    el("n-cancel").onclick = closeModal;
    el("n-save").onclick = async () => {
      const tipo = el("n-tipo").value === "visita" ? "nota" : el("n-tipo").value;
      const testo = (el("n-tipo").value === "visita" ? "Visita: " : "") + (el("n-testo").value.trim() || (NOTA_TIPO[el("n-tipo").value] + (el("n-esito").value ? ": " + el("n-esito").value : "")));
      const { error } = await dbw.rpc("agente_aggiungi_nota", { p_user_id: uid, p_tipo: tipo, p_testo: testo, p_esito: el("n-esito").value || null });
      if (error) { toast(error.message, "err"); return; }
      closeModal(); toast("Contatto salvato", "ok"); await refresh();
    };
  }
  function barChart(serie, opts) {
    const W = 720, H = 200, padL = 36, padB = 26, padT = 14; const n = serie.length; const bw = (W - padL - 10) / n;
    const max = Math.max(1, ...serie.map(s => opts.val(s))); const y = v => padT + (H - padT - padB) * (1 - v / max); let g = "";
    serie.forEach((s, i) => { const x = padL + i * bw + bw * 0.15, w = bw * 0.7, v = opts.val(s); g += `<rect class="bar" x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="3"><title>${v}</title></rect>`; if (v) g += `<text x="${x + w / 2}" y="${y(v) - 4}" text-anchor="middle">${v}</text>`; g += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(s.label)}</text>`; });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="max-height:220px">${g}</svg>`;
  }
  async function condividiLink() {
    const link = linkCliente(); const testo = "Registrati su Carminello, le basi pizza pronte: " + link;
    if (navigator.share) { try { await navigator.share({ title: "Carminello", text: testo, url: link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(link); toast("Link copiato", "ok"); } catch (e) { prompt("Copia il link:", link); }
  }

  // ================================================================ CLIENTI
  let cliQ = "";
  function vClienti() {
    let list = D.clienti.map(c => ({ c, s: D.stat[c.id] }));
    if (cliQ) { const q = cliQ.toLowerCase(); list = list.filter(x => (nome(x.c) + " " + (x.c.email || "") + " " + ((x.c.indirizzo || {}).citta || "")).toLowerCase().includes(q)); }
    list.sort((a, b) => Stats.STATI[a.s.stato].prio - Stats.STATI[b.s.stato].prio || nome(a.c).localeCompare(nome(b.c)));
    el("view").innerHTML = `
      <div class="page-title"><h1>I tuoi clienti</h1><span class="sub">${list.length} in elenco</span></div>
      <div class="seg"><input class="search" id="cli-q" placeholder="Cerca nome, città, email…" value="${esc(cliQ)}"><a class="btn" href="#/nuovo" style="margin-left:auto">+ Nuovo cliente</a></div>
      ${list.length ? `<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Cliente</th><th>Stato</th><th class="num">Ordini</th><th class="num">Cartoni</th><th>Ultimo</th><th>Prossimo atteso</th><th>Prezzo</th></tr></thead><tbody>
        ${list.map(({ c, s }) => `<tr class="click" data-go="#/cliente/${c.id}">
          <td><b>${esc(nome(c))}</b><br><span class="small muted">${TIPO[c.tipo]} · ${esc((c.indirizzo || {}).citta || "")}${c.tipo !== "b2c" && !c.approvato ? ' · <span class="pill unpaid">in attesa di attivazione</span>' : ""}</span></td>
          <td><span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></td>
          <td class="num">${s.n}</td><td class="num">${s.cartoni}</td>
          <td class="nowrap">${s.ultimo ? dateS(s.ultimo) + ` <span class="muted small">(${s.giorniDaUltimo} gg)</span>` : "—"}</td>
          <td class="nowrap">${s.atteso ? dateS(s.atteso) : "—"}</td>
          <td class="small">${esc(prezzoTxt(c) || "da concordare")}</td></tr>`).join("")}
      </tbody></table></div></div>` : `<div class="card"><p class="muted" style="margin:0">Non hai ancora clienti. <a href="#/nuovo">Registra il primo</a> o condividi il tuo link.</p></div>`}`;
    el("cli-q").addEventListener("input", e => { cliQ = e.target.value; vClienti(); const i = el("cli-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    bindRows();
  }
  function vCliente(uid) {
    const c = D.clienti.find(x => x.id === uid); if (!c) { el("view").innerHTML = '<div class="notice err">Cliente non trovato o non collegato a te.</div>'; return; }
    const s = D.stat[c.id]; const note = D.noteBy[c.id] || []; const a = c.indirizzo || {}; const t = tel(c), w = wa(t); const tutti = D.byUser[c.id] || [];
    const provvCliente = tutti.filter(o => o.stato !== "annullato" && o.pagato).reduce((x, o) => x + Number(o.provvigione || 0), 0);
    el("view").innerHTML = `
      <p><a href="#/clienti">← I tuoi clienti</a></p>
      <div class="card head-cli">
        <div class="info">
          <h1 style="margin-bottom:.3rem">${esc(nome(c))} <span class="pill ${c.tipo}">${TIPO[c.tipo]}</span> <span class="pill ${Stats.STATI[s.stato].colore}">${Stats.STATI[s.stato].label}</span></h1>
          <p style="margin:0 0 .6rem;color:var(--ink-2)">${esc(Stats.spiega(s))}</p>
          ${c.tipo !== "b2c" && !c.approvato ? '<div class="notice warn small">In attesa di attivazione: Carminello deve concordare il prezzo e attivarlo. Fino ad allora non può ordinare.</div>' : ""}
          <dl class="kv">
            <dt>Referente</dt><dd>${esc(((c.nome || "") + " " + (c.cognome || "")).trim() || "—")}</dd>
            <dt>Contatti</dt><dd>${esc(c.email || "")}${t ? " · " + esc(t) : ""}</dd>
            <dt>Indirizzo</dt><dd>${esc([a.via, (a.cap || "") + " " + (a.citta || ""), a.prov].filter(x => x && x.trim()).join(", ") || "—")}</dd>
            <dt>Prezzo</dt><dd>${esc(prezzoTxt(c) || "da concordare con Carminello")}</dd>
            <dt>Cliente dal</dt><dd>${dateS(c.created_at)}</dd>
          </dl>
        </div>
        <div class="actions" style="flex-direction:column;align-items:stretch">
          ${t ? `<a class="btn tel" href="tel:${esc(t)}">Chiama</a>` : ""}${w ? `<a class="btn wa" href="${w}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          <button class="btn ghost" data-nota="${c.id}">Segna contatto</button>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="l">Ordini</div><div class="v">${s.n}</div><div class="d">${s.primo ? "dal " + dateS(s.primo) : ""}</div></div>
        <div class="kpi"><div class="l">Cartoni</div><div class="v">${s.cartoni}</div><div class="d">${s.n ? (s.cartoni / s.n).toFixed(1) + " a ordine" : ""}</div></div>
        <div class="kpi"><div class="l">Ritmo</div><div class="v">${s.intervallo ? "ogni " + s.intervallo + " gg" : "—"}</div><div class="d">${s.atteso ? "prossimo atteso " + dateS(s.atteso) : ""}</div></div>
        <div class="kpi"><div class="l">Tua provvigione</div><div class="v">${money(provvCliente)}</div><div class="d">sugli ordini pagati</div></div>
      </div>
      <div class="grid two">
        <div class="card"><h2>Storico ordini</h2>
          ${tutti.length ? `<ul class="timeline">${tutti.map((o, i) => { const next = tutti[i + 1]; const gap = next ? Stats.giorni(new Date(next.created_at), new Date(o.created_at)) : null; return `<li><span class="nowrap">${dateS(o.created_at)}</span><span>${o.cartoni} cartoni · ${PM[o.metodo_pagamento]} <span class="pill ${o.stato}">${ST[o.stato]}</span> ${o.pagato ? '<span class="pill paid">pagato</span>' : ""}${gap != null ? `<br><span class="gap">${gap} giorni dopo il precedente</span>` : ""}</span><b class="num">${money(o.subtotale)}<br><span class="small muted">provv. ${money(o.provvigione)}</span></b></li>`; }).join("")}</ul>` : '<p class="muted">Nessun ordine ancora.</p>'}
        </div>
        <div class="card"><h2>Le tue note <span class="muted small">(${note.length})</span></h2>
          ${note.length ? note.map(n => `<div class="note"><div class="m">${dateL(n.created_at)} · ${NOTA_TIPO[n.tipo] || n.tipo}${n.esito ? ' · <span class="esito">' + esc(n.esito) + "</span>" : ""} <a href="#" data-delnota="${n.id}" class="muted" title="Elimina">✕</a></div>${esc(n.testo)}</div>`).join("") : '<p class="muted small">Nessuna nota. Usa "Segna contatto" dopo una chiamata o una visita.</p>'}
        </div>
      </div>`;
    bindCallButtons();
    el("view").querySelectorAll("[data-delnota]").forEach(x => x.onclick = async e => { e.preventDefault(); if (!confirm("Eliminare questa nota?")) return; const { error } = await dbw.rpc("agente_elimina_nota", { p_id: x.getAttribute("data-delnota") }); if (error) toast(error.message, "err"); else refresh(); });
  }

  // ================================================================ NUOVO CLIENTE
  function pivaValida(p) { if (!/^\d{11}$/.test(p)) return false; let s = 0; for (let i = 0; i < 11; i++) { let d = +p[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; }
  function vNuovo() {
    el("view").innerHTML = `
      <div class="page-title"><h1>Nuovo cliente</h1><span class="sub">lo registri tu, lui sceglie solo la password</span></div>
      <div class="grid two">
        <div class="card">
          <form id="nc" novalidate>
            <div class="seg"><button type="button" class="on" data-tipo="b2b">Esercente</button><button type="button" data-tipo="rivenditore">Rivenditore / grossista</button></div>
            <div class="field"><label>Partita IVA</label><input id="c-piva" inputmode="numeric" maxlength="11" autocomplete="off" placeholder="11 cifre: compila i dati da solo"><div class="small muted" id="c-piva-msg"></div></div>
            <div class="field"><label>Ragione sociale / nome del locale</label><input id="c-rs"></div>
            <div class="field"><label>Via e numero</label><input id="c-via"></div>
            <div class="row"><div class="field"><label>Città</label><input id="c-citta"></div><div class="field"><label>CAP</label><input id="c-cap" inputmode="numeric" maxlength="5"></div></div>
            <div class="row"><div class="field"><label>Provincia</label><input id="c-prov" maxlength="2" style="text-transform:uppercase"></div><div class="field"><label>Codice SDI (facoltativo)</label><input id="c-sdi" maxlength="7" style="text-transform:uppercase"></div></div>
            <div class="row"><div class="field"><label>Nome del referente</label><input id="c-nome"></div><div class="field"><label>Cognome</label><input id="c-cognome"></div></div>
            <div class="row"><div class="field"><label>Telefono</label><input id="c-tel" type="tel"></div><div class="field"><label>Email (riceverà il link per la password)</label><input id="c-email" type="email"></div></div>
            <div class="field"><label>PEC (facoltativa)</label><input id="c-pec" type="email"></div>
            <div class="err" id="c-err" hidden></div>
            <button class="btn block" type="submit" id="c-invia">Registra e invia l'email al cliente</button>
            <p class="small muted" style="margin:.6rem 0 0">Il cliente riceve un'email per scegliere la password. Carminello lo contatta per il prezzo e lo attiva: da quel momento ordina da solo dall'app rossa e tu vedi tutto qui.</p>
          </form>
        </div>
        <div>
          <div class="card"><h2>Oppure si registra da solo</h2>
            <p class="small">Con il tuo link o il QR il cliente compila la registrazione dal suo telefono e resta collegato a te.</p>
            <p style="text-align:center" id="n-qr" title="Tocca per ingrandire">${qrSvg(linkCliente(), 200)}</p>
            <p class="small" style="word-break:break-all"><a href="${esc(linkCliente())}" target="_blank" rel="noopener">${esc(linkCliente())}</a></p>
            <div class="actions"><button class="btn" id="n-share">Condividi</button><a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent("Registrati su Carminello, le basi pizza pronte: " + linkCliente())}" target="_blank" rel="noopener">Manda su WhatsApp</a></div>
          </div>
        </div>
      </div>`;
    let tipo = "b2b"; el("view").querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => { tipo = b.getAttribute("data-tipo"); el("view").querySelectorAll("[data-tipo]").forEach(x => x.classList.toggle("on", x === b)); });
    el("n-share").onclick = condividiLink; el("n-qr").onclick = () => qrModal("Registrati su Carminello", linkCliente(), "Il cliente compila la registrazione dal suo telefono e resta collegato a te.");
    // Partita IVA → dati dall'archivio VIES
    const inp = el("c-piva"), msg = el("c-piva-msg"); let ultima = "";
    async function cerca() {
      const piva = inp.value.replace(/\D/g, ""); inp.value = piva; msg.style.color = "";
      if (piva.length !== 11 || piva === ultima) return;
      if (!pivaValida(piva)) { ultima = piva; msg.textContent = "Partita IVA non corretta: controlla le cifre."; msg.style.color = "var(--red)"; return; }
      ultima = piva; msg.textContent = "Cerco i dati dell'azienda…";
      const { data, error } = await db.functions.invoke("piva", { body: { piva } });
      if (error || !data) { msg.textContent = "Archivio non raggiungibile: compila a mano."; msg.style.color = "var(--red)"; return; }
      if (!data.valid) { msg.textContent = "Non trovata nell'archivio europeo (capita per le ditte individuali): compila a mano."; msg.style.color = "var(--red)"; return; }
      if (!el("c-rs").value.trim()) el("c-rs").value = data.ragione_sociale || "";
      if (!el("c-via").value.trim()) { el("c-via").value = data.via || ""; el("c-citta").value = data.citta || ""; el("c-cap").value = data.cap || ""; el("c-prov").value = data.prov || ""; }
      msg.textContent = "Trovata: " + (data.ragione_sociale || "") + (data.citta ? " · " + data.citta : ""); msg.style.color = "var(--green)";
    }
    inp.addEventListener("input", () => { if (inp.value.replace(/\D/g, "").length === 11) cerca(); }); inp.addEventListener("blur", cerca);
    el("nc").addEventListener("submit", async e => {
      e.preventDefault(); const v = id => el(id).value.trim(); const err = m => { el("c-err").textContent = m; el("c-err").hidden = false; }; el("c-err").hidden = true;
      if (!pivaValida(v("c-piva"))) return err("Serve una Partita IVA corretta (11 cifre).");
      if (!v("c-rs") || !v("c-via") || !v("c-citta") || !v("c-cap")) return err("Compila ragione sociale e indirizzo.");
      if (!v("c-nome") || !v("c-tel") || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("c-email"))) return err("Servono nome del referente, telefono e un'email valida.");
      const btn = el("c-invia"); btn.disabled = true; btn.textContent = "Invio in corso…";
      const body = { tipo, piva: v("c-piva"), ragione_sociale: v("c-rs"), nome: v("c-nome"), cognome: v("c-cognome"), telefono: v("c-tel"), email: v("c-email"), sdi: v("c-sdi"), pec: v("c-pec"), indirizzo: { via: v("c-via"), citta: v("c-citta"), cap: v("c-cap"), prov: v("c-prov").toUpperCase() } };
      const { data, error } = DEMO ? { data: { error: "Modalità prova: nessun invito inviato" } } : await db.functions.invoke("invita-cliente", { body });
      btn.disabled = false; btn.textContent = "Registra e invia l'email al cliente";
      let m = null; if (error) { try { m = (await error.context.json()).error; } catch (_) { m = error.message; } } else if (data && data.error) m = data.error;
      if (m) return err(m);
      el("view").innerHTML = `<div class="login card" style="max-width:520px"><h1 style="text-align:center">Cliente registrato!</h1>
        <div class="notice ok"><b>${esc(v("c-rs"))}</b> è collegato a te. A <b>${esc(v("c-email"))}</b> è partita l'email per scegliere la password.</div>
        <ol style="line-height:1.8"><li>Il cliente apre l'email e sceglie la password (digli di controllare anche la posta indesiderata).</li><li>Carminello lo contatta, concorda il prezzo e lo attiva.</li><li>Da quel momento ordina da solo dall'app rossa e tu lo vedi qui, con la tua provvigione.</li></ol>
        <div class="actions" style="justify-content:center"><a class="btn" href="#/clienti">Vai ai clienti</a><a class="btn ghost" href="#/nuovo">Registra un altro</a></div></div>`;
      loadAll();
    });
  }

  // ================================================================ PROVVIGIONI
  function vProvvigioni() {
    const rows = D.provv; const tot = rows.reduce((t, r) => ({ maturata: t.maturata + Number(r.maturata), liquidata: t.liquidata + Number(r.liquidata), attesa: t.attesa + Number(r.in_attesa) }), { maturata: 0, liquidata: 0, attesa: 0 });
    el("view").innerHTML = `
      <div class="page-title"><h1>Le tue provvigioni</h1><span class="sub">${me.provvigione_pct}% sulla merce degli ordini pagati</span></div>
      <div class="kpis">
        <div class="kpi"><div class="l">Maturate in totale</div><div class="v">${money(tot.maturata)}</div><div class="d">da quando lavori con noi</div></div>
        <div class="kpi"><div class="l">Già ricevute</div><div class="v">${money(tot.liquidata)}</div><div class="d">liquidate da Carminello</div></div>
        <div class="kpi ${resto() > 0.005 ? "alert" : ""}"><div class="l">Da ricevere</div><div class="v">${money(resto())}</div><div class="d">maturate, non ancora liquidate</div></div>
        <div class="kpi"><div class="l">In attesa</div><div class="v">${money(tot.attesa)}</div><div class="d">su ordini non ancora pagati</div></div>
      </div>
      <div class="card">
        ${rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Mese</th><th class="num">Ordini</th><th class="num">Cartoni</th><th class="num">Merce pagata</th><th class="num">Provvigione</th><th class="num">In attesa</th><th>Stato</th></tr></thead><tbody>
          ${rows.map(r => { const rs = Number(r.maturata) - Number(r.liquidata); return `<tr><td class="nowrap"><b>${esc(meseLabel(r.mese))}</b></td><td class="num">${r.ordini}</td><td class="num">${r.cartoni}</td><td class="num">${money(r.fatturato)}</td><td class="num"><b>${money(r.maturata)}</b></td><td class="num muted">${Number(r.in_attesa) ? money(r.in_attesa) : "—"}</td><td>${Number(r.maturata) <= 0 ? '<span class="muted small">—</span>' : rs <= 0.005 ? '<span class="pill paid">ricevuta</span>' : `<span class="pill unpaid">da ricevere ${money(rs)}</span>`}</td></tr>`; }).join("")}
        </tbody></table></div>` : '<p class="muted" style="margin:0">Ancora nessuna provvigione: arriva con il primo ordine pagato di un tuo cliente.</p>'}
      </div>
      <div class="card"><h2>Come si calcola</h2>
        <p class="small">La provvigione è il <b>${me.provvigione_pct}%</b> del valore della merce (senza spedizione e senza supplemento contrassegno) di ogni ordine dei tuoi clienti. Matura quando l'ordine risulta <b>pagato</b>; se un ordine viene annullato non conta. La percentuale viene fissata su ogni ordine al momento dell'ordine. I mesi sono quelli della data dell'ordine. Quando Carminello ti paga, il mese passa a "ricevuta".</p>
      </div>`;
  }

  // ================================================================ PROFILO
  function vProfilo() {
    el("view").innerHTML = `
      <div class="page-title"><h1>Il tuo profilo</h1><span class="sub">codice <b>${esc(me.codice_agente || "—")}</b> · versione ${CONFIG.VERSIONE}</span></div>
      <div class="grid two">
        <div>
          <div class="card"><h2>I tuoi dati</h2>
            <form id="pf">
              <div class="row"><div class="field"><label>Nome</label><input id="p-nome" value="${esc(me.nome || "")}"></div><div class="field"><label>Cognome</label><input id="p-cognome" value="${esc(me.cognome || "")}"></div></div>
              <div class="row"><div class="field"><label>Telefono</label><input id="p-tel" type="tel" value="${esc(me.telefono || "")}"></div><div class="field"><label>Email</label><input value="${esc(me.email || "")}" disabled></div></div>
              <div class="row"><div class="field"><label>Partita IVA</label><input id="p-piva" value="${esc(me.piva || "")}" maxlength="11"></div><div class="field"><label>Ragione sociale</label><input id="p-rs" value="${esc(me.ragione_sociale || "")}"></div></div>
              <button class="btn" type="submit">Salva</button>
            </form>
          </div>
          <div class="card"><h2>Accordo</h2><p class="small muted" style="margin:0">Provvigione concordata: <b>${me.provvigione_pct}%</b>. ${me.accordo_accettato_il ? "Accordo accettato il " + dateS(me.accordo_accettato_il) + "." : "L'accordo scritto arriverà in una prossima versione dell'app."}</p></div>
        </div>
        <div>
          <div class="card"><h2>Notifiche</h2>
            <p class="small">Ricevi un avviso sul telefono quando un tuo cliente fa un ordine, anche ad app chiusa.</p>
            <p class="small">Permesso: <b>${!("Notification" in window) ? "non supportato" : Notification.permission === "granted" ? "concesso" : Notification.permission === "denied" ? "bloccato (sbloccalo dalle impostazioni del browser)" : "da concedere"}</b> · Su questo dispositivo: <b id="p-push">controllo…</b></p>
            ${isIOS() && !standalone() ? '<div class="notice warn small">Su iPhone le notifiche funzionano solo dall\'app aggiunta alla schermata Home: Condividi → "Aggiungi alla schermata Home", poi apri l\'icona e attiva da lì.</div>' : ""}
            <div class="actions"><button class="btn" id="p-notif">Attiva le notifiche</button></div>
          </div>
          <div class="card"><h2>Il tuo link</h2>
            <p class="small" style="word-break:break-all"><a href="${esc(linkCliente())}" target="_blank" rel="noopener">${esc(linkCliente())}</a></p>
            <div class="actions"><button class="btn" id="p-share">Condividi</button><button class="btn ghost" id="p-qr">QR per scaricare l'app</button><a class="btn ghost" href="#/nuovo">Registrazione sul posto</a></div>
          </div>
          <div class="card"><h2>Aiuto</h2><p class="small" style="margin:0">Per prezzi, attivazioni e pagamenti scrivi a Carminello su <a href="https://wa.me/${CONFIG.WHATSAPP_CARMINELLO}" target="_blank" rel="noopener">WhatsApp +39 379 3504521</a>.</p></div>
          <p style="text-align:center"><button class="btn ghost" id="p-logout">Esci dall'app</button></p>
        </div>
      </div>`;
    el("pf").addEventListener("submit", async e => {
      e.preventDefault(); const v = id => el(id).value.trim();
      const { error } = await dbw.rpc("aggiorna_profilo", { p_dati: { nome: v("p-nome"), cognome: v("p-cognome"), telefono: v("p-tel"), piva: v("p-piva").replace(/\D/g, ""), ragione_sociale: v("p-rs") } });
      if (error) toast(error.message, "err"); else { toast("Dati salvati", "ok"); const { data: p } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle(); if (p) me = p; route(); }
    });
    el("p-notif").onclick = attivaNotifiche; el("p-share").onclick = condividiLink; el("p-logout").onclick = logout;
    el("p-qr").onclick = () => qrModal("Scarica l'app Carminello", linkApp(), "Fai inquadrare il QR al cliente: l'app si apre già collegata a te.");
    pushStato().then(st => { const x = el("p-push"); if (x) x.textContent = { attivo: "attive (anche ad app chiusa)", spento: "non attive", non_supportato: "non supportate da questo browser" }[st]; });
  }

  // ================================================================ AVVIO
  db.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { user = null; me = null; } if (ev === "PASSWORD_RECOVERY") renderNuovaPassword(); });
  if (/type=recovery/.test(location.hash) && /access_token=/.test(location.hash)) { renderNuovaPassword(); }
  else boot().catch(e => { console.error("boot", e); toast("Errore: " + e.message, "err"); });
})();
