import React, { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "./SessionRouter";
import { Gavel, Users, Clock } from "lucide-react";

function useCountdown(timerEnd: any): number {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!timerEnd) { setSecondsLeft(0); return; }
    const endMs = timerEnd.toMillis ? timerEnd.toMillis() : timerEnd;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((endMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerEnd]);

  return secondsLeft;
}

export default function TvMode() {
  const { sessionId, sessionData } = useSession();
  const [auction, setAuction] = useState<any>(null);
  const [player, setPlayer] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [passes, setPasses] = useState<number>(0);

  const secondsLeft = useCountdown(auction?.timerEnd);

  // Listen to current auction state
  useEffect(() => {
    return onSnapshot(
      doc(db, `sessions/${sessionId}/currentAuction/state`),
      (snap) => { if (snap.exists()) setAuction(snap.data()); else setAuction(null); }
    );
  }, [sessionId]);

  // Fetch player data when playerId changes
  useEffect(() => {
    const pid = auction?.playerId;
    if (!pid) { setPlayer(null); return; }
    return onSnapshot(
      doc(db, `sessions/${sessionId}/players/${pid}`),
      (snap) => { if (snap.exists()) setPlayer({ id: snap.id, ...snap.data() }); }
    );
  }, [sessionId, auction?.playerId]);

  // Listen to participants
  useEffect(() => {
    return onSnapshot(
      collection(db, `sessions/${sessionId}/participants`),
      (snap) => setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);

  // Listen to passes count
  useEffect(() => {
    if (!auction?.playerId) { setPasses(0); return; }
    return onSnapshot(
      collection(db, `sessions/${sessionId}/currentAuction/state/passes`),
      (snap) => setPasses(snap.size)
    );
  }, [sessionId, auction?.playerId]);

  const isActive =
    auction?.status === "open" || auction?.status === "tiebreak";
  const isRevealed = auction?.status === "revealed";
  const bidCount = auction?.bidCount || 0;
  const inAttesa = Math.max(0, participants.length - bidCount - passes);
  const sessionName = sessionData.sessionName || sessionData.code;

  return (
    <div className="min-h-screen bg-[#05050f] flex flex-col select-none">
      {/* Header */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-black text-[#00e5ff] tracking-tight text-2xl">BC</span>
          <span className="text-[#5a5a90] font-mono text-sm">· {sessionName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#5a5a90] border border-[#111128] rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] animate-pulse" />
          TV Mode
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {isActive && player ? (
          <ActiveView
            player={player}
            auction={auction}
            secondsLeft={secondsLeft}
            timerDuration={sessionData.timerDuration || 30}
            bidCount={bidCount}
            passesCount={passes}
            inAttesa={inAttesa}
            participantsCount={participants.length}
            format={sessionData.format}
          />
        ) : isRevealed ? (
          <RevealedView auction={auction} player={player} participants={participants} />
        ) : (
          <IdleView sessionName={sessionName} />
        )}
      </div>
    </div>
  );
}

function getRoleColor(role: string) {
  if (role === "P" || role === "Por") return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
  if (["D", "Dc", "Dd", "Ds", "B"].includes(role)) return "text-green-400 border-green-500/40 bg-green-500/10";
  if (["E", "M", "C"].includes(role)) return "text-blue-400 border-blue-500/40 bg-blue-500/10";
  if (["T", "W"].includes(role)) return "text-purple-400 border-purple-500/40 bg-purple-500/10";
  if (["A", "Pc"].includes(role)) return "text-[#ff3d71] border-[#ff3d71]/40 bg-[#ff3d71]/10";
  return "text-gray-400 border-gray-500/40 bg-gray-500/10";
}

function parseRoles(player: any, format: string): string[] {
  if (format === "mantra") {
    const roles = (player.rm || "").split("/").map((r: string) => r.trim()).filter(Boolean);
    return roles.length > 0 ? roles : player.r ? [player.r] : [];
  }
  return player.r ? [player.r] : [];
}

function ActiveView({
  player,
  auction,
  secondsLeft,
  timerDuration,
  bidCount,
  passesCount,
  inAttesa,
  participantsCount,
  format,
}: {
  player: any;
  auction: any;
  secondsLeft: number;
  timerDuration: number;
  bidCount: number;
  passesCount: number;
  inAttesa: number;
  participantsCount: number;
  format: string;
}) {
  const roles = parseRoles(player, format);
  const isTiebreak = auction?.status === "tiebreak";
  const round = auction?.round || 1;
  const pct = participantsCount > 0 ? ((bidCount + passesCount) / participantsCount) * 100 : 0;
  const timerPct = secondsLeft > 0 ? Math.min(100, (secondsLeft / timerDuration) * 100) : 0;
  const timerColor =
    secondsLeft > 20 ? "#00e5ff" : secondsLeft > 10 ? "#ffaa00" : "#ff3d71";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8">
      {/* Status badge */}
      <div className="flex justify-center">
        {isTiebreak ? (
          <span className="bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/40 rounded-full px-5 py-1.5 text-sm font-bold tracking-wider uppercase">
            Spareggio · Round {round}
          </span>
        ) : (
          <span className="bg-[#ff3d71]/10 text-[#ff3d71] border border-[#ff3d71]/40 rounded-full px-5 py-1.5 text-sm font-bold tracking-wider uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#ff3d71] animate-pulse" />
            Busta aperta
          </span>
        )}
      </div>

      {/* Player card */}
      <div className="bg-[#0b0b1c] border border-[#111128] rounded-3xl p-8 text-center">
        {/* Role badges */}
        <div className="flex justify-center gap-2 mb-5">
          {roles.map((r) => (
            <span
              key={r}
              className={`text-lg font-black px-4 py-1 rounded-xl border ${getRoleColor(r)}`}
            >
              {r}
            </span>
          ))}
        </div>

        {/* Player name */}
        <h1 className="text-5xl md:text-7xl font-black text-white mb-3 tracking-tight leading-none">
          {player.nome}
        </h1>

        {/* Team + FVM */}
        <div className="text-[#5a5a90] text-xl mt-2 font-mono">
          {player.squadra}
          {player.fvm ? (
            <span className="ml-3 text-[#00e5ff]/70">FVM {player.fvm}</span>
          ) : null}
        </div>
      </div>

      {/* Timer */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-[#5a5a90]">
            <Clock size={14} />
            Tempo rimasto
          </div>
          <span
            className="font-mono font-black text-2xl"
            style={{ color: timerColor }}
          >
            {secondsLeft}s
          </span>
        </div>
        <div className="h-2 bg-[#111128] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
          />
        </div>
      </div>

      {/* Bid / pass counters */}
      <div className="grid grid-cols-3 gap-4">
        <CounterBox label="Offerte" value={bidCount} color="#00e5ff" />
        <CounterBox label="Non partecipo" value={passesCount} color="#5a5a90" />
        <CounterBox label="In attesa" value={inAttesa} color="#ffaa00" />
      </div>

      {/* Progress bar all chosen */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-[#5a5a90]">
          <span>Scelte effettuate</span>
          <span>{bidCount + passesCount}/{participantsCount}</span>
        </div>
        <div className="h-1.5 bg-[#111128] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#00e5ff] rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function CounterBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-4 text-center">
      <div className="text-4xl font-black mb-1" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-[#5a5a90] uppercase tracking-wider">{label}</div>
    </div>
  );
}

function RevealedView({
  auction,
  player,
  participants,
}: {
  auction: any;
  player: any;
  participants: any[];
}) {
  const winner = participants.find((p) => p.id === auction?.winnerId);
  const nickname = winner?.nickname || auction?.winnerNickname || "—";
  const price = auction?.price;
  const playerNome = player?.nome || "?";

  return (
    <div className="text-center space-y-6 max-w-lg mx-auto">
      <div className="text-6xl">🏅</div>
      <h2 className="text-3xl font-black text-white">{playerNome}</h2>
      <div className="bg-[#0b0b1c] border border-[#00e5ff]/30 rounded-2xl px-8 py-6">
        <div className="text-[#5a5a90] text-sm uppercase tracking-widest mb-2">Aggiudicato a</div>
        <div className="text-4xl font-black text-white mb-4">{nickname}</div>
        <div className="text-6xl font-black text-[#00e5ff] font-mono">
          {price}
          <span className="text-2xl text-[#5a5a90] ml-2 font-normal">cr</span>
        </div>
      </div>
    </div>
  );
}

function IdleView({ sessionName }: { sessionName: string }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-24 h-24 rounded-full bg-[#111128] flex items-center justify-center mx-auto">
        <Gavel size={48} className="text-[#5a5a90]" />
      </div>
      <div>
        <h1 className="text-4xl font-black text-white mb-2">{sessionName}</h1>
        <p className="text-[#5a5a90] text-lg">In attesa dell'avvio busta...</p>
      </div>
      <div className="flex items-center justify-center gap-2 text-[#5a5a90] text-sm">
        <Users size={16} />
        <span>TV Mode — sola lettura</span>
      </div>
    </div>
  );
}
