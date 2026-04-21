import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { trpc } from './trpc';
import { setMobileAuthToken } from './mobileAuthToken';

const TOKEN_KEY = 'florida-lotto.session-token.v1';
const USER_KEY = 'florida-lotto.session-user.v1';

export type MobileSessionUser = {
  openId: string;
  name: string;
  email: string | null;
  role: string;
};

type AuthSessionContextValue = {
  clearError: () => void;
  error: string | null;
  isAuthenticated: boolean;
  isBusy: boolean;
  isLoaded: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  user: MobileSessionUser | null;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSessionUser(value: unknown): MobileSessionUser | null {
  if (!isObject(value) || typeof value.openId !== 'string' || value.openId.trim().length === 0) {
    return null;
  }

  return {
    openId: value.openId.trim(),
    name: typeof value.name === 'string' ? value.name : '',
    email: typeof value.email === 'string' && value.email.length > 0 ? value.email : null,
    role: typeof value.role === 'string' && value.role.length > 0 ? value.role : 'user',
  };
}

function parseStoredUser(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return normalizeSessionUser(JSON.parse(value));
  } catch {
    return null;
  }
}

async function requireSecureStorage() {
  const available = await SecureStore.isAvailableAsync().catch(() => false);
  if (!available) {
    throw new Error('Secure session storage is not available on this device.');
  }
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileSessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const clearSession = useCallback(async () => {
    setMobileAuthToken(null);
    setSessionToken(null);
    setUser(null);
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined),
      SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined),
    ]);
  }, []);

  const applySession = useCallback(async (token: string, nextUser: MobileSessionUser) => {
    await requireSecureStorage();
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(nextUser)),
    ]);
    setMobileAuthToken(token);
    setSessionToken(token);
    setUser(nextUser);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        await requireSecureStorage();
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);

        if (!active) {
          return;
        }

        const token = storedToken && storedToken.trim().length > 0 ? storedToken.trim() : null;
        if (token) {
          setMobileAuthToken(token);
          setSessionToken(token);
          setUser(parseStoredUser(storedUser));
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to restore the mobile session.');
        }
      } finally {
        if (active) {
          setIsLoaded(true);
        }
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, []);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isLoaded && Boolean(sessionToken),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoaded || !sessionToken || !meQuery.isSuccess) {
      return;
    }

    const refreshedUser = normalizeSessionUser(meQuery.data);
    if (refreshedUser) {
      setUser(refreshedUser);
      void SecureStore.setItemAsync(USER_KEY, JSON.stringify(refreshedUser)).catch(() => undefined);
      return;
    }

    void clearSession();
    setError('Your session could not be restored. Sign in again to upload ticket images.');
  }, [clearSession, isLoaded, meQuery.data, meQuery.isSuccess, sessionToken]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const result = await loginMutation.mutateAsync({
      email: email.trim(),
      password,
    });

    if (!result.success) {
      throw new Error(result.message || 'Invalid email or password.');
    }

    const nextUser = normalizeSessionUser(result.user);
    if (!result.sessionToken || !nextUser) {
      throw new Error('The server did not return a mobile session. Try again.');
    }

    await applySession(result.sessionToken, nextUser);
  }, [applySession, loginMutation]);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    setError(null);
    const result = await registerMutation.mutateAsync({
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password,
    });

    const nextUser = normalizeSessionUser(result.user);
    if (!result.sessionToken || !nextUser) {
      throw new Error('The server did not return a mobile session. Try again.');
    }

    await applySession(result.sessionToken, nextUser);
  }, [applySession, registerMutation]);

  const logout = useCallback(async () => {
    setError(null);
    try {
      if (sessionToken) {
        await logoutMutation.mutateAsync();
      }
    } catch {
      // Bearer sessions are cleared locally even if the cookie-clearing request fails.
    } finally {
      await clearSession();
    }
  }, [clearSession, logoutMutation, sessionToken]);

  const value = useMemo<AuthSessionContextValue>(() => ({
    clearError: () => setError(null),
    error,
    isAuthenticated: Boolean(sessionToken),
    isBusy: loginMutation.isPending || registerMutation.isPending || logoutMutation.isPending,
    isLoaded,
    login,
    logout,
    register,
    user,
  }), [
    error,
    isLoaded,
    login,
    loginMutation.isPending,
    logout,
    logoutMutation.isPending,
    register,
    registerMutation.isPending,
    sessionToken,
    user,
  ]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext);
  if (!value) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider');
  }
  return value;
}
