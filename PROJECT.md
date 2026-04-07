# Busta Chiusa — Documento Progettuale
### App per aste di fantacalcio a offerta silenziosa — v1.0 — Aprile 2026

---

## 1. Il problema e la soluzione

L'asta classica a rilancio premia la velocità di reazione e crea dinamiche di dominanza. **Busta Chiusa** sostituisce questa meccanica con un sistema di **offerta silenziosa**: tutti i partecipanti offrono simultaneamente senza conoscere le offerte altrui, rivelate solo alla chiusura della busta.

L'app è progettata per leghe che usano **LegheFantacalcio**: importa il listone ufficiale in CSV e produce un export rose compatibile con la piattaforma.

---

## 2. Ruoli

| Ruolo | Accesso | Responsabilità |
|-------|---------|----------------|
| **Banditore** | Firebase Auth (Google / Apple / Microsoft) | Crea sessione, carica CSV, avvia e chiude buste, gestisce la lista |
| **Partecipante** | Firebase Anonymous Auth + codice sessione | Entra con nickname, fa offerte |

Il banditore ha un account persistente. I partecipanti non si registrano: inseriscono il codice sessione a 6 caratteri e scelgono il nickname squadra.

---

## 3. Meccanica d'asta

### Flusso per ogni calciatore

1. Il banditore scorre il listone (filtri per ruolo, ricerca per nome, ordinamenti) e seleziona un calciatore — oppure usa la modalità **random** (coda casuale di tutti i calciatori o per ruolo).
2. Si apre la busta con un timer configurabile (default 30s), calcolato server-side.
3. Durante la busta: i partecipanti inseriscono l'offerta via tastiera numerica custom. L'offerta è modificabile fino alla chiusura. Il contatore delle offerte ricevute è visibile a tutti; gli importi sono segreti.
4. Alla chiusura (timer o azione manuale del banditore): rivelazione simultanea su tutti i dispositivi. Le offerte sono mostrate in ordine decrescente con nickname. Il ranking resta visibile fino alla prossima busta.
5. Il calciatore viene assegnato al vincitore e i crediti vengono sottratti.

I partecipanti possono anche **passare** (passo) invece di offrire: il pass conta come rinuncia esplicita ed è visibile nel contatore.

### Gestione parità

| Round | Risultato |
|-------|-----------|
| R1 (1° pareggio) | Nuova busta solo tra i pareggianti |
| R2 (2° pareggio) | Nuova busta solo tra i pareggianti |
| R3 (3° pareggio) | Sorteggio server-side, prezzo = offerta + 1 credito |

### Regole offerta

- Minimo: 1 credito
- Massimo: budget residuo del partecipante
- La system blocca l'offerta se la rosa è già piena per quel ruolo (validazione client + server)
- Il banditore può **assegnare manualmente** un calciatore a qualsiasi partecipante con prezzo libero
- Il banditore può **annullare** una busta aperta: il calciatore torna disponibile, nessun credito viene scalato

---

## 4. Formati supportati

### Classic
Ruoli: `P` `D` `C` `A`. Limiti rosa per-ruolo configurati dal banditore a inizio sessione.

### Mantra
12 ruoli: `Por` `Dc` `Dd` `Ds` `B` `E` `M` `C` `T` `W` `A` `Pc`.
Un calciatore può avere più ruoli separati da `/` nel CSV (es. `Dd/Ds/E`).
Validazione rosa: dimensione totale + slot Per dedicato. 11 moduli predefiniti.

---

## 5. Import / Export CSV

### Input — listone LegheFantacalcio
Formato CSV (`;`) o Excel. Colonne rilevanti:

| Campo | Tipo | Note |
|-------|------|------|
| `Id` | string | Chiave primaria — obbligatoria per l'export rose |
| `R` | string | Ruolo Classic |
| `RM` | string | Ruoli Mantra (separati da `/`) |
| `Nome` | string | Cognome / nome calciatore |
| `Squadra` | string | Squadra Serie A |
| `Qt` / `QM` | number | Quotazione Classic / Mantra (informativa) |
| `FVM` | number | Fanta Valore Mercato (usato per ordinamento) |

### Output — export rose
CSV compatibile con "Importa Rose" di LegheFantacalcio. Una sezione per squadra:

```
Id;Crediti
1234;45
5678;12
```

Prerequisito: il budget configurato in Busta Chiusa deve corrispondere a quello su LegheFantacalcio.

---

## 6. Stack tecnologico

| Layer | Tecnologia | Motivazione |
|-------|-----------|-------------|
| Frontend | React 19 + Vite + TypeScript | SPA veloce, ecosystem maturo |
| Styling | Tailwind CSS 4 + Lucide icons | Utility-first, dark mode nativa |
| Animazioni | Motion (Framer Motion) | Transizioni reveal offerte |
| Auth | Firebase Auth | Google / Apple / Microsoft + Anonymous |
| Database | Cloud Firestore | Real-time listener nativi, offline cache |
| Logica server | Cloud Functions (Node 20) | Validazione offerte, tiebreak, sorteggio — non manipolabile dal client |
| Parsing file | PapaParse (CSV) + XLSX | Import listone da entrambi i formati |
| Suoni | Web Audio API | Campanello sintetico in-app, nessuna dipendenza esterna |

