import React from 'react'
import axios from 'axios'

const API_BASE = '/api'

function ScriptList({ scripts, onSelectScript, onCreateScript }) {
  const getStatusColor = (status) => {
    const colors = {
      draft: 'status-draft',
      approved: 'status-approved',
      reviewed: 'status-pending',
    }
    return colors[status] || 'status-pending'
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Projects</h2>
        <button className="btn btn-primary" onClick={onCreateScript}>
          + New Project
        </button>
      </div>

      {scripts.length === 0 ? (
        <p>No projects yet. Create your first project to get started!</p>
      ) : (
        <div>
          {scripts.map((script) => (
            <div
              key={script.id}
              className="scene-item"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectScript(script)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3>{script.title || `Project #${script.id}`}</h3>
                  <p style={{ color: '#666', marginTop: '5px' }}>
                    {script.script_content.substring(0, 150)}...
                  </p>
                </div>
                <span className={`status-badge ${getStatusColor(script.status)}`}>
                  {script.status}
                </span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
                Created: {new Date(script.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ScriptList

