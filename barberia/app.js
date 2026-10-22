(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const STORE_KEY = "fl_appointments";
  // URL della Web App di Google Apps Script (vedi google-calendar/LEGGIMI.md).
  // Vuoto = modalità demo: agenda simulata e appuntamenti solo nel browser.
  const CALENDAR_ENDPOINT = "";

  /* ---------- Data ---------- */
  const SERVICES = [
    { id: "taglio", ico: "✂️", name: "Taglio uomo", desc: "Shampoo, taglio e styling", min: 30, price: 22 },
    { id: "fade", ico: "⚡", name: "Skin fade", desc: "Sfumatura a zero, rifinita a rasoio", min: 45, price: 25 },
    { id: "barba", ico: "🧔", name: "Barba", desc: "Modellatura e contorno a rasoio", min: 20, price: 15 },
    { id: "rasatura", ico: "🪒", name: "Rasatura al panno caldo", desc: "Il rituale completo in 4 passaggi", min: 30, price: 18 },
    { id: "bimbo", ico: "🧒", name: "Taglio bambino", desc: "Fino a 12 anni", min: 25, price: 15 },
    { id: "grigio", ico: "🎨", name: "Camouflage grigio", desc: "Copertura naturale dei capelli bianchi", min: 20, price: 18 },
  ];
  const BARBERS = [
    { id: "marco", name: "Marco", role: "Master barber · fondatore", tags: ["Fade", "Tagli moderni"], color: "#c9973f" },
    { id: "luca", name: "Luca", role: "Barba e rasature tradizionali", tags: ["Panno caldo", "Rasoio"], color: "#d6c3a1" },
    { id: "davide", name: "Davide", role: "Tagli classici e bambini", tags: ["Classico", "Kids"], color: "#9fb1a3" },
  ];
  // Opening hours by weekday (0 = domenica); null = closed
  const OPEN = { 0: null, 1: null, 2: ["09:00", "19:30"], 3: ["09:00", "19:30"], 4: ["09:00", "19:30"], 5: ["09:00", "19:30"], 6: ["08:30", "18:00"] };
  const UNIT = 30;

  /* ---------- Helpers ---------- */
  const pad = n => String(n).padStart(2, "0");
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const wdFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
  const monFmt = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
  const monShort = new Intl.DateTimeFormat("it-IT", { month: "short" });
  const longFmt = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };

  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
  const save = l => { try { localStorage.setItem(STORE_KEY, JSON.stringify(l)); } catch {} refreshBadge(); };

  /* ---------- Availability engine ---------- */
  // Agenda letta da Google Calendar: { closed: [date], busy: { date: { barber: [[from, to]] } } } in minuti
  const remote = { data: null, error: false };

  function dayUnits(dateIso) {
    const o = OPEN[fromIso(dateIso).getDay()];
    if (!o || (remote.data && remote.data.closed.includes(dateIso))) return null;
    const start = toMin(o[0]), end = toMin(o[1]);
    return { start, count: Math.floor((end - start) / UNIT) };
  }
  // A unit is busy if pseudo-randomly taken (stable per day/barber) or booked by the visitor
  function isBusy(barber, dateIso, unitStartMin) {
    if (CALENDAR_ENDPOINT) {
      const day = remote.data && remote.data.busy[dateIso];
      return ((day && day[barber]) || []).some(([s, e]) => s < unitStartMin + UNIT && e > unitStartMin);
    }
    if (hash(`${barber}|${dateIso}|${unitStartMin}`) % 100 < 42) return true;
    return load().some(a => a.barber === barber && a.date === dateIso &&
      unitStartMin >= toMin(a.start) && unitStartMin < toMin(a.start) + Math.ceil(a.minutes / UNIT) * UNIT);
  }
  function fits(barber, dateIso, startMin, units) {
    if (CALENDAR_ENDPOINT && !remote.data) return false;
    const d = dayUnits(dateIso);
    if (!d || startMin + units * UNIT > d.start + d.count * UNIT) return false;
    const now = new Date();
    if (dateIso === iso(now) && startMin < now.getHours() * 60 + now.getMinutes() + 30) return false;
    for (let i = 0; i < units; i++) if (isBusy(barber, dateIso, startMin + i * UNIT)) return false;
    return true;
  }
  function freeBarber(barberChoice, dateIso, startMin, units) {
    const pool = barberChoice === "any" ? BARBERS.map(b => b.id) : [barberChoice];
    return pool.find(b => fits(b, dateIso, startMin, units)) || null;
  }
  function nextFree(barberChoice, units, fromDays = 0) {
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = fromDays; i < 21; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const di = iso(d), du = dayUnits(di);
      if (!du) continue;
      for (let u = 0; u < du.count; u++) {
        const m = du.start + u * UNIT, b = freeBarber(barberChoice, di, m, units);
        if (b) return { date: di, start: toTime(m), barber: b, offset: i };
      }
    }
    return null;
  }
  const whenLabel = r => r.offset === 0 ? "oggi" : r.offset === 1 ? "domani" : wdFmt.format(fromIso(r.date)).replace(".", "") + " " + fromIso(r.date).getDate();

  /* ---------- Static sections ---------- */
  $("#priceList").innerHTML = SERVICES.map(s => `
    <li class="price-item"><span class="price-ico">${s.ico}</span>
      <div class="price-info"><h3>${s.name}</h3><small>${s.desc}</small><span class="dur">${s.min} min</span></div>
      <span class="price-val">€${s.price}</span></li>`).join("");

  $("#teamGrid").innerHTML = BARBERS.map(b => `
    <article class="member"><span class="avatar" style="background:${b.color}">${b.name[0]}</span>
      <div><h3>${b.name}</h3><p>${b.role}</p><div class="tags">${b.tags.map(t => `<span>${t}</span>`).join("")}</div></div>
      <button class="btn btn-outline btn-sm member-book" data-open-booking data-barber="${b.id}">Prenota</button></article>`).join("");

  function heroSlot() {
    if (CALENDAR_ENDPOINT && !remote.data) {
      $("#nextSlot").innerHTML = `<span class="pulse"></span><span>${remote.error ? "Agenda non raggiungibile: chiamaci" : "Controllo l'agenda…"}</span>`;
      return;
    }
    const r = nextFree("any", 1);
    const b = r && BARBERS.find(x => x.id === r.barber);
    $("#nextSlot").innerHTML = r
      ? `<span class="pulse"></span><span>Prossimo posto libero: <b>${whenLabel(r)} alle ${r.start}</b> con ${b.name}</span>`
      : `<span class="pulse"></span><span>Agenda piena: chiamaci per un buco last minute</span>`;
  }
  heroSlot();

  async function loadRemote() {
    if (!CALENDAR_ENDPOINT) return;
    try {
      const res = await fetch(`${CALENDAR_ENDPOINT}?from=${iso(new Date())}&days=21`);
      const data = await res.json();
      if (!data.ok) throw data;
      remote.data = data;
      remote.error = false;
    } catch {
      remote.error = !remote.data;
    }
    heroSlot();
    if (state.view === 2) renderBarbers();
    if (state.view === 3) { renderDays(); renderSlots(); }
  }

  const topbar = $(".topbar");
  const onScroll = () => topbar.classList.toggle("is-scrolled", scrollY > 30);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- Booking state ---------- */
  const state = { view: 1, services: new Set(), barber: "any", date: null, start: null };
  const totals = () => {
    const list = SERVICES.filter(s => state.services.has(s.id));
    const min = list.reduce((t, s) => t + s.min, 0);
    return { list, min, price: list.reduce((t, s) => t + s.price, 0), units: Math.max(1, Math.ceil(min / UNIT)) };
  };

  // Step 1 – services
  $("#svcList").innerHTML = SERVICES.map(s => `
    <label class="svc"><input type="checkbox" value="${s.id}">
      <span class="price-ico">${s.ico}</span>
      <div class="svc-info"><b>${s.name}</b><small>${s.desc}</small></div>
      <div class="svc-price"><b>€${s.price}</b><small>${s.min} min</small></div>
      <span class="check-dot" aria-hidden="true"></span></label>`).join("");
  $("#svcList").addEventListener("change", e => {
    const c = e.target;
    c.checked ? state.services.add(c.value) : state.services.delete(c.value);
    state.start = null;
    updateFoot();
  });

  // Step 2 – barber
  function renderBarbers() {
    const { units } = totals();
    const opts = [{ id: "any", name: "Primo disponibile", role: "Ti assegniamo chi è libero prima", color: "", any: true }, ...BARBERS];
    $("#barberList").innerHTML = opts.map(b => {
      const r = nextFree(b.id, units);
      return `<label class="barber"><input type="radio" name="barber" value="${b.id}" ${state.barber === b.id ? "checked" : ""}>
        <span class="avatar ${b.any ? "avatar-any" : ""}" style="${b.any ? "" : `background:${b.color}`}">${b.any ? "★" : b.name[0]}</span>
        <div class="b-info"><b>${b.name}</b><small>${b.role}</small>
        ${r ? `<span class="b-next">● Libero ${whenLabel(r)} alle ${r.start}</span>` : ""}</div></label>`;
    }).join("");
  }
  $("#barberList").addEventListener("change", e => { state.barber = e.target.value; state.start = null; });

  // Step 3 – date & time
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const DAYS = [...Array(21)].map((_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
  function renderDays() {
    $("#days").innerHTML = DAYS.map((d, i) => {
      const closed = !dayUnits(iso(d));
      return `<button type="button" class="day ${iso(d) === state.date ? "is-selected" : ""}" data-date="${iso(d)}" ${closed ? "disabled aria-label='Chiuso'" : ""}>
        <small>${i === 0 ? "Oggi" : wdFmt.format(d).replace(".", "")}</small><b>${d.getDate()}</b></button>`;
    }).join("");
  }
  $("#days").addEventListener("click", e => {
    const b = e.target.closest(".day"); if (!b || b.disabled) return;
    state.date = b.dataset.date; state.start = null;
    $$(".day").forEach(x => x.classList.toggle("is-selected", x === b));
    renderSlots();
  });
  function renderSlots() {
    $("#calMonth").textContent = cap(monFmt.format(state.date ? fromIso(state.date) : new Date()));
    if (CALENDAR_ENDPOINT && !remote.data) {
      $("#slotGroups").innerHTML = remote.error
        ? `<p class="no-slots">Non riesco a leggere l'agenda. <button type="button" class="retry" data-retry>Riprova</button></p>`
        : `<p class="no-slots">Controllo l'agenda…</p>`;
      return;
    }
    const du = state.date && dayUnits(state.date);
    if (!du) { $("#slotGroups").innerHTML = `<p class="no-slots">Scegli un giorno.</p>`; return; }
    const { units } = totals();
    const groups = { Mattina: [], Pomeriggio: [], Sera: [] };
    let any = false;
    for (let u = 0; u < du.count; u++) {
      const m = du.start + u * UNIT, t = toTime(m);
      const ok = !!freeBarber(state.barber, state.date, m, units);
      any = any || ok;
      (m < 13 * 60 ? groups.Mattina : m < 17 * 60 ? groups.Pomeriggio : groups.Sera)
        .push(`<button type="button" class="slot ${t === state.start ? "is-selected" : ""}" data-t="${t}" ${ok ? "" : "disabled"}>${t}</button>`);
    }
    $("#slotGroups").innerHTML = any
      ? Object.entries(groups).filter(([, v]) => v.length).map(([k, v]) => `<div class="slot-group"><h4>${k}</h4><div class="slot-grid">${v.join("")}</div></div>`).join("")
      : `<p class="no-slots">Nessun posto libero in questa giornata. Prova un altro giorno.</p>`;
  }
  $("#slotGroups").addEventListener("click", e => {
    if (e.target.closest("[data-retry]")) { remote.error = false; renderSlots(); return loadRemote(); }
    const b = e.target.closest(".slot"); if (!b || b.disabled) return;
    state.start = b.dataset.t;
    $$(".slot").forEach(x => x.classList.toggle("is-selected", x === b));
    $("#formError").textContent = "";
    updateFoot();
  });

  // Step 4 – recap
  function renderTicket(target, a) {
    const b = BARBERS.find(x => x.id === a.barber);
    target.innerHTML = `
      <div class="ticket-row"><span>Servizi</span><b>${a.names.join(" + ")}</b></div>
      <div class="ticket-row"><span>Barbiere</span><b>${b.name}</b></div>
      <div class="ticket-row"><span>Quando</span><b>${cap(longFmt.format(fromIso(a.date)))}<br>ore ${a.start} · ${a.minutes} min</b></div>
      <div class="ticket-row ticket-total"><span>Totale in negozio</span><b>€${a.total}</b></div>`;
  }
  function draft() {
    const t = totals();
    return { names: t.list.map(s => s.name), services: t.list.map(s => s.id), minutes: t.min, total: t.price,
      date: state.date, start: state.start, barber: freeBarber(state.barber, state.date, toMin(state.start), t.units) };
  }

  /* ---------- App shell ---------- */
  const app = $("#app"), nextBtn = $("#appNext"), errEl = $("#formError");
  const TITLES = { 1: "Scegli i servizi", 2: "Scegli il barbiere", 3: "Giorno e ora", 4: "Conferma", 5: "Prenotato!", 6: "I miei appuntamenti" };
  let lastFocus;

  function openApp(view = 1, opts = {}) {
    lastFocus = document.activeElement;
    if (opts.service) { state.services.add(opts.service); const c = $(`#svcList input[value=${opts.service}]`); if (c) c.checked = true; }
    if (opts.barber) state.barber = opts.barber;
    loadRemote();
    go(view);
    app.classList.add("is-open");
    app.setAttribute("aria-hidden", "false");
    document.body.classList.add("app-open");
    history.pushState({ app: true }, "");
    setTimeout(() => $("#appClose").focus(), 60);
  }
  function closeApp(fromPop = false) {
    if (!app.classList.contains("is-open")) return;
    app.classList.remove("is-open");
    app.setAttribute("aria-hidden", "true");
    document.body.classList.remove("app-open");
    if (!fromPop && history.state && history.state.app) history.back();
    if (state.view === 5) reset();
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  addEventListener("popstate", () => closeApp(true));
  addEventListener("keydown", e => { if (e.key === "Escape") closeApp(); });
  $("#appClose").addEventListener("click", () => closeApp());
  $("#appBack").addEventListener("click", () => (state.view >= 2 && state.view <= 4 ? go(state.view - 1) : closeApp()));
  $$("[data-open-booking]").forEach(b => b.addEventListener("click", () => openApp(1, { service: b.dataset.service, barber: b.dataset.barber })));
  $$("[data-open-appts]").forEach(b => b.addEventListener("click", () => openApp(6)));

  function go(v) {
    state.view = v;
    $$(".view").forEach(x => x.classList.toggle("is-active", Number(x.dataset.view) === v));
    $("#appTitle").textContent = TITLES[v];
    $("#appStep").textContent = v <= 4 ? `Passo ${v} di 4` : v === 5 ? "Ci vediamo in negozio" : "Ferro & Lama";
    $("#progressBar").style.width = (v <= 4 ? v * 25 : 100) + "%";
    errEl.textContent = "";
    if (v === 2) renderBarbers();
    if (v === 3) {
      if (!state.date) { const n = nextFree(state.barber, totals().units); state.date = n ? n.date : iso(DAYS.find(d => OPEN[d.getDay()])); }
      renderDays(); renderSlots();
      requestAnimationFrame(() => { const s = $(".day.is-selected"); s && s.scrollIntoView({ inline: "center", block: "nearest" }); });
    }
    if (v === 4) renderTicket($("#ticketPreview"), draft());
    if (v === 6) renderAppts();
    $("#appBody").scrollTop = 0;
    updateFoot();
  }

  function updateFoot() {
    const t = totals(), v = state.view;
    $("#footSum").hidden = v >= 5;
    $("#footSum").innerHTML = t.list.length
      ? `<b>€${t.price}</b><small>${t.list.length} ${t.list.length === 1 ? "servizio" : "servizi"} · ${t.min} min</small>`
      : `<b>€0</b><small>Nessun servizio</small>`;
    nextBtn.textContent = { 1: "Continua", 2: "Continua", 3: "Continua", 4: "Conferma", 5: "Chiudi", 6: "Nuovo appuntamento" }[v];
    nextBtn.style.maxWidth = v >= 5 ? "none" : "";
  }

  nextBtn.addEventListener("click", () => {
    const v = state.view;
    if (v === 1 && !state.services.size) return (errEl.textContent = "Scegli almeno un servizio.");
    if (v === 3 && !state.start) return (errEl.textContent = "Scegli un orario libero.");
    if (v === 4) return submit();
    if (v === 5) return closeApp();
    if (v === 6) return go(1);
    go(v + 1);
  });

  async function submit() {
    $$(".is-invalid").forEach(x => x.classList.remove("is-invalid"));
    const n = $("#bName"), p = $("#bPhone");
    if (n.value.trim().length < 2) { n.classList.add("is-invalid"); n.focus(); return (errEl.textContent = "Dicci come ti chiami."); }
    if (p.value.replace(/\D/g, "").length < 8) { p.classList.add("is-invalid"); p.focus(); return (errEl.textContent = "Inserisci un numero di cellulare valido."); }
    if (!$("#bPrivacy").checked) return (errEl.textContent = "Devi accettare il trattamento dei dati.");
    const d = draft();
    const taken = () => { state.start = null; go(3); errEl.textContent = "Questo orario è appena stato preso. Scegline un altro."; };
    if (!d.barber) return taken();
    const a = { code: "FL-" + Math.floor(1000 + Math.random() * 9000), ...d, name: n.value.trim(), phone: p.value.trim(),
      notes: $("#bNotes").value.trim(), reminder: $("#bReminder").checked, createdAt: new Date().toISOString() };

    if (CALENDAR_ENDPOINT) {
      nextBtn.disabled = true;
      nextBtn.textContent = "Invio…";
      let out;
      try {
        // text/plain body keeps this a "simple" request, so Apps Script needs no CORS preflight
        const res = await fetch(CALENDAR_ENDPOINT, { method: "POST", body: JSON.stringify({
          action: "book", services: d.services, barber: state.barber, date: d.date, start: d.start,
          name: a.name, phone: a.phone, notes: a.notes, reminder: a.reminder }) });
        out = await res.json();
      } catch {
        out = { ok: false, error: "network" };
      }
      nextBtn.disabled = false;
      updateFoot();
      if (!out.ok) {
        if (out.error === "busy" || out.error === "closed") { await loadRemote(); return taken(); }
        errEl.textContent = "Invio non riuscito. Controlla la connessione e riprova.";
        return;
      }
      Object.assign(a, { code: out.code, barber: out.barber, remote: true });
      loadRemote();
    }

    const list = load(); list.push(a);
    list.sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
    save(list);

    const b = BARBERS.find(x => x.id === a.barber);
    $("#doneView").innerHTML = `
      <div class="done">
        <div class="done-ico"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h3>Ci vediamo, ${esc(a.name.split(" ")[0])}!</h3>
        <p>${b.name} ti aspetta ${longFmt.format(fromIso(a.date))} alle ${a.start}.${a.reminder ? "<br>Ti mandiamo un promemoria 2 ore prima." : ""}</p>
        <span class="code">${a.code}</span>
        <div class="ticket" id="doneTicket"></div>
        <div class="done-actions">
          <button class="btn btn-outline" id="icsBtn">📅 Aggiungi al calendario</button>
          <button class="btn btn-outline" id="seeAppts">Vedi i miei appuntamenti</button>
        </div>
      </div>`;
    renderTicket($("#doneTicket"), a);
    $("#icsBtn").addEventListener("click", () => ics(a));
    $("#seeAppts").addEventListener("click", () => { reset(); go(6); });
    go(5);
  }

  function reset() {
    state.services.clear(); state.barber = "any"; state.date = null; state.start = null;
    $$("#svcList input").forEach(c => (c.checked = false));
    ["#bName", "#bPhone", "#bNotes"].forEach(s => ($(s).value = ""));
    $("#bPrivacy").checked = false;
  }

  function renderAppts() {
    const list = load();
    $("#apptList").innerHTML = list.length ? list.map(a => {
      const d = fromIso(a.date), b = BARBERS.find(x => x.id === a.barber);
      return `<li class="appt"><div class="appt-date"><b>${d.getDate()}</b><small>${monShort.format(d).replace(".", "")}</small></div>
        <div class="appt-info"><b>Ore ${a.start} · ${b.name}</b><span>${a.names.join(" + ")} · €${a.total}</span></div>
        <button class="appt-cancel" data-cancel="${a.code}">Annulla</button></li>`;
    }).join("") : `<li class="appt-empty"><b>Agenda vuota</b>Prenota il tuo primo appuntamento: ci vogliono 30 secondi.</li>`;
  }
  $("#apptList").addEventListener("click", async e => {
    const code = e.target.dataset.cancel;
    if (!code || !confirm("Vuoi annullare l'appuntamento?")) return;
    const a = load().find(x => x.code === code);
    if (CALENDAR_ENDPOINT && a && a.remote) {
      let out;
      try {
        const res = await fetch(CALENDAR_ENDPOINT, { method: "POST", body: JSON.stringify({ action: "cancel", code, phone: a.phone }) });
        out = await res.json();
      } catch {
        out = { ok: false };
      }
      // not_found = già cancellato dal barbiere nel calendario: va tolto anche qui
      if (!out.ok && out.error !== "not_found") return toast("Annullamento non riuscito, riprova");
      loadRemote();
    }
    save(load().filter(a => a.code !== code));
    renderAppts();
    toast("Appuntamento annullato");
  });

  function refreshBadge() { $("#apptBadge").hidden = load().length === 0; }

  function ics(a) {
    const s = toMin(a.start), e = s + a.minutes, day = a.date.replace(/-/g, "");
    const t = m => `${day}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ferro & Lama//IT", "BEGIN:VEVENT",
      `UID:${a.code}@ferroelama.demo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${t(s)}`, `DTEND:${t(e)}`, `SUMMARY:${a.names.join(" + ")} – Ferro & Lama`,
      `DESCRIPTION:Appuntamento ${a.code} con ${BARBERS.find(x => x.id === a.barber).name}`, "LOCATION:Corso Garibaldi 42",
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Promemoria barbiere", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([body], { type: "text/calendar" })), download: `appuntamento-${a.code}.ics` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  let tt;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("is-on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("is-on"), 2400); }

  refreshBadge();
  updateFoot();
  loadRemote();
})();
