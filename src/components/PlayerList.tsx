import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useSession } from '../pages/SessionRouter';
import { Search, Play } from 'lucide-react';

export default function PlayerList({ isBanditore }: { isBanditore: boolean }) {
  const { sessionId, sessionData } = useSession();
  const [players, setPlayers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');

  useEffect(() => {
    const q = query(collection(db, `sessions/${sessionId}/players`));
    const unsub = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(p);
    });
    return unsub;
  }, [sessionId]);

  const handleStartAuction = async (player: any) => {
    if (!isBanditore) return;
    
    // Update player status
    await updateDoc(doc(db, `sessions/${sessionId}/players/${player.id}`), {
      status: 'auctioning'
    });

    // Update current auction state
    await updateDoc(doc(db, `sessions/${sessionId}/currentAuction/state`), {
      status: 'open',
      playerId: player.id,
      bidCount: 0,
      round: 1,
      timerEnd: new Date(Date.now() + sessionData.timerDuration * 1000) // We will use serverTimestamp or client offset in a real app, but this works for now
    });
  };

  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || p.squadra.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || (sessionData.format === 'classic' ? p.r === filterRole : p.rm.includes(filterRole));
    return matchesSearch && matchesRole;
  }).sort((a, b) => b.fvm - a.fvm); // Sort by FVM descending

  const roles = sessionData.format === 'classic' ? ['P', 'D', 'C', 'A'] : ['Por', 'Dc', 'Dd', 'Ds', 'B', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc'];

  const getRoleColor = (r: string) => {
    if (r.includes('P')) return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50';
    if (r.includes('D')) return 'bg-green-500/20 text-green-500 border-green-500/50';
    if (r.includes('C') || r.includes('M') || r.includes('T') || r.includes('W')) return 'bg-blue-500/20 text-blue-500 border-blue-500/50';
    if (r.includes('A')) return 'bg-red-500/20 text-red-500 border-red-500/50';
    return 'bg-gray-500/20 text-gray-500 border-gray-500/50';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a5a90]" size={20} />
          <input 
            type="text" 
            placeholder="Cerca calciatore o squadra..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#111128] border border-[#5a5a90]/30 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
          <button 
            onClick={() => setFilterRole('ALL')}
            className={`px-4 py-2 rounded-lg font-bold border transition-colors whitespace-nowrap ${filterRole === 'ALL' ? 'bg-[#00e5ff] text-[#05050f] border-[#00e5ff]' : 'bg-[#111128] text-[#5a5a90] border-[#5a5a90]/30 hover:border-[#00e5ff]/50'}`}
          >
            TUTTI
          </button>
          {roles.map(r => (
            <button 
              key={r}
              onClick={() => setFilterRole(r)}
              className={`px-4 py-2 rounded-lg font-bold border transition-colors whitespace-nowrap ${filterRole === r ? 'bg-[#00e5ff] text-[#05050f] border-[#00e5ff]' : 'bg-[#111128] text-[#5a5a90] border-[#5a5a90]/30 hover:border-[#00e5ff]/50'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlayers.map(p => (
          <div key={p.id} className={`bg-[#0b0b1c] border rounded-xl p-4 flex items-center justify-between ${p.status === 'sold' ? 'border-[#ff3d71]/30 opacity-50' : 'border-[#111128] hover:border-[#00e5ff]/50 transition-colors'}`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getRoleColor(sessionData.format === 'classic' ? p.r : p.rm)}`}>
                  {sessionData.format === 'classic' ? p.r : p.rm}
                </span>
                <span className="font-bold text-lg">{p.nome}</span>
              </div>
              <div className="text-sm text-[#5a5a90] flex items-center gap-3">
                <span>{p.squadra}</span>
                <span>•</span>
                <span>Qt: {sessionData.format === 'classic' ? p.qt : p.qm}</span>
              </div>
            </div>
            
            {p.status === 'sold' ? (
              <div className="text-right">
                <div className="text-xs text-[#5a5a90] uppercase">Venduto a</div>
                <div className="font-bold text-[#ff3d71]">{p.soldPrice} cr</div>
              </div>
            ) : isBanditore ? (
              <button 
                onClick={() => handleStartAuction(p)}
                className="w-12 h-12 rounded-full bg-[#00e5ff]/10 text-[#00e5ff] flex items-center justify-center hover:bg-[#00e5ff] hover:text-[#05050f] transition-colors"
              >
                <Play size={20} className="ml-1" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
