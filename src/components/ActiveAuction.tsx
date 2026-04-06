import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
  onSnapshot,
  collection,
  getDocs,
} from "firebase/firestore";
import {
  db,
  closeAuctionFn,
  cancelAuctionFn,
  startAuctionFn,
  manualAssignFn,
  parseMantraRoles,
  getPrimaryRole,
} from "../firebase";
import { useSession } from "../pages/SessionRouter";
import { X, Check, Loader, AlertTriangle } from "lucide-react";

// ── Manual assign modal ──────────────────────────────────────────────────
function ManualAssignModal({
  sessionId,
  currentAuction,
  onClose,
}: {
  sessionId: string;
  currentAuction: any;
  onClose: () => void;
}) {
  const [participants, setParticipants] = useState<any[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState("");
  const [price, setPrice] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDocs(collection(db, `sessions/${sessionId}/participants`)).then((snap) => {
      const parts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setParticipants(parts);
      if (parts.length > 0) setSelectedParticipant(parts[0].id);
    });
  }, [sessionId]);

  const handleConfirm = async () => {
    if (!selectedParticipant || !currentAuction?.playerId) return;
    const priceNum = parseInt(price, 10);
    if (isNaN(priceNum) || priceNum < 0) { setError("Prezzo non valido"); return; }
    setLoading(true);
    setError("");
    try {
      await manualAssignFn({
        sessionId,
        playerId: currentAuction.playerId,
        participantId: selectedParticipant,
        price: priceNum,
      });
      onClose();
    } catch (e: any) {
      setError(e.message || "Errore assegnazione");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-xl font-bold mb-4">Assegnazione manuale</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-[#5a5a90] block mb-1">Squadra</label>
            <select
              value={selectedParticipant}
              onChange={(e) => setSelectedParticipant(e.target.value)}
              className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00e5ff]"
            >
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname} (budget: {p.budgetResiduo} cr)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-[#5a5a90] block mb-1">Prezzo (crediti)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min={0}
              className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00e5ff] font-mono"
            />
          </div>

          {error && <p className="text-[#ff3d71] text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[#5a5a90]/30 text-[#5a5a90] hover:border-[#5a5a90]"
            >
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !selectedParticipant}
              className="flex-1 py-2 rounded-lg bg-[#ffaa00] text-[#05050f] font-bold hover:bg-[#ffaa00]/90 disabled:opacity-50"
            >
              {loading ? "..." : "Conferma"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────
export default function ActiveAuction({ currentAuction }: { currentAuction: any }) {
  const { sessionId, isBanditore, participantId, sessionData } = useSession();
  const format = sessionData.format as "classic" | "mantra";

  const [player, setPlayer] = useState<any>(null);
  const [myParticipant, setMyParticipant] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [bidAmount, setBidAmount] = useState("");
  const [myBidSent, setMyBidSent] = useState(false);
  const [myBidAmount, setMyBidAmount] = useState<number | null>(null);
  const [loadingClose, setLoadingClose] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [showManualAssign, setShowManualAssign] = useState(false);
  const [fnError, setFnError] = useState("");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoClosedRef = useRef(false);

  // Listen to player data
  useEffect(() => {
    if (!currentAuction?.playerId) return;
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/players/${currentAuction.playerId}`),
      (snap) => { if (snap.exists()) setPlayer({ id: snap.id, ...snap.data() }); }
    );
    return unsub;
  }, [currentAuction?.playerId, sessionId]);

  // Listen to participant data
  useEffect(() => {
    if (!participantId) return;
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/participants/${participantId}`),
      (snap) => { if (snap.exists()) setMyParticipant(snap.data()); }
    );
    return unsub;
  }, [participantId, sessionId]);

  // Reset bid state when auction changes
  useEffect(() => {
    setBidAmount("");
    setMyBidSent(false);
    setMyBidAmount(null);
    autoClosedRef.current = false;
    setFnError("");
  }, [currentAuction?.playerId, currentAuction?.round]);

  // Server-accurate timer
  useEffect(() => {
    if (currentAuction?.status !== "open" || !currentAuction?.timerEnd) {
      setTimeLeft(0);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const endMs =
      currentAuction.timerEnd?.toMillis?.() ??
      (currentAuction.timerEnd?.seconds
        ? currentAuction.timerEnd.seconds * 1000
        : Number(currentAuction.timerEnd));

    const tick = () => {
      const remaining = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && isBanditore && !autoClosedRef.current) {
        autoClosedRef.current = true;
        handleCloseAuction();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentAuction?.status, currentAuction?.timerEnd, isBanditore]);

  const handleCloseAuction = useCallback(async () => {
    if (!isBanditore || loadingClose) return;
    setLoadingClose(true);
    setFnError("");
    try {
      await closeAuctionFn({ sessionId });
    } catch (e: any) {
      setFnError(e.message || "Errore chiusura busta");
      autoClosedRef.current = false;
    } finally {
      setLoadingClose(false);
    }
  }, [isBanditore, sessionId, loadingClose]);

  const handleCancelAuction = async () => {
    if (!isBanditore || loadingCancel) return;
    setLoadingCancel(true);
    setFnError("");
    try {
      await cancelAuctionFn({ sessionId });
    } catch (e: any) {
      setFnError(e.message || "Errore annullamento");
    } finally {
      setLoadingCancel(false);
    }
  };

  const handleNextPlayer = async () => {
    if (!isBanditore) return;
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
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
  };

  const handleStartTiebreak = async () => {
    if (!isBanditore) return;
    setFnError("");
    try {
      await startAuctionFn({
        sessionId,
        playerId: currentAuction.playerId,
        round: (currentAuction.round || 1) + 1,
        tiebreakParticipants: currentAuction.tiebreakParticipants || null,
      });
    } catch (e: any) {
      setFnError(e.message || "Errore avvio tiebreak");
    }
  };

  const handleKeypad = (val: string) => {
    if (val === "C") { setBidAmount(""); return; }
    if (val === "⌫") { setBidAmount((p) => p.slice(0, -1)); return; }
    if (bidAmount.length < 4) setBidAmount((p) => p + val);
  };

  const submitBid = async () => {
    if (!participantId || !bidAmount) return;
    const amount = parseInt(bidAmount, 10);
    if (!amount || amount < 1) return;
    if (myParticipant && amount > myParticipant.budgetResiduo) return;

    const isNewBid = !myBidSent;

    await setDoc(
      doc(db, `sessions/${sessionId}/currentAuction/state/bids/${participantId}`),
      { amount, submittedAt: serverTimestamp(), round: currentAuction.round || 1 }
    );

    if (isNewBid) {
      await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
        bidCount: increment(1),
      });
    }

    setMyBidSent(true);
    setMyBidAmount(amount);
  };

  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="text-[#00e5ff] animate-spin" size={32} />
      </div>
    );
  }

  const status = currentAuction?.status;
  const amt = parseInt(bidAmount, 10) || 0;
  const budgetOk = !myParticipant || amt <= myParticipant.budgetResiduo;
  const bidValid = amt >= 1 && budgetOk;
  const last5 = timeLeft > 0 && timeLeft <= 5;

  const isTiebreakParticipant =
    !currentAuction?.tiebreakParticipants ||
    currentAuction.tiebreakParticipants.includes(participantId);

  const canBid =
    !isBanditore &&
    status === "open" &&
    isTiebreakParticipant &&
    myParticipant &&
    myParticipant.budgetResiduo > 0;

  // ── Determine roster fullness for this player ──
  const primaryRole = getPrimaryRole(player, format);
  const rosterCount = myParticipant?.rosterCount || {};
  const rosterLimits = myParticipant?.rosterLimits || {};
  const rosterFull =
    (rosterCount[primaryRole] || 0) >= (rosterLimits[primaryRole]?.max ?? 99);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="min-h-screen flex flex-col bg-[#05050f]">
      {showManualAssign && (
        <ManualAssignModal
          sessionId={sessionId}
          currentAuction={currentAuction}
          onClose={() => setShowManualAssign(false)}
        />
      )}

      {/* Header */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] p-4 relative">
        <div className="text-[#5a5a90] text-xs uppercase tracking-widest mb-1 text-center">
          {status === "tiebreak" ? `Spareggio Round ${currentAuction.round}` : "Busta aperta"}
        </div>
        <div className="text-2xl font-black text-center">{player.nome}</div>
        <div className="text-[#00e5ff] text-sm font-bold text-center">
          {player.squadra} ·{" "}
          {format === "classic" ? player.r : player.rm || player.r}
        </div>

        {isBanditore && (status === "open" || status === "tiebreak") && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
            <button
              onClick={() => setShowManualAssign(true)}
              className="text-[#ffaa00] hover:bg-[#ffaa00]/10 p-2 rounded-full transition-colors"
              title="Assegnazione manuale"
            >
              <AlertTriangle size={20} />
            </button>
            <button
              onClick={handleCancelAuction}
              disabled={loadingCancel}
              className="text-[#ff3d71] hover:bg-[#ff3d71]/10 p-2 rounded-full transition-colors disabled:opacity-50"
              title="Annulla busta"
            >
              {loadingCancel ? <Loader size={20} className="animate-spin" /> : <X size={20} />}
            </button>
          </div>
        )}
      </div>

      {fnError && (
        <div className="bg-[#ff3d71]/10 border-b border-[#ff3d71] text-[#ff3d71] px-4 py-2 text-sm text-center">
          {fnError}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-sm mx-auto w-full">
        {/* ── OPEN ────────────────────────────────────────── */}
        {status === "open" && (
          <>
            {/* Timer */}
            <div
              className={`text-7xl font-mono font-black mb-4 transition-colors ${
                last5 ? "text-[#ff3d71] animate-pulse" : "text-[#00e5ff]"
              }`}
            >
              {mm}:{ss}
            </div>

            {/* Bid count */}
            <div className="bg-[#111128] rounded-full px-5 py-1.5 text-sm text-[#5a5a90] mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
              {currentAuction.bidCount || 0} offerte ricevute
            </div>

            {/* Participant bid input */}
            {canBid && (
              <div className="w-full">
                {rosterFull && (
                  <div className="bg-[#ffaa00]/10 border border-[#ffaa00]/40 text-[#ffaa00] text-xs text-center rounded-lg px-3 py-2 mb-3">
                    Slot {primaryRole} pieno — non puoi offrire per questo calciatore
                  </div>
                )}
                <div
                  className={`bg-[#0b0b1c] border rounded-2xl p-4 mb-3 transition-colors ${
                    myBidSent ? "border-[#00e5ff]/60" : "border-[#111128]"
                  }`}
                >
                  <div className="flex justify-between text-xs text-[#5a5a90] mb-2">
                    <span>La tua offerta</span>
                    {myBidSent && (
                      <span className="text-[#00e5ff] flex items-center gap-1">
                        <Check size={12} /> inviata ({myBidAmount} cr)
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-5xl font-mono font-black text-center h-14 flex items-center justify-center ${
                      bidAmount === "" ? "text-[#2a2a48]" : !budgetOk ? "text-[#ff3d71]" : "text-white"
                    }`}
                  >
                    {bidAmount || "–"}
                  </div>
                  <div className="text-xs text-[#5a5a90] text-center mt-1">
                    Budget:{" "}
                    <span className="text-white font-bold">{myParticipant?.budgetResiduo} cr</span>
                    {!budgetOk && bidAmount && (
                      <span className="text-[#ff3d71] ml-1">· supera il budget</span>
                    )}
                  </div>
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
                    <button
                      key={k}
                      onClick={() => handleKeypad(k)}
                      disabled={rosterFull}
                      className={`h-14 rounded-xl font-bold text-xl transition-all active:scale-95 disabled:opacity-30 ${
                        k === "C"
                          ? "bg-[#ff3d71]/10 text-[#ff3d71]"
                          : k === "⌫"
                          ? "bg-[#111128] text-[#5a5a90]"
                          : "bg-[#0b0b1c] border border-[#111128] text-white font-mono"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <button
                  onClick={submitBid}
                  disabled={!bidValid || rosterFull}
                  className={`w-full h-14 rounded-xl font-bold text-lg transition-all ${
                    bidValid && !rosterFull
                      ? "bg-[#00e5ff] text-[#05050f] hover:bg-[#00e5ff]/90 shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                      : "bg-[#111128] text-[#5a5a90]"
                  }`}
                >
                  {rosterFull
                    ? "Slot pieno"
                    : myBidSent
                    ? `Modifica (${myBidAmount} cr inviati)`
                    : "Invia offerta"}
                </button>
              </div>
            )}

            {/* Banditore close button */}
            {isBanditore && (
              <button
                onClick={handleCloseAuction}
                disabled={loadingClose}
                className="bg-[#ffaa00] hover:bg-[#ffaa00]/90 text-[#05050f] font-bold py-4 px-8 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {loadingClose ? <Loader size={20} className="animate-spin" /> : null}
                {loadingClose ? "Chiusura..." : "Chiudi busta anticipatamente"}
              </button>
            )}

            {/* Spectator message */}
            {!isBanditore && !canBid && (
              <div className="text-[#5a5a90] text-center">
                {currentAuction.round > 1 && !isTiebreakParticipant
                  ? "Non partecipi a questo spareggio"
                  : "In attesa..."}
              </div>
            )}
          </>
        )}

        {/* ── CLOSING ─────────────────────────────────────── */}
        {status === "closing" && (
          <div className="text-[#00e5ff] text-2xl font-bold animate-pulse">
            Apertura buste in corso...
          </div>
        )}

        {/* ── TIEBREAK ────────────────────────────────────── */}
        {status === "tiebreak" && (
          <div className="text-center w-full">
            <div className="text-5xl mb-4">⚖️</div>
            <h2 className="text-3xl font-black mb-2">PARITÀ!</h2>
            <p className="text-[#5a5a90] mb-2">Round {currentAuction.round} — Spareggio in arrivo</p>

            {/* Show tied bids */}
            {currentAuction.allBids?.length > 0 && (
              <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-6 text-left">
                <div className="bg-[#111128] px-4 py-2 text-xs text-[#5a5a90] uppercase tracking-wider">
                  Offerte del round precedente
                </div>
                {currentAuction.allBids.map((b: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex justify-between border-t border-[#111128]">
                    <span className="text-white font-bold">{b.nickname}</span>
                    <span className="font-mono text-[#00e5ff]">{b.amount} cr</span>
                  </div>
                ))}
              </div>
            )}

            {isBanditore && (
              <button
                onClick={handleStartTiebreak}
                className="bg-[#00e5ff] text-[#05050f] font-bold py-4 px-8 rounded-xl text-lg"
              >
                Avvia spareggio (Round {(currentAuction.round || 1) + 1})
              </button>
            )}
            {!isBanditore && (
              <p className="text-[#5a5a90] animate-pulse">
                In attesa che il banditore avvii lo spareggio...
              </p>
            )}
          </div>
        )}

        {/* ── REVEALED ────────────────────────────────────── */}
        {status === "revealed" && (
          <div className="w-full">
            <div className="text-center mb-6">
              {currentAuction.winnerId ? (
                <>
                  <h2 className="text-3xl font-black text-[#00e5ff] mb-1">ASSEGNATO!</h2>
                  <div className="text-xl">
                    a{" "}
                    <span className="font-bold text-[#ffaa00]">
                      {currentAuction.winnerNickname}
                    </span>{" "}
                    per{" "}
                    <span className="font-mono font-bold text-[#00e5ff]">
                      {currentAuction.price} cr
                    </span>
                  </div>
                  {currentAuction.wasRandom && (
                    <div className="text-[#ff3d71] text-sm mt-1 font-bold">
                      Assegnato tramite sorteggio (3° pareggio)
                    </div>
                  )}
                </>
              ) : (
                <h2 className="text-2xl font-black text-[#ff3d71]">Nessuna offerta valida</h2>
              )}
            </div>

            {/* All bids ranking */}
            {currentAuction.allBids?.length > 0 && (
              <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-6">
                <div className="bg-[#111128] px-4 py-2 text-xs text-[#5a5a90] uppercase tracking-wider">
                  Tutte le offerte
                </div>
                {currentAuction.allBids.map((b: any, i: number) => (
                  <div
                    key={i}
                    className={`px-4 py-3 flex justify-between items-center border-t border-[#111128] ${
                      i === 0 ? "bg-[#00e5ff]/8" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="text-[#ffaa00] text-xs font-bold">WIN</span>}
                      <span className={`font-bold ${i === 0 ? "text-[#00e5ff]" : "text-white"}`}>
                        {b.nickname}
                      </span>
                    </div>
                    <span className="font-mono font-bold">{b.amount} cr</span>
                  </div>
                ))}
              </div>
            )}

            {isBanditore && (
              <button
                onClick={handleNextPlayer}
                className="w-full bg-[#00e5ff] text-[#05050f] font-bold py-4 rounded-xl text-lg"
              >
                Prossimo calciatore
              </button>
            )}
            {!isBanditore && (
              <p className="text-[#5a5a90] text-center text-sm">
                In attesa del prossimo calciatore...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
