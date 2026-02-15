import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

const IMAGE_MODELS = [
  { id: '', label: 'Default (Leonardo Diffusion XL)' },
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana' },
  { id: 'gemini-image-2', label: 'Nano Banana Pro' },
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
  const [visualDescriptions, setVisualDescriptions] = useState([])
  const [currentDescriptionIndex, setCurrentDescriptionIndex] = useState(0)
  const [images, setImages] = useState([])
  const [loadingImages, setLoadingImages] = useState(true)
  const [selectedModel, setSelectedModel] = useState('')

  useEffect(() => {
    loadData()
    const imgInterval = setInterval(() => {
      if (sceneId) loadImages(parseInt(sceneId), false)
    }, 5000)
    return () => clearInterval(imgInterval)
  }, [scriptId, sceneId])

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
        setSelectedStyle(sceneData.visual_style_id || null)
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
      setCurrentDescriptionIndex(0)
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

  const handleGenerateVisualDescription = async () => {
    if (!scene) return
    setGeneratingDescription(true)
    try {
      await axios.post(`${API_BASE}/scenes/${scene.id}/generate-visual-description`)
      await loadVisualDescriptions(scene.id)
      setCurrentDescriptionIndex(0)
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
    if (direction === 'next' && currentIndex > 0) {
      newIndex = currentIndex - 1
    } else if (direction === 'prev' && currentIndex < visualDescriptions.length - 1) {
      newIndex = currentIndex + 1
    } else return

    setCurrentDescriptionIndex(newIndex)
    const selectedDesc = visualDescriptions[newIndex]
    try {
      await axios.put(`${API_BASE}/scenes/${scene.id}/visual-descriptions/${selectedDesc.id}/set-current`)
      await loadData()
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
    try {
      const params = {}
      if (selectedStyle) params.visual_style_id = selectedStyle
      if (selectedModel) params.model_id = selectedModel
      await axios.post(`${API_BASE}/scenes/${scene.id}/generate-image`, null, { params })
      await loadData()
      await loadImages(scene.id, true)
    } catch (error) {
      console.error('Error generating image:', error)
      alert('Error generating image')
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

  return (
    <div className="card" style={{ padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '12px' }}>
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '12px' }}>
          <p style={{ flex: 1, margin: 0, padding: '10px 12px', background: 'var(--bg-surface-alt)', borderRadius: '6px', fontSize: '15px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {scene.text}
          </p>
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
        </div>
      )}

      {/* Two columns: Left = controls + description | Right = image + other versions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 520px', gap: '24px', alignItems: 'start' }}>
        {/* Left column */}
        <div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Scene:</label>
              <select value={selectedSceneStyle || ''} onChange={(e) => handleSceneStyleChange(e.target.value)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '130px' }}>
                <option value="">None</option>
                {sceneStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Visual:</label>
              <select value={selectedStyle || ''} onChange={(e) => setSelectedStyle(e.target.value ? parseInt(e.target.value) : null)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '130px' }}>
                <option value="">None</option>
                {visualStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Ref:</label>
              <select value={selectedImageRef || ''} onChange={(e) => handleImageReferenceChange(e.target.value)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '110px' }}>
                <option value="">None</option>
                {imageReferences.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <button className="btn btn-info" onClick={handleGenerateVisualDescription} disabled={generatingDescription}>
              {generatingDescription ? '...' : 'Generate Scene Description'}
            </button>
          </div>

          {displayDescription ? (
            <div style={{ padding: '10px 12px', background: 'var(--bg-surface-alt)', borderRadius: '6px', border: '1px solid var(--info)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Scene Description</span>
                {visualDescriptions.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button className="btn btn-secondary" onClick={() => handleNavigateDescription('prev')} disabled={currentDescriptionIndex >= visualDescriptions.length - 1}>←</button>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'center' }}>{currentDescriptionIndex + 1}/{visualDescriptions.length}</span>
                    <button className="btn btn-secondary" onClick={() => handleNavigateDescription('next')} disabled={currentDescriptionIndex <= 0}>→</button>
                  </div>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{displayDescription}</p>
            </div>
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>No scene description. Generate one to create images.</p>
          )}
        </div>

        {/* Right column: Model + Generate + Main image + Other versions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '18px', fontWeight: 'bold' }}>Model:</label>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ padding: '5px 10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}>
                {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <button className="btn btn-success" onClick={handleGenerateImage} disabled={!scene.visual_description} style={{ opacity: !scene.visual_description ? 0.6 : 1 }} title={!scene.visual_description ? 'Generate scene description first' : ''}>
              Generate image
            </button>
          </div>
          <div style={{ borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-hover)' }}>
            {loadingImages ? (
              <div style={{ height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : mainImage ? (
              <img src={getImageUrl(mainImage)} alt={`Scene ${scene.order}`} style={{ width: '100%', display: 'block' }} />
            ) : (
              <div style={{ height: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>No image</div>
            )}
          </div>
          {/* Other versions - directly under main image */}
          {images.length > 1 && (
            <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 'bold' }}>Other versions</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {images.filter(img => img.id !== mainImage.id).map((image) => {
                  const imageUrl = getImageUrl(image)
                  return (
                    <div key={image.id} style={{ width: '100px', flexShrink: 0 }}>
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
  )
}

export default SceneDetail
