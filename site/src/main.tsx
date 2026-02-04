import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import GamePage from './pages/GamePage'
import MechanicsPage from './pages/MechanicsPage'
import MechanicDetailPage from './pages/MechanicDetailPage'
import LogsPage from './pages/LogsPage'
import LogDetailPage from './pages/LogDetailPage'
import DocsPage from './pages/DocsPage'
import DocDetailPage from './pages/DocDetailPage'
import ScrollToTop from './components/ScrollToTop'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/games/:gameId" element={<GamePage />} />
          <Route path="/mechanics" element={<MechanicsPage />} />
          <Route path="/mechanics/:mechanicSlug" element={<MechanicDetailPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/logs/:logId" element={<LogDetailPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:docSlug" element={<DocDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
