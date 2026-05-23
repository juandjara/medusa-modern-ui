import { createContext, useContext } from "react";

// Auth context lives here (not in auth.tsx) so the provider file can export
// only a component — keeps react-refresh's fast-refresh happy and gives us a
// stable, non-component hook for callers.

export interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login: (
    username: string,
    password: string,
    remember?: boolean,
  ) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
