import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchToken,
  getStoredToken,
  logoutSession,
  AUTH_EXPIRED_EVENT,
} from "./api";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initial read picks up a token from either storage tier — local survives
  // a browser restart, session lasts only until the tab closes.
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => {
      setToken(null);
      navigate("/signin", { replace: true });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [navigate]);

  const login = async (
    username: string,
    password: string,
    remember = false,
  ) => {
    const jwt = await fetchToken(username, password, remember);
    setToken(jwt);
  };

  const logout = () => {
    setToken(null);
    // Fire-and-forget: clears local storage immediately, and waits on the
    // server-side cookie clear in the background. The setToken above already
    // navigated the UI away from anything that needs auth.
    void logoutSession();
  };

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: !!token, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
