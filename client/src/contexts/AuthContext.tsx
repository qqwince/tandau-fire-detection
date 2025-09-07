import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, AuthResponse, LoginData, RegisterData, loginUser, registerUser, getUserProfile, refreshToken } from '../http/auth.ts'

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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const isAuthenticated = !!user

    // Загрузка токенов из localStorage
    const getStoredTokens = () => {
        const accessToken = localStorage.getItem('access_token')
        const refreshToken = localStorage.getItem('refresh_token')
        return { accessToken, refreshToken }
    }

    // Сохранение токенов в localStorage
    const saveTokens = (tokens: { access: string; refresh: string }) => {
        localStorage.setItem('access_token', tokens.access)
        localStorage.setItem('refresh_token', tokens.refresh)
    }

    // Удаление токенов из localStorage
    const clearTokens = () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
    }

    // Обновление токена доступа
    const refreshAuthToken = async () => {
        const { refreshToken: storedRefreshToken } = getStoredTokens()
        if (!storedRefreshToken) {
            throw new Error('No refresh token available')
        }

        try {
            const response = await refreshToken(storedRefreshToken)
            localStorage.setItem('access_token', response.access)
            // Обновляем заголовок по умолчанию для axios
            const $host = (window as any).$host
            if ($host) {
                $host.defaults.headers.common['Authorization'] = `Bearer ${response.access}`
            }
        } catch (error) {
            console.error('Token refresh failed:', error)
            logout()
            throw error
        }
    }

    // Проверка аутентификации при загрузке
    useEffect(() => {
        const checkAuth = async () => {
            const { accessToken } = getStoredTokens()
            if (accessToken) {
                try {
                    const userData = await getUserProfile()
                    setUser(userData)
                } catch (error) {
                    console.error('Auth check failed:', error)
                    // Попробуем обновить токен
                    try {
                        await refreshAuthToken()
                        const userData = await getUserProfile()
                        setUser(userData)
                    } catch (refreshError) {
                        console.error('Token refresh failed:', refreshError)
                        clearTokens()
                    }
                }
            }
            setIsLoading(false)
        }

        checkAuth()
    }, [])

    // Настройка перехватчика для автоматического обновления токенов
    useEffect(() => {
        const { accessToken } = getStoredTokens()
        if (accessToken) {
            // Устанавливаем токен в заголовки по умолчанию
            const $host = (window as any).$host
            if ($host) {
                $host.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
            }
        }
    }, [user])

    const login = async (data: LoginData) => {
        try {
            const response: AuthResponse = await loginUser(data)
            saveTokens(response.tokens)
            setUser(response.user)
            
            // Устанавливаем токен в заголовки
            const $host = (window as any).$host
            if ($host) {
                $host.defaults.headers.common['Authorization'] = `Bearer ${response.tokens.access}`
            }
        } catch (error) {
            console.error('Login failed:', error)
            throw error
        }
    }

    const register = async (data: RegisterData) => {
        try {
            const response: AuthResponse = await registerUser(data)
            saveTokens(response.tokens)
            setUser(response.user)
            
            // Устанавливаем токен в заголовки
            const $host = (window as any).$host
            if ($host) {
                $host.defaults.headers.common['Authorization'] = `Bearer ${response.tokens.access}`
            }
        } catch (error) {
            console.error('Registration failed:', error)
            throw error
        }
    }

    const logout = () => {
        clearTokens()
        setUser(null)
        
        // Удаляем токен из заголовков
        const $host = (window as any).$host
        if ($host) {
            delete $host.defaults.headers.common['Authorization']
        }
    }

    const value: AuthContextType = {
        user,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        refreshAuthToken,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
