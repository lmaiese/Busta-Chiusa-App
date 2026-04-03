import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useSession } from '../pages/SessionRouter';
import { format } from 'date-fns';

export default function AuctionHistory() {
  const { sessionId } = useSession();
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, `sessions/${sessionId}/auctionHistory`), orderBy('completedAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const h = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(h);
    });
    return unsub;
  }, [sessionId]);

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-[#5a5a90]">
        Nessuna asta completata finora.
      </div>
    );
  }

  return (
    <div className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#111128] text-[#5a5a90] text-sm uppercase tracking-wider">
              <th className="p-4 font-medium">Orario</th>
              <th className="p-4 font-medium">Calciatore</th>
              <th className="p-4 font-medium">Esito</th>
              <th className="p-4 font-medium text-right">Prezzo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#111128]">
            {history.map(h => (
              <tr key={h.id} className="hover:bg-[#111128]/50 transition-colors">
                <td className="p-4 text-[#5a5a90] text-sm">
                  {h.completedAt?.toDate ? format(h.completedAt.toDate(), 'HH:mm') : '-'}
                </td>
                <td className="p-4 font-bold text-white">
                  {h.playerNome}
                </td>
                <td className="p-4">
                  {h.wasCancelled ? (
                    <span className="text-[#ffaa00] text-sm font-bold">ANNULLATA</span>
                  ) : h.winnerNickname ? (
                    <span className="text-[#00e5ff] font-bold">{h.winnerNickname}</span>
                  ) : (
                    <span className="text-[#5a5a90] italic">Invenduto</span>
                  )}
                </td>
                <td className="p-4 text-right font-mono font-bold">
                  {h.price ? `${h.price} cr` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
