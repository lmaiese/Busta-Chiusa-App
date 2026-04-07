# Prossime evoluzioni — Busta Chiusa

Funzionalità pianificate per versioni future. Ogni voce richiede una spec dettagliata prima dell'implementazione.

---

## Asta di riparazione

**Obiettivo**: permettere al banditore di avviare una sessione partendo da rose parziali già esistenti, per completare aste interrotte o gestire tornei di riparazione.

**Contesto**: alcune leghe fantacalcistiche prevedono una sessione di "riparazione" successiva all'asta principale, in cui i partecipanti possono acquistare i calciatori rimasti per completare le rose. La struttura dati Firestore è già predisposta (ogni partecipante ha già `rosterCount` e `rosterLimits`), ma manca l'UI per pre-popolare le rose.

**Flusso ipotizzato**:
1. Il banditore crea una nuova sessione con tipo `repair` (nuovo campo in `CreateSession.tsx`)
2. In lobby, prima di avviare l'asta, il banditore può inserire manualmente le rose preesistenti per ogni partecipante (o importarle da CSV)
3. Il sistema calcola i budget residui e gli slot liberi per ogni ruolo
4. L'asta procede normalmente con i calciatori rimanenti

**Impatto tecnico**:
- Nuovo tipo di sessione (`format`: `"repair"`)
- UI di pre-popolamento rose in Lobby (solo banditore)
- Import CSV rose iniziali
- Calcolo automatico `budgetResiduo` e `rosterCount` in base alle rose importate
- Validazione slot ruolo al momento dell'assegnazione (già presente parzialmente in `closeAuction`)

**Priorità**: media — richiede specifica dettagliata del formato import e del flusso UX.

---

## Storico sessioni banditore

**Obiettivo**: il banditore può vedere le sessioni passate dalla home, con possibilità di riaprirle in sola lettura.

**Impatto tecnico**:
- Collection `users/{uid}/sessions` (riferimenti alle sessioni create)
- Scrittura al momento della creazione sessione
- Pagina "Le mie sessioni" accessibile dalla home

---

## Override gestione parità

**Obiettivo**: opzione di sessione per gestire il terzo pareggio manualmente invece che con sorteggio automatico.

**Impatto tecnico**:
- Campo `tiebreakMode: "auto" | "manual"` nella sessione
- In modalità `manual`: il banditore può scegliere il vincitore dal pannello
