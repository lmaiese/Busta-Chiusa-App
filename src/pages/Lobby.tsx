import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "./SessionRouter";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Users, Play, Copy, Check, Tv } from "lucide-react";

export default function Lobby() {
  const { sessionId, sessionData, isBanditore, participantId } = useSession();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, `sessions/${sessionId}/participants`),
      (snap) => {
        const parts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setParticipants(parts);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `sessions/${sessionId}/participants`);
        } catch (e: any) {
          setError(e.message || "Errore connessione");
        }
      }
    );
    return unsub;
  }, [sessionId]);

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
  const sessionName = sessionData.sessionName || sessionData.code;

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-2xl mx-auto">
      {error && (
        <div className="bg-[#ff3d71]/10 border border-[#ff3d71] text-[#ff3d71] p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Titolo sessione */}
      <div className="text-center mt-8 mb-2">
        <h1 className="text-2xl font-black text-white">{sessionName}</h1>
        <p className="text-[#5a5a90] text-sm mt-1">
          Formato: {sessionData.format} · Budget: {sessionData.budget} cr
        </p>
      </div>

      {/* Codice sessione */}
      <div className="text-center mb-8">
        <p className="text-[#5a5a90] text-xs uppercase tracking-widest mb-2">
          Codice sessione
        </p>
        <button
          onClick={copyCode}
          className="inline-flex items-center gap-3 hover:scale-105 transition-transform"
        >
          <span className="text-4xl md:text-6xl font-black tracking-widest text-[#00e5ff] font-mono">
            {sessionData.code}
          </span>
          {copied ? (
            <Check size={24} className="text-green-400 shrink-0" />
          ) : (
            <Copy size={24} className="text-[#5a5a90]/50 shrink-0" />
          )}
        </button>
        <p className="text-[#5a5a90] text-xs mt-1">Tocca per copiare</p>
      </div>

      {/* Info partecipante */}
      {!isBanditore && myData && (
        <div className="bg-[#0b0b1c] border border-[#00e5ff]/30 rounded-2xl px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#5a5a90] uppercase tracking-wider mb-0.5">La tua squadra</div>
            <div className="text-xl font-bold">{myData.nickname}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#5a5a90] uppercase tracking-wider mb-0.5">Budget</div>
            <div className="text-2xl font-mono font-bold text-[#00e5ff]">{myData.budgetResiduo} cr</div>
          </div>
        </div>
      )}

      {/* Lista partecipanti */}
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-6 flex-1">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#111128] bg-[#111128]/40">
          <h3 className="font-bold flex items-center gap-2">
            <Users size={18} className="text-[#00e5ff]" />
            Partecipanti
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
            {participants.map((p) => {
              const isOnline = p.isConnected !== false;
              const isMe = p.id === participantId;
              return (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isOnline ? "bg-green-400" : "bg-[#5a5a90]"
                      }`}
                      title={isOnline ? "Online" : "Offline"}
                    />
                    <span className={`font-bold ${!isOnline ? "opacity-50" : ""}`}>
                      {p.nickname}
                    </span>
                    {isMe && (
                      <span className="text-xs text-[#00e5ff] border border-[#00e5ff]/30 rounded px-1.5 py-0.5">
                        tu
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[#5a5a90] text-sm">{p.budgetResiduo} cr</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action footer */}
      {isBanditore ? (
        <div className="flex flex-col gap-3">
          <button
            onClick={handleStartAuction}
            disabled={participants.length < 1 || starting}
            className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-lg"
          >
            <Play size={22} />
            {starting ? "Avvio in corso..." : "Inizia asta"}
          </button>
          <a
            href={`/session/${sessionId}/tv`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 text-[#5a5a90] hover:text-white border border-[#5a5a90]/30 hover:border-[#5a5a90] py-2.5 rounded-xl text-sm transition-colors"
          >
            <Tv size={16} />
            Apri TV mode
          </a>
        </div>
      ) : (
        <div className="text-center text-[#5a5a90] animate-pulse py-4">
          In attesa che il banditore avvii l'asta...
        </div>
      )}
    </div>
  );
}
