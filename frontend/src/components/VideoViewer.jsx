import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import TimelineEditor from './TimelineEditor'

const API_BASE = '/api'

function VideoViewer({ scriptId, onBack }) {
  const [step, setStep] = useState('loading')
  const [voiceover, setVoiceover] = useState(null)
  const [video, setVideo] = useState(null)
  const [scenes, setScenes] = useState([])
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  useEffect(() => {
    loadInitialState()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [scriptId])

  const loadScenes = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/projects/${scriptId}/scenes`)
      setScenes(resp.data)
    } catch {
      setScenes([])
    }
  }

  const loadInitialState = async () => {
    setError(null)
    await loadScenes()

    try {
      const videoResp = await axios.get(`${API_BASE}/projects/${scriptId}/video`)
      if (videoResp.data && videoResp.data.status === 'approved') {
        setVideo(videoResp.data)
        try {
          const voResp = await axios.get(`${API_BASE}/projects/${scriptId}/voiceover`)
          setVoiceover(voResp.data)
        } catch {}
        setStep('video_ready')
        return
      }
    } catch {}

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
        setStep('no_voiceover')
        setError('Previous voiceover generation failed. Try again.')
        return
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error('Error loading voiceover:', err)
      }
    }

    setStep('no_voiceover')
  }

  const handleGenerateVoiceover = async () => {
    setError(null)
    setStep('generating')
    try {
      const resp = await axios.post(`${API_BASE}/projects/${scriptId}/generate-voiceover`)
      startPollingVoiceover()
    } catch (err) {
      console.error('Error generating voiceover:', err)
      setError('Failed to start voiceover generation')
      setStep('no_voiceover')
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
          setStep('no_voiceover')
        }
      } catch {}
    }, 3000)

    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        if (step === 'generating') {
          setError('Voiceover generation is taking longer than expected. Refresh to check status.')
          setStep('no_voiceover')
        }
      }
    }, 300000)
  }

  const handleRenderVideo = async (voiceoverId) => {
    setError(null)
    setStep('rendering')
    try {
      await axios.post(`${API_BASE}/projects/${scriptId}/render-video`, {
        voiceover_id: voiceoverId,
      })
      startPollingVideo()
    } catch (err) {
      console.error('Error starting render:', err)
      setError('Failed to start video render')
      setStep('timeline')
    }
  }

  const startPollingVideo = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const resp = await axios.get(`${API_BASE}/projects/${scriptId}/video`)
        if (resp.data && resp.data.status === 'approved') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setVideo(resp.data)
          setStep('video_ready')
        } else if (resp.data && resp.data.status === 'rejected') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setError('Video render failed. Check logs and try again.')
          setStep('timeline')
        }
      } catch {}
    }, 5000)

    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        if (step === 'rendering') {
          setError('Render is taking longer than expected. Refresh to check status.')
        }
      }
    }, 300000)
  }

  const getVideoUrl = (v) => {
    if (v.url) return v.url
    if (v.file_path) return `/storage/${v.file_path}`
    return null
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Video</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
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

      {step === 'no_voiceover' && (
        <div>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            Generate a voiceover from your project script. The AI will narrate the full script
            and automatically compute timing for each scene.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleGenerateVoiceover}
            style={{ padding: '10px 24px', fontSize: '15px' }}
          >
            Generate Voiceover
          </button>
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
          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Timeline Editor</h3>
          <p style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Drag scene boundaries to adjust timing. Click a divider to set transition type and duration.
            Toggle captions and choose a style before rendering.
          </p>
          <TimelineEditor
            projectId={scriptId}
            voiceover={voiceover}
            scenes={scenes}
            onRenderVideo={handleRenderVideo}
            onTimingsChanged={() => {}}
          />
        </div>
      )}

      {step === 'rendering' && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{
            width: '48px', height: '48px', margin: '0 auto 16px',
            border: '4px solid var(--border)',
            borderTopColor: 'var(--success)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>
            Rendering Video...
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Assembling slideshow with voiceover, transitions, and captions. This may take a few minutes.
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {step === 'video_ready' && video && (
        <div>
          <h3 style={{ marginBottom: '12px' }}>Final Video</h3>
          {getVideoUrl(video) ? (
            <video
              controls
              style={{ width: '100%', maxWidth: '900px', borderRadius: '8px', marginBottom: '16px' }}
              src={getVideoUrl(video)}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <p>Video file not available.</p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep('timeline')}
            >
              Re-edit Timeline
            </button>
            <button
              className="btn btn-primary"
              onClick={handleGenerateVoiceover}
            >
              Regenerate Voiceover
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoViewer
