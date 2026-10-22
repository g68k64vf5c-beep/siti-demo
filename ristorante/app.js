(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const STORE_KEY = "borgo_reservations";
  // URL della Web App di Google Apps Script (vedi google-calendar/LEGGIMI.md).
  // Vuoto = modalità demo: disponibilità simulata e prenotazioni solo nel browser.
  const CALENDAR_ENDPOINT = "https://script.google.com/macros/s/AKfycbxzD6cKtNfVcqOmuVX5IR-eJWdnyHxHh9MfPE5kdaITO3HQVW7WEEpozEyTBcjSQhEgNw/exec";

  /* ---------- Opening hours (0 = domenica) ---------- */
  const HOURS = {
    0: { pranzo: ["12:00", "12:30", "13:00", "13:30", "14:00"], cena: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"] },
    1: { pranzo: [], cena: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"] },
    2: null,
    3: { pranzo: ["12:00", "12:30", "13:00", "13:30"], cena: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"] },
    4: { pranzo: ["12:00", "12:30", "13:00", "13:30"], cena: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"] },
    5: { pranzo: ["12:00", "12:30", "13:00", "13:30"], cena: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"] },
    6: { pranzo: ["12:00", "12:30", "13:00", "13:30", "14:00"], cena: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"] },
  };
  const LABEL_HOURS = { 0: ["12:00 – 15:00", "19:00 – 24:00"], 1: [null, "19:00 – 23:30"], 3: ["12:00 – 14:30", "19:00 – 23:30"], 4: ["12:00 – 14:30", "19:00 – 23:30"], 5: ["12:00 – 14:30", "19:00 – 23:30"], 6: ["12:00 – 15:00", "19:00 – 24:00"] };

  /* ---------- Menu ---------- */
  const MENU = {
    Antipasti: [
      ["Tagliere del Borgo", "Salumi di cinta, pecorini stagionati, miele di castagno", 16, "Da condividere"],
      ["Battuta di manzo", "Tuorlo marinato, senape antica, nocciole tostate", 14],
      ["Fiori di zucca fritti", "Ripieni di ricotta e acciuga, pastella alla birra", 10],
      ["Burrata e pomodori", "Pomodori dell'orto, basilico, olio nuovo", 12, "Veg"],
    ],
    Primi: [
      ["Tagliatelle al ragù bianco", "Porcini e salsiccia di cinta senese", 16, "Firma"],
      ["Pici cacio e pepe", "Pecorino di fossa e pepe Tellicherry", 14],
      ["Ravioli del plin", "Ripieni di arrosto, burro e salvia", 15],
      ["Risotto alla zucca", "Amaretto sbriciolato e salvia croccante", 15, "Veg"],
    ],
    Secondi: [
      ["Tagliata alla brace", "Manzo frollato 30 giorni, patate al rosmarino", 24, "Firma"],
      ["Guancia brasata", "Al Chianti, polenta morbida di mais otto file", 21],
      ["Baccalà in umido", "Ceci, pomodoro e olive taggiasche", 19],
      ["Melanzana alla parmigiana", "Ricetta della nonna, cotta nel forno a legna", 15, "Veg"],
    ],
    Pizze: [
      ["Margherita del Borgo", "Pomodoro San Marzano, fiordilatte, basilico", 9],
      ["Crudo e rucola", "Crudo di Parma 24 mesi, rucola, grana", 13],
      ["Salsiccia e friarielli", "Provola affumicata e peperoncino", 12],
    ],
    Dolci: [
      ["Tiramisù al cucchiaio", "Savoiardi fatti in casa e caffè di moka", 7],
      ["Panna cotta ai frutti rossi", "Vaniglia Bourbon e coulis", 6],
      ["Cantucci e Vin Santo", "Per due persone", 9],
    ],
    Vini: [
      ["Chianti Classico DOCG", "Calice €7 · Bottiglia", 28],
      ["Brunello di Montalcino", "Bottiglia, annata 2018", 65],
      ["Vermentino di Bolgheri", "Calice €6 · Bottiglia", 24],
      ["Franciacorta Brut", "Bottiglia", 38],
    ],
  };

  const tabsEl = $("#menuTabs"), listEl = $("#menuList");
  tabsEl.innerHTML = Object.keys(MENU).map((k, i) =>
    `<button class="tab ${i ? "" : "is-active"}" role="tab" aria-selected="${!i}" data-tab="${k}">${k}</button>`).join("");
  function renderMenu(cat) {
    listEl.innerHTML = MENU[cat].map(([n, d, p, tag], i) => `
      <div class="menu-item" style="animation-delay:${i * 50}ms">
        <div class="row"><h3>${n}${tag ? `<span class="tag">${tag}</span>` : ""}</h3><span class="fill"></span><span class="price">€${p}</span></div>
        <p>${d}</p>
      </div>`).join("");
  }
  tabsEl.addEventListener("click", e => {
    const t = e.target.closest(".tab"); if (!t) return;
    $$(".tab").forEach(b => { b.classList.toggle("is-active", b === t); b.setAttribute("aria-selected", b === t); });
    renderMenu(t.dataset.tab);
  });
  renderMenu("Antipasti");

  /* ---------- Header / open state ---------- */
  const topbar = $(".topbar");
  const onScroll = () => topbar.classList.toggle("is-scrolled", scrollY > 30);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  (function openState() {
    const now = new Date(), wd = now.getDay(), mins = now.getHours() * 60 + now.getMinutes();
    const lbl = LABEL_HOURS[wd];
    const st = $("#openState"), hr = $("#openHours"), dot = $("#openDot");
    if (!lbl) { st.textContent = "Oggi chiuso"; hr.textContent = "Riapriamo domani"; dot.classList.add("is-closed"); return; }
    if (mins < 15 * 60 && lbl[0]) { st.textContent = mins >= 12 * 60 ? "Aperto ora" : "Aperto a pranzo"; hr.textContent = lbl[0]; }
    else { st.textContent = mins >= 19 * 60 ? "Aperto ora" : "Aperto stasera"; hr.textContent = lbl[1]; }
  })();

  /* ---------- Booking state ---------- */
  const state = { pane: 1, guests: 2, date: null, service: "cena", time: null, area: "sala" };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const wdFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
  const monFmt = new Intl.DateTimeFormat("it-IT", { month: "short" });
  const longFmt = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const short = f => f.replace(".", "");

  // Guests
  $("#guests").innerHTML = [...Array(10)].map((_, i) => `<button type="button" class="guest" data-g="${i + 1}" aria-label="${i + 1} persone">${i + 1}</button>`).join("")
    + `<button type="button" class="guest" data-g="12" aria-label="Più di 10 persone">10+</button>`;
  $("#guests").addEventListener("click", e => {
    const b = e.target.closest(".guest"); if (!b) return;
    state.guests = Number(b.dataset.g);
    paintGuests();
    renderTimes();
  });
  function paintGuests() {
    $$(".guest").forEach(b => b.classList.toggle("is-selected", Number(b.dataset.g) === state.guests));
    $("#groupHint").hidden = state.guests <= 10;
  }

  // Days
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = [...Array(30)].map((_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
  $("#days").innerHTML = days.map((d, i) => {
    const closed = !HOURS[d.getDay()];
    const top = i === 0 ? "Oggi" : i === 1 ? "Domani" : short(wdFmt.format(d));
    return `<button type="button" class="day" data-date="${iso(d)}" ${closed ? "disabled aria-label='Chiuso'" : ""}>
      <small>${top}</small><b>${d.getDate()}</b><em>${closed ? "chiuso" : short(monFmt.format(d))}</em></button>`;
  }).join("");
  $("#days").addEventListener("click", e => {
    const b = e.target.closest(".day"); if (!b || b.disabled) return;
    selectDay(b.dataset.date);
  });
  function selectDay(dateIso) {
    state.date = dateIso;
    state.time = null;
    $$(".day").forEach(d => d.classList.toggle("is-selected", d.dataset.date === dateIso));
    const h = HOURS[fromIso(dateIso).getDay()];
    const lunch = $("[name=service][value=pranzo]");
    lunch.disabled = !h.pranzo.length;
    if (lunch.disabled && state.service === "pranzo") { state.service = "cena"; $("[name=service][value=cena]").checked = true; }
    CALENDAR_ENDPOINT ? loadAvailability(dateIso) : renderTimes();
  }

  // Real availability read from Google Calendar, cached per day while the sheet is open
  const remote = {};
  async function loadAvailability(dateIso, force = false) {
    if (remote[dateIso] && !remote[dateIso].error && !force) return renderTimes();
    remote[dateIso] = { loading: true };
    renderTimes();
    try {
      const res = await fetch(`${CALENDAR_ENDPOINT}?date=${dateIso}`);
      const data = await res.json();
      remote[dateIso] = data.ok ? { data } : { error: true };
    } catch {
      remote[dateIso] = { error: true };
    }
    if (state.date === dateIso) renderTimes();
  }

  $$("[name=service]").forEach(r => r.addEventListener("change", () => { state.service = r.value; state.time = null; renderTimes(); }));
  $$("[name=area]").forEach(r => r.addEventListener("change", () => { state.area = r.value; }));

  // Deterministic availability so the demo feels real
  const hash = s => { let h = 7; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };
  function availability(dateIso, time) {
    const r = remote[dateIso];
    if (r && r.data) {
      const d = r.data;
      if (d.closed || d.blocked.some(b => time >= b.from && time < b.to)) return "full";
      const left = d.capacity - (d.slots[time] || 0);
      return left < state.guests ? "full" : left < d.capacity * 0.35 ? "few" : "ok";
    }
    const h = hash(dateIso + time + (state.guests > 4 ? "L" : "S")) % 10;
    return h < 2 ? "full" : h < 4 ? "few" : "ok";
  }

  function renderTimes() {
    const el = $("#times");
    if (!state.date) { el.innerHTML = `<p class="empty">Scegli un giorno per vedere gli orari liberi.</p>`; return; }
    const r = CALENDAR_ENDPOINT && remote[state.date];
    if (r && r.loading) { el.innerHTML = `<p class="empty">Controllo la disponibilità…</p>`; return; }
    if (r && r.error) { el.innerHTML = `<p class="empty">Non riesco a leggere la disponibilità. <button type="button" class="retry" data-retry>Riprova</button></p>`; return; }
    if (r && r.data.closed) { el.innerHTML = `<p class="empty">In questa data il locale è chiuso.</p>`; return; }
    const list = HOURS[fromIso(state.date).getDay()][state.service];
    const isToday = state.date === iso(new Date());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    el.innerHTML = list.map(t => {
      const [hh, mm] = t.split(":").map(Number);
      const past = isToday && hh * 60 + mm < nowMin + 60;
      const av = past ? "full" : availability(state.date, t);
      return `<button type="button" class="time ${av === "few" ? "few" : ""} ${t === state.time ? "is-selected" : ""}" data-t="${t}" ${av === "full" ? "disabled" : ""}>${t}</button>`;
    }).join("") || `<p class="empty">Nessun orario disponibile.</p>`;
  }
  $("#times").addEventListener("click", e => {
    if (e.target.closest("[data-retry]")) return loadAvailability(state.date, true);
    const b = e.target.closest(".time"); if (!b || b.disabled) return;
    state.time = b.dataset.t;
    $$(".time").forEach(x => x.classList.toggle("is-selected", x === b));
    $("#formError").textContent = "";
  });

  /* ---------- Sheet ---------- */
  const sheet = $("#sheet"), backdrop = $("#backdrop"), nextBtn = $("#sheetNext"), errEl = $("#formError");
  let lastFocus = null;

  function openSheet(pane = 1, area) {
    lastFocus = document.activeElement;
    if (area) { state.area = area; $(`[name=area][value=${area}]`).checked = true; }
    for (const k in remote) delete remote[k];
    if (!state.date) { const first = $(".day:not([disabled])"); if (first) selectDay(first.dataset.date); }
    else if (CALENDAR_ENDPOINT) loadAvailability(state.date);
    paintGuests();
    showPane(pane);
    backdrop.hidden = false;
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("sheet-open");
    history.pushState({ sheet: true }, "");
    setTimeout(() => $("#sheetClose").focus(), 50);
  }
  function closeSheet(fromPop = false) {
    if (!sheet.classList.contains("is-open")) return;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    document.body.classList.remove("sheet-open");
    if (!fromPop && history.state && history.state.sheet) history.back();
    if (state.pane === 3) resetBooking();
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  addEventListener("popstate", () => closeSheet(true));
  addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  backdrop.addEventListener("click", () => closeSheet());
  $("#sheetClose").addEventListener("click", () => closeSheet());
  $$("[data-open-booking]").forEach(b => b.addEventListener("click", () => openSheet(1, b.dataset.area)));
  $("#myResBtn").addEventListener("click", () => openSheet(4));

  const TITLES = { 1: "Prenota un tavolo", 2: "I tuoi dati", 3: "Confermata", 4: "Le mie prenotazioni" };
  function showPane(n) {
    state.pane = n;
    $$(".pane").forEach(p => p.classList.toggle("is-active", Number(p.dataset.pane) === n));
    $("#sheetTitle").textContent = TITLES[n];
    $("#sheetBack").hidden = n !== 2;
    errEl.textContent = "";
    nextBtn.textContent = { 1: "Continua", 2: "Conferma prenotazione", 3: "Fatto", 4: "Nuova prenotazione" }[n];
    if (n === 2) renderRecap();
    if (n === 4) renderList();
    $("#sheetBody").scrollTop = 0;
  }
  $("#sheetBack").addEventListener("click", () => showPane(1));

  nextBtn.addEventListener("click", () => {
    if (state.pane === 1) {
      if (!state.date) return (errEl.textContent = "Scegli il giorno.");
      if (!state.time) return (errEl.textContent = "Scegli un orario disponibile.");
      showPane(2);
    } else if (state.pane === 2) {
      const err = validate();
      if (err) return (errEl.textContent = err);
      confirmBooking();
    } else if (state.pane === 3) {
      closeSheet();
    } else {
      showPane(1);
    }
  });

  function renderRecap() {
    $("#recap").innerHTML = `
      <div class="big">${state.guests > 10 ? "10+" : state.guests}</div>
      <div><b>${cap(longFmt.format(fromIso(state.date)))} · ore ${state.time}</b>
      <span>${state.guests === 1 ? "1 persona" : (state.guests > 10 ? "Gruppo" : state.guests + " persone")} · ${cap(state.area)} · ${cap(state.service)}</span></div>`;
  }

  function validate() {
    $$(".is-invalid").forEach(x => x.classList.remove("is-invalid"));
    const n = $("#rName"), p = $("#rPhone"), m = $("#rEmail");
    if (n.value.trim().length < 3) { n.classList.add("is-invalid"); n.focus(); return "Inserisci nome e cognome."; }
    if (p.value.replace(/\D/g, "").length < 8) { p.classList.add("is-invalid"); p.focus(); return "Inserisci un numero di telefono valido."; }
    if (m.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.value.trim())) { m.classList.add("is-invalid"); m.focus(); return "L'email non sembra corretta."; }
    if (!$("#rPrivacy").checked) return "Devi accettare il trattamento dei dati.";
    return "";
  }

  /* ---------- Storage ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
  const save = l => { try { localStorage.setItem(STORE_KEY, JSON.stringify(l)); } catch {} updateBadge(); };

  async function confirmBooking() {
    const r = {
      code: "BRG-" + Math.floor(1000 + Math.random() * 9000),
      guests: state.guests, date: state.date, service: state.service, time: state.time, area: state.area,
      occasion: $("[name=occasion]:checked").value, notes: $("#rNotes").value.trim(),
      name: $("#rName").value.trim(), phone: $("#rPhone").value.trim(), email: $("#rEmail").value.trim(),
      createdAt: new Date().toISOString(),
    };

    if (CALENDAR_ENDPOINT) {
      nextBtn.disabled = true;
      nextBtn.textContent = "Invio in corso…";
      let out;
      try {
        // text/plain body keeps this a "simple" request, so Apps Script needs no CORS preflight
        const res = await fetch(CALENDAR_ENDPOINT, { method: "POST", body: JSON.stringify({ action: "book", ...r }) });
        out = await res.json();
      } catch {
        out = { ok: false, error: "network" };
      }
      nextBtn.disabled = false;
      nextBtn.textContent = "Conferma prenotazione";
      if (!out.ok) {
        if (out.error === "full" || out.error === "closed") {
          state.time = null;
          showPane(1);
          loadAvailability(r.date, true);
          errEl.textContent = "Quell'orario si è appena riempito: scegline un altro.";
        } else {
          errEl.textContent = "Invio non riuscito. Controlla la connessione e riprova.";
        }
        return;
      }
      r.code = out.code;
      r.remote = true;
    }

    const list = load(); list.push(r);
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    save(list);

    $("#donePane").innerHTML = `
      <div class="done">
        <svg class="done-mark" viewBox="0 0 84 84" fill="none" stroke-width="2.5" aria-hidden="true"><circle cx="42" cy="42" r="40"/><path d="M27 43l10 10 20-22" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3>A presto, ${esc(r.name.split(" ")[0])}!</h3>
        <p>Il tuo tavolo è confermato.${r.email ? " Ti abbiamo scritto a " + esc(r.email) + "." : ""}</p>
        <div class="ticket">
          <div class="ticket-top"><b>Osteria del Borgo</b><code>${r.code}</code></div>
          <dl>
            <div><dt>Quando</dt><dd>${cap(longFmt.format(fromIso(r.date)))}, ore ${r.time}</dd></div>
            <div><dt>Persone</dt><dd>${r.guests > 10 ? "Gruppo (ti richiamiamo)" : r.guests}</dd></div>
            <div><dt>Tavolo</dt><dd>${cap(r.area)}</dd></div>
            ${r.occasion ? `<div><dt>Occasione</dt><dd>${r.occasion}</dd></div>` : ""}
          </dl>
        </div>
        <div class="done-actions">
          <button class="btn btn-outline" id="icsBtn">Aggiungi al calendario</button>
        </div>
      </div>`;
    $("#icsBtn").addEventListener("click", () => ics(r));
    showPane(3);
  }

  function resetBooking() {
    Object.assign(state, { guests: 2, date: null, time: null, service: "cena", area: "sala" });
    ["#rName", "#rPhone", "#rEmail", "#rNotes"].forEach(s => ($(s).value = ""));
    $("#rPrivacy").checked = false;
    $("[name=occasion][value='']").checked = true;
    $("[name=area][value=sala]").checked = true;
    $("[name=service][value=cena]").checked = true;
    $$(".day").forEach(d => d.classList.remove("is-selected"));
    renderTimes();
  }

  function renderList() {
    const list = load();
    $("#resList").innerHTML = list.length ? list.map(r => {
      const d = fromIso(r.date);
      return `<li class="res-item">
        <div class="res-date"><b>${d.getDate()}</b><small>${short(monFmt.format(d))}</small></div>
        <div class="res-info"><b>Ore ${r.time} · ${r.guests > 10 ? "Gruppo" : r.guests + " pers."}</b><span>${cap(r.area)} · ${r.code}</span></div>
        <button class="res-cancel" data-cancel="${r.code}">Annulla</button>
      </li>`;
    }).join("") : `<li class="res-empty">Non hai ancora prenotazioni.</li>`;
  }
  $("#resList").addEventListener("click", async e => {
    const code = e.target.dataset.cancel;
    if (!code || !confirm("Vuoi annullare la prenotazione?")) return;
    const r = load().find(x => x.code === code);
    if (CALENDAR_ENDPOINT && r && r.remote) {
      let out;
      try {
        const res = await fetch(CALENDAR_ENDPOINT, { method: "POST", body: JSON.stringify({ action: "cancel", code, phone: r.phone }) });
        out = await res.json();
      } catch {
        out = { ok: false };
      }
      // not_found = già cancellata dal titolare nel calendario: va tolta anche qui
      if (!out.ok && out.error !== "not_found") return toast("Annullamento non riuscito, riprova");
    }
    save(load().filter(r => r.code !== code));
    renderList();
    toast("Prenotazione annullata");
  });

  function updateBadge() {
    const n = load().length;
    $("#myResBtn").hidden = n === 0;
    $("#resCount").textContent = n;
  }

  /* ---------- Helpers ---------- */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function ics(r) {
    const [hh, mm] = r.time.split(":").map(Number);
    const pad = n => String(n).padStart(2, "0");
    const start = `${r.date.replace(/-/g, "")}T${pad(hh)}${pad(mm)}00`;
    const endH = hh + 2;
    const end = `${r.date.replace(/-/g, "")}T${pad(endH % 24)}${pad(mm)}00`;
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Osteria del Borgo//IT", "BEGIN:VEVENT",
      `UID:${r.code}@osteriadelborgo.demo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:Cena all'Osteria del Borgo (${r.guests} pers.)`,
      `DESCRIPTION:Prenotazione ${r.code} – tavolo in ${r.area}`, "LOCATION:Via del Borgo 7", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([body], { type: "text/calendar" })), download: `prenotazione-${r.code}.ics` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  let tt;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("is-on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("is-on"), 2400); }

  $("#liveTag").hidden = !CALENDAR_ENDPOINT;
  paintGuests();
  renderTimes();
  updateBadge();
})();
