import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ScriptPromptsList() {
  const [prompts, setPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    script_description: ''
  })

  useEffect(() => {
    loadPrompts()
  }, [])

  const loadPrompts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/script-prompts`)
      setPrompts(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading script prompts:', error)
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setFormData({ name: '', script_description: '' })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (prompt) => {
    setFormData({
      name: prompt.name,
      script_description: prompt.script_description || ''
    })
    setEditingId(prompt.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a name')
      return
    }
    if (!formData.script_description.trim()) {
      alert('Please enter a script description')
      return
    }

    try {
      if (editingId) {
        await axios.put(`${API_BASE}/script-prompts/${editingId}`, formData)
      } else {
        await axios.post(`${API_BASE}/script-prompts`, formData)
      }
      setShowForm(false)
      loadPrompts()
    } catch (error) {
      if (error.response) {
        alert('Error saving script prompt: ' + (error.response.data.detail || error.message))
      } else {
        alert('Error saving script prompt')
      }
    }
  }

  const handleDelete = async (promptId) => {
    if (!window.confirm('Are you sure you want to delete this script prompt?')) {
      return
    }
    try {
      await axios.delete(`${API_BASE}/script-prompts/${promptId}`)
      loadPrompts()
    } catch (error) {
      console.error('Error deleting script prompt:', error)
      alert('Error deleting script prompt')
    }
  }

  if (loading) {
    return <div className="card">Loading script prompts...</div>
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Script Prompts</h2>
        <button className="btn btn-primary" onClick={handleCreate}>
          + New Script Prompt
        </button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '4px', marginBottom: '20px', background: '#f9f9f9' }}>
          <h3>{editingId ? 'Edit Script Prompt' : 'New Script Prompt'}</h3>
          <input
            type="text"
            placeholder="Name (e.g., 'Documentary', 'Tutorial', 'Story')"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{ width: '100%', marginBottom: '10px' }}
          />
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Script Description <span style={{ color: 'red' }}>*</span>:
            </label>
            <textarea
              placeholder="Enter instructions or description for script generation..."
              value={formData.script_description}
              onChange={(e) => setFormData({ ...formData, script_description: e.target.value })}
              style={{ width: '100%', minHeight: '200px', marginBottom: '5px' }}
              required
            />
            <small style={{ color: '#666' }}>
              Describe the tone, structure, or style you want when generating scripts. This will be used as context for script creation.
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

      {prompts.length === 0 ? (
        <p>No script prompts yet. Create your first one to get started!</p>
      ) : (
        <div>
          {prompts.map((prompt) => (
            <div key={prompt.id} className="scene-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h3>{prompt.name}</h3>
                  {prompt.script_description && (
                    <div style={{ color: '#666', marginTop: '5px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {prompt.script_description}
                    </div>
                  )}
                </div>
                <div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleEdit(prompt)}
                    style={{ marginRight: '10px' }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleDelete(prompt.id)}
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

export default ScriptPromptsList
