/**
 * Auth React Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { User, Store } from '../types/index.ts';
import { api } from '../services/api.ts';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadSession = useCallback(async () => {
    try {
      setLoading(true);
      const token = api.getToken();
      if (token) {
        const data = await api.getMe();
        setUser(data.user);
        setStore(data.store || null);
      } else {
        setUser(null);
        setStore(null);
      }
    } catch {
      api.setToken(null);
      setUser(null);
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email: string) => {
    const data = await api.login(email);
    setUser(data.user);
    setStore(data.store || null);
    return data;
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
    setStore(null);
  };

  return {
    user,
    store,
    loading,
    login,
    logout,
    refresh: loadSession,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === 'SUPERADMIN',
    isStoreAdmin: user?.role === 'ADMIN_COMERCIO',
  };
}
