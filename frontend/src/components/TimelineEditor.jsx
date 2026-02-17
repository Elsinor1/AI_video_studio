import React, { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'
import CaptionGroupEditor from './CaptionGroupEditor'

const API_BASE = '/api'

const PX_PER_SECOND_DEFAULT = 120
const PX_PER_SECOND_MIN = 40
const PX_PER_SECOND_MAX = 300
const IMAGE_ROW_HEIGHT = 140
const CAPTION_ROW_HEIGHT = 52

function TimelineEditor({
  projectId,
  voiceover,
  scenes,
  onRenderVideo,
  onTimingsChanged,
}) {
  const [timings, setTimings] = useState([])
  const [phrases, setPhrases] = useState([])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedDivider, setSelectedDivider] = useState(null)
  const [captionsEnabled, setCaptionsEnabled] = useState(voiceover?.captions_enabled || false)
  const [captionStyle, setCaptionStyle] = useState(voiceover?.caption_style || 'word_highlight')
  const [savingCaptions, setSavingCaptions] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [pxPerSecond, setPxPerSecond] = useState(PX_PER_SECOND_DEFAULT)

  const [captionEditorOpen, setCaptionEditorOpen] = useState(false)

  const audioRef = useRef(null)
  const scrollRef = useRef(null)
  const trackRef = useRef(null)

  useEffect(() => {
    if (voiceover?.scene_timings) {
      try {
        const parsed = typeof voiceover.scene_timings === 'string'
          ? JSON.parse(voiceover.scene_timings)
          : voiceover.scene_timings
        setTimings(parsed)
      } catch {
        setTimings([])
      }
    }
  }, [voiceover])

  useEffect(() => {
    setCaptionsEnabled(voiceover?.captions_enabled || false)
    setCaptionStyle(voiceover?.caption_style || 'word_highlight')
  }, [voiceover])

  const loadPhrases = useCallback(() => {
    if (projectId && voiceover?.status === 'ready') {
      axios.get(`${API_BASE}/projects/${projectId}/voiceover/caption-phrases`)
        .then(resp => setPhrases(resp.data || []))
        .catch(() => setPhrases([]))
    }
  }, [projectId, voiceover])

  useEffect(() => { loadPhrases() }, [loadPhrases])

  const totalDuration = voiceover?.total_duration || 0
  const totalWidth = totalDuration * pxPerSecond

  const getAudioUrl = () => {
    if (voiceover?.audio_file_path) {
      return `/storage/${voiceover.audio_file_path}`
    }
    return null
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleAudioEnded = () => {
    setPlaying(false)
    setCurrentTime(0)
  }

  // Auto-scroll to keep playhead visible during playback
  useEffect(() => {
    if (playing && scrollRef.current) {
      const container = scrollRef.current
      const playheadX = currentTime * pxPerSecond
      const viewLeft = container.scrollLeft
      const viewRight = viewLeft + container.clientWidth
      const margin = container.clientWidth * 0.3
      if (playheadX < viewLeft + 40 || playheadX > viewRight - margin) {
        container.scrollLeft = playheadX - container.clientWidth * 0.2
      }
    }
  }, [currentTime, playing, pxPerSecond])

  const handleTrackClick = (e) => {
    if (!trackRef.current || !audioRef.current || dragging) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const newTime = Math.max(0, Math.min(totalDuration, x / pxPerSecond))
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
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

  const getSceneForTime = (time) => {
    for (let i = 0; i < timings.length; i++) {
      if (time >= timings[i].start_time && time < timings[i].end_time) return i
    }
    return -1
  }

  const findNearestPhraseSnap = (time) => {
    if (!phrases.length) return time
    let best = time
    let bestDist = Infinity
    for (const p of phrases) {
      const distStart = Math.abs(p.start - time)
      const distEnd = Math.abs(p.end - time)
      if (distStart < bestDist) { bestDist = distStart; best = p.start }
      if (distEnd < bestDist) { bestDist = distEnd; best = p.end }
    }
    return best
  }

  const handleDividerMouseDown = (e, index) => {
    e.stopPropagation()
    e.preventDefault()
    setDragging({ index })
    setSelectedDivider(index)
  }

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const rawTime = x / pxPerSecond
    const snappedTime = findNearestPhraseSnap(rawTime)

    setTimings(prev => {
      const updated = [...prev]
      const i = dragging.index
      if (i >= updated.length - 1) return prev

      const minDuration = 0.3
      if (snappedTime - updated[i].start_time < minDuration) return prev
      if (updated[i + 1].end_time - snappedTime < minDuration) return prev

      const rounded = Math.round(snappedTime * 1000) / 1000
      updated[i] = { ...updated[i], end_time: rounded }
      updated[i + 1] = { ...updated[i + 1], start_time: rounded }
      return updated
    })
  }, [dragging, pxPerSecond, phrases])

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      setDragging(null)
      saveTimings()
    }
  }, [dragging, timings])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragging, handleMouseMove, handleMouseUp])

  const saveTimings = async () => {
    try {
      await axios.put(`${API_BASE}/projects/${projectId}/voiceover/scene-timings`, {
        scene_timings: timings,
      })
      if (onTimingsChanged) onTimingsChanged(timings)
    } catch (error) {
      console.error('Error saving timings:', error)
    }
  }

  const handleTransitionTypeChange = (index, value) => {
    setTimings(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], transition_type: value }
      return updated
    })
    setTimeout(() => saveTimings(), 0)
  }

  const handleTransitionDurationChange = (index, value) => {
    setTimings(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], transition_duration: parseFloat(value) }
      return updated
    })
  }

  const handleTransitionDurationCommit = () => {
    saveTimings()
  }

  const handleCaptionsToggle = async (enabled) => {
    setCaptionsEnabled(enabled)
    setSavingCaptions(true)
    try {
      await axios.put(`${API_BASE}/projects/${projectId}/voiceover/caption-settings`, {
        captions_enabled: enabled,
        caption_style: captionStyle,
      })
    } catch (error) {
      console.error('Error saving caption settings:', error)
    } finally {
      setSavingCaptions(false)
    }
  }

  const handleCaptionStyleChange = async (style) => {
    setCaptionStyle(style)
    setSavingCaptions(true)
    try {
      await axios.put(`${API_BASE}/projects/${projectId}/voiceover/caption-settings`, {
        captions_enabled: captionsEnabled,
        caption_style: style,
      })
    } catch (error) {
      console.error('Error saving caption settings:', error)
    } finally {
      setSavingCaptions(false)
    }
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`
  }

  const scrollBy = (dir) => {
    if (!scrollRef.current) return
    const step = scrollRef.current.clientWidth * 0.6
    scrollRef.current.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  const playheadX = currentTime * pxPerSecond

  // Timecode ruler marks
  const rulerMarks = []
  if (totalDuration > 0) {
    let step = 1
    if (pxPerSecond < 60) step = 5
    else if (pxPerSecond < 100) step = 2
    for (let t = 0; t <= totalDuration; t += step) {
      rulerMarks.push(t)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Audio element */}
      <audio
        ref={audioRef}
        src={getAudioUrl()}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnded}
        preload="auto"
      />

      {/* Top controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '8px 14px', background: 'var(--bg-surface-alt)',
        borderRadius: '8px', border: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        <button
          className="btn btn-primary"
          onClick={togglePlay}
          style={{ minWidth: '68px', padding: '5px 14px', fontSize: '13px' }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Zoom</span>
        <input
          type="range"
          min={PX_PER_SECOND_MIN}
          max={PX_PER_SECOND_MAX}
          value={pxPerSecond}
          onChange={(e) => setPxPerSecond(parseInt(e.target.value))}
          style={{ width: '90px' }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {pxPerSecond}px/s
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
          {timings.length} scenes
        </span>
      </div>

      {/* Scrollable timeline area */}
      <div style={{
        position: 'relative',
        borderRadius: '8px', border: '1px solid var(--border)',
        background: 'var(--bg-surface-alt)', overflow: 'hidden',
      }}>
        {/* Left / Right navigation arrows */}
        <button
          onClick={() => scrollBy(-1)}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '28px',
            zIndex: 30, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(to right, rgba(0,0,0,0.35), transparent)',
            color: 'white', fontSize: '18px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >&#9664;</button>
        <button
          onClick={() => scrollBy(1)}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '28px',
            zIndex: 30, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(to left, rgba(0,0,0,0.35), transparent)',
            color: 'white', fontSize: '18px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >&#9654;</button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          style={{
            overflowX: 'auto', overflowY: 'hidden',
            cursor: dragging ? 'col-resize' : 'default',
          }}
        >
          {/* Track */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            style={{
              position: 'relative',
              width: `${totalWidth}px`,
              userSelect: 'none',
            }}
          >
            {/* Timecode ruler */}
            <div style={{
              position: 'relative', height: '22px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)',
            }}>
              {rulerMarks.map(t => (
                <div key={`r-${t}`} style={{
                  position: 'absolute', left: `${t * pxPerSecond}px`,
                  top: 0, bottom: 0, width: '1px',
                  borderLeft: '1px solid rgba(128,128,128,0.25)',
                }}>
                  <span style={{
                    position: 'absolute', top: '2px', left: '4px',
                    fontSize: '9px', color: 'var(--text-muted)',
                    whiteSpace: 'nowrap', fontFamily: 'monospace',
                  }}>
                    {formatTime(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* Image row */}
            <div style={{ position: 'relative', height: `${IMAGE_ROW_HEIGHT}px` }}>
              {timings.map((t, i) => {
                const left = t.start_time * pxPerSecond
                const width = (t.end_time - t.start_time) * pxPerSecond
                const sceneNum = i + 1
                const isActive = currentTime >= t.start_time && currentTime < t.end_time
                const imgUrl = getSceneImageUrl(t.scene_id)

                return (
                  <div
                    key={t.scene_id}
                    style={{
                      position: 'absolute', left: `${left}px`, width: `${width}px`,
                      top: 0, bottom: 0, overflow: 'hidden',
                      borderRight: i < timings.length - 1 ? '1px solid rgba(0,0,0,0.15)' : undefined,
                    }}
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl} alt=""
                        style={{
                          position: 'absolute', top: 0, left: 0,
                          width: '100%', height: '100%',
                          objectFit: 'cover',
                          opacity: isActive ? 0.92 : 0.55,
                          transition: 'opacity 0.15s',
                          pointerEvents: 'none',
                        }}
                      />
                    ) : (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: isActive ? 'var(--primary)' : (i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-surface-alt)'),
                        opacity: 0.85,
                      }} />
                    )}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      background: isActive ? 'rgba(0,0,0,0.15)' : (imgUrl ? 'rgba(0,0,0,0.3)' : 'transparent'),
                      pointerEvents: 'none',
                    }} />
                    {isActive && (
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        border: '2px solid var(--primary)',
                        pointerEvents: 'none', zIndex: 2,
                      }} />
                    )}
                    <div style={{
                      position: 'relative', zIndex: 1,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      height: '100%', padding: '4px',
                    }}>
                      <span style={{
                        fontSize: '13px', fontWeight: 700, color: 'white',
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      }}>Scene {sceneNum}</span>
                      <span style={{
                        fontSize: '11px', color: 'rgba(255,255,255,0.7)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      }}>{(t.end_time - t.start_time).toFixed(1)}s</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Caption phrases row */}
            <div style={{
              position: 'relative', height: `${CAPTION_ROW_HEIGHT}px`,
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-surface)',
            }}>
              {phrases.map((phrase, pi) => {
                const left = phrase.start * pxPerSecond
                const width = Math.max((phrase.end - phrase.start) * pxPerSecond, 2)
                const isSpoken = currentTime >= phrase.start && currentTime < phrase.end
                const sceneIdx = getSceneForTime((phrase.start + phrase.end) / 2)
                const sceneColors = [
                  'rgba(99,102,241,0.08)',
                  'rgba(16,185,129,0.08)',
                  'rgba(245,158,11,0.08)',
                  'rgba(239,68,68,0.08)',
                  'rgba(139,92,246,0.08)',
                  'rgba(6,182,212,0.08)',
                ]
                const bgColor = sceneIdx >= 0 ? sceneColors[sceneIdx % sceneColors.length] : 'transparent'

                return (
                  <div
                    key={`phrase-${pi}`}
                    style={{
                      position: 'absolute', left: `${left}px`, width: `${width}px`,
                      top: 0, bottom: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '4px 6px',
                      overflow: 'hidden',
                      background: isSpoken ? 'rgba(99,102,241,0.2)' : bgColor,
                      borderRight: '1px solid rgba(128,128,128,0.12)',
                      transition: 'background 0.12s',
                    }}
                  >
                    <span style={{
                      fontSize: '11px', lineHeight: 1.3,
                      color: isSpoken ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: isSpoken ? 600 : 400,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {phrase.text}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Dividers */}
            {timings.slice(0, -1).map((t, i) => {
              const x = t.end_time * pxPerSecond
              return (
                <div
                  key={`div-${i}`}
                  onMouseDown={(e) => handleDividerMouseDown(e, i)}
                  onClick={(e) => { e.stopPropagation(); setSelectedDivider(i) }}
                  style={{
                    position: 'absolute', left: `${x - 7}px`,
                    top: 0, bottom: 0, width: '14px',
                    cursor: 'col-resize', zIndex: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div style={{
                    width: selectedDivider === i ? '4px' : '3px',
                    height: '100%',
                    background: selectedDivider === i ? 'var(--warning)' : 'rgba(255,255,255,0.55)',
                    borderRadius: '2px',
                    transition: 'background 0.15s, width 0.15s',
                    boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                  }} />
                </div>
              )
            })}

            {/* Playhead */}
            <div style={{
              position: 'absolute', left: `${playheadX}px`,
              top: 0, bottom: 0, width: '2px',
              background: 'var(--danger)', zIndex: 20,
              pointerEvents: 'none',
              transition: playing ? 'none' : 'left 0.1s',
              boxShadow: '0 0 6px rgba(220,53,69,0.6)',
            }}>
              <div style={{
                position: 'absolute', top: '-2px', left: '-5px',
                width: 0, height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '8px solid var(--danger)',
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Transition panel */}
      {selectedDivider !== null && selectedDivider < timings.length - 1 && (
        <div style={{
          padding: '10px 16px', background: 'var(--bg-surface-alt)',
          borderRadius: '8px', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Transition: Scene {selectedDivider + 1} &rarr; {selectedDivider + 2}
          </span>
          <select
            value={timings[selectedDivider]?.transition_type || 'cut'}
            onChange={(e) => handleTransitionTypeChange(selectedDivider, e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          >
            <option value="cut">Cut</option>
            <option value="crossfade">Crossfade</option>
            <option value="fade_to_black">Fade to Black</option>
          </select>

          {timings[selectedDivider]?.transition_type !== 'cut' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Duration:</span>
              <input
                type="range"
                min="0.1" max="2.0" step="0.1"
                value={timings[selectedDivider]?.transition_duration || 0.5}
                onChange={(e) => handleTransitionDurationChange(selectedDivider, e.target.value)}
                onMouseUp={handleTransitionDurationCommit}
                style={{ width: '120px' }}
              />
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                {(timings[selectedDivider]?.transition_duration || 0.5).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* Caption controls */}
      <div style={{
        padding: '10px 16px', background: 'var(--bg-surface-alt)',
        borderRadius: '8px', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={captionsEnabled}
            onChange={(e) => handleCaptionsToggle(e.target.checked)}
            disabled={savingCaptions}
          />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Enable Captions
          </span>
        </label>

        {captionsEnabled && (
          <>
            <select
              value={captionStyle}
              onChange={(e) => handleCaptionStyleChange(e.target.value)}
              disabled={savingCaptions}
              style={{
                padding: '4px 8px', borderRadius: '4px',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            >
              <option value="word_highlight">Word-by-word highlight</option>
              <option value="subtitle_chunks">Subtitle chunks</option>
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {captionStyle === 'word_highlight'
                ? 'Each word highlights as it is spoken (karaoke style)'
                : 'Standard subtitles, ~6 words at a time'}
            </span>
          </>
        )}

        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />

        <button
          className={captionEditorOpen ? 'btn btn-info' : 'btn btn-secondary'}
          onClick={() => setCaptionEditorOpen(!captionEditorOpen)}
          style={{ fontSize: '13px', padding: '4px 12px' }}
        >
          {captionEditorOpen ? 'Close Editor' : 'Edit Caption Grouping'}
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {phrases.length} phrases
        </span>
      </div>

      {/* Caption grouping editor */}
      {captionEditorOpen && (
        <CaptionGroupEditor
          projectId={projectId}
          voiceover={voiceover}
          audioRef={audioRef}
          pxPerSecond={pxPerSecond}
          onBoundariesChanged={loadPhrases}
        />
      )}

      {/* Render button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          className="btn btn-primary"
          onClick={() => onRenderVideo && onRenderVideo(voiceover.id)}
          style={{ padding: '10px 28px', fontSize: '15px', fontWeight: 600 }}
        >
          Render Video
        </button>
      </div>
    </div>
  )
}

export default TimelineEditor
