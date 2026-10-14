import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Activity, ArrowDown, ArrowUp, Bell, CalendarDays, Check, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Ellipsis, Filter, FolderKanban, Hash,
  LayoutGrid, ListFilter, LogOut, Menu, MessageCircle, Moon, MoreHorizontal,
  Plus, Search, Share2, SlidersHorizontal, Sparkles, Sun, Users, X,
} from 'lucide-react'
import { create } from 'zustand'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const STORAGE_KEY = 'taskflow-workspace-v1'
const today = new Date()
const due = (offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).toISOString().slice(0, 10)
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

const initialBoard = {
  id: 'local-product-launch',
  name: 'Product launch',
  description: 'A little planning goes a long way.',
  columns: [
    { id: 'col-backlog', name: 'Backlog', color: '#a9a4b8', tasks: [
      { id: 'task-1', title: 'Research competitor onboarding flows', description: 'Look at the first-run experience for Linear, Notion, and Asana.', labels: ['Research', 'UX'], priority: 'Low', dueDate: due(4), assignee: 'Olivia Chen', comments: 2, color: 'lilac' },
      { id: 'task-2', title: 'Set up project workspace', description: '', labels: ['Operations'], priority: 'Medium', dueDate: due(6), assignee: 'Marcus Lee', comments: 0, color: 'peach' },
      { id: 'task-3', title: 'Collect early access feedback', description: 'Organize the feedback into product themes.', labels: ['Research'], priority: 'Low', dueDate: null, assignee: 'Nina Patel', comments: 4, color: 'mint' },
    ] },
    { id: 'col-todo', name: 'To do', color: '#9c8dfa', tasks: [
      { id: 'task-4', title: 'Finalize brand direction', description: 'Share a final direction with the team.', labels: ['Design'], priority: 'High', dueDate: due(2), assignee: 'Olivia Chen', comments: 3, color: 'lilac' },
      { id: 'task-5', title: 'Write launch announcement', description: '', labels: ['Content'], priority: 'Medium', dueDate: due(5), assignee: 'Nina Patel', comments: 1, color: 'peach' },
      { id: 'task-6', title: 'Prepare social media assets', description: '', labels: ['Marketing', 'Design'], priority: 'Medium', dueDate: due(7), assignee: 'Marcus Lee', comments: 0, color: 'mint' },
      { id: 'task-7', title: 'Review pricing page copy', description: '', labels: ['Content'], priority: 'Low', dueDate: null, assignee: 'Olivia Chen', comments: 0, color: 'lavender' },
    ] },
    { id: 'col-progress', name: 'In progress', color: '#efb25c', tasks: [
      { id: 'task-8', title: 'Design the new dashboard', description: 'Dashboard refresh for the upcoming release.', labels: ['Design', 'Product'], priority: 'High', dueDate: due(1), assignee: 'Nina Patel', comments: 5, color: 'lilac' },
      { id: 'task-9', title: 'Build email notification system', description: '', labels: ['Engineering'], priority: 'High', dueDate: due(3), assignee: 'Marcus Lee', comments: 2, color: 'mint' },
      { id: 'task-10', title: 'Create product demo video', description: '', labels: ['Marketing'], priority: 'Medium', dueDate: null, assignee: 'Nina Patel', comments: 1, color: 'peach' },
    ] },
    { id: 'col-review', name: 'In review', color: '#70b8a1', tasks: [
      { id: 'task-11', title: 'Update landing page illustrations', description: '', labels: ['Design'], priority: 'Medium', dueDate: due(1), assignee: 'Olivia Chen', comments: 2, color: 'peach' },
      { id: 'task-12', title: 'QA signup and checkout flows', description: 'Verify mobile and desktop breakpoints.', labels: ['Engineering', 'QA'], priority: 'High', dueDate: due(2), assignee: 'Marcus Lee', comments: 6, color: 'mint' },
    ] },
    { id: 'col-done', name: 'Done', color: '#65ab82', tasks: [
      { id: 'task-13', title: 'Kick-off meeting & project brief', description: '', labels: ['Operations'], priority: 'Medium', dueDate: due(-3), assignee: 'Olivia Chen', comments: 3, color: 'lilac' },
      { id: 'task-14', title: 'Define launch success metrics', description: '', labels: ['Product'], priority: 'Low', dueDate: due(-1), assignee: 'Marcus Lee', comments: 1, color: 'lavender' },
    ] },
  ],
}

