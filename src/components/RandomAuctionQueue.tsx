import React, { useEffect, useState } from "react";
import { collection, onSnapshot, updateDoc, doc, arrayRemove } from "firebase/firestore";
import { db, startAuctionFn, parseMantraRoles } from "../firebase";
import { useSession } from "../pages/SessionRouter";
import { Shuffle, Play, SkipForward, Loader } from "lucide-react";

function getRoleColor(role: string) {
  if (role === "P" || role === "Por") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  if (["D", "Dc", "Dd", "Ds", "B"].includes(role)) return "bg-green-500/20 text-green-400 border-green-500/40";
  if (["E", "M", "C"].includes(role)) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  if (["T", "W"].includes(role)) return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  if (["A", "Pc"].includes(role)) return "bg-red-500/20 text-red-400 border-red-500/40";
  return "bg-gray-500/20 text-gray-400 border-gray-500/40";
}

function getRoleBadges(p: any, format: string): string[] {
  if (format === "classic") return p.r ? [p.r] : [];
  return parseMantraRoles(p.rm || "").length > 0
    ? parseMantraRoles(p.rm || "")
    : p.r ? [p.r] : [];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RandomAuctionQueue() {
  const { sessionId, sessionData } = useSession();
  const format = sessionData.format as "classic" | "mantra";
  const auctionMode = sessionData.auctionMode as string;
  const randomRole = sessionData.randomRole as string | null;
  const queue: string[] = sessionData.randomQueue || [];

  const [players, setPlayers] = useState<Record<string, any>>({});
  const [starting, setStarting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `sessions/${sessionId}/players`), (snap) => {
      const map: Record<string, any> = {};
      snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
      setPlayers(map);
    });
    return unsub;
  }, [sessionId]);

  // Find next available player in queue (skip sold/auctioning)
  const nextPlayerId = queue.find((id) => players[id]?.status === "available");
  const nextPlayer = nextPlayerId ? players[nextPlayerId] : null;

  const sessionRef = doc(db, "sessions", sessionId);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const allPlayers = Object.values(players);
      let pool = allPlayers.filter((p) => p.status === "available");

      if (auctionMode === "random-role" && randomRole) {
        pool = pool.filter((p) => {
          if (format === "classic") return p.r === randomRole;
          return parseMantraRoles(p.rm || "").includes(randomRole);
        });
      }

      if (pool.length === 0) throw new Error("Nessun giocatore disponibile per questa selezione");

      const shuffled = shuffle(pool.map((p) => p.id));
      await updateDoc(sessionRef, { randomQueue: shuffled });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const removeFromQueue = (playerId: string) =>
    updateDoc(sessionRef, { randomQueue: arrayRemove(playerId) });

  const handleStart = async () => {
    if (!nextPlayerId || starting) return;
    setStarting(true);
    setError("");
    try {
      await startAuctionFn({ sessionId, playerId: nextPlayerId, round: 1 });
      await removeFromQueue(nextPlayerId);
    } catch (e: any) {
      setError(e.message || "Errore avvio busta");
    } finally {
      setStarting(false);
    }
  };

  const handleSkip = async () => {
    if (!nextPlayerId || skipping) return;
    setSkipping(true);
    setError("");
    try {
      await removeFromQueue(nextPlayerId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSkipping(false);
    }
  };

  // Queue not yet generated
  if (queue.length === 0 && Object.keys(players).length > 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[#111128] flex items-center justify-center mb-6">
          <Shuffle size={36} className="text-[#00e5ff]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Estrazione casuale</h2>
        <p className="text-[#5a5a90] text-sm max-w-xs mb-6">
          {auctionMode === "random-role"
            ? `Verranno estratti solo i giocatori con ruolo: ${randomRole}`
            : "Verranno estratti tutti i giocatori disponibili in ordine casuale"}
        </p>
        {error && <p className="text-[#ff3d71] text-sm mb-4">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating || Object.keys(players).length === 0}
          className="bg-[#00e5ff] text-[#05050f] font-bold py-3 px-8 rounded-xl flex items-center gap-2 disabled:opacity-50"
        >
          {generating ? <Loader size={20} className="animate-spin" /> : <Shuffle size={20} />}
          {generating ? "Generazione..." : "Genera coda di estrazione"}
        </button>
      </div>
    );
  }

  // Queue exhausted
  if (queue.length > 0 && !nextPlayer && Object.keys(players).length > 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[#111128] flex items-center justify-center mb-6">
          <Shuffle size={36} className="text-[#5a5a90]" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Coda esaurita</h2>
        <p className="text-[#5a5a90] text-sm max-w-xs mb-6">
          Tutti i giocatori in coda sono stati estratti o assegnati manualmente.
          Puoi rigenerare la coda con i giocatori rimasti.
        </p>
        {error && <p className="text-[#ff3d71] text-sm mb-4">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[#111128] border border-[#5a5a90]/30 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 hover:border-[#00e5ff]/50 disabled:opacity-50"
        >
          {generating ? <Loader size={20} className="animate-spin" /> : <Shuffle size={20} />}
          Rigenera coda
        </button>
      </div>
    );
  }

  if (!nextPlayer) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={32} className="text-[#00e5ff] animate-spin" />
      </div>
    );
  }

  const badges = getRoleBadges(nextPlayer, format);
  const remaining = queue.filter((id) => players[id]?.status === "available").length;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 max-w-sm mx-auto w-full">
      <div className="text-xs text-[#5a5a90] uppercase tracking-widest mb-4 flex items-center gap-2">
        <Shuffle size={14} />
        Prossima estrazione · {remaining} rimasti
      </div>

      {/* Player card */}
      <div className="w-full bg-[#0b0b1c] border border-[#00e5ff]/30 rounded-2xl p-6 mb-6 text-center shadow-[0_0_30px_rgba(0,229,255,0.08)]">
        <div className="flex justify-center gap-1.5 mb-3">
          {badges.map((r) => (
            <span key={r} className={`text-xs font-bold px-2 py-0.5 rounded border ${getRoleColor(r)}`}>
              {r}
            </span>
          ))}
        </div>
        <div className="text-3xl font-black text-white mb-1">{nextPlayer.nome}</div>
        <div className="text-[#5a5a90] text-sm">
          {nextPlayer.squadra}
          {format === "classic"
            ? ` · Qt ${nextPlayer.qt} · FVM ${nextPlayer.fvm}`
            : ` · Qt ${nextPlayer.qm} · FVM ${nextPlayer.fvm}`}
        </div>
      </div>

      {error && (
        <p className="text-[#ff3d71] text-sm text-center mb-4">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 w-full">
        <button
          onClick={handleSkip}
          disabled={skipping || starting}
          className="flex-1 py-3 rounded-xl border border-[#5a5a90]/30 text-[#5a5a90] font-bold flex items-center justify-center gap-2 hover:border-[#ff3d71]/50 hover:text-[#ff3d71] transition-colors disabled:opacity-50"
        >
          {skipping ? <Loader size={18} className="animate-spin" /> : <SkipForward size={18} />}
          Salta
        </button>
        <button
          onClick={handleStart}
          disabled={starting || skipping}
          className="flex-2 flex-grow py-3 rounded-xl bg-[#00e5ff] text-[#05050f] font-bold flex items-center justify-center gap-2 hover:bg-[#00e5ff]/90 transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(0,229,255,0.3)]"
        >
          {starting ? <Loader size={18} className="animate-spin" /> : <Play size={18} />}
          Avvia busta
        </button>
      </div>
    </div>
  );
}
