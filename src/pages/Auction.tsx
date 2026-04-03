import React, { useEffect, useState } from 'react';
import { useSession } from './SessionRouter';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import ActiveAuction from '../components/ActiveAuction';
import PlayerList from '../components/PlayerList';
import RosterList from '../components/RosterList';
import AuctionHistory from '../components/AuctionHistory';

export default function Auction() {
  const { sessionId, isBanditore, sessionData } = useSession();
  const [currentAuction, setCurrentAuction] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'listone' | 'rose' | 'storico'>('listone');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `sessions/${sessionId}/currentAuction/state`), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentAuction(docSnap.data());
      }
    });
    return unsub;
  }, [sessionId]);

  const isAuctionActive = currentAuction && currentAuction.status !== 'idle' && currentAuction.status !== 'cancelled';

  if (isAuctionActive) {
    return <ActiveAuction currentAuction={currentAuction} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header / Tabs */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-[#00e5ff] to-[#ffaa00]">
              BUSTA CHIUSA
            </h1>
            <div className="text-[#5a5a90] font-mono">
              Codice: <span className="text-white">{sessionData.code}</span>
            </div>
          </div>
          
          <div className="flex gap-6 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setActiveTab('listone')}
              className={`pb-3 font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === 'listone' ? 'border-[#00e5ff] text-[#00e5ff]' : 'border-transparent text-[#5a5a90] hover:text-white'}`}
            >
              Listone
            </button>
            <button 
              onClick={() => setActiveTab('rose')}
              className={`pb-3 font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === 'rose' ? 'border-[#00e5ff] text-[#00e5ff]' : 'border-transparent text-[#5a5a90] hover:text-white'}`}
            >
              Rose
            </button>
            <button 
              onClick={() => setActiveTab('storico')}
              className={`pb-3 font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === 'storico' ? 'border-[#00e5ff] text-[#00e5ff]' : 'border-transparent text-[#5a5a90] hover:text-white'}`}
            >
              Storico
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-4">
        {activeTab === 'listone' && <PlayerList isBanditore={isBanditore} />}
        {activeTab === 'rose' && <RosterList />}
        {activeTab === 'storico' && <AuctionHistory />}
      </div>
    </div>
  );
}
