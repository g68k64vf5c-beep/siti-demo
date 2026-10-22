# Collegare le prenotazioni del ristorante a Google Calendar

Ogni prenotazione fatta sul sito diventa un evento in un calendario Google dedicato
("Prenotazioni Osteria del Borgo"), e il sito legge lo stesso calendario per sapere
quali orari sono liberi. Serve solo un account Google: niente server, niente costi.

## 1. Crea lo script (5 minuti, dal computer)

1. Vai su <https://script.google.com> con l'account Google del locale e clicca **Nuovo progetto**.
2. Cancella il contenuto di `Codice.gs` e incolla tutto il file [`Code.gs`](Code.gs).
3. In alto rinomina il progetto, per esempio "Prenotazioni Osteria".
4. Dal menu delle funzioni scegli **setup** e clicca **Esegui**.
   Google chiede di autorizzare l'accesso al Calendario: **Rivedi autorizzazioni** → scegli l'account →
   se compare "Google non ha verificato questa app" clicca **Avanzate** → **Vai a Prenotazioni Osteria** → **Consenti**.
   (È normale: lo script l'hai creato tu e lo usi solo tu.)
   Nel tuo Google Calendar compare il nuovo calendario **Prenotazioni Osteria del Borgo**.

## 2. Pubblica lo script come Web App

1. Clicca **Distribuisci** → **Nuova distribuzione** → icona ingranaggio → **App web**.
2. Imposta:
   - **Esegui come:** Me
   - **Chi ha accesso:** Chiunque
3. Clicca **Distribuisci** e copia l'**URL dell'app web** (finisce con `/exec`).

## 3. Collega il sito

Apri `ristorante/app.js` e incolla l'URL nella riga in alto:

```js
const CALENDAR_ENDPOINT = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

Poi carica la modifica su GitHub. Nella finestra di prenotazione comparirà la scritta
verde **"Disponibilità in tempo reale"**.

## Come si usa ogni giorno

- **Le prenotazioni** arrivano nel calendario con nome, telefono, persone, sala, occasione e note
  (l'occasione speciale è anche nel titolo, per esempio "🍽 4 pers. · Rossi · Compleanno").
- **Chiudere un giorno** (ferie, evento privato): crea un evento di *tutto il giorno* con "Chiuso" nel titolo.
- **Bloccare una fascia oraria**: crea un evento normale, per esempio 21:00–23:00 "Sala riservata".
  Gli orari coperti spariscono dal sito.
- **Cancellare una prenotazione**: basta eliminare l'evento. Il cliente può anche annullare dal sito
  (sezione "Le mie prenotazioni").
- **Capienza**: in `Code.gs`, `maxCoversPerSlot` indica quanti coperti possono arrivare allo stesso orario (ora 24).

## iPhone e Mac

Sull'iPhone: **Impostazioni → Calendario → Account → Aggiungi account → Google**, poi attiva *Calendari*.
Sul Mac: **Calendario → Impostazioni → Account → +**.
Il calendario "Prenotazioni Osteria del Borgo" appare nell'app Calendario di Apple, con le notifiche.

## Se modifichi `Code.gs`

Dopo ogni modifica: **Distribuisci → Gestisci distribuzioni → matita → Versione: Nuova versione → Distribuisci**.
L'URL resta lo stesso.

## Da sapere

- L'URL della Web App è pubblico: chiunque lo conosca può inviare prenotazioni, come con qualsiasi modulo online.
  Lo script controlla date, orari, capienza e dati minimi, ma non sostituisce un sistema anti-spam.
- I dati dei clienti finiscono nel Google Calendar del locale: sul sito serve un'informativa privacy (GDPR).
- Limiti gratuiti di Google: circa 5.000 eventi creati al giorno, molto più di quanto serve a un ristorante.
