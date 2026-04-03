import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from './SessionRouter';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Users, Play, Copy, Check } from 'lucide-react';

export default function Lobby() {
  const { sessionId, sessionData, isBanditore } = useSession();
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `sessions/${sessionId}/participants`), (snapshot) => {
      const parts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setParticipants(parts);
    }, (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `sessions/${sessionId}/participants`);
      } catch (e: any) {
        try {
          const parsed = JSON.parse(e.message);
          setError(`Errore di permessi: ${parsed.error}`);
        } catch {
          setError(e.message);
        }
      }
    });
    return unsub;
  }, [sessionId]);

  // Listen for session status change to navigate to auction
  useEffect(() => {
    if (sessionData.status === 'open' || sessionData.status === 'auctioning') {
      navigate(`/session/${sessionId}/auction`);
    }
  }, [sessionData.status, navigate, sessionId]);

  const handleStartAuction = async () => {
    if (!isBanditore) return;
    await updateDoc(doc(db, 'sessions', sessionId), {
      status: 'auctioning'
    }).catch(err => {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `sessions/${sessionId}`);
      } catch (e: any) {
        try {
          const parsed = JSON.parse(e.message);
          setError(`Errore avvio: ${parsed.error}`);
        } catch {
          setError(e.message);
        }
      }
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(sessionData.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto flex flex-col items-center justify-center">
      {error && <div className="w-full bg-[#ff3d71]/10 border border-[#ff3d71] text-[#ff3d71] p-4 rounded-lg mb-4">{error}</div>}
      <div className="text-center mb-12">
        <h2 className="text-[#5a5a90] text-lg mb-2 uppercase tracking-widest">Codice Sessione</h2>
        <div 
          onClick={copyCode}
          className="text-6xl md:text-8xl font-black tracking-widest text-[#00e5ff] cursor-pointer flex items-center justify-center gap-4 hover:scale-105 transition-transform"
        >
          {sessionData.code}
          {copied ? <Check size={40} className="text-green-400" /> : <Copy size={40} className="text-[#5a5a90] opacity-50" />}
        </div>
        <p className="text-[#5a5a90] mt-4">Condividi questo codice con i partecipanti</p>
      </div>

      <div className="w-full bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 shadow-xl mb-8">
        <div className="flex items-center justify-between mb-6 border-b border-[#111128] pb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Users className="text-[#00e5ff]" />
            Partecipanti Connessi
          </h3>
          <span className="bg-[#111128] text-[#00e5ff] px-3 py-1 rounded-full font-mono font-bold">
            {participants.length}
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="text-center py-8 text-[#5a5a90]">
            In attesa dei partecipanti...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {participants.map(p => (
              <div key={p.id} className="bg-[#111128] p-4 rounded-xl flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                <span className="font-bold text-lg truncate">{p.nickname}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isBanditore ? (
        <button
          onClick={handleStartAuction}
          disabled={participants.length < 2}
          className="w-full max-w-md bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-xl"
        >
          <Play size={24} />
          Inizia Asta
        </button>
      ) : (
        <div className="text-center text-[#5a5a90] animate-pulse text-lg">
          In attesa che il banditore avvii l'asta...
        </div>
      )}
    </div>
  );
}
