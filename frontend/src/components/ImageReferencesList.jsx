import React, { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ImageReferencesList() {
  const [refs, setRefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    file: null
  })
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadRefs()
  }, [])

  const loadRefs = async () => {
    try {
      const response = await axios.get(`${API_BASE}/image-references`)
      setRefs(response.data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading image references:', error)
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setFormData({ name: '', description: '', file: null })
    setEditingId(null)
    setShowForm(true)
  }

  const handleEdit = (ref) => {
    setFormData({
      name: ref.name,
      description: ref.description || '',
      file: null
    })
    setEditingId(ref.id)
    setShowForm(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    setFormData({ ...formData, file: file || null })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Please enter a name')
      return
    }
    if (!editingId && !formData.file) {
      alert('Please select an image file (JPG, PNG, or WebP)')
      return
    }

    setUploading(true)
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/image-references/${editingId}`, {
          name: formData.name,
          description: formData.description || null
        })
      } else {
        const data = new FormData()
        data.append('name', formData.name)
        if (formData.description) data.append('description', formData.description)
        data.append('file', formData.file)
        await axios.post(`${API_BASE}/image-references`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }
      setShowForm(false)
      loadRefs()
    } catch (error) {
      const msg = error.response?.data?.detail || error.message
      alert('Error saving: ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (refId) => {
    if (!window.confirm('Delete this image reference?')) return
    try {
      await axios.delete(`${API_BASE}/image-references/${refId}`)
      loadRefs()
    } catch (error) {
      console.error('Error deleting:', error)
      alert('Error deleting image reference')
    }
  }

  const getImageUrl = (ref) => {
    if (!ref?.image_path) return null
    return `/storage/${ref.image_path}`
  }

  if (loading) {
    return <div className="card">Loading image references...</div>
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Image References</h2>
        <button className="btn btn-primary" onClick={handleCreate}>
          + New Image Reference
        </button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '4px', marginBottom: '20px', background: '#f9f9f9' }}>
          <h3>{editingId ? 'Edit Image Reference' : 'New Image Reference'}</h3>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Name <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Main character, Location reference, Style reference"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Description (optional)
            </label>
            <textarea
              placeholder="General description of what this reference is for..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%', minHeight: '80px' }}
            />
          </div>
          {!editingId && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Image file (JPG, PNG, or WebP) <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                style={{ display: 'block' }}
              />
              <small style={{ color: '#666' }}>Select an image from your computer to use as reference.</small>
            </div>
          )}
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={uploading}>
              {uploading ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)} style={{ marginLeft: '10px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {refs.length === 0 ? (
        <p>No image references yet. Click &quot;New Image Reference&quot; and select a JPG (or PNG/WebP) file to add one.</p>
      ) : (
        <div>
          {refs.map((ref) => (
            <div key={ref.id} className="scene-item" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 auto' }}>
                {getImageUrl(ref) && (
                  <img
                    src={getImageUrl(ref)}
                    alt={ref.name}
                    style={{ maxWidth: '200px', maxHeight: '200px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h3>{ref.name}</h3>
                {ref.description && (
                  <p style={{ color: '#666', marginTop: '5px', whiteSpace: 'pre-wrap' }}>{ref.description}</p>
                )}
                <div style={{ marginTop: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => handleEdit(ref)} style={{ marginRight: '10px' }}>
                    Edit
                  </button>
                  <button className="btn btn-danger" onClick={() => handleDelete(ref.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ImageReferencesList
