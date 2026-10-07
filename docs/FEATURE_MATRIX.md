# Zumrad: what is real

Everything below runs on the server with a real database (Supabase) and free AI (Gemini). Nothing is simulated.

| Feature | How it works |
|---|---|
| Accounts | Phone + 6-digit PIN (PBKDF2), signed session token, login throttle. Teacher code links students; student code links a parent. |
| Teacher check | Original-file forensics (AI-generator metadata, C2PA "AI-generated" flag, editor tags, screenshot-like files) + Gemini vision on diploma and 3x4 portrait. approved -> in; manual_review -> `pending` until you approve in Supabase; rejected -> blocked. |
| Homework | Gemini grades the notebook photo against the real task text: stars, exercises done, mistakes, understood flag, suspicion of non-handwritten work. Saved per student. Coins (stars x 10) are awarded once per task per day, server-side. |
| Handwriting | Gemini scores 0-100 with letter tips. History chart comes from the database. |
| Teacher video | Student taps "I did not understand" -> request appears for the teacher -> teacher uploads a video -> student and parent watch it via signed URLs. |
| Tasks | Teacher text + optional photo/video + 30 s voice note, stored in private storage. |
| Rating | Distinct active days in the last 30 days among the class's students. |
| Parent signature | Speed/pressure compared with that parent's earlier genuine signatures on the server; hash-chained journal in the database; forged ones raise a signal for the teacher. |
| Notifications | The app sends its own in-app notifications (bell icon, checked every 30 s): new task, announcement, teacher video answer, "did not understand" request, homework result for parents, bazaar reservation, question reply, suspicious signature. If the user allows it, they also appear as phone/desktop notifications while the app is in the background. No SMS. |
| Shop, canteen, bazaar, questions, notebook, announcements | Database-backed; prices are enforced on the server. |

## Limits you must know
- AI cannot prove a diploma is genuine. It finds visible signs of forgery/AI generation. It does not query any state registry. "approved" means "nothing suspicious found".
- "Suspicion of non-handwritten work" is an estimate. The AI cannot search the internet.
- Notifications arrive while the app/tab is open or in the background. When the app is fully closed nothing is delivered (needs Web Push with VAPID keys: not built yet).
- Canteen orders are recorded but there is no canteen-staff screen or notification yet.
- Signature forgery detection compares simple speed/pressure averages: it is a signal, not proof.
- Free tiers: Gemini rate limits, Supabase pausing after 1 week idle, 1 GB storage. Gemini free tier may use submitted data for model improvement.
- Not compiled or run in the build environment; first run may need small fixes.
