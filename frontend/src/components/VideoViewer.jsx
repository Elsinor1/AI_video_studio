import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function VideoViewer({ scriptId, onBack }) {
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadVideo()
  }, [scriptId])

  const loadVideo = async () => {
    try {
      const response = await axios.get(`${API_BASE}/projects/${scriptId}/video`)
      setVideo(response.data)
    } catch (error) {
      if (error.response?.status === 404) {
        setVideo(null)
      } else {
        console.error('Error loading video:', error)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateVideo = async () => {
    if (!window.confirm('Create video from all approved images?')) {
      return
    }

    setCreating(true)
    try {
      await axios.post(`${API_BASE}/projects/${scriptId}/create-video`)
      alert('Video creation started! This may take a few minutes. Check back soon.')
      // Poll for video
      const interval = setInterval(async () => {
        try {
          const response = await axios.get(`${API_BASE}/projects/${scriptId}/video`)
          if (response.data && response.data.status === 'approved') {
            setVideo(response.data)
            clearInterval(interval)
            setCreating(false)
          }
        } catch (error) {
          // Video not ready yet
        }
      }, 5000)

      setTimeout(() => {
        clearInterval(interval)
        setCreating(false)
        loadVideo()
      }, 60000) // Stop polling after 1 minute
    } catch (error) {
      console.error('Error creating video:', error)
      alert('Error creating video')
      setCreating(false)
    }
  }

  const getVideoUrl = (video) => {
    if (video.url) return video.url
    if (video.file_path) {
      // file_path is stored relative to storage/ directory
      return `/storage/${video.file_path}`
    }
    return null
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Video</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Back
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : !video ? (
        <div>
          <p>No video created yet.</p>
          <button
            className="btn btn-primary"
            onClick={handleCreateVideo}
            disabled={creating}
          >
            {creating ? 'Creating Video...' : 'Create Video'}
          </button>
        </div>
      ) : (
        <div>
          {video.status === 'pending' && (
            <div style={{ padding: '20px', background: 'var(--warning)', color: 'var(--warning-text)', borderRadius: '4px', marginBottom: '20px' }}>
              <p>Video is being created. Please wait...</p>
            </div>
          )}

          {video.status === 'approved' && (
            <div>
              <h3>Final Video</h3>
              {getVideoUrl(video) ? (
                <video
                  controls
                  style={{ width: '100%', maxWidth: '800px', marginTop: '20px' }}
                  src={getVideoUrl(video)}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <p>Video file not found</p>
              )}
            </div>
          )}

          {video.status === 'rejected' && (
            <div style={{ padding: '20px', background: 'var(--danger)', color: 'white', borderRadius: '4px' }}>
              <p>Video creation failed. Please try again.</p>
              <button className="btn btn-primary" onClick={handleCreateVideo}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default VideoViewer

