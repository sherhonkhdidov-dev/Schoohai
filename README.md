# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Zumrad implementation notes

This build preserves the existing React/TanStack Start application while making the school workflows persistent and AI-ready.

### AI boundary
`src/lib/ai.ts` contains the secure integration boundary. The browser must never contain an AI provider secret. The current offline fallback is deterministic demo analysis; production document authenticity, plagiarism detection, handwriting analysis and image matching require a server-side provider/API.

### Localization
Canonical ARB source files are included under `src/lib/l10n/`:
- `app_ru.arb`
- `app_en.arb`
- `app_uz.arb`
- `app_tj.arb`

The running React app keeps its existing instant language switching and persistence.

### Included product areas
Student, teacher and parent roles; homework timer and image submission; AI-ready homework analysis; anonymous help; forgotten-notebook mode; live lesson/sick mode; canteen pre-order; lost-and-found image matching workflow; school marketplace; reward coins; regularity ranking; handwriting history; weekly report and signature capture; signature journal/hash chain; teacher task creation with image/video attachment and 30-second voice recording; parent reminders/report UI; analytics; settings and four languages.

### Production requirements
For a real deployment, connect authentication, database, file storage, notifications, live video, school/teacher registry verification, AI vision/plagiarism/handwriting services and a PDF generation service through a backend. The UI does not fabricate these external verifications.
