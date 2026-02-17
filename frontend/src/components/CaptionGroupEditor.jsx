import React, { useState, useRef, useEffect, useCallback } from 'react'
import axios from 'axios'

const API_BASE = '/api'
const WORD_ROW_HEIGHT = 52
const GROUP_LABEL_HEIGHT = 28

function CaptionGroupEditor({ projectId, voiceover, audioRef, pxPerSecond: externalZoom, onBoundariesChanged }) {
  const [words, setWords] = useState([])
  const [boundaries, setBoundaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [autoGrouping, setAutoGrouping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const scrollRef = useRef(null)
  const trackRef = useRef(null)
  const localAudioRef = useRef(null)

  const pxPerSecond = externalZoom || 120
  const audio = audioRef?.current || localAudioRef.current
  const totalDuration = voiceover?.total_duration || 0
  const totalWidth = totalDuration * pxPerSecond

  useEffect(() => {
    loadWords()
  }, [projectId, voiceover])

  const loadWords = async () => {
    setLoading(true)
    try {
      const resp = await axios.get(`${API_BASE}/projects/${projectId}/voiceover/words`)
      setWords(resp.data.words || [])
      setBoundaries(resp.data.boundaries || [])
    } catch {
      setWords([])
      setBoundaries([])
    } finally {
      setLoading(false)
    }
  }

  const handleAutoGroup = async () => {
    setAutoGrouping(true)
    try {
      const resp = await axios.post(`${API_BASE}/projects/${projectId}/voiceover/auto-group-captions`)
      setBoundaries(resp.data.boundaries || [])
      if (onBoundariesChanged) onBoundariesChanged()
    } catch (error) {
      console.error('Auto-group error:', error)
      alert('Error auto-grouping captions')
    } finally {
      setAutoGrouping(false)
    }
  }

  const saveBoundaries = async (newBoundaries) => {
    setSaving(true)
    try {
      await axios.put(`${API_BASE}/projects/${projectId}/voiceover/caption-boundaries`, {
        boundaries: newBoundaries,
      })
      if (onBoundariesChanged) onBoundariesChanged()
    } catch (error) {
      console.error('Save boundaries error:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleResetDefault = async () => {
    const defaultBoundaries = []
    for (let i = 5; i < words.length; i += 5) {
      defaultBoundaries.push(i)
    }
    setBoundaries(defaultBoundaries)
    await saveBoundaries(defaultBoundaries)
  }

  // Build groups from words + boundaries
  const buildGroups = useCallback(() => {
    if (!words.length) return []
    const splits = [0, ...boundaries.filter(b => b > 0 && b < words.length).sort((a, b) => a - b), words.length]
    const groups = []
    for (let i = 0; i < splits.length - 1; i++) {
      const groupWords = words.slice(splits[i], splits[i + 1])
      if (groupWords.length > 0) {
        groups.push({
          startIdx: splits[i],
          endIdx: splits[i + 1] - 1,
          words: groupWords,
          text: groupWords.map(w => w.word).join(' '),
          start: groupWords[0].start,
          end: groupWords[groupWords.length - 1].end,
        })
      }
    }
    return groups
  }, [words, boundaries])

  const groups = buildGroups()

  // Audio playback
  const togglePlay = () => {
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
    setPlaying(!playing)
  }

  useEffect(() => {
    if (!audio) return
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => { setPlaying(false); setCurrentTime(0) }
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
    }
  }, [audio])

  const handleWordClick = (word) => {
    if (audio && !dragging) {
      audio.currentTime = word.start
      setCurrentTime(word.start)
    }
  }

  // Divider dragging
  const handleDividerMouseDown = (e, boundaryIdx) => {
    e.stopPropagation()
    e.preventDefault()
    setDragging({ boundaryIdx })
  }

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = x / pxPerSecond

    // Find the nearest word boundary
    let bestWordIdx = null
    let bestDist = Infinity
    for (let i = 1; i < words.length; i++) {
      const wordBorderTime = (words[i - 1].end + words[i].start) / 2
      const dist = Math.abs(wordBorderTime - time)
      if (dist < bestDist) {
        bestDist = dist
        bestWordIdx = i
      }
    }

    if (bestWordIdx !== null && bestWordIdx > 0 && bestWordIdx < words.length) {
      setBoundaries(prev => {
        const updated = prev.filter((_, i) => i !== dragging.boundaryIdx)
        updated.push(bestWordIdx)
        return [...new Set(updated)].sort((a, b) => a - b)
      })
    }
  }, [dragging, words])

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      setDragging(null)
      saveBoundaries(boundaries)
    }
  }, [dragging, boundaries])

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

  // Add a new boundary by double-clicking between words
  const handleTrackDoubleClick = (e) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const time = x / pxPerSecond

    let bestWordIdx = null
    let bestDist = Infinity
    for (let i = 1; i < words.length; i++) {
      const wordBorderTime = (words[i - 1].end + words[i].start) / 2
      const dist = Math.abs(wordBorderTime - time)
      if (dist < bestDist) {
        bestDist = dist
        bestWordIdx = i
      }
    }

    if (bestWordIdx !== null && !boundaries.includes(bestWordIdx)) {
      const newBoundaries = [...boundaries, bestWordIdx].sort((a, b) => a - b)
      setBoundaries(newBoundaries)
      saveBoundaries(newBoundaries)
    }
  }

  // Remove boundary on right-click
  const handleDividerRightClick = (e, boundaryIdx) => {
    e.preventDefault()
    e.stopPropagation()
    const newBoundaries = boundaries.filter((_, i) => i !== boundaryIdx)
    setBoundaries(newBoundaries)
    saveBoundaries(newBoundaries)
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`
  }

  const scrollBy = (dir) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.6, behavior: 'smooth' })
  }

  const getAudioUrl = () => {
    if (voiceover?.audio_file_path) return `/storage/${voiceover.audio_file_path}`
    return null
  }

  if (loading) {
    return <div style={{ padding: '16px', color: 'var(--text-muted)' }}>Loading caption data...</div>
  }

  if (!words.length) {
    return <div style={{ padding: '16px', color: 'var(--text-muted)' }}>No caption data available.</div>
  }

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '10px',
      padding: '16px', background: 'var(--bg-surface-alt)',
      borderRadius: '8px', border: '1px solid var(--border)',
    }}>
      {/* Hidden audio for standalone use */}
      {!audioRef && <audio ref={localAudioRef} src={getAudioUrl()} preload="auto" />}

      {/* Top controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Caption Grouping
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary"
          onClick={handleAutoGroup}
          disabled={autoGrouping}
          style={{ fontSize: '13px', padding: '5px 14px' }}
        >
          {autoGrouping ? 'Grouping...' : 'Auto-group (AI)'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleResetDefault}
          disabled={saving}
          style={{ fontSize: '13px', padding: '5px 14px' }}
        >
          Reset Default
        </button>
        <button
          className="btn btn-secondary"
          onClick={togglePlay}
          style={{ fontSize: '13px', padding: '5px 14px', minWidth: '60px' }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {groups.length} groups | {words.length} words
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
        Drag sliders to adjust groups. Double-click between words to add a split. Right-click a slider to remove it.
      </p>

      {/* Scrollable word strip */}
      <div style={{
        position: 'relative',
        borderRadius: '6px', border: '1px solid var(--border)',
        background: 'var(--bg-surface)', overflow: 'hidden',
      }}>
        {/* Navigation arrows */}
        <button
          onClick={() => scrollBy(-1)}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '24px',
            zIndex: 30, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(to right, rgba(0,0,0,0.3), transparent)',
            color: 'white', fontSize: '14px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >&#9664;</button>
        <button
          onClick={() => scrollBy(1)}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '24px',
            zIndex: 30, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(to left, rgba(0,0,0,0.3), transparent)',
            color: 'white', fontSize: '14px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >&#9654;</button>

        <div
          ref={scrollRef}
          style={{ overflowX: 'auto', overflowY: 'hidden' }}
        >
          <div
            ref={trackRef}
            onDoubleClick={handleTrackDoubleClick}
            style={{
              position: 'relative',
              width: `${totalWidth}px`,
              userSelect: 'none',
              cursor: dragging ? 'col-resize' : 'default',
            }}
          >
            {/* Group labels row */}
            <div style={{ position: 'relative', height: `${GROUP_LABEL_HEIGHT}px`, borderBottom: '1px solid var(--border)' }}>
              {groups.map((group, gi) => {
                const left = group.start * pxPerSecond
                const width = (group.end - group.start) * pxPerSecond
                const isActive = currentTime >= group.start && currentTime < group.end
                return (
                  <div
                    key={`gl-${gi}`}
                    style={{
                      position: 'absolute', left: `${left}px`, width: `${Math.max(width, 20)}px`,
                      top: 0, bottom: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                      borderRight: '1px solid var(--border)',
                      overflow: 'hidden', whiteSpace: 'nowrap',
                      background: isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                    }}
                  >
                    <span>G{gi + 1}</span>
                    <span style={{ marginLeft: '4px', fontSize: '9px', opacity: 0.7 }}>
                      {formatTime(group.start)}-{formatTime(group.end)}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Words row */}
            <div style={{ position: 'relative', height: `${WORD_ROW_HEIGHT}px` }}>
              {words.map((word, wi) => {
                const left = word.start * pxPerSecond
                const width = Math.max((word.end - word.start) * pxPerSecond, 8)
                const isSpoken = currentTime >= word.start && currentTime < word.end
                const isBoundary = sortedBoundaries.includes(wi)

                return (
                  <div
                    key={`w-${wi}`}
                    onClick={() => handleWordClick(word)}
                    style={{
                      position: 'absolute', left: `${left}px`, width: `${width}px`,
                      top: 0, bottom: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: isSpoken ? 'rgba(99,102,241,0.2)' : 'transparent',
                      borderLeft: isBoundary ? 'none' : undefined,
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{
                      fontSize: '11px',
                      fontWeight: isSpoken ? 700 : 400,
                      color: isSpoken ? 'var(--primary)' : 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      padding: '0 2px',
                    }}>
                      {word.word}
                    </span>
                  </div>
                )
              })}

              {/* Boundary dividers */}
              {sortedBoundaries.map((bIdx, bi) => {
                if (bIdx <= 0 || bIdx >= words.length) return null
                const prevWord = words[bIdx - 1]
                const nextWord = words[bIdx]
                const x = ((prevWord.end + nextWord.start) / 2) * pxPerSecond
                return (
                  <div
                    key={`bd-${bi}`}
                    onMouseDown={(e) => handleDividerMouseDown(e, bi)}
                    onContextMenu={(e) => handleDividerRightClick(e, bi)}
                    style={{
                      position: 'absolute', left: `${x - 8}px`,
                      top: 0, bottom: 0, width: '16px',
                      cursor: 'col-resize', zIndex: 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <div style={{
                      width: '3px', height: '100%',
                      background: 'var(--warning)',
                      borderRadius: '2px',
                      boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                    }} />
                  </div>
                )
              })}

              {/* Playhead */}
              <div style={{
                position: 'absolute', left: `${currentTime * pxPerSecond}px`,
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
          </div>
        </div>
      </div>

      {saving && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Saving...</span>
      )}
    </div>
  )
}

export default CaptionGroupEditor
