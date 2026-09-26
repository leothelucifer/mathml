# ML + Math Study Map

Study material for mathematics and machine learning: an interactive React app in
[`week1-2-ml-ai-study/`](week1-2-ml-ai-study/) with concept pages, formulas, worked examples,
interactive graphs, and Python code that students can edit and run in the browser.

- Live site (GitHub Pages): [https://leorajesh.github.io/mathml/](https://mathml-one.vercel.app/)
- Develop: `npm install` then `npm run dev` from this folder.
- Deploy: pushing to `main` runs `.github/workflows/deploy-pages.yml`, which builds the app and
  publishes it to GitHub Pages. In the repository's Settings > Pages, set **Source** to
  **GitHub Actions** once. Vercel also works (`vercel.json`); both use the same build.

## Student accounts (Google sign-in)

Progress (concepts marked done, quiz scores, homework attempts and clues, code edits) is always
saved in the student's browser. When the site is built with a Firebase config, a **Sign in with
Google** button appears in the top bar and progress is also saved to the student's account, so it
follows them to any device. Without the config the button is hidden and nothing else changes.

How it is stored: Firebase Authentication (Google provider) identifies the student, and Cloud
Firestore holds one small document per progress entry at `users/{uid}/{store}/{key}`
(`store` is `done`, `quiz`, `homework` or `code`). The browser copy stays the working copy; the app
merges it with the account on sign-in and keeps both in step while signed in, so work done offline
or before signing in is kept. [`firestore.rules`](week1-2-ml-ai-study/firestore.rules) lets each
student read and write only their own documents. Signing out removes the progress from that browser
(it stays in the account), so shared computers start clean.

One-time setup (free Spark plan is enough for a class):

1. In the [Firebase console](https://console.firebase.google.com/) create a project, then
   **Build > Authentication > Sign-in method**: enable **Google**.
2. **Authentication > Settings > Authorized domains**: add `leorajesh.github.io` (and your Vercel
   domain if you use it). `localhost` is there already.
3. **Build > Firestore Database**: create a database (production mode), then publish the rules:
   `npx firebase-tools deploy --only firestore:rules --project <project-id>` from
   `week1-2-ml-ai-study/` (or paste `firestore.rules` into the console's Rules tab).
4. **Project settings > Your apps**: add a Web app and copy its `apiKey`, `authDomain`,
   `projectId` and `appId`. These are public identifiers, not secrets.
5. GitHub Pages: in the repository's **Settings > Secrets and variables > Actions > Variables**, add
   `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, then re-run
   the deploy. Vercel: add the same values as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` environment variables. Local development:
   copy `week1-2-ml-ai-study/.env.example` to `.env.local` and fill it in.

To try it without a Firebase project, run the emulators
(`npx firebase-tools emulators:start --project demo-mathml` in `week1-2-ml-ai-study/`) and build
with `VITE_FIREBASE_EMULATOR=1` plus any placeholder values for the four settings.

