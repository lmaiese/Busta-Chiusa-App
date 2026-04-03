import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, writeBatch, doc, setDoc } from 'firebase/firestore';
import Papa from 'papaparse';
import { Upload, Settings, Play } from 'lucide-react';

export default function CreateSession() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [format, setFormat] = useState<'classic' | 'mantra'>('classic');
  const [budget, setBudget] = useState(500);
  const [timerDuration, setTimerDuration] = useState(30);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Default limits
  const [limits, setLimits] = useState({
    P: { min: 3, max: 3 },
    D: { min: 8, max: 8 },
    C: { min: 8, max: 8 },
    A: { min: 6, max: 6 }
  });

  if (!user) {
    return <div className="p-8 text-center">Accesso negato. Devi essere loggato come banditore.</div>;
  }

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      setError('Carica il listone CSV');
      return;
    }

    setLoading(true);
    setError('');

    try {
      Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const players = results.data as any[];
            if (players.length === 0) throw new Error('CSV vuoto');

            const code = generateCode();
            
            // Create session
            const sessionRef = await addDoc(collection(db, 'sessions'), {
              status: 'lobby',
              format,
              budget,
              timerDuration,
              code,
              banditorId: user.uid,
              createdAt: serverTimestamp(),
              rosterLimits: limits
            });

            // Set currentAuction state
            const stateRef = doc(db, `sessions/${sessionRef.id}/currentAuction/state`);
            await setDoc(stateRef, {
              status: 'idle',
              playerId: '',
              bidCount: 0,
              round: 1
            });

            // Find column keys (handling BOM and case variations)
            const firstRow = players[0];
            const keys = Object.keys(firstRow);
            const findKey = (possibleNames: string[]) => {
              return keys.find(k => possibleNames.includes(k.trim().toLowerCase().replace(/^\uFEFF/, ''))) || possibleNames[0];
            };

            const idKey = findKey(['id']);
            const rKey = findKey(['r']);
            const rmKey = findKey(['rm']);
            const nomeKey = findKey(['nome']);
            const squadraKey = findKey(['squadra']);
            const qtKey = findKey(['qt.a', 'qt']);
            const qmKey = findKey(['qt.a m', 'qm']);
            const fvmKey = findKey(['fvm']);

            // Batch write players in chunks of 400 (Firestore limit is 500)
            const chunkSize = 400;
            for (let i = 0; i < players.length; i += chunkSize) {
              const chunk = players.slice(i, i + chunkSize);
              const batch = writeBatch(db);
              
              chunk.forEach((p) => {
                const pId = p[idKey];
                if (!pId) return; // Skip invalid rows
                
                const playerRef = doc(db, `sessions/${sessionRef.id}/players/${pId}`);
                batch.set(playerRef, {
                  id: String(pId),
                  r: p[rKey] || '',
                  rm: p[rmKey] || '',
                  nome: p[nomeKey] || '',
                  squadra: p[squadraKey] || '',
                  qt: Number(p[qtKey]) || 1,
                  qm: Number(p[qmKey]) || 1,
                  fvm: Number(p[fvmKey]) || 1,
                  status: 'available',
                  soldTo: null,
                  soldPrice: null
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
        }
      });
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

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
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 border-b border-[#111128] pb-2">Impostazioni Generali</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">Formato</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'classic' | 'mantra')}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#00e5ff]"
              >
                <option value="classic">Classic</option>
                <option value="mantra">Mantra</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">Budget Iniziale</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                min={1}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#00e5ff]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">Timer Busta (secondi)</label>
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

        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold mb-4 border-b border-[#111128] pb-2 flex items-center gap-2">
            <Upload className="text-[#00e5ff]" size={20} />
            Carica Listone
          </h2>
          
          <div className="border-2 border-dashed border-[#5a5a90]/30 rounded-xl p-8 text-center hover:border-[#00e5ff]/50 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
              <Upload size={48} className="text-[#5a5a90] mb-4" />
              <span className="text-lg font-medium text-white mb-1">
                {csvFile ? csvFile.name : 'Seleziona file CSV'}
              </span>
              <span className="text-sm text-[#5a5a90]">
                Scarica il listone da LegheFantacalcio (formato CSV)
              </span>
            </label>
          </div>
        </div>

        {error && <div className="bg-[#ff3d71]/10 border border-[#ff3d71] text-[#ff3d71] p-4 rounded-lg">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-lg"
        >
          {loading ? 'Creazione in corso...' : 'Crea Sessione e Inizia'}
          {!loading && <Play size={24} />}
        </button>
      </form>
    </div>
  );
}
