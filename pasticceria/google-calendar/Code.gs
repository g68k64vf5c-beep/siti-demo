/**
 * Pasticceria Aurora – ordini di torte collegati a Google Calendar.
 *
 * Incolla questo file in un progetto su script.google.com e distribuiscilo come
 * "App web" (Esegui come: Me · Chi ha accesso: Chiunque). L'URL che ottieni va
 * messo in CALENDAR_ENDPOINT in pasticceria/app.js. Guida completa: LEGGIMI.md
 *
 * Il sito chiama:
 *   GET  ?from=AAAA-MM-GG&days=21          → giorni chiusi e ordini già presi per fascia oraria
 *   POST {"action":"book", ...}            → crea l'ordine nel calendario (prezzo ricalcolato qui)
 *   POST {"action":"cancel", code, phone}  → cancella l'ordine
 */

// Cambia a ogni modifica: il sito di prova lo legge per sapere quale versione è online
const SCRIPT_VERSION = 2;

const CONFIG = {
  calendarName: "Ordini Pasticceria Aurora",
  timeZone: "Europe/Rome",
  maxOrdersPerSlot: 3,    // torte che il laboratorio consegna nella stessa fascia oraria
  maxOrdersPerDay: 10,    // torte massime al giorno
  minNoticeDays: 2,       // preavviso minimo (48 ore)
  daysAhead: 30,
  deliveryFee: 6,
};

// Fasce di ritiro: devono coincidere con SLOTS in pasticceria/app.js
const SLOTS = ["8:00–10:00", "10:00–12:00", "12:00–13:30", "16:00–18:00", "18:00–19:30"];
const SUNDAY_SLOTS = 3;   // la domenica solo le prime tre (chiusura alle 13:30)
const CLOSED_WEEKDAY = 1; // lunedì

// Listino: il prezzo scritto in calendario viene da qui, non dal sito
const CAKES = {
  fondente: { name: "Torta Fondente", ppp: 4.2 },
  tiramisu: { name: "Tiramisù della casa", ppp: 3.8 },
  frutti: { name: "Crema e frutti di bosco", ppp: 4.0 },
  rainbow: { name: "Rainbow Cake", ppp: 4.5 },
};
const EXTRAS = {
  candeline: { name: "Candeline", price: 2 },
  zucchero: { name: "Decoro in pasta di zucchero", price: 15 },
  foto: { name: "Foto su cialda", price: 8 },
  regalo: { name: "Confezione regalo", price: 3 },
};
const VARIANTS = ["classica", "senza lattosio", "senza glutine"];

/* ---------- Entry points ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!isIsoDate(p.from)) return json({ ok: false, error: "bad_date" });
  const days = Math.min(31, Math.max(1, Number(p.days) || 1));
  return json(Object.assign({ ok: true, version: SCRIPT_VERSION }, schedule(p.from, days)));
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_request" }); }
  if (body.action === "book") return json(book(body));
  if (body.action === "cancel") return json(cancel(body));
  return json({ ok: false, error: "bad_action" });
}

/* ---------- Schedule ---------- */

