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
import { Upload, Settings, Play, ChevronDown, ChevronUp } from "lucide-react";

export default function CreateSession() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [format, setFormat] = useState<"classic" | "mantra">("classic");
  const [budget, setBudget] = useState(500);
  const [timerDuration, setTimerDuration] = useState(30);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRosterConfig, setShowRosterConfig] = useState(false);

  const [limits, setLimits] = useState<Record<string, { min: number; max: number }>>(
    getDefaultRosterLimits("classic")
  );

  const handleFormatChange = (newFormat: "classic" | "mantra") => {
    setFormat(newFormat);
    setLimits(getDefaultRosterLimits(newFormat));
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) { setError("Carica il listone CSV"); return; }

    setLoading(true);
    setError("");

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const players = results.data as Record<string, string>[];
          if (players.length === 0) throw new Error("CSV vuoto o non valido");

          const keys = Object.keys(players[0]);
          const idKey = findKey(keys, ["id"]);
          const rKey = findKey(keys, ["r"]);
          const rmKey = findKey(keys, ["rm"]);
          const nomeKey = findKey(keys, ["nome"]);
          const squadraKey = findKey(keys, ["squadra"]);
          const qtKey = findKey(keys, ["qt.a", "qt"]);
          const qmKey = findKey(keys, ["qt.a m", "qm", "qt.am"]);
          const fvmKey = findKey(keys, ["fvm"]);

          if (!idKey || !nomeKey) throw new Error("CSV non valido: colonne Id e Nome obbligatorie");

          const code = generateCode();

          const sessionRef = await addDoc(collection(db, "sessions"), {
            status: "lobby",
            format,
            budget,
            timerDuration,
            code,
            banditorId: user.uid,
            rosterLimits: limits,
            createdAt: serverTimestamp(),
          });

          // Initial auction state
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

          // Batch import players (chunks of 400)
          const chunkSize = 400;
          for (let i = 0; i < players.length; i += chunkSize) {
            const chunk = players.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach((p) => {
              const pId = p[idKey!];
              if (!pId) return;
              const playerRef = doc(db, `sessions/${sessionRef.id}/players/${pId}`);
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

          navigate(`/session/${sessionRef.id}`);
        } catch (err: any) {
          setError(err.message);
          setLoading(false);
        }
      },
      error: (err) => {
        setError(`Errore parsing CSV: ${err.message}`);
        setLoading(false);
      },
    });
  };

  const roles = format === "classic" ? [...CLASSIC_ROLES] : [...MANTRA_ROLES];

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
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {roles.map((role) => (
                <div key={role} className="bg-[#111128] rounded-xl p-3">
                  <div className="text-center font-bold text-[#00e5ff] mb-2 text-sm">{role}</div>
                  <div className="flex flex-col gap-1">
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
                </div>
              ))}
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
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center gap-2">
              <Upload size={48} className="text-[#5a5a90]" />
              <span className="text-lg font-medium text-white">
                {csvFile ? csvFile.name : "Seleziona file CSV"}
              </span>
              <span className="text-sm text-[#5a5a90]">
                Scarica il listone da leghe.fantacalcio.it (formato CSV con ;)
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
