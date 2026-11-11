// Auth Context — global authentication state
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authAPI } from '../services/api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: Record<string, string>) => Promise<void>
  logout: () => Promise<void>
  isAdmin: () => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('landguard_token')
    const savedUser = localStorage.getItem('landguard_user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      try { setUser(JSON.parse(savedUser)) } catch { /* invalid */ }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authAPI.login({ email, password })
    const { token: t, user: u } = res.data
    setToken(t)
    setUser(u)
    localStorage.setItem('landguard_token', t)
    localStorage.setItem('landguard_user', JSON.stringify(u))
  }

  const signup = async (data: Record<string, string>) => {
    const res = await authAPI.signup(data)
    const { token: t, user: u } = res.data
    setToken(t)
    setUser(u)
    localStorage.setItem('landguard_token', t)
    localStorage.setItem('landguard_user', JSON.stringify(u))
  }

  const logout = async () => {
    try { await authAPI.logout() } catch { /* ignore */ }
    setToken(null)
    setUser(null)
    localStorage.removeItem('landguard_token')
    localStorage.removeItem('landguard_user')
  }

  const isAdmin = () => user?.role === 'ADMIN'

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
