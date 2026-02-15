import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ImageGallery({ scriptId, onBack, onNext }) {
  const [scenes, setScenes] = useState([])
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // Poll for new images
    let pollCount = 0
    const maxPolls = 60 // Stop after 60 polls (5 minutes)
    
    const interval = setInterval(async () => {
      pollCount++
      await loadData()
      
      if (pollCount >= maxPolls) {
        clearInterval(interval)
      }
    }, 5000)
    
    return () => clearInterval(interval)
  }, [scriptId])

  const loadData = async () => {
    try {
      const scenesResponse = await axios.get(`${API_BASE}/projects/${scriptId}/scenes`)
      const scenesData = scenesResponse.data
      setScenes(scenesData)

      // Load images for each scene
      const imagesData = {}
      for (const scene of scenesData) {
        try {
          const imagesResponse = await axios.get(`${API_BASE}/scenes/${scene.id}/images`)
          imagesData[scene.id] = imagesResponse.data
        } catch (error) {
          imagesData[scene.id] = []
        }
      }
      setImages(imagesData)
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  const getImageUrl = (image) => {
    if (image.url) return image.url
    if (image.file_path) return `/storage/${image.file_path.replace(/\\/g, '/')}`
    return null
  }

  const allScenesHaveImages = scenes.length > 0 && scenes.every(scene => {
    const sceneImages = images[scene.id] || []
    return sceneImages.length > 0
  })

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Image Gallery</h2>
        <div>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {allScenesHaveImages && (
            <button className="btn btn-primary" onClick={onNext} style={{ marginLeft: '10px' }}>
              Create Video →
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p>Loading images...</p>
      ) : (
        <div>
          {scenes.map((scene) => {
            const sceneImages = images[scene.id] || []

            return (
              <div key={scene.id} style={{ marginBottom: '30px' }}>
                <h3>Scene {scene.order}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>{scene.text}</p>

                {sceneImages.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No images generated yet...</p>
                ) : (
                  <div className="image-gallery">
                    {sceneImages.map((image, index) => {
                      const imageUrl = getImageUrl(image)

                      return (
                        <div
                          key={image.id}
                          className={`image-item ${index === 0 ? 'approved' : ''}`}
                        >
                          {imageUrl ? (
                            <img src={imageUrl} alt={`Scene ${scene.order}`} />
                          ) : (
                            <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-hover)' }}>
                              Image loading...
                            </div>
                          )}
                          <div style={{ marginTop: '10px' }}>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                              {image.prompt}
                            </p>
                            {index === 0 && (
                              <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 'bold' }}>Latest</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
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

export default ImageGallery

