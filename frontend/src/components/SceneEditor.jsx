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
  const [segmentationPreviewOpen, setSegmentationPreviewOpen] = useState(true)
  const [applyingPreview, setApplyingPreview] = useState(false)

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
      
      // Stop polling if we have scenes or reached max polls
      if (scenesData.length > 0 || pollCount >= maxPolls) {
        clearInterval(interval)
      }
    }, 3000)
    
    return () => clearInterval(interval)
  }, [scriptId])

  useEffect(() => {
    // Initialize selected scene styles from loaded scenes
    const initialSceneStyles = {}
    const initialImageRefs = {}
    const initialDescriptionIndices = {}
    scenes.forEach(scene => {
      if (scene.scene_style_id) {
        initialSceneStyles[scene.id] = scene.scene_style_id
      }
      if (scene.image_reference_id) {
        initialImageRefs[scene.id] = scene.image_reference_id
      }
      // Load visual descriptions for each scene
      if (scene.id) {
        loadVisualDescriptions(scene.id)
        // Set current index to 0 (most recent) if descriptions exist
        initialDescriptionIndices[scene.id] = 0
      }
    })
    setSelectedSceneStyles(prev => ({ ...prev, ...initialSceneStyles }))
    setSelectedImageRefs(prev => ({ ...prev, ...initialImageRefs }))
    setCurrentDescriptionIndex(prev => ({ ...prev, ...initialDescriptionIndices }))
  }, [scenes])

  const loadVisualDescriptions = async (sceneId) => {
    try {
      const response = await axios.get(`${API_BASE}/scenes/${sceneId}/visual-descriptions`)
      setVisualDescriptions(prev => ({ ...prev, [sceneId]: response.data }))
      // If we have descriptions and no current index set, set to 0
      if (response.data.length > 0 && !currentDescriptionIndex[sceneId] && currentDescriptionIndex[sceneId] !== 0) {
        setCurrentDescriptionIndex(prev => ({ ...prev, [sceneId]: 0 }))
      }
    } catch (error) {
      console.error('Error loading visual descriptions:', error)
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
      alert('Error generating visual description: ' + (error.response?.data?.detail || error.message))
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

  const handleApprove = async (sceneId) => {
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
      
      // Then approve with visual style
      await axios.post(`${API_BASE}/scenes/${sceneId}/approve`, null, {
        params: visualStyleId ? { visual_style_id: visualStyleId } : {}
      })
      alert('Scene approved! Image generation started.')
      loadScenes()
    } catch (error) {
      console.error('Error approving scene:', error)
      alert('Error approving scene')
    }
  }

  const allApproved = scenes.length > 0 && scenes.every(s => s.status === 'approved')

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Scenes ({scenes.length})</h2>
        <div>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {allApproved && (
            <button className="btn btn-primary" onClick={onNext} style={{ marginLeft: '10px' }}>
              View Images →
            </button>
          )}
        </div>
      </div>

      {/* Segmentation preview: one big text, --- separates scenes; reposition or add --- then Apply */}
      <div style={{ marginBottom: '24px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-surface-alt)' }}>
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
                minHeight: '280px',
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
        <div>
          {scenes.map((scene) => (
            <div key={scene.id} className="scene-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0 }}>Scene {scene.order}</h3>
                  {onOpenScene && (
                    <button
                      className="btn btn-primary"
                      onClick={() => onOpenScene(scene.id)}
                      style={{ fontSize: '13px', padding: '4px 12px' }}
                    >
                      Open Scene →
                    </button>
                  )}
                </div>
                <span className={`status-badge status-${scene.status}`}>
                  {scene.status}
                </span>
              </div>

              {editingId === scene.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    style={{ minHeight: '100px' }}
                  />
                  {scene.status !== 'approved' && (
                    <>
                      <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                          Scene Style (optional):
                        </label>
                        <select
                          value={selectedSceneStyles[scene.id] || ''}
                          onChange={(e) => setSelectedSceneStyles({ ...selectedSceneStyles, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                          style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}
                        >
                          <option value="">None (default)</option>
                          {sceneStyles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                          Visual Style (optional):
                        </label>
                        <select
                          value={selectedStyles[scene.id] || ''}
                          onChange={(e) => setSelectedStyles({ ...selectedStyles, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                          style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}
                        >
                          <option value="">None (default)</option>
                          {visualStyles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                          Reference Image (optional):
                        </label>
                        <select
                          value={selectedImageRefs[scene.id] || ''}
                          onChange={(e) => setSelectedImageRefs({ ...selectedImageRefs, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                          style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}
                        >
                          <option value="">None</option>
                          {imageReferences.map((ref) => (
                            <option key={ref.id} value={ref.id}>
                              {ref.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <div>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleSaveEdit(scene.id)}
                    >
                      Save
                    </button>
                    {scene.status !== 'approved' && (
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(scene.id)}
                      >
                        Save & Approve
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '15px' }}>
                    <h4 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                      Scene Text:
                    </h4>
                    <p style={{ margin: 0, padding: '10px', background: 'var(--bg-surface-alt)', borderRadius: '4px' }}>
                      {scene.text}
                    </p>
                  </div>

                  {(scene.visual_description || (visualDescriptions[scene.id] && visualDescriptions[scene.id].length > 0)) && (
                    <div style={{ marginBottom: '15px', padding: '12px', background: 'var(--bg-surface-alt)', borderRadius: '4px', border: '1px solid var(--info)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                            Visual Description:
                          </h4>
                          {visualDescriptions[scene.id] && visualDescriptions[scene.id].length > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => handleNavigateDescription(scene.id, 'prev')}
                                disabled={(currentDescriptionIndex[scene.id] || 0) >= visualDescriptions[scene.id].length - 1}
                                style={{ 
                                  fontSize: '12px', 
                                  padding: '2px 6px',
                                  minWidth: '30px'
                                }}
                                title="Older description"
                              >
                                ←
                              </button>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '50px', textAlign: 'center' }}>
                                {((currentDescriptionIndex[scene.id] || 0) + 1)} / {visualDescriptions[scene.id].length}
                              </span>
                              <button
                                className="btn btn-secondary"
                                onClick={() => handleNavigateDescription(scene.id, 'next')}
                                disabled={(currentDescriptionIndex[scene.id] || 0) <= 0}
                                style={{ 
                                  fontSize: '12px', 
                                  padding: '2px 6px',
                                  minWidth: '30px'
                                }}
                                title="Newer description"
                              >
                                →
                              </button>
                            </div>
                          )}
                        </div>
                        {scene.status !== 'approved' && (
                          <button
                            className="btn btn-info"
                            onClick={() => handleGenerateVisualDescription(scene.id)}
                            disabled={generatingDescriptions[scene.id]}
                            style={{ 
                              fontSize: '12px', 
                              padding: '4px 8px',
                              backgroundColor: generatingDescriptions[scene.id] ? '#ccc' : '#17a2b8'
                            }}
                            title="Generate new visual description with current scene style"
                          >
                            {generatingDescriptions[scene.id] ? 'Generating...' : 'Generate New'}
                          </button>
                        )}
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        {getCurrentDescription(scene.id)?.description || scene.visual_description}
                      </p>
                      {getCurrentDescription(scene.id) && (
                        <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '8px', fontSize: '11px' }}>
                          Generated {new Date(getCurrentDescription(scene.id).created_at).toLocaleString()}
                        </small>
                      )}
                    </div>
                  )}

                  {scene.status !== 'approved' && (
                    <>
                      <div style={{ marginTop: '10px', marginBottom: '10px', padding: '10px', background: 'var(--bg-surface-alt)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <label style={{ fontSize: '14px', fontWeight: 'bold' }}>
                            Scene Style (for testing):
                          </label>
                          {scene.visual_description && (
                            <button
                              className="btn btn-info"
                              onClick={() => handleGenerateVisualDescription(scene.id)}
                              disabled={generatingDescriptions[scene.id]}
                              style={{ 
                                fontSize: '11px', 
                                padding: '3px 6px',
                                backgroundColor: generatingDescriptions[scene.id] ? '#ccc' : '#17a2b8'
                              }}
                            >
                              {generatingDescriptions[scene.id] ? 'Generating...' : 'Regenerate'}
                            </button>
                          )}
                        </div>
                        <select
                          value={selectedSceneStyles[scene.id] || ''}
                          onChange={(e) => handleSceneStyleChange(scene.id, e.target.value)}
                          style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px', width: '100%' }}
                        >
                          <option value="">None (default)</option>
                          {sceneStyles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                        <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '5px' }}>
                          {scene.visual_description 
                            ? 'Change scene style and click "Regenerate" to test different visual descriptions'
                            : 'Scene style affects visual description generation. Generate a description after selecting a style.'}
                        </small>
                      </div>
                      <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                          Visual Style (optional):
                        </label>
                        <select
                          value={selectedStyles[scene.id] || ''}
                          onChange={(e) => setSelectedStyles({ ...selectedStyles, [scene.id]: e.target.value ? parseInt(e.target.value) : null })}
                          style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}
                        >
                          <option value="">None (default)</option>
                          {visualStyles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
                          Reference Image (optional):
                        </label>
                        <select
                          value={selectedImageRefs[scene.id] || ''}
                          onChange={(e) => handleImageReferenceChange(scene.id, e.target.value)}
                          style={{ padding: '5px', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '200px' }}
                        >
                          <option value="">None</option>
                          {imageReferences.map((ref) => (
                            <option key={ref.id} value={ref.id}>
                              {ref.name}
                            </option>
                          ))}
                        </select>
                        <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '5px' }}>
                          Used as reference for Leonardo image generation
                        </small>
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleEdit(scene)}
                    >
                      Edit
                    </button>
                    {scene.status !== 'approved' && (
                      <>
                        {!scene.visual_description && (
                          <button
                            className="btn btn-info"
                            onClick={() => handleGenerateVisualDescription(scene.id)}
                            disabled={generatingDescriptions[scene.id]}
                            style={{ backgroundColor: generatingDescriptions[scene.id] ? '#ccc' : '#17a2b8' }}
                          >
                            {generatingDescriptions[scene.id] ? 'Generating...' : 'Generate Scene'}
                          </button>
                        )}
                        <button
                          className="btn btn-success"
                          onClick={() => handleApprove(scene.id)}
                          disabled={!scene.visual_description}
                          style={{ 
                            backgroundColor: !scene.visual_description ? '#ccc' : undefined,
                            cursor: !scene.visual_description ? 'not-allowed' : 'pointer'
                          }}
                          title={!scene.visual_description ? 'Generate a visual description first' : ''}
                        >
                          Approve & Generate Image
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SceneEditor

