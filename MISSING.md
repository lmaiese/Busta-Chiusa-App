# Cosa manca — Busta Chiusa

Stato aggiornato. Diviso per priorità.

---

## 🟡 Importante (funziona ma manca qualcosa)

### Export CSV — una sezione per squadra
L'export in `AuctionSummary.tsx` genera il file con commenti `# NomeSquadra`, ma LegheFantacalcio potrebbe accettare un file per singola squadra (l'admin importa una squadra alla volta).
**Da verificare**: testare l'import su una lega reale e adattare il formato se necessario.

---

## 🟢 Nice-to-have (versione 1.1+)

### Storico sessioni banditore
Il banditore non ha uno storico delle sessioni passate. Attualmente ogni sessione è indipendente e non collegata all'account.
**Soluzione**: collection `users/{uid}/sessions` con riferimento alle sessioni create.

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
| `firebase-blueprint.json` | Da aggiornare con le nuove collection (roster, auctionHistory, passes) |
