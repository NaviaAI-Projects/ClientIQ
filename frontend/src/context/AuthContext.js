import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const BASE_URL = 'http://localhost:5000/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser]   = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [ready, setReady] = useState(false);

  // On every app load — fetch fresh user data from /auth/me
  // This ensures permissions changes take effect immediately without re-login
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) { setReady(true); return; }

    axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` }
    })
    .then(res => {
      const freshUser = res.data;
      setUser(freshUser);
      setToken(storedToken);
      // Update localStorage with fresh data including latest permissions
      localStorage.setItem('user', JSON.stringify(freshUser));
    })
    .catch(() => {
      // Token expired or invalid — clear everything
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      setUser(null);
      setToken(null);
    })
    .finally(() => setReady(true));
  }, []);

  const login = (userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', tokenData);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  // Refresh user data from API (call this after saving permissions)
  const refreshUser = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) return;
    try {
      const res = await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${storedToken}` }
      });
      const freshUser = res.data;
      setUser(freshUser);
      localStorage.setItem('user', JSON.stringify(freshUser));
    } catch (e) { console.error('Failed to refresh user', e); }
  };

  // Don't render children until we've fetched fresh user data
  if (!ready) return null;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);