### Deploy
Firebase Hosting (Vite build → `dist/`). Emulatori locali per sviluppo (Auth 9099, Functions 5001, Firestore 2727).

---

## 7. Schema Firestore

```
sessions/{sessionId}
  ├── sessionName, code (6-char), status, format, budget, timerDuration
  ├── banditorId, createdAt
  ├── rosterLimits: Record<role, {min, max}>
  ├── totalRosterSize (mantra), auctionMode, randomQueue, shuffleSeed
  │
  ├── players/{playerId}
  │     id, r, rm, nome, squadra, qt, qm, fvm
  │     status: "available" | "auctioning" | "sold"
  │     soldTo (uid), soldPrice
  │
  ├── participants/{uid}
  │     nickname, budgetResiduo, rosterCount, rosterLimits
  │     isConnected (presence)
  │     └── roster/{playerId}
  │           playerId, nome, squadra, role, roleRaw, price, assignedAt
  │
  ├── currentAuction/state
  │     status: "idle" | "open" | "closing" | "tiebreak" | "revealed" | "cancelled"
  │     playerId, timerEnd, bidCount, round
  │     tiebreakParticipants, allBids, winnerId, winnerNickname, price, wasRandom
  │     └── bids/{uid}       ← scrivibile solo dal proprietario, non leggibile dai client
  │           amount
  │     └── passes/{uid}     ← documento vuoto, conta come rinuncia esplicita
  │
  └── auctionHistory/{autoId}
        playerId, playerNome, winnerUid, winnerNickname, price
        allBids [{uid, nickname, amount}], rounds, wasRandom, wasCancelled, completedAt
```

---

## 8. Cloud Functions

### `startAuction(sessionId, playerId, round?, tiebreakParticipants?)`
Verifica che il chiamante sia il banditore. Pulisce bid/pass precedenti. Imposta `players/{id}.status = "auctioning"`. Calcola `timerEnd` server-side. Scrive `currentAuction/state` con `status="open"`.

### `closeAuction(sessionId)`
Eseguita dal banditore (o automaticamente a scadenza timer). Legge tutte le bid via Admin SDK (bypass security rules). Filtra le bid non valide (budget insufficiente, rosa piena). Determina il vincitore:
- Vincitore unico → aggiorna budget, rosa, storico; `status="revealed"`
- Parità R1/R2 → `status="tiebreak"`, salva `tiebreakParticipants`
- Parità R3 → sorteggio casuale server-side, `wasRandom=true`, `status="revealed"`

### `cancelAuction(sessionId)`
Ripristina `players/{id}.status = "available"`. Appende a `auctionHistory` con `wasCancelled=true`. Pulisce `currentAuction/state`. Nessuna modifica a budget o roster.

### `manualAssign(sessionId, playerId, winnerId, price)`
Assegnazione diretta banditore → partecipante con prezzo libero. Stessa logica di aggiornamento di `closeAuction` (budget, rosa, storico).

### `onBidWritten` (Firestore trigger)
Incrementa `bidCount` su `currentAuction/state` quando viene creata una nuova bid (non su update). Evita race condition con lo stato React locale.

### Security rules (schema)
```js
// Bid: scrivibile solo dal proprietario, mai leggibile dai client
match /sessions/{sid}/currentAuction/state/bids/{uid} {
  allow write: if request.auth.uid == uid;
  allow read:  if false; // solo Admin SDK
}
// Participants: lettura pubblica nella sessione, scrittura solo propria
match /sessions/{sid}/participants/{uid} {
  allow read:  if isParticipant(sid);
  allow write: if request.auth.uid == uid;
}
```

---

## 9. Macchina a stati — `currentAuction/state.status`

```
idle ──(avvia)──► open ──(timer/chiudi)──► closing ──(vincitore)──► revealed ──► sold
                   │                           │                         ▲
                   │                           └──(parità R1/R2)──► tiebreak ──(riavvia)──┘
                   │                           └──(parità R3)──────────────────────► sold
                   └──(annulla)──► cancelled ──► idle
```

---

## 10. UX e navigazione

### Flusso banditore