// { closed: ["2026-10-27"], slots: { "2026-10-24": { "10:00–12:00": 2 } }, orders: { "2026-10-24": 2 }, perSlot, perDay }
function schedule(from, days) {
  const start = at(from, "00:00");
  const end = new Date(start.getTime() + days * 864e5);
  const closed = {};
  const slots = {};
  const orders = {};
  const add = (date, slot, n) => {
    slots[date] = slots[date] || {};
    slots[date][slot] = (slots[date][slot] || 0) + n;
  };

  const meta = PropertiesService.getScriptProperties().getProperties();

  getCalendar().getEvents(start, end).forEach(ev => {
    // Evento di tutto il giorno messo a mano (ferie, chiusura): giornata non ordinabile
    if (ev.isAllDayEvent()) {
      for (let d = ev.getAllDayStartDate(); d < ev.getAllDayEndDate(); d = new Date(d.getTime() + 864e5)) closed[fmt(d, "yyyy-MM-dd")] = true;
      return;
    }
    const day = fmt(ev.getStartTime(), "yyyy-MM-dd");
    const m = readMeta(meta, ev);
    const tagged = m && m.slot;
    if (tagged) {
      add(day, tagged, 1);
      orders[day] = (orders[day] || 0) + 1;
      return;
    }
    // Altro evento messo a mano (es. "Laboratorio pieno 16-19"): riempie le fasce che copre
    const s = minutesOf(ev.getStartTime()), e = s + Math.round((ev.getEndTime() - ev.getStartTime()) / 60000);
    SLOTS.forEach(slot => {
      const r = slotRange(slot);
      if (r[0] < e && r[1] > s) add(day, slot, CONFIG.maxOrdersPerSlot);
    });
  });

  return { closed: Object.keys(closed), slots: slots, orders: orders, perSlot: CONFIG.maxOrdersPerSlot, perDay: CONFIG.maxOrdersPerDay };
}

function slotAvailable(sched, date, slot) {
  if (sched.closed.indexOf(date) !== -1) return false;
  if ((sched.orders[date] || 0) >= CONFIG.maxOrdersPerDay) return false;
  return ((sched.slots[date] || {})[slot] || 0) < CONFIG.maxOrdersPerSlot;
}

/* ---------- Booking ---------- */

function book(b) {
  const cake = CAKES[b.cake];
  const servings = Math.round(Number(b.servings));
  const variant = VARIANTS.indexOf(b.variant) !== -1 ? b.variant : "classica";
  const extras = Array.isArray(b.extras) ? b.extras.filter((id, i, a) => EXTRAS[id] && a.indexOf(id) === i) : [];
  const delivery = b.delivery === "consegna" ? "consegna" : "ritiro";
  const address = clean(b.address, 150);
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 30);
  const digits = phone.replace(/\D/g, "");

  if (b.website) return { ok: false, error: "bad_request" }; // campo trappola per i bot
  if (!cake || !(servings >= 6 && servings <= 40)) return { ok: false, error: "bad_cake" };
  if (!isIsoDate(b.date) || SLOTS.indexOf(b.slot) === -1) return { ok: false, error: "bad_request" };
  if (name.length < 3 || digits.length < 8) return { ok: false, error: "bad_contact" };
  if (delivery === "consegna" && address.length < 6) return { ok: false, error: "bad_address" };

  // Preavviso minimo, giorno di chiusura e fasce della domenica
  const today = at(fmt(new Date(), "yyyy-MM-dd"), "00:00");
  const day = at(b.date, "00:00");
  const daysFromToday = Math.round((day - today) / 864e5);
  if (daysFromToday < CONFIG.minNoticeDays || daysFromToday > CONFIG.daysAhead) return { ok: false, error: "bad_date" };
  const weekday = Number(fmt(day, "u")) % 7;
  if (weekday === CLOSED_WEEKDAY || (weekday === 0 && SLOTS.indexOf(b.slot) >= SUNDAY_SLOTS)) return { ok: false, error: "closed" };

  let base = cake.ppp * servings;
  if (variant === "senza glutine") base *= 1.1;
  const extrasTotal = extras.reduce((t, id) => t + EXTRAS[id].price, 0);
  const total = Math.round((base + extrasTotal + (delivery === "consegna" ? CONFIG.deliveryFee : 0)) * 100) / 100;

  // Il lock evita che due clienti prendano l'ultimo posto nello stesso istante
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!slotAvailable(schedule(b.date, 1), b.date, b.slot)) return { ok: false, error: "full" };

    const code = "AUR-" + Math.floor(1000 + Math.random() * 9000);
    const range = slotRange(b.slot);
    const writing = clean(b.writing, 40);
    const notes = clean(b.notes, 400);
    const email = clean(b.email, 120);
    const ev = getCalendar().createEvent(
      `🎂 ${cake.name} · ${servings} pers. · ${name}${delivery === "consegna" ? " · 🛵 consegna" : ""}`,
      at(b.date, toTime(range[0])), at(b.date, toTime(range[1])),
      {
        location: delivery === "consegna" ? address : "Ritiro in negozio",
        description: [
          "Ordine online " + code,
          "Cliente: " + name,
          "Telefono: " + phone,
          email ? "Email: " + email : "",
          "Torta: " + cake.name + " · " + servings + " persone · " + variant,
          extras.length ? "Extra: " + extras.map(id => EXTRAS[id].name).join(", ") : "",
          writing ? "Scritta: \"" + writing + "\"" : "",
          delivery === "consegna" ? "Consegna a: " + address : "Ritiro in negozio",
          "Totale da incassare: €" + total.toFixed(2).replace(".", ","),
          notes ? "Note: " + notes : "",
        ].filter(String).join("\n"),
      }
    );
    saveMeta(ev, code, digits, { slot: b.slot });
    return { ok: true, code: code, total: total };
  } finally {
    lock.releaseLock();
  }
}

