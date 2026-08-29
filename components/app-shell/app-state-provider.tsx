"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import type { CandidateEvaluation } from "@/lib/engine/types";
import type { ElementName } from "@/lib/types";

interface AppState {
  core: ElementName[];
  setCore: React.Dispatch<
    React.SetStateAction<ElementName[]>
  >;

  anchor: string;
  setAnchor: React.Dispatch<
    React.SetStateAction<string>
  >;

  mode: "manual" | "auto";
  setMode: React.Dispatch<
    React.SetStateAction<
      "manual" | "auto"
    >
  >;

  winner: CandidateEvaluation | null;
  setWinner: React.Dispatch<
    React.SetStateAction<
      CandidateEvaluation | null
    >
  >;

  results: CandidateEvaluation[];
  setResults: React.Dispatch<
    React.SetStateAction<CandidateEvaluation[]>
  >;

  legalCount: number;
  setLegalCount: React.Dispatch<
    React.SetStateAction<number>
  >;
}

const AppStateContext =
  createContext<AppState | null>(null);

export function AppStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [core, setCore] = useState<
    ElementName[]
  >([
    "Light",
    "Darkness",
    "Fire",
  ]);

  const [anchor, setAnchor] =
    useState("Auto");

  const [mode, setMode] =
    useState<
      "manual" | "auto"
    >("manual");

  const [winner, setWinner] =
    useState<CandidateEvaluation | null>(
      null,
    );

  const [results, setResults] =
    useState<CandidateEvaluation[]>(
      [],
    );

  const [legalCount, setLegalCount] =
    useState(0);

  return (
    <AppStateContext.Provider
      value={{
        core,
        setCore,
        anchor,
        setAnchor,
        mode,
        setMode,
        winner,
        setWinner,
        results,
        setResults,
        legalCount,
        setLegalCount,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context =
    useContext(AppStateContext);

  if (!context) {
    throw new Error(
      "useAppState must be used within AppStateProvider.",
    );
  }

  return context;
}