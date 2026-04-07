import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithGoogle,
  signInWithApple,
  signInWithMicrosoft,
  logOut,
  auth,
  db,
  loadSessionFromStorage,
  clearSessionFromStorage,
} from '../firebase';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Gavel, User, ArrowRight, Loader, LogOut, RotateCcw } from 'lucide-react';

type JoinStep = 'idle' | 'auth' | 'token' | 'searching';

const STEP_LABELS: Record<JoinStep, string> = {
  idle: '',
  auth: 'Autenticazione in corso...',
  token: 'Connessione a Firestore...',
  searching: 'Ricerca sessione...',
};

async function waitForFirestoreAuth(maxAttempts = 6): Promise<void> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try { await currentUser.getIdToken(true); } catch {}
  }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await getDocs(query(collection(db, 'sessions'), where('code', '==', '__probe__')));
      return;
    } catch (err: any) {
      const isPermission =
        err?.message?.includes('Missing or insufficient permissions') ||
        err?.code === 'permission-denied';
      if (!isPermission) return;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt)));
      }
    }
  }
  throw new Error('Impossibile connettersi. Controlla la connessione e riprova.');
}

// ── Provider button ───────────────────────────────────────────────────────
function ProviderButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 bg-[#111128] border border-[#5a5a90]/30 hover:border-[#00e5ff]/50 text-white font-semibold py-3 px-4 rounded-xl transition-all disabled:opacity-50 active:scale-[0.98]"
    >
      {icon}
      {label}
    </button>
  );
}

// ── Google SVG ────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 814 1000" fill="white">
    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-37.5-165.8-122.7C46.6 699.5 0 582.2 0 479.9 0 221.7 168.6 61.1 334.8 61.1c79.2 0 145.5 52.3 194.7 52.3 46.9 0 120.7-55.5 208-55.5zm-41.5-113.6c-1.3 0-2.6.1-3.9.1-35.9 0-83.3 20.7-124.8 57.9-37 33.4-67.6 85.4-67.6 144.6 0 8.1.9 16.1 2.3 23.9 4.8.3 9.7.6 14.6.6 33.7 0 77.8-18.4 113.7-52.3 37.9-35.6 62.7-87.4 62.7-146.5 0-8.8-.7-17.5-2.1-26.3z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21">
    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
  </svg>
);

