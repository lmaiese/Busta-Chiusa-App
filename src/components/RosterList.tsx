import React, { useEffect, useState } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db, parseMantraRoles, designateUnderFn } from "../firebase";
import { useSession } from "../pages/SessionRouter";
import { Download, Image } from "lucide-react";

function getRoleBadgeColor(role: string): string {
  if (role === "P" || role === "Por") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/40";
  if (["D", "Dc", "Dd", "Ds", "B"].includes(role)) return "bg-green-500/20 text-green-400 border-green-500/40";
  if (["E", "M", "C"].includes(role)) return "bg-blue-500/20 text-blue-400 border-blue-500/40";
  if (["T", "W"].includes(role)) return "bg-purple-500/20 text-purple-400 border-purple-500/40";
  if (["A", "Pc"].includes(role)) return "bg-red-500/20 text-red-400 border-red-500/40";
  return "bg-gray-500/20 text-gray-400 border-gray-500/40";
}


function roleCanvasColor(role: string): { bg: string; fg: string } {
  if (role === "P" || role === "Por") return { bg: "rgba(234,179,8,0.25)", fg: "#fbbf24" };
  if (["D", "Dc", "Dd", "Ds", "B"].includes(role)) return { bg: "rgba(34,197,94,0.2)", fg: "#4ade80" };
  if (["E", "M", "C"].includes(role))               return { bg: "rgba(59,130,246,0.2)", fg: "#60a5fa" };
  if (["T", "W"].includes(role))                    return { bg: "rgba(168,85,247,0.2)", fg: "#c084fc" };
  if (["A", "Pc"].includes(role))                   return { bg: "rgba(255,61,113,0.2)", fg: "#ff3d71" };
  return { bg: "rgba(100,100,150,0.2)", fg: "#9ca3af" };
}

