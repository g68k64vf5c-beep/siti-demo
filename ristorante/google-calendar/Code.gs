/**
 * Osteria del Borgo – prenotazioni collegate a Google Calendar.
 *
 * Incolla questo file in un progetto su script.google.com e distribuiscilo come
 * "App web" (Esegui come: Me · Chi ha accesso: Chiunque). L'URL che ottieni va
 * messo in CALENDAR_ENDPOINT in ristorante/app.js. Guida completa: LEGGIMI.md
 *
 * Il sito chiama:
 *   GET  ?date=AAAA-MM-GG                 → disponibilità del giorno
 *   POST {"action":"book", ...}           → crea la prenotazione nel calendario
 *   POST {"action":"cancel", code, phone} → cancella la prenotazione
 */

const CONFIG = {
  calendarName: "Prenotazioni Osteria del Borgo",
  timeZone: "Europe/Rome",
  durationMinutes: 120,   // durata dell'evento in calendario
  maxCoversPerSlot: 24,   // coperti massimi che possono arrivare allo stesso orario
  maxGuests: 12,
  daysAhead: 60,          // fino a quanti giorni in avanti si accettano prenotazioni
};

// Gli orari che il sito propone (0 = domenica): un orario fuori lista viene rifiutato
const HOURS = {
  0: ["12:00", "12:30", "13:00", "13:30", "14:00", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"],
  1: ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
  2: [],
  3: ["12:00", "12:30", "13:00", "13:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
  4: ["12:00", "12:30", "13:00", "13:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
  5: ["12:00", "12:30", "13:00", "13:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
  6: ["12:00", "12:30", "13:00", "13:30", "14:00", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"],
};

/* ---------- Entry points ---------- */

function doGet(e) {
  const date = String((e && e.parameter && e.parameter.date) || "");
  if (!isIsoDate(date)) return json({ ok: false, error: "bad_date" });
  return json(Object.assign({ ok: true }, availability(date)));
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: "bad_request" }); }
  if (body.action === "book") return json(book(body));
  if (body.action === "cancel") return json(cancel(body));
  return json({ ok: false, error: "bad_action" });
}

/* ---------- Availability ---------- */

function availability(date) {
  const dayStart = at(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 864e5);
  const slots = {};
  const blocked = [];
  let closed = false;

  getCalendar().getEvents(dayStart, dayEnd).forEach(ev => {
    // Evento "Chiuso" di tutto il giorno, messo a mano dal titolare: giornata non prenotabile
    if (ev.isAllDayEvent()) {
      if (/chius/i.test(ev.getTitle())) closed = true;
      return;
    }
    const covers = Number(ev.getTag("covers"));
    if (covers) {
      const t = Utilities.formatDate(ev.getStartTime(), CONFIG.timeZone, "HH:mm");
      slots[t] = (slots[t] || 0) + covers;
    } else {
      // Qualsiasi altro evento inserito a mano (evento privato, sala riservata…) blocca la sua fascia
      blocked.push({
        from: Utilities.formatDate(ev.getStartTime(), CONFIG.timeZone, "HH:mm"),
        to: Utilities.formatDate(ev.getEndTime(), CONFIG.timeZone, "HH:mm"),
      });
    }
  });

  return { date: date, closed: closed, capacity: CONFIG.maxCoversPerSlot, slots: slots, blocked: blocked };
}

function isFree(av, time, guests) {
  if (av.closed) return false;
  if (av.blocked.some(b => time >= b.from && time < b.to)) return false;
  return (av.slots[time] || 0) + guests <= av.capacity;
}

/* ---------- Booking ---------- */

function book(b) {
  const guests = Math.round(Number(b.guests));
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 30);
  const digits = phone.replace(/\D/g, "");

  if (b.website) return { ok: false, error: "bad_request" }; // campo trappola per i bot
  if (!isIsoDate(b.date) || !/^\d{2}:\d{2}$/.test(String(b.time))) return { ok: false, error: "bad_request" };
  if (!(guests >= 1 && guests <= CONFIG.maxGuests)) return { ok: false, error: "bad_guests" };
  if (name.length < 3 || digits.length < 8) return { ok: false, error: "bad_contact" };

  const start = at(b.date, b.time);
  const now = new Date();
  if (start < now || start > new Date(now.getTime() + CONFIG.daysAhead * 864e5)) return { ok: false, error: "bad_date" };
  const weekday = Number(Utilities.formatDate(start, CONFIG.timeZone, "u")) % 7; // 1=lun … 7=dom → 0=dom
  if (HOURS[weekday].indexOf(b.time) === -1) return { ok: false, error: "closed" };

  // Il lock evita che due persone prendano l'ultimo posto nello stesso istante
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!isFree(availability(b.date), b.time, guests)) return { ok: false, error: "full" };

    const code = "BRG-" + Math.floor(1000 + Math.random() * 9000);
    const area = clean(b.area, 20) || "sala";
    const occasion = clean(b.occasion, 40);
    const notes = clean(b.notes, 500);
    const email = clean(b.email, 120);
    const end = new Date(start.getTime() + CONFIG.durationMinutes * 60000);

    const ev = getCalendar().createEvent(
      `🍽 ${guests} pers. · ${name}${occasion ? " · " + occasion : ""}`,
      start, end,
      {
        location: "Osteria del Borgo – " + area,
        description: [
          "Prenotazione online " + code,
          "Nome: " + name,
          "Telefono: " + phone,
          email ? "Email: " + email : "",
          "Persone: " + guests,
          "Sala: " + area,
          occasion ? "Occasione: " + occasion : "",
          notes ? "Note: " + notes : "",
        ].filter(String).join("\n"),
      }
    );
    ev.setTag("covers", String(guests));
    ev.setTag("code", code);
    ev.setTag("phone", digits);
    if (occasion) ev.setColor(CalendarApp.EventColor.MAUVE);
    return { ok: true, code: code };
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
      || CalendarApp.createCalendar(CONFIG.calendarName, { timeZone: CONFIG.timeZone, color: CalendarApp.Color.BROWN });
    props.setProperty("calendarId", cal.getId());
  }
  return cal;
}

// Da eseguire una volta dall'editor: crea il calendario e chiede le autorizzazioni
function setup() {
  Logger.log("Calendario pronto: " + getCalendar().getName());
}

function at(date, time) {
  return Utilities.parseDate(date + " " + time, CONFIG.timeZone, "yyyy-MM-dd HH:mm");
}
function isIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function clean(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
