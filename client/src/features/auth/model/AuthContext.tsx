import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode,
} from 'react'
import { getUserProfile } from '@/entities/user'
import {
    loginUser,
    registerUser,
    refreshToken,
    type LoginData,
    type RegisterData,
} from '../api/authApi'
import type { User } from '@/entities/user'

interface AuthContextType {
    user: User | null
    isAuthenticated: boolean
    isLoading: boolean
    login: (data: LoginData) => Promise<void>
    register: (data: RegisterData) => Promise<void>
    logout: () => void
    refreshAuthToken: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
    children: ReactNode
}

const getStoredTokens = () => ({
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
})

const saveTokens = (tokens: { access: string; refresh: string }) => {
    localStorage.setItem('access_token', tokens.access)
    localStorage.setItem('refresh_token', tokens.refresh)
}

const clearTokens = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const isAuthenticated = !!user

    const refreshAuthToken = async () => {
        const { refreshToken: storedRefreshToken } = getStoredTokens()
        if (!storedRefreshToken) throw new Error('No refresh token available')

        const response = await refreshToken(storedRefreshToken)
        localStorage.setItem('access_token', response.access)
        const $host = (window as unknown as { $host: { defaults: { headers: { common: Record<string, string> } } } }).$host
        if ($host) {
            $host.defaults.headers.common['Authorization'] = `Bearer ${response.access}`
        }
    }

    useEffect(() => {
        const checkAuth = async () => {
            const { accessToken } = getStoredTokens()
            if (accessToken) {
                try {
                    const userData = await getUserProfile()
                    setUser(userData)
                } catch {
                    try {
                        await refreshAuthToken()
                        const userData = await getUserProfile()
                        setUser(userData)
                    } catch {
                        clearTokens()
                    }
                }
            }
            setIsLoading(false)
        }
        checkAuth()
    }, [])

    useEffect(() => {
        const { accessToken } = getStoredTokens()
        if (accessToken) {
            const $host = (window as unknown as { $host: { defaults: { headers: { common: Record<string, string> } } } }).$host
            if ($host) {
                $host.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
            }
        }
    }, [user])

    const login = async (data: LoginData) => {
        const response = await loginUser(data)
        saveTokens(response.tokens)
        setUser(response.user)
        const $host = (window as unknown as { $host: { defaults: { headers: { common: Record<string, string> } } } }).$host
        if ($host) {
            $host.defaults.headers.common['Authorization'] = `Bearer ${response.tokens.access}`
        }
    }

    const register = async (data: RegisterData) => {
        const response = await registerUser(data)
        saveTokens(response.tokens)
        setUser(response.user)
        const $host = (window as unknown as { $host: { defaults: { headers: { common: Record<string, string> } } } }).$host
        if ($host) {
            $host.defaults.headers.common['Authorization'] = `Bearer ${response.tokens.access}`
        }
    }

    const logout = () => {
        clearTokens()
        setUser(null)
        const $host = (window as unknown as { $host: { defaults: { headers: { common: Record<string, string> } } } }).$host
        if ($host) {
            delete $host.defaults.headers.common['Authorization']
        }
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated,
                isLoading,
                login,
                register,
                logout,
                refreshAuthToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
