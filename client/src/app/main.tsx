import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Landing from '../pages/Landing.tsx'
import Header from "../shared/components/Header.tsx";

createRoot(document.getElementById('root')!).render(
  <>
    <Header />
    <Landing />
  </>
)
