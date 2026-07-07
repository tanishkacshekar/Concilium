import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { apiBaseUrl, fetchMe, login as apiLogin, register as apiRegister, ApiUser, TokenResponse } from "@/lib/api";

const TOKEN_KEY = "meetingMonitorToken";
const USER_KEY = "meetingMonitorUser";

interface AuthContextValue {
  user: ApiUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    skills?: string[];
    avatar?: string | null;
  }) => Promise<void>;
  logout: () => void;
  setUser: (user: ApiUser | null) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [user, setUserState] = useState<ApiUser | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) return JSON.parse(raw) as ApiUser;
    } catch {}
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const setUser = useCallback((u: ApiUser | null) => {
    setUserState(u);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const u = await fetchMe(token);
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, [token, setUser]);

  useEffect(() => {
    if (!token) {
      setUserState(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    fetchMe(token)
      .then((u) => {
        if (!cancelled) {
          setUserState(u);
          localStorage.setItem(USER_KEY, JSON.stringify(u));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          setUserState(null);
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: newToken, user: u } = await apiLogin(email, password);
      localStorage.setItem(TOKEN_KEY, newToken.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setToken(newToken.access_token);
      setUserState(u);
    },
    []
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      role: string;
      skills?: string[];
      avatar?: string | null;
    }) => {
      await apiRegister(data);
      // Auto-login after register so user is signed in and profile is stored
      const { token: newToken, user: u } = await apiLogin(data.email, data.password);
      localStorage.setItem(TOKEN_KEY, newToken.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setToken(newToken.access_token);
      setUserState(u);
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUserState(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, token, isLoading, login, register, logout, setUser, refreshUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
