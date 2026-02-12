import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ImageGallery({ scriptId, onBack, onNext }) {
  const [scenes, setScenes] = useState([])
  const [images, setImages] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    // Poll for new images, but stop once all scenes have approved images
    let pollCount = 0
    const maxPolls = 60 // Stop after 60 polls (5 minutes)
    
    const interval = setInterval(async () => {
      pollCount++
      const shouldStop = await loadData()
      
      // Stop polling if all scenes have approved images or reached max polls
      if (shouldStop || pollCount >= maxPolls) {
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
      
      // Return true if all scenes have at least one approved image
      const allHaveApproved = scenesData.every(scene => {
        const sceneImages = imagesData[scene.id] || []
        return sceneImages.some(img => img.status === 'approved')
      })
      
      return allHaveApproved
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
      return false
    }
  }

  const handleApprove = async (imageId) => {
    try {
      await axios.post(`${API_BASE}/images/${imageId}/approve`)
      alert('Image approved!')
      loadData()
    } catch (error) {
      console.error('Error approving image:', error)
      alert('Error approving image')
    }
  }

  const handleReject = async (imageId, sceneId) => {
    try {
      await axios.post(`${API_BASE}/images/${imageId}/reject`)
      alert('Image rejected. Generating new one...')
      loadData()
    } catch (error) {
      console.error('Error rejecting image:', error)
      alert('Error rejecting image')
    }
  }

  const getImageUrl = (image) => {
    if (image.url) return image.url
    if (image.file_path) {
      // file_path is stored relative to storage/ directory
      return `/storage/${image.file_path}`
    }
    return null
  }

  const allScenesHaveApprovedImages = scenes.every(scene => {
    const sceneImages = images[scene.id] || []
    return sceneImages.some(img => img.status === 'approved')
  })

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Image Gallery</h2>
        <div>
          <button className="btn btn-secondary" onClick={onBack}>
            ← Back
          </button>
          {allScenesHaveApprovedImages && (
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
            const approvedImage = sceneImages.find(img => img.status === 'approved')

            return (
              <div key={scene.id} style={{ marginBottom: '30px' }}>
                <h3>Scene {scene.order}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '15px' }}>{scene.text}</p>

                {sceneImages.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No images generated yet...</p>
                ) : (
                  <div className="image-gallery">
                    {sceneImages.map((image) => {
                      const imageUrl = getImageUrl(image)
                      const isApproved = image.status === 'approved'
                      const isRejected = image.status === 'rejected'

                      return (
                        <div
                          key={image.id}
                          className={`image-item ${isApproved ? 'approved' : ''} ${isRejected ? 'rejected' : ''}`}
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
                            <span className={`status-badge status-${image.status}`}>
                              {image.status}
                            </span>
                            <div style={{ marginTop: '10px' }}>
                              {!isApproved && (
                                <button
                                  className="btn btn-success"
                                  onClick={() => handleApprove(image.id)}
                                  style={{ fontSize: '12px', padding: '5px 10px' }}
                                >
                                  Approve
                                </button>
                              )}
                              {!isRejected && (
                                <button
                                  className="btn btn-danger"
                                  onClick={() => handleReject(image.id, scene.id)}
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
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ImageGallery

