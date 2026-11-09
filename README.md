# My Tasks

A local-first todo app for personal tasks and shared team boards. Built with React, Vite, and TypeScript, and installable as a Progressive Web App (PWA).

No backend is required. Accounts, tasks, teams, comments, and preferences are stored in the browser with `localStorage`.

## Features

### Accounts and privacy

- Register and sign in with an email and password.
- Passwords are hashed with PBKDF2-SHA256 (120,000 iterations, random salt).
- Sessions persist across page reloads.
- Every account has its own private task list.
- All data stays in the current browser profile. Nothing is uploaded to a server.

### Personal tasks

- Add tasks with an optional deadline date and time.
- Complete, reopen, delete, and restore tasks.
- Clear completed/deleted history.
- Inline expandable task details.
- Relative deadline labels such as "Due in 2h" and overdue highlighting.
- Custom calendar and time pickers instead of native browser date/time controls.

### Progress, parts, and updates

- Set task progress from 0 to 100 with a slider or number input.
- Add checklist parts to a task.
- Add timestamped progress updates/comments.
- Track completion percentage per task.

### Filters and history

- Filter by All, Pending, Overdue, Completed, and Deleted.
- Live counts for each filter.
- Completed tasks open in a read-only view.
- Deleted tasks can be restored or permanently cleared.

### Teams and shared boards

- Create a team with a name and an optional simulated Google host.
- Invite registered users by email.
- Shared team board with the same tasks, deadlines, progress, parts, comments, and filters.
- Optionally assign a task to a team member.
- Host can add members or delete the team.
- Members can leave a team.

### Interface and experience

- Responsive layout for desktop, tablet, and mobile.
- Collapsible sidebar with persisted state; main content does not shift when the sidebar collapses.
- Light and dark themes with persisted preference.
- Profile card fixed to the top-right; details appear on hover or keyboard focus.
- Logout action lives in the sidebar footer.
- Installable PWA with an in-app "Install app" button when supported.

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19.3 |
| Build tool | Vite 7.3.8 |
| Language | TypeScript 7.0.2 |
| Linting | oxlint |
| Styling | Plain CSS in `src/styles.css` |
| Persistence | Browser `localStorage` |
| Auth | PBKDF2-SHA256 via the Web Crypto API |
| App packaging | PWA manifest + service worker |

Vite is pinned to `7.3.8` for compatibility with older CPUs that do not support AVX instructions.

## Specifications

### Data models

- `User`: `id`, `email`, `passwordHash`, `salt`
- `Task`: `id`, `title`, `status`, timestamps, optional `deadline`, `progress`, `parts`, `comments`, optional team fields
- `Team`: `id`, `name`, `hostEmail`, `hostName`, `memberEmails`, `createdAt`
- `TaskComment`: `id`, `text`, optional `progress`, `createdAt`
- `TaskPart`: `id`, `text`, `done`

Task statuses: `active`, `completed`, `deleted`.

### Storage keys

| Key | Purpose |
| --- | --- |
| `todo-app.users.v1` | Registered user accounts |
| `todo-app.session.v1` | Current signed-in user |
| `todo-app.tasks.v1:<userId>` | Personal tasks for a user |
| `todo-app.teams.v1` | Teams and membership |
| `todo-app.team-tasks.v1:<teamId>` | Shared tasks for a team |
| `todo-app.theme.v1` | Light/dark theme preference |
| `todo-app.sidebar.v1` | Sidebar collapsed/expanded state |

Clearing site data or browser storage permanently removes all accounts and tasks.

### Authentication

- PBKDF2-SHA256, 120,000 iterations, 256-bit derived key.
- Random 16-byte salt per user.
- Hashes and salts are stored as base64 strings.
- This is a local demo auth system, not production-grade server authentication.

### PWA and offline behavior

- `public/manifest.webmanifest` defines the installable app metadata and icons.
- `public/sw.js` caches the app shell and runtime assets.
- The service worker registers only in production builds.
- Installation requires `localhost` or HTTPS.
- The app can open offline after it has been loaded once.

## Getting started

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer

Check your versions:

```bash
node -v
npm -v
```

### Installation

1. Clone the repository:

```bash
git clone <your-repository-url>
cd todo_web_project
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open the printed URL, usually:

```text
http://localhost:5173/
```

5. Register an account and start adding tasks.

### Production build

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. The preview server usually runs at `http://localhost:4173/`.

### Lint

```bash
npm run lint
```

## Install as a downloadable app

The project is a PWA, so it can be installed like a desktop or mobile app.

1. Build and serve the production version:

```bash
npm run build
npm run preview
```

2. Open the preview URL in a supported browser.

3. Install it:

- **Chrome/Edge on desktop:** click the install icon in the address bar, or open the browser menu and choose **Install My Tasks** / **Install page as app**.
- **Android Chrome:** open the menu and choose **Install app** or **Add to Home screen**.
- **iOS Safari:** tap **Share** and choose **Add to Home Screen**.

When the browser fires the install prompt, an **Install app** button also appears in the sidebar footer. Click it to install directly.

> Installation only works on `localhost` or an HTTPS deployment. It will not appear when opening the app over plain HTTP on another host.

## Usage

1. Register a new account on the auth screen.
2. Add a task from the form at the top of the board.
3. Optionally set a deadline with the custom date and time pickers.
4. Expand a task to update progress, manage parts, and add updates.
5. Use the filter chips to switch between pending, overdue, completed, and deleted tasks.
6. Select **Create team** in the sidebar to start a shared board.
7. Invite team members by the email they registered with in this browser.
8. Switch between **My Tasks** and any team from the sidebar.

## Project structure

```text
todo_web_project/
├── .github/
│   └── workflows/
│       └── ci.yml
├── public/
│   ├── favicon.svg
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/
│       ├── apple-touch-icon.png
│       ├── icon-192.png
│       ├── icon-512.png
│       └── icon-maskable-512.png
├── src/
│   ├── App.tsx
│   ├── AuthScreen.tsx
│   ├── auth.ts
│   ├── main.tsx
│   └── styles.css
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .oxlintrc.json
├── LICENSE
└── README.md
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run oxlint |

## Deployment

The built `dist/` folder can be deployed to any static host, such as GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

For a root-domain deployment, no extra configuration is needed.

For GitHub Pages or any subpath deployment, set the Vite base path in `vite.config.ts`:

```ts
export default defineConfig({
  base: '/<repository-name>/',
  plugins: [react()],
})
```

Then update `start_url` and `scope` in `public/manifest.webmanifest` to match the same subpath, rebuild, and deploy `dist/`.

## Limitations

- This is a local-only app. Accounts and teams exist only in one browser profile.
- Team members must have registered an account in the same browser to be invited.
- There is no server, real-time sync, email delivery, or password recovery.
- Clearing browser data deletes all app data.
- The auth implementation is for demonstration and learning, not production security.
- PWA installation and offline support depend on browser support and require HTTPS or `localhost`.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Install dependencies with `npm install`.
4. Make your changes and run `npm run lint` and `npm run build`.
5. Open a pull request.

## License

Released under the MIT License. See [LICENSE](LICENSE).