function readSavedWorkspace() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}

const useWorkspaceStore = create((set) => ({
  boards: readSavedWorkspace()?.boards || [initialBoard],
  setBoards: (nextBoards) => set((state) => ({
    boards: typeof nextBoards === 'function' ? nextBoards(state.boards) : nextBoards,
  })),
}))

const members = [
  { name: 'Olivia Chen', initials: 'OC', color: 'avatar-lilac' },
  { name: 'Marcus Lee', initials: 'ML', color: 'avatar-peach' },
  { name: 'Nina Patel', initials: 'NP', color: 'avatar-mint' },
  { name: 'Ethan Wright', initials: 'EW', color: 'avatar-blue' },
]
const avatars = Object.fromEntries(members.map((member) => [member.name, member]))

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.')
  return data
}

function normalizeTask(task) {
  const dueDate = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null
  return { ...task, id: task.id || task._id, columnId: task.columnId || task.column, dueDate }
}

function normalizeBoard(board) {
  const columns = (board.columns || []).map((column) => ({
    ...column,
    id: column.id || column._id,
    tasks: (column.tasks || []).map(normalizeTask),
  }))
  return { ...board, id: board.id || board._id, name: board.name || board.title, columns }
}

function Avatar({ name, size = 'normal' }) {
  const member = avatars[name] || { initials: name?.split(' ').map((part) => part[0]).join('').slice(0, 2) || '?', color: 'avatar-blue' }
  return <span title={name} className={`avatar ${member.color} avatar-${size}`}>{member.initials}</span>
}

function TaskCard({ task, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const dueLabel = task.dueDate && new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-card ${isDragging ? 'is-dragging' : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(task) }}
      role="button"
      tabIndex={0}
    >
      <div className="task-card-top">
        <div className="task-labels">
          {(task.labels || []).slice(0, 2).map((label) => <span key={label} className={`task-label label-${label.toLowerCase().replace(/\s/g, '-')}`}>{label}</span>)}
        </div>
      </div>
      <h3>{task.title}</h3>
      {task.description && <p className="task-description">{task.description}</p>}
      <div className="task-card-footer">
        <div className={`priority priority-${(task.priority || 'medium').toLowerCase()}`}>
          {task.priority === 'High' ? <ArrowUp size={12} /> : task.priority === 'Low' ? <ArrowDown size={12} /> : <span className="priority-dash">=</span>}
          <span>{task.priority || 'Medium'}</span>
        </div>
        <div className="task-meta">
          {dueLabel && <span className="task-due"><CalendarDays size={13} />{dueLabel}</span>}
          {task.comments > 0 && <span className="task-comments"><MessageCircle size={13} />{task.comments}</span>}
          {task.assignee && <Avatar name={task.assignee} size="small" />}
        </div>
      </div>
    </article>
  )
}

function Column({ column, onAddTask, onOpenTask, onRename, onDelete, canEdit }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <section className={`board-column ${isOver ? 'column-over' : ''}`} ref={setNodeRef}>
      <div className="column-heading">
        <div className="column-name-group">
          <span className="column-indicator" style={{ backgroundColor: column.color || '#9c8dfa' }} />
          <h2>{column.name}</h2>
          <span className="column-count">{column.tasks.length}</span>
        </div>
        <div className="column-actions">
          <button className="icon-button" aria-label={`Add task to ${column.name}`} onClick={() => onAddTask(column.id)}><Plus size={17} /></button>
          <div className="menu-anchor">
            <button className="icon-button" aria-label={`Options for ${column.name}`} onClick={() => setMenuOpen(!menuOpen)}><Ellipsis size={18} /></button>
            {menuOpen && <div className="popover column-popover">
              <button onClick={() => { setMenuOpen(false); onRename(column) }}>Rename column</button>
              <button className="danger-action" disabled={!canEdit} onClick={() => { setMenuOpen(false); onDelete(column) }}>Delete column</button>
            </div>}
          </div>
        </div>
      </div>
      <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="task-list">
          {column.tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)}
          <button className="add-task-button" onClick={() => onAddTask(column.id)}><Plus size={15} /> Add task</button>
        </div>
      </SortableContext>
    </section>
  )
}

