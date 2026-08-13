import { createContext, useContext } from 'react';

export const RANK = { developer: 4, manager: 3, staff: 2, client: 1 };

export function hasRole(user, minRole) {
  return (RANK[user?.role] || 0) >= (RANK[minRole] || 0);
}

const AuthContext = createContext({ user: null });

export function AuthProvider({ user, children }) {
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}