# Collegare gli appuntamenti della barberia a Google Calendar

Ogni appuntamento preso sul sito diventa un evento nel calendario Google "Appuntamenti Ferro & Lama",
colorato per barbiere (Marco giallo, Luca arancione, Davide verde). Il sito legge lo stesso calendario
per mostrare solo gli orari liberi di ciascun barbiere. Serve solo un account Google: niente server, niente costi.

## 1. Crea lo script (5 minuti, dal computer)

1. Vai su <https://script.google.com> con l'account Google della barberia e clicca **Nuovo progetto**.
2. Cancella il contenuto di `Codice.gs` e incolla tutto il file [`Code.gs`](Code.gs).
3. Rinomina il progetto, per esempio "Appuntamenti Barberia".
4. Dal menu delle funzioni scegli **setup** → **Esegui** → autorizza l'accesso al Calendario
   (se compare "Google non ha verificato questa app": **Avanzate** → **Vai a …** → **Consenti**).

## 2. Pubblica lo script come Web App

1. Pulsante blu **Distribuisci** (in alto a destra) → **Nuova distribuzione** → ingranaggio → **App web**.
2. **Esegui come:** Me · **Chi ha accesso:** Chiunque (non "Chiunque abbia un account Google").
3. **Distribuisci** e copia l'URL che finisce con `/exec`.

## 3. Collega il sito

In `barberia/app.js`, riga in alto:

```js
const CALENDAR_ENDPOINT = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

## Come si usa ogni giorno

- **Appuntamenti online**: arrivano con cliente, telefono, servizi, durata, prezzo e note.
  Con "Primo disponibile" lo script assegna da solo il barbiere libero.
- **Barbiere assente** (ferie, malattia): evento di *tutto il giorno* con il suo nome nel titolo, per esempio "Marco ferie".
- **Pausa o appuntamento telefonico di un barbiere**: evento normale con il suo nome nel titolo, per esempio "Luca – cliente al telefono 15:00–15:30".
- **Negozio chiuso**: evento di tutto il giorno *senza* nomi di barbieri, per esempio "Chiuso per inventario".
- **Cancellare**: elimina l'evento. Il cliente può anche annullare dal sito ("Agenda").

Listino, durate e orari sono in cima a `Code.gs` (`SERVICES`, `OPEN`): se li cambi, cambiali anche in `barberia/app.js`,
poi **Distribuisci → Gestisci distribuzioni → matita → Nuova versione → Distribuisci** (l'URL resta lo stesso).

## iPhone e Mac

Aggiungi l'account Google nell'app Calendario (iPhone: **Impostazioni → Calendario → Account**):
il calendario "Appuntamenti Ferro & Lama" compare con le notifiche. Ogni barbiere può fare lo stesso
sul suo telefono se il titolare gli condivide il calendario da Google Calendar.

## Da sapere

- L'URL della Web App è pubblico: chiunque lo conosca può inviare appuntamenti, come con un modulo online.
  Lo script controlla orari, durata, sovrapposizioni e dati minimi.
- I dati dei clienti finiscono nel Google Calendar della barberia: sul sito serve un'informativa privacy (GDPR).
