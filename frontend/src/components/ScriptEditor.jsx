import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ScriptEditor({ script, onSave, onApprove, onBack, onNext }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (script) {
      setTitle(script.title || '')
      setContent(script.content || '')
    }
  }, [script])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (script) {
        await axios.put(`${API_BASE}/scripts/${script.id}`, {
          title,
          content,
        })
      } else {
        const response = await axios.post(`${API_BASE}/scripts`, {
          title,
          content,
        })
        // Update script reference
        script = response.data
      }
      onSave()
      alert('Script saved!')
    } catch (error) {
      console.error('Error saving script:', error)
      alert('Error saving script')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!script) {
      alert('Please save the script first')
      return
    }

    if (!window.confirm('Approve this script and start scene segmentation?')) {
      return
    }

    setLoading(true)
    try {
      await axios.post(`${API_BASE}/scripts/${script.id}/approve`)
      alert('Script approved! Scene segmentation started. Check scenes in a moment.')
      onApprove()
    } catch (error) {
      console.error('Error approving script:', error)
      alert('Error approving script')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>{script ? 'Edit Script' : 'New Script'}</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
      </div>

      <input
        type="text"
        placeholder="Script Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="Enter your script here..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !content.trim()}
        >
          {saving ? 'Saving...' : 'Save Script'}
        </button>

        {script && (
          <button
            className="btn btn-success"
            onClick={handleApprove}
            disabled={loading || script.status === 'approved'}
          >
            {loading ? 'Processing...' : script.status === 'approved' ? 'Approved ✓' : 'Approve & Segment'}
          </button>
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

