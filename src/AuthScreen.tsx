import { useState, type FormEvent } from 'react'
import { login, register, type User } from './auth'

interface AuthScreenProps {
  onAuthenticated: (user: User) => void
}

type AuthMode = 'login' | 'register'

function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const result =
        mode === 'login'
          ? await login(email, password)
          : await register(email, password)

      if (!result.ok) {
        setError(result.error)
        return
      }

      onAuthenticated(result.user)
    } catch (authError) {
      console.error('Authentication failed:', authError)
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next)
    setError('')
  }

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1>My Tasks</h1>
          <p className="app__subtitle">
            Log in or create an account to keep your tasks separate.
          </p>
        </div>
      </header>

      <section className="panel auth">
        <div className="auth__tabs" role="tablist" aria-label="Authentication">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth__tab${mode === 'login' ? ' auth__tab--active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth__tab${
              mode === 'register' ? ' auth__tab--active' : ''
            }`}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        <form className="auth__form" autoComplete="on" onSubmit={handleSubmit}>
          <label className="auth__field">
            <span>Email</span>
            <input
              className="add-form__input"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
              }}
              required
            />
          </label>

          <label className="auth__field">
            <span>Password</span>
            <input
              className="add-form__input"
              type="password"
              name="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              minLength={8}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
              required
            />
          </label>

          {mode === 'register' ? (
            <label className="auth__field">
              <span>Confirm password</span>
              <input
                className="add-form__input"
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value)
                  setError('')
                }}
                required
              />
            </label>
          ) : null}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="btn btn--primary auth__submit"
            type="submit"
            disabled={busy}
          >
            {busy
              ? 'Please wait...'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default AuthScreen
