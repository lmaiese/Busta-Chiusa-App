import React, { createContext, useContext, useEffect, useState } from "react";
import { useParams, useLocation, useNavigate, Routes, Route } from "react-router-dom";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  getInitialRosterCount,
  getDefaultRosterLimits,
} from "../firebase";
import { useAuth } from "../context/AuthContext";
import Lobby from "./Lobby";
import Auction from "./Auction";
import AuctionSummary from "./AuctionSummary";

interface SessionContextType {
  sessionId: string;
  sessionData: any;
  isBanditore: boolean;
  participantId: string | null;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionRouter");
  return ctx;
};

export default function SessionRouter() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Ascolta il documento sessione ────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !user) return;

    const unsub = onSnapshot(
      doc(db, "sessions", sessionId),
      (docSnap) => {
        if (docSnap.exists()) {
          setSessionData(docSnap.data());
          setLoading(false);
        } else {
          setError("Sessione non trovata");
          setLoading(false);
        }
      },
      (err) => {
        if (
          err.message?.includes("Missing or insufficient permissions") &&
          user.isAnonymous
        ) {
          auth.signOut().then(() => navigate("/"));
          return;
        }
        try {
          handleFirestoreError(err, OperationType.GET, `sessions/${sessionId}`);
        } catch (e: any) {
          try {
            const parsed = JSON.parse(e.message);
            setError(`Errore: ${parsed.error}`);
          } catch {
            setError(e.message);
          }
        }
        setLoading(false);
      }
    );

    return unsub;
  }, [sessionId, user, navigate]);

  // ── Redirect automatico a /summary quando la sessione termina ───────
  useEffect(() => {
    if (!sessionData || !sessionId) return;
    if (sessionData.status !== "completed") return;
    // Evita loop se siamo già sulla pagina summary
    if (location.pathname.endsWith("/summary")) return;
    navigate(`/session/${sessionId}/summary`, { replace: true });
  }, [sessionData?.status, sessionId, navigate, location.pathname]);

  // ── Registra il partecipante al primo accesso ────────────────────────
  useEffect(() => {
    if (!sessionData || !user || !sessionId) return;

    const isBanditore = sessionData.banditorId === user.uid;
    const nickname = location.state?.nickname;

    if (!isBanditore && nickname) {
      const format = sessionData.format || "classic";
      const participantRef = doc(
        db,
        `sessions/${sessionId}/participants/${user.uid}`
      );

      setDoc(
        participantRef,
        {
          nickname,
          budgetResiduo: sessionData.budget,
          rosterCount: getInitialRosterCount(format),
          rosterLimits:
            sessionData.rosterLimits || getDefaultRosterLimits(format),
          isConnected: true,
          joinedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => {
        try {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `sessions/${sessionId}/participants/${user.uid}`
          );
        } catch (e: any) {
          try {
            const parsed = JSON.parse(e.message);
            setError(`Errore registrazione: ${parsed.error}`);
          } catch {
            setError("Errore registrazione: " + e.message);
          }
        }
      });
    }
  }, [sessionData, user, sessionId, location.state]);

  // ── Loading / error states ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#5a5a90] animate-pulse">
          Caricamento sessione...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[#ff3d71] text-center px-4">{error}</div>
      </div>
    );
  }

  if (!sessionData || !user) return null;

  const isBanditore = sessionData.banditorId === user.uid;

  return (
    <SessionContext.Provider
      value={{
        sessionId: sessionId!,
        sessionData,
        isBanditore,
        participantId: user.uid,
      }}
    >
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/auction" element={<Auction />} />
        <Route path="/summary" element={<AuctionSummary />} />
      </Routes>
    </SessionContext.Provider>
  );
}