function Dialog({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>
      {children}
    </section>
  </div>
}

function TaskDialog({ task, column, columns, onClose, onSave, onDelete, saving }) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [assignee, setAssignee] = useState(task?.assignee || '')
  const [columnId, setColumnId] = useState(column?.id || '')
  const [priority, setPriority] = useState(task?.priority || 'Medium')
  const [dueDate, setDueDate] = useState(task?.dueDate || '')
  const [labels, setLabels] = useState((task?.labels || []).join(', '))
  const formRef = useRef(null)
  function submit(event) {
    event.preventDefault()
    if (!title.trim()) { formRef.current?.querySelector('input')?.focus(); return }
    onSave({ title: title.trim(), description: description.trim(), assignee, priority, dueDate: dueDate || null, labels: labels.split(',').map((label) => label.trim()).filter(Boolean), columnId })
  }
  return <Dialog title={task ? 'Edit task' : 'Create a task'} onClose={onClose}>
    <form className="task-form" ref={formRef} onSubmit={submit}>
      <label className="field-label">Task name<input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" required /></label>
      <label className="field-label">Description<textarea rows="3" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a little more detail..." /></label>
      <div className="field-row">
        <label className="field-label">Status<select value={columnId} onChange={(event) => setColumnId(event.target.value)}>{columns.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="field-label">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label>
      </div>
      <div className="field-row">
        <label className="field-label">Assignee<select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.name}>{member.name}</option>)}</select></label>
        <label className="field-label">Due date<input type="date" value={dueDate || ''} onChange={(event) => setDueDate(event.target.value)} /></label>
      </div>
      <label className="field-label">Labels<input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="Design, Product, Engineering" /></label>
      <div className="dialog-actions">
        {task && <button type="button" className="text-button danger-text" disabled={saving} onClick={onDelete}>Delete task</button>}
        <span className="action-spacer" />
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}</button>
      </div>
    </form>
  </Dialog>
}

function AuthDialog({ mode, onClose, onSubmit, busy, error, setMode }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return <Dialog title={mode === 'login' ? 'Welcome back' : 'Create your account'} onClose={onClose}>
    <form className="task-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ name, email, password }) }}>
      <p className="auth-intro">Sign in to sync your workspace and collaborate live with your team.</p>
      {mode === 'register' && <label className="field-label">Your name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}
      <label className="field-label">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      <label className="field-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <p className="auth-switch">{mode === 'login' ? 'New to TaskFlow?' : 'Already have an account?'} <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
    </form>
  </Dialog>
}

