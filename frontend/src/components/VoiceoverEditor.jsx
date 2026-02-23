import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
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
  const sidebarRef = useRef(null)
  const [previewTime, setPreviewTime] = useState(0)
  const [phrases, setPhrases] = useState([])
  const [burnCaptionsPreview, setBurnCaptionsPreview] = useState(false)
  const [previewEnlarged, setPreviewEnlarged] = useState(false)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [captionSettings, setCaptionSettings] = useState(null)
  const previewContainerRef = useRef(null)
  const burnCanvasRef = useRef(null)
  const [, setSidebarReady] = useState(0)

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

  useEffect(() => {
    if (step === 'timeline' && scriptId && voiceover?.status === 'ready') {
      axios.get(`${API_BASE}/projects/${scriptId}/voiceover/caption-phrases`)
        .then(resp => setPhrases(resp.data || []))
        .catch(() => setPhrases([]))
    } else if (step !== 'timeline') {
      setPhrases([])
    }
  }, [step, scriptId, voiceover?.status])

  useEffect(() => {
    if (step === 'timeline') {
      const t = setTimeout(() => setSidebarReady(r => r + 1), 0)
      return () => clearTimeout(t)
    }
  }, [step])

  const handleCaptionSettingsChange = (settings) => {
    if (settings) setCaptionSettings(prev => ({ ...prev, ...settings }))
  }

  useEffect(() => {
    if (voiceover) {
      setCaptionSettings({
        caption_alignment: voiceover.caption_alignment ?? 2,
        caption_margin_v: voiceover.caption_margin_v ?? 60,
        captions_enabled: voiceover.captions_enabled ?? false,
        caption_style: voiceover.caption_style ?? 'word_highlight',
      })
    }
  }, [voiceover?.id])

  useEffect(() => {
    if (step !== 'timeline') return
    const el = previewContainerRef.current
    if (!el) return
    const updateSize = () => setPreviewSize({ width: el.clientWidth, height: el.clientHeight })
    const ro = new ResizeObserver(updateSize)
    ro.observe(el)
    updateSize()
    return () => ro.disconnect()
  }, [step])

  useEffect(() => {
    if (!burnCaptionsPreview || step !== 'timeline') return
    const container = previewContainerRef.current
    const canvas = burnCanvasRef.current
    if (!container || !canvas) return
    const width = container.clientWidth
    const height = container.clientHeight
    if (width <= 0 || height <= 0) {
      const raf = requestAnimationFrame(() => {
        setPreviewSize({ width: container.clientWidth, height: container.clientHeight })
      })
      return () => cancelAnimationFrame(raf)
    }
    canvas.width = width
    canvas.height = height
    const timings = getPreviewTimings()
    const sceneIndex = getSceneForTime(previewTime, timings)
    const sceneId = sceneIndex >= 0 ? timings[sceneIndex].scene_id : timings[0]?.scene_id
    const sceneImageUrl = sceneId ? getSceneImageUrl(sceneId) : null
    const activePhrase = phrases.find(p => previewTime >= p.start && previewTime < p.end)
    const alignment = captionSettings?.caption_alignment ?? voiceover?.caption_alignment ?? 2
    const marginV = captionSettings?.caption_margin_v ?? voiceover?.caption_margin_v ?? 60
    const captionsEnabled = (captionSettings?.captions_enabled ?? voiceover?.captions_enabled) === true
    const captionText = captionsEnabled && activePhrase ? activePhrase.text : null
    const ctx = canvas.getContext('2d')
    if (!sceneImageUrl) {
      drawBurnedFrame(ctx, width, height, null, captionText, alignment, marginV)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled || !burnCanvasRef.current) return
      const c = burnCanvasRef.current
      const w = c.width
      const h = c.height
      if (w > 0 && h > 0) drawBurnedFrame(c.getContext('2d'), w, h, img, captionText, alignment, marginV)
    }
    img.onerror = () => {
      if (!cancelled) drawBurnedFrame(ctx, width, height, null, captionText, alignment, marginV)
    }
    img.src = sceneImageUrl
    return () => {
      cancelled = true
      img.src = ''
    }
  }, [burnCaptionsPreview, previewTime, previewSize, voiceover, phrases, scenes, step, captionSettings])

  const getPreviewTimings = () => {
    if (!voiceover?.scene_timings) return []
    try {
      return typeof voiceover.scene_timings === 'string'
        ? JSON.parse(voiceover.scene_timings)
        : voiceover.scene_timings
    } catch {
      return []
    }
  }

  const getSceneForTime = (time, timings) => {
    for (let i = 0; i < timings.length; i++) {
      if (time >= timings[i].start_time && time < timings[i].end_time) return i
    }
    return -1
  }

  const getSceneImageUrl = (sceneId) => {
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return null
    const images = scene._images || []
    if (scene.approved_image_id) {
      const approved = images.find(i => i.id === scene.approved_image_id)
      if (approved?.file_path) return `/storage/${approved.file_path}`
    }
    if (images.length > 0 && images[0].file_path) {
      return `/storage/${images[0].file_path}`
    }
    return null
  }

  const PLAY_RES_X = 1920
  const PLAY_RES_Y = 1080
  const MARGIN_LR = 40

  const getCaptionOverlayStyle = (alignment, marginV, frameWidth, frameHeight) => {
    if (!frameWidth || !frameHeight) {
      frameWidth = PLAY_RES_X
      frameHeight = PLAY_RES_Y
    }
    const scaleV = frameHeight / PLAY_RES_Y
    const scaleH = frameWidth / PLAY_RES_X
    const marginVpx = Math.round(marginV * scaleV)
    const marginLpx = Math.round(MARGIN_LR * scaleH)
    const marginRpx = Math.round(MARGIN_LR * scaleH)
    const vertical = alignment <= 3 ? 'bottom' : alignment <= 6 ? 'middle' : 'top'
    const horizontal = (alignment - 1) % 3
    const base = {
      position: 'absolute',
      zIndex: 10,
      padding: '6px 10px',
      color: 'white',
      textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.8)',
      fontSize: 'clamp(12px, 2.2vw, 22px)',
      fontWeight: 600,
      maxWidth: '90%',
      textAlign: horizontal === 0 ? 'left' : horizontal === 1 ? 'center' : 'right',
      pointerEvents: 'none',
    }
    if (vertical === 'bottom') {
      base.bottom = marginVpx
      base.left = horizontal === 0 ? marginLpx : horizontal === 1 ? '50%' : undefined
      base.right = horizontal === 2 ? marginRpx : undefined
      if (horizontal === 1) base.transform = 'translateX(-50%)'
    } else if (vertical === 'top') {
      base.top = marginVpx
      base.left = horizontal === 0 ? marginLpx : horizontal === 1 ? '50%' : undefined
      base.right = horizontal === 2 ? marginRpx : undefined
      if (horizontal === 1) base.transform = 'translateX(-50%)'
    } else {
      base.top = '50%'
      base.left = horizontal === 0 ? marginLpx : horizontal === 1 ? '50%' : undefined
      base.right = horizontal === 2 ? marginRpx : undefined
      base.transform = horizontal === 1 ? 'translate(-50%, -50%)' : 'translateY(-50%)'
    }
    return base
  }

  const drawBurnedFrame = (ctx, width, height, img, captionText, alignment, marginV) => {
    if (!ctx || width <= 0 || height <= 0) return
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, width, height)
    let sx = 0
    let sy = 0
    let sw = width
    let sh = height
    if (img && img.complete && img.naturalWidth) {
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const scale = Math.min(width / iw, height / ih)
      sw = iw * scale
      sh = ih * scale
      sx = (width - sw) / 2
      sy = (height - sh) / 2
      ctx.drawImage(img, 0, 0, iw, ih, sx, sy, sw, sh)
    }
    if (captionText && alignment >= 1 && alignment <= 9) {
      const scaleV = sh / PLAY_RES_Y
      const scaleH = sw / PLAY_RES_X
      const marginVpx = marginV * scaleV
      const marginLpx = MARGIN_LR * scaleH
      const marginRpx = MARGIN_LR * scaleH
      const vertical = alignment <= 3 ? 'bottom' : alignment <= 6 ? 'middle' : 'top'
      const horizontal = (alignment - 1) % 3
      const fontSize = Math.max(12, Math.min(28, Math.round(sh * 0.065)))
      ctx.font = `600 ${fontSize}px Arial, sans-serif`
      ctx.textAlign = horizontal === 0 ? 'left' : horizontal === 1 ? 'center' : 'right'
      const x = horizontal === 0 ? sx + marginLpx : horizontal === 1 ? sx + sw / 2 : sx + sw - marginRpx
      let y
      if (vertical === 'bottom') y = sy + sh - marginVpx
      else if (vertical === 'top') y = sy + marginVpx + fontSize
      else y = sy + sh / 2 + fontSize / 2
      ctx.strokeStyle = 'rgba(0,0,0,0.95)'
      ctx.lineWidth = 4
      ctx.strokeText(captionText, x, y)
      ctx.fillStyle = 'white'
      ctx.fillText(captionText, x, y)
    }
  }

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
        <h2>Video editor</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {step === 'timeline' && voiceover && (
            <button className="btn btn-primary" onClick={onNext}>
              Proceed to Complete Video →
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
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          flex: 1,
          minHeight: 'calc(100vh - 200px)',
        }}>
          {/* Top row: settings sidebar + active frame preview (fixed height) */}
          <div style={{
            display: 'flex',
            gap: '16px',
            flex: '0 0 auto',
            height: '400px',
            minHeight: '400px',
          }}>
            {/* Left: settings panel */}
            <div
              ref={sidebarRef}
              style={{
                width: '280px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                background: 'var(--bg-surface-alt)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                overflowY: 'auto',
              }}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Settings
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Caption settings, effects and transitions (select a scene or divider on the timeline).
              </span>
            </div>
            {/* Right: active frame preview (fixed size, captions overlay only) */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                height: '400px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={burnCaptionsPreview ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setBurnCaptionsPreview(b => !b)}
                  style={{ fontSize: '13px', padding: '6px 12px' }}
                >
                  {burnCaptionsPreview ? 'Hide burned captions' : 'Burn captions preview'}
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {burnCaptionsPreview
                    ? 'Caption is drawn onto the image (actual placement)'
                    : 'Overlay caption on frame'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  Click preview to enlarge
                </span>
              </div>
              <div
                ref={previewContainerRef}
                role="button"
                tabIndex={0}
                onClick={() => setPreviewEnlarged(true)}
                onKeyDown={(e) => e.key === 'Enter' && setPreviewEnlarged(true)}
                style={{
                  height: '320px',
                  minHeight: '320px',
                  flexShrink: 0,
                  background: 'var(--bg-surface)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
                title="Click to enlarge"
              >
                {(() => {
                  const timings = getPreviewTimings()
                  const sceneIndex = getSceneForTime(previewTime, timings)
                  const sceneId = sceneIndex >= 0 ? timings[sceneIndex].scene_id : timings[0]?.scene_id
                  const sceneImageUrl = sceneId ? getSceneImageUrl(sceneId) : null
                  const activePhrase = phrases.find(p => previewTime >= p.start && previewTime < p.end)
                  const captionsEnabled = (captionSettings?.captions_enabled ?? voiceover?.captions_enabled) === true
                  const alignment = captionSettings?.caption_alignment ?? voiceover?.caption_alignment ?? 2
                  const marginV = captionSettings?.caption_margin_v ?? voiceover?.caption_margin_v ?? 60
                  if (burnCaptionsPreview) {
                    return (
                      <canvas
                        ref={burnCanvasRef}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          display: 'block',
                        }}
                      />
                    )
                  }
                  const cw = previewSize.width || 1
                  const ch = previewSize.height || 1
                  const scale = Math.min(cw / PLAY_RES_X, ch / PLAY_RES_Y)
                  const frameW = PLAY_RES_X * scale
                  const frameH = PLAY_RES_Y * scale
                  const frameLeft = (cw - frameW) / 2
                  const frameTop = (ch - frameH) / 2
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: frameLeft,
                          top: frameTop,
                          width: frameW,
                          height: frameH,
                        }}
                      >
                        {sceneImageUrl ? (
                          <img
                            src={sceneImageUrl}
                            alt=""
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'var(--bg-surface-alt)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--text-muted)',
                              fontSize: '14px',
                            }}
                          >
                            No scene image
                          </div>
                        )}
                        {captionsEnabled && activePhrase && (
                          <div style={getCaptionOverlayStyle(alignment, marginV, frameW, frameH)}>
                            {activePhrase.text}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Enlarged preview modal */}
          {previewEnlarged && (() => {
            const timings = getPreviewTimings()
            const sceneIndex = getSceneForTime(previewTime, timings)
            const sceneId = sceneIndex >= 0 ? timings[sceneIndex].scene_id : timings[0]?.scene_id
            const sceneImageUrl = sceneId ? getSceneImageUrl(sceneId) : null
            const activePhrase = phrases.find(p => previewTime >= p.start && previewTime < p.end)
            const captionsEnabled = (captionSettings?.captions_enabled ?? voiceover?.captions_enabled) === true
            const alignment = captionSettings?.caption_alignment ?? voiceover?.caption_alignment ?? 2
            const marginV = captionSettings?.caption_margin_v ?? voiceover?.caption_margin_v ?? 60
            return ReactDOM.createPortal(
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10000,
                  background: 'rgba(0,0,0,0.85)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  boxSizing: 'border-box',
                }}
                onClick={() => setPreviewEnlarged(false)}
              >
                <div
                  style={{
                    width: '95vw',
                    height: '95vh',
                    maxWidth: '1400px',
                    maxHeight: '900px',
                    position: 'relative',
                    background: '#111',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {sceneImageUrl ? (
                    <img
                      src={sceneImageUrl}
                      alt=""
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '16px' }}>
                      No scene image
                    </div>
                  )}
                  {captionsEnabled && activePhrase && (
                    <div
                      style={{
                        ...getCaptionOverlayStyle(alignment, marginV),
                        pointerEvents: 'none',
                        fontSize: 'clamp(18px, 4vw, 42px)',
                        padding: '16px 24px',
                      }}
                    >
                      {activePhrase.text}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPreviewEnlarged(false)}
                  style={{
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    padding: '10px 20px',
                    fontSize: '14px',
                    zIndex: 10001,
                  }}
                >
                  Close
                </button>
              </div>,
              document.body
            )
          })()}

          {/* Timeline: stick to bottom */}
          <div style={{ flex: '0 0 auto', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Timeline</h3>
              <button
                className="btn btn-secondary"
                onClick={() => setStep('settings')}
                style={{ fontSize: '13px' }}
              >
                Regenerate Voiceover
              </button>
            </div>
            <TimelineEditor
              projectId={scriptId}
              voiceover={voiceover}
              scenes={scenes}
              onRenderVideo={() => {}}
              onTimingsChanged={() => {}}
              hideRenderButton={true}
              sidebarContainerRef={sidebarRef}
              onTimeUpdate={setPreviewTime}
              onCaptionSettingsChange={handleCaptionSettingsChange}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceoverEditor
