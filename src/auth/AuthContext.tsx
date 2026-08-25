import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { ApiError, apiRequest } from "../api/client";

import {
  clearAuthSession,
  Employee,
  getStoredEmployee,
  getStoredToken,
  saveAuthSession,
} from "../auth/authStorage";

import { ensureDeviceRegistered } from "@/crypto/deviceRegistration";

type LoginResponse = {
  message: string;
  token: string;

  employee: Employee;
};

type MeResponse = {
  employee: Employee;
};

type AuthContextType = {
  token: string | null;
  employee: Employee | null;

  isLoading: boolean;
  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;

  logout: () => Promise<void>;

  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(null);

  const [employee, setEmployee] = useState<Employee | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const clearLocalAuth = useCallback(async () => {
    await clearAuthSession();

    setToken(null);

    setEmployee(null);
  }, []);

  const verifyStoredSession = useCallback(
    async (storedToken: string) => {
      try {
        const response = await apiRequest<MeResponse>("/me", {
          method: "GET",
          token: storedToken,
        });

        setEmployee(response.employee);

        await saveAuthSession(storedToken, response.employee);
      } catch (error) {
        /*
                    |--------------------------------------------------------------------------
                    | 401 = Token is no longer valid
                    |--------------------------------------------------------------------------
                    */

        if (error instanceof ApiError && error.status === 401) {
          await clearLocalAuth();

          return;
        }

        /*
                    |--------------------------------------------------------------------------
                    | Network Failure
                    |--------------------------------------------------------------------------
                    |
                    | Do nothing.
                    |
                    | The previously authenticated employee is allowed to keep
                    | using the locally stored session while offline.
                    |
                    */
      }
    },
    [clearLocalAuth],
  );

  const restoreSession = useCallback(async () => {
    try {
      const [storedToken, storedEmployee] = await Promise.all([
        getStoredToken(),
        getStoredEmployee(),
      ]);

      if (!storedToken || !storedEmployee) {
        await clearLocalAuth();

        return;
      }

      /*
                    |--------------------------------------------------------------------------
                    | Restore Local Session Immediately
                    |--------------------------------------------------------------------------
                    |
                    | We do not require Laravel to be reachable just to open
                    | GradeLens.
                    |
                    */

      setToken(storedToken);

      setEmployee(storedEmployee);

      /*
                    |--------------------------------------------------------------------------
                    | Verify Online In Background
                    |--------------------------------------------------------------------------
                    */

      void verifyStoredSession(storedToken);
    } finally {
      setIsLoading(false);
    }
  }, [clearLocalAuth, verifyStoredSession]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await apiRequest<LoginResponse>("/login", {
      method: "POST",

      body: JSON.stringify({
        emp_user_name: username,

        password,
      }),
    });

    await saveAuthSession(response.token, response.employee);

    setToken(response.token);

    setEmployee(response.employee);

    try {
      await ensureDeviceRegistered(response.token);
    } catch (error) {
      console.error("Device registration failed:", error);
    }

    setToken(response.token);

    setEmployee(response.employee);
  }, []);

  const logout = useCallback(async () => {
    const currentToken = token;

    /*
                |--------------------------------------------------------------------------
                | Try Laravel Logout
                |--------------------------------------------------------------------------
                |
                | If the device is offline, local logout should still work.
                |
                */

    if (currentToken) {
      try {
        await apiRequest("/logout", {
          method: "POST",
          token: currentToken,
        });
      } catch {
        /*
                        |--------------------------------------------------------------------------
                        | Ignore Network/API Failure
                        |--------------------------------------------------------------------------
                        |
                        | We still clear the device session.
                        |
                        */
      }
    }

    await clearLocalAuth();
  }, [token, clearLocalAuth]);

  const refreshSession = useCallback(async () => {
    if (!token) {
      return;
    }

    await verifyStoredSession(token);
  }, [token, verifyStoredSession]);

  const value: AuthContextType = {
    token,
    employee,

    isLoading,

    isAuthenticated: Boolean(token && employee),

    login,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