function cancel(b) {
  const code = clean(b.code, 20);
  const digits = clean(b.phone, 30).replace(/\D/g, "");
  if (!code || !digits) return { ok: false, error: "bad_request" };
  return deleteBooking(code, digits);
}

/* ---------- Helpers ---------- */

// Usa (o crea al primo avvio) un calendario dedicato, separato da quello personale
function getCalendar() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("calendarId");
  let cal = id && CalendarApp.getCalendarById(id);
  if (!cal) {
    cal = CalendarApp.getCalendarsByName(CONFIG.calendarName)[0]
      || CalendarApp.createCalendar(CONFIG.calendarName, { timeZone: CONFIG.timeZone, color: CalendarApp.Color.PINK });
    props.setProperty("calendarId", cal.getId());
  }
  return cal;
}

// Da eseguire una volta dall'editor: crea il calendario e chiede le autorizzazioni
function setup() {
  Logger.log("Calendario pronto: " + getCalendar().getName());
}

// I dati di ogni ordine (fascia, codice, telefono) stanno nella memoria dello script:
// leggerli e scriverli è istantaneo, mentre ogni etichetta salvata sull'evento è una chiamata lenta a Calendar
function readMeta(all, ev) {
  const m = all["ev:" + ev.getId()];
  return m ? JSON.parse(m) : null;
}
function saveMeta(ev, code, digits, meta) {
  const p = {};
  p["ev:" + ev.getId()] = JSON.stringify(meta);
  p["code:" + code] = JSON.stringify({ id: ev.getId(), phone: digits });
  PropertiesService.getScriptProperties().setProperties(p);
}
function deleteBooking(code, digits) {
  const store = PropertiesService.getScriptProperties();
  const ref = JSON.parse(store.getProperty("code:" + code) || "null");
  if (!ref || ref.phone !== digits) return { ok: false, error: "not_found" };
  const ev = getCalendar().getEventById(ref.id);
  store.deleteProperty("code:" + code);
  store.deleteProperty("ev:" + ref.id);
  if (!ev) return { ok: false, error: "not_found" };
  ev.deleteEvent();
  return { ok: true };
}

// "10:00–12:00" → [600, 720]
function slotRange(slot) { return slot.split("–").map(toMin); }
function at(date, time) { return Utilities.parseDate(date + " " + time, CONFIG.timeZone, "yyyy-MM-dd HH:mm"); }
function fmt(d, pattern) { return Utilities.formatDate(d, CONFIG.timeZone, pattern); }
function minutesOf(d) { return toMin(fmt(d, "HH:mm")); }
function toMin(t) { const p = String(t).split(":"); return Number(p[0]) * 60 + Number(p[1]); }
function toTime(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
function isIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function clean(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
