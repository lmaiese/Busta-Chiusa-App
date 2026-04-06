# Cosa manca — Busta Chiusa

Stato al termine delle iterazioni correnti. Diviso per priorità.

---

## 🔴 Critico (blocca il funzionamento corretto)

### Home.tsx — bug non risolti
Il componente originale ha problemi noti non ancora toccati:
- Retry su `Permission denied` anonimo: la logica di retry con `setTimeout` è fragile
- Nessun feedback visivo mentre l'utente anonimo si connette
- Il campo codice non ha validazione formato (deve essere 6 caratteri alfanumerici)
- Su mobile la tastiera può coprire i campi input senza scroll automatico

### bidCount — race condition
Attualmente ogni partecipante incrementa `bidCount` direttamente su Firestore con `increment(1)`. Se due utenti offrono nello stesso istante, uno dei due write può essere sovrascritto e il contatore risulta impreciso.
**Soluzione**: spostare l'incremento dentro la Cloud Function `startAuction`/bid write — oppure usare un trigger Firestore `onDocumentWritten` su `bids/{uid}`.

### Nessuna gestione Mantra nell'assegnazione rosterCount
La Cloud Function `processAssignment` usa `getPrimaryRole` che restituisce solo il **primo** ruolo Mantra del calciatore (es. per `Dd/Ds/E` restituisce `Dd`). Questo è corretto per il conteggio slot, ma non considera che un fantallenatore potrebbe voler "usare" il calciatore in un ruolo secondario.
**Stato attuale**: accettabile per MVP, da discutere con utenti.

---

## 🟡 Importante (funziona ma manca qualcosa)

### Schermata riepilogo finale
Non esiste ancora una schermata di fine asta. Attualmente l'asta finisce quando il listone è esaurito, ma non c'è:
- Schermata "Asta terminata" con riepilogo completo
- Pulsante export CSV prominente
- Riepilogo rose finali per ogni squadra
- Storico completo ordinato per categoria/ruolo

**Da implementare**: `src/pages/AuctionSummary.tsx` + route `/session/:id/summary`

### Export CSV — una sezione per squadra
L'export attuale in `RosterList.tsx` genera il file correttamente (`Id;Crediti` per riga), ma LegheFantacalcio accetta un file per singola squadra (l'admin importa una squadra alla volta). Il formato attuale con commenti `# NomeSquadra` potrebbe non essere riconosciuto.
**Da verificare**: testare l'import su una lega reale e adattare il formato se necessario.

### Notifica sonora/vibrazione apertura busta
Definita nel documento progettuale ma non implementata. Il Web Audio API è disponibile nei browser, ma richiede un gesto utente preventivo per funzionare (limitazione browser).
**Soluzione consigliata**: bottone "Attiva suoni" nella lobby prima dell'inizio asta.

### Connessione/disconnessione partecipanti
Il campo `isConnected` su Firestore viene scritto a `true` al join ma non viene mai aggiornato. Non c'è un meccanismo heartbeat né gestione della disconnessione.
**Soluzione**: Firebase Realtime Database `onDisconnect()` o un heartbeat con Cloud Function scheduled.

---

## 🟢 Nice-to-have (versione 1.1+)

### Storico sessioni banditore
Il banditore non ha uno storico delle sessioni passate. Attualmente ogni sessione è indipendente e non collegata all'account.
**Soluzione**: collection `users/{uid}/sessions` con riferimento alle sessioni create.

### Ordinamento random stabile
L'ordinamento "Casuale" nel listone cambia ad ogni render. Dovrebbe essere generato una volta per sessione e persistito.
**Soluzione**: `shuffleSeed` nella sessione, generato alla creazione.

### Filtro "calciatori già nella tua rosa" dal listone
Un partecipante non può vedere a colpo d'occhio se un calciatore in lista è già stato venduto a lui stesso vs ad altri.
**Soluzione**: colorazione diversa per "venduto a te" vs "venduto ad altri".

### Asta di riparazione
Possibilità di caricare una sessione con rose parziali pre-esistenti per continuare da dove si era rimasti. La struttura dati è già predisposta ma manca l'UI.

### TV mode
Schermata ottimizzata per proiezione su schermo esterno. Full-screen, font grandi, no interazione. Da implementare come route separata.

### Override canali di parità
Attualmente al secondo pareggio il sistema avvia automaticamente una terza busta chiusa. Alcune leghe preferiscono gestire il pareggio in modo diverso. Potrebbe diventare un'opzione di sessione.

---

## 📋 File ancora non toccati (rispetto alla repo originale)

| File | Note |
|------|------|
| `src/pages/Home.tsx` | Bug noti elencati sopra — da riscrivere |
| `src/context/AuthContext.tsx` | Funziona, nessun bug critico trovato |
| `src/App.tsx` | Funziona, routing corretto |
| `src/main.tsx` | Nessuna modifica necessaria |
| `src/lib/utils.ts` | Nessuna modifica necessaria |
| `src/index.css` | Nessuna modifica necessaria |
| `vite.config.ts` | Nessuna modifica necessaria |
| `tsconfig.json` | Nessuna modifica necessaria |
| `firebase-blueprint.json` | Da aggiornare con le nuove collection (roster) |

---

## 📊 Stima effort rimanente

| Feature | Effort stimato |
|---------|---------------|
| Fix Home.tsx | ~2h |
| Schermata riepilogo finale | ~3h |
| Suoni/vibrazione | ~1h |
| Heartbeat connessione | ~2h |
| Storico sessioni banditore | ~2h |
| bidCount server-side | ~1h |
| Export CSV verificato su LegheFC | ~1h test |
| **Totale MVP solido** | **~12h** |
