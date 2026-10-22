(() => {
  const img = (id, w = 600) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
  const euro = n => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
  const $ = s => document.querySelector(s);
  const STORE_KEY = "aurora_orders";
  // URL della Web App di Google Apps Script (vedi google-calendar/LEGGIMI.md).
  // Vuoto = modalità demo: disponibilità simulata e ordini solo nel browser.
  const CALENDAR_ENDPOINT = "";

  /* ---------- Data ---------- */
  const products = [
    { cat: "torte", name: "Torta Fondente", desc: "Mousse al cioccolato 70% e ganache lucida", price: "da €4,20 a persona", img: "1578985545062-69928b1d9587" },
    { cat: "torte", name: "Tiramisù della casa", desc: "Savoiardi nostri, mascarpone e caffè", price: "da €3,80 a persona", img: "1571115177098-24ec42ed204d" },
    { cat: "torte", name: "Crema e frutti di bosco", desc: "Chantilly, more fresche e fiori eduli", price: "da €4,00 a persona", img: "1559620192-032c4bc4674e" },
    { cat: "torte", name: "Rainbow Cake", desc: "Sei strati colorati e crema al burro", price: "da €4,50 a persona", img: "1464349095431-e9a21285b5f3" },
    { cat: "pasticceria", name: "Crostatine di frutta", desc: "Frolla al burro, crema e frutta di stagione", price: "€2,50 cad.", img: "1495147466023-ac5c588e2e94" },
    { cat: "pasticceria", name: "Cupcake alla fragola", desc: "Frosting leggero e fragole del giorno", price: "€3,00 cad.", img: "1563729784474-d77dbb933a9e" },
    { cat: "pasticceria", name: "Panna cotta ai frutti", desc: "Vaniglia Bourbon e coulis di fragole", price: "€3,50 cad.", img: "1488477181946-6428a0291777" },
    { cat: "pasticceria", name: "Brownie fondente", desc: "Umido dentro, croccante fuori", price: "€2,80 cad.", img: "1606313564200-e75d5e30476c" },
    { cat: "colazione", name: "Cornetto sfogliato", desc: "48 ore di lievitazione, burro francese", price: "€1,40 cad.", img: "1555507036-ab1f4038808a" },
    { cat: "colazione", name: "Cookies al cioccolato", desc: "Gocce di fondente e sale di Maldon", price: "€18 al kg", img: "1558961363-fa8fdf82db35" },
    { cat: "colazione", name: "Pane a lievito madre", desc: "Grani antichi, cotto nel forno a pietra", price: "€4,50 al kg", img: "1509440159596-0249088772ff" },
    { cat: "pasticceria", name: "Cupcake Oreo", desc: "Base al cacao e crema ai biscotti", price: "€3,00 cad.", img: "1612203985729-70726954388c" },
  ];

  const cakes = [
    { id: "fondente", name: "Torta Fondente", desc: "Cioccolato 70% e ganache", ppp: 4.2, img: "1578985545062-69928b1d9587" },
    { id: "tiramisu", name: "Tiramisù della casa", desc: "Mascarpone e caffè", ppp: 3.8, img: "1571115177098-24ec42ed204d" },
    { id: "frutti", name: "Crema e frutti di bosco", desc: "Chantilly e more fresche", ppp: 4.0, img: "1559620192-032c4bc4674e" },
    { id: "rainbow", name: "Rainbow Cake", desc: "Sei strati colorati", ppp: 4.5, img: "1464349095431-e9a21285b5f3" },
  ];

  const extras = [
    { id: "candeline", name: "🕯️ Candeline", price: 2 },
    { id: "zucchero", name: "🎨 Decoro in pasta di zucchero", price: 15 },
    { id: "foto", name: "📷 Foto su cialda", price: 8 },
    { id: "regalo", name: "🎁 Confezione regalo", price: 3 },
  ];

  const SLOTS = ["8:00–10:00", "10:00–12:00", "12:00–13:30", "16:00–18:00", "18:00–19:30"];

  /* ---------- Header & nav ---------- */
  const topbar = $(".topbar"), nav = $("#nav"), burger = $("#burger");
  addEventListener("scroll", () => topbar.classList.toggle("is-scrolled", scrollY > 8), { passive: true });
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", e => {
    if (e.target.closest("a")) { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); }
  });

  /* ---------- Products ---------- */
  const productsEl = $("#products");
  function renderProducts(filter = "tutti") {
    productsEl.innerHTML = products
      .filter(p => filter === "tutti" || p.cat === filter)
      .map((p, i) => `
        <article class="product" style="animation-delay:${i * 40}ms">
          <img src="${img(p.img, 500)}" alt="${p.name}" loading="lazy">
          <div class="product-body">
            <h3>${p.name}</h3>
            <p>${p.desc}</p>
            <span class="price">${p.price}</span>
          </div>
        </article>`).join("");
  }
  document.querySelectorAll(".chip").forEach(chip => chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(c => { c.classList.remove("is-active"); c.setAttribute("aria-selected", "false"); });
    chip.classList.add("is-active");
    chip.setAttribute("aria-selected", "true");
    renderProducts(chip.dataset.filter);
  }));
  renderProducts();

  /* ---------- Booking state ---------- */
  const state = { step: 1, cake: "frutti", servings: 10, variant: "classica", extras: new Set(), date: null, slot: null, delivery: "ritiro" };

  $("#cakeOptions").innerHTML = cakes.map(c => `
    <label class="cake-opt">
      <input type="radio" name="cake" value="${c.id}" ${c.id === state.cake ? "checked" : ""}>
      <img src="${img(c.img, 160)}" alt="" loading="lazy">
      <div><b>${c.name}</b><small>${c.desc}</small></div>
      <span class="ppp">${c.ppp.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}<small>/pers.</small></span>
    </label>`).join("");

  $("#extras").innerHTML = extras.map(x => `
    <label class="extra"><input type="checkbox" value="${x.id}"><span>${x.name} +${euro(x.price)}</span></label>`).join("");

  document.querySelectorAll("[name=cake]").forEach(r => r.addEventListener("change", () => { state.cake = r.value; update(); }));
  document.querySelectorAll("#extras input").forEach(c => c.addEventListener("change", () => {
    c.checked ? state.extras.add(c.value) : state.extras.delete(c.value);
    update();
  }));
  document.querySelectorAll("[data-step-servings]").forEach(b => b.addEventListener("click", () => {
    state.servings = Math.min(40, Math.max(6, state.servings + Number(b.dataset.stepServings)));
    $("#servings").textContent = state.servings;
    update();
  }));
  $("#variant").addEventListener("change", e => { state.variant = e.target.value; update(); });
  document.querySelectorAll("[name=delivery]").forEach(r => r.addEventListener("change", () => {
    state.delivery = r.value;
    $("#addressField").hidden = r.value !== "consegna";
    update();
  }));

  /* ---------- Days & slots ---------- */
  const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" });
  const monFmt = new Intl.DateTimeFormat("it-IT", { month: "short" });
  const longFmt = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

  // Ordini già presi, letti da Google Calendar: { closed, slots: { date: { slot: n } }, orders: { date: n }, perSlot, perDay }
  const remote = { data: null, error: false };
  const dayFull = dateIso => !!remote.data &&
    (remote.data.closed.includes(dateIso) || (remote.data.orders[dateIso] || 0) >= remote.data.perDay);

  // Deterministic "already full" slots so the demo looks realistic
  const isFull = (dateIso, i) => {
    if (remote.data) return ((remote.data.slots[dateIso] || {})[SLOTS[i]] || 0) >= remote.data.perSlot;
    let h = 0;
    for (const ch of dateIso + i) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 5 === 0;
  };

  const days = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + 2);
  for (let i = 0; i < 21; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }

  function renderDays() {
    $("#days").innerHTML = days.map(d => {
      const di = iso(d), monday = d.getDay() === 1, full = !monday && dayFull(di);
      const closed = full && remote.data.closed.includes(di);
      return `<button type="button" class="day ${di === state.date ? "is-selected" : ""}" data-date="${di}" ${monday || full ? `disabled aria-label="${monday ? "Lunedì, chiuso" : closed ? "Chiuso" : "Completo"}"` : ""}>
        <small>${dayFmt.format(d).replace(".", "")}</small><b>${d.getDate()}</b><em>${closed ? "chiuso" : full ? "pieno" : monFmt.format(d).replace(".", "")}</em>
      </button>`;
    }).join("");
  }
  renderDays();

  async function loadRemote() {
    if (!CALENDAR_ENDPOINT) return;
    try {
      const res = await fetch(`${CALENDAR_ENDPOINT}?from=${iso(days[0])}&days=${days.length}`);
      const data = await res.json();
      if (!data.ok) throw data;
      remote.data = data;
      remote.error = false;
    } catch {
      remote.error = !remote.data;
    }
    // Se nel frattempo il giorno o la fascia scelti si sono riempiti, vanno riscelti
    if (state.date && dayFull(state.date)) state.date = null;
    if (!state.date || (state.slot && isFull(state.date, SLOTS.indexOf(state.slot)))) state.slot = null;
    renderDays();
    renderSlots();
    update();
  }

  $("#days").addEventListener("click", e => {
    const btn = e.target.closest(".day");
    if (!btn || btn.disabled) return;
    document.querySelectorAll(".day").forEach(d => d.classList.toggle("is-selected", d === btn));
    state.date = btn.dataset.date;
    state.slot = null;
    renderSlots();
    update();
  });

  function renderSlots() {
    const note = html => { $("#slots").innerHTML = `<p class="muted" style="grid-column:1/-1;font-size:.9rem">${html}</p>`; };
    if (CALENDAR_ENDPOINT && !remote.data) return note(remote.error
      ? `Non riesco a leggere la disponibilità. <button type="button" class="retry" data-retry>Riprova</button>`
      : "Controllo la disponibilità…");
    if (!state.date) return note("Scegli prima un giorno.");
    const sunday = fromIso(state.date).getDay() === 0;
    $("#slots").innerHTML = SLOTS.map((s, i) => {
      const closed = sunday && i > 2;
      const full = !closed && isFull(state.date, i);
      return `<button type="button" class="slot" data-slot="${s}" ${closed || full ? "disabled" : ""}>${s}${full ? " · pieno" : ""}</button>`;
    }).join("");
  }
  $("#slots").addEventListener("click", e => {
    if (e.target.closest("[data-retry]")) { remote.error = false; renderSlots(); return loadRemote(); }
    const btn = e.target.closest(".slot");
    if (!btn || btn.disabled) return;
    document.querySelectorAll(".slot").forEach(s => s.classList.toggle("is-selected", s === btn));
    state.slot = btn.dataset.slot;
    update();
  });
  renderSlots();

  /* ---------- Pricing & summary ---------- */
  function price() {
    const cake = cakes.find(c => c.id === state.cake);
    let base = cake.ppp * state.servings;
    if (state.variant === "senza glutine") base *= 1.1;
    const ex = [...state.extras].reduce((t, id) => t + extras.find(x => x.id === id).price, 0);
    const del = state.delivery === "consegna" ? 6 : 0;
    return { cake, base: Math.round(base * 100) / 100, ex, del, total: Math.round((base + ex + del) * 100) / 100 };
  }

  function update() {
    const p = price();
    const lines = [
      [`${p.cake.name} · ${state.servings} persone`, euro(p.base)],
      ...[...state.extras].map(id => { const x = extras.find(e => e.id === id); return [x.name.replace(/^\S+\s/, ""), euro(x.price)]; }),
    ];
    if (p.del) lines.push(["Consegna a domicilio", euro(p.del)]);
    if (state.date) lines.push([`${state.delivery === "consegna" ? "Consegna" : "Ritiro"}: ${longFmt.format(fromIso(state.date))}`, state.slot || "—"]);
    $("#summary").innerHTML = lines.map(([a, b]) => `<div class="sum-line"><span>${a}</span><span>${b}</span></div>`).join("")
      + `<div class="sum-total"><span>Totale</span><b>${euro(p.total)}</b></div>`;
    $("#nextBtn").textContent = state.step === 3 ? `Conferma ordine · ${euro(p.total)}` : "Continua";
  }

  /* ---------- Wizard navigation ---------- */
  const errEl = $("#formError");
  function validate(step) {
    document.querySelectorAll(".is-invalid").forEach(el => el.classList.remove("is-invalid"));
    if (step === 2) {
      if (!state.date) return "Scegli il giorno di ritiro.";
      if (!state.slot) return "Scegli una fascia oraria.";
      if (state.delivery === "consegna" && $("#address").value.trim().length < 6) { $("#address").classList.add("is-invalid"); return "Inserisci l'indirizzo di consegna."; }
    }
    if (step === 3) {
      if ($("#name").value.trim().length < 3) { $("#name").classList.add("is-invalid"); return "Inserisci nome e cognome."; }
      if ($("#phone").value.replace(/\D/g, "").length < 8) { $("#phone").classList.add("is-invalid"); return "Inserisci un numero di telefono valido."; }
      const email = $("#email").value.trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("#email").classList.add("is-invalid"); return "L'email non sembra corretta."; }
      if (!$("#privacy").checked) return "Devi accettare il trattamento dei dati.";
    }
    return "";
  }

  function goTo(step) {
    state.step = step;
    document.querySelectorAll(".step").forEach(f => f.classList.toggle("is-active", Number(f.dataset.step) === step));
    document.querySelectorAll(".steps li").forEach((li, i) => {
      li.classList.toggle("is-current", i + 1 === step);
      li.classList.toggle("is-done", i + 1 < step);
    });
    $("#backBtn").hidden = step === 1;
    errEl.textContent = "";
    update();
    $("#wizard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#nextBtn").addEventListener("click", () => {
    const err = validate(state.step);
    if (err) { errEl.textContent = err; return; }
    if (state.step < 3) {
      goTo(state.step + 1);
      if (state.step === 2) loadRemote();
    } else submit();
  });
  $("#backBtn").addEventListener("click", () => goTo(state.step - 1));

  /* ---------- Orders storage ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } };
  const save = list => { try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch {} };

  async function submit() {
    const p = price();
    const order = {
      code: "AUR-" + Math.floor(1000 + Math.random() * 9000),
      cake: p.cake.name, servings: state.servings, variant: state.variant,
      extras: [...state.extras].map(id => extras.find(x => x.id === id).name.replace(/^\S+\s/, "")),
      writing: $("#writing").value.trim(),
      date: state.date, slot: state.slot, delivery: state.delivery, address: $("#address").value.trim(),
      total: p.total, name: $("#name").value.trim(), phone: $("#phone").value.trim(),
      createdAt: new Date().toISOString(),
    };

    if (CALENDAR_ENDPOINT) {
      const btn = $("#nextBtn");
      btn.disabled = true;
      btn.textContent = "Invio dell'ordine…";
      let out;
      try {
        // text/plain body keeps this a "simple" request, so Apps Script needs no CORS preflight
        const res = await fetch(CALENDAR_ENDPOINT, { method: "POST", body: JSON.stringify({
          action: "book", cake: state.cake, servings: state.servings, variant: state.variant, extras: [...state.extras],
          writing: order.writing, date: order.date, slot: order.slot, delivery: order.delivery, address: order.address,
          name: order.name, phone: order.phone, email: $("#email").value.trim(), notes: $("#notes").value.trim() }) });
        out = await res.json();
      } catch {
        out = { ok: false, error: "network" };
      }
      btn.disabled = false;
      update();
      if (!out.ok) {
        if (out.error === "full" || out.error === "closed") {
          state.slot = null;
          goTo(2);
          await loadRemote();
          errEl.textContent = "Quella fascia si è appena riempita: scegline un'altra.";
        } else {
          errEl.textContent = "Invio non riuscito. Controlla la connessione e riprova.";
        }
        return;
      }
      Object.assign(order, { code: out.code, total: out.total, remote: true });
    }

    save([order, ...load()]);
    showConfirm(order);
    renderOrders();
  }

  function showConfirm(o) {
    $("#orderForm").hidden = true;
    document.querySelector(".steps").hidden = true;
    const c = $("#confirm");
    c.hidden = false;
    c.innerHTML = `
      <div class="confirm-badge">🎂</div>
      <h3>Ordine ricevuto, ${o.name.split(" ")[0]}!</h3>
      <p class="muted">Ti mandiamo un SMS di conferma al ${o.phone}.</p>
      <span class="code">${o.code}</span>
      <div class="confirm-list">
        <div><span>Torta</span><b>${o.cake}</b></div>
        <div><span>Persone</span><b>${o.servings} · ${o.variant}</b></div>
        ${o.extras.length ? `<div><span>Extra</span><b>${o.extras.join(", ")}</b></div>` : ""}
        ${o.writing ? `<div><span>Scritta</span><b>“${escapeHtml(o.writing)}”</b></div>` : ""}
        <div><span>${o.delivery === "consegna" ? "Consegna" : "Ritiro"}</span><b>${longFmt.format(fromIso(o.date))}<br>${o.slot}</b></div>
        <div><span>Totale (al ritiro)</span><b>${euro(o.total)}</b></div>
      </div>
      <div class="confirm-actions">
        <button class="btn btn-primary" id="icsBtn">📅 Aggiungi al calendario</button>
        <button class="btn btn-ghost-dark" id="newBtn">Nuovo ordine</button>
      </div>`;
    $("#icsBtn").addEventListener("click", () => downloadIcs(o));
    $("#newBtn").addEventListener("click", resetWizard);
    $("#wizard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetWizard() {
    $("#orderForm").reset();
    Object.assign(state, { cake: "frutti", servings: 10, variant: "classica", date: null, slot: null, delivery: "ritiro" });
    state.extras.clear();
    $("#servings").textContent = state.servings;
    $("#addressField").hidden = true;
    document.querySelector(`[name=cake][value=frutti]`).checked = true;
    document.querySelectorAll(".day").forEach(d => d.classList.remove("is-selected"));
    renderSlots();
    $("#confirm").hidden = true;
    $("#orderForm").hidden = false;
    document.querySelector(".steps").hidden = false;
    goTo(1);
  }

  function renderOrders() {
    const list = load();
    $("#myOrders").hidden = list.length === 0;
    $("#ordersList").innerHTML = list.map(o => {
      const d = fromIso(o.date);
      return `<li class="order-item">
        <div class="when"><b>${d.getDate()}</b><small>${monFmt.format(d).replace(".", "")}</small></div>
        <div class="what"><b>${o.cake}</b><span>${o.servings} pers. · ${o.slot} · ${euro(o.total)}</span></div>
        <button data-cancel="${o.code}" aria-label="Annulla ordine ${o.code}">Annulla</button>
      </li>`;
    }).join("");
  }
  $("#ordersList").addEventListener("click", async e => {
    const code = e.target.dataset.cancel;
    if (!code || !confirm("Vuoi annullare questo ordine?")) return;
    const o = load().find(x => x.code === code);
    if (CALENDAR_ENDPOINT && o && o.remote) {
      let out;
      try {
        const res = await fetch(CALENDAR_ENDPOINT, { method: "POST", body: JSON.stringify({ action: "cancel", code, phone: o.phone }) });
        out = await res.json();
      } catch {
        out = { ok: false };
      }
      // not_found = già cancellato dalla pasticceria nel calendario: va tolto anche qui
      if (!out.ok && out.error !== "not_found") return toast("Annullamento non riuscito, riprova");
      loadRemote();
    }
    save(load().filter(o => o.code !== code));
    renderOrders();
    toast("Ordine annullato");
  });
  renderOrders();

  /* ---------- Helpers ---------- */
  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function downloadIcs(o) {
    const [from, to] = o.slot.split("–");
    const stamp = (dateIso, hm) => dateIso.replace(/-/g, "") + "T" + hm.split(":").map(n => n.padStart(2, "0")).join("") + "00";
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pasticceria Aurora//IT", "BEGIN:VEVENT",
      `UID:${o.code}@pasticceria-aurora.demo`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART:${stamp(o.date, from)}`, `DTEND:${stamp(o.date, to)}`,
      `SUMMARY:${o.delivery === "consegna" ? "Consegna" : "Ritiro"} torta – Pasticceria Aurora`,
      `DESCRIPTION:${o.cake} per ${o.servings} persone. Ordine ${o.code}. Totale ${euro(o.total)}`,
      "LOCATION:Pasticceria Aurora\\, Via dei Fiori 18", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), download: `ordine-${o.code}.ics`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2400);
  }

  // Hide the mobile dock while the booking section is on screen
  new IntersectionObserver(([e]) => $("#dock").classList.toggle("is-hidden", e.isIntersecting), { threshold: 0.05 })
    .observe($("#ordina"));

  update();
  loadRemote();
})();
