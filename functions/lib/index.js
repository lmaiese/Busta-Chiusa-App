"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANTRA_ROLES = exports.CLASSIC_ROLES = exports.manualAssign = exports.cancelAuction = exports.closeAuction = exports.startAuction = exports.onBidWritten = void 0;
exports.getInitialRosterCount = getInitialRosterCount;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const MANTRA_ROLES = ["Por", "Dc", "Dd", "Ds", "B", "E", "M", "C", "T", "W", "A", "Pc"];
exports.MANTRA_ROLES = MANTRA_ROLES;
const CLASSIC_ROLES = ["P", "D", "C", "A"];
exports.CLASSIC_ROLES = CLASSIC_ROLES;
// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function parseMantraRoles(rm) {
    if (!rm)
        return [];
    return rm.split("/").map((r) => r.trim()).filter((r) => r.length > 0);
}
function getPrimaryRole(player, format) {
    if (format === "classic")
        return player.r || "D";
    const roles = parseMantraRoles(player.rm);
    return roles[0] || player.r || "Por";
}
function getInitialRosterCount(format) {
    if (format === "classic") {
        return { P: 0, D: 0, C: 0, A: 0 };
    }
    const count = {};
    for (const r of MANTRA_ROLES)
        count[r] = 0;
    return count;
}
function validateAuth(request) {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Authentication required");
    return request.auth.uid;
}
async function verifyBanditore(sessionId, uid) {
    const snap = await db.doc(`sessions/${sessionId}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Session not found");
    const data = snap.data();
    if (data.banditorId !== uid) {
        throw new https_1.HttpsError("permission-denied", "Only the banditore can perform this action");
    }
    return data;
}
async function cancelCurrentAuction(sessionId, playerId, playerNome, stateRef) {
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
        completedAt: firestore_1.FieldValue.serverTimestamp(),
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
async function processAssignment(params) {
    const { sessionId, playerId, player, winnerId, winnerNickname, price, wasRandom, allBids, rounds, stateRef, format, } = params;
    const primaryRole = getPrimaryRole(player, format);
    const winnerRef = db.doc(`sessions/${sessionId}/participants/${winnerId}`);
    const winnerSnap = await winnerRef.get();
    if (!winnerSnap.exists)
        throw new https_1.HttpsError("not-found", "Winner participant not found");
    const winnerData = winnerSnap.data();
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
        assignedAt: firestore_1.FieldValue.serverTimestamp(),
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
        completedAt: firestore_1.FieldValue.serverTimestamp(),
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
exports.onBidWritten = (0, firestore_2.onDocumentWritten)("sessions/{sessionId}/currentAuction/state/bids/{uid}", async (event) => {
    // Interessa solo il CREATE: before non esiste, after esiste
    const wasCreated = !event.data?.before.exists && event.data?.after.exists;
    if (!wasCreated)
        return;
    const { sessionId } = event.params;
    const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);
    try {
        await stateRef.update({
            bidCount: firestore_1.FieldValue.increment(1),
        });
        v2_1.logger.info(`bidCount incremented for session=${sessionId} uid=${event.params.uid}`);
    }
    catch (err) {
        // Non fatale: lo stato potrebbe essere già 'closing' o 'revealed'
        v2_1.logger.warn(`onBidWritten: could not increment bidCount`, err);
    }
});
// ═══════════════════════════════════════════════
// CALLABLE FUNCTIONS
// ═══════════════════════════════════════════════
/**
 * Avvia (o riavvia per tiebreak) una busta.
 * Scrive timerEnd server-side per accuratezza cross-device.
 */
exports.startAuction = (0, https_1.onCall)(async (request) => {
    const uid = validateAuth(request);
    const { sessionId, playerId, round = 1, tiebreakParticipants = null, } = request.data;
    const sessionData = await verifyBanditore(sessionId, uid);
    const playerRef = db.doc(`sessions/${sessionId}/players/${playerId}`);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists)
        throw new https_1.HttpsError("not-found", "Player not found");
    const playerData = playerSnap.data();
    if (playerData.status === "sold") {
        throw new https_1.HttpsError("failed-precondition", "Player is already sold");
    }
    // Elimina tutte le bid del round precedente
    const bidsSnap = await db
        .collection(`sessions/${sessionId}/currentAuction/state/bids`)
        .get();
    if (!bidsSnap.empty) {
        const delBatch = db.batch();
        bidsSnap.docs.forEach((d) => delBatch.delete(d.ref));
        await delBatch.commit();
    }
    await playerRef.update({ status: "auctioning" });
    const timerDuration = sessionData.timerDuration || 30;
    const timerEndMs = Date.now() + timerDuration * 1000;
    const timerEnd = firestore_1.Timestamp.fromMillis(timerEndMs);
    const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);
    await stateRef.set({
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
    }, { merge: false });
    v2_1.logger.info(`Auction started: session=${sessionId} player=${playerId} round=${round}`);
    return { timerEnd: timerEndMs, round };
});
/**
 * Chiude la busta corrente e processa le offerte.
 * Legge le bid via Admin SDK (invisibili ai client).
 * Gestisce tiebreak e sorteggio R3.
 */
exports.closeAuction = (0, https_1.onCall)(async (request) => {
    const uid = validateAuth(request);
    const { sessionId } = request.data;
    const sessionData = await verifyBanditore(sessionId, uid);
    const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);
    // Transazione atomica: impedisce doppia chiusura concorrente
    let auctionState;
    try {
        auctionState = await db.runTransaction(async (t) => {
            const snap = await t.get(stateRef);
            if (!snap.exists)
                throw new https_1.HttpsError("not-found", "No active auction state");
            const state = snap.data();
            if (state.status !== "open") {
                throw new https_1.HttpsError("failed-precondition", `Cannot close auction with status: ${state.status}`);
            }
            t.update(stateRef, { status: "closing" });
            return state;
        });
    }
    catch (e) {
        if (e instanceof https_1.HttpsError)
            throw e;
        throw new https_1.HttpsError("internal", String(e));
    }
    const { playerId, round = 1, tiebreakParticipants } = auctionState;
    const playerSnap = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
    if (!playerSnap.exists) {
        await cancelCurrentAuction(sessionId, playerId, "Sconosciuto", stateRef);
        return { result: "cancelled", reason: "player_not_found" };
    }
    const player = playerSnap.data();
    const format = sessionData.format;
    const primaryRole = getPrimaryRole(player, format);
    // Legge tutte le bid via Admin SDK (bypassa le security rules)
    const bidsSnap = await db
        .collection(`sessions/${sessionId}/currentAuction/state/bids`)
        .get();
    let bids = bidsSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    // Filtra per partecipanti al tiebreak se applicabile
    if (round > 1 && tiebreakParticipants && tiebreakParticipants.length > 0) {
        bids = bids.filter((b) => tiebreakParticipants.includes(b.uid));
    }
    if (bids.length === 0) {
        await cancelCurrentAuction(sessionId, playerId, player.nome, stateRef);
        return { result: "cancelled", reason: "no_bids" };
    }
    // Valida ogni bid: budget e slot rosa
    const totalRosterSize = sessionData.totalRosterSize || 25;
    const validatedBids = [];
    for (const bid of bids) {
        const partSnap = await db
            .doc(`sessions/${sessionId}/participants/${bid.uid}`)
            .get();
        if (!partSnap.exists)
            continue;
        const part = partSnap.data();
        if (bid.amount < 1 || bid.amount > part.budgetResiduo)
            continue;
        const rosterCount = part.rosterCount || {};
        const rosterLimits = part.rosterLimits || {};
        // Check rosa completa
        const currentTotal = Object.values(rosterCount).reduce((a, b) => a + b, 0);
        if (currentTotal >= totalRosterSize)
            continue;
        if (format === "classic") {
            const current = rosterCount[primaryRole] || 0;
            const max = rosterLimits[primaryRole]?.max ?? 99;
            if (current >= max)
                continue;
        }
        else {
            // Mantra: solo Por ha un vincolo di ruolo
            if (primaryRole === "Por") {
                const current = rosterCount["Por"] || 0;
                const max = rosterLimits["Por"]?.max ?? 3;
                if (current >= max)
                    continue;
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
            v2_1.logger.info(`Tiebreak round ${round}: session=${sessionId}`);
            return {
                result: "tiebreak",
                round,
                tiebreakNicknames: winners.map((w) => w.nickname),
            };
        }
        else {
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
            v2_1.logger.info(`R3 random: ${winner.nickname} gets ${player.nome} for ${finalPrice}`);
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
    v2_1.logger.info(`Sold: ${winner.nickname} gets ${player.nome} for ${winner.amount}`);
    return { result: "sold", winner: winner.nickname, price: winner.amount };
});
/**
 * Annulla la busta corrente. Il calciatore torna disponibile.
 */
exports.cancelAuction = (0, https_1.onCall)(async (request) => {
    const uid = validateAuth(request);
    const { sessionId } = request.data;
    await verifyBanditore(sessionId, uid);
    const stateRef = db.doc(`sessions/${sessionId}/currentAuction/state`);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists)
        throw new https_1.HttpsError("not-found", "No auction state");
    const state = stateSnap.data();
    const playerId = state.playerId || "";
    let playerNome = "Sconosciuto";
    if (playerId) {
        const playerSnap = await db.doc(`sessions/${sessionId}/players/${playerId}`).get();
        if (playerSnap.exists)
            playerNome = playerSnap.data().nome || playerNome;
    }
    await cancelCurrentAuction(sessionId, playerId, playerNome, stateRef);
    v2_1.logger.info(`Auction cancelled: session=${sessionId} player=${playerId}`);
    return { result: "cancelled" };
});
/**
 * Assegnazione manuale da parte del banditore.
 * Bypassa il flusso d'asta — prezzo libero.
 */
exports.manualAssign = (0, https_1.onCall)(async (request) => {
    const uid = validateAuth(request);
    const { sessionId, playerId, participantId, price } = request.data;
    const sessionData = await verifyBanditore(sessionId, uid);
    if (typeof price !== "number" || price < 0) {
        throw new https_1.HttpsError("invalid-argument", "Price must be a non-negative number");
    }
    const [playerSnap, partSnap] = await Promise.all([
        db.doc(`sessions/${sessionId}/players/${playerId}`).get(),
        db.doc(`sessions/${sessionId}/participants/${participantId}`).get(),
    ]);
    if (!playerSnap.exists)
        throw new https_1.HttpsError("not-found", "Player not found");
    if (!partSnap.exists)
        throw new https_1.HttpsError("not-found", "Participant not found");
    const player = playerSnap.data();
    const participant = partSnap.data();
    if (price > participant.budgetResiduo) {
        throw new https_1.HttpsError("invalid-argument", `Price (${price}) exceeds participant budget (${participant.budgetResiduo})`);
    }
    const fmt = sessionData.format;
    const primaryRole = getPrimaryRole(player, fmt);
    const rosterCount = participant.rosterCount || {};
    const rosterLimits = participant.rosterLimits || {};
    // Check rosa completa
    const totalRosterSize = sessionData.totalRosterSize || 25;
    const currentTotal = Object.values(rosterCount).reduce((a, b) => a + b, 0);
    if (currentTotal >= totalRosterSize) {
        throw new https_1.HttpsError("failed-precondition", `Rosa completa per ${participant.nickname} (${currentTotal}/${totalRosterSize})`);
    }
    if (fmt === "classic") {
        const currentCount = rosterCount[primaryRole] || 0;
        const maxCount = rosterLimits[primaryRole]?.max ?? 99;
        if (currentCount >= maxCount) {
            throw new https_1.HttpsError("failed-precondition", `Slot ${primaryRole} pieno per ${participant.nickname} (${currentCount}/${maxCount})`);
        }
    }
    else if (primaryRole === "Por") {
        const currentCount = rosterCount["Por"] || 0;
        const maxCount = rosterLimits["Por"]?.max ?? 3;
        if (currentCount >= maxCount) {
            throw new https_1.HttpsError("failed-precondition", `Slot Por pieno per ${participant.nickname} (${currentCount}/${maxCount})`);
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
    v2_1.logger.info(`Manual assign: ${participant.nickname} gets ${player.nome} for ${price}`);
    return { result: "assigned", winner: participant.nickname, price };
});
//# sourceMappingURL=index.js.map