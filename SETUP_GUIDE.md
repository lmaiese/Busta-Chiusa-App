# Guida di configurazione — Busta Chiusa

## Prerequisiti

| Tool | Versione minima | Comando verifica |
|------|----------------|-----------------|
| Node.js | 20+ | `node --version` |
| npm | 9+ | `npm --version` |
| Firebase CLI | 13+ | `firebase --version` |

Installa la CLI se non ce l'hai:
```bash
npm install -g firebase-tools
```

---

## 1. Progetto Firebase

### 1.1 Crea il progetto
1. Vai su [console.firebase.google.com](https://console.firebase.google.com)
2. Crea un nuovo progetto
3. Attiva **Google Analytics** (opzionale ma utile)

### 1.2 Attiva piano Blaze
Cloud Functions richiede il piano Blaze (pay-as-you-go).

1. Console → **Spark** (in basso a sinistra) → **Upgrade**
2. Inserisci metodo di pagamento
3. Subito dopo: **Console → Billing → Budget & Alerts**
4. Crea un alert a **$1** per sicurezza — per sessioni normali di fantacalcio il costo reale è $0

### 1.3 Abilita i servizi
Nella console Firebase, abilita nell'ordine:

- **Authentication** → Sign-in method → abilita `Google` e `Anonymous`
- **Firestore Database** → Crea database → scegli la regione (es. `eur3` per Europa)
- **Functions** → si attiva automaticamente con Blaze

---

## 2. Configurazione app

### 2.1 firebase-applet-config.json
Nella console Firebase: **Impostazioni progetto → Le tue app → Web app** (o creane una nuova).

Copia i valori e incollali in `firebase-applet-config.json`:

```json
{
  "projectId": "il-tuo-project-id",
  "appId": "1:xxxxx:web:xxxxx",
  "apiKey": "AIzaSy...",
  "authDomain": "il-tuo-project-id.firebaseapp.com",
  "firestoreDatabaseId": "(default)",
  "storageBucket": "il-tuo-project-id.appspot.com",
  "messagingSenderId": "123456789",
  "measurementId": "G-XXXXXXX"
}
```

> `firestoreDatabaseId` è `"(default)"` salvo che tu abbia creato un database con nome diverso.

### 2.2 .env.local
Crea il file `.env.local` nella root del progetto (non committare mai questo file):

```
GEMINI_API_KEY=non_necessario_per_ora
APP_URL=http://localhost:3000
```

---

## 3. Deploy Security Rules

```bash
firebase login
firebase use il-tuo-project-id
firebase deploy --only firestore:rules
```

Verifica nella console Firebase → Firestore → Rules che le regole siano aggiornate.

---

## 4. Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

Il build TypeScript viene eseguito automaticamente prima del deploy.

Al termine vedrai qualcosa come:
```
✔ functions[startAuction]: Successful create operation.
✔ functions[closeAuction]: Successful create operation.
✔ functions[cancelAuction]: Successful create operation.
✔ functions[manualAssign]: Successful create operation.
```

### Regione Functions
Le functions sono configurate per `us-central1` (default Firebase). Se vuoi usare una regione europea per minor latenza, modifica in due punti:

**`src/firebase.ts`:**
```ts
export const functions = getFunctions(app, "europe-west1");
```

**`functions/src/index.ts`** — aggiungi `region` a ogni `onCall`:
```ts
export const startAuction = onCall({ region: "europe-west1" }, async (request) => {
```

---

## 5. Avvio app in locale

```bash
# Dalla root del progetto
npm install
npm run dev
```

L'app sarà disponibile su `http://localhost:3000`.

---

## 6. Struttura file modificati (queste iterazioni)

```
busta-chiusa/
├── firebase.json                    ← configurazione CLI
├── firestore.rules                  ← security rules aggiornate
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts                 ← 4 Cloud Functions
└── src/
    ├── firebase.ts                  ← SDK + helpers Mantra
    ├── components/
    │   ├── ActiveAuction.tsx        ← usa Cloud Functions
    │   ├── AuctionHistory.tsx       ← espandibile per bid detail
    │   ├── PlayerList.tsx           ← chiama startAuction CF
    │   └── RosterList.tsx           ← supporto Mantra completo
    └── pages/
        ├── Auction.tsx              ← tab sempre visibili, header budget
        ├── CreateSession.tsx        ← config rosa Classic + Mantra
        ├── Lobby.tsx                ← fix auth import, UX partecipante
        └── SessionRouter.tsx        ← fix import auth, init Mantra roster
```

---

## 7. Verifica funzionamento

### Test flusso banditore
1. Apri l'app → Accedi come Banditore (Google)
2. Crea sessione → carica CSV listone LegheFantacalcio
3. Annota il codice sessione a 6 caratteri

### Test flusso partecipante
1. Apri l'app in un altro browser/tab in incognito
2. Inserisci codice + nickname → Entra
3. Torna sul banditore → Inizia asta

### Verifica Cloud Functions
Nella console Firebase → Functions → Logs puoi vedere ogni invocazione con il risultato.

---

## 8. Problemi comuni

| Problema | Causa | Soluzione |
|----------|-------|-----------|
| `Missing or insufficient permissions` al join | Token anonimo non ancora propagato | L'app riprova automaticamente; se persiste, ricarica |
| Functions non trovate | Deploy non completato | Esegui `firebase deploy --only functions` e attendi |
| `Player not found` alla chiusura | Race condition playerId | Assicurati che il CSV sia caricato correttamente |
| Bid count errato | Race condition client-side | Non critico, la logica d'asta è server-side |
| Timer non si ferma | timerEnd null su Firestore | Controlla i logs della Function `startAuction` |

---

## 9. Variabili d'ambiente Functions (opzionale)

Se in futuro vuoi aggiungere segreti alle Functions:

```bash
firebase functions:secrets:set MY_SECRET
```

E accedi con `process.env.MY_SECRET` nelle Functions.
