import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, signInAsGuest, auth, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Gavel, User, ArrowRight } from 'lucide-react';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBanditoreLogin = async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
      navigate('/create');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!sessionCode || !nickname) {
      setError('Inserisci codice sessione e nickname');
      return;
    }

    try {
      setLoading(true);
      
      // Sign in anonymously if not already signed in BEFORE querying Firestore
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const cred = await signInAsGuest();
        currentUser = cred.user;
        // Wait for Firestore client to pick up the new auth token
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Find session by code
      const q = query(collection(db, 'sessions'), where('code', '==', sessionCode.toUpperCase()));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (err: any) {
        // If it's a permission error, it might be a race condition OR an invalid cached anonymous token.
        if (err.message && err.message.includes('Missing or insufficient permissions')) {
          console.log("Permission error. Retrying or refreshing auth...");
          
          // If we had a cached user, it might be invalid. Let's sign out and sign in again.
          if (auth.currentUser?.isAnonymous) {
            await auth.signOut();
            await signInAsGuest();
            await new Promise(resolve => setTimeout(resolve, 1500));
          } else {
            // Just a race condition, wait a bit
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          try {
            querySnapshot = await getDocs(q);
          } catch (retryErr) {
            handleFirestoreError(retryErr, OperationType.LIST, 'sessions');
            return;
          }
        } else {
          handleFirestoreError(err, OperationType.LIST, 'sessions');
          return;
        }
      }
      
      if (querySnapshot.empty) {
        setError('Sessione non trovata');
        setLoading(false);
        return;
      }

      const sessionDoc = querySnapshot.docs[0];
      
      navigate(`/session/${sessionDoc.id}`, { state: { nickname } });
    } catch (err: any) {
      console.error("Join session error:", err);
      // Try to parse the JSON error message if it's from handleFirestoreError
      try {
        const parsed = JSON.parse(err.message);
        setError(`Errore di permessi: ${parsed.error}`);
      } catch {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00e5ff]/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#ffaa00]">
            BUSTA CHIUSA
          </h1>
          <p className="text-[#5a5a90] text-lg">L'asta silenziosa per il tuo fantacalcio</p>
        </div>

        <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-2xl mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <User className="text-[#00e5ff]" />
            Partecipa a un'asta
          </h2>
          <form onSubmit={handleJoinSession} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">Codice Sessione</label>
              <input
                type="text"
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="Es. AX47KZ"
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-4 py-3 text-white placeholder:text-[#5a5a90] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] transition-all uppercase font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#5a5a90] mb-1">Nome Squadra</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="La tua squadra"
                className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-lg px-4 py-3 text-white placeholder:text-[#5a5a90] focus:outline-none focus:border-[#00e5ff] focus:ring-1 focus:ring-[#00e5ff] transition-all"
              />
            </div>
            {error && <p className="text-[#ff3d71] text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              Entra nell'asta <ArrowRight size={20} />
            </button>
          </form>
        </div>

        <div className="text-center">
          <p className="text-[#5a5a90] mb-4">Oppure gestisci una nuova asta</p>
          <button
            onClick={handleBanditoreLogin}
            disabled={loading}
            className="w-full bg-transparent border border-[#00e5ff]/30 hover:border-[#00e5ff] text-[#00e5ff] font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Gavel size={20} />
            Accedi come Banditore
          </button>
        </div>
      </div>
    </div>
  );
}
