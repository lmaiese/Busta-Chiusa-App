import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useSession } from '../pages/SessionRouter';
import { Download } from 'lucide-react';

export default function RosterList() {
  const { sessionId, isBanditore } = useSession();
  const [participants, setParticipants] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `sessions/${sessionId}/participants`), (snapshot) => {
      const parts = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // Sort by budget descending
      parts.sort((a: any, b: any) => b.budgetResiduo - a.budgetResiduo);
      setParticipants(parts);
    });
    return unsub;
  }, [sessionId]);

  const handleExportCSV = async () => {
    if (!isBanditore) return;
    
    try {
      // Fetch all history to get the assigned players
      const historySnap = await getDocs(collection(db, `sessions/${sessionId}/auctionHistory`));
      const history = historySnap.docs.map(d => d.data());
      
      const soldPlayers = history.filter(h => !h.wasCancelled && h.winnerUid);
      
      let csvContent = "Id;Crediti\n";
      soldPlayers.forEach(p => {
        csvContent += `${p.playerId};${p.price}\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `rose_busta_chiusa_${sessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Errore export CSV", err);
      alert("Errore durante l'esportazione");
    }
  };

  return (
    <div className="space-y-6">
      {isBanditore && (
        <div className="flex justify-end">
          <button 
            onClick={handleExportCSV}
            className="bg-[#111128] hover:bg-[#111128]/80 text-[#00e5ff] border border-[#00e5ff]/30 hover:border-[#00e5ff] font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Download size={20} />
            Esporta Rose (CSV)
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {participants.map(p => (
          <div key={p.id} className="bg-[#0b0b1c] border border-[#111128] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#111128] flex items-center justify-between bg-[#111128]/50">
              <h3 className="font-bold text-lg truncate pr-4">{p.nickname}</h3>
              <div className="text-right shrink-0">
                <div className="text-xs text-[#5a5a90] uppercase">Budget</div>
                <div className="font-mono font-bold text-[#00e5ff] text-xl">{p.budgetResiduo}</div>
              </div>
            </div>
            
            <div className="p-4">
              <div className="flex justify-between text-sm text-[#5a5a90] mb-2">
                <span>Slot occupati</span>
                <span>{Object.values(p.rosterCount || {}).reduce((a: any, b: any) => a + b, 0)} / {Object.values(p.rosterLimits || {}).reduce((a: any, b: any) => a + b.max, 0)}</span>
              </div>
              
              <div className="grid grid-cols-4 gap-2 text-center">
                {Object.entries(p.rosterCount || {}).map(([role, count]: [string, any]) => (
                  <div key={role} className="bg-[#111128] rounded-lg p-2">
                    <div className="text-xs text-[#5a5a90] font-bold">{role}</div>
                    <div className={`font-mono font-bold ${count >= (p.rosterLimits?.[role]?.max || 99) ? 'text-[#ff3d71]' : 'text-white'}`}>
                      {count}/{p.rosterLimits?.[role]?.max || '-'}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* In a full implementation, we would fetch and display the actual players here */}
              <div className="mt-4 text-center text-xs text-[#5a5a90] italic">
                (Dettaglio rosa non implementato nella preview)
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
