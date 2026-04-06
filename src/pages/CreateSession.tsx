import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { getDefaultRosterLimits, CLASSIC_ROLES, MANTRA_ROLES } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
  setDoc,
} from "firebase/firestore";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Upload, Settings, Play, ChevronDown, ChevronUp, Shuffle } from "lucide-react";

type AuctionMode = "manual" | "random-all" | "random-role";

export default function CreateSession() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [format, setFormat] = useState<"classic" | "mantra">("classic");
  const [budget, setBudget] = useState(500);
  const [timerDuration, setTimerDuration] = useState(30);
  const [playerFile, setPlayerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRosterConfig, setShowRosterConfig] = useState(false);

  // Auction mode
  const [auctionMode, setAuctionMode] = useState<AuctionMode>("manual");
  const [randomRole, setRandomRole] = useState<string>("P");

  // Roster limits
  const [limits, setLimits] = useState<Record<string, { min: number; max: number }>>(
    getDefaultRosterLimits("classic")
  );
  // Mantra only: total roster size per team
  const [totalRosterSize, setTotalRosterSize] = useState(25);

  const handleFormatChange = (newFormat: "classic" | "mantra") => {
    setFormat(newFormat);
    setLimits(getDefaultRosterLimits(newFormat));
    setRandomRole(newFormat === "classic" ? "P" : "Por");
  };

  const updateLimit = (role: string, field: "min" | "max", value: number) => {
    setLimits((prev) => ({ ...prev, [role]: { ...prev[role], [field]: value } }));
  };

  if (!user) {
    return (
      <div className="p-8 text-center text-[#ff3d71]">
        Accesso negato. Devi essere loggato come banditore.
      </div>
    );
  }

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  };

  const findKey = (keys: string[], possibleNames: string[]): string | undefined =>
    keys.find((k) =>
      possibleNames.includes(k.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/\uFEFF/g, ""))
    );

  const parseExcel = (file: File): Promise<Record<string, string>[]> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target!.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
          const headerRow = rows[1] as string[];
          const dataRows = rows.slice(2) as any[][];
          if (!headerRow || dataRows.length === 0) throw new Error("Excel vuoto o formato non riconosciuto");
          const records = dataRows.map((row) => {
            const obj: Record<string, string> = {};
            headerRow.forEach((h, i) => { obj[String(h)] = row[i] !== undefined ? String(row[i]) : ""; });
            return obj;
          });
          resolve(records);
        } catch (err: any) {
          reject(new Error(`Errore parsing Excel: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error("Errore lettura file"));
      reader.readAsArrayBuffer(file);
    });

  const importPlayers = async (players: Record<string, string>[], sessionId: string) => {
    const keys = Object.keys(players[0]);
    const idKey = findKey(keys, ["id"]);
    const rKey = findKey(keys, ["r"]);
    const rmKey = findKey(keys, ["rm"]);
    const nomeKey = findKey(keys, ["nome"]);
    const squadraKey = findKey(keys, ["squadra"]);
    const qtKey = findKey(keys, ["qt.a", "qt"]);
    const qmKey = findKey(keys, ["qt.a m", "qm", "qt.am"]);
    const fvmKey = findKey(keys, ["fvm"]);

    if (!idKey || !nomeKey) throw new Error("File non valido: colonne Id e Nome obbligatorie");

    const chunkSize = 400;
    for (let i = 0; i < players.length; i += chunkSize) {
      const chunk = players.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((p) => {
        const pId = p[idKey!];
        if (!pId) return;
        const playerRef = doc(db, `sessions/${sessionId}/players/${pId}`);
        batch.set(playerRef, {
          id: String(pId),
          r: p[rKey!] || "",
          rm: p[rmKey!] || "",
          nome: p[nomeKey!] || "",
          squadra: p[squadraKey!] || "",
          qt: Number(p[qtKey!]) || 1,
          qm: Number(p[qmKey!]) || 1,
          fvm: Number(p[fvmKey!]) || 1,
          status: "available",
          soldTo: null,
          soldPrice: null,
        });
      });
      await batch.commit();
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerFile) { setError("Carica il listone (CSV o Excel)"); return; }

    setLoading(true);
    setError("");

    try {
      const isExcel = playerFile.name.endsWith(".xlsx") || playerFile.name.endsWith(".xls");

      const players = isExcel
        ? await parseExcel(playerFile)
        : await new Promise<Record<string, string>[]>((resolve, reject) => {
            Papa.parse(playerFile, {
              header: true,
              delimiter: ";",
              skipEmptyLines: true,
              complete: (r) => resolve(r.data as Record<string, string>[]),
              error: (err) => reject(new Error(`Errore parsing CSV: ${err.message}`)),
            });
          });

      if (players.length === 0) throw new Error("File vuoto o non valido");

      // Build effective roster limits
      const effectiveLimits = format === "mantra"
        ? { ...getDefaultRosterLimits("mantra"), Por: limits["Por"] }
        : limits;

      const code = generateCode();
      const sessionRef = await addDoc(collection(db, "sessions"), {
        status: "lobby",
        format,
        budget,
        timerDuration,
        code,
        banditorId: user.uid,
        rosterLimits: effectiveLimits,
        totalRosterSize: format === "mantra" ? totalRosterSize : null,
        auctionMode,
        randomRole: auctionMode === "random-role" ? randomRole : null,
        randomQueue: [],
        createdAt: serverTimestamp(),
      });

      await setDoc(doc(db, `sessions/${sessionRef.id}/currentAuction/state`), {
        status: "idle",
        playerId: "",
        bidCount: 0,
        round: 1,
        tiebreakParticipants: null,
        allBids: [],
        winnerId: null,
        winnerNickname: null,
        price: null,
        wasRandom: false,
      });

      await importPlayers(players, sessionRef.id);
      navigate(`/session/${sessionRef.id}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const classicRoles = [...CLASSIC_ROLES];
  const mantraRoles = [...MANTRA_ROLES];

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="text-[#00e5ff]" />
          Crea Nuova Sessione
        </h1>
        <p className="text-[#5a5a90]">Configura l'asta e carica il listone</p>
      </div>

      <form onSubmit={handleCreate} className="space-y-6">

        {/* Impostazioni generali */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4 border-b border-[#111128] pb-2">
            Impostazioni generali
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">Formato</label>
              <div className="flex gap-2">
                {(["classic", "mantra"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => handleFormatChange(f)}
                    className={`flex-1 py-2 rounded-lg font-bold border transition-colors ${
                      format === f
                        ? "bg-[#00e5ff] text-[#05050f] border-[#00e5ff]"
                        : "bg-[#111128] text-[#5a5a90] border-[#5a5a90]/30"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">
                Budget iniziale (crediti)
              </label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                min={1}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#00e5ff]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">
                Durata timer busta (secondi)
              </label>
              <input
                type="number"
                value={timerDuration}
                onChange={(e) => setTimerDuration(Number(e.target.value))}
                min={10}
                max={120}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#00e5ff]"
              />
            </div>
          </div>
        </div>

        {/* Modalità asta */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4 border-b border-[#111128] pb-2 flex items-center gap-2">
            <Shuffle className="text-[#00e5ff]" size={20} />
            Modalità asta
          </h2>
          <div className="flex flex-col gap-3">
            {(
              [
                { value: "manual", label: "Manuale", desc: "Il banditore sceglie dal listone" },
                { value: "random-all", label: "Casuale — tutto il listone", desc: "I giocatori vengono estratti in ordine casuale" },
                { value: "random-role", label: "Casuale — per ruolo", desc: "Tutte le estrazioni provengono dal ruolo scelto" },
              ] as { value: AuctionMode; label: string; desc: string }[]
            ).map(({ value, label, desc }) => (
              <label
                key={value}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                  auctionMode === value
                    ? "border-[#00e5ff] bg-[#00e5ff]/5"
                    : "border-[#5a5a90]/30 hover:border-[#5a5a90]"
                }`}
              >
                <input
                  type="radio"
                  name="auctionMode"
                  value={value}
                  checked={auctionMode === value}
                  onChange={() => setAuctionMode(value)}
                  className="mt-0.5 accent-[#00e5ff]"
                />
                <div>
                  <div className="font-bold text-white">{label}</div>
                  <div className="text-sm text-[#5a5a90]">{desc}</div>
                </div>
              </label>
            ))}

            {auctionMode === "random-role" && (
              <div className="ml-4 mt-1">
                <label className="block text-sm font-medium text-[#5a5a90] mb-2">Ruolo da estrarre</label>
                <div className="flex flex-wrap gap-2">
                  {(format === "classic" ? classicRoles : mantraRoles).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRandomRole(r)}
                      className={`px-3 py-1.5 rounded-lg font-bold border text-sm transition-colors ${
                        randomRole === r
                          ? "bg-[#00e5ff] text-[#05050f] border-[#00e5ff]"
                          : "bg-[#111128] text-[#5a5a90] border-[#5a5a90]/30"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Configurazione rosa */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6">
          <button
            type="button"
            onClick={() => setShowRosterConfig(!showRosterConfig)}
            className="w-full flex items-center justify-between text-xl font-semibold"
          >
            <span>Configurazione rosa</span>
            {showRosterConfig ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {showRosterConfig && (
            <div className="mt-4 space-y-4">
              {format === "classic" ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {classicRoles.map((role) => (
                    <div key={role} className="bg-[#111128] rounded-xl p-3">
                      <div className="text-center font-bold text-[#00e5ff] mb-2 text-sm">{role}</div>
                      <label className="text-xs text-[#5a5a90]">Max slot</label>
                      <input
                        type="number"
                        value={limits[role]?.max ?? 0}
                        onChange={(e) => updateLimit(role, "max", Number(e.target.value))}
                        min={0}
                        max={30}
                        className="w-full bg-[#0b0b1c] border border-[#5a5a90]/30 rounded-lg px-2 py-1 text-white text-center text-sm focus:outline-none focus:border-[#00e5ff]"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Mantra: total size + only Por constraint */}
                  <div className="bg-[#111128] rounded-xl p-4">
                    <div className="font-bold text-[#00e5ff] mb-1">Dimensione rosa</div>
                    <div className="text-xs text-[#5a5a90] mb-2">Numero massimo di giocatori per squadra</div>
                    <input
                      type="number"
                      value={totalRosterSize}
                      onChange={(e) => setTotalRosterSize(Number(e.target.value))}
                      min={10}
                      max={50}
                      className="w-32 bg-[#0b0b1c] border border-[#5a5a90]/30 rounded-lg px-3 py-1.5 text-white text-center font-mono focus:outline-none focus:border-[#00e5ff]"
                    />
                  </div>
                  <div className="bg-[#111128] rounded-xl p-4">
                    <div className="font-bold text-[#00e5ff] mb-1">Portieri (Por)</div>
                    <div className="text-xs text-[#5a5a90] mb-3">Unico vincolo di ruolo in modalità Mantra</div>
                    <div className="flex gap-6">
                      <div>
                        <label className="text-xs text-[#5a5a90] block mb-1">Min</label>
                        <input
                          type="number"
                          value={limits["Por"]?.min ?? 2}
                          onChange={(e) => updateLimit("Por", "min", Number(e.target.value))}
                          min={0}
                          max={5}
                          className="w-20 bg-[#0b0b1c] border border-[#5a5a90]/30 rounded-lg px-2 py-1 text-white text-center text-sm focus:outline-none focus:border-[#00e5ff]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#5a5a90] block mb-1">Max</label>
                        <input
                          type="number"
                          value={limits["Por"]?.max ?? 3}
                          onChange={(e) => updateLimit("Por", "max", Number(e.target.value))}
                          min={1}
                          max={5}
                          className="w-20 bg-[#0b0b1c] border border-[#5a5a90]/30 rounded-lg px-2 py-1 text-white text-center text-sm focus:outline-none focus:border-[#00e5ff]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload listone */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4 border-b border-[#111128] pb-2 flex items-center gap-2">
            <Upload className="text-[#00e5ff]" size={20} />
            Carica listone
          </h2>
          <div className="border-2 border-dashed border-[#5a5a90]/30 rounded-xl p-8 text-center hover:border-[#00e5ff]/50 transition-colors">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setPlayerFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-2">
              <Upload size={48} className="text-[#5a5a90]" />
              <span className="text-lg font-medium text-white">
                {playerFile ? playerFile.name : "Seleziona file CSV o Excel"}
              </span>
              <span className="text-sm text-[#5a5a90]">
                Scarica il listone da leghe.fantacalcio.it (CSV con ; oppure Excel .xlsx)
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-[#ff3d71]/10 border border-[#ff3d71] text-[#ff3d71] p-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-lg"
        >
          {loading ? "Creazione in corso..." : "Crea sessione e inizia"}
          {!loading && <Play size={24} />}
        </button>
      </form>
    </div>
  );
}
