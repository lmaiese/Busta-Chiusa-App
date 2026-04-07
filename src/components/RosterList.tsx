import React, { useEffect, useState } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db, parseMantraRoles } from "../firebase";
import { useSession } from "../pages/SessionRouter";
import { Download } from "lucide-react";

function getRoleBadgeColor(role: string): string {
  if (role === "P" || role === "Por") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  if (["D", "Dc", "Dd", "Ds", "B"].includes(role)) return "bg-green-500/20 text-green-400 border-green-500/40";
  if (["E", "M", "C"].includes(role)) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  if (["T", "W"].includes(role)) return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  if (["A", "Pc"].includes(role)) return "bg-red-500/20 text-red-400 border-red-500/40";
  return "bg-gray-500/20 text-gray-400 border-gray-500/40";
}


export default function RosterList() {
  const { sessionId, isBanditore, sessionData } = useSession();
  const [participants, setParticipants] = useState<any[]>([]);
  const [rosters, setRosters] = useState<Record<string, any[]>>({});
  const [exporting, setExporting] = useState(false);

  const format = sessionData.format as "classic" | "mantra";

  // Real-time participants (sorted by budget descending)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, `sessions/${sessionId}/participants`), (snap) => {
      const parts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => b.budgetResiduo - a.budgetResiduo);
      setParticipants(parts);
    });
    return unsub;
  }, [sessionId]);

  // Fetch rosters for each participant
  useEffect(() => {
    if (participants.length === 0) return;
    const unsubs: (() => void)[] = [];

    participants.forEach((p) => {
      const unsub = onSnapshot(
        collection(db, `sessions/${sessionId}/participants/${p.id}/roster`),
        (snap) => {
          const players = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (a.role || "").localeCompare(b.role || ""));
          setRosters((prev) => ({ ...prev, [p.id]: players }));
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [sessionId, participants]);

  const handleExportCSV = async () => {
    if (!isBanditore) return;
    setExporting(true);
    try {
      // Collect all roster entries per participant
      const csvBlocks: string[] = [];

      for (const p of participants) {
        const rosterSnap = await getDocs(
          collection(db, `sessions/${sessionId}/participants/${p.id}/roster`)
        );
        if (rosterSnap.empty) continue;

        csvBlocks.push(`# ${p.nickname}`);
        csvBlocks.push("Id;Crediti");
        rosterSnap.docs.forEach((d) => {
          const data = d.data();
          csvBlocks.push(`${data.playerId};${data.price}`);
        });
        csvBlocks.push("");
      }

      const blob = new Blob([csvBlocks.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `rose_${sessionData.code}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  // Parse all roles from roleRaw (mantra) or role (classic) for badge display
  const getRosterPlayerBadges = (player: any): string[] => {
    if (format === "classic") return player.role ? [player.role] : [];
    const raw = parseMantraRoles(player.roleRaw || player.role || "");
    return raw.length > 0 ? raw : player.role ? [player.role] : [];
  };

  const roles =
    format === "classic"
      ? ["P", "D", "C", "A"]
      : ["Por", "Dc", "Dd", "Ds", "B", "E", "M", "C", "T", "W", "A", "Pc"];

  return (
    <div className="space-y-6">
      {isBanditore && (
        <div className="flex justify-end">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="bg-[#111128] hover:bg-[#111128]/80 text-[#00e5ff] border border-[#00e5ff]/30 hover:border-[#00e5ff] font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Download size={18} />
            {exporting ? "Esportazione..." : "Esporta rose (CSV)"}
          </button>
        </div>
      )}

      {/* Classifica budget */}
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden">
        <div className="bg-[#111128] px-4 py-2 text-xs text-[#5a5a90] uppercase tracking-wider">
          Classifica budget residuo
        </div>
        {participants.map((p, i) => (
          <div
            key={p.id}
            className="px-4 py-3 flex items-center justify-between border-t border-[#111128]"
          >
            <div className="flex items-center gap-3">
              <span className="text-[#5a5a90] text-sm w-6">{i + 1}</span>
              <span className="font-bold">{p.nickname}</span>
              <div className="hidden md:flex gap-1">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="text-xs text-[#5a5a90] border border-[#2a2a48] rounded px-1"
                  >
                    {r}:{p.rosterCount?.[r] || 0}/{p.rosterLimits?.[r]?.max || "–"}
                  </span>
                ))}
              </div>
            </div>
            <span className="font-mono font-bold text-[#00e5ff] text-lg">
              {p.budgetResiduo} cr
            </span>
          </div>
        ))}
      </div>

      {/* Rose dettaglio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {participants.map((p) => {
          const roster = rosters[p.id] || [];
          const totalSpent = roster.reduce((sum: number, pl: any) => sum + (pl.price || 0), 0);

          return (
            <div key={p.id} className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#111128] flex items-center justify-between bg-[#111128]/30">
                <div>
                  <div className="font-bold text-lg">{p.nickname}</div>
                  <div className="text-xs text-[#5a5a90]">
                    {roster.length} giocatori · {totalSpent} cr spesi
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#5a5a90]">Residuo</div>
                  <div className="font-mono font-bold text-[#00e5ff] text-xl">{p.budgetResiduo}</div>
                </div>
              </div>

              {roster.length === 0 ? (
                <div className="p-4 text-center text-[#5a5a90] text-sm">Rosa vuota</div>
              ) : (
                <div className="divide-y divide-[#111128]">
                  {roster.map((player: any) => {
                    const badges = getRosterPlayerBadges(player);
                    return (
                      <div key={player.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex gap-1 shrink-0 flex-wrap">
                            {badges.map((r) => (
                              <span
                                key={r}
                                className={`text-xs font-bold px-1.5 py-0.5 rounded border ${getRoleBadgeColor(r)}`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{player.nome}</div>
                          </div>
                        </div>
                        <span className="font-mono text-sm text-[#00e5ff] shrink-0">
                          {player.price} cr
                        </span>
                      </div>
                    );
                  })}
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
                          ? "border-[#ff3d71]/50 text-[#ff3d71]"
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
  );
}
