# Event Portal — Login-Protected Chat + Stream

Everything you need: attendee login, real-time chat between logged-in attendees,
a password-protected stream page, and an admin panel where you paste in emails
and the system creates accounts and emails each person their login.

## What's inside

```
backend/     Node.js/Express API + Socket.io chat server + Postgres
frontend/    React app (login, chat, stream, admin pages)
```

The backend serves the built frontend too, so in production it's **one single
deployment** — one URL, one service.

---

## 1. Get the pieces you need (do this first)

You'll need four things before deploying. All are free to start.

### a) A domain
Buy one at [Namecheap](https://namecheap.com) or [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — a few dollars/year for most `.com` domains.

### b) Hosting: Render
1. Go to [render.com](https://render.com) and sign up (free tier to start, no credit card required).
2. You'll deploy the `backend` folder as a Web Service, and add a **Postgres** database from Render's "New" menu.

### c) Resend (for sending login emails)
1. Sign up free at [resend.com](https://resend.com) (100 emails/day free, plenty for 100–500 attendees over a launch period — upgrade if you need to blast everyone at once).
2. Add and verify your domain under **Domains** in Resend (they give you DNS records to add — do this at your domain registrar).
3. Create an API key under **API Keys** — this is your `RESEND_API_KEY`.

### d) Vimeo
1. Upload your event video to Vimeo (Plus plan or higher gets you privacy controls).
2. Set the video's privacy to **"Hide from Vimeo"** and restrict embedding to **your domain only** (Settings → Privacy → Where can this be embedded).
3. Grab the video ID and the `h` hash from the embed code Vimeo gives you — these go in your `.env` as `VIMEO_VIDEO_ID` and `VIMEO_HASH`.

This embed restriction is important: it means even someone who found the embed
code couldn't play your video on a different site — it only plays on your domain,
behind your login.

---

## 2. Deploy the backend to Render

1. Push this whole project to a GitHub repo.
2. In Render: **New → PostgreSQL**. Create the database (free tier to start) and copy its **Internal Database URL** once it's ready.
3. In Render: **New → Web Service**, connect the same repo, and set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && cd ../frontend && npm install && npm run build && cd ../backend`
   - **Start Command**: `npm start`
4. In the web service's **Environment** tab, add everything from `backend/.env.example`:
   - `DATABASE_URL` — paste the Internal Database URL from step 2
   - `JWT_SECRET` — generate with `openssl rand -hex 32`
   - `ADMIN_PASSWORD` — your own admin login password
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `VIMEO_VIDEO_ID`, `VIMEO_HASH`
   - `PUBLIC_URL` — set this to your real domain once you've attached it (step 4 below)
5. Render will build and deploy automatically. It gives you a temporary `*.onrender.com` URL to test with first.

## 3. Build and attach the frontend

The backend is set up to serve the frontend's built files automatically. The build command in step 2 above (`... && cd ../frontend && npm install && npm run build ...`) handles this during Render's deploy — you don't need to build it locally, though you can with `cd frontend && npm install && npm run build` if you want to test first.

## 4. Point your domain at it

1. In Render, go to your web service → **Settings → Custom Domain**, and add your domain (e.g. `events.yourdomain.com` or the root domain).
2. Render gives you a CNAME (or A record for the root domain) — add that under your domain's DNS settings in GoDaddy.
3. Once DNS propagates (usually 10–60 minutes), your site is live at your domain, HTTPS included automatically.

---

## 5. Add your attendees

1. Go to `https://yourdomain.com/admin`.
2. Log in with the `ADMIN_PASSWORD` you set.
3. Paste one attendee per line:
   ```
   jane@example.com, Jane Doe
   john@example.com
   ```
4. Click **Add attendees & send logins** — each person gets an account with a random password and an email with their login link.

Attendees then go to `https://yourdomain.com/login`, log in, and can access
**Chat** (talk with other logged-in attendees in real time) and **Stream**
(the password-protected Vimeo embed).

---

## Local development (optional, before deploying)

```bash
# Terminal 1 — backend (needs a local or cloud Postgres URL in backend/.env)
cd backend
cp .env.example .env   # fill in the values
npm install
npm run dev

# Terminal 2 — frontend (talks to backend via Vite's proxy)
cd frontend
npm install
npm run dev
```
Visit `http://localhost:5173`.

---

## Notes on security

- Passwords are hashed with bcrypt before storage — never stored in plain text.
- Attendee sessions use JWTs valid for 30 days; the admin session is separate and expires after 12 hours.
- The Vimeo embed URL is only ever returned to a logged-in attendee via an authenticated API call — it's never in the page source for a logged-out visitor.
- Consider rotating `ADMIN_PASSWORD` and `JWT_SECRET` after the event, and revoking attendee access (the "Revoke" button in `/admin`) once it's over.
