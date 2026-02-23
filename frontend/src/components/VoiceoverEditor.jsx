import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import TimelineEditor from './TimelineEditor'

const API_BASE = '/api'

const ELEVENLABS_MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5' },
  { id: 'eleven_monolingual_v1', label: 'English v1' },
]

function SliderControl({ label, value, onChange, min, max, step, suffix }) {
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

function VoiceoverEditor({ scriptId, onBack, onNext }) {
  const [step, setStep] = useState('loading')
  const [voiceover, setVoiceover] = useState(null)
  const [scenes, setScenes] = useState([])
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const [voices, setVoices] = useState([])
  const [selectedVoiceId, setSelectedVoiceId] = useState('')
  const [modelId, setModelId] = useState('eleven_multilingual_v2')
  const [speed, setSpeed] = useState(1.0)
  const [stability, setStability] = useState(0.5)
  const [similarityBoost, setSimilarityBoost] = useState(0.75)
  const [styleExaggeration, setStyleExaggeration] = useState(0.0)
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true)

  useEffect(() => {
    loadVoices()
    loadInitialState()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [scriptId])

  const loadVoices = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/voices`)
      setVoices(resp.data)
    } catch (err) {
      console.error('Error loading voices:', err)
    }
  }

  const loadScenes = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/projects/${scriptId}/scenes`)
      const scenesData = resp.data
      const scenesWithImages = await Promise.all(
        scenesData.map(async (scene) => {
          try {
            const imgResp = await axios.get(`${API_BASE}/scenes/${scene.id}/images`)
            return { ...scene, _images: imgResp.data }
          } catch {
            return { ...scene, _images: [] }
          }
        })
      )
      setScenes(scenesWithImages)
    } catch {
      setScenes([])
    }
  }

  const loadInitialState = async () => {
    setError(null)
    await loadScenes()

    try {
      const voResp = await axios.get(`${API_BASE}/projects/${scriptId}/voiceover`)
      setVoiceover(voResp.data)
      if (voResp.data.status === 'ready') {
        setStep('timeline')
        return
      } else if (voResp.data.status === 'pending') {
        setStep('generating')
        startPollingVoiceover()
        return
      } else if (voResp.data.status === 'error') {
        setStep('settings')
        setError('Previous voiceover generation failed. Adjust settings and try again.')
        return
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error('Error loading voiceover:', err)
      }
    }

    setStep('settings')
  }

  const handleVoiceSelected = (voiceIdStr) => {
    setSelectedVoiceId(voiceIdStr)
    if (!voiceIdStr) return
    const voice = voices.find((v) => String(v.id) === voiceIdStr)
    if (voice) {
      setModelId(voice.model_id || 'eleven_multilingual_v2')
      setSpeed(voice.speed ?? 1.0)
      setStability(voice.stability ?? 0.5)
      setSimilarityBoost(voice.similarity_boost ?? 0.75)
      setStyleExaggeration(voice.style ?? 0.0)
      setUseSpeakerBoost(voice.use_speaker_boost ?? true)
    }
  }

  const handleGenerateVoiceover = async () => {
    setError(null)
    setStep('generating')
    try {
      const voice = voices.find((v) => String(v.id) === selectedVoiceId)
      await axios.post(`${API_BASE}/projects/${scriptId}/generate-voiceover`, {
        voice_id: voice ? voice.id : undefined,
        elevenlabs_voice_id: voice ? voice.elevenlabs_voice_id : undefined,
        model_id: modelId,
        stability,
        similarity_boost: similarityBoost,
        style: styleExaggeration,
        speed,
        use_speaker_boost: useSpeakerBoost,
      })
      startPollingVoiceover()
    } catch (err) {
      console.error('Error generating voiceover:', err)
      setError('Failed to start voiceover generation')
      setStep('settings')
    }
  }

  const startPollingVoiceover = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const resp = await axios.get(`${API_BASE}/projects/${scriptId}/voiceover`)
        if (resp.data.status === 'ready') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setVoiceover(resp.data)
          await loadScenes()
          setStep('timeline')
        } else if (resp.data.status === 'error') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setError('Voiceover generation failed')
          setStep('settings')
        }
      } catch {}
    }, 3000)

    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setError('Voiceover generation is taking longer than expected. Refresh to check status.')
        setStep('settings')
      }
    }, 300000)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Voiceover</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {step === 'timeline' && voiceover && (
            <button className="btn btn-primary" onClick={onNext}>
              Proceed to Video →
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: '16px',
          background: 'var(--danger)', color: 'white',
          borderRadius: '6px', fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {step === 'loading' && (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      )}

      {step === 'settings' && (
        <div>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Configure the voice and TTS settings, then generate the voiceover from your project script.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>Voice</label>
              <select
                value={selectedVoiceId}
                onChange={(e) => handleVoiceSelected(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                <option value="">-- Use default (env) --</option>
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '14px' }}>Model</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                {ELEVENLABS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            padding: '16px', border: '1px solid var(--border)', borderRadius: '6px',
            background: 'var(--bg-surface-alt)', marginBottom: '20px',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '14px', fontSize: '15px' }}>Voice Settings</h3>
            <SliderControl label="Speed" value={speed} onChange={setSpeed} min={0.5} max={2.0} step={0.05} suffix="x" />
            <SliderControl label="Stability" value={stability} onChange={setStability} min={0} max={1} step={0.05} />
            <SliderControl label="Similarity Boost" value={similarityBoost} onChange={setSimilarityBoost} min={0} max={1} step={0.05} />
            <SliderControl label="Style Exaggeration" value={styleExaggeration} onChange={setStyleExaggeration} min={0} max={1} step={0.05} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <label style={{ minWidth: '140px', fontSize: '13px', fontWeight: 600 }}>Speaker Boost</label>
              <input
                type="checkbox"
                checked={useSpeakerBoost}
                onChange={(e) => setUseSpeakerBoost(e.target.checked)}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {useSpeakerBoost ? 'On' : 'Off'}
              </span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerateVoiceover}
            style={{ padding: '10px 24px', fontSize: '15px' }}
          >
            Generate Voiceover
          </button>

          {voiceover && voiceover.status === 'ready' && (
            <button
              className="btn btn-secondary"
              onClick={() => setStep('timeline')}
              style={{ marginLeft: '10px', padding: '10px 24px', fontSize: '15px' }}
            >
              Back to Timeline
            </button>
          )}
        </div>
      )}

      {step === 'generating' && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{
            width: '48px', height: '48px', margin: '0 auto 16px',
            border: '4px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>
            Generating Voiceover...
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Sending full script to ElevenLabs for narration. This may take a minute.
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {step === 'timeline' && voiceover && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Timeline Editor</h3>
            <button
              className="btn btn-secondary"
              onClick={() => setStep('settings')}
              style={{ fontSize: '13px' }}
            >
              Regenerate Voiceover
            </button>
          </div>
          <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Drag scene boundaries to adjust timing. Click a divider to set transition type and duration.
            Toggle captions and choose a style before proceeding to video.
          </p>
          <TimelineEditor
            projectId={scriptId}
            voiceover={voiceover}
            scenes={scenes}
            onRenderVideo={() => {}}
            onTimingsChanged={() => {}}
            hideRenderButton={true}
          />
        </div>
      )}
    </div>
  )
}

export default VoiceoverEditor
