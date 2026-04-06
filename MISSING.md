# Cosa manca — Busta Chiusa

Stato aggiornato. Diviso per priorità.

---

## 🟡 Importante (funziona ma manca qualcosa)

### Export CSV — una sezione per squadra
L'export in `AuctionSummary.tsx` genera il file con commenti `# NomeSquadra`, ma LegheFantacalcio potrebbe accettare un file per singola squadra (l'admin importa una squadra alla volta).
**Da verificare**: testare l'import su una lega reale e adattare il formato se necessario.

### Notifica sonora/vibrazione apertura busta
Definita nel documento progettuale ma non implementata. Il Web Audio API è disponibile nei browser, ma richiede un gesto utente preventivo (limitazione browser).
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
Un partecipante non può vedere a colpo d'occhio se un calciatore è stato venduto a lui stesso vs ad altri.
**Soluzione**: colorazione diversa per "venduto a te" vs "venduto ad altri".

### Asta di riparazione
Possibilità di caricare una sessione con rose parziali pre-esistenti per continuare da dove si era rimasti. La struttura dati è già predisposta ma manca l'UI.

### TV mode
Schermata ottimizzata per proiezione su schermo esterno. Full-screen, font grandi, no interazione. Route separata.

### Override gestione parità
Al terzo pareggio il sistema sorteggia automaticamente. Alcune leghe preferiscono gestire la parità in modo diverso — potrebbe diventare un'opzione di sessione.

---

## 📋 File non toccati (rispetto alla repo originale)

| File | Note |
|------|------|
| `src/context/AuthContext.tsx` | Funziona, nessun bug critico trovato |
| `src/App.tsx` | Funziona, routing corretto |
| `src/main.tsx` | Nessuna modifica necessaria |
| `src/lib/utils.ts` | Nessuna modifica necessaria |
| `src/index.css` | Nessuna modifica necessaria |
| `vite.config.ts` | Nessuna modifica necessaria |
| `tsconfig.json` | Nessuna modifica necessaria |
| `firebase-blueprint.json` | Da aggiornare con le nuove collection (roster, auctionHistory) |
