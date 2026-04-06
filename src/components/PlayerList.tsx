import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db, startAuctionFn, parseMantraRoles } from "../firebase";
import { useSession } from "../pages/SessionRouter";
import { Search, Play, Loader } from "lucide-react";

type SortMode = "fvm" | "role" | "nome" | "random";

export default function PlayerList({ isBanditore }: { isBanditore: boolean }) {
  const { sessionId, sessionData } = useSession();
  const [players, setPlayers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("fvm");
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `sessions/${sessionId}/players`), (snapshot) => {
      const p = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPlayers(p);
    });
    return unsub;
  }, [sessionId]);

  const handleStartAuction = async (player: any) => {
    if (!isBanditore || starting) return;
    setStarting(player.id);
    setError("");
    try {
      await startAuctionFn({ sessionId, playerId: player.id, round: 1 });
    } catch (e: any) {
      setError(e.message || "Errore avvio asta");
    } finally {
      setStarting(null);
    }
  };

  const format = sessionData.format as "classic" | "mantra";
  const roles =
    format === "classic"
      ? ["P", "D", "C", "A"]
      : ["Por", "Dc", "Dd", "Ds", "B", "E", "M", "C", "T", "W", "A", "Pc"];

  const matchesRole = (p: any) => {
    if (filterRole === "ALL") return true;
    if (format === "classic") return p.r === filterRole;
    return parseMantraRoles(p.rm || "").includes(filterRole);
  };

  const filteredPlayers = players
    .filter((p) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        (p.nome || "").toLowerCase().includes(term) ||
        (p.squadra || "").toLowerCase().includes(term);
      return matchesSearch && matchesRole(p);
    })
    .sort((a, b) => {
      if (sortMode === "fvm") return (b.fvm || 0) - (a.fvm || 0);
      if (sortMode === "nome") return (a.nome || "").localeCompare(b.nome || "");
      if (sortMode === "role") {
        const ra = format === "classic" ? a.r : parseMantraRoles(a.rm || "")[0] || "";
        const rb = format === "classic" ? b.r : parseMantraRoles(b.rm || "")[0] || "";
        return ra.localeCompare(rb);
      }
      return 0; // random: keep original order
    });

  const getRoleColor = (role: string) => {
    if (role === "P" || role === "Por") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
    if (["D", "Dc", "Dd", "Ds", "B", "E"].includes(role)) return "bg-green-500/20 text-green-400 border-green-500/40";
    if (["C", "M", "T", "W"].includes(role)) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
    if (["A", "Pc"].includes(role)) return "bg-red-500/20 text-red-400 border-red-500/40";
    return "bg-gray-500/20 text-gray-400 border-gray-500/40";
  };

  const displayRole = (p: any) => (format === "classic" ? p.r : p.rm || p.r || "");
  const displayQt = (p: any) => (format === "classic" ? p.qt : p.qm) || 1;

  const availableCount = players.filter((p) => p.status === "available").length;
  const soldCount = players.filter((p) => p.status === "sold").length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-[#ff3d71]/10 border border-[#ff3d71] text-[#ff3d71] p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="flex gap-4 text-sm text-[#5a5a90]">
        <span>{availableCount} disponibili</span>
        <span>•</span>
        <span>{soldCount} venduti</span>
        <span>•</span>
        <span>{players.length} totali</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a5a90]" size={18} />
          <input
            type="text"
            placeholder="Cerca calciatore o squadra..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder:text-[#5a5a90] focus:outline-none focus:border-[#00e5ff]"
          />
        </div>

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="bg-[#111128] border border-[#5a5a90]/30 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-[#00e5ff] text-sm"
        >
          <option value="fvm">Ordina: Valore</option>
          <option value="nome">Ordina: Nome</option>
          <option value="role">Ordina: Ruolo</option>
          <option value="random">Ordina: Casuale</option>
        </select>
      </div>

      {/* Role filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterRole("ALL")}
          className={`px-3 py-1.5 rounded-lg font-bold border whitespace-nowrap text-sm transition-colors ${
            filterRole === "ALL"
              ? "bg-[#00e5ff] text-[#05050f] border-[#00e5ff]"
              : "bg-[#111128] text-[#5a5a90] border-[#5a5a90]/30"
          }`}
        >
          Tutti
        </button>
        {roles.map((r) => (
          <button
            key={r}
            onClick={() => setFilterRole(r)}
            className={`px-3 py-1.5 rounded-lg font-bold border whitespace-nowrap text-sm transition-colors ${
              filterRole === r
                ? "bg-[#00e5ff] text-[#05050f] border-[#00e5ff]"
                : "bg-[#111128] text-[#5a5a90] border-[#5a5a90]/30"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="space-y-2">
        {filteredPlayers.map((p) => {
          const isSold = p.status === "sold";
          const isStarting = starting === p.id;
          const roleDisplay = displayRole(p);
          const primaryRole = format === "classic" ? p.r : parseMantraRoles(p.rm || "")[0] || p.r || "";

          return (
            <div
              key={p.id}
              className={`bg-[#0b0b1c] border rounded-xl px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                isSold
                  ? "border-[#111128] opacity-40"
                  : "border-[#111128] hover:border-[#00e5ff]/30"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded border shrink-0 ${getRoleColor(primaryRole)}`}
                >
                  {roleDisplay}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-base truncate">{p.nome}</div>
                  <div className="text-xs text-[#5a5a90]">
                    {p.squadra} · Qt {displayQt(p)} · FVM {p.fvm}
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                {isSold ? (
                  <div className="text-right">
                    <div className="text-xs text-[#5a5a90]">Venduto</div>
                    <div className="font-mono font-bold text-[#ff3d71] text-sm">{p.soldPrice} cr</div>
                  </div>
                ) : isBanditore ? (
                  <button
                    onClick={() => handleStartAuction(p)}
                    disabled={!!starting}
                    className="w-10 h-10 rounded-full bg-[#00e5ff]/10 text-[#00e5ff] flex items-center justify-center hover:bg-[#00e5ff] hover:text-[#05050f] transition-colors disabled:opacity-50"
                  >
                    {isStarting ? (
                      <Loader size={18} className="animate-spin" />
                    ) : (
                      <Play size={18} className="ml-0.5" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {filteredPlayers.length === 0 && (
          <div className="text-center py-12 text-[#5a5a90]">Nessun calciatore trovato</div>
        )}
      </div>
    </div>
  );
}
