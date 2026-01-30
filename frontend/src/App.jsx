import React, { useState, useEffect } from 'react'
import axios from 'axios'
import ScriptList from './components/ScriptList'
import ScriptEditor from './components/ScriptEditor'
import SceneEditor from './components/SceneEditor'
import ImageGallery from './components/ImageGallery'
import VideoViewer from './components/VideoViewer'
import './App.css'

const API_BASE = '/api'

function App() {
  const [scripts, setScripts] = useState([])
  const [selectedScript, setSelectedScript] = useState(null)
  const [view, setView] = useState('list') // 'list', 'script', 'scenes', 'images', 'video'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadScripts()
  }, [])

  const loadScripts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/scripts`)
      setScripts(response.data)
    } catch (error) {
      console.error('Error loading scripts:', error)
    }
  }

  const handleCreateScript = () => {
    setSelectedScript(null)
    setView('script')
  }

  const handleSelectScript = (script) => {
    setSelectedScript(script)
    setView('script')
  }

  const handleScriptSaved = () => {
    loadScripts()
    if (selectedScript) {
      setView('scenes')
    }
  }

  const handleScriptApproved = () => {
    loadScripts()
    setTimeout(() => {
      setView('scenes')
    }, 1000)
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🎬 AI Video Creator</h1>
        <p>Workflow: Script → Scenes → Images → Video</p>
      </div>

      {view === 'list' && (
        <ScriptList
          scripts={scripts}
          onSelectScript={handleSelectScript}
          onCreateScript={handleCreateScript}
        />
      )}

      {view === 'script' && (
        <ScriptEditor
          script={selectedScript}
          onSave={handleScriptSaved}
          onApprove={handleScriptApproved}
          onBack={() => {
            setView('list')
            setSelectedScript(null)
          }}
          onNext={() => setView('scenes')}
        />
      )}

      {view === 'scenes' && selectedScript && (
        <SceneEditor
          scriptId={selectedScript.id}
          onBack={() => setView('script')}
          onNext={() => setView('images')}
        />
      )}

      {view === 'images' && selectedScript && (
        <ImageGallery
          scriptId={selectedScript.id}
          onBack={() => setView('scenes')}
          onNext={() => setView('video')}
        />
      )}

      {view === 'video' && selectedScript && (
        <VideoViewer
          scriptId={selectedScript.id}
          onBack={() => setView('images')}
        />
      )}
    </div>
  )
}

export default App

