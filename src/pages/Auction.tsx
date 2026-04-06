import React, { useEffect, useState } from "react";
import { useSession } from "./SessionRouter";
import { doc, onSnapshot, collection } from "firebase/firestore";
import { db } from "../firebase";
import ActiveAuction from "../components/ActiveAuction";
import PlayerList from "../components/PlayerList";
import RosterList from "../components/RosterList";
import AuctionHistory from "../components/AuctionHistory";
import { Gavel } from "lucide-react";

type Tab = "busta" | "listone" | "rose" | "storico";

// ── Sticky header shown to participants ──────────────────────────────────
function ParticipantHeader({
  sessionData,
  myParticipant,
}: {
  sessionData: any;
  myParticipant: any;
}) {
  return (
    <div className="bg-[#0b0b1c] border-b border-[#111128] px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-black text-[#00e5ff] tracking-tight text-lg">BUSTA CHIUSA</span>
        <span className="text-xs text-[#5a5a90] font-mono hidden sm:inline">
          · {sessionData.code}
        </span>
      </div>
      {myParticipant && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#5a5a90] hidden sm:inline truncate max-w-[100px]">
            {myParticipant.nickname}
          </span>
          <div className="bg-[#111128] border border-[#00e5ff]/30 rounded-lg px-3 py-1">
            <span className="font-mono font-bold text-[#00e5ff] text-sm">
              {myParticipant.budgetResiduo}{" "}
              <span className="text-[#5a5a90] text-xs font-normal">cr</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Idle busta placeholder ───────────────────────────────────────────────
function BustaIdle({ isBanditore }: { isBanditore: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 rounded-full bg-[#111128] flex items-center justify-center mb-6">
        <Gavel size={36} className="text-[#5a5a90]" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Nessuna busta aperta</h2>
      <p className="text-[#5a5a90] text-sm max-w-xs">
        {isBanditore
          ? "Vai al listone e seleziona un calciatore per avviare la busta."
          : "Il banditore sta scegliendo il prossimo calciatore. Tieniti pronto."}
      </p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────
export default function Auction() {
  const { sessionId, isBanditore, participantId, sessionData } = useSession();
  const [currentAuction, setCurrentAuction] = useState<any>(null);
  const [myParticipant, setMyParticipant] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>("busta");

  // Listen to currentAuction state
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/currentAuction/state`),
      (snap) => { if (snap.exists()) setCurrentAuction(snap.data()); }
    );
    return unsub;
  }, [sessionId]);

  // Listen to own participant data (budget etc.)
  useEffect(() => {
    if (!participantId || isBanditore) return;
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/participants/${participantId}`),
      (snap) => { if (snap.exists()) setMyParticipant(snap.data()); }
    );
    return unsub;
  }, [participantId, sessionId, isBanditore]);

  // Auto-switch to busta tab when a new auction opens
  useEffect(() => {
    if (
      currentAuction?.status === "open" ||
      currentAuction?.status === "tiebreak"
    ) {
      setActiveTab("busta");
    }
  }, [currentAuction?.status, currentAuction?.playerId]);

  // The auction is "active" if it's in any non-idle/non-cancelled state
  const auctionStatus = currentAuction?.status;
  const isAuctionActive =
    auctionStatus &&
    auctionStatus !== "idle" &&
    auctionStatus !== "cancelled";

  const tabs: { id: Tab; label: string }[] = [
    { id: "busta", label: "Busta" },
    { id: "listone", label: "Listone" },
    { id: "rose", label: "Rose" },
    { id: "storico", label: "Storico" },
  ];

  // Banditore doesn't need the Busta tab (they use PlayerList to start auctions)
  const visibleTabs = isBanditore
    ? tabs.filter((t) => t.id !== "busta")
    : tabs;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Participant sticky header */}
      {!isBanditore && (
        <ParticipantHeader sessionData={sessionData} myParticipant={myParticipant} />
      )}

      {/* Banditore header */}
      {isBanditore && (
        <div className="bg-[#0b0b1c] border-b border-[#111128] px-4 py-3 flex items-center justify-between">
          <span className="font-black text-[#00e5ff] tracking-tight text-xl">BUSTA CHIUSA</span>
          <span className="text-[#5a5a90] font-mono text-sm">
            Codice: <span className="text-white">{sessionData.code}</span>
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {visibleTabs.map((tab) => {
            const hasActivity =
              tab.id === "busta" &&
              isAuctionActive &&
              (auctionStatus === "open" || auctionStatus === "tiebreak");

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 font-bold text-sm whitespace-nowrap border-b-2 transition-colors relative ${
                  activeTab === tab.id
                    ? "border-[#00e5ff] text-[#00e5ff]"
                    : "border-transparent text-[#5a5a90] hover:text-white"
                }`}
              >
                {tab.label}
                {/* Pulsing dot when busta is open */}
                {hasActivity && (
                  <span className="absolute top-2 right-1 w-2 h-2 rounded-full bg-[#ff3d71] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        {/* BUSTA tab — participants only */}
        {!isBanditore && activeTab === "busta" && (
          isAuctionActive ? (
            <ActiveAuction currentAuction={currentAuction} />
          ) : (
            <BustaIdle isBanditore={false} />
          )
        )}

        {/* LISTONE tab — both roles */}
        {activeTab === "listone" && (
          <div className="flex-1 max-w-5xl mx-auto w-full p-4">
            {/* Banditore: if auction active, show status bar */}
            {isBanditore && isAuctionActive && (
              <div className="bg-[#ffaa00]/10 border border-[#ffaa00]/40 text-[#ffaa00] text-sm px-4 py-2 rounded-xl mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ffaa00] animate-pulse" />
                Busta aperta — chiudi prima di selezionare un nuovo calciatore
              </div>
            )}
            <PlayerList isBanditore={isBanditore} />
          </div>
        )}

        {/* ROSE tab */}
        {activeTab === "rose" && (
          <div className="flex-1 max-w-5xl mx-auto w-full p-4">
            <RosterList />
          </div>
        )}

        {/* STORICO tab */}
        {activeTab === "storico" && (
          <div className="flex-1 max-w-5xl mx-auto w-full p-4">
            <AuctionHistory />
          </div>
        )}

        {/* Banditore with active auction → overlay ActiveAuction when on listone/rose/storico */}
        {isBanditore && isAuctionActive && activeTab !== "listone" && (
          <div className="fixed inset-0 z-20 bg-[#05050f]/95 flex flex-col">
            <ActiveAuction currentAuction={currentAuction} />
            {/* Allow going back to listone from within ActiveAuction via "Prossimo calciatore" */}
          </div>
        )}
      </div>
    </div>
  );
}
