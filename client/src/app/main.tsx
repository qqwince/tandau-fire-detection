import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Landing from '../pages/Landing.tsx'
import Login from '../pages/Login.tsx'
import Header from '../shared/components/Header.tsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom' // ✅ правильно

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
        path: '/firesites',
        element: (
            <>
                <Header />
                <div>hey</div>
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
        <RouterProvider router={router} />
    </StrictMode>
)
