/**
 * Ferro & Lama Barber Club – appuntamenti collegati a Google Calendar.
 *
 * Incolla questo file in un progetto su script.google.com e distribuiscilo come
 * "App web" (Esegui come: Me · Chi ha accesso: Chiunque). L'URL che ottieni va
 * messo in CALENDAR_ENDPOINT in barberia/app.js. Guida completa: LEGGIMI.md
 *
 * Il sito chiama:
 *   GET  ?from=AAAA-MM-GG&days=21          → giorni chiusi e orari occupati di ogni barbiere
 *   POST {"action":"book", ...}            → crea l'appuntamento nel calendario
 *   POST {"action":"cancel", code, phone}  → cancella l'appuntamento
 */

const CONFIG = {
  calendarName: "Appuntamenti Ferro & Lama",
  timeZone: "Europe/Rome",
  slotMinutes: 30,
  daysAhead: 30,
};

// Orari di apertura (0 = domenica); null = chiuso. Devono coincidere con OPEN in barberia/app.js
const OPEN = { 0: null, 1: null, 2: ["09:00", "19:30"], 3: ["09:00", "19:30"], 4: ["09:00", "19:30"], 5: ["09:00", "19:30"], 6: ["08:30", "18:00"] };

// Listino: i prezzi e le durate scritti in calendario vengono da qui, non dal sito
const SERVICES = {
  taglio: { name: "Taglio uomo", min: 30, price: 22 },
  fade: { name: "Skin fade", min: 45, price: 25 },
  barba: { name: "Barba", min: 20, price: 15 },
  rasatura: { name: "Rasatura al panno caldo", min: 30, price: 18 },
  bimbo: { name: "Taglio bambino", min: 25, price: 15 },
  grigio: { name: "Camouflage grigio", min: 20, price: 18 },
};

// Ogni barbiere ha il suo colore in calendario
const BARBERS = {
  marco: { name: "Marco", color: "YELLOW" },
  luca: { name: "Luca", color: "ORANGE" },
  davide: { name: "Davide", color: "PALE_GREEN" },
};
const BARBER_IDS = Object.keys(BARBERS);

/* ---------- Entry points ---------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!isIsoDate(p.from)) return json({ ok: false, error: "bad_date" });
  const days = Math.min(31, Math.max(1, Number(p.days) || 1));
  return json(Object.assign({ ok: true }, schedule(p.from, days)));
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_request" }); }
  if (body.action === "book") return json(book(body));
  if (body.action === "cancel") return json(cancel(body));
  return json({ ok: false, error: "bad_action" });
}

/* ---------- Schedule ---------- */

// Legge il calendario e restituisce i giorni chiusi e, per ogni giorno e barbiere,
// gli intervalli occupati in minuti dalla mezzanotte: { busy: { "2026-10-24": { marco: [[540, 570]] } } }
function schedule(from, days) {
  const start = at(from, "00:00");
  const end = new Date(start.getTime() + days * 864e5);
  const closed = {};
  const busy = {};
  const add = (date, barber, range) => {
    busy[date] = busy[date] || {};
    (busy[date][barber] = busy[date][barber] || []).push(range);
  };

  getCalendar().getEvents(start, end).forEach(ev => {
    const who = barbersOf(ev);
    if (ev.isAllDayEvent()) {
      // Tutto il giorno: col nome di un barbiere = quel barbiere è assente, altrimenti negozio chiuso
      for (let d = ev.getAllDayStartDate(); d < ev.getAllDayEndDate(); d = new Date(d.getTime() + 864e5)) {
        const day = fmt(d, "yyyy-MM-dd");
        if (who.length === BARBER_IDS.length) closed[day] = true;
        else who.forEach(b => add(day, b, [0, 1440]));
      }
      return;
    }
    const day = fmt(ev.getStartTime(), "yyyy-MM-dd");
    const s = minutesOf(ev.getStartTime());
    const len = Math.round((ev.getEndTime() - ev.getStartTime()) / 60000);
    who.forEach(b => add(day, b, [s, Math.min(1440, s + len)]));
  });

  return { closed: Object.keys(closed), busy: busy };
}

// A chi si riferisce un evento: tag messo dal sito, oppure nome del barbiere nel titolo, oppure a tutti
function barbersOf(ev) {
  const tag = ev.getTag("barber");
  if (tag && BARBERS[tag]) return [tag];
  const title = ev.getTitle().toLowerCase();
  const named = BARBER_IDS.filter(id => title.indexOf(BARBERS[id].name.toLowerCase()) !== -1);
  return named.length ? named : BARBER_IDS.slice();
}

function isFree(sched, date, barber, from, to) {
  if (sched.closed.indexOf(date) !== -1) return false;
  const list = (sched.busy[date] && sched.busy[date][barber]) || [];
  return !list.some(r => r[0] < to && r[1] > from);
}

/* ---------- Booking ---------- */

