import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchToken,
  clearApiKey,
  clearStoredToken,
  getStoredToken,
  AUTH_EXPIRED_EVENT,
} from "./api";

interface AuthContextValue {
  token: string | null;
  isAuthenticated: boolean;
  login: (
    username: string,
    password: string,
    remember?: boolean,
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initial read picks up a token from either storage tier — local survives
  // a browser restart, session lasts only until the tab closes.
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => {
      setToken(null);
      navigate("/login", { replace: true });
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
    clearStoredToken();
    clearApiKey();
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated: !!token, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