function downloadRosterPNG(
  nickname: string,
  budgetResiduo: number,
  roster: any[],
  roles: string[],
  rosterCount: Record<string, number>,
  rosterLimits: Record<string, { min: number; max: number }>,
  sessionCode: string,
  format: "classic" | "mantra",
  totalRosterSize: number
) {
  const dpr   = Math.min(window.devicePixelRatio || 1, 2);
  const W     = 540;
  const PAD   = 20;
  const HDR   = 86;
  const ROW   = 40;
  // Classic: una riga con 4 slot. Mantra: una riga con totale + Por.
  const FTR   = 52;
  const H     = PAD + HDR + roster.length * ROW + FTR + PAD;

  const canvas = document.createElement("canvas");
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const SYS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const MONO = "'Courier New', monospace";

  function rr(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Outer bg
  ctx.fillStyle = "#05050f";
  ctx.fillRect(0, 0, W, H);

  // Card (clipped)
  ctx.save();
  rr(PAD, PAD, W - PAD * 2, H - PAD * 2, 14);
  ctx.fillStyle = "#0b0b1c";
  ctx.fill();
  ctx.clip();

  // Header
  ctx.fillStyle = "#111128";
  ctx.fillRect(PAD, PAD, W - PAD * 2, HDR);

  ctx.fillStyle = "#e8e8ff";
  ctx.font = `bold 20px ${SYS}`;
  ctx.fillText(nickname, PAD + 16, PAD + 30);

  ctx.fillStyle = "#00e5ff";
  ctx.font = `bold 18px ${MONO}`;
  const budStr = `${budgetResiduo} cr`;
  ctx.fillText(budStr, W - PAD - ctx.measureText(budStr).width - 16, PAD + 30);

  const spent = roster.reduce((s: number, p: any) => s + (p.price || 0), 0);
  ctx.fillStyle = "#5a5a90";
  ctx.font = `11px ${SYS}`;
  ctx.fillText(`${roster.length} giocatori · ${spent} cr spesi · ${sessionCode}`, PAD + 16, PAD + 58);

  // Header divider
  ctx.fillStyle = "#0b0b1c";
  ctx.fillRect(PAD, PAD + HDR, W - PAD * 2, 1);

  // Rows
  const sortedRoster = [...roster].sort((a: any, b: any) => (a.role || "").localeCompare(b.role || ""));
  sortedRoster.forEach((player: any, i: number) => {
    const ry = PAD + HDR + i * ROW;
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.015)";
      ctx.fillRect(PAD, ry, W - PAD * 2, ROW);
    }
    if (i > 0) {
      ctx.fillStyle = "#111128";
      ctx.fillRect(PAD + 14, ry, W - PAD * 2 - 28, 1);
    }
    const role = player.role || "";
    const { bg, fg } = roleCanvasColor(role);
    ctx.font = `bold 10px ${SYS}`;
    const bW = ctx.measureText(role).width + 10;
    const bH = 18; const bX = PAD + 14; const bY = ry + (ROW - bH) / 2;
    rr(bX, bY, bW, bH, 4); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg; ctx.fillText(role, bX + 5, bY + 12);

    let nameX = bX + bW + 10;
    if (player.isUnder) {
      // Under badge
      ctx.font = `bold 9px ${SYS}`;
      const uW = ctx.measureText("U").width + 8;
      rr(nameX, bY, uW, bH, 4);
      ctx.fillStyle = "rgba(255,170,0,0.2)"; ctx.fill();
      ctx.fillStyle = "#ffaa00";
      ctx.fillText("U", nameX + 4, bY + 12);
      nameX += uW + 6;
    }

    ctx.fillStyle = "#e8e8ff"; ctx.font = `13px ${SYS}`;
    ctx.fillText(player.nome || "", nameX, ry + ROW / 2 + 5);

    ctx.fillStyle = "#00e5ff"; ctx.font = `bold 13px ${MONO}`;
    const prStr = `${player.price} cr`;
    ctx.fillText(prStr, W - PAD - ctx.measureText(prStr).width - 14, ry + ROW / 2 + 5);
  });

  // Footer
  const fy = PAD + HDR + roster.length * ROW;
  ctx.fillStyle = "#111128";
  ctx.fillRect(PAD, fy, W - PAD * 2, FTR);

  ctx.font = `10px ${SYS}`;
  if (format === "classic") {
    // Classic: tutti e 4 i ruoli in una riga
    let sx = PAD + 14;
    const sy = fy + 16;
    roles.forEach((r) => {
      const current = rosterCount?.[r] || 0;
      const max = rosterLimits?.[r]?.max || 0;
      const full = max > 0 && current >= max;
      const slotStr = `${r} ${current}/${max}`;
      const sw = ctx.measureText(slotStr).width + 10;
      rr(sx, sy - 11, sw, 18, 4);
      ctx.fillStyle = full ? "rgba(34,197,94,0.15)" : current > 0 ? "rgba(0,229,255,0.1)" : "rgba(42,42,72,0.4)";
      ctx.fill();
      ctx.fillStyle = full ? "#4ade80" : current > 0 ? "#00e5ff" : "#5a5a90";
      ctx.fillText(slotStr, sx + 5, sy + 1);
      sx += sw + 8;
    });
  } else {
    // Mantra: totale e Por (unico ruolo con limite significativo)
    const total = Object.values(rosterCount || {}).reduce((s, v) => s + (v as number), 0);
    const porCount = rosterCount?.["Por"] || 0;
    const porMax = rosterLimits?.["Por"]?.max || 3;
    const totalFull = total >= totalRosterSize;
    const porFull = porCount >= porMax;
    const sy = fy + 16;
    let sx = PAD + 14;

    const badges = [
      { str: `Totale ${total}/${totalRosterSize}`, full: totalFull },
      { str: `Por ${porCount}/${porMax}`, full: porFull },
    ];
    badges.forEach(({ str, full }) => {
      const sw = ctx.measureText(str).width + 10;
      rr(sx, sy - 11, sw, 18, 4);
      ctx.fillStyle = full ? "rgba(34,197,94,0.15)" : total > 0 ? "rgba(0,229,255,0.1)" : "rgba(42,42,72,0.4)";
      ctx.fill();
      ctx.fillStyle = full ? "#4ade80" : total > 0 ? "#00e5ff" : "#5a5a90";
      ctx.fillText(str, sx + 5, sy + 1);
      sx += sw + 8;
    });
  }

  ctx.fillStyle = "#2a2a48"; ctx.font = `bold 9px ${SYS}`;
  ctx.fillText("BUSTA CHIUSA", W - PAD - ctx.measureText("BUSTA CHIUSA").width - 14, fy + FTR - 8);

  ctx.restore();

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${nickname.replace(/[^a-zA-Z0-9_-]/g, "_")}-rosa.png`;
  a.click();
}

export default function RosterList() {
  const { sessionId, isBanditore, participantId, sessionData } = useSession();
  const [participants, setParticipants] = useState<any[]>([]);
  const [rosters, setRosters] = useState<Record<string, any[]>>({});
  const [exporting, setExporting] = useState(false);
  const [togglingUnder, setTogglingUnder] = useState<string | null>(null); // playerId being toggled

  const format = sessionData.format as "classic" | "mantra";
  const underEnabled = sessionData.underEnabled === true;
  const underSlotsPerTeam: number = sessionData.underSlotsPerTeam || 0;

  const handleToggleUnder = async (participantId: string, playerId: string, currentIsUnder: boolean) => {
    if (togglingUnder) return;
    setTogglingUnder(playerId);
    try {
      await designateUnderFn({ sessionId, participantId, playerId, isUnder: !currentIsUnder });
    } catch (err: any) {
      alert(err?.message || "Errore nella designazione under");
    } finally {
      setTogglingUnder(null);
    }
  };

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
                <div className="flex items-center gap-3">
                  {(p.id === participantId || isBanditore) && roster.length > 0 && (
                    <button
                      onClick={() => downloadRosterPNG(
                        p.nickname, p.budgetResiduo, roster,
                        roles, p.rosterCount || {}, p.rosterLimits || {},
                        sessionData.code, format,
                        sessionData.totalRosterSize || 25
                      )}
                      className="text-[#5a5a90] hover:text-[#00e5ff] transition-colors p-1"
                      title="Scarica rosa PNG"
                    >
                      <Image size={16} />
                    </button>
                  )}
                  <div className="text-right">
                    <div className="text-xs text-[#5a5a90]">Residuo</div>
                    <div className="font-mono font-bold text-[#00e5ff] text-xl">{p.budgetResiduo}</div>
                  </div>
                </div>
              </div>

              {roster.length === 0 ? (
                <div className="p-4 text-center text-[#5a5a90] text-sm">Rosa vuota</div>
              ) : (
                <div className="divide-y divide-[#111128]">
                  {roster.map((player: any) => {
                    const badges = getRosterPlayerBadges(player);
                    const isUnder = player.isUnder === true;
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
                            {isUnder && (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded border border-[#ffaa00]/40 bg-[#ffaa00]/10 text-[#ffaa00]">
                                U
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{player.nome}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {underEnabled && isBanditore && (
                            <button
                              onClick={() => handleToggleUnder(p.id, player.id, isUnder)}
                              disabled={togglingUnder === player.id}
                              className={`text-xs px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50 ${
                                isUnder
                                  ? "border-[#ffaa00]/60 text-[#ffaa00] hover:bg-[#ffaa00]/10"
                                  : "border-[#2a2a48] text-[#5a5a90] hover:border-[#ffaa00]/40 hover:text-[#ffaa00]"
                              }`}
                              title={isUnder ? "Rimuovi designazione under" : "Designa come under"}
                            >
                              {togglingUnder === player.id ? "..." : isUnder ? "−U" : "+U"}
                            </button>
                          )}
                          <span className="font-mono text-sm text-[#00e5ff]">
                            {player.price} cr
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Slot summary */}
              <div className="p-3 border-t border-[#111128] flex flex-wrap gap-1">
                {roles.map((r) => {
                  const current = p.rosterCount?.[r] || 0;
                  const baseMax = p.rosterLimits?.[r]?.max || 0;
                  const freed = format === "classic" ? (p.underRoleFreed?.[r] || 0) : 0;
                  const effectiveMax = baseMax + freed;
                  const full = current >= effectiveMax && effectiveMax > 0;
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
                      {r} {current}/{effectiveMax}
                    </span>
                  );
                })}
                {underEnabled && (
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${
                    (p.underCount || 0) >= underSlotsPerTeam
                      ? "border-[#ffaa00]/60 text-[#ffaa00]"
                      : (p.underCount || 0) > 0
                      ? "border-[#ffaa00]/30 text-[#ffaa00]"
                      : "border-[#2a2a48] text-[#5a5a90]"
                  }`}>
                    U {p.underCount || 0}/{underSlotsPerTeam}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