function book(b) {
  const ids = Array.isArray(b.services) ? b.services.filter((id, i, a) => SERVICES[id] && a.indexOf(id) === i) : [];
  const name = clean(b.name, 60);
  const phone = clean(b.phone, 30);
  const digits = phone.replace(/\D/g, "");

  if (b.website) return { ok: false, error: "bad_request" }; // campo trappola per i bot
  if (!ids.length) return { ok: false, error: "bad_services" };
  if (!isIsoDate(b.date) || !/^\d{2}:\d{2}$/.test(String(b.start))) return { ok: false, error: "bad_request" };
  if (name.length < 2 || digits.length < 8) return { ok: false, error: "bad_contact" };
  if (b.barber !== "any" && !BARBERS[b.barber]) return { ok: false, error: "bad_barber" };

  const minutes = ids.reduce((t, id) => t + SERVICES[id].min, 0);
  const price = ids.reduce((t, id) => t + SERVICES[id].price, 0);
  const units = Math.ceil(minutes / CONFIG.slotMinutes);

  // L'orario deve stare dentro l'apertura, allineato agli slot e non nel passato
  const startDate = at(b.date, b.start);
  const now = new Date();
  if (startDate < new Date(now.getTime() + 30 * 60000) || startDate > new Date(now.getTime() + CONFIG.daysAhead * 864e5)) return { ok: false, error: "bad_date" };
  const open = OPEN[Number(fmt(startDate, "u")) % 7];
  if (!open) return { ok: false, error: "closed" };
  const s = toMin(b.start), opensAt = toMin(open[0]), closesAt = toMin(open[1]);
  if (s < opensAt || (s - opensAt) % CONFIG.slotMinutes || s + units * CONFIG.slotMinutes > closesAt) return { ok: false, error: "closed" };
  const e = s + units * CONFIG.slotMinutes;

  // Il lock evita che due clienti prendano lo stesso posto nello stesso istante
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sched = schedule(b.date, 1);
    const pool = b.barber === "any" ? BARBER_IDS : [b.barber];
    const barber = pool.find(id => isFree(sched, b.date, id, s, e));
    if (!barber) return { ok: false, error: "busy" };

    const code = "FL-" + Math.floor(1000 + Math.random() * 9000);
    const names = ids.map(id => SERVICES[id].name);
    const notes = clean(b.notes, 300);
    const ev = getCalendar().createEvent(
      `✂️ ${BARBERS[barber].name} · ${name} · ${names.join(" + ")}`,
      startDate, new Date(startDate.getTime() + minutes * 60000),
      {
        location: "Ferro & Lama Barber Club",
        description: [
          "Appuntamento online " + code,
          "Cliente: " + name,
          "Telefono: " + phone,
          "Barbiere: " + BARBERS[barber].name + (b.barber === "any" ? " (assegnato automaticamente)" : ""),
          "Servizi: " + names.join(" + "),
          "Durata: " + minutes + " min · Totale: €" + price,
          b.reminder ? "Vuole un promemoria 2 ore prima" : "",
          notes ? "Note: " + notes : "",
        ].filter(String).join("\n"),
      }
    );
    ev.setTag("barber", barber);
    ev.setTag("code", code);
    ev.setTag("phone", digits);
    ev.setColor(CalendarApp.EventColor[BARBERS[barber].color]);
    return { ok: true, code: code, barber: barber, minutes: minutes, total: price };
  } finally {
    lock.releaseLock();
  }
}

function cancel(b) {
  const code = clean(b.code, 20);
  const digits = clean(b.phone, 30).replace(/\D/g, "");
  if (!code || !digits) return { ok: false, error: "bad_request" };
  const from = new Date(Date.now() - 864e5);
  const to = new Date(Date.now() + CONFIG.daysAhead * 864e5);
  const ev = getCalendar().getEvents(from, to).find(x => x.getTag("code") === code && x.getTag("phone") === digits);
  if (!ev) return { ok: false, error: "not_found" };
  ev.deleteEvent();
  return { ok: true };
}

/* ---------- Helpers ---------- */

// Usa (o crea al primo avvio) un calendario dedicato, separato da quello personale
function getCalendar() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("calendarId");
  let cal = id && CalendarApp.getCalendarById(id);
  if (!cal) {
    cal = CalendarApp.getCalendarsByName(CONFIG.calendarName)[0]
      || CalendarApp.createCalendar(CONFIG.calendarName, { timeZone: CONFIG.timeZone, color: CalendarApp.Color.YELLOW });
    props.setProperty("calendarId", cal.getId());
  }
  return cal;
}

// Da eseguire una volta dall'editor: crea il calendario e chiede le autorizzazioni
function setup() {
  Logger.log("Calendario pronto: " + getCalendar().getName());
}

function at(date, time) { return Utilities.parseDate(date + " " + time, CONFIG.timeZone, "yyyy-MM-dd HH:mm"); }
function fmt(d, pattern) { return Utilities.formatDate(d, CONFIG.timeZone, pattern); }
function minutesOf(d) { return toMin(fmt(d, "HH:mm")); }
function toMin(t) { const p = String(t).split(":"); return Number(p[0]) * 60 + Number(p[1]); }
function isIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function clean(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
