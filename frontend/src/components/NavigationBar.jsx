import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

function NavigationBar({ theme = 'light', onToggleTheme }) {
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
            type="button"
            className="navbar-link theme-toggle"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
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
          <button
            className={`navbar-link ${location.pathname === '/scene-styles' ? 'active' : ''}`}
            onClick={() => navigate('/scene-styles')}
          >
            Scene Styles
          </button>
          <button
            className={`navbar-link ${location.pathname === '/script-prompts' ? 'active' : ''}`}
            onClick={() => navigate('/script-prompts')}
          >
            Script Prompts
          </button>
          <button
            className={`navbar-link ${location.pathname === '/image-references' ? 'active' : ''}`}
            onClick={() => navigate('/image-references')}
          >
            Image References
          </button>
          <button
            className={`navbar-link ${location.pathname === '/voices' ? 'active' : ''}`}
            onClick={() => navigate('/voices')}
          >
            Voices
          </button>
        </div>
      </div>
    </nav>
  )
}

export default NavigationBar