| # | Schermata | Contenuto chiave |
|---|-----------|-----------------|
| 1 | Home / Login | Login provider multipli. Recupero sessione attiva da localStorage. |
| 2 | Crea sessione | Formato, budget, timer, modalità asta (manual / random-all / random-role), limiti rosa. Upload CSV/Excel. |
| 3 | Lobby | Codice sessione in grande. Lista partecipanti online. Pulsante "Inizia asta". Link TV mode. |
| 4 | Lista calciatori | Lista scrollabile, filtri ruolo, ricerca nome, ordinamento (random / ruolo / quotazione). Tap → apre busta. |
| 5 | Busta aperta | Countdown, contatore bid/pass live, pulsanti: Chiudi / Annulla / Assegna manuale. |
| 6 | Reveal | Ranking offerte decrescente con nickname. Badge vincitore. Info tiebreak se parità. |
| 7 | Riepilogo finale | Rose complete, budget residuo. Export CSV compatibile LegheFantacalcio. |

### Flusso partecipante

| # | Schermata | Contenuto chiave |
|---|-----------|-----------------|
| 1 | Home | Codice sessione (6 char) + nickname squadra. |
| 2 | Lobby | Attesa avvio. Lista partecipanti e budget. |
| 3 | Asta — tab Busta | Calciatore in asta, countdown, tastiera numerica custom, display offerta, contatore bid/pass. |
| 3 | Asta — tab Listone | Lista completa read-only con filtri. Calciatori assegnati marcati. |
| 3 | Asta — tab Rose | Rose di tutti i partecipanti in tempo reale con budget residuo. |
| 3 | Asta — tab Storico | Cronologia: calciatore → squadra → prezzo. |
| 4 | Reveal | Identico al banditore. Segnale sonoro + vibrazione all'apertura busta. |
| 5 | Riepilogo finale | Rose e storico completo. |

### TV Mode
Schermata ottimizzata per monitor esterno: calciatore, bid count, pass count, timer grande. Aggiornamento real-time via Firestore.

---

## 11. Design system — "Electric Noir"

Dark mode di default.

| Token | Valore | Uso |
|-------|--------|-----|
| Sfondo | `#05050f` | Background principale |
| Superficie | `#0b0b1c` / `#111128` | Card, elevazione |
| Accento cyan | `#00e5ff` | Interattivi, glow, timer |
| Accento amber | `#ffaa00` | Badge ruoli |
| Rosso critico | `#ff3d71` | Timer <5s, errori, offerta non valida |
| Testo primario | `#e8e8ff` | |
| Testo secondario | `#5a5a90` | |

**Colori ruoli**: giallo (P/Por), verde (D), blu (E/M/C), viola (T/W), rosso (A/Pc).

**Input offerta**: tastiera numerica custom 3×4. Max 4 cifre. Display rosso se amount > budget. Pulsante "Invia" cyan+glow se valido, grigio se non valido, disabilitato a busta chiusa.

**Timer**: monospace, cyan → rosso con pulse negli ultimi 5s. Fonte di verità: `timerEnd` server timestamp (il client calcola il delta per evitare deriva di orologio).

---

## 12. Feature implementate vs roadmap

### MVP — implementato

- [x] Auth multi-provider (Google, Apple, Microsoft) + Anonymous
- [x] Crea sessione con configurazione completa (formato, budget, timer, rosa)
- [x] Import listone CSV/Excel da LegheFantacalcio
- [x] Modalità asta: manuale / random-all / random-role
- [x] Busta chiusa con timer server-side e reveal simultaneo
- [x] Tastiera numerica custom con validazione inline
- [x] Tiebreak automatico R1/R2/R3 (sorteggio server)
- [x] Assegnazione manuale banditore
- [x] Annullamento busta con ripristino calciatore
- [x] Validazione rosa per ruolo (client + server)
- [x] Budget residuo e rose visibili in tempo reale
- [x] Storico aste espandibile con dettaglio bid
- [x] Riepilogo finale con export CSV compatibile LegheFantacalcio
- [x] Session recovery da localStorage
- [x] Presenza online/offline partecipanti
- [x] Suoni in-app (Web Audio API)
- [x] TV Mode per monitor esterno
- [x] Tema dark "Electric Noir"
- [x] Export PNG della propria rosa (canvas-based, scaricabile da ogni partecipante)
- [x] Undo ultima assegnazione (disponibile subito dopo il reveal, banditore only)

### V1.1 — nice to have

- [ ] Storico sessioni precedenti per il banditore

### V2.0 — futuro

- [ ] Freemium: limite 8 partecipanti free, premium senza limiti
- [ ] Statistiche asta (analytics per lega)
- [ ] Internazionalizzazione (struttura Flutter i18n già predisposta per flutter, ma qui React i18n)

---

## 13. Note aperte

**Nome app**: non ancora definito. Orientarsi su concetti legati alla meccanica (busta, blind, reveal, asta cieca). Verificare disponibilità su App Store e Play Store prima di scegliere.

**Monetizzazione**: da definire. La struttura Firebase è compatibile con un modello freemium (limite partecipanti per tier).

**Notifiche push**: non implementate. L'apertura della busta è segnalata con suono + vibrazione in-app. I partecipanti devono tenere l'app aperta.

**Pausa timer**: non implementata. Una volta aperta, la busta scorre sempre. Il banditore può chiuderla anticipatamente o annullarla.
