export interface User {
  id: string
  email: string
  createdAt: string
}

interface StoredUser extends User {
  salt: string
  passwordHash: string
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string }

const USERS_KEY = 'todo-app.users.v1'
const SESSION_KEY = 'todo-app.session.v1'
const ITERATIONS = 120000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function toPublicUser(user: StoredUser): User {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

function isStoredUser(value: unknown): value is StoredUser {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw.id === 'string' &&
    typeof raw.email === 'string' &&
    typeof raw.createdAt === 'string' &&
    typeof raw.salt === 'string' &&
    typeof raw.passwordHash === 'string'
  )
}

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isStoredUser) : []
  } catch (error) {
    console.error('Could not load users:', error)
    return []
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

async function deriveHash(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

export async function register(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalized = normalizeEmail(email)

  if (!EMAIL_PATTERN.test(normalized)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' }
  }

  const users = loadUsers()
  if (users.some((user) => user.email === normalized)) {
    return {
      ok: false,
      error: 'An account with this email already exists.',
    }
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const passwordHash = await deriveHash(password, salt)
  const stored: StoredUser = {
    id: createId(),
    email: normalized,
    createdAt: new Date().toISOString(),
    salt: toBase64(salt),
    passwordHash,
  }

  try {
    saveUsers([...users, stored])
  } catch (error) {
    console.error('Could not save user:', error)
    return {
      ok: false,
      error: 'Could not create the account. Browser storage may be full.',
    }
  }

  return { ok: true, user: toPublicUser(stored) }
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResult> {
  const normalized = normalizeEmail(email)
  const stored = loadUsers().find((user) => user.email === normalized)

  if (!stored) {
    return { ok: false, error: 'No account found with that email.' }
  }

  const passwordHash = await deriveHash(password, fromBase64(stored.salt))
  if (passwordHash !== stored.passwordHash) {
    return { ok: false, error: 'Incorrect password.' }
  }

  return { ok: true, user: toPublicUser(stored) }
}

export function listUsers(): User[] {
  return loadUsers().map(toPublicUser)
}

export function getSessionUser(): User | null {
  try {
    const userId = localStorage.getItem(SESSION_KEY)
    if (!userId) return null
    const stored = loadUsers().find((user) => user.id === userId)
    return stored ? toPublicUser(stored) : null
  } catch (error) {
    console.error('Could not restore session:', error)
    return null
  }
}

export function setSession(userId: string) {
  localStorage.setItem(SESSION_KEY, userId)
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
