import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
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

function getRoleColor(role: string): string {
  if (role === "P" || role === "Por") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  if (["D", "Dc", "Dd", "Ds", "B"].includes(role)) return "bg-green-500/20 text-green-400 border-green-500/40";
  if (["E", "M", "C"].includes(role)) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  if (["T", "W"].includes(role)) return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  if (["A", "Pc"].includes(role)) return "bg-red-500/20 text-red-400 border-red-500/40";
  return "bg-gray-500/20 text-gray-400 border-gray-500/40";
}

function RoleBadges({ player, format }: { player: any; format: string }) {
  const roles =
    format === "classic"
      ? player.r ? [player.r] : []
      : (() => {
          const r = parseMantraRoles(player.rm || "");
          return r.length > 0 ? r : player.r ? [player.r] : [];
        })();
  return (
    <div className="flex justify-center gap-1 flex-wrap">
      {roles.map((r) => (
        <span key={r} className={`text-xs font-bold px-2 py-0.5 rounded border ${getRoleColor(r)}`}>
          {r}
        </span>
      ))}
    </div>
  );
}
import { useSession } from "../pages/SessionRouter";
import { X, Check, Loader, AlertTriangle, BanIcon } from "lucide-react";

// ── Modal assegnazione manuale ────────────────────────────────────────────
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
      await manualAssignFn({ sessionId, playerId: currentAuction.playerId, participantId: selectedParticipant, price: priceNum });
      onClose();
    } catch (e: any) {
      setError(e.message || "Errore assegnazione");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-xl font-bold mb-4">Assegnazione manuale</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-[#5a5a90] block mb-1">Squadra</label>
            <select value={selectedParticipant} onChange={(e) => setSelectedParticipant(e.target.value)} className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00e5ff]">
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.nickname} (budget: {p.budgetResiduo} cr)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-[#5a5a90] block mb-1">Prezzo (crediti)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} min={0} className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00e5ff] font-mono" />
          </div>
          {error && <p className="text-[#ff3d71] text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-[#5a5a90]/30 text-[#5a5a90] hover:border-[#5a5a90]">Annulla</button>
            <button onClick={handleConfirm} disabled={loading || !selectedParticipant} className="flex-1 py-2 rounded-lg bg-[#ffaa00] text-[#05050f] font-bold hover:bg-[#ffaa00]/90 disabled:opacity-50">
              {loading ? "..." : "Conferma"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────────
export default function ActiveAuction({
  currentAuction,
  playBell,
}: {
  currentAuction: any;
  playBell: () => void;
}) {
  const { sessionId, isBanditore, participantId, sessionData } = useSession();
  const format = sessionData.format as "classic" | "mantra";

  const [player, setPlayer] = useState<any>(null);
  const [myParticipant, setMyParticipant] = useState<any>(null);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [passesCount, setPassesCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [bidAmount, setBidAmount] = useState("");
  const [myBidSent, setMyBidSent] = useState(false);
  const [myBidAmount, setMyBidAmount] = useState<number | null>(null);
  const [myPassSent, setMyPassSent] = useState(false);
  const [loadingClose, setLoadingClose] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [showManualAssign, setShowManualAssign] = useState(false);
  const [fnError, setFnError] = useState("");
  const [allChosenSoundPlayed, setAllChosenSoundPlayed] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoClosedRef = useRef(false);
  const prevStatusRef = useRef<string | null>(null);

  // ── Suono apertura busta ──────────────────────────────────────────────
  useEffect(() => {
    const status = currentAuction?.status;
    if (status === "open" && prevStatusRef.current !== "open") {
      playBell();
      setAllChosenSoundPlayed(false);
    }
    prevStatusRef.current = status || null;
  }, [currentAuction?.status, playBell]);

  // ── Ascolta calciatore in asta ────────────────────────────────────────
  useEffect(() => {
    if (!currentAuction?.playerId) return;
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/players/${currentAuction.playerId}`),
      (snap) => { if (snap.exists()) setPlayer({ id: snap.id, ...snap.data() }); }
    );
    return unsub;
  }, [currentAuction?.playerId, sessionId]);

  // ── Ascolta partecipante corrente (budget) ────────────────────────────
  useEffect(() => {
    if (!participantId) return;
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/participants/${participantId}`),
      (snap) => { if (snap.exists()) setMyParticipant(snap.data()); }
    );
    return unsub;
  }, [participantId, sessionId]);

  // ── Conta partecipanti totali ─────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, `sessions/${sessionId}/participants`),
      (snap) => setParticipantsCount(snap.size)
    );
    return unsub;
  }, [sessionId]);

  // ── Ascolta passes ────────────────────────────────────────────────────
  useEffect(() => {
    if (currentAuction?.status !== "open" && currentAuction?.status !== "tiebreak") return;
    const unsub = onSnapshot(
      collection(db, `sessions/${sessionId}/currentAuction/state/passes`),
      (snap) => setPassesCount(snap.size)
    );
    return unsub;
  }, [currentAuction?.status, sessionId]);

  // ── Suono "tutti hanno scelto" per banditore ──────────────────────────
  useEffect(() => {
    if (!isBanditore || currentAuction?.status !== "open") return;
    const bidCount = currentAuction?.bidCount || 0;
    const total = bidCount + passesCount;
    if (total >= participantsCount && participantsCount > 0 && !allChosenSoundPlayed) {
      setAllChosenSoundPlayed(true);
      playBell();
    }
  }, [currentAuction?.bidCount, passesCount, participantsCount, isBanditore, currentAuction?.status, allChosenSoundPlayed, playBell]);

  // ── Reset stato bid/pass quando cambia calciatore o round ─────────────
  useEffect(() => {
    setBidAmount("");
    setMyBidSent(false);
    setMyBidAmount(null);
    setMyPassSent(false);
    autoClosedRef.current = false;
    setFnError("");
    setConfirmClose(false);
    setAllChosenSoundPlayed(false);
  }, [currentAuction?.playerId, currentAuction?.round]);

  // ── Timer server-accurate ─────────────────────────────────────────────
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
    setConfirmClose(false);
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
      status: "idle", playerId: "", bidCount: 0, round: 1,
      tiebreakParticipants: null, allBids: [], winnerId: null,
      winnerNickname: null, price: null, wasRandom: false,
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

    const bidRef = doc(db, `sessions/${sessionId}/currentAuction/state/bids/${participantId}`);
    await setDoc(bidRef, { amount, submittedAt: serverTimestamp(), round: currentAuction.round || 1 });

    // If was passed, remove the pass
    if (myPassSent) {
      const passRef = doc(db, `sessions/${sessionId}/currentAuction/state/passes/${participantId}`);
      await deleteDoc(passRef).catch(() => {});
      setMyPassSent(false);
    }

    setMyBidSent(true);
    setMyBidAmount(amount);
  };

  const cancelBid = async () => {
    if (!participantId || !myBidSent) return;
    const bidRef = doc(db, `sessions/${sessionId}/currentAuction/state/bids/${participantId}`);
    await deleteDoc(bidRef).catch(() => {});
    setMyBidSent(false);
    setMyBidAmount(null);
    setBidAmount("");
  };

  const togglePass = async () => {
    if (!participantId || myBidSent) return;
    const passRef = doc(db, `sessions/${sessionId}/currentAuction/state/passes/${participantId}`);
    if (myPassSent) {
      await deleteDoc(passRef).catch(() => {});
      setMyPassSent(false);
    } else {
      await setDoc(passRef, { passedAt: serverTimestamp(), round: currentAuction.round || 1 });
      setMyPassSent(true);
    }
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
  const bidCount = currentAuction?.bidCount || 0;
  const inAttesa = Math.max(0, participantsCount - bidCount - passesCount);

  const isTiebreakParticipant =
    !currentAuction?.tiebreakParticipants ||
    currentAuction.tiebreakParticipants.includes(participantId);

  const canBid =
    !isBanditore &&
    status === "open" &&
    isTiebreakParticipant &&
    myParticipant &&
    myParticipant.budgetResiduo > 0;

  const primaryRole = getPrimaryRole(player, format);
  const rosterCount = myParticipant?.rosterCount || {};
  const rosterLimits = myParticipant?.rosterLimits || {};
  const totalRosterSize = sessionData.totalRosterSize || 25;
  const totalRosterCount = Object.values(rosterCount).reduce((a, b) => a + (b as number), 0);
  const rosterFull = format === "classic"
    ? (rosterCount[primaryRole] || 0) >= (rosterLimits[primaryRole]?.max ?? 99)
    : totalRosterCount >= totalRosterSize ||
      (primaryRole === "Por" && (rosterCount["Por"] || 0) >= (rosterLimits["Por"]?.max ?? 3));

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

      {/* Header calciatore */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] p-4 relative">
        <div className="text-[#5a5a90] text-xs uppercase tracking-widest mb-1 text-center">
          {status === "tiebreak" ? `Spareggio Round ${currentAuction.round}` : "Busta aperta"}
        </div>
        <div className="text-2xl font-black text-center mb-1">{player.nome}</div>
        <div className="text-[#5a5a90] text-xs text-center mb-1.5">{player.squadra}</div>
        <RoleBadges player={player} format={format} />

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

        {/* ── OPEN ──────────────────────────────────────── */}
        {status === "open" && (
          <>
            {/* Timer */}
            <div className={`text-7xl font-mono font-black mb-4 transition-colors ${last5 ? "text-[#ff3d71] animate-pulse" : "text-[#00e5ff]"}`}>
              {mm}:{ss}
            </div>

            {/* Contatore offerte + pass + in attesa */}
            <div className="bg-[#111128] rounded-full px-5 py-1.5 text-sm text-[#5a5a90] mb-6 flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
                <span className="text-white font-bold">{bidCount}</span> offerte
              </span>
              {passesCount > 0 && (
                <span className="flex items-center gap-1 text-[#ff3d71]">
                  · <span className="font-bold">{passesCount}</span> pass
                </span>
              )}
              {inAttesa > 0 && (
                <span className="text-[#5a5a90]">
                  · <span className="font-bold">{inAttesa}</span> in attesa
                </span>
              )}
            </div>

            {/* Input offerta partecipante */}
            {canBid && (
              <div className="w-full">
                {rosterFull && (
                  <div className="bg-[#ffaa00]/10 border border-[#ffaa00]/40 text-[#ffaa00] text-xs text-center rounded-lg px-3 py-2 mb-3">
                    Slot {primaryRole} pieno — non puoi offrire per questo calciatore
                  </div>
                )}

                <div className={`bg-[#0b0b1c] border rounded-2xl p-4 mb-3 transition-colors ${myBidSent ? "border-[#00e5ff]/60" : myPassSent ? "border-[#ff3d71]/40" : "border-[#111128]"}`}>
                  <div className="flex justify-between text-xs text-[#5a5a90] mb-2">
                    <span>La tua offerta</span>
                    {myBidSent && (
                      <span className="text-[#00e5ff] flex items-center gap-1">
                        <Check size={12} /> inviata ({myBidAmount} cr)
                      </span>
                    )}
                    {myPassSent && !myBidSent && (
                      <span className="text-[#ff3d71] flex items-center gap-1">
                        <BanIcon size={12} /> non partecipo
                      </span>
                    )}
                  </div>
                  <div className={`text-5xl font-mono font-black text-center h-14 flex items-center justify-center ${bidAmount === "" ? "text-[#2a2a48]" : !budgetOk ? "text-[#ff3d71]" : "text-white"}`}>
                    {bidAmount || "–"}
                  </div>
                  <div className="text-xs text-[#5a5a90] text-center mt-1">
                    Budget: <span className="text-white font-bold">{myParticipant?.budgetResiduo} cr</span>
                    {!budgetOk && bidAmount && <span className="text-[#ff3d71] ml-1">· supera il budget</span>}
                  </div>
                </div>

                {/* Tastiera */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
                    <button
                      key={k}
                      onClick={() => handleKeypad(k)}
                      disabled={rosterFull}
                      className={`h-14 rounded-xl font-bold text-xl transition-all active:scale-95 disabled:opacity-30 ${
                        k === "C" ? "bg-[#ff3d71]/10 text-[#ff3d71]"
                        : k === "⌫" ? "bg-[#111128] text-[#5a5a90]"
                        : "bg-[#0b0b1c] border border-[#111128] text-white font-mono"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                {/* Submit bid */}
                <button
                  onClick={submitBid}
                  disabled={!bidValid || rosterFull}
                  className={`w-full h-14 rounded-xl font-bold text-lg transition-all mb-2 ${
                    bidValid && !rosterFull
                      ? "bg-[#00e5ff] text-[#05050f] hover:bg-[#00e5ff]/90 shadow-[0_0_20px_rgba(0,229,255,0.3)]"
                      : "bg-[#111128] text-[#5a5a90]"
                  }`}
                >
                  {rosterFull ? "Slot pieno" : myBidSent ? `Modifica (${myBidAmount} cr inviati)` : "Invia offerta"}
                </button>

                {/* Annulla offerta */}
                {myBidSent && (
                  <button
                    onClick={cancelBid}
                    className="w-full py-2 rounded-xl text-sm text-[#5a5a90] hover:text-[#ff3d71] border border-[#5a5a90]/20 hover:border-[#ff3d71]/40 transition-colors mb-2"
                  >
                    Annulla offerta
                  </button>
                )}

                {/* Non partecipo toggle */}
                {!myBidSent && !rosterFull && (
                  <button
                    onClick={togglePass}
                    className={`w-full py-2 rounded-xl text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                      myPassSent
                        ? "bg-[#ff3d71]/10 border-[#ff3d71]/50 text-[#ff3d71]"
                        : "border-[#5a5a90]/20 text-[#5a5a90] hover:border-[#ff3d71]/40 hover:text-[#ff3d71]"
                    }`}
                  >
                    <BanIcon size={14} />
                    {myPassSent ? "Annulla (non partecipo)" : "Non partecipo"}
                  </button>
                )}
              </div>
            )}

            {/* Chiudi busta — banditore */}
            {isBanditore && (
              !confirmClose ? (
                <button
                  onClick={() => setConfirmClose(true)}
                  disabled={loadingClose}
                  className="bg-[#ffaa00] hover:bg-[#ffaa00]/90 text-[#05050f] font-bold py-4 px-8 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loadingClose && <Loader size={20} className="animate-spin" />}
                  {loadingClose ? "Chiusura..." : "Chiudi busta anticipatamente"}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                  <p className="text-sm text-center text-white font-medium">
                    Sei sicuro di voler chiudere la busta?
                  </p>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setConfirmClose(false)}
                      className="flex-1 py-3 rounded-xl border border-[#5a5a90]/30 text-[#5a5a90] hover:border-[#5a5a90] font-bold"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={handleCloseAuction}
                      className="flex-1 py-3 rounded-xl bg-[#ffaa00] text-[#05050f] font-bold hover:bg-[#ffaa00]/90"
                    >
                      Sì, chiudi
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Spettatore non in tiebreak */}
            {!isBanditore && !canBid && (
              <div className="text-[#5a5a90] text-center">
                {currentAuction.round > 1 && !isTiebreakParticipant
                  ? "Non partecipi a questo spareggio"
                  : "In attesa..."}
              </div>
            )}
          </>
        )}

        {/* ── CLOSING ─────────────────────────────────── */}
        {status === "closing" && (
          <div className="text-[#00e5ff] text-2xl font-bold animate-pulse">
            Apertura buste in corso...
          </div>
        )}

        {/* ── TIEBREAK ────────────────────────────────── */}
        {status === "tiebreak" && (
          <div className="text-center w-full">
            <div className="text-5xl mb-4">⚖️</div>
            <h2 className="text-3xl font-black mb-2">PARITÀ!</h2>
            <p className="text-[#5a5a90] mb-2">Round {currentAuction.round} — Spareggio in arrivo</p>
            {currentAuction.allBids?.length > 0 && (
              <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-6 text-left">
                <div className="bg-[#111128] px-4 py-2 text-xs text-[#5a5a90] uppercase tracking-wider">Offerte round precedente</div>
                {currentAuction.allBids.map((b: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex justify-between border-t border-[#111128]">
                    <span className="text-white font-bold">{b.nickname}</span>
                    <span className="font-mono text-[#00e5ff]">{b.amount} cr</span>
                  </div>
                ))}
              </div>
            )}
            {isBanditore && (
              <button onClick={handleStartTiebreak} className="bg-[#00e5ff] text-[#05050f] font-bold py-4 px-8 rounded-xl text-lg">
                Avvia spareggio (Round {(currentAuction.round || 1) + 1})
              </button>
            )}
            {!isBanditore && (
              <p className="text-[#5a5a90] animate-pulse">In attesa dello spareggio...</p>
            )}
          </div>
        )}

        {/* ── REVEALED ────────────────────────────────── */}
        {status === "revealed" && (
          <div className="w-full">
            <div className="text-center mb-6">
              {currentAuction.winnerId ? (
                <>
                  <h2 className="text-3xl font-black text-[#00e5ff] mb-1">ASSEGNATO!</h2>
                  <div className="text-xl">
                    a <span className="font-bold text-[#ffaa00]">{currentAuction.winnerNickname}</span>{" "}
                    per <span className="font-mono font-bold text-[#00e5ff]">{currentAuction.price} cr</span>
                  </div>
                  {currentAuction.wasRandom && (
                    <div className="text-[#ff3d71] text-sm mt-1 font-bold">Assegnato tramite sorteggio (3° pareggio)</div>
                  )}
                </>
              ) : (
                <h2 className="text-2xl font-black text-[#ff3d71]">Nessuna offerta valida</h2>
              )}
            </div>

            {currentAuction.allBids?.length > 0 && (
              <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-6">
                <div className="bg-[#111128] px-4 py-2 text-xs text-[#5a5a90] uppercase tracking-wider">Tutte le offerte</div>
                {currentAuction.allBids.map((b: any, i: number) => (
                  <div key={i} className={`px-4 py-3 flex justify-between items-center border-t border-[#111128] ${i === 0 ? "bg-[#00e5ff]/10" : ""}`}>
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="text-[#ffaa00] text-xs font-bold">WIN</span>}
                      <span className={`font-bold ${i === 0 ? "text-[#00e5ff]" : "text-white"}`}>{b.nickname}</span>
                    </div>
                    <span className="font-mono font-bold">{b.amount} cr</span>
                  </div>
                ))}
              </div>
            )}

            {isBanditore && (
              <button onClick={handleNextPlayer} className="w-full bg-[#00e5ff] text-[#05050f] font-bold py-4 rounded-xl text-lg">
                Prossimo calciatore
              </button>
            )}
            {!isBanditore && (
              <p className="text-[#5a5a90] text-center text-sm">In attesa del prossimo calciatore...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
