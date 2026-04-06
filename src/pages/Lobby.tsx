import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "./SessionRouter";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { auth, db, handleFirestoreError, OperationType } from "../firebase";
import { Users, Play, Copy, Check } from "lucide-react";

export default function Lobby() {
  const { sessionId, sessionData, isBanditore, participantId } = useSession();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // Listen to participants
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, `sessions/${sessionId}/participants`),
      (snap) => {
        const parts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setParticipants(parts);
      },
      (err) => {
        // If anonymous token expired, redirect to home
        if (err.message?.includes("Missing or insufficient permissions") && auth.currentUser?.isAnonymous) {
          auth.signOut().then(() => navigate("/"));
          return;
        }
        try {
          handleFirestoreError(err, OperationType.LIST, `sessions/${sessionId}/participants`);
        } catch (e: any) {
          setError(e.message || "Errore connessione");
        }
      }
    );
    return unsub;
  }, [sessionId, navigate]);

  // Navigate to auction when banditore starts it (status changes from 'lobby')
  useEffect(() => {
    if (sessionData?.status === "auctioning") {
      navigate(`/session/${sessionId}/auction`);
    }
  }, [sessionData?.status, navigate, sessionId]);

  const handleStartAuction = async () => {
    if (!isBanditore || starting) return;
    setStarting(true);
    setError("");
    try {
      await updateDoc(doc(db, "sessions", sessionId), { status: "auctioning" });
      // Navigation happens via the useEffect above
    } catch (err: any) {
      setError(err.message || "Errore avvio asta");
      setStarting(false);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(sessionData.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const myData = participants.find((p) => p.id === participantId);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-2xl mx-auto">
      {error && (
        <div className="bg-[#ff3d71]/10 border border-[#ff3d71] text-[#ff3d71] p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Codice sessione */}
      <div className="text-center mt-8 mb-10">
        <p className="text-[#5a5a90] text-sm uppercase tracking-widest mb-3">
          Codice sessione
        </p>
        <button
          onClick={copyCode}
          className="inline-flex items-center gap-3 hover:scale-105 transition-transform"
        >
          <span className="text-5xl md:text-7xl font-black tracking-widest text-[#00e5ff] font-mono">
            {sessionData.code}
          </span>
          {copied ? (
            <Check size={28} className="text-green-400 shrink-0" />
          ) : (
            <Copy size={28} className="text-[#5a5a90]/50 shrink-0" />
          )}
        </button>
        <p className="text-[#5a5a90] text-sm mt-2">
          Tocca per copiare · Formato: {sessionData.format} · Budget: {sessionData.budget} cr
        </p>
      </div>

      {/* Info partecipante (solo per non-banditore) */}
      {!isBanditore && myData && (
        <div className="bg-[#0b0b1c] border border-[#00e5ff]/30 rounded-2xl px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#5a5a90] uppercase tracking-wider mb-0.5">
              La tua squadra
            </div>
            <div className="text-xl font-bold">{myData.nickname}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#5a5a90] uppercase tracking-wider mb-0.5">
              Budget
            </div>
            <div className="text-2xl font-mono font-bold text-[#00e5ff]">
              {myData.budgetResiduo} cr
            </div>
          </div>
        </div>
      )}

      {/* Lista partecipanti */}
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-6 flex-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#111128] bg-[#111128]/40">
          <h3 className="font-bold flex items-center gap-2">
            <Users size={18} className="text-[#00e5ff]" />
            Partecipanti connessi
          </h3>
          <span className="bg-[#111128] text-[#00e5ff] px-2.5 py-0.5 rounded-full font-mono font-bold text-sm">
            {participants.length}
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="text-center py-12 text-[#5a5a90]">
            In attesa dei partecipanti...
          </div>
        ) : (
          <div className="divide-y divide-[#111128]">
            {participants.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  <span className="font-bold">{p.nickname}</span>
                  {p.id === participantId && (
                    <span className="text-xs text-[#00e5ff] border border-[#00e5ff]/30 rounded px-1.5 py-0.5">
                      tu
                    </span>
                  )}
                </div>
                <span className="font-mono text-[#5a5a90] text-sm">{p.budgetResiduo} cr</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action footer */}
      {isBanditore ? (
        <button
          onClick={handleStartAuction}
          disabled={participants.length < 1 || starting}
          className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-lg"
        >
          <Play size={22} />
          {starting ? "Avvio in corso..." : "Inizia asta"}
        </button>
      ) : (
        <div className="text-center text-[#5a5a90] animate-pulse py-4">
          In attesa che il banditore avvii l'asta...
        </div>
      )}
    </div>
  );
}
