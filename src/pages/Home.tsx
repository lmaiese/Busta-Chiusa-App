import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithGoogle,
  signInAsGuest,
  auth,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Gavel, User, ArrowRight, Loader } from 'lucide-react';

// ── Tipi ────────────────────────────────────────────────────────────────
type JoinStep = 'idle' | 'auth' | 'token' | 'searching';

const STEP_LABELS: Record<JoinStep, string> = {
  idle: '',
  auth: 'Autenticazione in corso...',
  token: 'Connessione a Firestore...',
  searching: 'Ricerca sessione...',
};

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Forza il refresh del token JWT e poi verifica che Firestore accetti
 * le query con backoff esponenziale.
 * Risolve quando Firestore risponde (anche con "not found" va bene),
 * rigetta solo se scadono tutti i tentativi.
 */
async function waitForFirestoreAuth(maxAttempts = 6): Promise<void> {
  // Prima: forza il refresh del token lato Firebase Auth
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      await currentUser.getIdToken(true);
    } catch {
      // Se fallisce il refresh non è fatale, proviamo comunque
    }
  }

  // Poi: verifica che Firestore accetti le richieste
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Una query innocua su sessions (anche vuota va bene)
      const probeQ = query(
        collection(db, 'sessions'),
        where('code', '==', '__probe__')
      );
      await getDocs(probeQ);
      return; // successo
    } catch (err: any) {
      const isPermission =
        err?.message?.includes('Missing or insufficient permissions') ||
        err?.code === 'permission-denied';

      if (!isPermission) {
        // Errore diverso da permission: auth ok, Firestore ok
        return;
      }

      if (attempt < maxAttempts - 1) {
        // Backoff esponenziale: 300ms, 600ms, 1200ms, 2400ms, …
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
      }
    }
  }

  throw new Error(
    'Impossibile connettersi. Controlla la connessione e riprova.'
  );
}

// ── Componente principale ─────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessionCode, setSessionCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [joinStep, setJoinStep] = useState<JoinStep>('idle');

  // ── Banditore login ──────────────────────────────────────────────────
  const handleBanditoreLogin = async () => {
    setError('');
    try {
      setLoading(true);
      await signInWithGoogle();
      navigate('/create');
    } catch (err: any) {
      // L'utente ha chiuso il popup — non è un vero errore
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError('Accesso Google fallito. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Join session ─────────────────────────────────────────────────────
  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = sessionCode.trim().toUpperCase();
    const nick = nickname.trim();

    // Validazione client-side
    if (code.length !== 6) {
      setError('Il codice deve essere di 6 caratteri.');
      return;
    }
    if (!nick) {
      setError('Inserisci il nome della tua squadra.');
      return;
    }

    setLoading(true);

    try {
      // Step 1 — Autenticazione anonima (solo se non già loggato)
      setJoinStep('auth');
      if (!auth.currentUser) {
        await signInAsGuest();
      }

      // Step 2 — Attesa token Firestore
      setJoinStep('token');
      await waitForFirestoreAuth();

      // Step 3 — Cerca la sessione per codice
      setJoinStep('searching');
      const q = query(
        collection(db, 'sessions'),
        where('code', '==', code)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('Sessione non trovata. Controlla il codice.');
        setLoading(false);
        setJoinStep('idle');
        return;
      }

      const sessionDoc = snapshot.docs[0];
      const sessionData = sessionDoc.data();

      if (sessionData.status === 'completed') {
        setError('Questa sessione è già terminata.');
        setLoading(false);
        setJoinStep('idle');
        return;
      }

      // Naviga — la registrazione del partecipante avviene in SessionRouter
      navigate(`/session/${sessionDoc.id}`, { state: { nickname: nick } });
    } catch (err: any) {
      console.error('Join session error:', err);
      // handleFirestoreError serializza in JSON — proviamo a deserializzare
      try {
        const parsed = JSON.parse(err.message);
        setError(parsed.error || 'Errore di connessione. Riprova.');
      } catch {
        setError(err.message || 'Errore di connessione. Riprova.');
      }
      setLoading(false);
      setJoinStep('idle');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  const codeComplete = sessionCode.length === 6;
  const canSubmit = codeComplete && nickname.trim().length > 0 && !loading;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Sfondo glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00e5ff]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Titolo */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#ffaa00]">
            BUSTA CHIUSA
          </h1>
          <p className="text-[#5a5a90] text-lg">
            L'asta silenziosa per il tuo fantacalcio
          </p>
        </div>

        {/* Card partecipante */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-2xl mb-6">
          <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
            <User className="text-[#00e5ff]" />
            Partecipa a un'asta
          </h2>

          <form onSubmit={handleJoinSession} className="space-y-4">
            {/* Codice sessione */}
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1.5">
                Codice Sessione
              </label>
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => {
                  // Accetta solo alfanumerici, max 6 chars, uppercase
                  const val = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6);
                  setSessionCode(val);
                  if (error) setError('');
                }}
                placeholder="AX47KZ"
                disabled={loading}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-xl px-4 py-3.5 text-white placeholder:text-[#2a2a48] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]/40 transition-all uppercase font-mono tracking-[0.3em] text-2xl text-center disabled:opacity-50"
              />
              {/* Indicatore caratteri */}
              {sessionCode.length > 0 && !codeComplete && (
                <p className="text-xs text-[#5a5a90] mt-1.5 text-center">
                  ancora {6 - sessionCode.length}{' '}
                  {6 - sessionCode.length === 1 ? 'carattere' : 'caratteri'}
                </p>
              )}
              {codeComplete && (
                <p className="text-xs text-green-400 mt-1.5 text-center">✓ Codice completo</p>
              )}
            </div>

            {/* Nome squadra */}
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1.5">
                Nome Squadra
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (error) setError('');
                }}
                placeholder="La tua squadra"
                disabled={loading}
                maxLength={30}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-xl px-4 py-3.5 text-white placeholder:text-[#2a2a48] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]/40 transition-all disabled:opacity-50"
              />
            </div>

            {/* Errore */}
            {error && (
              <div className="bg-[#ff3d71]/10 border border-[#ff3d71]/40 rounded-xl px-4 py-3">
                <p className="text-[#ff3d71] text-sm">{error}</p>
              </div>
            )}

            {/* Progress step */}
            {loading && joinStep !== 'idle' && (
              <div className="bg-[#00e5ff]/5 border border-[#00e5ff]/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <Loader
                  size={16}
                  className="text-[#00e5ff] animate-spin shrink-0"
                />
                <p className="text-[#00e5ff] text-sm">{STEP_LABELS[joinStep]}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? (
                <Loader size={20} className="animate-spin" />
              ) : (
                <>
                  Entra nell'asta <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Card banditore */}
        <div className="text-center">
          <p className="text-[#5a5a90] mb-4">Oppure gestisci una nuova asta</p>
          <button
            onClick={handleBanditoreLogin}
            disabled={loading}
            className="w-full bg-transparent border border-[#00e5ff]/30 hover:border-[#00e5ff] text-[#00e5ff] font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            <Gavel size={20} />
            Accedi come Banditore
          </button>
        </div>
      </div>
    </div>
  );
}