// ── Main component ────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessionCode, setSessionCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [joinStep, setJoinStep] = useState<JoinStep>('idle');
  const [savedSession, setSavedSession] = useState<{ sessionId: string; sessionName: string; role: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);

  // Check for saved session on mount
  useEffect(() => {
    if (!user) return;
    const saved = loadSessionFromStorage();
    if (!saved) return;

    setCheckingSession(true);
    getDoc(doc(db, 'sessions', saved.sessionId))
      .then((snap) => {
        if (snap.exists() && snap.data().status !== 'completed') {
          setSavedSession(saved);
        } else {
          clearSessionFromStorage();
        }
      })
      .catch(() => clearSessionFromStorage())
      .finally(() => setCheckingSession(false));
  }, [user]);

  // ── Auth handlers ──────────────────────────────────────────────────────
  const handleLogin = async (provider: 'google' | 'apple' | 'microsoft') => {
    setError('');
    setLoading(true);
    try {
      if (provider === 'google') await signInWithGoogle();
      else if (provider === 'apple') await signInWithApple();
      else await signInWithMicrosoft();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        if (err?.code === 'auth/unauthorized-domain') {
          setError('Dominio non autorizzato. Verifica Firebase Console → Authentication → Authorized domains.');
        } else {
          setError(`Accesso fallito: ${err?.code || err?.message || 'errore sconosciuto'}`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Banditore ──────────────────────────────────────────────────────────
  const handleBanditoreClick = () => {
    if (user) {
      navigate('/create');
    }
  };

  // ── Recupera sessione ──────────────────────────────────────────────────
  const handleResumeSession = () => {
    if (!savedSession) return;
    navigate(`/session/${savedSession.sessionId}`, {
      state: savedSession.role === 'participant' ? { nickname: loadSessionFromStorage()?.nickname } : undefined,
    });
  };

  // ── Join session ───────────────────────────────────────────────────────
  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = sessionCode.trim().toUpperCase();
    const nick = nickname.trim();

    if (code.length !== 6) { setError('Il codice deve essere di 6 caratteri.'); return; }
    if (!nick) { setError('Inserisci il nome della tua squadra.'); return; }

    setLoading(true);
    try {
      setJoinStep('token');
      await waitForFirestoreAuth();

      setJoinStep('searching');
      const q = query(collection(db, 'sessions'), where('code', '==', code));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('Sessione non trovata. Controlla il codice.');
        return;
      }

      const sessionDoc = snapshot.docs[0];
      const sessionData = sessionDoc.data();

      if (sessionData.status === 'completed') {
        setError('Questa sessione è già terminata.');
        return;
      }

      navigate(`/session/${sessionDoc.id}`, { state: { nickname: nick } });
    } catch (err: any) {
      try {
        const parsed = JSON.parse(err.message);
        setError(parsed.error || 'Errore di connessione. Riprova.');
      } catch {
        setError(err.message || 'Errore di connessione. Riprova.');
      }
    } finally {
      setLoading(false);
      setJoinStep('idle');
    }
  };

  const codeComplete = sessionCode.length === 6;
  const canSubmit = codeComplete && nickname.trim().length > 0 && !loading;

  // ── NOT LOGGED IN — show login screen ─────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00e5ff]/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="w-full max-w-sm z-10">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#ffaa00]">
              BUSTA CHIUSA
            </h1>
            <p className="text-[#5a5a90] text-lg">L'asta silenziosa per il tuo fantacalcio</p>
          </div>

          <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-2xl space-y-3">
            <p className="text-sm text-[#5a5a90] text-center mb-4">
              Accedi per partecipare o gestire un'asta
            </p>
            <ProviderButton
              onClick={() => handleLogin('google')}
              disabled={loading}
              icon={<GoogleIcon />}
              label="Continua con Google"
            />
            <ProviderButton
              onClick={() => handleLogin('apple')}
              disabled={loading}
              icon={<AppleIcon />}
              label="Continua con Apple"
            />
            <ProviderButton
              onClick={() => handleLogin('microsoft')}
              disabled={loading}
              icon={<MicrosoftIcon />}
              label="Continua con Microsoft"
            />
            {error && (
              <div className="bg-[#ff3d71]/10 border border-[#ff3d71]/40 rounded-xl px-4 py-3 mt-2">
                <p className="text-[#ff3d71] text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── LOGGED IN — show main home ─────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00e5ff]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#ffaa00]">
            BUSTA CHIUSA
          </h1>
          <p className="text-[#5a5a90] text-sm">
            {user.displayName || user.email}
          </p>
        </div>

        {/* Session recovery banner */}
        {checkingSession && (
          <div className="bg-[#111128] border border-[#5a5a90]/30 rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
            <Loader size={16} className="text-[#00e5ff] animate-spin shrink-0" />
            <span className="text-[#5a5a90] text-sm">Verifica sessione precedente...</span>
          </div>
        )}
        {savedSession && !checkingSession && (
          <div className="bg-[#00e5ff]/5 border border-[#00e5ff]/30 rounded-2xl px-4 py-4 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#5a5a90] uppercase tracking-wider mb-0.5">Sessione in corso</p>
              <p className="font-bold text-white">{savedSession.sessionName}</p>
              <p className="text-xs text-[#5a5a90]">
                {savedSession.role === 'banditore' ? 'Banditore' : 'Partecipante'}
              </p>
            </div>
            <button
              onClick={handleResumeSession}
              className="flex items-center gap-2 bg-[#00e5ff] text-[#05050f] font-bold px-4 py-2 rounded-xl text-sm whitespace-nowrap hover:bg-[#00e5ff]/90 transition-colors"
            >
              <RotateCcw size={14} />
              Rientra
            </button>
          </div>
        )}

        {/* Join session card */}
        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-2xl mb-6">
          <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
            <User className="text-[#00e5ff]" />
            Partecipa a un'asta
          </h2>

          <form onSubmit={handleJoinSession} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1.5">
                Codice Sessione
              </label>
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => {
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
              {sessionCode.length > 0 && !codeComplete && (
                <p className="text-xs text-[#5a5a90] mt-1.5 text-center">
                  ancora {6 - sessionCode.length} {6 - sessionCode.length === 1 ? 'carattere' : 'caratteri'}
                </p>
              )}
              {codeComplete && (
                <p className="text-xs text-green-400 mt-1.5 text-center">✓ Codice completo</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1.5">
                Nome Squadra
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => { setNickname(e.target.value); if (error) setError(''); }}
                placeholder="La tua squadra"
                disabled={loading}
                maxLength={30}
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-xl px-4 py-3.5 text-white placeholder:text-[#2a2a48] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff]/40 transition-all disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="bg-[#ff3d71]/10 border border-[#ff3d71]/40 rounded-xl px-4 py-3">
                <p className="text-[#ff3d71] text-sm">{error}</p>
              </div>
            )}

            {loading && joinStep !== 'idle' && (
              <div className="bg-[#00e5ff]/5 border border-[#00e5ff]/20 rounded-xl px-4 py-3 flex items-center gap-3">
                <Loader size={16} className="text-[#00e5ff] animate-spin shrink-0" />
                <p className="text-[#00e5ff] text-sm">{STEP_LABELS[joinStep]}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? (
                <Loader size={20} className="animate-spin" />
              ) : (
                <>Entra nell'asta <ArrowRight size={20} /></>
              )}
            </button>
          </form>
        </div>

        {/* Banditore + logout row */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleBanditoreClick}
            disabled={loading}
            className="w-full bg-transparent border border-[#00e5ff]/30 hover:border-[#00e5ff] text-[#00e5ff] font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            <Gavel size={20} />
            Crea o gestisci un'asta
          </button>
          <button
            onClick={() => logOut()}
            className="w-full flex items-center justify-center gap-2 text-[#5a5a90] hover:text-white text-sm py-2 transition-colors"
          >
            <LogOut size={14} />
            Esci ({user.displayName || user.email})
          </button>
        </div>
      </div>
    </div>
  );
}
