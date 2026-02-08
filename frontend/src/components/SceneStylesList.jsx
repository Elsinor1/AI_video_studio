import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

const EXAMPLE_DESCRIPTION = `Cinematic style with dramatic lighting and emotional depth.
Use close-up shots for emotional moments, wide shots for establishing scenes.
Focus on character expressions and body language.
Mood: contemplative, introspective, with soft shadows and warm color tones.
Camera movement: slow, deliberate pans and subtle zooms.`

function SceneStylesList() {
  const [styles, setStyles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parameters: '{}'
  })

  useEffect(() => {
    loadStyles()
  }, [])

  const loadStyles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/scene-styles`)
      setStyles(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading scene styles:', error)
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setFormData({ name: '', description: '', parameters: '{}' })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (style) => {
    setFormData({
      name: style.name,
      description: style.description || '',
      parameters: style.parameters || '{}'
    })
    setEditingId(style.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    // Validate required fields
    if (!formData.name.trim()) {
      alert('Please enter a scene style name')
      return
    }
    if (!formData.description.trim()) {
      alert('Please enter a scene style description')
      return
    }

    try {
      // Validate JSON if parameters provided
      if (formData.parameters && formData.parameters.trim() !== '' && formData.parameters !== '{}') {
        JSON.parse(formData.parameters)
      } else {
        // Set to empty JSON if not provided
        formData.parameters = '{}'
      }
      
      if (editingId) {
        await axios.put(`${API_BASE}/scene-styles/${editingId}`, formData)
      } else {
        await axios.post(`${API_BASE}/scene-styles`, formData)
      }
      setShowForm(false)
      loadStyles()
    } catch (error) {
      if (error.response) {
        alert('Error saving scene style: ' + (error.response.data.detail || error.message))
      } else if (error instanceof SyntaxError) {
        alert('Invalid JSON in parameters field. Please fix or leave empty.')
      } else {
        alert('Error saving scene style')
      }
    }
  }

  const handleDelete = async (styleId) => {
    if (!window.confirm('Are you sure you want to delete this scene style?')) {
      return
    }

    try {
      await axios.delete(`${API_BASE}/scene-styles/${styleId}`)
      loadStyles()
    } catch (error) {
      console.error('Error deleting scene style:', error)
      alert('Error deleting scene style')
    }
  }

  const formatParameters = (params) => {
    try {
      const parsed = JSON.parse(params)
      if (Object.keys(parsed).length === 0) {
        return 'No additional parameters'
      }
      return Object.entries(parsed).map(([key, value]) => `${key}: ${value}`).join(', ')
    } catch {
      return params || 'No additional parameters'
    }
  }

  if (loading) {
    return <div className="card">Loading scene styles...</div>
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Scene Styles</h2>
        <button className="btn btn-primary" onClick={handleCreate}>
          + New Scene Style
        </button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '4px', marginBottom: '20px', background: '#f9f9f9' }}>
          <h3>{editingId ? 'Edit Scene Style' : 'New Scene Style'}</h3>
          <input
            type="text"
            placeholder="Scene Style Name (e.g., 'Cinematic', 'Documentary', 'Dramatic')"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{ width: '100%', marginBottom: '10px' }}
          />
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Scene Style Description <span style={{ color: 'red' }}>*</span>:
            </label>
            <textarea
              placeholder="Enter a detailed scene style description (camera angles, lighting, mood, etc.)..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%', minHeight: '200px', marginBottom: '5px' }}
              required
            />
            <div style={{ marginBottom: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFormData({ ...formData, description: EXAMPLE_DESCRIPTION })}
                style={{ fontSize: '12px', padding: '5px 10px' }}
              >
                Load Example
              </button>
            </div>
            <small style={{ color: '#666' }}>
              Describe the scene style including camera angles, lighting, mood, and visual approach. This will be used when generating visual descriptions for scenes.
            </small>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Additional Parameters (JSON, optional):
            </label>
            <textarea
              placeholder='Optional JSON parameters: {"camera_angle": "close-up", "mood": "dramatic", "lighting": "low-key"}'
              value={formData.parameters}
              onChange={(e) => setFormData({ ...formData, parameters: e.target.value })}
              style={{ width: '100%', minHeight: '80px', fontFamily: 'monospace', fontSize: '12px', marginBottom: '5px' }}
            />
            <small style={{ color: '#666' }}>
              Optional: JSON format for structured parameters. Leave as {} if not needed.
            </small>
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)} style={{ marginLeft: '10px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {styles.length === 0 ? (
        <p>No scene styles yet. Create your first scene style to get started!</p>
      ) : (
        <div>
          {styles.map((style) => (
            <div key={style.id} className="scene-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h3>{style.name}</h3>
                  {style.description && (
                    <div style={{ color: '#666', marginTop: '5px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {style.description}
                    </div>
                  )}
                  {style.parameters && formatParameters(style.parameters) !== 'No additional parameters' && (
                    <p style={{ fontSize: '12px', color: '#999', marginTop: '10px', fontStyle: 'italic' }}>
                      Additional parameters: {formatParameters(style.parameters)}
                    </p>
                  )}
                </div>
                <div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleEdit(style)}
                    style={{ marginRight: '10px' }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(style.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SceneStylesList
