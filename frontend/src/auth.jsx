import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler } from './api.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null)) // expired session anywhere -> back to login
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true))
  }, [])

  const login = useCallback(async (username, password) => setUser(await api.login(username, password)), [])
  const logout = useCallback(async () => {
    try { await api.logout() } finally { setUser(null) }
  }, [])
  // The server enforces every permission; this only decides which buttons to show.
  const can = useCallback((perm) => !!user?.permissions.includes(perm), [user])

  return <AuthContext.Provider value={{ user, ready, login, logout, can }}>{children}</AuthContext.Provider>
}
