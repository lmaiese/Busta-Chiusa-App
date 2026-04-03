import React, { useEffect, useState, useRef } from 'react';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useSession } from '../pages/SessionRouter';
import { X, Check } from 'lucide-react';

export default function ActiveAuction({ currentAuction }: { currentAuction: any }) {
  const { sessionId, isBanditore, participantId, sessionData } = useSession();
  const [player, setPlayer] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [myBid, setMyBid] = useState<number | null>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [participantData, setParticipantData] = useState<any>(null);
  
  const timerRef = useRef<any>(null);

  // Fetch player data
  useEffect(() => {
    if (!currentAuction?.playerId) return;
    getDoc(doc(db, `sessions/${sessionId}/players/${currentAuction.playerId}`)).then(doc => {
      if (doc.exists()) setPlayer({ id: doc.id, ...doc.data() });
    });
  }, [currentAuction?.playerId, sessionId]);

  // Fetch participant data
  useEffect(() => {
    if (!participantId) return;
    getDoc(doc(db, `sessions/${sessionId}/participants/${participantId}`)).then(doc => {
      if (doc.exists()) setParticipantData(doc.data());
    });
  }, [participantId, sessionId]);

  // Timer logic
  useEffect(() => {
    if (currentAuction?.status === 'open' && currentAuction?.timerEnd) {
      const endMs = currentAuction.timerEnd.toMillis ? currentAuction.timerEnd.toMillis() : currentAuction.timerEnd;
      
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((endMs - now) / 1000));
        setTimeLeft(remaining);
        
        if (remaining === 0) {
          clearInterval(timerRef.current);
          if (isBanditore) {
            handleCloseAuction();
          }
        }
      };
      
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
      
      return () => clearInterval(timerRef.current);
    }
  }, [currentAuction?.status, currentAuction?.timerEnd, isBanditore]);

  // Fetch bids if revealed
  useEffect(() => {
    if (currentAuction?.status === 'revealed') {
      if (isBanditore) {
        getDocs(collection(db, `sessions/${sessionId}/currentAuction/state/bids`)).then(snapshot => {
          const b = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          b.sort((a: any, b: any) => b.amount - a.amount);
          setBids(b);
        }).catch(err => console.error("Error fetching bids:", err));
      } else {
        // Participants can read the bids from the auction history
        const q = query(
          collection(db, `sessions/${sessionId}/auctionHistory`),
          where('playerId', '==', currentAuction.playerId),
          orderBy('completedAt', 'desc')
        );
        getDocs(q).then(snapshot => {
          if (!snapshot.empty) {
            const historyDoc = snapshot.docs[0].data();
            if (historyDoc.allBids) {
              const b = historyDoc.allBids;
              b.sort((a: any, b: any) => b.amount - a.amount);
              setBids(b);
            }
          }
        }).catch(err => console.error("Error fetching history for bids:", err));
      }
    }
  }, [currentAuction?.status, sessionId, isBanditore, currentAuction?.playerId]);

  const handleKeypad = (val: string) => {
    if (val === 'C') {
      setBidAmount('');
    } else if (val === 'DEL') {
      setBidAmount(prev => prev.slice(0, -1));
    } else {
      if (bidAmount.length < 4) {
        setBidAmount(prev => prev + val);
      }
    }
  };

  const submitBid = async () => {
    if (!participantId || !bidAmount) return;
    const amount = parseInt(bidAmount, 10);
    
    if (amount < 1) return;
    if (participantData && amount > participantData.budgetResiduo) return;

    await setDoc(doc(db, `sessions/${sessionId}/currentAuction/state/bids/${participantId}`), {
      amount,
      submittedAt: serverTimestamp(),
      round: currentAuction.round
    });
    
    setMyBid(amount);
    
    // Increment bid count (in a real app, use a transaction or Cloud Function)
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      bidCount: (currentAuction.bidCount || 0) + 1
    });
  };

  const handleCloseAuction = async () => {
    if (!isBanditore) return;
    
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      status: 'closing'
    });

    // Read all bids
    const snapshot = await getDocs(collection(db, `sessions/${sessionId}/currentAuction/state/bids`));
    const allBids = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    
    if (allBids.length === 0) {
      // No bids, cancel
      await handleCancelAuction();
      return;
    }

    // Sort descending
    allBids.sort((a: any, b: any) => b.amount - a.amount);
    
    const highestBid = allBids[0].amount;
    const winners = allBids.filter((b: any) => b.amount === highestBid);

    if (winners.length > 1) {
      // Tiebreak
      if (currentAuction.round < 3) {
        await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
          status: 'tiebreak',
          tiebreakParticipants: winners.map(w => w.id)
        });
      } else {
        // Random assign
        const randomWinner = winners[Math.floor(Math.random() * winners.length)];
        await assignWinner(randomWinner.id, highestBid, true, allBids);
      }
    } else {
      // Single winner
      await assignWinner(winners[0].id, highestBid, false, allBids);
    }
  };

  const assignWinner = async (winnerId: string, price: number, wasRandom: boolean, allBids: any[]) => {
    // Get winner nickname
    const winnerDoc = await getDoc(doc(db, `sessions/${sessionId}/participants/${winnerId}`));
    const winnerNickname = winnerDoc.exists() ? winnerDoc.data().nickname : 'Sconosciuto';

    // Update state to revealed
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      status: 'revealed',
      winnerId,
      winnerNickname,
      price,
      wasRandom
    });

    // Update player
    await updateDoc(doc(db, `sessions/${sessionId}/players/${currentAuction.playerId}`), {
      status: 'sold',
      soldTo: winnerId,
      soldPrice: price
    });

    // Update participant budget
    if (winnerDoc.exists()) {
      const currentBudget = winnerDoc.data().budgetResiduo;
      await updateDoc(doc(db, `sessions/${sessionId}/participants/${winnerId}`), {
        budgetResiduo: currentBudget - price
      });
    }

    // Add to history
    await addDoc(collection(db, `sessions/${sessionId}/auctionHistory`), {
      playerId: currentAuction.playerId,
      playerNome: player?.nome || 'Sconosciuto',
      winnerUid: winnerId,
      winnerNickname,
      price,
      allBids,
      rounds: currentAuction.round,
      wasRandom,
      wasCancelled: false,
      completedAt: serverTimestamp()
    });
  };

  const handleCancelAuction = async () => {
    if (!isBanditore) return;
    
    await updateDoc(doc(db, `sessions/${sessionId}/players/${currentAuction.playerId}`), {
      status: 'available'
    });

    await addDoc(collection(db, `sessions/${sessionId}/auctionHistory`), {
      playerId: currentAuction.playerId,
      playerNome: player?.nome || 'Sconosciuto',
      wasCancelled: true,
      completedAt: serverTimestamp()
    });

    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      status: 'idle',
      playerId: '',
      bidCount: 0,
      round: 1
    });
  };

  const handleNextPlayer = async () => {
    if (!isBanditore) return;
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      status: 'idle',
      playerId: '',
      bidCount: 0,
      round: 1
    });
  };

  const handleStartTiebreak = async () => {
    if (!isBanditore) return;
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      status: 'open',
      round: currentAuction.round + 1,
      bidCount: 0,
      timerEnd: new Date(Date.now() + sessionData.timerDuration * 1000)
    });
  };

  if (!player) return <div className="min-h-screen flex items-center justify-center">Caricamento calciatore...</div>;

  const isTiebreakParticipant = currentAuction.tiebreakParticipants?.includes(participantId);
  const canBid = !isBanditore && currentAuction.status === 'open' && (currentAuction.round === 1 || isTiebreakParticipant);

  return (
    <div className="min-h-screen flex flex-col bg-[#05050f]">
      {/* Header */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] p-4 text-center relative">
        <h2 className="text-[#5a5a90] text-sm uppercase tracking-widest font-bold mb-1">In Asta</h2>
        <div className="text-2xl font-black">{player.nome}</div>
        <div className="text-[#00e5ff] font-bold">{player.squadra} • {sessionData.format === 'classic' ? player.r : player.rm}</div>
        
        {isBanditore && currentAuction.status === 'open' && (
          <button 
            onClick={handleCancelAuction}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ff3d71] hover:bg-[#ff3d71]/10 p-2 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full">
        
        {currentAuction.status === 'open' && (
          <>
            <div className={`text-8xl font-mono font-black mb-8 ${timeLeft <= 5 ? 'text-[#ff3d71] animate-pulse' : 'text-[#00e5ff]'}`}>
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            
            <div className="bg-[#111128] rounded-full px-6 py-2 text-[#5a5a90] font-bold mb-8 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
              {currentAuction.bidCount || 0} offerte ricevute
            </div>

            {canBid ? (
              <div className="w-full">
                <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl p-6 mb-4">
                  <div className="text-center mb-4">
                    <div className="text-[#5a5a90] text-sm mb-1">La tua offerta</div>
                    <div className="text-5xl font-mono font-black text-white h-14">
                      {bidAmount || '0'}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                      <button key={n} onClick={() => handleKeypad(n.toString())} className="bg-[#111128] hover:bg-[#111128]/80 text-2xl font-mono font-bold py-4 rounded-xl transition-colors">
                        {n}
                      </button>
                    ))}
                    <button onClick={() => handleKeypad('C')} className="bg-[#ff3d71]/10 text-[#ff3d71] hover:bg-[#ff3d71]/20 text-xl font-bold py-4 rounded-xl transition-colors">
                      C
                    </button>
                    <button onClick={() => handleKeypad('0')} className="bg-[#111128] hover:bg-[#111128]/80 text-2xl font-mono font-bold py-4 rounded-xl transition-colors">
                      0
                    </button>
                    <button onClick={() => handleKeypad('DEL')} className="bg-[#111128] hover:bg-[#111128]/80 text-xl font-bold py-4 rounded-xl transition-colors flex items-center justify-center">
                      <X size={24} />
                    </button>
                  </div>

                  <button 
                    onClick={submitBid}
                    disabled={!bidAmount || parseInt(bidAmount) > (participantData?.budgetResiduo || 0)}
                    className="w-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-[#05050f] font-bold py-4 rounded-xl transition-colors disabled:opacity-50 disabled:bg-[#5a5a90] flex justify-center items-center gap-2"
                  >
                    {myBid ? <><Check size={20} /> Aggiorna Offerta</> : 'Invia Offerta'}
                  </button>
                  {participantData && parseInt(bidAmount) > participantData.budgetResiduo && (
                    <div className="text-[#ff3d71] text-center text-sm mt-2 font-bold">Budget insufficiente! (Max: {participantData.budgetResiduo})</div>
                  )}
                </div>
              </div>
            ) : isBanditore ? (
              <button 
                onClick={handleCloseAuction}
                className="bg-[#ffaa00] hover:bg-[#ffaa00]/90 text-[#05050f] font-bold py-4 px-8 rounded-xl transition-colors text-xl"
              >
                Chiudi Busta Anticipatamente
              </button>
            ) : (
              <div className="text-[#5a5a90] text-center text-lg">
                {currentAuction.round > 1 ? 'Non partecipi a questo spareggio' : 'Attendi la chiusura della busta...'}
              </div>
            )}
          </>
        )}

        {currentAuction.status === 'closing' && (
          <div className="text-2xl font-bold text-[#00e5ff] animate-pulse">
            Apertura buste in corso...
          </div>
        )}

        {currentAuction.status === 'tiebreak' && (
          <div className="text-center">
            <div className="text-[#ffaa00] text-6xl mb-4">⚖️</div>
            <h2 className="text-3xl font-black mb-2">PARITÀ!</h2>
            <p className="text-[#5a5a90] mb-8">Si va allo spareggio (Round {currentAuction.round + 1})</p>
            {isBanditore && (
              <button 
                onClick={handleStartTiebreak}
                className="bg-[#00e5ff] text-[#05050f] font-bold py-4 px-8 rounded-xl text-xl"
              >
                Avvia Busta Spareggio
              </button>
            )}
          </div>
        )}

        {currentAuction.status === 'revealed' && (
          <div className="w-full">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-[#00e5ff] mb-2">ASSEGNATO!</h2>
              <div className="text-xl text-white">
                a <span className="font-bold text-[#ffaa00]">{currentAuction.winnerNickname}</span> per <span className="font-mono font-bold text-[#00e5ff]">{currentAuction.price} cr</span>
              </div>
              {currentAuction.wasRandom && (
                <div className="text-[#ff3d71] text-sm mt-2 font-bold">Assegnato tramite sorteggio (3° pareggio)</div>
              )}
            </div>

            <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden mb-8">
              <div className="bg-[#111128] p-3 text-center text-[#5a5a90] font-bold text-sm uppercase tracking-widest">
                Tutte le offerte
              </div>
              <div className="divide-y divide-[#111128]">
                {bids.map((b, i) => (
                  <div key={b.id} className={`p-4 flex justify-between items-center ${i === 0 ? 'bg-[#00e5ff]/10' : ''}`}>
                    <span className={`font-bold ${i === 0 ? 'text-[#00e5ff]' : 'text-white'}`}>
                      {/* In a real app, we'd fetch nicknames for all bids. For now, just show ID or winner */}
                      {b.id === currentAuction.winnerId ? currentAuction.winnerNickname : 'Partecipante'}
                    </span>
                    <span className="font-mono font-bold text-lg">{b.amount} cr</span>
                  </div>
                ))}
              </div>
            </div>

            {isBanditore && (
              <button 
                onClick={handleNextPlayer}
                className="w-full bg-[#00e5ff] text-[#05050f] font-bold py-4 rounded-xl text-xl"
              >
                Prossimo Calciatore
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
