import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

const IMAGE_MODELS = [
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana (default)' },
  { id: 'gemini-image-2', label: 'Nano Banana Pro' },
  { id: '', label: 'Leonardo Diffusion XL' },
  { id: 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3', label: 'Leonardo Phoenix 1.0' },
  { id: '6b645e3a-d64f-4341-a6d8-7a3690fbf042', label: 'Leonardo Phoenix 0.9' },
  { id: '1e60896f-3c26-4296-8ecc-53e2afecc132', label: 'Leonardo Diffusion XL' },
  { id: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', label: 'Leonardo Lightning XL' },
]

function SceneDetail({ scriptId, sceneId, onBack, onNextScene, onPrevScene, hasNextScene, hasPrevScene }) {
  const [scene, setScene] = useState(null)
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [visualStyles, setVisualStyles] = useState([])
  const [sceneStyles, setSceneStyles] = useState([])
  const [selectedStyle, setSelectedStyle] = useState(null)
  const [selectedSceneStyle, setSelectedSceneStyle] = useState(null)
  const [selectedImageRef, setSelectedImageRef] = useState(null)
  const [imageReferences, setImageReferences] = useState([])
  const [generatingDescription, setGeneratingDescription] = useState(false)
  const [iteratingDescription, setIteratingDescription] = useState(false)
  const [iterateComments, setIterateComments] = useState('')
  const [continueFromPreviousScene, setContinueFromPreviousScene] = useState(() => {
    try { return localStorage.getItem('continuedScene') === 'true' } catch { return false }
  })
  const [visualDescriptions, setVisualDescriptions] = useState([])
  const [currentDescriptionIndex, setCurrentDescriptionIndex] = useState(0)
  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(true)
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-image')
  const [generatingImage, setGeneratingImage] = useState(false)
  const [enlargedImageIndex, setEnlargedImageIndex] = useState(null)
  const [displayedImageIndex, setDisplayedImageIndex] = useState(0)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)

  useEffect(() => {
    loadData()
    const imgInterval = setInterval(() => {
      if (sceneId) loadImages(parseInt(sceneId), false)
    }, 5000)
    return () => clearInterval(imgInterval)
  }, [scriptId, sceneId])

  useEffect(() => {
    setDisplayedImageIndex(0)
  }, [images.length])

  // Sync edited description when the displayed description changes (e.g. navigation)
  useEffect(() => {
    const desc = visualDescriptions[currentDescriptionIndex]
    const disp = desc?.description ?? scene?.visual_description ?? ''
    setEditedDescription(disp)
    setEditingDescription(false)
  }, [visualDescriptions, currentDescriptionIndex, scene?.visual_description, scene?.id])

  // Load presets (scene styles, visual styles, image references) on mount
  useEffect(() => {
    if (!scriptId) return
    loadVisualStyles()
    loadSceneStyles()
    loadImageReferences()
  }, [scriptId])

  const loadData = async () => {
    if (!scriptId || !sceneId) return
    setLoading(true)
    try {
      const scenesRes = await axios.get(`${API_BASE}/projects/${scriptId}/scenes`)
      const scenesData = scenesRes.data
      const sceneData = scenesData.find(s => s.id === parseInt(sceneId))
      setScenes(scenesData)
      setScene(sceneData || null)

      if (sceneData) {
        setEditText(sceneData.text)
        /* selectedStyle (Visual) is not stored on scene - only used for next generate; don't overwrite */
        setSelectedSceneStyle(sceneData.scene_style_id || null)
        setSelectedImageRef(sceneData.image_reference_id || null)
        await Promise.all([
          loadVisualDescriptions(sceneData.id),
          loadImages(sceneData.id),
          loadVisualStyles(),
          loadSceneStyles(),
          loadImageReferences(),
        ])
      }
    } catch (error) {
      console.error('Error loading scene:', error)
      setScene(null)
    } finally {
      setLoading(false)
    }
  }

  const loadVisualDescriptions = async (sid) => {
    try {
      const response = await axios.get(`${API_BASE}/scenes/${sid}/visual-descriptions`)
      setVisualDescriptions(response.data)
      setCurrentDescriptionIndex(Math.max(0, response.data.length - 1))
    } catch (error) {
      console.error('Error loading visual descriptions:', error)
      setVisualDescriptions([])
    }
  }

  const loadImages = async (sid, showLoading = true) => {
    if (showLoading) setLoadingImages(true)
    try {
      const response = await axios.get(`${API_BASE}/scenes/${sid}/images`)
      setImages(response.data)
    } catch (error) {
      setImages([])
    } finally {
      if (showLoading) setLoadingImages(false)
    }
  }

  const loadVisualStyles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/visual-styles`)
      setVisualStyles(response.data)
    } catch (error) {
      console.error('Error loading visual styles:', error)
    }
  }

  const loadSceneStyles = async () => {
    try {
      const response = await axios.get(`${API_BASE}/scene-styles`)
      setSceneStyles(response.data)
    } catch (error) {
      console.error('Error loading scene styles:', error)
    }
  }

  const loadImageReferences = async () => {
    try {
      const response = await axios.get(`${API_BASE}/image-references`)
      setImageReferences(response.data)
    } catch (error) {
      console.error('Error loading image references:', error)
    }
  }

  const handleSaveEdit = async () => {
    if (!scene) return
    try {
      await axios.put(`${API_BASE}/scenes/${scene.id}`, {
        text: editText,
        scene_style_id: selectedSceneStyle || null,
        image_reference_id: selectedImageRef || null,
      })
      setEditing(false)
      await loadData()
    } catch (error) {
      console.error('Error saving scene:', error)
      alert('Error saving scene')
    }
  }

  const handleSceneStyleChange = async (sceneStyleId) => {
    const newStyleId = sceneStyleId ? parseInt(sceneStyleId) : null
    setSelectedSceneStyle(newStyleId)
    if (!scene) return
    try {
      await axios.put(`${API_BASE}/scenes/${scene.id}`, { scene_style_id: newStyleId })
      await loadData()
    } catch (error) {
      console.error('Error updating scene style:', error)
    }
  }

  const handleImageReferenceChange = async (imageRefId) => {
    const refId = imageRefId ? parseInt(imageRefId) : null
    setSelectedImageRef(refId)
    if (!scene) return
    try {
      await axios.put(`${API_BASE}/scenes/${scene.id}`, { image_reference_id: refId })
      await loadData()
    } catch (error) {
      console.error('Error updating image reference:', error)
    }
  }

  const handleIterateDescription = async () => {
    if (!scene || !iterateComments.trim()) return
    setIteratingDescription(true)
    try {
      await axios.post(`${API_BASE}/scenes/${scene.id}/iterate-visual-description`, {
        comments: iterateComments.trim(),
        current_description: editedDescription
      })
      setIterateComments('')
      await loadVisualDescriptions(scene.id)
      await loadData()
    } catch (error) {
      console.error('Error iterating description:', error)
      alert('Error iterating description: ' + (error.response?.data?.detail || error.message))
    } finally {
      setIteratingDescription(false)
    }
  }

  const handleSaveDescription = async () => {
    if (!scene) return
    const currentDesc = getCurrentDescription()
    const orig = currentDesc?.description ?? scene.visual_description ?? ''
    if (editedDescription === orig) return
    setSavingDescription(true)
    try {
      if (currentDesc) {
        await axios.put(`${API_BASE}/scenes/${scene.id}/visual-descriptions/${currentDesc.id}`, { description: editedDescription })
        setVisualDescriptions(prev => prev.map((d, i) => i === currentDescriptionIndex ? { ...d, description: editedDescription } : d))
      } else {
        await axios.put(`${API_BASE}/scenes/${scene.id}`, { visual_description: editedDescription })
      }
      setScene(prev => prev ? { ...prev, visual_description: editedDescription } : null)
      setEditingDescription(false)
    } catch (error) {
      console.error('Error saving description:', error)
      alert('Error saving description: ' + (error.response?.data?.detail || error.message))
    } finally {
      setSavingDescription(false)
    }
  }

  const handleCancelEditDescription = () => {
    const orig = getCurrentDescription()?.description ?? scene?.visual_description ?? ''
    setEditedDescription(orig)
    setEditingDescription(false)
  }

  const handleGenerateVisualDescription = async () => {
    if (!scene) return
    setGeneratingDescription(true)
    try {
      await axios.post(`${API_BASE}/scenes/${scene.id}/generate-visual-description`, null, {
        params: continueFromPreviousScene ? { continue_from_previous_scene: true } : {}
      })
      await loadVisualDescriptions(scene.id)
    } catch (error) {
      console.error('Error generating visual description:', error)
      alert('Error generating scene description: ' + (error.response?.data?.detail || error.message))
    } finally {
      setGeneratingDescription(false)
    }
  }

  const handleNavigateDescription = async (direction) => {
    if (visualDescriptions.length === 0 || !scene) return
    const currentIndex = currentDescriptionIndex
    let newIndex = currentIndex
    if (direction === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1  // ← go to older (lower index)
    } else if (direction === 'next' && currentIndex < visualDescriptions.length - 1) {
      newIndex = currentIndex + 1
    } else return

    setCurrentDescriptionIndex(newIndex)
    const selectedDesc = visualDescriptions[newIndex]
    try {
      await axios.put(`${API_BASE}/scenes/${scene.id}/visual-descriptions/${selectedDesc.id}/set-current`)
      setScene(prev => prev ? { ...prev, visual_description: selectedDesc.description } : null)
    } catch (error) {
      console.error('Error setting current description:', error)
    }
  }

  const getCurrentDescription = () => {
    if (visualDescriptions.length === 0) return null
    return visualDescriptions[currentDescriptionIndex]
  }

  const handleGenerateImage = async () => {
    if (!scene) return
    console.log('[WORKFLOW] 1. Frontend: Generate image clicked, scene_id=', scene.id)
    setGeneratingImage(true)
    const initialCount = images.length
    console.log('[WORKFLOW] 2. Frontend: initialCount=', initialCount, 'editedDescription length=', editedDescription?.length ?? 0)
    try {
      const params = {}
      if (selectedStyle) params.visual_style_id = selectedStyle
      if (selectedModel) params.model_id = selectedModel
      const body = {
        ...(editedDescription ? { scene_description: editedDescription } : {}),
        continue_from_previous_scene: continueFromPreviousScene
      }
      console.log('[WORKFLOW] 3. Frontend: POST body=', JSON.stringify(body).slice(0, 200), 'params=', params)
      await axios.post(`${API_BASE}/scenes/${scene.id}/generate-image`, body, { params })
      console.log('[WORKFLOW] 4. Frontend: API returned, starting poll')
      await loadData()
      await loadImages(scene.id, true)
      // Poll until new image with file_path appears (generation completes) or timeout
      const maxWaitMs = 3 * 60 * 1000
      const pollIntervalMs = 3000
      const start = Date.now()
      let pollCount = 0
      while (Date.now() - start < maxWaitMs) {
        pollCount++
        const res = await axios.get(`${API_BASE}/scenes/${scene.id}/images`)
        const imgs = res.data || []
        const newest = imgs[0]
        const hasNewWithFile = imgs.length > initialCount && newest && (newest.file_path || newest.url)
        if (pollCount <= 2 || hasNewWithFile) {
          console.log('[WORKFLOW] 5. Frontend: poll', pollCount, 'imgs.length=', imgs.length, 'hasNewWithFile=', hasNewWithFile, 'newest=', newest ? { id: newest.id, file_path: newest.file_path, url: newest.url } : null)
        }
        if (hasNewWithFile) {
          setImages(imgs)
          setDisplayedImageIndex(0)
          console.log('[WORKFLOW] 6. Frontend: Done, new image displayed')
          break
        }
        await new Promise(r => setTimeout(r, pollIntervalMs))
      }
      if (Date.now() - start >= maxWaitMs) {
        console.log('[WORKFLOW] 7. Frontend: Timeout after 3 min, no new image')
      }
    } catch (error) {
      console.error('[WORKFLOW] Frontend ERROR:', error)
      const msg = error.response?.data?.detail || error.message || 'Error generating image'
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setGeneratingImage(false)
    }
  }

  const handleApproveImage = async () => {
    if (!displayedImage?.id) return
    try {
      await axios.post(`${API_BASE}/images/${displayedImage.id}/approve`)
      await loadData()
    } catch (error) {
      console.error('Error approving image:', error)
      alert('Error approving image')
    }
  }

  const getImageUrl = (image) => {
    if (image.url) return image.url
    if (image.file_path) return `/storage/${image.file_path.replace(/\\/g, '/')}`
    return null
  }

  if (loading || !scene) {
    return (
      <div className="card">
        {loading ? (
          <p>Loading scene...</p>
        ) : (
          <p>Scene not found.</p>
        )}
        <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '16px' }}>
          ← Back to Scenes
        </button>
      </div>
    )
  }

  const currentDesc = getCurrentDescription()
  const displayDescription = currentDesc?.description || scene.visual_description
  const mainImage = images[0]
  const displayedImage = images[displayedImageIndex] ?? images[0]
  const hasMultipleImages = images.length > 1

  return (
    <div className="card scene-detail-card" style={{ padding: '16px', marginBottom: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onBack}>← Back</button>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Scene {scene.order}</h2>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {hasPrevScene && <button className="btn btn-secondary" onClick={onPrevScene}>← Prev</button>}
          {hasNextScene && <button className="btn btn-secondary" onClick={onNextScene}>Next →</button>}
        </div>
      </div>

      {/* Scene text + Edit */}
      {editing ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '12px', flexShrink: 0 }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{ flex: 1, minHeight: '80px', padding: '10px', fontSize: '15px', border: '1px solid var(--border)', borderRadius: '4px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button className="btn btn-primary" onClick={handleSaveEdit}>Save</button>
            <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '12px', flexShrink: 0 }}>
          <p style={{ flex: 1, margin: 0, padding: '10px 12px', background: 'var(--bg-surface-alt)', borderRadius: '6px', fontSize: '15px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {scene.text}
          </p>
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}

      {/* Two columns: Left = controls + description | Right = image (520px) + other versions (100px) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 632px', gap: '24px', ...(editingDescription ? { flex: 1, minHeight: 0, gridTemplateRows: '1fr', alignItems: 'stretch' } : { alignItems: 'start' }) }}>
        {/* Left column */}
        <div style={editingDescription ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : {}}>
          {!editingDescription && (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Scene:</label>
              <select value={selectedSceneStyle || ''} onChange={(e) => handleSceneStyleChange(e.target.value)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '130px' }}>
                <option value="">None</option>
                {sceneStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className={continueFromPreviousScene ? 'btn btn-info' : 'btn btn-secondary'}
                onClick={() => {
                  const next = !continueFromPreviousScene
                  setContinueFromPreviousScene(next)
                  try { localStorage.setItem('continuedScene', next ? 'true' : 'false') } catch {}
                }}
                title="Use previous scene description as context for continuity"
              >
                {continueFromPreviousScene ? '✓ ' : ''}Continued scene
              </button>
              <button className="btn btn-info" onClick={handleGenerateVisualDescription} disabled={generatingDescription}>
                {generatingDescription ? '...' : 'Generate Scene Description'}
              </button>
            </div>
          </div>
          )}

          {displayDescription ? (
            <div style={{ padding: '10px 12px', background: 'var(--bg-surface-alt)', borderRadius: '6px', border: '1px solid var(--info)', ...(editingDescription ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Scene Description</span>
                {visualDescriptions.length > 1 && !editingDescription && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button className="btn btn-secondary" onClick={() => handleNavigateDescription('prev')} disabled={currentDescriptionIndex <= 0}>←</button>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'center' }}>{currentDescriptionIndex + 1}/{visualDescriptions.length}</span>
                    <button className="btn btn-secondary" onClick={() => handleNavigateDescription('next')} disabled={currentDescriptionIndex >= visualDescriptions.length - 1}>→</button>
                  </div>
                )}
                {!editingDescription ? (
                  <button className="btn btn-secondary" onClick={() => setEditingDescription(true)} style={{ marginLeft: 'auto' }}>Edit</button>
                ) : (
                  <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                    <button className="btn btn-primary" onClick={handleSaveDescription} disabled={savingDescription || editedDescription === (getCurrentDescription()?.description ?? scene?.visual_description ?? '')}>
                      {savingDescription ? '...' : 'Save'}
                    </button>
                    <button className="btn btn-secondary" onClick={handleCancelEditDescription}>Cancel</button>
                  </div>
                )}
              </div>
              {editingDescription ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    style={{ flex: 1, width: '100%', minHeight: 0, margin: 0, padding: '8px 10px', fontSize: '15px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4, border: '1px solid var(--border)', borderRadius: '4px', resize: 'none', background: 'var(--bg-surface)' }}
                  />
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{editedDescription}</p>
              )}
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                {editedDescription.length} / 1500 characters
              </div>
              {displayDescription && !editingDescription && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start', flexShrink: 0 }}>
                  <textarea
                    value={iterateComments}
                    onChange={(e) => setIterateComments(e.target.value)}
                    placeholder="Add comments for updates (e.g. 'make it darker', 'add more emotion')"
                    style={{ flex: 1, minHeight: '60px', padding: '8px 10px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '4px', resize: 'vertical' }}
                  />
                  <button className="btn btn-secondary" onClick={handleIterateDescription} disabled={iteratingDescription || !iterateComments.trim()} style={{ padding: '6px 12px', fontSize: '13px', flexShrink: 0 }}>
                    {iteratingDescription ? '...' : 'Iterate'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>No scene description. Generate one to create images.</p>
          )}
        </div>

        {/* Right column: Visual + Ref + Model + Generate, then Main image | Other versions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...(editingDescription ? { alignSelf: 'start' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Visual:</label>
              <select value={selectedStyle || ''} onChange={(e) => setSelectedStyle(e.target.value ? parseInt(e.target.value) : null)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '130px' }}>
                <option value="">None</option>
                {visualStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: continueFromPreviousScene ? 0.5 : 1 }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Ref:</label>
              <select value={selectedImageRef || ''} onChange={(e) => handleImageReferenceChange(e.target.value)} disabled={continueFromPreviousScene} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '110px' }} title={continueFromPreviousScene ? 'Disabled when Continued scene is on (uses previous scene\'s approved image)' : ''}>
                <option value="">None</option>
                {imageReferences.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Model:</label>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}>
                {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn btn-success" onClick={handleGenerateImage} disabled={!editedDescription || generatingImage} style={{ opacity: !editedDescription ? 0.6 : 1 }} title={!editedDescription ? 'Generate scene description first' : ''}>
                Generate image
              </button>
              {generatingImage && <span className="spinner" aria-hidden="true" />}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', width: 'fit-content' }}>
            {/* Main image with navigation arrows - click to enlarge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ position: 'relative', width: '520px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-hover)', cursor: displayedImage ? 'pointer' : 'default' }} onClick={() => displayedImage && getImageUrl(displayedImage) && setEnlargedImageIndex(displayedImageIndex)}>
              {loadingImages ? (
                <div style={{ height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>Loading...</div>
              ) : displayedImage ? (
                <img src={getImageUrl(displayedImage)} alt={`Scene ${scene.order}`} style={{ width: '100%', display: 'block' }} />
              ) : (
                <div style={{ height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>No image</div>
              )}
              {hasMultipleImages && (
                <>
                  {displayedImageIndex > 0 && (
                    <button
                      type="button"
                      className="nav-arrow"
                      onClick={(e) => { e.stopPropagation(); setDisplayedImageIndex(displayedImageIndex - 1) }}
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.9)',
                        background: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        fontSize: '20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Previous image"
                    >
                      ←
                    </button>
                  )}
                  {displayedImageIndex < images.length - 1 && (
                    <button
                      type="button"
                      className="nav-arrow"
                      onClick={(e) => { e.stopPropagation(); setDisplayedImageIndex(displayedImageIndex + 1) }}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.9)',
                        background: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        fontSize: '20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Next image"
                    >
                      →
                    </button>
                  )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {displayedImage?.prompt && (
                <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); setPromptModalOpen(true) }} style={{ padding: '6px 12px', fontSize: '13px' }}>
                  View prompt
                </button>
              )}
              {displayedImage?.id && (
                <button
                  type="button"
                  className={scene.approved_image_id === displayedImage.id ? 'btn btn-success' : 'btn btn-secondary'}
                  onClick={(e) => { e.stopPropagation(); handleApproveImage() }}
                  style={{ padding: '6px 12px', fontSize: '13px' }}
                  title={scene.approved_image_id === displayedImage.id ? 'This image is approved (used as reference when continuing)' : 'Approve this image for use as reference when continuing from previous scene'}
                >
                  {scene.approved_image_id === displayedImage.id ? '✓ Approved' : 'Approve'}
                </button>
              )}
            </div>
            </div>
            {/* Other versions - to the right of main image, click to enlarge */}
            {images.length > 1 && (
              <div style={{ flexShrink: 0, width: '100px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>Other</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {images.filter((_, i) => i !== displayedImageIndex).map((image) => {
                    const imageUrl = getImageUrl(image)
                    const idx = images.findIndex(img => img.id === image.id)
                    return (
                      <div key={image.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); if (imageUrl) { setDisplayedImageIndex(idx); setEnlargedImageIndex(idx) } }}>
                        {imageUrl && <img src={imageUrl} alt="" style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '4px' }} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enlarged image overlay with navigation arrows */}
      {enlargedImageIndex !== null && images[enlargedImageIndex] && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
          }}
          onClick={() => setEnlargedImageIndex(null)}
        >
          {enlargedImageIndex > 0 && (
            <button
              type="button"
              className="nav-arrow"
              onClick={(e) => { e.stopPropagation(); setEnlargedImageIndex(enlargedImageIndex - 1) }}
              style={{
                position: 'absolute',
                left: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.8)',
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Previous image"
            >
              ←
            </button>
          )}
          {enlargedImageIndex < images.length - 1 && (
            <button
              type="button"
              className="nav-arrow"
              onClick={(e) => { e.stopPropagation(); setEnlargedImageIndex(enlargedImageIndex + 1) }}
              style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.8)',
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                fontSize: '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Next image"
            >
              →
            </button>
          )}
          <img
            src={getImageUrl(images[enlargedImageIndex])}
            alt="Enlarged"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Prompt modal - shows prompt for currently displayed image */}
      {promptModalOpen && displayedImage?.prompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9998,
            padding: '20px',
          }}
          onClick={() => setPromptModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: '8px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Image generation prompt</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setPromptModalOpen(false)} style={{ padding: '4px 12px', fontSize: '14px' }}>Close</button>
            </div>
            <pre style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)' }}>
              {displayedImage.prompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default SceneDetail
