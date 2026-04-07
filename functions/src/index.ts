import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

initializeApp();
const db = getFirestore();

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════

const MANTRA_ROLES = ["Por","Dc","Dd","Ds","B","E","M","C","T","W","A","Pc"] as const;
const CLASSIC_ROLES = ["P","D","C","A"] as const;

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function parseMantraRoles(rm: string): string[] {
  if (!rm) return [];
  return rm.split("/").map((r) => r.trim()).filter((r) => r.length > 0);
}

function getPrimaryRole(player: FirebaseFirestore.DocumentData, format: string): string {
  if (format === "classic") return player.r || "D";
  const roles = parseMantraRoles(player.rm);
  return roles[0] || player.r || "Por";
}

function getInitialRosterCount(format: string): Record<string, number> {
  if (format === "classic") {
    return { P: 0, D: 0, C: 0, A: 0 };
  }
  const count: Record<string, number> = {};
  for (const r of MANTRA_ROLES) count[r] = 0;
  return count;
}

function validateAuth(request: { auth?: { uid: string } }): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required");
  return request.auth.uid;
}

async function verifyBanditore(
  sessionId: string,
  uid: string
): Promise<FirebaseFirestore.DocumentData> {
  const snap = await db.doc(`sessions/${sessionId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Session not found");
  const data = snap.data()!;
  if (data.banditorId !== uid) {
    throw new HttpsError("permission-denied", "Only the banditore can perform this action");
  }
  return data;
}

async function cancelCurrentAuction(
  sessionId: string,
  playerId: string,
  playerNome: string,
  stateRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const batch = db.batch();

  if (playerId) {
    batch.update(db.doc(`sessions/${sessionId}/players/${playerId}`), {
      status: "available",
      soldTo: null,
      soldPrice: null,
    });
  }

  const histRef = db.collection(`sessions/${sessionId}/auctionHistory`).doc();
  batch.set(histRef, {
    playerId: playerId || "",
    playerNome: playerNome || "",
    winnerUid: null,
    winnerNickname: null,
    price: null,
    allBids: [],
    rounds: 1,
    wasRandom: false,
    wasCancelled: true,
    completedAt: FieldValue.serverTimestamp(),
  });

  batch.update(stateRef, {
    status: "idle",
    playerId: "",
    bidCount: 0,
    round: 1,
    tiebreakParticipants: null,
    allBids: [],
    winnerId: null,
    winnerNickname: null,
    price: null,
    wasRandom: false,
  });

  await batch.commit();
}

async function processAssignment(params: {
  sessionId: string;
  playerId: string;
  player: FirebaseFirestore.DocumentData;
  winnerId: string;
  winnerNickname: string;
  price: number;
  wasRandom: boolean;
  allBids: { uid: string; nickname: string; amount: number }[];
  rounds: number;
  stateRef: FirebaseFirestore.DocumentReference;
  format: string;
}): Promise<void> {
  const {
    sessionId, playerId, player, winnerId, winnerNickname,
    price, wasRandom, allBids, rounds, stateRef, format,
  } = params;

  const primaryRole = getPrimaryRole(player, format);

  const winnerRef = db.doc(`sessions/${sessionId}/participants/${winnerId}`);
  const winnerSnap = await winnerRef.get();
  if (!winnerSnap.exists) throw new HttpsError("not-found", "Winner participant not found");
  const winnerData = winnerSnap.data()!;

  const newBudget = winnerData.budgetResiduo - price;
  const updatedRosterCount = { ...(winnerData.rosterCount || {}) };
  updatedRosterCount[primaryRole] = (updatedRosterCount[primaryRole] || 0) + 1;

  const batch = db.batch();

  batch.update(db.doc(`sessions/${sessionId}/players/${playerId}`), {
    status: "sold",
    soldTo: winnerId,
    soldPrice: price,
  });

  batch.update(winnerRef, {
    budgetResiduo: newBudget,
    rosterCount: updatedRosterCount,
  });

  batch.set(db.doc(`sessions/${sessionId}/participants/${winnerId}/roster/${playerId}`), {
    playerId,
    nome: player.nome || "",
    squadra: player.squadra || "",
    role: primaryRole,
    roleRaw: format === "classic" ? player.r : player.rm,
    price,
    assignedAt: FieldValue.serverTimestamp(),
  });

  const histRef = db.collection(`sessions/${sessionId}/auctionHistory`).doc();
  batch.set(histRef, {
    playerId,
    playerNome: player.nome || "",
    winnerUid: winnerId,
    winnerNickname,
    price,
    allBids,
    rounds,
    wasRandom,
    wasCancelled: false,
    completedAt: FieldValue.serverTimestamp(),
  });

  batch.update(stateRef, {
    status: "revealed",
    winnerId,
    winnerNickname,
    price,
    wasRandom,
    allBids,
  });

  await batch.commit();
}

// ═══════════════════════════════════════════════
// FIRESTORE TRIGGER — bidCount server-side
// ═══════════════════════════════════════════════

/**
 * Incrementa bidCount solo quando viene CREATA una nuova bid
 * (non quando viene aggiornata da un partecipante che modifica l'offerta).
 *
 * Il client scrive direttamente su bids/{uid} ma NON tocca più bidCount.
 * Questo elimina la race condition causata dallo stato React locale myBidSent.
 */
export const onBidWritten = onDocumentWritten(
  "sessions/{sessionId}/currentAuction/state/bids/{uid}",
  async (event) => {
    const wasCreated = !event.data?.before.exists && event.data?.after.exists;
    const wasDeleted = event.data?.before.exists && !event.data?.after.exists;

    if (!wasCreated && !wasDeleted) return;

    const { sessionId } = event.params;
    const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);

    try {
      await stateRef.update({
        bidCount: FieldValue.increment(wasCreated ? 1 : -1),
      });
      logger.info(
        `bidCount ${wasCreated ? "incremented" : "decremented"} for session=${sessionId} uid=${event.params.uid}`
      );
    } catch (err) {
      logger.warn(`onBidWritten: could not update bidCount`, err);
    }
  }
);

// ═══════════════════════════════════════════════
// CALLABLE FUNCTIONS
// ═══════════════════════════════════════════════

/**
 * Avvia (o riavvia per tiebreak) una busta.
 * Scrive timerEnd server-side per accuratezza cross-device.
 */
export const startAuction = onCall({ invoker: "public" }, async (request) => {
  const uid = validateAuth(request);
  const {
    sessionId,
    playerId,
    round = 1,
    tiebreakParticipants = null,
  } = request.data as {
    sessionId: string;
    playerId: string;
    round?: number;
    tiebreakParticipants?: string[] | null;
  };

  const sessionData = await verifyBanditore(sessionId, uid);

  const playerRef = db.doc(`sessions/${sessionId}/players/${playerId}`);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) throw new HttpsError("not-found", "Player not found");

  const playerData = playerSnap.data()!;
  if (playerData.status === "sold") {
    throw new HttpsError("failed-precondition", "Player is already sold");
  }

  // Elimina tutte le bid e i pass del round precedente
  const [bidsSnap, passesSnap] = await Promise.all([
    db.collection(`sessions/${sessionId}/currentAuction/state/bids`).get(),
    db.collection(`sessions/${sessionId}/currentAuction/state/passes`).get(),
  ]);
  if (!bidsSnap.empty || !passesSnap.empty) {
    const delBatch = db.batch();
    bidsSnap.docs.forEach((d) => delBatch.delete(d.ref));
    passesSnap.docs.forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();
  }

  await playerRef.update({ status: "auctioning" });

  const timerDuration = sessionData.timerDuration || 30;
  const timerEndMs = Date.now() + timerDuration * 1000;
  const timerEnd = Timestamp.fromMillis(timerEndMs);

  const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);
  await stateRef.set(
    {
      status: "open",
      playerId,
      bidCount: 0,
      round,
      timerEnd,
      tiebreakParticipants: tiebreakParticipants || null,
      allBids: [],
      winnerId: null,
      winnerNickname: null,
      price: null,
      wasRandom: false,
    },
    { merge: false }
  );

  logger.info(`Auction started: session=${sessionId} player=${playerId} round=${round}`);
  return { timerEnd: timerEndMs, round };
});

/**
 * Chiude la busta corrente e processa le offerte.
 * Legge le bid via Admin SDK (invisibili ai client).
 * Gestisce tiebreak e sorteggio R3.
 */
export const closeAuction = onCall({ invoker: "public" }, async (request) => {
  const uid = validateAuth(request);
  const { sessionId } = request.data as { sessionId: string };

  const sessionData = await verifyBanditore(sessionId, uid);
  const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);

  // Transazione atomica: impedisce doppia chiusura concorrente
  let auctionState: FirebaseFirestore.DocumentData;
  try {
    auctionState = await db.runTransaction(async (t) => {
      const snap = await t.get(stateRef);
      if (!snap.exists) throw new HttpsError("not-found", "No active auction state");
      const state = snap.data()!;
      if (state.status !== "open") {
        throw new HttpsError(
          "failed-precondition",
          `Cannot close auction with status: ${state.status}`
        );
      }
      t.update(stateRef, { status: "closing" });
      return state;
    });
  } catch (e: unknown) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError("internal", String(e));
  }

  const { playerId, round = 1, tiebreakParticipants } = auctionState as {
    playerId: string;
    round: number;
    tiebreakParticipants: string[] | null;
  };

  try {
    const playerSnap = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
    if (!playerSnap.exists) {
      await cancelCurrentAuction(sessionId, playerId, "Sconosciuto", stateRef);
      return { result: "cancelled", reason: "player_not_found" };
    }
    const player = playerSnap.data()!;
    const format = sessionData.format as string;
    const primaryRole = getPrimaryRole(player, format);

    // Legge tutte le bid via Admin SDK (bypassa le security rules)
    const bidsSnap = await db
      .collection(`sessions/${sessionId}/currentAuction/state/bids`)
      .get();
    let bids = bidsSnap.docs.map((d) => ({ uid: d.id, ...(d.data() as { amount: number }) }));

    // Filtra per partecipanti al tiebreak se applicabile
    if (round > 1 && tiebreakParticipants && tiebreakParticipants.length > 0) {
      bids = bids.filter((b) => tiebreakParticipants.includes(b.uid));
    }

    if (bids.length === 0) {
      await cancelCurrentAuction(sessionId, playerId, player.nome, stateRef);
      return { result: "cancelled", reason: "no_bids" };
    }

    // Valida ogni bid: budget e slot rosa
    const totalRosterSize: number = (sessionData.totalRosterSize as number) || 25;
    const validatedBids: { uid: string; nickname: string; amount: number }[] = [];
    for (const bid of bids) {
      const partSnap = await db
        .doc(`sessions/${sessionId}/participants/${bid.uid}`)
        .get();
      if (!partSnap.exists) continue;
      const part = partSnap.data()!;

      if (bid.amount < 1 || bid.amount > part.budgetResiduo) continue;

      const rosterCount: Record<string, number> = part.rosterCount || {};
      const rosterLimits: Record<string, { max: number }> = part.rosterLimits || {};

      // Check rosa completa
      const currentTotal = Object.values(rosterCount).reduce((a, b) => a + b, 0);
      if (currentTotal >= totalRosterSize) continue;

      if (format === "classic") {
        const current = rosterCount[primaryRole] || 0;
        const max = rosterLimits[primaryRole]?.max ?? 99;
        if (current >= max) continue;
      } else {
        // Mantra: solo Por ha un vincolo di ruolo
        if (primaryRole === "Por") {
          const current = rosterCount["Por"] || 0;
          const max = rosterLimits["Por"]?.max ?? 3;
          if (current >= max) continue;
        }
      }

      validatedBids.push({ uid: bid.uid, nickname: part.nickname, amount: bid.amount });
    }

    if (validatedBids.length === 0) {
      await cancelCurrentAuction(sessionId, playerId, player.nome, stateRef);
      return { result: "cancelled", reason: "no_valid_bids" };
    }

    validatedBids.sort((a, b) => b.amount - a.amount);
    const maxAmount = validatedBids[0].amount;
    const winners = validatedBids.filter((b) => b.amount === maxAmount);

    const allBidsForHistory = validatedBids.map((b) => ({
      uid: b.uid,
      nickname: b.nickname,
      amount: b.amount,
    }));

    if (winners.length > 1) {
      if (round < 3) {
        // Tiebreak: nuova busta solo per i pareggianti
        await stateRef.update({
          status: "tiebreak",
          tiebreakParticipants: winners.map((w) => w.uid),
          allBids: allBidsForHistory,
        });
        logger.info(`Tiebreak round ${round}: session=${sessionId}`);
        return {
          result: "tiebreak",
          round,
          tiebreakNicknames: winners.map((w) => w.nickname),
        };
      } else {
        // R3: sorteggio casuale server-side, prezzo = maxAmount + 1
        const winner = winners[Math.floor(Math.random() * winners.length)];
        const finalPrice = maxAmount + 1;
        await processAssignment({
          sessionId, playerId, player,
          winnerId: winner.uid, winnerNickname: winner.nickname,
          price: finalPrice, wasRandom: true,
          allBids: allBidsForHistory, rounds: round,
          stateRef, format,
        });
        logger.info(`R3 random: ${winner.nickname} gets ${player.nome} for ${finalPrice}`);
        return { result: "sold_random", winner: winner.nickname, price: finalPrice };
      }
    }

    const winner = winners[0];
    await processAssignment({
      sessionId, playerId, player,
      winnerId: winner.uid, winnerNickname: winner.nickname,
      price: winner.amount, wasRandom: false,
      allBids: allBidsForHistory, rounds: round,
      stateRef, format,
    });
    logger.info(`Sold: ${winner.nickname} gets ${player.nome} for ${winner.amount}`);
    return { result: "sold", winner: winner.nickname, price: winner.amount };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`closeAuction post-transaction error: session=${sessionId} playerId=${playerId}`, e);
    throw new HttpsError("internal", `Errore elaborazione: ${msg}`);
  }
});

/**
 * Annulla la busta corrente. Il calciatore torna disponibile.
 */
export const cancelAuction = onCall({ invoker: "public" }, async (request) => {
  const uid = validateAuth(request);
  const { sessionId } = request.data as { sessionId: string };

  await verifyBanditore(sessionId, uid);

  const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) throw new HttpsError("not-found", "No auction state");

  const state = stateSnap.data()!;
  const playerId: string = state.playerId || "";

  let playerNome = "Sconosciuto";
  if (playerId) {
    const playerSnap = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
    if (playerSnap.exists) playerNome = playerSnap.data()!.nome || playerNome;
  }

  await cancelCurrentAuction(sessionId, playerId, playerNome, stateRef);
  logger.info(`Auction cancelled: session=${sessionId} player=${playerId}`);
  return { result: "cancelled" };
});

/**
 * Assegnazione manuale da parte del banditore.
 * Bypassa il flusso d'asta — prezzo libero.
 */
export const manualAssign = onCall({ invoker: "public" }, async (request) => {
  const uid = validateAuth(request);
  const { sessionId, playerId, participantId, price } = request.data as {
    sessionId: string;
    playerId: string;
    participantId: string;
    price: number;
  };

  const sessionData = await verifyBanditore(sessionId, uid);

  if (typeof price !== "number" || price < 0) {
    throw new HttpsError("invalid-argument", "Price must be a non-negative number");
  }

  const [playerSnap, partSnap] = await Promise.all([
    db.doc(`sessions/${sessionId}/players/${playerId}`).get(),
    db.doc(`sessions/${sessionId}/participants/${participantId}`).get(),
  ]);

  if (!playerSnap.exists) throw new HttpsError("not-found", "Player not found");
  if (!partSnap.exists) throw new HttpsError("not-found", "Participant not found");

  const player = playerSnap.data()!;
  const participant = partSnap.data()!;

  if (price > participant.budgetResiduo) {
    throw new HttpsError(
      "invalid-argument",
      `Price (${price}) exceeds participant budget (${participant.budgetResiduo})`
    );
  }

  const fmt = sessionData.format as string;
  const primaryRole = getPrimaryRole(player, fmt);
  const rosterCount: Record<string, number> = participant.rosterCount || {};
  const rosterLimits: Record<string, { max: number }> = participant.rosterLimits || {};

  // Check rosa completa
  const totalRosterSize: number = (sessionData.totalRosterSize as number) || 25;
  const currentTotal = Object.values(rosterCount).reduce((a, b) => a + b, 0);
  if (currentTotal >= totalRosterSize) {
    throw new HttpsError(
      "failed-precondition",
      `Rosa completa per ${participant.nickname} (${currentTotal}/${totalRosterSize})`
    );
  }

  if (fmt === "classic") {
    const currentCount = rosterCount[primaryRole] || 0;
    const maxCount = rosterLimits[primaryRole]?.max ?? 99;
    if (currentCount >= maxCount) {
      throw new HttpsError(
        "failed-precondition",
        `Slot ${primaryRole} pieno per ${participant.nickname} (${currentCount}/${maxCount})`
      );
    }
  } else if (primaryRole === "Por") {
    const currentCount = rosterCount["Por"] || 0;
    const maxCount = rosterLimits["Por"]?.max ?? 3;
    if (currentCount >= maxCount) {
      throw new HttpsError(
        "failed-precondition",
        `Slot Por pieno per ${participant.nickname} (${currentCount}/${maxCount})`
      );
    }
  }

  const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);

  await processAssignment({
    sessionId, playerId, player,
    winnerId: participantId, winnerNickname: participant.nickname,
    price, wasRandom: false,
    allBids: [{ uid: participantId, nickname: participant.nickname, amount: price }],
    rounds: 1, stateRef,
    format: sessionData.format,
  });

  logger.info(`Manual assign: ${participant.nickname} gets ${player.nome} for ${price}`);
  return { result: "assigned", winner: participant.nickname, price };
});

export { getInitialRosterCount, CLASSIC_ROLES, MANTRA_ROLES };
