import React, { useEffect, useState } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "./SessionRouter";
import { Download, Trophy } from "lucide-react";

interface RosterPlayer {
  id: string;
  playerId: string;
  nome: string;
  role: string;
  roleRaw?: string;
  price: number;
}

interface ParticipantSummary {
  id: string;
  nickname: string;
  budgetResiduo: number;
  rosterCount: Record<string, number>;
  rosterLimits: Record<string, { min: number; max: number }>;
  roster: RosterPlayer[];
}

export default function AuctionSummary() {
  const { sessionId, isBanditore, sessionData } = useSession();
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [exporting, setExporting] = useState(false);

  const format = sessionData.format as "classic" | "mantra";
  const roles =
    format === "classic"
      ? ["P", "D", "C", "A"]
      : ["Por", "Dc", "Dd", "Ds", "B", "E", "M", "C", "T", "W", "A", "Pc"];

  // Carica partecipanti e rose in real-time
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, `sessions/${sessionId}/participants`),
      async (snap) => {
        const parts = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();
            const rosterSnap = await getDocs(
              collection(db, `sessions/${sessionId}/participants/${d.id}/roster`)
            );
            const roster: RosterPlayer[] = rosterSnap.docs
              .map((r) => ({ id: r.id, ...(r.data() as any) }))
              .sort((a, b) => (a.role || "").localeCompare(b.role || ""));
            return { id: d.id, ...data, roster } as ParticipantSummary;
          })
        );
        // Ordina per budget residuo decrescente
        parts.sort((a, b) => b.budgetResiduo - a.budgetResiduo);
        setParticipants(parts);
      }
    );
    return unsub;
  }, [sessionId]);

  const handleExportCSV = async () => {
    if (!isBanditore) return;
    setExporting(true);
    try {
      const rows: string[] = [];
      for (const p of participants) {
        if (p.roster.length === 0) continue;
        rows.push("$,$,$");
        p.roster.forEach((player) => {
          rows.push(`${p.nickname},${player.playerId},${player.price}`);
        });
      }
      rows.push("$,$,$");

      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fanta-asta-rosters-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const getRoleColor = (role: string) => {
    if (role === "P" || role === "Por") return "text-yellow-400";
    if (["D", "Dc", "Dd", "Ds", "B", "E"].includes(role)) return "text-green-400";
    if (["C", "M", "T", "W"].includes(role)) return "text-blue-400";
    if (["A", "Pc"].includes(role)) return "text-[#ff3d71]";
    return "text-gray-400";
  };

  const totalSold = participants.reduce((s, p) => s + p.roster.length, 0);
  const totalSpent = participants.reduce(
    (s, p) => s + p.roster.reduce((rs, r) => rs + (r.price || 0), 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#05050f]">
      {/* Header */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="font-black text-[#00e5ff] tracking-tight text-xl">
            BUSTA CHIUSA
          </div>
          <div className="text-xs text-[#5a5a90] font-mono mt-0.5">
            {sessionData.code} · {sessionData.format} · {sessionData.budget} cr
          </div>
        </div>
        {isBanditore && (
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 text-sm"
          >
            <Download size={16} />
            {exporting ? "Esportazione..." : "Esporta rose CSV"}
          </button>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Titolo */}
        <div className="text-center py-6">
          <div className="text-4xl mb-3">🏆</div>
          <h1 className="text-3xl font-black text-white mb-1">Asta terminata!</h1>
          <p className="text-[#5a5a90]">
            {totalSold} calciatori venduti · {totalSpent} crediti totali spesi
          </p>
        </div>

        {/* Classifica budget residuo */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden">
          <div className="bg-[#111128] px-4 py-2.5 flex items-center gap-2 text-xs text-[#5a5a90] uppercase tracking-wider">
            <Trophy size={14} />
            Classifica budget residuo
          </div>
          {participants.map((p, i) => {
            const spent = p.roster.reduce((s, r) => s + (r.price || 0), 0);
            return (
              <div
                key={p.id}
                className={`px-4 py-3 flex items-center justify-between border-t border-[#111128] ${
                  i === 0 ? "bg-[#ffaa00]/5" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-black w-8 text-center ${
                      i === 0
                        ? "text-[#ffaa00]"
                        : i === 1
                        ? "text-[#5a5a90]"
                        : "text-[#3a3a60]"
                    }`}
                  >
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <div>
                    <div className="font-bold text-white">{p.nickname}</div>
                    <div className="text-xs text-[#5a5a90]">
                      {p.roster.length} giocatori · {spent} cr spesi
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#5a5a90] mb-0.5">Residuo</div>
                  <div className="font-mono font-black text-[#00e5ff] text-xl">
                    {p.budgetResiduo}
                    <span className="text-sm text-[#5a5a90] ml-1 font-normal">cr</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rose dettaglio */}
        <h2 className="text-lg font-bold text-[#5a5a90] uppercase tracking-wider">
          Rose finali
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {participants.map((p) => {
            const spent = p.roster.reduce((s, r) => s + (r.price || 0), 0);
            return (
              <div
                key={p.id}
                className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden"
              >
                {/* Card header */}
                <div className="p-4 border-b border-[#111128] flex items-center justify-between bg-[#111128]/30">
                  <div>
                    <div className="font-bold text-lg">{p.nickname}</div>
                    <div className="text-xs text-[#5a5a90]">
                      {p.roster.length} giocatori · {spent} cr spesi
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#5a5a90]">Residuo</div>
                    <div className="font-mono font-bold text-[#00e5ff] text-xl">
                      {p.budgetResiduo}
                    </div>
                  </div>
                </div>

                {/* Roster */}
                {p.roster.length === 0 ? (
                  <div className="p-4 text-center text-[#5a5a90] text-sm">
                    Rosa vuota
                  </div>
                ) : (
                  <div className="divide-y divide-[#111128]">
                    {p.roster.map((player) => (
                      <div
                        key={player.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-xs font-bold shrink-0 ${getRoleColor(player.role)}`}
                          >
                            {player.role}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {player.nome}
                            </div>
                            {format === "mantra" &&
                              player.roleRaw &&
                              player.roleRaw !== player.role && (
                                <div className="text-xs text-[#5a5a90]">
                                  {player.roleRaw}
                                </div>
                              )}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-[#00e5ff] shrink-0">
                          {player.price} cr
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Slot summary */}
                <div className="p-3 border-t border-[#111128] flex flex-wrap gap-1">
                  {roles.map((r) => {
                    const current = p.rosterCount?.[r] || 0;
                    const max = p.rosterLimits?.[r]?.max || 0;
                    const full = current >= max && max > 0;
                    return (
                      <span
                        key={r}
                        className={`text-xs px-1.5 py-0.5 rounded border ${
                          full
                            ? "border-green-500/50 text-green-400"
                            : current > 0
                            ? "border-[#00e5ff]/30 text-[#00e5ff]"
                            : "border-[#2a2a48] text-[#5a5a90]"
                        }`}
                      >
                        {r} {current}/{max}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
