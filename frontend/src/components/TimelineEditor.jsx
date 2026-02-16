import React, { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function TimelineEditor({
  projectId,
  voiceover,
  scenes,
  onRenderVideo,
  onTimingsChanged,
}) {
  const [timings, setTimings] = useState([])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [selectedDivider, setSelectedDivider] = useState(null)
  const [captionsEnabled, setCaptionsEnabled] = useState(voiceover?.captions_enabled || false)
  const [captionStyle, setCaptionStyle] = useState(voiceover?.caption_style || 'word_highlight')
  const [savingCaptions, setSavingCaptions] = useState(false)
  const [dragging, setDragging] = useState(null)
  const audioRef = useRef(null)
  const timelineRef = useRef(null)

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

  const totalDuration = voiceover?.total_duration || 0

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

  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !audioRef.current || dragging) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    const newTime = pct * totalDuration
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const getSceneThumbnail = (sceneId) => {
    const scene = scenes.find(s => s.id === sceneId)
    if (!scene) return null
    if (scene.approved_image_id) {
      const images = scene._images || []
      const approved = images.find(i => i.id === scene.approved_image_id)
      if (approved?.file_path) return `/storage/${approved.file_path}`
    }
    return null
  }

  const handleDividerMouseDown = (e, index) => {
    e.stopPropagation()
    e.preventDefault()
    setDragging({ index, startX: e.clientX })
    setSelectedDivider(index)
  }

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !timelineRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const pixelsPerSecond = rect.width / totalDuration
    const dx = e.clientX - dragging.startX
    const dt = dx / pixelsPerSecond

    setTimings(prev => {
      const updated = [...prev]
      const i = dragging.index
      if (i >= updated.length - 1) return prev

      const minDuration = 0.5
      const newEndTime = updated[i].end_time + dt
      const newNextStart = newEndTime

      if (newEndTime - updated[i].start_time < minDuration) return prev
      if (updated[i + 1].end_time - newNextStart < minDuration) return prev

      updated[i] = { ...updated[i], end_time: Math.round(newEndTime * 1000) / 1000 }
      updated[i + 1] = { ...updated[i + 1], start_time: Math.round(newNextStart * 1000) / 1000 }
      return updated
    })

    setDragging(prev => ({ ...prev, startX: e.clientX }))
  }, [dragging, totalDuration])

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

  const playheadPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Audio element */}
      <audio
        ref={audioRef}
        src={getAudioUrl()}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnded}
        preload="auto"
      />

      {/* Audio controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', background: 'var(--bg-surface-alt)',
        borderRadius: '8px', border: '1px solid var(--border)',
      }}>
        <button
          className="btn btn-primary"
          onClick={togglePlay}
          style={{ minWidth: '80px', padding: '6px 16px', fontSize: '14px' }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--text-secondary)' }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {timings.length} scenes
        </span>
      </div>

      {/* Timeline */}
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        style={{
          position: 'relative', height: '100px',
          background: 'var(--bg-surface-alt)', borderRadius: '8px',
          border: '1px solid var(--border)', overflow: 'hidden',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        {/* Scene blocks */}
        {timings.map((t, i) => {
          const left = totalDuration > 0 ? (t.start_time / totalDuration) * 100 : 0
          const width = totalDuration > 0 ? ((t.end_time - t.start_time) / totalDuration) * 100 : 0
          const sceneNum = i + 1
          const isActive = currentTime >= t.start_time && currentTime < t.end_time

          return (
            <div
              key={t.scene_id}
              style={{
                position: 'absolute', left: `${left}%`, width: `${width}%`,
                top: 0, bottom: 0,
                background: isActive ? 'var(--primary)' : (i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-surface-alt)'),
                borderRight: i < timings.length - 1 ? 'none' : undefined,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                opacity: isActive ? 1 : 0.85,
                transition: 'background 0.15s',
                overflow: 'hidden',
              }}
            >
              <span style={{
                fontSize: '13px', fontWeight: 600,
                color: isActive ? 'white' : 'var(--text-primary)',
              }}>
                Scene {sceneNum}
              </span>
              <span style={{
                fontSize: '11px',
                color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
              }}>
                {(t.end_time - t.start_time).toFixed(1)}s
              </span>
            </div>
          )
        })}

        {/* Dividers between scenes */}
        {timings.slice(0, -1).map((t, i) => {
          const pct = totalDuration > 0 ? (t.end_time / totalDuration) * 100 : 0
          return (
            <div
              key={`div-${i}`}
              onMouseDown={(e) => handleDividerMouseDown(e, i)}
              onClick={(e) => { e.stopPropagation(); setSelectedDivider(i) }}
              style={{
                position: 'absolute', left: `calc(${pct}% - 6px)`,
                top: 0, bottom: 0, width: '12px',
                cursor: 'col-resize', zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{
                width: '3px', height: '100%',
                background: selectedDivider === i ? 'var(--warning)' : 'var(--border)',
                borderRadius: '2px',
                transition: 'background 0.15s',
              }} />
            </div>
          )
        })}

        {/* Playhead */}
        <div style={{
          position: 'absolute', left: `${playheadPct}%`,
          top: 0, bottom: 0, width: '2px',
          background: 'var(--danger)', zIndex: 20,
          pointerEvents: 'none',
          transition: playing ? 'none' : 'left 0.1s',
        }}>
          <div style={{
            position: 'absolute', top: '-2px', left: '-4px',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '6px solid var(--danger)',
          }} />
        </div>
      </div>

      {/* Transition panel */}
      {selectedDivider !== null && selectedDivider < timings.length - 1 && (
        <div style={{
          padding: '12px 16px', background: 'var(--bg-surface-alt)',
          borderRadius: '8px', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Transition: Scene {selectedDivider + 1} → {selectedDivider + 2}
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
        padding: '12px 16px', background: 'var(--bg-surface-alt)',
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
      </div>

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
