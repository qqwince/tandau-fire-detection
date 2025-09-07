import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Landing from '../pages/Landing.tsx'
import Login from '../pages/Login.tsx'
import Header from '../shared/components/Header.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import FireList from '../pages/FireList.tsx'
import { AuthProvider } from '../contexts/AuthContext'

const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <>
                <Header />
                <Landing />
            </>
        ),
    },
    {
        path: '/fires',
        element: (
            <>
                <Header />
                <FireList />
            </>
        ),
    },
    {
        path: '/login',
        element: (
            <>
                <Header />
                <Login />
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
