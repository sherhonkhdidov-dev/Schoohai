# Zumrad: setup in 10 minutes (all free tiers)

## 1. Database (Supabase, free plan)
1. Create a project at supabase.com.
2. SQL Editor -> paste the whole `supabase/schema.sql` -> Run. This creates the tables, locks them (RLS) and creates the private `videos` bucket.
3. Project Settings -> API: copy the Project URL and the **service_role** key.
Free plan (checked 2026): 500 MB database, 1 GB file storage, the project **pauses after 1 week without activity** (restore it from the dashboard). Videos are capped at 25 MB each, so 1 GB holds about 40-100 videos.

If you already ran an older schema.sql, run it again: it only adds the new `notifications` table.

## 2. AI (Google Gemini API, free tier)
1. aistudio.google.com/apikey -> create a key.
2. The free tier has per-minute/per-day limits. When exceeded the app shows a "limit reached, wait a minute" message.
3. PRIVACY: on the free tier Google may use prompts and images to improve its models and humans may review them. Students' notebook photos and teachers' diplomas/portraits are sent there. Get parents' written consent and tell users, or switch to a paid tier (not used for training) before a real launch.

## 3. Run
```
bun install
cp .env.example .env     # fill the 5 values
bun run dev
```
Deploy: `bun run build`. Set the same 5 variables on the host (Cloudflare: `wrangler secret put NAME`; Render/Node: Environment tab).

## 4. Roles and codes
- Register a **teacher** first (diploma + 3x4 photo, phone, 6-digit PIN). If the AI is unsure the account stays `pending`: review it in Supabase SQL Editor:
  `select u.id,u.full_name,u.phone,r.risk,r.reasons,r.summary from users u join teacher_reviews r on r.user_id=u.id where u.status='pending';`
  then `update users set status='approved' where id='...';`
- The teacher sees a 6-letter code in Settings. Students need it to register.
- The student sees their own code in Settings. A parent needs it to register and link to the child.
- Login is phone + PIN; 8 wrong attempts lock the phone for 15 minutes.
