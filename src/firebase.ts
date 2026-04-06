import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const functions = getFunctions(app, "us-central1");

// ── Auth helpers ─────────────────────────────────────────────────────────
export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInAsGuest = () => signInAnonymously(auth);
export const logOut = () => signOut(auth);

// ── Cloud Function callables ─────────────────────────────────────────────
export const startAuctionFn = httpsCallable<
  { sessionId: string; playerId: string; round?: number; tiebreakParticipants?: string[] | null },
  { timerEnd: number; round: number }
>(functions, "startAuction");

export const closeAuctionFn = httpsCallable<
  { sessionId: string },
  { result: string; winner?: string; price?: number; round?: number; tiebreakNicknames?: string[] }
>(functions, "closeAuction");

export const cancelAuctionFn = httpsCallable<{ sessionId: string }, { result: string }>(
  functions,
  "cancelAuction"
);

export const manualAssignFn = httpsCallable<
  { sessionId: string; playerId: string; participantId: string; price: number },
  { result: string; winner: string; price: number }
>(functions, "manualAssign");

// ── Mantra constants (shared client-side) ────────────────────────────────
export const CLASSIC_ROLES = ["P", "D", "C", "A"] as const;
export const MANTRA_ROLES = [
  "Por", "Dc", "Dd", "Ds", "B", "E", "M", "C", "T", "W", "A", "Pc",
] as const;

export type ClassicRole = (typeof CLASSIC_ROLES)[number];
export type MantraRole = (typeof MANTRA_ROLES)[number];

export function parseMantraRoles(rm: string): string[] {
  if (!rm) return [];
  return rm.split("/").map((r) => r.trim()).filter((r) => r.length > 0);
}

export function getPrimaryRole(player: { r?: string; rm?: string }, format: string): string {
  if (format === "classic") return player.r || "D";
  const roles = parseMantraRoles(player.rm || "");
  return roles[0] || player.r || "Por";
}

export function getInitialRosterCount(format: string): Record<string, number> {
  if (format === "classic") return { P: 0, D: 0, C: 0, A: 0 };
  const count: Record<string, number> = {};
  for (const r of MANTRA_ROLES) count[r] = 0;
  return count;
}

export function getDefaultRosterLimits(format: string) {
  if (format === "classic") {
    return { P: { min: 3, max: 3 }, D: { min: 8, max: 8 }, C: { min: 8, max: 8 }, A: { min: 6, max: 6 } };
  }
  return {
    Por: { min: 2, max: 3 },
    Dc: { min: 4, max: 7 },
    Dd: { min: 1, max: 3 },
    Ds: { min: 1, max: 3 },
    B: { min: 0, max: 3 },
    E: { min: 0, max: 3 },
    M: { min: 1, max: 4 },
    C: { min: 2, max: 5 },
    T: { min: 1, max: 4 },
    W: { min: 1, max: 4 },
    A: { min: 1, max: 3 },
    Pc: { min: 2, max: 4 },
  };
}

// ── Error handling ───────────────────────────────────────────────────────
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    isAnonymous: boolean | undefined;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
