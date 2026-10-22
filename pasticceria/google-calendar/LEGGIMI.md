# Collegare gli ordini della pasticceria a Google Calendar

Ogni torta ordinata sul sito diventa un evento nel calendario Google "Ordini Pasticceria Aurora",
nella fascia di ritiro scelta (rosa = ritiro in negozio, arancione = consegna). Il sito legge lo stesso
calendario per non accettare più ordini di quanti il laboratorio riesce a preparare.
Serve solo un account Google: niente server, niente costi.

## 1. Crea lo script (5 minuti, dal computer)

1. Vai su <https://script.google.com> con l'account Google della pasticceria e clicca **Nuovo progetto**.
2. Cancella il contenuto di `Codice.gs` e incolla tutto il file [`Code.gs`](Code.gs).
3. Rinomina il progetto, per esempio "Ordini Pasticceria".
4. Dal menu delle funzioni scegli **setup** → **Esegui** → autorizza l'accesso al Calendario
   (se compare "Google non ha verificato questa app": **Avanzate** → **Vai a …** → **Consenti**).

## 2. Pubblica lo script come Web App

1. Pulsante blu **Distribuisci** (in alto a destra) → **Nuova distribuzione** → ingranaggio → **App web**.
2. **Esegui come:** Me · **Chi ha accesso:** Chiunque (non "Chiunque abbia un account Google").
3. **Distribuisci** e copia l'URL che finisce con `/exec`.

## 3. Collega il sito

In `pasticceria/app.js`, riga in alto:

```js
const CALENDAR_ENDPOINT = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

## Come si usa ogni giorno

- **Ordini online**: arrivano con torta, persone, variante, extra, scritta, indirizzo di consegna e
  **totale da incassare**. Il prezzo è ricalcolato dallo script, non preso dal sito.
- **Capienza del laboratorio**: in cima a `Code.gs`, `maxOrdersPerSlot` (ora 3 torte per fascia) e
  `maxOrdersPerDay` (ora 10 al giorno). Le fasce e i giorni pieni spariscono dal sito.
- **Giorno di chiusura o ferie**: evento di *tutto il giorno* qualsiasi, per esempio "Chiuso".
- **Laboratorio occupato** (catering, evento): evento normale, per esempio 16:00–19:30 "Torta nuziale":
  le fasce che copre non sono più ordinabili.
- **Cancellare un ordine**: elimina l'evento. Il cliente può anche annullare dal sito ("I tuoi ordini").

Listino, fasce e preavviso sono in cima a `Code.gs` (`CAKES`, `EXTRAS`, `SLOTS`): se li cambi, cambiali anche
in `pasticceria/app.js`, poi **Distribuisci → Gestisci distribuzioni → matita → Nuova versione → Distribuisci**.

## iPhone e Mac

Aggiungi l'account Google nell'app Calendario (iPhone: **Impostazioni → Calendario → Account**):
il calendario "Ordini Pasticceria Aurora" compare con le notifiche.

## Da sapere

- L'URL della Web App è pubblico: chiunque lo conosca può inviare ordini, come con un modulo online.
  Lo script controlla date, fasce, capienza, prezzi e dati minimi.
- I dati dei clienti finiscono nel Google Calendar della pasticceria: sul sito serve un'informativa privacy (GDPR).
