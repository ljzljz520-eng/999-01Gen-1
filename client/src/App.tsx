import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ScanPage from './pages/ScanPage'
import AdminPage from './pages/AdminPage'

function Nav() {
  const location = useLocation()

  return (
    <nav className="nav">
      <div className="nav-brand">
        <span className="logo">🚗</span>
        <span>汽配条码追踪系统</span>
      </div>
      <div className="nav-links">
        <Link
          to="/"
          className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
        >
          柜台扫码
        </Link>
        <Link
          to="/admin"
          className={`nav-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
        >
          后台管理
        </Link>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<ScanPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  )
}
