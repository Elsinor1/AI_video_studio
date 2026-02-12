import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

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

  useEffect(() => {
    loadData()
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

  const loadImages = async (sid) => {
    setLoadingImages(true)
    try {
      const response = await axios.get(`${API_BASE}/scenes/${sid}/images`)
      setImages(response.data)
    } catch (error) {
      setImages([])
    } finally {
      setLoadingImages(false)
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
      alert('Error generating visual description: ' + (error.response?.data?.detail || error.message))
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

  const handleApprove = async () => {
    if (!scene) return
    try {
      await axios.post(`${API_BASE}/scenes/${scene.id}/approve`, null, {
        params: selectedStyle ? { visual_style_id: selectedStyle } : {},
      })
      alert('Scene approved! Image generation started.')
      await loadData()
      await loadImages(scene.id)
    } catch (error) {
      console.error('Error approving scene:', error)
      alert('Error approving scene')
    }
  }

  const handleApproveImage = async (imageId) => {
    try {
      await axios.post(`${API_BASE}/images/${imageId}/approve`)
      alert('Image approved!')
      await loadImages(scene.id)
    } catch (error) {
      console.error('Error approving image:', error)
    }
  }

  const handleRejectImage = async (imageId) => {
    try {
      await axios.post(`${API_BASE}/images/${imageId}/reject`)
      alert('Image rejected. Generating new one...')
      await loadImages(scene.id)
    } catch (error) {
      console.error('Error rejecting image:', error)
    }
  }

  const getImageUrl = (image) => {
    if (image.url) return image.url
    if (image.file_path) return `/storage/${image.file_path}`
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

  return (
    <div className="card">
      {/* Header with navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          <h2 style={{ margin: 0 }}>Scene {scene.order}</h2>
          <span className={`status-badge status-${scene.status}`}>{scene.status}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {hasPrevScene && (
            <button className="btn btn-secondary" onClick={onPrevScene}>
              ← Prev Scene
            </button>
          )}
          {hasNextScene && (
            <button className="btn btn-secondary" onClick={onNextScene}>
              Next Scene →
            </button>
          )}
        </div>
      </div>

      {/* Scene text */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
          Scene Text
        </h4>
        {editing ? (
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
              <button className="btn btn-primary" onClick={handleSaveEdit}>
                Save
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p
            style={{
              margin: 0,
              padding: '16px',
              background: 'var(--bg-surface-alt)',
              borderRadius: '8px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {scene.text}
          </p>
        )}
        {!editing && (
          <button
            className="btn btn-secondary"
            onClick={() => setEditing(true)}
            style={{ marginTop: '10px', fontSize: '13px' }}
          >
            Edit
          </button>
        )}
      </div>

      {/* Visual description section */}
      <div
        style={{
          marginBottom: '24px',
          padding: '20px',
          background: 'var(--bg-surface-alt)',
          borderRadius: '8px',
          border: '1px solid var(--info)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Visual Description</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {visualDescriptions.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleNavigateDescription('prev')}
                  disabled={currentDescriptionIndex >= visualDescriptions.length - 1}
                  style={{ fontSize: '14px', padding: '4px 8px' }}
                  title="Older description"
                >
                  ←
                </button>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', minWidth: '60px', textAlign: 'center' }}>
                  {currentDescriptionIndex + 1} / {visualDescriptions.length}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleNavigateDescription('next')}
                  disabled={currentDescriptionIndex <= 0}
                  style={{ fontSize: '14px', padding: '4px 8px' }}
                  title="Newer description"
                >
                  →
                </button>
              </div>
            )}
            <button
              className="btn btn-info"
              onClick={handleGenerateVisualDescription}
              disabled={generatingDescription}
              style={{ backgroundColor: generatingDescription ? '#ccc' : undefined }}
            >
              {generatingDescription ? 'Generating...' : 'Generate New'}
            </button>
          </div>
        </div>
        {displayDescription ? (
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
              {displayDescription}
            </p>
            {currentDesc && (
              <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '8px', fontSize: '12px' }}>
                Generated {new Date(currentDesc.created_at).toLocaleString()}
              </small>
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No visual description yet. Generate one to create images for this scene.
          </p>
        )}
      </div>

      {/* Options: Scene style, Visual style, Reference image - always visible */}
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 'bold' }}>
            Scene Style
          </label>
          <select
            value={selectedSceneStyle || ''}
            onChange={(e) => handleSceneStyleChange(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              minWidth: '240px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">None (default)</option>
            {sceneStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 'bold' }}>
            Visual Style (optional)
          </label>
          <select
            value={selectedStyle || ''}
            onChange={(e) => setSelectedStyle(e.target.value ? parseInt(e.target.value) : null)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              minWidth: '240px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">None (default)</option>
            {visualStyles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 'bold' }}>
            Reference Image (optional)
          </label>
          <select
            value={selectedImageRef || ''}
            onChange={(e) => handleImageReferenceChange(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              minWidth: '240px',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">None</option>
            {imageReferences.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Generate image button */}
      {scene.status !== 'approved' && (
        <div style={{ marginBottom: '24px' }}>
          <button
            className="btn btn-success"
            onClick={handleApprove}
            disabled={!scene.visual_description}
            style={{
              backgroundColor: !scene.visual_description ? '#ccc' : undefined,
              cursor: !scene.visual_description ? 'not-allowed' : 'pointer',
            }}
            title={!scene.visual_description ? 'Generate a visual description first' : ''}
          >
            Approve & Generate Image
          </button>
        </div>
      )}

      {/* Generated images for this scene */}
      <div>
        <h4 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>Generated Images</h4>
        {loadingImages ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading images...</p>
        ) : images.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No images generated yet...</p>
        ) : (
          <div className="image-gallery" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {images.map((image) => {
              const imageUrl = getImageUrl(image)
              const isApproved = image.status === 'approved'
              const isRejected = image.status === 'rejected'
              return (
                <div
                  key={image.id}
                  className={`image-item ${isApproved ? 'approved' : ''} ${isRejected ? 'rejected' : ''}`}
                  style={{ maxWidth: '320px' }}
                >
                  {imageUrl ? (
                    <img src={imageUrl} alt={`Scene ${scene.order}`} style={{ width: '100%', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-hover)', borderRadius: '8px' }}>
                      Image loading...
                    </div>
                  )}
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>{image.prompt}</p>
                    <span className={`status-badge status-${image.status}`}>{image.status}</span>
                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                      {!isApproved && (
                        <button
                          className="btn btn-success"
                          onClick={() => handleApproveImage(image.id)}
                          style={{ fontSize: '12px', padding: '5px 10px' }}
                        >
                          Approve
                        </button>
                      )}
                      {!isRejected && (
                        <button
                          className="btn btn-danger"
                          onClick={() => handleRejectImage(image.id)}
                          style={{ fontSize: '12px', padding: '5px 10px' }}
                        >
                          Reject & Regenerate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default SceneDetail
