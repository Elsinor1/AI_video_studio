import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

function NavigationBar() {
  const navigate = useNavigate()
  const location = useLocation()

  const isHomePage = location.pathname === '/'

  return (
    <nav className="navbar">
      <div className="navbar-content">
        <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <h1>🎬 AI Video Creator</h1>
        </div>
        <div className="navbar-links">
          <button
            className={`navbar-link ${isHomePage ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            Projects
          </button>
          <button
            className={`navbar-link ${location.pathname === '/styles' ? 'active' : ''}`}
            onClick={() => navigate('/styles')}
          >
            Visual Styles
          </button>
        </div>
      </div>
    </nav>
  )
}

export default NavigationBar
