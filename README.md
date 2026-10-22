# Siti demo con prenotazione online

Tre siti dimostrativi, pensati per lo smartphone, con prenotazione integrata:

| Demo | Cartella | Cosa mostra |
| --- | --- | --- |
| Pasticceria Aurora | `pasticceria/` | Vetrina prodotti, configuratore torta con prezzo in tempo reale, ritiro o consegna |
| Osteria del Borgo | `ristorante/` | Menu a schede, prenotazione tavolo per pranzo/cena con disponibilità e scelta della sala |
| Ferro & Lama | `barberia/` | Prenotazione stile app: servizi, barbiere, orario libero, "I miei appuntamenti" |

Sono siti statici (HTML, CSS e JavaScript, senza dipendenze) pubblicati con GitHub Pages.
Le prenotazioni sono simulate e restano salvate solo nel browser di chi le fa (`localStorage`).

Per provarli in locale:

```bash
python -m http.server 5173
```

Foto: [Unsplash](https://unsplash.com). Attività, recensioni e contatti sono di fantasia.
