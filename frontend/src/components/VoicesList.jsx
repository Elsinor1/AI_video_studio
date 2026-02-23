import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

const ELEVENLABS_MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
  { id: 'eleven_monolingual_v1', label: 'English v1' },
]

const DEFAULT_FORM = {
  name: '',
  elevenlabs_voice_id: '',
  model_id: 'eleven_multilingual_v2',
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  speed: 1.0,
  use_speaker_boost: true,
  language_code: '',
}

function SliderField({ label, value, onChange, min, max, step, suffix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <label style={{ minWidth: '140px', fontSize: '13px', fontWeight: 600 }}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ minWidth: '50px', textAlign: 'right', fontSize: '13px', fontFamily: 'monospace' }}>
        {value.toFixed(2)}{suffix || ''}
      </span>
    </div>
  )
}

function VoicesList() {
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ ...DEFAULT_FORM })

  useEffect(() => {
    loadVoices()
  }, [])

  const loadVoices = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/voices`)
      setVoices(resp.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading voices:', error)
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setFormData({ ...DEFAULT_FORM })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (voice) => {
    setFormData({
      name: voice.name,
      elevenlabs_voice_id: voice.elevenlabs_voice_id,
      model_id: voice.model_id || 'eleven_multilingual_v2',
      stability: voice.stability ?? 0.5,
      similarity_boost: voice.similarity_boost ?? 0.75,
      style: voice.style ?? 0.0,
      speed: voice.speed ?? 1.0,
      use_speaker_boost: voice.use_speaker_boost ?? true,
      language_code: voice.language_code || '',
    })
    setEditingId(voice.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this voice?')) return
    try {
      await axios.delete(`${API_BASE}/voices/${id}`)
      loadVoices()
    } catch (error) {
      alert('Error deleting voice')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...formData,
      language_code: formData.language_code || null,
    }
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/voices/${editingId}`, payload)
      } else {
        await axios.post(`${API_BASE}/voices`, payload)
      }
      setShowForm(false)
      setEditingId(null)
      loadVoices()
    } catch (error) {
      alert('Error saving voice')
    }
  }

  if (loading) return <div className="card">Loading...</div>

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Voices</h2>
        <button className="btn btn-primary" onClick={handleCreate}>+ New Voice</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: '16px', marginBottom: '20px',
          border: '1px solid var(--border)', borderRadius: '6px',
          background: 'var(--bg-surface-alt)',
        }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Voice' : 'New Voice'}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}>Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. George (Narration)"
                required
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}>ElevenLabs Voice ID</label>
              <input
                type="text"
                value={formData.elevenlabs_voice_id}
                onChange={(e) => setFormData({ ...formData, elevenlabs_voice_id: e.target.value })}
                placeholder="e.g. G17SuINrv2H9FC6nvetn"
                required
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}>Model</label>
              <select
                value={formData.model_id}
                onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                style={{ width: '100%', padding: '8px' }}
              >
                {ELEVENLABS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '13px' }}>Language Code (optional)</label>
              <input
                type="text"
                value={formData.language_code}
                onChange={(e) => setFormData({ ...formData, language_code: e.target.value })}
                placeholder="e.g. en, de, fr"
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
          </div>

          <div style={{
            padding: '12px', border: '1px solid var(--border)', borderRadius: '6px',
            marginBottom: '14px', background: 'var(--bg-surface)',
          }}>
            <SliderField label="Speed" value={formData.speed} onChange={(v) => setFormData({ ...formData, speed: v })} min={0.5} max={2.0} step={0.05} suffix="x" />
            <SliderField label="Stability" value={formData.stability} onChange={(v) => setFormData({ ...formData, stability: v })} min={0} max={1} step={0.05} />
            <SliderField label="Similarity Boost" value={formData.similarity_boost} onChange={(v) => setFormData({ ...formData, similarity_boost: v })} min={0} max={1} step={0.05} />
            <SliderField label="Style Exaggeration" value={formData.style} onChange={(v) => setFormData({ ...formData, style: v })} min={0} max={1} step={0.05} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <label style={{ minWidth: '140px', fontSize: '13px', fontWeight: 600 }}>Speaker Boost</label>
              <input
                type="checkbox"
                checked={formData.use_speaker_boost}
                onChange={(e) => setFormData({ ...formData, use_speaker_boost: e.target.checked })}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {formData.use_speaker_boost ? 'On' : 'Off'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Save Changes' : 'Create Voice'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null) }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {voices.length === 0 && !showForm && (
        <p style={{ color: 'var(--text-muted)' }}>No voices configured yet. Click "+ New Voice" to add one.</p>
      )}

      {voices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {voices.map((voice) => (
            <div key={voice.id} style={{
              padding: '12px 16px',
              border: '1px solid var(--border)', borderRadius: '6px',
              background: editingId === voice.id ? 'var(--bg-surface-alt)' : 'var(--bg-surface)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <strong>{voice.name}</strong>
                <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {voice.elevenlabs_voice_id}
                </span>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Speed: {voice.speed?.toFixed(2)}x | Stability: {voice.stability?.toFixed(2)} | Similarity: {voice.similarity_boost?.toFixed(2)} | Style: {voice.style?.toFixed(2)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-secondary" onClick={() => handleEdit(voice)} style={{ padding: '4px 12px', fontSize: '12px' }}>
                  Edit
                </button>
                <button className="btn btn-danger" onClick={() => handleDelete(voice.id)} style={{ padding: '4px 12px', fontSize: '12px' }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default VoicesList
