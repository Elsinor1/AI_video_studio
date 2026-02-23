import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

const SCRIPT_AI_MODELS = [
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
  { id: 'gpt-5.1', label: 'GPT-5.1' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  { id: 'gpt-5-nano', label: 'GPT-5 nano' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { id: 'gpt-4', label: 'GPT-4' },
  { id: 'claude-opus-4-6', label: 'Claude 4.6 Opus' },
]

function ScriptEditor({ script, onSave, onApprove, onBack, onNext, onDelete }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scriptPromptId, setScriptPromptId] = useState('')
  const [scriptPrompts, setScriptPrompts] = useState([])
  const [scriptModelId, setScriptModelId] = useState('gpt-4')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [iterateFeedback, setIterateFeedback] = useState('')
  const [iterating, setIterating] = useState(false)
  const [lastRound, setLastRound] = useState(null)

  useEffect(() => {
    if (script) {
      setTitle(script.title || '')
      setContent(script.script_content || '')
    }
  }, [script])

  useEffect(() => {
    const loadScriptPrompts = async () => {
      try {
        const response = await axios.get(`${API_BASE}/script-prompts`)
        setScriptPrompts(response.data)
        if (response.data.length > 0 && !scriptPromptId) {
          setScriptPromptId(String(response.data[0].id))
        }
      } catch (err) {
        console.error('Error loading script prompts:', err)
      }
    }
    loadScriptPrompts()
  }, [])

  const handleGenerateScript = async () => {
    if (!description.trim()) {
      alert('Please enter a short description of the project script')
      return
    }
    if (!scriptPromptId) {
      alert('Please select a script prompt')
      return
    }
    setGenerating(true)
    try {
      const response = await axios.post(`${API_BASE}/generate-script`, {
        title: title || undefined,
        description: description.trim(),
        script_prompt_id: parseInt(scriptPromptId, 10),
        model: scriptModelId || 'gpt-4',
      })
      setContent(response.data.script_content || '')
    } catch (error) {
      console.error('Error generating script:', error)
      alert(error.response?.data?.detail || 'Failed to generate script')
    } finally {
      setGenerating(false)
    }
  }

  const handleIterate = async () => {
    if (!script || !iterateFeedback.trim()) {
      alert('Enter feedback to revise the script')
      return
    }
    setIterating(true)
    try {
      const response = await axios.post(`${API_BASE}/projects/${script.id}/script/iterate`, {
        feedback: iterateFeedback.trim(),
        model: scriptModelId || 'gpt-4',
      })
      setContent(response.data.script_content || '')
      setLastRound(response.data.round_number)
      setIterateFeedback('')
    } catch (error) {
      console.error('Error revising script:', error)
      alert(error.response?.data?.detail || 'Failed to revise script')
    } finally {
      setIterating(false)
    }
  }

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
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ flexShrink: 0 }}>
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

        <div style={{ marginTop: '12px', marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
            AI model (script generation & revisions)
          </label>
          <select
            value={scriptModelId}
            onChange={(e) => setScriptModelId(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
          >
            {SCRIPT_AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {!script && (
          <>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                Short description of the project script
              </label>
              <textarea
                placeholder="Describe what the script should be about (e.g. topic, tone, target audience)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', minHeight: '80px', marginBottom: '8px' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                Script prompt (style / instructions)
              </label>
              <select
                value={scriptPromptId}
                onChange={(e) => setScriptPromptId(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                <option value="">-- Select a script prompt --</option>
                {scriptPrompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateScript}
              disabled={generating || !description.trim() || !scriptPromptId}
              style={{ marginBottom: '16px' }}
            >
              {generating ? 'Generating...' : 'Generate Script'}
            </button>
          </>
        )}

        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
          Script content
        </label>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <textarea
          placeholder="Enter your script content here or generate it above..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: '100%',
            flex: 1,
            minHeight: 0,
            fontSize: '16px',
            lineHeight: '1.5',
            padding: '12px',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            resize: 'none',
            overflow: 'auto',
          }}
        />
      </div>

      <div style={{ flexShrink: 0 }}>
      {script && content.trim() && (
        <div style={{ marginTop: '20px', padding: '16px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-surface-alt)' }}>
          <h3 style={{ marginTop: 0 }}>Iterate on script</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Give feedback to revise the script. Only the last 5 feedback rounds are sent as context (sliding window).
          </p>
          <textarea
            placeholder="e.g. Make the intro shorter, add more dialogue in scene 2..."
            value={iterateFeedback}
            onChange={(e) => setIterateFeedback(e.target.value)}
            style={{ width: '100%', minHeight: '80px', marginBottom: '10px' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleIterate}
            disabled={iterating || !iterateFeedback.trim()}
          >
            {iterating ? 'Revising...' : 'Revise script'}
          </button>
          {lastRound != null && (
            <span style={{ marginLeft: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
              Last revision: round {lastRound}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
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
    </div>
  )
}

export default ScriptEditor

