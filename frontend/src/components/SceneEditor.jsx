import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function SceneEditor({ scriptId, onBack, onNext, onOpenScene }) {
  const [scenes, setScenes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [visualStyles, setVisualStyles] = useState([])
  const [sceneStyles, setSceneStyles] = useState([])
  const [selectedStyles, setSelectedStyles] = useState({}) // sceneId -> visualStyleId
  const [selectedSceneStyles, setSelectedSceneStyles] = useState({}) // sceneId -> sceneStyleId
  const [selectedImageRefs, setSelectedImageRefs] = useState({}) // sceneId -> imageReferenceId
  const [imageReferences, setImageReferences] = useState([])
  const [generatingDescriptions, setGeneratingDescriptions] = useState({}) // sceneId -> true/false
  const [visualDescriptions, setVisualDescriptions] = useState({}) // sceneId -> array of descriptions
  const [currentDescriptionIndex, setCurrentDescriptionIndex] = useState({}) // sceneId -> current index
  const [segmentationPreview, setSegmentationPreview] = useState('')
  const [segmentationPreviewOpen, setSegmentationPreviewOpen] = useState(false)
  const [applyingPreview, setApplyingPreview] = useState(false)
  const [sceneImages, setSceneImages] = useState({}) // sceneId -> images[]

  useEffect(() => {
    loadScenes()
    loadVisualStyles()
    loadSceneStyles()
    loadImageReferences()
    // Poll for new scenes (in case segmentation is still running)
    // Stop polling once scenes are loaded or after 30 seconds
    let pollCount = 0
    const maxPolls = 10 // Stop after 10 polls (30 seconds)
    
    const interval = setInterval(async () => {
      pollCount++
      const scenesData = await loadScenes()
      scenesData.forEach(s => loadSceneImages(s.id))
      if (scenesData.length > 0 || pollCount >= maxPolls) {
        clearInterval(interval)
      }
    }, 3000)
    
    return () => clearInterval(interval)
  }, [scriptId])

  useEffect(() => {
    const initialSceneStyles = {}
    const initialImageRefs = {}
    scenes.forEach(scene => {
      if (scene.scene_style_id) initialSceneStyles[scene.id] = scene.scene_style_id
      if (scene.image_reference_id) initialImageRefs[scene.id] = scene.image_reference_id
      if (scene.id) {
        loadVisualDescriptions(scene.id)
        loadSceneImages(scene.id)
      }
    })
    setSelectedSceneStyles(prev => ({ ...prev, ...initialSceneStyles }))
    setSelectedImageRefs(prev => ({ ...prev, ...initialImageRefs }))
    setCurrentDescriptionIndex(prev => {
      const next = { ...prev }
      scenes.forEach(scene => {
        if (scene.id && next[scene.id] === undefined) {
          next[scene.id] = 0
        }
      })
      return next
    })

    if (scenes.length === 0) return
    const imgInterval = setInterval(() => scenes.forEach(s => loadSceneImages(s.id)), 5000)
    return () => clearInterval(imgInterval)
  }, [scenes])

  const loadSceneImages = async (sceneId) => {
    try {
      const response = await axios.get(`${API_BASE}/scenes/${sceneId}/images`)
      setSceneImages(prev => ({ ...prev, [sceneId]: response.data }))
    } catch {
      setSceneImages(prev => ({ ...prev, [sceneId]: [] }))
    }
  }

  const getImageUrl = (image) => {
    if (image.url) return image.url
    if (image.file_path) return `/storage/${image.file_path.replace(/\\/g, '/')}`
    return null
  }

  const loadVisualDescriptions = async (sceneId) => {
    try {
      const response = await axios.get(`${API_BASE}/scenes/${sceneId}/visual-descriptions`)
      setVisualDescriptions(prev => ({ ...prev, [sceneId]: response.data }))
      // If we have descriptions and no current index set, set to 0
      if (response.data.length > 0 && !currentDescriptionIndex[sceneId] && currentDescriptionIndex[sceneId] !== 0) {
        setCurrentDescriptionIndex(prev => ({ ...prev, [sceneId]: 0 }))
      }
    } catch (error) {
      console.error('Error loading scene descriptions:', error)
      setVisualDescriptions(prev => ({ ...prev, [sceneId]: [] }))
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

  const handleImageReferenceChange = async (sceneId, imageReferenceId) => {
    try {
      const refId = imageReferenceId ? parseInt(imageReferenceId) : null
      setSelectedImageRefs(prev => ({ ...prev, [sceneId]: refId }))
      await axios.put(`${API_BASE}/scenes/${sceneId}`, {
        image_reference_id: refId,
      })
      await loadScenes()
    } catch (error) {
      console.error('Error updating image reference:', error)
      alert('Error updating image reference')
    }
  }

  const loadScenes = async () => {
    try {
      const response = await axios.get(`${API_BASE}/projects/${scriptId}/scenes`)
      setScenes(response.data)
      setLoading(false)
      return response.data
    } catch (error) {
      console.error('Error loading scenes:', error)
      setLoading(false)
      return []
    }
  }

  const loadSegmentationPreview = async () => {
    try {
      const response = await axios.get(`${API_BASE}/projects/${scriptId}/segmentation-preview`)
      setSegmentationPreview(response.data.preview_text || '')
    } catch (error) {
      console.error('Error loading segmentation preview:', error)
      setSegmentationPreview('')
    }
  }

  useEffect(() => {
    if (scriptId) loadSegmentationPreview()
  }, [scriptId, scenes])

  const handleApplySegmentationPreview = async () => {
    setApplyingPreview(true)
    try {
      await axios.put(`${API_BASE}/projects/${scriptId}/segmentation-preview`, {
        preview_text: segmentationPreview,
      })
      await loadScenes()
      await loadSegmentationPreview()
    } catch (error) {
      console.error('Error applying segmentation:', error)
      alert(error.response?.data?.detail || 'Failed to update scenes from preview')
    } finally {
      setApplyingPreview(false)
    }
  }

  const handleEdit = (scene) => {
    setEditingId(scene.id)
    setEditText(scene.text)
  }

  const handleSaveEdit = async (sceneId) => {
    try {
      await axios.put(`${API_BASE}/scenes/${sceneId}`, {
        text: editText,
        scene_style_id: selectedSceneStyles[sceneId] || null,
        image_reference_id: selectedImageRefs[sceneId] || null,
      })
      setEditingId(null)
      await loadScenes()
    } catch (error) {
      console.error('Error saving scene:', error)
      alert('Error saving scene')
    }
  }

  const handleSceneStyleChange = async (sceneId, sceneStyleId) => {
    try {
      const newStyleId = sceneStyleId ? parseInt(sceneStyleId) : null
      setSelectedSceneStyles({ ...selectedSceneStyles, [sceneId]: newStyleId })
      // Save immediately when scene style changes
      await axios.put(`${API_BASE}/scenes/${sceneId}`, {
        scene_style_id: newStyleId,
      })
      await loadScenes()
      
      // If scene already has a visual description, suggest regenerating
      const scene = scenes.find(s => s.id === sceneId)
      if (scene && scene.visual_description) {
        // Don't auto-regenerate, but the user can click "Regenerate" button
      }
    } catch (error) {
      console.error('Error updating scene style:', error)
      alert('Error updating scene style')
    }
  }

  const handleGenerateVisualDescription = async (sceneId) => {
    try {
      setGeneratingDescriptions({ ...generatingDescriptions, [sceneId]: true })
      await axios.post(`${API_BASE}/scenes/${sceneId}/generate-visual-description`)
      // Reload scenes and visual descriptions
      await loadScenes()
      await loadVisualDescriptions(sceneId)
      // Set to the newest description (index 0)
      setCurrentDescriptionIndex(prev => ({ ...prev, [sceneId]: 0 }))
    } catch (error) {
      console.error('Error generating visual description:', error)
      alert('Error generating scene description: ' + (error.response?.data?.detail || error.message))
    } finally {
      setGeneratingDescriptions({ ...generatingDescriptions, [sceneId]: false })
    }
  }

  const handleNavigateDescription = async (sceneId, direction) => {
    const descriptions = visualDescriptions[sceneId] || []
    if (descriptions.length === 0) return
    
    const currentIndex = currentDescriptionIndex[sceneId] || 0
    let newIndex = currentIndex
    
    // Descriptions are sorted newest first (index 0 = newest)
    // "next" goes to newer (lower index), "prev" goes to older (higher index)
    if (direction === 'next' && currentIndex > 0) {
      newIndex = currentIndex - 1  // Go to newer (lower index)
    } else if (direction === 'prev' && currentIndex < descriptions.length - 1) {
      newIndex = currentIndex + 1  // Go to older (higher index)
    } else {
      return // Can't navigate further
    }
    
    setCurrentDescriptionIndex(prev => ({ ...prev, [sceneId]: newIndex }))
    
    // Set this description as current
    const selectedDesc = descriptions[newIndex]
    try {
      await axios.put(`${API_BASE}/scenes/${sceneId}/visual-descriptions/${selectedDesc.id}/set-current`)
      await loadScenes()
    } catch (error) {
      console.error('Error setting current description:', error)
    }
  }

  const getCurrentDescription = (sceneId) => {
    const descriptions = visualDescriptions[sceneId] || []
    const currentIndex = currentDescriptionIndex[sceneId] ?? 0
    if (descriptions.length === 0) return null
    return descriptions[currentIndex]
  }

  const handleGenerateImage = async (sceneId) => {
    try {
      // If this scene is currently being edited, save the edits first
      if (editingId === sceneId) {
        await axios.put(`${API_BASE}/scenes/${sceneId}`, {
          text: editText,
        })
        setEditingId(null)
      }
      
      // Get selected visual style for this scene
      const visualStyleId = selectedStyles[sceneId] || null
      
      // Trigger image generation
      await axios.post(`${API_BASE}/scenes/${sceneId}/generate-image`, null, {
        params: visualStyleId ? { visual_style_id: visualStyleId } : {}
      })
      loadScenes()
      loadSceneImages(sceneId)
    } catch (error) {
      console.error('Error generating image:', error)
      alert('Error generating image')
    }
  }

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Scenes ({scenes.length})</h2>
        <div>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {scenes.length > 0 && (
            <button className="btn btn-primary" onClick={onNext} style={{ marginLeft: '10px' }}>
              View Images →
            </button>
          )}
        </div>
      </div>

      {/* Segmentation preview - collapsed by default */}
      <div style={{ marginBottom: '12px', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-surface-alt)' }}>
        <button
          type="button"
          onClick={() => setSegmentationPreviewOpen(!segmentationPreviewOpen)}
          style={{
            width: '100%',
            padding: '12px 16px',
            textAlign: 'left',
            fontWeight: 'bold',
            background: segmentationPreviewOpen ? 'var(--info)' : 'var(--bg-hover)',
            color: segmentationPreviewOpen ? 'white' : 'var(--text-primary)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Segmentation preview
          <span style={{ fontSize: '14px', fontWeight: 'normal', opacity: 0.9 }}>
            {segmentationPreviewOpen ? '▼' : '▶'}
          </span>
        </button>
        {segmentationPreviewOpen && (
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Full script with segment boundaries. Put <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>---</code> on its own line between scenes.
              Move a line with <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>---</code> to change boundaries; add more <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>---</code> to split into more scenes.
            </p>
            <textarea
              value={segmentationPreview}
              onChange={(e) => setSegmentationPreview(e.target.value)}
              placeholder="Scene 1 text...&#10;&#10;---&#10;&#10;Scene 2 text..."
              style={{
                width: '100%',
                minHeight: '120px',
                fontFamily: 'inherit',
                fontSize: '14px',
                lineHeight: '1.5',
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                resize: 'vertical',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={handleApplySegmentationPreview}
                disabled={applyingPreview}
              >
                {applyingPreview ? 'Updating...' : 'Update scenes from preview'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadSegmentationPreview}
                disabled={applyingPreview}
              >
                Reset to current
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p>Loading scenes...</p>
      ) : scenes.length === 0 ? (
        <p>No scenes yet. Scenes will appear here after script segmentation completes.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {scenes.map((scene) => {
            const images = sceneImages[scene.id] || []
            const displayImage = images[0]
            const imageUrl = displayImage ? getImageUrl(displayImage) : null

            return (
              <div key={scene.id} className="scene-item" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-surface-alt)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                {/* Top: Scene header with order + status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>Scene {scene.order}</h3>
                  {onOpenScene && (
                    <button className="btn btn-primary" onClick={() => onOpenScene(scene.id)}>
                      Open →
                    </button>
                  )}
                </div>

                {/* Scene text (wide) + Edit button to the right */}
                {editingId === scene.id ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      style={{ flex: 1, minHeight: '60px', padding: '8px', fontSize: '15px', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button className="btn btn-primary" onClick={() => handleSaveEdit(scene.id)}>Save</button>
                      <button className="btn btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <p style={{ flex: 1, margin: 0, padding: '8px 10px', background: 'var(--bg-surface)', borderRadius: '4px', fontSize: '15px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                      {scene.text}
                    </p>
                    <button className="btn btn-secondary" onClick={() => handleEdit(scene)} style={{ flexShrink: 0 }}>Edit</button>
                  </div>
                )}

                {/* Bottom: Left = Scene style + Visual style | Right = Generated image */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'start' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <label style={{ fontSize: '18px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Scene:</label>
                      <select
                        value={selectedSceneStyles[scene.id] || ''}
                        onChange={(e) => handleSceneStyleChange(scene.id, e.target.value)}
                        style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '130px' }}
                      >
                        <option value="">None</option>
                        {sceneStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <label style={{ fontSize: '18px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Visual:</label>
                      <select
                        value={selectedStyles[scene.id] || ''}
                        onChange={(e) => setSelectedStyles({ ...selectedStyles, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                        style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '130px' }}
                      >
                        <option value="">None</option>
                        {visualStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <button
                      className="btn btn-info"
                      onClick={() => handleGenerateVisualDescription(scene.id)}
                      disabled={generatingDescriptions[scene.id]}
                    >
                      {generatingDescriptions[scene.id] ? '...' : 'Generate Scene Description'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <button
                      className="btn btn-success"
                      onClick={() => handleGenerateImage(scene.id)}
                      disabled={!scene.visual_description}
                      style={{ opacity: !scene.visual_description ? 0.6 : 1 }}
                      title={!scene.visual_description ? 'Generate scene description first' : ''}
                    >
                      Generate image
                    </button>
                    <div style={{ width: '200px', height: '130px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-hover)', flexShrink: 0 }}>
                    {imageUrl ? (
                      <img src={imageUrl} alt={`Scene ${scene.order}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                        No image
                      </div>
                    )}
                    </div>
                  </div>
                </div>

                {/* Compact scene description - one line when present */}
                {(scene.visual_description || (visualDescriptions[scene.id] && visualDescriptions[scene.id].length > 0)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    <span style={{ flex: 1, whiteSpace: 'pre-wrap', display: 'block' }}>
                      {getCurrentDescription(scene.id)?.description || scene.visual_description}
                    </span>
                    {visualDescriptions[scene.id]?.length > 1 && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-secondary" onClick={() => handleNavigateDescription(scene.id, 'prev')} disabled={(currentDescriptionIndex[scene.id] || 0) >= visualDescriptions[scene.id].length - 1}>←</button>
                        <span style={{ minWidth: '40px', textAlign: 'center', fontSize: '14px' }}>{(currentDescriptionIndex[scene.id] || 0) + 1}/{visualDescriptions[scene.id].length}</span>
                        <button className="btn btn-secondary" onClick={() => handleNavigateDescription(scene.id, 'next')} disabled={(currentDescriptionIndex[scene.id] || 0) <= 0}>→</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SceneEditor

