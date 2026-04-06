import React, { useEffect, useState } from "react";
import { useSession } from "./SessionRouter";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import ActiveAuction from "../components/ActiveAuction";
import PlayerList from "../components/PlayerList";
import RosterList from "../components/RosterList";
import AuctionHistory from "../components/AuctionHistory";
import { Gavel, LogOut, Loader } from "lucide-react";

type Tab = "busta" | "listone" | "rose" | "storico";

// ── Header fisso partecipante ─────────────────────────────────────────────
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
        <span className="font-black text-[#00e5ff] tracking-tight text-lg">
          BUSTA CHIUSA
        </span>
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

// ── Placeholder busta idle ────────────────────────────────────────────────
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

// ── Floating pill — mostrata al banditore su tab non-busta durante asta attiva
function AuctionPill({ onReturn }: { onReturn: () => void }) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[#0b0b1c] border border-[#ff3d71]/50 rounded-full px-4 py-2.5 shadow-[0_0_20px_rgba(255,61,113,0.2)]">
      <span className="w-2 h-2 rounded-full bg-[#ff3d71] animate-pulse shrink-0" />
      <span className="text-sm text-white font-medium whitespace-nowrap">
        Busta aperta
      </span>
      <button
        onClick={onReturn}
        className="text-xs text-[#ff3d71] font-bold border border-[#ff3d71]/40 px-3 py-1 rounded-full hover:bg-[#ff3d71]/10 transition-colors whitespace-nowrap"
      >
        Torna alla busta
      </button>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────────
export default function Auction() {
  const { sessionId, isBanditore, participantId, sessionData } = useSession();

  const [currentAuction, setCurrentAuction] = useState<any>(null);
  const [myParticipant, setMyParticipant] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<Tab>("busta");

  // Stato per "Termina asta"
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [terminating, setTerminating] = useState(false);

  // Ascolta stato corrente dell'asta
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/currentAuction/state`),
      (snap) => {
        if (snap.exists()) setCurrentAuction(snap.data());
      }
    );
    return unsub;
  }, [sessionId]);

  // Ascolta budget del partecipante (solo per non-banditore)
  useEffect(() => {
    if (!participantId || isBanditore) return;
    const unsub = onSnapshot(
      doc(db, `sessions/${sessionId}/participants/${participantId}`),
      (snap) => {
        if (snap.exists()) setMyParticipant(snap.data());
      }
    );
    return unsub;
  }, [participantId, sessionId, isBanditore]);

  // Auto-switch alla tab busta quando una busta si apre o va in tiebreak
  useEffect(() => {
    if (
      currentAuction?.status === "open" ||
      currentAuction?.status === "tiebreak"
    ) {
      setActiveTab("busta");
    }
  }, [currentAuction?.status, currentAuction?.playerId]);

  // Reset conferma terminate se l'asta riparte
  useEffect(() => {
    if (currentAuction?.status === "open") {
      setConfirmTerminate(false);
    }
  }, [currentAuction?.status]);

  // ── Termina asta ──────────────────────────────────────────────────────
  const handleTerminateSession = async () => {
    setTerminating(true);
    try {
      await updateDoc(doc(db, "sessions", sessionId), { status: "completed" });
      // Redirect automatico via SessionRouter onSnapshot
    } catch (err: any) {
      console.error("Terminate error:", err);
      setTerminating(false);
      setConfirmTerminate(false);
    }
  };

  const auctionStatus = currentAuction?.status;

  // "Attiva" = qualsiasi stato diverso da idle/cancelled (include revealed e tiebreak)
  const isAuctionActive =
    !!auctionStatus &&
    auctionStatus !== "idle" &&
    auctionStatus !== "cancelled";

  // Tab sempre visibili per tutti (banditore e partecipanti)
  const tabs: { id: Tab; label: string }[] = [
    { id: "busta", label: "Busta" },
    { id: "listone", label: "Listone" },
    { id: "rose", label: "Rose" },
    { id: "storico", label: "Storico" },
  ];

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header partecipante ──────────────────────────────────────── */}
      {!isBanditore && (
        <ParticipantHeader
          sessionData={sessionData}
          myParticipant={myParticipant}
        />
      )}

      {/* ── Header banditore ─────────────────────────────────────────── */}
      {isBanditore && (
        <div className="bg-[#0b0b1c] border-b border-[#111128] px-4 py-3 flex items-center justify-between">
          <span className="font-black text-[#00e5ff] tracking-tight text-xl">
            BUSTA CHIUSA
          </span>

          <div className="flex items-center gap-3">
            <span className="text-[#5a5a90] font-mono text-sm hidden sm:inline">
              Codice:{" "}
              <span className="text-white">{sessionData.code}</span>
            </span>

            {/* Bottone Termina asta */}
            {!confirmTerminate ? (
              <button
                onClick={() => setConfirmTerminate(true)}
                disabled={!!isAuctionActive}
                title={
                  isAuctionActive
                    ? "Chiudi prima la busta attiva"
                    : "Termina la sessione d'asta"
                }
                className="flex items-center gap-1.5 text-xs text-[#5a5a90] border border-[#5a5a90]/30 px-3 py-1.5 rounded-lg hover:border-[#ff3d71]/60 hover:text-[#ff3d71] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <LogOut size={13} />
                Termina asta
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#ff3d71] font-medium">
                  Termina la sessione?
                </span>
                <button
                  onClick={() => setConfirmTerminate(false)}
                  disabled={terminating}
                  className="text-xs text-[#5a5a90] border border-[#5a5a90]/30 px-2.5 py-1 rounded-lg hover:border-[#5a5a90] transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleTerminateSession}
                  disabled={terminating}
                  className="text-xs text-[#ff3d71] border border-[#ff3d71]/50 px-2.5 py-1 rounded-lg hover:bg-[#ff3d71]/10 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {terminating && (
                    <Loader size={12} className="animate-spin" />
                  )}
                  {terminating ? "..." : "Sì, termina"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="bg-[#0b0b1c] border-b border-[#111128] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map((tab) => {
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
                {/* Pallino pulsante sulla tab Busta quando c'è un'asta aperta */}
                {hasActivity && (
                  <span className="absolute top-2 right-1 w-2 h-2 rounded-full bg-[#ff3d71] animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Contenuto tab ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* BUSTA — per tutti, banditore incluso */}
        {activeTab === "busta" && (
          isAuctionActive ? (
            <ActiveAuction currentAuction={currentAuction} />
          ) : (
            <BustaIdle isBanditore={isBanditore} />
          )
        )}

        {/* LISTONE */}
        {activeTab === "listone" && (
          <div className="flex-1 max-w-5xl mx-auto w-full p-4">
            {isBanditore && isAuctionActive && (
              <div className="bg-[#ffaa00]/10 border border-[#ffaa00]/40 text-[#ffaa00] text-sm px-4 py-2 rounded-xl mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ffaa00] animate-pulse" />
                Busta aperta — chiudi prima di selezionare un nuovo calciatore
              </div>
            )}
            <PlayerList isBanditore={isBanditore} />
          </div>
        )}

        {/* ROSE */}
        {activeTab === "rose" && (
          <div className="flex-1 max-w-5xl mx-auto w-full p-4">
            <RosterList />
          </div>
        )}

        {/* STORICO */}
        {activeTab === "storico" && (
          <div className="flex-1 max-w-5xl mx-auto w-full p-4">
            <AuctionHistory />
          </div>
        )}
      </div>

      {/* ── Floating pill (banditore su tab non-busta con asta attiva) ── */}
      {isBanditore && isAuctionActive && activeTab !== "busta" && (
        <AuctionPill onReturn={() => setActiveTab("busta")} />
      )}
    </div>
  );
}
