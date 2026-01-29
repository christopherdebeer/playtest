import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import GamePage from './pages/GamePage'
import MechanicsPage from './pages/MechanicsPage'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/games/:gameId" element={<GamePage />} />
        <Route path="/mechanics" element={<MechanicsPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
