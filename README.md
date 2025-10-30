# Your Agency – Marketing Website

A professional, responsive website for a marketing/advertising agency. Includes easy navigation, a contact form, a lightweight chat-style widget, and a minimal Node.js backend to receive submissions.

## Features
- Responsive layout and sticky navigation
- Services, work/case studies, pricing, about, and contact sections
- Accessible forms with client-side validation
- Lightweight chat widget sending messages to the same backend
- Backend stores submissions to `data/submissions.json` and can optionally email via SMTP

## Quick start
1. Install Node.js 18+
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and adjust if needed
4. Run the server:
   ```bash
   npm start
   ```
   Open http://localhost:3000

## Email notifications (optional)
Set SMTP env vars in `.env` to enable email on new submissions:
```
MAIL_HOST=...
MAIL_PORT=587
MAIL_USER=...
MAIL_PASS=...
MAIL_FROM="Your Agency <no-reply@yourdomain.com>"
MAIL_TO=sales@yourdomain.com
```

## Customize
- Branding and content: `public/index.html`
- Colors and styles: `public/styles.css`
- Frontend logic: `public/script.js`
- API and server: `server.js`

## Deploy
- Render/Fly.io/Heroku: Deploy as a Node app (`npm start`)
- Docker: Use Node base image, copy repo, `npm ci`, expose port, `CMD ["node","server.js"]`
- Static hosts (Netlify/Vercel): Serve `public/` statically and add a small serverless function for `/api/contact` using the logic in `server.js`

## License
MIT
