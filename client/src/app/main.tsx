import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import '@/shared/api'
import './styles/index.css'
import './styles/fire-list.css'
import { AuthProvider } from '@/features/auth'
import { Header } from '@/widgets/header'
import { LandingPage } from '@/pages/landing'
import { LoginPage } from '@/pages/login'
import { FireListPage } from '@/pages/fire-list'

const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <>
                <Header />
                <LandingPage />
            </>
        ),
    },
    {
        path: '/fires',
        element: (
            <>
                <Header />
                <FireListPage />
            </>
        ),
    },
    {
        path: '/login',
        element: (
            <>
                <Header />
                <LoginPage />
            </>
        ),
    },
])

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <RouterProvider router={router} />
        </AuthProvider>
    </StrictMode>
)
