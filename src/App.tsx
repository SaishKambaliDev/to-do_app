import { useEffect, useMemo, useState, type FormEvent } from 'react'
import AuthScreen from './AuthScreen'
import {
  clearSession,
  getSessionUser,
  listUsers,
  setSession,
  type User,
} from './auth'

type TaskStatus = 'active' | 'completed' | 'deleted'

type TaskFilter = 'all' | 'pending' | 'overdue' | 'completed' | 'deleted'

interface TaskPart {
  id: string
  text: string
  done: boolean
}

interface TaskComment {
  id: string
  text: string
  createdAt: string
  progress?: number
}

interface Task {
  id: string
  text: string
  status: TaskStatus
  createdAt: string
  deadline?: string
  progress: number
  parts: TaskPart[]
  comments: TaskComment[]
  completedAt?: string
  deletedAt?: string
  teamId?: string
  createdBy?: string
  assigneeId?: string
}

interface Team {
  id: string
  name: string
  hostId: string
  memberIds: string[]
  createdAt: string
}

const TASKS_KEY_PREFIX = 'todo-app.tasks.v1'
const TEAM_TASKS_KEY_PREFIX = 'todo-app.team-tasks.v1'
const TEAMS_KEY = 'todo-app.teams.v1'
const THEME_KEY = 'todo-app.theme.v1'
const SIDEBAR_KEY = 'todo-app.sidebar.v1'
const STATUSES = new Set<TaskStatus>(['active', 'completed', 'deleted'])

type Theme = 'light' | 'dark'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function getInitials(email: string): string {
  const name = email.split('@')[0] ?? email
  const words = name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = words[0]?.charAt(0) ?? '?'
  const second = words[1]?.charAt(0) ?? words[0]?.charAt(1) ?? ''
  return `${first}${second}`.toUpperCase()
}

function tasksKey(userId: string): string {
  return `${TASKS_KEY_PREFIX}:${userId}`
}

function teamTasksKey(teamId: string): string {
  return `${TEAM_TASKS_KEY_PREFIX}:${teamId}`
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'narrow',
})

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function toDateValue(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

function parseDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && STATUSES.has(value as TaskStatus)
}

function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function parsePart(value: unknown): TaskPart | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (
    typeof raw.id !== 'string' ||
    typeof raw.text !== 'string' ||
    typeof raw.done !== 'boolean'
  ) {
    return null
  }
  return { id: raw.id, text: raw.text, done: raw.done }
}

function parseComment(value: unknown): TaskComment | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (
    typeof raw.id !== 'string' ||
    typeof raw.text !== 'string' ||
    typeof raw.createdAt !== 'string'
  ) {
    return null
  }
  return {
    id: raw.id,
    text: raw.text,
    createdAt: raw.createdAt,
    progress:
      typeof raw.progress === 'number'
        ? clampProgress(raw.progress)
        : undefined,
  }
}

function parseTask(value: unknown): Task | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (
    typeof raw.id !== 'string' ||
    typeof raw.text !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    !isValidTaskStatus(raw.status)
  ) {
    return null
  }

  const parts = Array.isArray(raw.parts)
    ? raw.parts.map(parsePart).filter((part): part is TaskPart => part !== null)
    : []
  const comments = Array.isArray(raw.comments)
    ? raw.comments
        .map(parseComment)
        .filter((comment): comment is TaskComment => comment !== null)
    : []
  const derivedProgress =
    parts.length > 0
      ? Math.round(
          (parts.filter((part) => part.done).length / parts.length) * 100,
        )
      : 0

  return {
    id: raw.id,
    text: raw.text,
    status: raw.status,
    createdAt: raw.createdAt,
    deadline: typeof raw.deadline === 'string' ? raw.deadline : undefined,
    completedAt:
      typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
    progress:
      typeof raw.progress === 'number'
        ? clampProgress(raw.progress)
        : derivedProgress,
    parts,
    comments,
    teamId: typeof raw.teamId === 'string' ? raw.teamId : undefined,
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : undefined,
    assigneeId:
      typeof raw.assigneeId === 'string' ? raw.assigneeId : undefined,
  }
}

function loadTasksFromKey(key: string): Task[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map(parseTask).filter((task): task is Task => task !== null)
      : []
  } catch (error) {
    console.error('Could not load tasks:', error)
    return []
  }
}

function loadTasks(userId: string): Task[] {
  return loadTasksFromKey(tasksKey(userId))
}

function loadTeamTasks(teamId: string): Task[] {
  return loadTasksFromKey(teamTasksKey(teamId))
}

function parseTeam(value: unknown): Team | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.hostId !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    !Array.isArray(raw.memberIds)
  ) {
    return null
  }

  const memberIds = raw.memberIds.filter(
    (memberId): memberId is string => typeof memberId === 'string',
  )

  return {
    id: raw.id,
    name: raw.name,
    hostId: raw.hostId,
    memberIds,
    createdAt: raw.createdAt,
  }
}

function loadTeams(): Team[] {
  try {
    const raw = localStorage.getItem(TEAMS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map(parseTeam).filter((team): team is Team => team !== null)
      : []
  } catch (error) {
    console.error('Could not load teams:', error)
    return []
  }
}

function saveTeams(teams: Team[]) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(teams))
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date)
}