function App() {
  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
  }, [])
  const boards = useWorkspaceStore((state) => state.boards)
  const setBoards = useWorkspaceStore((state) => state.setBoards)
  const [activeBoardId, setActiveBoardId] = useState(saved?.activeBoardId || initialBoard.id)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [dark, setDark] = useState(saved?.dark || false)
  const [user, setUser] = useState(null)
  const [online, setOnline] = useState(false)
  const [activeUsers, setActiveUsers] = useState(0)
  const [apiMode, setApiMode] = useState('checking')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [view, setView] = useState('board')
  const [showFilters, setShowFilters] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const socketRef = useRef(null)
  const searchRef = useRef(null)
  const activeBoard = boards.find((board) => board.id === activeBoardId) || boards[0]
  const allTasks = activeBoard?.columns.flatMap((column) => column.tasks) || []
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      boards: user ? [initialBoard] : boards,
      activeBoardId: user ? initialBoard.id : activeBoardId,
      dark,
    }))
  }, [boards, activeBoardId, dark, user])

  useEffect(() => {
    let cancelled = false
    request('/api/auth/me').then(async ({ user: currentUser }) => {
      if (cancelled) return
      setUser(currentUser)
      const searchParams = new URLSearchParams(window.location.search)
      const inviteToken = searchParams.get('invite')
      let preferredBoardId = searchParams.get('board')
      let result
      if (inviteToken) {
        result = await request(`/api/boards/join/${encodeURIComponent(inviteToken)}`, { method: 'POST' })
        const invitedBoard = normalizeBoard(result.board)
        preferredBoardId = invitedBoard.id
        if (!cancelled) {
          setBoards([invitedBoard])
          setActiveBoardId(invitedBoard.id)
          setToast('You joined a shared board')
        }
        result = await request('/api/boards')
      } else result = await request('/api/boards')
      let remoteBoards = (result.boards || []).map(normalizeBoard)
      if (!remoteBoards.length) {
        const created = await request('/api/boards', { method: 'POST', body: JSON.stringify({ name: 'Product launch', description: 'A little planning goes a long way.' }) })
        remoteBoards = [normalizeBoard(created.board)]
      }
      if (!cancelled && remoteBoards.length) {
        setBoards(remoteBoards)
        setActiveBoardId(remoteBoards.find((board) => board.id === preferredBoardId)?.id || remoteBoards[0].id)
        setApiMode('connected')
      } else if (!cancelled) setApiMode('connected')
    }).catch((err) => {
      if (!cancelled) setApiMode(err.message.includes('fetch') ? 'offline' : 'guest')
    })
    return () => { cancelled = true }
  }, [setBoards])

  useEffect(() => {
    if (!user || !activeBoardId) return undefined
    let stopped = false
    import('socket.io-client').then(({ io }) => {
      if (stopped) return
      const socket = io(API, { withCredentials: true, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelayMax: 5000 })
      socketRef.current = socket
      socket.on('connect', () => { setOnline(true); socket.emit('board:join', activeBoardId) })
      socket.on('disconnect', () => setOnline(false))
      socket.on('board:presence', ({ count }) => setActiveUsers(count))
      socket.on('board:update', () => {
        request(`/api/boards/${activeBoardId}`).then(({ board }) => {
          const next = normalizeBoard(board)
          setBoards((current) => current.map((item) => item.id === next.id ? next : item))
        }).catch((err) => setToast(err.message))
      })
    }).catch((err) => setToast(`Live updates unavailable: ${err.message}`))
    return () => { stopped = true; socketRef.current?.disconnect(); socketRef.current = null; setOnline(false) }
  }, [user, activeBoardId, setBoards])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    function focusSearch(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  function updateBoard(boardId, transform) {
    setBoards((current) => current.map((board) => board.id === boardId ? transform(board) : board))
  }

  function showError(err) {
    setToast(err.message || 'The change could not be saved.')
  }

  async function saveTask(values, closeAfter = false) {
    const { task, columnId } = modal
    setBusy(true)
    try {
      let nextTask
      if (user) {
        const result = task
          ? await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ ...values, columnId: values.columnId || columnId }) })
          : await request('/api/tasks', { method: 'POST', body: JSON.stringify({ ...values, boardId: activeBoard.id, columnId: values.columnId || columnId }) })
        nextTask = normalizeTask(result.task)
      } else {
        nextTask = normalizeTask({ ...task, ...values, id: task?.id || uid(), columnId: values.columnId || columnId, comments: task?.comments || 0, color: task?.color || 'lilac' })
      }
      const destinationId = values.columnId || columnId
      updateBoard(activeBoard.id, (board) => {
        const columns = board.columns.map((column) => ({ ...column, tasks: column.tasks.filter((item) => item.id !== nextTask.id) }))
        const destination = columns.find((column) => column.id === destinationId)
        if (destination) destination.tasks = [...destination.tasks, nextTask]
        return { ...board, columns }
      })
      if (closeAfter || !task) setModal(null)
      else setModal({ ...modal, task: nextTask, columnId: destinationId })
      setToast(task ? 'Task updated' : 'Task created')
    } catch (err) { showError(err) } finally { setBusy(false) }
  }

  async function deleteTask() {
    const { task } = modal
    setBusy(true)
    try {
      if (user) await request(`/api/tasks/${task.id}`, { method: 'DELETE' })
      updateBoard(activeBoard.id, (board) => ({ ...board, columns: board.columns.map((column) => ({ ...column, tasks: column.tasks.filter((item) => item.id !== task.id) })) }))
      setModal(null)
      setToast('Task deleted')
    } catch (err) { showError(err) } finally { setBusy(false) }
  }

  async function moveTask(activeId, overId) {
    if (!overId || activeId === overId) return
    const source = activeBoard.columns.find((column) => column.tasks.some((task) => task.id === activeId))
    const destination = activeBoard.columns.find((column) => column.id === overId || column.tasks.some((task) => task.id === overId))
    if (!source || !destination) return
    const fromIndex = source.tasks.findIndex((task) => task.id === activeId)
    const toIndex = destination.id === overId ? destination.tasks.length : destination.tasks.findIndex((task) => task.id === overId)
    const original = activeBoard
    const moved = source.tasks[fromIndex]
    updateBoard(activeBoard.id, (board) => {
      const columns = board.columns.map((column) => ({ ...column, tasks: [...column.tasks] }))
      const from = columns.find((column) => column.id === source.id)
      const to = columns.find((column) => column.id === destination.id)
      from.tasks.splice(fromIndex, 1)
      to.tasks.splice(Math.max(0, toIndex), 0, { ...moved, columnId: destination.id })
      return { ...board, columns }
    })
    if (user) {
      try {
        const result = await request(`/api/tasks/${activeId}`, { method: 'PATCH', body: JSON.stringify({ columnId: destination.id, order: toIndex }) })
        const savedTask = normalizeTask(result.task)
        updateBoard(activeBoard.id, (board) => ({ ...board, columns: board.columns.map((column) => ({ ...column, tasks: column.tasks.map((task) => task.id === activeId ? { ...task, ...savedTask } : task) })) }))
      } catch (err) {
        try {
          const result = await request(`/api/boards/${activeBoard.id}`)
          const freshBoard = normalizeBoard(result.board)
          updateBoard(freshBoard.id, () => freshBoard)
        } catch (refreshError) {
          updateBoard(original.id, () => original)
          showError(new Error(`${err.message} The latest board could not be reloaded: ${refreshError.message}`))
          return
        }
        showError(err)
      }
    }
  }

  async function createColumn() {
    const name = window.prompt('Name your new column')
    if (!name?.trim()) return
    try {
      let column = { id: uid(), name: name.trim(), color: '#a58cf1', tasks: [] }
      if (user) {
        const result = await request(`/api/boards/${activeBoard.id}/columns`, { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
        column = { ...result.column, id: result.column.id || result.column._id, tasks: [] }
      }
      updateBoard(activeBoard.id, (board) => ({ ...board, columns: [...board.columns, column] }))
    } catch (err) { showError(err) }
  }

  async function updateColumn(column, name) {
    if (!name?.trim()) return
    try {
      if (user) await request(`/api/columns/${column.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })
      updateBoard(activeBoard.id, (board) => ({ ...board, columns: board.columns.map((item) => item.id === column.id ? { ...item, name: name.trim() } : item) }))
    } catch (err) { showError(err) }
  }

  async function deleteColumn(column) {
    if (!window.confirm(`Delete "${column.name}" and all its tasks?`)) return
    try {
      if (user) await request(`/api/columns/${column.id}`, { method: 'DELETE' })
      updateBoard(activeBoard.id, (board) => ({ ...board, columns: board.columns.filter((item) => item.id !== column.id) }))
      setToast('Column deleted')
    } catch (err) { showError(err) }
  }

  async function createBoard() {
    const name = window.prompt('What should we call this board?')
    if (!name?.trim()) return
    try {
      let board = { id: uid(), name: name.trim(), description: 'Your next great project starts here.', columns: ['To do', 'In progress', 'Done'].map((columnName) => ({ id: uid(), name: columnName, color: '#9c8dfa', tasks: [] })) }
      if (user) {
        const result = await request('/api/boards', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
        board = normalizeBoard(result.board)
      }
      setBoards((current) => [...current, board])
      setActiveBoardId(board.id)
      setToast('Board created')
    } catch (err) { showError(err) }
  }

  async function authenticate(credentials) {
    setBusy(true)
    setError('')
    try {
      const result = await request(`/api/auth/${modal.mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(credentials) })
      setUser(result.user)
      const searchParams = new URLSearchParams(window.location.search)
      const inviteToken = searchParams.get('invite')
      let preferredBoardId = searchParams.get('board')
      let remoteBoards
      if (inviteToken) {
        const invited = await request(`/api/boards/join/${encodeURIComponent(inviteToken)}`, { method: 'POST' })
        const invitedBoard = normalizeBoard(invited.board)
        preferredBoardId = invitedBoard.id
        remoteBoards = [invitedBoard]
      } else ({ boards: remoteBoards = [] } = await request('/api/boards'))
      if (!remoteBoards.length) {
        const created = await request('/api/boards', { method: 'POST', body: JSON.stringify({ name: 'Product launch', description: 'A little planning goes a long way.' }) })
        remoteBoards = [created.board]
      }
      const normalized = remoteBoards.map(normalizeBoard)
      setBoards(normalized)
      setActiveBoardId(normalized.find((board) => board.id === preferredBoardId)?.id || normalized[0].id)
      setApiMode('connected')
      setModal(null)
      setToast(`Welcome${result.user.name ? `, ${result.user.name.split(' ')[0]}` : ''}!`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function logout() {
    try { await request('/api/auth/logout', { method: 'POST' }) } catch (err) { showError(err) }
    socketRef.current?.disconnect()
    setUser(null)
    setBoards([initialBoard])
    setActiveBoardId(initialBoard.id)
    setOnline(false)
    setApiMode('guest')
    setToast('Signed out. Your local workspace is still here.')
  }

  async function shareBoard() {
    if (!user || !activeBoard.inviteToken) {
      setToast('Sign in to create a shareable board invitation.')
      setModal({ type: 'auth', mode: 'login' })
      return
    }
    const link = `${window.location.origin}/?board=${activeBoard.id}${activeBoard.inviteToken ? `&invite=${activeBoard.inviteToken}` : ''}`
    try { await navigator.clipboard.writeText(link); setToast('Board link copied') } catch { setToast('Clipboard access is unavailable in this browser.') }
  }

  async function renameBoard() {
    const name = window.prompt('Rename this board', activeBoard.name)
    if (!name?.trim() || name.trim() === activeBoard.name) return
    try {
      if (user) await request(`/api/boards/${activeBoard.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) })
      updateBoard(activeBoard.id, (board) => ({ ...board, name: name.trim() }))
      setToast('Board renamed')
    } catch (err) { showError(err) }
  }

  async function deleteActiveBoard() {
    if (boards.length < 2) {
      setToast('Create another board before deleting this one.')
      return
    }
    if (!window.confirm(`Delete "${activeBoard.name}" and all of its columns and tasks?`)) return
    try {
      if (user) await request(`/api/boards/${activeBoard.id}`, { method: 'DELETE' })
      const remaining = boards.filter((board) => board.id !== activeBoard.id)
      setBoards(remaining)
      setActiveBoardId(remaining[0].id)
      setBoardMenuOpen(false)
      setToast('Board deleted')
    } catch (err) { showError(err) }
  }

  const visibleColumns = activeBoard.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => {
      const matchesQuery = `${task.title} ${task.description} ${(task.labels || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
      const matchesPriority = priorityFilter === 'All priorities' || task.priority === priorityFilter
      const matchesAssignee = filter === '' || task.assignee === filter
      return matchesQuery && matchesPriority && matchesAssignee
    }),
  }))
  const boardCount = boards.length

  return <main className={`app-shell ${dark ? 'theme-dark' : ''}`}>
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="brand-mark"><LayoutGrid size={17} strokeWidth={2.8} /></div><span className="brand-word">taskflow<span className="brand-dot">.</span></span><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <button className="workspace-switch"><span className="workspace-avatar">S</span><span className="workspace-copy"><strong>Studio North</strong><small>Free workspace</small></span><ChevronDown size={15} /></button>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className="nav-item"><LayoutGrid size={17} /> Overview</button>
        <button className="nav-item active"><FolderKanban size={17} /> My boards <span className="nav-count">{boardCount}</span></button>
        <button className="nav-item"><Activity size={17} /> Activity</button>
        <button className="nav-item"><Users size={17} /> Members <span className="nav-count">4</span></button>
      </nav>
      <div className="sidebar-section-head"><span>YOUR BOARDS</span><button className="icon-button" aria-label="Create board" onClick={createBoard}><Plus size={16} /></button></div>
      <div className="board-nav-list">
        {boards.map((board, index) => <button key={board.id} className={`board-nav-item ${board.id === activeBoardId ? 'board-nav-active' : ''}`} onClick={() => { setActiveBoardId(board.id); setSidebarOpen(false) }}><span className={`board-nav-icon board-color-${index % 4}`}><Hash size={14} /></span><span>{board.name}</span>{board.id === activeBoardId && <span className="board-nav-dot" />}</button>)}
        <button className="add-board-link" onClick={createBoard}><Plus size={15} /> Create a board</button>
      </div>
      <div className="sidebar-bottom">
        <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={15} /></div><strong>Make room for big ideas</strong><p>Get unlimited boards and a little more breathing room.</p><button onClick={() => setToast('You are all set on the free plan for now.')}>Explore plans <ArrowUp size={13} /></button></div>
        <button className="nav-item sidebar-help"><CircleHelp size={17} /> Help & feedback</button>
        <button className="profile-button" onClick={() => user ? logout() : setModal({ type: 'auth', mode: 'login' })}>
          <Avatar name={user?.name || 'Olivia Chen'} />
          <span className="profile-copy"><strong>{user?.name || 'Olivia Chen'}</strong><small>{user?.email || 'olivia@studionorth.co'}</small></span>
          {user ? <LogOut size={16} /> : <MoreHorizontal size={18} />}
        </button>
      </div>
    </aside>

    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
    <section className="main-area">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
        <div className="breadcrumbs"><span>My boards</span><ChevronRight size={14} /><strong>{activeBoard.name}</strong></div>
        <div className="topbar-actions">
          <span className={`connection-state ${online ? 'connection-live' : ''}`}><span className="connection-dot" />{online ? `${activeUsers || 1} online` : apiMode === 'offline' ? 'Offline' : 'Local mode'}</span>
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('You’re all caught up!')}><Bell size={18} /><span /></button>
          <div className="avatar-stack">{members.slice(0, 3).map((member) => <Avatar key={member.name} name={member.name} />)}<button className="avatar avatar-more" title="Invite teammates" onClick={() => setToast('Invite teammates by sharing your board link.')}>+2</button></div>
          <button className="invite-button" onClick={shareBoard}><Share2 size={15} /> Share</button>
        </div>
      </header>
      <div className="board-scroll">
        {apiMode === 'offline' && <div className="offline-banner"><span><span className="connection-dot" /> Working offline — changes are saved on this device.</span><button aria-label="Dismiss offline message" onClick={() => setApiMode('guest')}><X size={14} /></button></div>}
        <section className="board-intro">
          <div className="board-title-area"><div className="board-eyebrow"><span className="eyebrow-square" /> PRODUCT TEAM <span className="eyebrow-separator">/</span> Q3 2025</div><div className="board-title-line"><h1>{activeBoard.name}</h1><div className="menu-anchor"><button className="icon-button title-menu" aria-label="Board options" onClick={() => setBoardMenuOpen(!boardMenuOpen)}><Ellipsis size={20} /></button>{boardMenuOpen && <div className="popover board-popover"><button onClick={() => { setBoardMenuOpen(false); renameBoard() }}>Rename board</button><button className="danger-action" onClick={deleteActiveBoard}>Delete board</button></div>}</div></div><p>{activeBoard.description || 'A little planning goes a long way.'}</p></div>
          <div className="board-toolbar">
            <div className="view-toggle"><button className={view === 'board' ? 'view-selected' : ''} onClick={() => setView('board')}><LayoutGrid size={15} /> Board</button><button className={view === 'list' ? 'view-selected' : ''} onClick={() => setView('list')}><ListFilter size={15} /> List</button></div>
            <div className="toolbar-divider" />
            <div className="filter-anchor"><button className={`toolbar-button ${showFilters ? 'toolbar-active' : ''}`} onClick={() => setShowFilters(!showFilters)}><Filter size={15} /> Filter</button>{showFilters && <div className="popover filter-popover"><label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option><option>High</option><option>Medium</option><option>Low</option></select></label><label>Assignee<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Everyone</option>{members.map((member) => <option key={member.name}>{member.name}</option>)}</select></label></div>}</div>
            <label className="search-box"><Search size={15} /><input ref={searchRef} aria-label="Search tasks" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="toolbar-icon-button" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
          </div>
        </section>
        <div className="board-meta-row"><div className="board-meta-left"><span><Clock3 size={14} /> Last updated just now</span><span className="meta-separator" /><button onClick={() => setToast(`${allTasks.length} tasks across ${activeBoard.columns.length} columns`)}><SlidersHorizontal size={14} /> {allTasks.length} tasks</button></div><button className="sort-button" onClick={() => setToast('Tasks are sorted by your custom board order.')}><ArrowDown size={14} /> Recently updated <ChevronDown size={13} /></button></div>
        {view === 'board' ? <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={({ active, over }) => moveTask(active.id, over?.id)}>
          <div className="kanban-board">{visibleColumns.map((column) => <Column key={column.id} column={column} onAddTask={(columnId) => setModal({ type: 'task', task: null, columnId })} onOpenTask={(task) => setModal({ type: 'task', task, columnId: column.id })} onRename={(item) => { const name = window.prompt('Rename column', item.name); if (name?.trim()) updateColumn(item, name) }} onDelete={deleteColumn} canEdit={activeBoard.columns.length > 1} />)}
            <button className="add-column-button" onClick={createColumn}><Plus size={16} /> Add column</button>
          </div>
        </DndContext> : <div className="list-view"><div className="list-header"><span>Task</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due date</span></div>{visibleColumns.flatMap((column) => column.tasks.map((task) => <button className="list-row" key={task.id} onClick={() => setModal({ type: 'task', task, columnId: column.id })}><span className="list-title"><span className="column-indicator" style={{ backgroundColor: column.color }} />{task.title}</span><span>{column.name}</span><span>{task.priority}</span><span className="list-assignee"><Avatar name={task.assignee} size="small" />{task.assignee}</span><span>{task.dueDate ? new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span></button>))}</div>}
        <button className="board-footer-add" onClick={createBoard}><Plus size={14} /> Create another board</button>
      </div>
      <footer className="statusbar"><div><span className={online ? 'status-live-dot' : 'status-idle-dot'} />{online ? 'Connected and in sync' : apiMode === 'offline' ? 'Offline — saved locally' : 'Your workspace is ready'}</div><span>Made for teams who get things done <span className="footer-heart">✳</span></span></footer>
    </section>
    {modal?.type === 'task' && <TaskDialog task={modal.task} column={activeBoard.columns.find((column) => column.id === modal.columnId)} columns={activeBoard.columns} onClose={() => setModal(null)} onSave={saveTask} onDelete={deleteTask} saving={busy} />}
    {modal?.type === 'auth' && <AuthDialog mode={modal.mode} onClose={() => { setModal(null); setError('') }} onSubmit={authenticate} busy={busy} error={error} setMode={(mode) => { setError(''); setModal({ type: 'auth', mode }) }} />}
    {toast && <div className="toast-message"><Check size={16} />{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
  </main>
}

export default App
