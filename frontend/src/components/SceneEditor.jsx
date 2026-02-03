import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function SceneEditor({ scriptId, onBack, onNext }) {
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [visualStyles, setVisualStyles] = useState([])
  const [selectedStyles, setSelectedStyles] = useState({}) // sceneId -> styleId

  useEffect(() => {
    loadScenes()
    loadVisualStyles()
    // Poll for new scenes (in case segmentation is still running)
    const interval = setInterval(loadScenes, 3000)
    return () => clearInterval(interval)
  }, [scriptId])

  const loadVisualStyles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/visual-styles`)
      setVisualStyles(response.data)
    } catch (error) {
      console.error('Error loading visual styles:', error)
    }
  }

  const loadScenes = async () => {
    try {
      const response = await axios.get(`${API_BASE}/projects/${scriptId}/scenes`)
      setScenes(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading scenes:', error)
      setLoading(false)
    }
  }

  const handleEdit = (scene) => {
    setEditingId(scene.id)
    setEditText(scene.text)
  }

  const handleSaveEdit = async (sceneId) => {
    try {
      await axios.put(`${API_BASE}/scenes/${sceneId}`, {
        text: editText,
      })
      setEditingId(null)
      loadScenes()
    } catch (error) {
      console.error('Error saving scene:', error)
      alert('Error saving scene')
    }
  }

  const handleApprove = async (sceneId) => {
    try {
      // If this scene is currently being edited, save the edits first
      if (editingId === sceneId) {
        await axios.put(`${API_BASE}/scenes/${sceneId}`, {
          text: editText,
        })
        setEditingId(null)
      }
      
      // Get selected visual style for this scene
      const visualStyleId = selectedStyles[sceneId] || null
      
      // Then approve with visual style
      await axios.post(`${API_BASE}/scenes/${sceneId}/approve`, null, {
        params: visualStyleId ? { visual_style_id: visualStyleId } : {}
      })
      alert('Scene approved! Image generation started.')
      loadScenes()
    } catch (error) {
      console.error('Error approving scene:', error)
      alert('Error approving scene')
    }
  }

  const allApproved = scenes.length > 0 && scenes.every(s => s.status === 'approved')

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Scenes ({scenes.length})</h2>
        <div>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {allApproved && (
            <button className="btn btn-primary" onClick={onNext} style={{ marginLeft: '10px' }}>
              View Images →
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p>Loading scenes...</p>
      ) : scenes.length === 0 ? (
        <p>No scenes yet. Scenes will appear here after script segmentation completes.</p>
      ) : (
        <div>
          {scenes.map((scene) => (
            <div key={scene.id} className="scene-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3>Scene {scene.order}</h3>
                <span className={`status-badge status-${scene.status}`}>
                  {scene.status}
                </span>
              </div>

              {editingId === scene.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    style={{ minHeight: '100px' }}
                  />
                  {scene.status !== 'approved' && (
                    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                        Visual Style (optional):
                      </label>
                      <select
                        value={selectedStyles[scene.id] || ''}
                        onChange={(e) => setSelectedStyles({ ...selectedStyles, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                        style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '200px' }}
                      >
                        <option value="">None (default)</option>
                        {visualStyles.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleSaveEdit(scene.id)}
                    >
                      Save
                    </button>
                    {scene.status !== 'approved' && (
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(scene.id)}
                      >
                        Save & Approve
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p>{scene.text}</p>
                  {scene.status !== 'approved' && (
                    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                        Visual Style (optional):
                      </label>
                      <select
                        value={selectedStyles[scene.id] || ''}
                        onChange={(e) => setSelectedStyles({ ...selectedStyles, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                        style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '200px' }}
                      >
                        <option value="">None (default)</option>
                        {visualStyles.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ marginTop: '10px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleEdit(scene)}
                    >
                      Edit
                    </button>
                    {scene.status !== 'approved' && (
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(scene.id)}
                      >
                        Approve & Generate Image
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SceneEditor