function isOverdue(task: Task): boolean {
  if (task.status !== 'active' || !task.deadline) return false
  const time = new Date(task.deadline).getTime()
  return !Number.isNaN(time) && time < Date.now()
}

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`
}

function describeDeadline(deadline: string): string {
  const time = new Date(deadline).getTime()
  if (Number.isNaN(time)) return ''

  const now = Date.now()
  const diff = time - now
  const abs = Math.abs(diff)

  if (diff < 0) {
    if (abs < 60 * 60 * 1000) {
      return `Overdue by ${plural(Math.max(1, Math.round(abs / 60000)), 'minute')}`
    }
    if (abs < 24 * 60 * 60 * 1000) {
      return `Overdue by ${plural(Math.round(abs / 3600000), 'hour')}`
    }
    return `Overdue by ${plural(Math.round(abs / 86400000), 'day')}`
  }

  if (abs < 60 * 60 * 1000) {
    return `Due in ${plural(Math.max(1, Math.round(abs / 60000)), 'minute')}`
  }

  const dayDiff = Math.round((startOfDay(time) - startOfDay(now)) / 86400000)

  if (dayDiff === 0) {
    return `Due today in ${plural(
      Math.max(1, Math.round(diff / 3600000)),
      'hour',
    )}`
  }
  if (dayDiff === 1) return 'Due tomorrow'
  if (dayDiff < 7) return `Due in ${plural(dayDiff, 'day')}`
  if (dayDiff < 30) return `Due in ${plural(Math.round(dayDiff / 7), 'week')}`
  return `Due in ${plural(Math.round(dayDiff / 30), 'month')}`
}

function doneParts(task: Task): number {
  return task.parts.filter((part) => part.done).length
}

interface TaskDetailsHandlers {
  onAddPart: (taskId: string, text: string) => void
  onTogglePart: (taskId: string, partId: string) => void
  onRemovePart: (taskId: string, partId: string) => void
  onAddComment: (taskId: string, text: string, progress: number) => void
  onSetProgress: (taskId: string, progress: number) => void
}

interface TaskDetailsProps extends TaskDetailsHandlers {
  task: Task
  readOnly?: boolean
}

function TaskDetails({
  task,
  readOnly = false,
  onAddPart,
  onTogglePart,
  onRemovePart,
  onAddComment,
  onSetProgress,
}: TaskDetailsProps) {
  const [partText, setPartText] = useState('')
  const [commentText, setCommentText] = useState('')
  const [checkpoint, setCheckpoint] = useState(task.progress)

  const total = task.parts.length
  const done = doneParts(task)

  function submitPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = partText.trim()
    if (!text) return
    onAddPart(task.id, text)
    setPartText('')
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = commentText.trim()
    if (!text) return
    onAddComment(task.id, text, checkpoint)
    setCommentText('')
  }

  return (
    <div className="task-details">
      <div className="task-details__section">
        <div className="task-details__head">
          <h3 className="task-details__title">Progress</h3>
          <span className="badge">{task.progress}%</span>
        </div>
        {readOnly ? null : (
          <div className="progress-control">
            <input
              className="progress-control__range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={task.progress}
              aria-label="Set completion percentage"
              onChange={(event) =>
                onSetProgress(task.id, Number(event.target.value))
              }
            />
            <span className="progress-control__value">
              <input
                className="progress-control__number"
                type="number"
                min={0}
                max={100}
                step={1}
                value={task.progress}
                aria-label="Completion percentage"
                onChange={(event) =>
                  onSetProgress(task.id, Number(event.target.value))
                }
              />
              %
            </span>
          </div>
        )}
      </div>

      <div className="task-details__section">
        <div className="task-details__head">
          <h3 className="task-details__title">Parts</h3>
          {total > 0 ? (
            <span className="badge">
              {done}/{total}
            </span>
          ) : null}
        </div>
        {total > 0 ? (
          <ul className="part-list">
              {task.parts.map((part) => (
                <li className="part" key={part.id}>
                  <input
                    className="part__checkbox"
                    type="checkbox"
                    checked={part.done}
                    disabled={readOnly}
                    onChange={() => onTogglePart(task.id, part.id)}
                  />
                  <span
                    className={`part__text${part.done ? ' part__text--done' : ''}`}
                  >
                    {part.text}
                  </span>
                  {readOnly ? null : (
                    <button
                      className="part__remove"
                      type="button"
                      aria-label={`Remove part: ${part.text}`}
                      onClick={() => onRemovePart(task.id, part.id)}
                    >
                      &times;
                    </button>
                  )}
                </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            No parts yet. Break this task into smaller steps.
          </p>
        )}
        {readOnly ? null : (
          <form className="inline-form" onSubmit={submitPart}>
            <input
              className="inline-form__input"
              type="text"
              placeholder="Add a part..."
              maxLength={200}
              value={partText}
              onChange={(event) => setPartText(event.target.value)}
            />
            <button className="btn btn--primary btn--sm" type="submit">
              Add part
            </button>
          </form>
        )}
      </div>

      <div className="task-details__section">
        <div className="task-details__head">
          <h3 className="task-details__title">Progress updates</h3>
          {task.comments.length > 0 ? (
            <span className="badge">{task.comments.length}</span>
          ) : null}
        </div>
        {task.comments.length > 0 ? (
          <ul className="comment-list">
            {task.comments
              .slice()
              .reverse()
              .map((comment) => (
                <li className="comment" key={comment.id}>
                  <div className="comment__head">
                    {typeof comment.progress === 'number' ? (
                      <span className="comment__checkpoint">
                        {comment.progress}%
                      </span>
                    ) : null}
                    <span className="comment__meta">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <span className="comment__text">{comment.text}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="empty">
            No updates yet. Log a milestone with a timestamp and percentage.
          </p>
        )}
        {readOnly ? null : (
          <form className="inline-form inline-form--update" onSubmit={submitComment}>
            <div className="checkpoint-input">
              <label className="checkpoint-input__label" htmlFor={`checkpoint-${task.id}`}>
                Done
              </label>
              <input
                id={`checkpoint-${task.id}`}
                className="checkpoint-input__number"
                type="number"
                min={0}
                max={100}
                step={1}
                value={checkpoint}
                onChange={(event) => setCheckpoint(Number(event.target.value))}
              />
              <span aria-hidden="true">%</span>
            </div>
            <textarea
              className="inline-form__input"
              rows={2}
              placeholder="What did you get done?"
              maxLength={500}
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
            <button className="btn btn--primary btn--sm" type="submit">
              Post update
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

interface ActiveTaskItemProps extends TaskDetailsHandlers {
  task: Task
  expanded: boolean
  people?: Map<string, string>
  onToggleExpanded: (taskId: string) => void
  onComplete: (taskId: string) => void
  onDelete: (taskId: string) => void
}

function ActiveTaskItem({
  task,
  expanded,
  people,
  onToggleExpanded,
  onComplete,
  onDelete,
  ...handlers
}: ActiveTaskItemProps) {
  const overdue = isOverdue(task)
  const total = task.parts.length
  const done = doneParts(task)
  const assignee = task.assigneeId ? people?.get(task.assigneeId) : undefined

  return (
    <li className={`task task--expandable${expanded ? ' task--open' : ''}`}>
      <button
        className="task__complete"
        type="button"
        aria-label={`Complete task: ${task.text}`}
        title="Mark as complete"
        onClick={() => onComplete(task.id)}
      >
        <span aria-hidden="true">&#10003;</span>
      </button>
      <div className="task__body">
        <span className="task__text">{task.text}</span>
        <span className="task__meta">
          {assignee ? (
            <>
              <span className="task__assignee">Assigned to {assignee}</span>
              {' \u00b7 '}
            </>
          ) : null}
          {task.deadline ? (
            <span className={`deadline${overdue ? ' deadline--overdue' : ''}`}>
              Due {formatDate(task.deadline)} ({describeDeadline(task.deadline)})
            </span>
          ) : null}
          {task.deadline ? ' \u00b7 ' : null}
          <span className="task__progress">{task.progress}% done</span>
          {total > 0 ? ` \u00b7 ${done}/${total} parts` : null}
          {task.comments.length > 0
            ? ` \u00b7 ${task.comments.length} ${
                task.comments.length === 1 ? 'update' : 'updates'
              }`
            : null}
        </span>
      </div>
      <button
        className="task__toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => onToggleExpanded(task.id)}
      >
        {expanded ? 'Hide' : 'Details'}
      </button>
      <button
        className="task__delete"
        type="button"
        aria-label={`Delete task: ${task.text}`}
        title="Delete task"
        onClick={() => onDelete(task.id)}
      >
        <span aria-hidden="true">&times;</span>
      </button>
      {expanded ? <TaskDetails task={task} {...handlers} /> : null}
    </li>
  )
}

interface HistoryTaskItemProps extends TaskDetailsHandlers {
  task: Task
  expanded: boolean
  people?: Map<string, string>
  onToggleExpanded: (taskId: string) => void
}

function HistoryTaskItem({
  task,
  expanded,
  people,
  onToggleExpanded,
  ...handlers
}: HistoryTaskItemProps) {
  const completed = task.status === 'completed'
  const eventAt = completed ? task.completedAt : task.deletedAt
  const total = task.parts.length
  const done = doneParts(task)
  const assignee = task.assigneeId ? people?.get(task.assigneeId) : undefined

  return (
    <li
      className={`task task--history task--expandable${
        expanded ? ' task--open' : ''
      }`}
    >
      <div className="task__body">
        <span className="task__text">{task.text}</span>
        <span className="task__meta">
          {assignee ? `Assigned to ${assignee} \u00b7 ` : ''}
          {eventAt
            ? `${completed ? 'Completed' : 'Deleted'} ${formatDate(eventAt)}`
            : completed
              ? 'Completed'
              : 'Deleted'}
          {task.deadline ? ` \u00b7 Due ${formatDate(task.deadline)}` : ''}
          {` \u00b7 ${task.progress}% done`}
          {total > 0 ? ` \u00b7 ${done}/${total} parts` : ''}
          {task.comments.length > 0
            ? ` \u00b7 ${task.comments.length} ${
                task.comments.length === 1 ? 'update' : 'updates'
              }`
            : ''}
        </span>
      </div>
      <span
        className={`status ${
          completed ? 'status--completed' : 'status--deleted'
        }`}
      >
        {completed ? 'Completed' : 'Deleted'}
      </span>
      <button
        className="task__toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => onToggleExpanded(task.id)}
      >
        {expanded ? 'Hide' : 'Details'}
      </button>
      {expanded ? <TaskDetails task={task} readOnly {...handlers} /> : null}
    </li>
  )
}

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
}

function DatePicker({ value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseDateValue(value)
  const [today] = useState(() => new Date())
  const [viewYear, setViewYear] = useState(
    () => (selected ?? today).getFullYear(),
  )
  const [viewMonth, setViewMonth] = useState(
    () => (selected ?? today).getMonth(),
  )

  function openPicker() {
    const base = selected ?? new Date()
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
    setOpen(true)
  }

  function changeMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)

  const todayValue = toDateValue(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  const selectedValue = selected
    ? toDateValue(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      )
    : ''

  return (
    <div className="picker">
      <button
        type="button"
        className={`add-form__date picker__trigger${
          value ? '' : ' picker__trigger--placeholder'
        }`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {selected ? dateOnlyFormatter.format(selected) : 'Select date'}
      </button>
      {open ? (
        <>
          <div className="picker__backdrop" onClick={() => setOpen(false)} />
          <div className="picker__popover" role="dialog" aria-label="Choose date">
            <div className="calendar__head">
              <button
                type="button"
                className="calendar__nav"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
              >
                &#8249;
              </button>
              <span>{monthFormatter.format(new Date(viewYear, viewMonth, 1))}</span>
              <button
                type="button"
                className="calendar__nav"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
              >
                &#8250;
              </button>
            </div>
            <div className="calendar__weekdays">
              {Array.from({ length: 7 }, (_, index) => (
                <span className="calendar__weekday" key={index}>
                  {weekdayFormatter.format(new Date(2024, 0, 7 + index))}
                </span>
              ))}
            </div>
            <div className="calendar__grid">
              {cells.map((day, index) => {
                if (day === null) {
                  return (
                    <span
                      key={index}
                      className="calendar__day calendar__day--empty"
                    />
                  )
                }
                const cellValue = toDateValue(viewYear, viewMonth, day)
                return (
                  <button
                    key={index}
                    type="button"
                    className={`calendar__day${
                      cellValue === selectedValue
                        ? ' calendar__day--selected'
                        : ''
                    }${
                      cellValue === todayValue ? ' calendar__day--today' : ''
                    }`}
                    onClick={() => {
                      onChange(cellValue)
                      setOpen(false)
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            <div className="calendar__footer">
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  onChange(todayValue)
                  setOpen(false)
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
}

function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)
  const hours = Array.from({ length: 24 }, (_, index) => index)
  const minutes = Array.from({ length: 60 }, (_, index) => index)

  function openPicker() {
    if (value) {
      const [storedHour, storedMinute] = value.split(':')
      setHour(Number(storedHour) || 0)
      setMinute(Number(storedMinute) || 0)
    } else {
      setHour(new Date().getHours())
      setMinute(0)
    }
    setOpen(true)
  }

  function chooseHour(nextHour: number) {
    setHour(nextHour)
    onChange(`${pad2(nextHour)}:${pad2(minute)}`)
  }

  function chooseMinute(nextMinute: number) {
    setMinute(nextMinute)
    onChange(`${pad2(hour)}:${pad2(nextMinute)}`)
  }

  function chooseNow() {
    const now = new Date()
    const nextHour = now.getHours()
    const nextMinute = now.getMinutes()
    setHour(nextHour)
    setMinute(nextMinute)
    onChange(`${pad2(nextHour)}:${pad2(nextMinute)}`)
  }

  return (
    <div className="picker">
      <button
        type="button"
        className={`add-form__date picker__trigger${
          value ? '' : ' picker__trigger--placeholder'
        }`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {value || 'Select time'}
      </button>
      {open ? (
        <>
          <div className="picker__backdrop" onClick={() => setOpen(false)} />
          <div
            className="picker__popover timepicker"
            role="dialog"
            aria-label="Choose time"
          >
            <div className="timepicker__columns">
              <div
                className="timepicker__column"
                role="listbox"
                aria-label="Hour"
              >
                {hours.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`timepicker__option${
                      option === hour ? ' timepicker__option--selected' : ''
                    }`}
                    onClick={() => chooseHour(option)}
                    role="option"
                    aria-selected={option === hour}
                  >
                    {pad2(option)}
                  </button>
                ))}
              </div>
              <div
                className="timepicker__column"
                role="listbox"
                aria-label="Minute"
              >
                {minutes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`timepicker__option${
                      option === minute ? ' timepicker__option--selected' : ''
                    }`}
                    onClick={() => chooseMinute(option)}
                    role="option"
                    aria-selected={option === minute}
                  >
                    {pad2(option)}
                  </button>
                ))}
              </div>
            </div>
            <div className="timepicker__footer">
              <button type="button" className="link-btn" onClick={chooseNow}>
                Now
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

interface TodoAppProps {
  user: User
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
}

function TodoApp({ user, theme, onToggleTheme, onLogout }: TodoAppProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === 'collapsed',
  )
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [personalTasks, setPersonalTasks] = useState<Task[]>(() =>
    loadTasks(user.id),
  )
  const [teamTasks, setTeamTasks] = useState<Task[]>([])
  const [teams, setTeams] = useState<Team[]>(loadTeams)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [input, setInput] = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set<string>(),
  )
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [teamName, setTeamName] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')
  const [teamError, setTeamError] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberError, setMemberError] = useState('')

  const initials = getInitials(user.email)
  const peopleById = new Map(
    listUsers().map((member) => [member.id, member.email]),
  )
  const myTeams = teams.filter((team) => team.memberIds.includes(user.id))
  const activeTeam =
    (activeTeamId
      ? teams.find((team) => team.id === activeTeamId)
      : undefined) ?? null
  const isTeamView = activeTeam !== null
  const teamMembers = activeTeam
    ? activeTeam.memberIds.map((id) => ({
        id,
        email: peopleById.get(id) ?? 'Unknown user',
      }))
    : []
  const tasks = isTeamView ? teamTasks : personalTasks
  const setTasks = isTeamView ? setTeamTasks : setPersonalTasks
  const currentKey =
    isTeamView && activeTeam
      ? teamTasksKey(activeTeam.id)
      : tasksKey(user.id)

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === TEAMS_KEY) {
        setTeams(loadTeams())
        return
      }
      if (event.key !== currentKey) return
      if (isTeamView && activeTeam) {
        setTeamTasks(loadTeamTasks(activeTeam.id))
      } else {
        setPersonalTasks(loadTasks(user.id))
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [currentKey, isTeamView, activeTeam, user.id])

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    function handleInstalled() {
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      )
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setExpandedIds((current) => new Set(current))
    }, 60000)

    return () => window.clearInterval(interval)
  }, [])

  const active = useMemo(
    () => tasks.filter((task) => task.status === 'active'),
    [tasks],
  )

  const history = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== 'active')
        .sort((a, b) => {
          const aTime = new Date(
            a.completedAt ?? a.deletedAt ?? a.createdAt,
          ).getTime()
          const bTime = new Date(
            b.completedAt ?? b.deletedAt ?? b.createdAt,
          ).getTime()
          return bTime - aTime
        }),
    [tasks],
  )

  const pendingTasks = active.filter((task) => !isOverdue(task))
  const overdueTasks = active.filter(isOverdue)
  const completedTasks = history.filter((task) => task.status === 'completed')
  const deletedTasks = history.filter((task) => task.status === 'deleted')

  const completedCount = completedTasks.length
  const deletedCount = deletedTasks.length
  const overdueCount = overdueTasks.length

  const showActivePanel =
    filter === 'all' || filter === 'pending' || filter === 'overdue'
  const showHistoryPanel =
    filter === 'all' || filter === 'completed' || filter === 'deleted'

  const visibleActive =
    filter === 'overdue'
      ? overdueTasks
      : filter === 'pending'
        ? pendingTasks
        : active

  const visibleHistory =
    filter === 'completed'
      ? completedTasks
      : filter === 'deleted'
        ? deletedTasks
        : history

  const activeTitle =
    filter === 'overdue'
      ? 'Overdue tasks'
      : filter === 'pending'
        ? 'Pending tasks'
        : 'Active tasks'

  const historyTitle =
    filter === 'completed'
      ? 'Completed tasks'
      : filter === 'deleted'
        ? 'Deleted tasks'
        : 'History'

  const filterOptions: { value: TaskFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: tasks.length },
    { value: 'pending', label: 'Pending', count: pendingTasks.length },
    { value: 'overdue', label: 'Overdue', count: overdueTasks.length },
    { value: 'completed', label: 'Completed', count: completedCount },
    { value: 'deleted', label: 'Deleted', count: deletedCount },
  ]

  const previewDate = deadlineDate
    ? new Date(`${deadlineDate}T${deadlineTime || '23:59'}`)
    : null
  const deadlinePreview =
    previewDate && !Number.isNaN(previewDate.getTime())
      ? describeDeadline(previewDate.toISOString())
      : ''

  function saveTasks(next: Task[]) {
    try {
      localStorage.setItem(currentKey, JSON.stringify(next))
    } catch (storageError) {
      console.error('Could not save tasks:', storageError)
      setError('Could not save your tasks. Your browser storage may be full.')
    }
  }

  function commitTasks(next: Task[]) {
    setTasks(next)
    saveTasks(next)
  }

  function updateTask(taskId: string, updater: (task: Task) => Task) {
    commitTasks(
      tasks.map((task) => (task.id === taskId ? updater(task) : task)),
    )
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const text = input.trim()
    if (!text) {
      setError('Please enter a task before adding it.')
      return
    }

    let deadlineIso: string | undefined
    if (deadlineDate) {
      const dueDate = new Date(`${deadlineDate}T${deadlineTime || '23:59'}`)
      if (!Number.isNaN(dueDate.getTime())) {
        deadlineIso = dueDate.toISOString()
      }
    }

    const task: Task = {
      id: createId(),
      text,
      status: 'active',
      createdAt: new Date().toISOString(),
      deadline: deadlineIso,
      progress: 0,
      parts: [],
      comments: [],
      teamId: activeTeam ? activeTeam.id : undefined,
      createdBy: activeTeam ? user.id : undefined,
      assigneeId:
        activeTeam && assigneeId ? assigneeId : undefined,
    }

    commitTasks([task, ...tasks])
    setInput('')
    setDeadlineDate('')
    setDeadlineTime('')
    setAssigneeId('')
  }

  function toggleSidebar() {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded')
  }

  async function installApp() {
    if (!installPrompt) return

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice

    if (choice.outcome === 'accepted') {
      setInstallPrompt(null)
    }
  }

  function resetComposer() {
    setInput('')
    setDeadlineDate('')
    setDeadlineTime('')
    setAssigneeId('')
    setError('')
    setExpandedIds(new Set<string>())
    setFilter('all')
  }

  function selectPersonal() {
    setShowCreateTeam(false)
    setActiveTeamId(null)
    setMemberError('')
    resetComposer()
  }

  function selectTeam(teamId: string) {
    setShowCreateTeam(false)
    setActiveTeamId(teamId)
    setTeamTasks(loadTeamTasks(teamId))
    setMemberError('')
    resetComposer()
  }

  function openCreateTeam() {
    setShowCreateTeam(true)
    setActiveTeamId(null)
    setTeamName('')
    setInviteEmails('')
    setTeamError('')
    resetComposer()
  }

  function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTeamError('')

    const name = teamName.trim()
    if (!name) {
      setTeamError('Please enter a team name.')
      return
    }

    const emails = inviteEmails
      .split(/[,\s]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
    const users = listUsers()
    const memberIds = new Set<string>([user.id])
    const unknown: string[] = []

    emails.forEach((email) => {
      const found = users.find((candidate) => candidate.email === email)
      if (found) {
        memberIds.add(found.id)
      } else if (!unknown.includes(email)) {
        unknown.push(email)
      }
    })

    if (unknown.length > 0) {
      setTeamError(`No account found for: ${unknown.join(', ')}`)
      return
    }

    const team: Team = {
      id: createId(),
      name,
      hostId: user.id,
      memberIds: [...memberIds],
      createdAt: new Date().toISOString(),
    }

    const next = [...teams, team]
    setTeams(next)
    saveTeams(next)
    setTeamName('')
    setInviteEmails('')
    selectTeam(team.id)
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeTeam) return
    setMemberError('')

    const email = memberEmail.trim().toLowerCase()
    if (!email) return

    const found = listUsers().find((candidate) => candidate.email === email)
    if (!found) {
      setMemberError('No account found with that email.')
      return
    }
    if (activeTeam.memberIds.includes(found.id)) {
      setMemberError('That person is already on the team.')
      return
    }

    const next = teams.map((team) =>
      team.id === activeTeam.id
        ? { ...team, memberIds: [...team.memberIds, found.id] }
        : team,
    )
    setTeams(next)
    saveTeams(next)
    setMemberEmail('')
  }

  function leaveTeam() {
    if (!activeTeam) return

    if (activeTeam.hostId === user.id) {
      if (
        !window.confirm(
          `Delete the team "${activeTeam.name}"? This removes all of its tasks.`,
        )
      ) {
        return
      }
      localStorage.removeItem(teamTasksKey(activeTeam.id))
      const next = teams.filter((team) => team.id !== activeTeam.id)
      setTeams(next)
      saveTeams(next)
      selectPersonal()
      return
    }

    if (!window.confirm(`Leave the team "${activeTeam.name}"?`)) return
    const next = teams.map((team) =>
      team.id === activeTeam.id
        ? {
            ...team,
            memberIds: team.memberIds.filter((id) => id !== user.id),
          }
        : team,
    )
    setTeams(next)
    saveTeams(next)
    selectPersonal()
  }

  function updateStatus(id: string, status: 'completed' | 'deleted') {
    const timestamp = new Date().toISOString()
    commitTasks(
      tasks.map((task) => {
        if (task.id !== id || task.status !== 'active') return task

        return {
          ...task,
          status,
          ...(status === 'completed'
            ? { completedAt: timestamp }
            : { deletedAt: timestamp }),
        }
      }),
    )
  }

  function clearHistory() {
    if (history.length === 0) return

    const label = history.length === 1 ? 'task' : 'tasks'
    if (
      !window.confirm(
        `Remove ${history.length} ${label} from history? This cannot be undone.`,
      )
    ) {
      return
    }

    commitTasks(tasks.filter((task) => task.status === 'active'))
  }

  function toggleExpanded(taskId: string) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  function addPart(taskId: string, text: string) {
    updateTask(taskId, (task) => ({
      ...task,
      parts: [...task.parts, { id: createId(), text, done: false }],
    }))
  }

  function togglePart(taskId: string, partId: string) {
    updateTask(taskId, (task) => ({
      ...task,
      parts: task.parts.map((part) =>
        part.id === partId ? { ...part, done: !part.done } : part,
      ),
    }))
  }

  function removePart(taskId: string, partId: string) {
    updateTask(taskId, (task) => ({
      ...task,
      parts: task.parts.filter((part) => part.id !== partId),
    }))
  }

  function setProgress(taskId: string, progress: number) {
    updateTask(taskId, (task) => ({
      ...task,
      progress: clampProgress(progress),
    }))
  }

  function addComment(taskId: string, text: string, progress: number) {
    const checkpoint = clampProgress(progress)
    updateTask(taskId, (task) => ({
      ...task,
      progress: checkpoint,
      comments: [
        ...task.comments,
        {
          id: createId(),
          text,
          createdAt: new Date().toISOString(),
          progress: checkpoint,
        },
      ],
    }))
  }

  const detailsHandlers: TaskDetailsHandlers = {
    onAddPart: addPart,
    onTogglePart: togglePart,
    onRemovePart: removePart,
    onAddComment: addComment,
    onSetProgress: setProgress,
  }

  return (
    <div className="layout">
      <aside
        className={`sidebar${sidebarCollapsed ? ' sidebar--collapsed' : ''}`}
      >
        <nav className="sidebar__nav" aria-label="Main navigation">
          <button
            type="button"
            className={`sidebar__link${
              !isTeamView && !showCreateTeam ? ' sidebar__link--active' : ''
            }`}
            onClick={selectPersonal}
            title="My Tasks"
          >
            <span className="sidebar__link-icon" aria-hidden="true">
              &#10003;
            </span>
            <span className="sidebar__link-label">My Tasks</span>
          </button>
          <div className="sidebar__section">
            <span className="sidebar__heading">Teams</span>
            {myTeams.length === 0 ? (
              <p className="sidebar__empty">No teams yet.</p>
            ) : (
              myTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={`sidebar__link${
                    activeTeamId === team.id ? ' sidebar__link--active' : ''
                  }`}
                  onClick={() => selectTeam(team.id)}
                  title={team.name}
                >
                  <span className="sidebar__link-icon" aria-hidden="true">
                    {team.name.trim().charAt(0).toUpperCase() || '#'}
                  </span>
                  <span className="sidebar__link-label">{team.name}</span>
                  <span className="sidebar__link-meta">
                    {team.memberIds.length}
                  </span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            className={`sidebar__link sidebar__link--create${
              showCreateTeam ? ' sidebar__link--active' : ''
            }`}
            onClick={openCreateTeam}
            title="Create team"
          >
            <span className="sidebar__link-icon" aria-hidden="true">
              +
            </span>
            <span className="sidebar__link-label">Create team</span>
          </button>
        </nav>
        <div className="sidebar__footer">
          {installPrompt ? (
            <button
              type="button"
              className="sidebar__action sidebar__action--install"
              onClick={installApp}
              aria-label="Install app"
              title="Install app"
            >
              <svg
                className="sidebar__action-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              <span className="sidebar__action-label">Install app</span>
            </button>
          ) : null}
          <button
            type="button"
            className="sidebar__action sidebar__action--collapse"
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
            }
            aria-pressed={sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className="sidebar__action-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={sidebarCollapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
            </svg>
            <span className="sidebar__action-label">
              {sidebarCollapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>
          <button
            type="button"
            className="sidebar__action"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            }
            title={
              theme === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            }
          >
            {theme === 'dark' ? (
              <svg
                className="sidebar__action-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                className="sidebar__action-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
            <span className="sidebar__action-label">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
          <button
            type="button"
            className="sidebar__action sidebar__action--danger"
            onClick={onLogout}
            title="Log out"
          >
            <svg
              className="sidebar__action-icon"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            <span className="sidebar__action-label">Log out</span>
          </button>
        </div>
      </aside>

      <div className="profile-card" tabIndex={0}>
        <div className="profile">
          <span className="profile__avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="profile__meta">
            <p className="profile__label">Signed in as</p>
            <p className="profile__email" title={user.email}>
              {user.email}
            </p>
          </div>
        </div>
        <div className="profile__summary" aria-label="Task summary">
          <span className="profile__stat">
            <strong>{completedCount}</strong>
            <span>completed</span>
          </span>
          <span className="profile__stat">
            <strong>{active.length}</strong>
            <span>remaining</span>
          </span>
          <span className="profile__stat profile__stat--overdue">
            <strong>{overdueCount}</strong>
            <span>overdue</span>
          </span>
        </div>
      </div>

      <main className="app">
        <header className="app__header">
          <div>
            <h1>
              {showCreateTeam
                ? 'Create team'
                : isTeamView && activeTeam
                  ? activeTeam.name
                  : 'My Tasks'}
            </h1>
            <p className="app__subtitle">
              {showCreateTeam
                ? 'Invite teammates by the email they signed up with.'
                : isTeamView && activeTeam
                  ? `Host: ${
                      peopleById.get(activeTeam.hostId) ?? 'Unknown'
                    } \u00b7 ${activeTeam.memberIds.length} ${
                      activeTeam.memberIds.length === 1 ? 'member' : 'members'
                    }`
                  : 'Personal tasks'}
            </p>
          </div>
          {!showCreateTeam && isTeamView && activeTeam ? (
            <button
              className="btn btn--ghost"
              type="button"
              onClick={leaveTeam}
            >
              {activeTeam.hostId === user.id ? 'Delete team' : 'Leave team'}
            </button>
          ) : null}
        </header>

        {showCreateTeam ? (
          <section className="panel" aria-labelledby="create-team-heading">
            <div className="panel__head">
              <h2 id="create-team-heading">New team</h2>
            </div>
            <form
              className="add-form add-form--column"
              autoComplete="off"
              onSubmit={createTeam}
            >
              <div className="add-form__row">
                <label className="sr-only" htmlFor="team-name">
                  Team name
                </label>
                <input
                  id="team-name"
                  className="add-form__input"
                  type="text"
                  placeholder="Team name"
                  maxLength={80}
                  value={teamName}
                  onChange={(event) => {
                    setTeamName(event.target.value)
                    setTeamError('')
                  }}
                  required
                />
                <button type="submit" className="btn btn--primary">
                  Create team
                </button>
              </div>
              <label className="deadline-fields__field" htmlFor="team-invites">
                <span>Member emails (comma separated)</span>
                <input
                  id="team-invites"
                  className="add-form__input"
                  type="text"
                  placeholder="alice@example.com, bob@example.com"
                  value={inviteEmails}
                  onChange={(event) => {
                    setInviteEmails(event.target.value)
                    setTeamError('')
                  }}
                />
              </label>
            </form>
            {teamError ? (
              <p className="form-error" role="alert">
                {teamError}
              </p>
            ) : null}
          </section>
        ) : (
          <>
            {isTeamView && activeTeam ? (
              <section className="panel" aria-labelledby="team-info-heading">
                <div className="panel__head">
                  <h2 id="team-info-heading">Team members</h2>
                  <span className="badge">{activeTeam.memberIds.length}</span>
                </div>
                <ul className="member-list">
                  {teamMembers.map((member) => (
                    <li className="member" key={member.id}>
                      <span className="member__email">{member.email}</span>
                      {member.id === activeTeam.hostId ? (
                        <span className="member__tag">Host</span>
                      ) : null}
                      {member.id === user.id ? (
                        <span className="member__tag member__tag--you">
                          You
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {activeTeam.hostId === user.id ? (
                  <form
                    className="inline-form team-info__invite"
                    onSubmit={addMember}
                  >
                    <label className="sr-only" htmlFor="member-email">
                      Member email
                    </label>
                    <input
                      id="member-email"
                      className="inline-form__input"
                      type="email"
                      placeholder="Add member by email..."
                      value={memberEmail}
                      onChange={(event) => {
                        setMemberEmail(event.target.value)
                        setMemberError('')
                      }}
                    />
                    <button className="btn btn--primary btn--sm" type="submit">
                      Add member
                    </button>
                  </form>
                ) : null}
                {memberError ? (
                  <p className="form-error" role="alert">
                    {memberError}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="panel" aria-labelledby="add-heading">
        <h2 id="add-heading" className="sr-only">
          Add a task
        </h2>
        <form
          className="add-form add-form--column"
          autoComplete="off"
          onSubmit={addTask}
        >
          <div className="add-form__row">
            <label className="sr-only" htmlFor="task-input">
              New task
            </label>
            <input
              id="task-input"
              className="add-form__input"
              type="text"
              name="task"
              placeholder="What needs to be done?"
              maxLength={200}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setError('')
              }}
              required
            />
            <button type="submit" className="btn btn--primary">
              Add task
            </button>
          </div>
          <div className="deadline-fields">
            <div className="deadline-fields__field">
              <span>Due date</span>
              <DatePicker value={deadlineDate} onChange={setDeadlineDate} />
            </div>
            <div className="deadline-fields__field">
              <span>Due time</span>
              <TimePicker value={deadlineTime} onChange={setDeadlineTime} />
            </div>
            {isTeamView ? (
              <label className="deadline-fields__field" htmlFor="task-assignee">
                <span>Assign to</span>
                <select
                  id="task-assignee"
                  className="add-form__date"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.email}
                      {member.id === user.id ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {deadlinePreview ? (
              <span className="deadline-fields__hint">{deadlinePreview}</span>
            ) : null}
          </div>
        </form>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <nav className="filter-bar" aria-label="Filter tasks">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-chip${
              filter === option.value ? ' filter-chip--active' : ''
            }`}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            <span>{option.label}</span>
            <span className="filter-chip__count">{option.count}</span>
          </button>
        ))}
      </nav>

      {showActivePanel ? (
        <section className="panel" aria-labelledby="active-heading">
          <div className="panel__head">
            <h2 id="active-heading">{activeTitle}</h2>
            <span className="badge">{visibleActive.length}</span>
          </div>
          {visibleActive.length > 0 ? (
            <ul className="task-list">
              {visibleActive.map((task) => (
                <ActiveTaskItem
                  key={task.id}
                  task={task}
                  expanded={expandedIds.has(task.id)}
                  people={peopleById}
                  onToggleExpanded={toggleExpanded}
                  onComplete={(id) => updateStatus(id, 'completed')}
                  onDelete={(id) => updateStatus(id, 'deleted')}
                  {...detailsHandlers}
                />
              ))}
            </ul>
          ) : (
            <p className="empty">
              {filter === 'pending'
                ? "No pending tasks. You're all caught up."
                : filter === 'overdue'
                  ? 'No overdue tasks. Nice work staying on schedule.'
                  : 'No active tasks. Add one above to get started.'}
            </p>
          )}
        </section>
      ) : null}

      {showHistoryPanel ? (
        <section className="panel" aria-labelledby="history-heading">
          <div className="panel__head">
            <h2 id="history-heading">{historyTitle}</h2>
            <div className="panel__actions">
              <span className="badge">{visibleHistory.length}</span>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={clearHistory}
                disabled={history.length === 0}
              >
                Clear history
              </button>
            </div>
          </div>
          {visibleHistory.length > 0 ? (
            <ul className="task-list task-list--history">
              {visibleHistory.map((task) => (
                <HistoryTaskItem
                  key={task.id}
                  task={task}
                  expanded={expandedIds.has(task.id)}
                  people={peopleById}
                  onToggleExpanded={toggleExpanded}
                  {...detailsHandlers}
                />
              ))}
            </ul>
          ) : (
            <p className="empty">
              {filter === 'completed'
                ? 'No completed tasks yet.'
                : filter === 'deleted'
                  ? 'No deleted tasks yet.'
                  : 'Completed or deleted tasks will appear here.'}
            </p>
          )}
        </section>
      ) : null}
          </>
        )}
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(() => getSessionUser())
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  function handleAuthenticated(nextUser: User) {
    setSession(nextUser.id)
    setUser(nextUser)
  }

  function handleLogout() {
    clearSession()
    setUser(null)
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />
  }

  return (
    <TodoApp
      user={user}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={handleLogout}
    />
  )
}

export default App
