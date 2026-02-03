import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ScriptEditor({ script, onSave, onApprove, onBack, onNext, onDelete }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (script) {
      setTitle(script.title || '')
      setContent(script.script_content || '')
    }
  }, [script])

  const handleSave = async () => {
    setSaving(true)
    try {
      let savedScript = script
      if (script) {
        const response = await axios.put(`${API_BASE}/projects/${script.id}`, {
          title,
          script_content: content,
        })
        savedScript = response.data
      } else {
        const response = await axios.post(`${API_BASE}/projects`, {
          title,
          script_content: content,
        })
        savedScript = response.data
      }
      onSave(savedScript)
    } catch (error) {
      console.error('Error saving project:', error)
      alert('Error saving project')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!script) {
      alert('Please save the project first')
      return
    }

    if (!window.confirm('Approve this project and start scene segmentation?')) {
      return
    }

    setLoading(true)
    try {
      // Save any edits before approving
      await axios.put(`${API_BASE}/projects/${script.id}`, {
        title,
        script_content: content,
      })
      
      // Then approve
      await axios.post(`${API_BASE}/projects/${script.id}/approve`)
      onApprove()
    } catch (error) {
      console.error('Error approving project:', error)
      alert('Error approving project')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!script) {
      return
    }

    if (!window.confirm('Are you sure you want to delete this project? This will also delete all associated scenes, images, and videos.')) {
      return
    }

    setDeleting(true)
    try {
      await axios.delete(`${API_BASE}/projects/${script.id}`)
      alert('Project deleted successfully')
      if (onDelete) {
        onDelete()
      }
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Error deleting project')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{script ? 'Edit Project' : 'New Project'}</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
      </div>

      <input
        type="text"
        placeholder="Project Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="Enter your script content here..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !content.trim()}
        >
          {saving ? 'Saving...' : 'Save Project'}
        </button>

        {script && (
          <>
            <button
              className="btn btn-success"
              onClick={handleApprove}
              disabled={loading || script.status === 'approved'}
            >
              {loading ? 'Processing...' : script.status === 'approved' ? 'Approved ✓' : 'Approve & Segment'}
            </button>

            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={deleting}
              style={{ marginLeft: 'auto' }}
            >
              {deleting ? 'Deleting...' : 'Delete Project'}
            </button>
          </>
        )}

        {script && script.status === 'approved' && (
          <button className="btn btn-primary" onClick={onNext}>
            View Scenes →
          </button>
        )}
      </div>
    </div>
  )
}

export default ScriptEditor

