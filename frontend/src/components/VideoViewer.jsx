import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function VideoViewer({ scriptId, onBack }) {
  const [step, setStep] = useState('loading')
  const [voiceover, setVoiceover] = useState(null)
  const [video, setVideo] = useState(null)
  const [error, setError] = useState(null)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const pollRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    loadInitialState()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [scriptId])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  const loadInitialState = async () => {
    setError(null)

    try {
      const voResp = await axios.get(`${API_BASE}/projects/${scriptId}/voiceover`)
      setVoiceover(voResp.data)
      if (voResp.data.status !== 'ready') {
        setStep('no_voiceover')
        return
      }
    } catch {
      setStep('no_voiceover')
      return
    }

    try {
      const videoResp = await axios.get(`${API_BASE}/projects/${scriptId}/video`)
      if (videoResp.data && videoResp.data.status === 'approved') {
        setVideo(videoResp.data)
        setStep('video_ready')
        return
      }
    } catch {}

    setStep('ready_to_render')
  }

  const handleRenderVideo = async () => {
    if (!voiceover) return
    setError(null)
    setStep('rendering')
    try {
      await axios.post(`${API_BASE}/projects/${scriptId}/render-video`, {
        voiceover_id: voiceover.id,
      })
      startPollingVideo()
    } catch (err) {
      console.error('Error starting render:', err)
      setError('Failed to start video render')
      setStep('ready_to_render')
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
          setStep('ready_to_render')
        }
      } catch {}
    }, 5000)

    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setError('Render is taking longer than expected. Refresh to check status.')
        setStep('ready_to_render')
      }
    }, 300000)
  }

  const getVideoUrl = (v) => {
    if (v.url) return v.url
    if (v.file_path) return `/storage/${v.file_path}`
    return null
  }

  const handleSaveVideo = async () => {
    const url = getVideoUrl(video)
    if (!url) return
    try {
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
      const res = await fetch(fullUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `video-project-${scriptId}.mp4`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Error saving video:', err)
      const a = document.createElement('a')
      a.href = url.startsWith('http') ? url : `${window.location.origin}${url}`
      a.download = `video-project-${scriptId}.mp4`
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
    }
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
          <p style={{ color: 'var(--text-secondary)' }}>
            No voiceover is ready yet. Go back to the Voiceover step to generate one first.
          </p>
          <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '12px' }}>
            ← Go to Voiceover
          </button>
        </div>
      )}

      {step === 'ready_to_render' && (
        <div>
          <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            Voiceover is ready. Render the final video with images, transitions, and captions.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleRenderVideo}
            style={{ padding: '10px 24px', fontSize: '15px' }}
          >
            Render Video
          </button>
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
              ref={videoRef}
              controls
              style={{ width: '100%', maxWidth: '900px', borderRadius: '8px', marginBottom: '16px' }}
              src={getVideoUrl(video)}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <p>Video file not available.</p>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', marginBottom: '16px',
            border: '1px solid var(--border)', borderRadius: '6px',
            background: 'var(--bg-surface-alt)',
          }}>
            <label style={{ fontWeight: 600, fontSize: '13px', minWidth: '110px' }}>Playback Speed</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{ flex: 1, maxWidth: '200px' }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: '13px', minWidth: '42px' }}>
              {playbackSpeed.toFixed(2)}x
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleSaveVideo}
            >
              Save Video
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleRenderVideo}
            >
              Re-render Video
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoViewer
