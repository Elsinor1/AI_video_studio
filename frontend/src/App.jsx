import React, { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import NavigationBar from './components/NavigationBar'
import ScriptList from './components/ScriptList'
import ScriptEditor from './components/ScriptEditor'
import SceneEditor from './components/SceneEditor'
import SceneDetail from './components/SceneDetail'
import ImageGallery from './components/ImageGallery'
import VideoViewer from './components/VideoViewer'
import VisualStylesList from './components/VisualStylesList'
import SceneStylesList from './components/SceneStylesList'
import ScriptPromptsList from './components/ScriptPromptsList'
import ImageReferencesList from './components/ImageReferencesList'
import './App.css'

const API_BASE = '/api'

const THEME_KEY = 'ai-video-creator-theme'

const WORKFLOW_STEPS = [
  { key: 'projects', label: 'Projects', icon: '📁' },
  { key: 'script', label: 'Script', icon: '📝' },
  { key: 'scenes', label: 'Scenes', icon: '🎬' },
  { key: 'images', label: 'Images', icon: '🖼️' },
  { key: 'video', label: 'Video', icon: '🎥' },
]

function WorkflowBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname

  // Extract project ID from path
  const projectMatch = path.match(/\/projects\/(\d+)/)
  const projectId = projectMatch ? projectMatch[1] : null

  // Determine active step
  let activeStep = 'projects'
  if (projectId) {
    if (path.includes('/video')) activeStep = 'video'
    else if (path.includes('/images')) activeStep = 'images'
    else if (path.includes('/scenes')) activeStep = 'scenes'
    else activeStep = 'script'
  }

  const stepIndex = WORKFLOW_STEPS.findIndex(s => s.key === activeStep)

  const handleStepClick = (step) => {
    if (step.key === 'projects') {
      navigate('/')
      return
    }
    if (!projectId) return
    switch (step.key) {
      case 'script': navigate(`/projects/${projectId}`); break
      case 'scenes': navigate(`/projects/${projectId}/scenes`); break
      case 'images': navigate(`/projects/${projectId}/images`); break
      case 'video': navigate(`/projects/${projectId}/video`); break
    }
  }

  return (
    <div className="workflow-bar">
      {WORKFLOW_STEPS.map((step, i) => {
        const isActive = step.key === activeStep
        const isPast = i < stepIndex
        const isClickable = step.key === 'projects' || !!projectId

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`workflow-connector ${isPast ? 'past' : ''}`}>
                <span>›</span>
              </div>
            )}
            <button
              className={`workflow-step ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${!isClickable ? 'disabled' : ''}`}
              onClick={() => isClickable && handleStepClick(step)}
              disabled={!isClickable}
            >
              <span className="workflow-icon">{step.icon}</span>
              <span className="workflow-label">{step.label}</span>
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}

function App() {
  const location = useLocation()
  const isSceneDetailPage = /\/projects\/\d+\/scenes\/\d+$/.test(location.pathname)
  const [projects, setProjects] = useState([])
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch (_) {}
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      const response = await axios.get(`${API_BASE}/projects`)
      setProjects(response.data)
    } catch (error) {
      console.error('Error loading projects:', error)
    }
  }

  return (
    <div style={isSceneDetailPage ? { height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : {}}>
      <NavigationBar theme={theme} onToggleTheme={toggleTheme} />
      <div className="container" style={isSceneDetailPage ? { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 } : {}}>
        <WorkflowBar />

        <div style={isSceneDetailPage ? { flex: 1, overflow: 'hidden', minHeight: 0 } : {}}>
        <Routes>
        <Route path="/" element={<ProjectListPage projects={projects} onProjectsChange={loadProjects} />} />
        <Route path="/projects/new" element={<ProjectEditorPage onProjectsChange={loadProjects} />} />
        <Route path="/projects/:id/scenes/:sceneId" element={<SceneDetailPage />} />
        <Route path="/projects/:id/scenes" element={<SceneEditorPage />} />
        <Route path="/projects/:id/images" element={<ImageGalleryPage />} />
        <Route path="/projects/:id/video" element={<VideoViewerPage />} />
        <Route path="/projects/:id" element={<ProjectEditorPage onProjectsChange={loadProjects} />} />
        <Route path="/styles" element={<VisualStylesList />} />
        <Route path="/scene-styles" element={<SceneStylesList />} />
        <Route path="/script-prompts" element={<ScriptPromptsList />} />
        <Route path="/image-references" element={<ImageReferencesList />} />
        </Routes>
        </div>
      </div>
    </div>
  )
}

