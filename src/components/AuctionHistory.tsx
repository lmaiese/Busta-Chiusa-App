import React, { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "../pages/SessionRouter";
import { ChevronDown, ChevronUp, Shuffle } from "lucide-react";

interface HistoryEntry {
  id: string;
  playerId: string;
  playerNome: string;
  winnerUid: string | null;
  winnerNickname: string | null;
  price: number | null;
  allBids: { uid: string; nickname: string; amount: number }[];
  rounds: number;
  wasRandom: boolean;
  wasCancelled: boolean;
  completedAt: any;
}

function formatTime(ts: any): string {
  if (!ts) return "–";
  const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);

  const hasBids = entry.allBids && entry.allBids.length > 0;
  const sortedBids = hasBids
    ? [...entry.allBids].sort((a, b) => b.amount - a.amount)
    : [];

  return (
    <div className="border-t border-[#111128]">
      {/* Main row */}
      <button
        onClick={() => hasBids && setExpanded((p) => !p)}
        className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
          hasBids ? "hover:bg-[#111128]/50 cursor-pointer" : "cursor-default"
        }`}
      >
        {/* Time */}
        <span className="text-[#5a5a90] text-sm shrink-0 w-12">
          {formatTime(entry.completedAt)}
        </span>

        {/* Player name */}
        <span className="font-bold text-white flex-1 truncate">{entry.playerNome}</span>

        {/* Result */}
        <span className="text-sm shrink-0">
          {entry.wasCancelled ? (
            <span className="text-[#ffaa00] font-bold">Annullata</span>
          ) : entry.winnerNickname ? (
            <span className="text-[#00e5ff] font-bold">{entry.winnerNickname}</span>
          ) : (
            <span className="text-[#5a5a90] italic">Invenduto</span>
          )}
        </span>

        {/* Price */}
        <span className="font-mono font-bold text-right shrink-0 w-20">
          {entry.price != null ? (
            <span className="text-white">{entry.price} cr</span>
          ) : (
            <span className="text-[#5a5a90]">–</span>
          )}
        </span>

        {/* Badges + expand icon */}
        <div className="flex items-center gap-1 shrink-0">
          {entry.wasRandom && (
            <Shuffle size={12} className="text-[#ff3d71]" title="Sorteggio R3" />
          )}
          {entry.rounds > 1 && (
            <span className="text-xs text-[#ffaa00] font-bold">R{entry.rounds}</span>
          )}
          {hasBids ? (
            expanded ? (
              <ChevronUp size={16} className="text-[#5a5a90]" />
            ) : (
              <ChevronDown size={16} className="text-[#5a5a90]" />
            )
          ) : null}
        </div>
      </button>

      {/* Expanded bid detail */}
      {expanded && hasBids && (
        <div className="bg-[#05050f] border-t border-[#111128] px-4 pb-3 pt-2">
          <div className="text-xs text-[#5a5a90] uppercase tracking-wider mb-2">
            Tutte le offerte
          </div>
          <div className="space-y-1">
            {sortedBids.map((bid, i) => (
              <div
                key={i}
                className={`flex justify-between items-center px-3 py-1.5 rounded-lg ${
                  i === 0 ? "bg-[#00e5ff]/8 border border-[#00e5ff]/20" : "bg-[#111128]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <span className="text-[#ffaa00] text-xs font-bold">WIN</span>
                  )}
                  <span
                    className={`font-medium text-sm ${
                      i === 0 ? "text-[#00e5ff]" : "text-white"
                    }`}
                  >
                    {bid.nickname}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold">{bid.amount} cr</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuctionHistory() {
  const { sessionId } = useSession();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, `sessions/${sessionId}/auctionHistory`),
      orderBy("completedAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return unsub;
  }, [sessionId]);

  if (history.length === 0) {
    return (
      <div className="text-center py-16 text-[#5a5a90]">
        Nessuna busta completata finora.
      </div>
    );
  }

  const sold = history.filter((h) => !h.wasCancelled && h.winnerNickname);
  const totalSpent = sold.reduce((s, h) => s + (h.price || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex gap-6 text-sm text-[#5a5a90]">
        <span>
          <span className="text-white font-bold">{sold.length}</span> venduti
        </span>
        <span>
          <span className="text-white font-bold">{totalSpent}</span> cr totali spesi
        </span>
        <span>
          <span className="text-white font-bold">
            {history.filter((h) => h.wasCancelled).length}
          </span>{" "}
          annullati
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 flex gap-3 text-xs text-[#5a5a90] uppercase tracking-wider bg-[#111128]/60">
          <span className="w-12">Ora</span>
          <span className="flex-1">Calciatore</span>
          <span className="shrink-0">Vincitore</span>
          <span className="w-20 text-right">Prezzo</span>
          <span className="w-10" />
        </div>

        {history.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
