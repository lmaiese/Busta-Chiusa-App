import { initializeApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import firebaseConfig from "../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// In DEV the emulator only supports the default database.
// In production use the named database from config (if set).
export const db = import.meta.env.DEV
  ? getFirestore(app)
  : (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app));
export const functions = getFunctions(app, "us-central1");

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 2727);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

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
  // Mantra: only Por is constrained by role. All others unconstrained (total capped by totalRosterSize).
  return {
    Por: { min: 2, max: 3 },
    Dc: { min: 0, max: 99 },
    Dd: { min: 0, max: 99 },
    Ds: { min: 0, max: 99 },
    B:  { min: 0, max: 99 },
    E:  { min: 0, max: 99 },
    M:  { min: 0, max: 99 },
    C:  { min: 0, max: 99 },
    T:  { min: 0, max: 99 },
    W:  { min: 0, max: 99 },
    A:  { min: 0, max: 99 },
    Pc: { min: 0, max: 99 },
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