function ProjectListPage({ projects, onProjectsChange }) {
  const navigate = useNavigate()

  const handleCreateProject = () => {
    navigate('/projects/new')
  }

  const handleSelectProject = (project) => {
    navigate(`/projects/${project.id}`)
  }

  return (
    <ScriptList
      scripts={projects}
      onSelectScript={handleSelectProject}
      onCreateScript={handleCreateProject}
    />
  )
}

function ProjectEditorPage({ onProjectsChange }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadProject()
    } else {
      setLoading(false)
    }
  }, [id])

  const loadProject = async () => {
    try {
      const response = await axios.get(`${API_BASE}/projects/${id}`)
      setProject(response.data)
    } catch (error) {
      console.error('Error loading project:', error)
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const handleProjectSaved = (savedProject) => {
    onProjectsChange()
    if (savedProject && !id) {
      // New project was created, navigate to its edit page
      navigate(`/projects/${savedProject.id}`, { replace: true })
    } else {
      // Reload project data
      if (id) {
        loadProject()
      }
    }
  }

  const handleProjectApproved = () => {
    onProjectsChange()
    setTimeout(() => {
      navigate(`/projects/${id}/scenes`)
    }, 1000)
  }

  const handleProjectDeleted = () => {
    onProjectsChange()
    navigate('/')
  }

  if (loading) {
    return <div className="card">Loading...</div>
  }

  return (
    <ScriptEditor
      script={project}
      onSave={handleProjectSaved}
      onApprove={handleProjectApproved}
      onDelete={handleProjectDeleted}
      onBack={() => navigate('/')}
      onNext={() => navigate(`/projects/${id}/scenes`)}
    />
  )
}

function SceneEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <SceneEditor
      scriptId={parseInt(id)}
      onBack={() => navigate(`/projects/${id}`)}
      onNext={() => navigate(`/projects/${id}/images`)}
      onOpenScene={(sceneId) => navigate(`/projects/${id}/scenes/${sceneId}`)}
    />
  )
}

function SceneDetailPage() {
  const { id, sceneId } = useParams()
  const navigate = useNavigate()
  const [scenes, setScenes] = useState([])

  useEffect(() => {
    const loadScenes = async () => {
      try {
        const response = await axios.get(`${API_BASE}/projects/${id}/scenes`)
        setScenes(response.data)
      } catch {
        setScenes([])
      }
    }
    if (id) loadScenes()
  }, [id])

  const sceneIndex = scenes.findIndex(s => s.id === parseInt(sceneId))
  const nextScene = sceneIndex >= 0 && sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null
  const prevScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : null

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <SceneDetail
        scriptId={parseInt(id)}
        sceneId={parseInt(sceneId)}
        onBack={() => navigate(`/projects/${id}/scenes`)}
        onNextScene={nextScene ? () => navigate(`/projects/${id}/scenes/${nextScene.id}`) : undefined}
        onPrevScene={prevScene ? () => navigate(`/projects/${id}/scenes/${prevScene.id}`) : undefined}
        hasNextScene={!!nextScene}
        hasPrevScene={!!prevScene}
      />
    </div>
  )
}

function ImageGalleryPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <ImageGallery
      scriptId={parseInt(id)}
      onBack={() => navigate(`/projects/${id}/scenes`)}
      onNext={() => navigate(`/projects/${id}/video`)}
    />
  )
}

function VideoViewerPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <VideoViewer
      scriptId={parseInt(id)}
      onBack={() => navigate(`/projects/${id}/images`)}
    />
  )
}

export default App

