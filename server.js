/*
BACKEND API (Express)
Endpoints:
  - POST /api/contact        → basic contact form storage (+ optional SMTP)
  - POST /api/ai/recommend   → store intake, return suggested starting plan
Storage: data/submissions.json (fs-extra)
Note: keep personal questions OPTIONAL and require explicit consent.
*/

import express from "express";
import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Ensure data file exists and is an array
const dataFile = path.join(__dirname, "data", "submissions.json");
await fs.ensureFile(dataFile);
try {
  const j = await fs.readJson(dataFile);
  if (!Array.isArray(j)) await fs.writeJson(dataFile, [], { spaces: 2 });
} catch {
  await fs.writeJson(dataFile, [], { spaces: 2 });
}

// Expose minimal env to frontend (Calendly URL)
app.get("/env.json", (req, res) => {
  res.json({ CALENDLY_URL: process.env.CALENDLY_URL || "" });
});

// Simple healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

// --- AI marketing plan (optional) ---
app.post("/api/ai/plan", async (req, res) => {
  // Safety: if no OpenAI configured, just fall back
  if (!openai) {
    return res.status(503).json({
      plan: "Our AI helper is offline right now, but a human from the Barb team will review your answers and suggest a personalized starting plan live.",
    });
  }

  try {
    const profile = req.body?.profile || {};

    const business = profile.business || "a local business";
    const offer = profile.offer || "";
    const vibe = Array.isArray(profile.vibe) ? profile.vibe.join(", ") : profile.vibe || "";
    const goals = Array.isArray(profile.goals) ? profile.goals.join(", ") : profile.goals || "";
    const budget = profile.budget || "not specified";
    const notes = profile.notes || "";
    const email = profile.email || "";

    const userPrompt = `
You are a kind, practical marketing strategist at a small creative agency called "Barb" in Florida.

Write a short, concrete starting plan for this business.
Tone: warm, clear, no fluff. Avoid jargon. 2–4 short sections with bullet points.

Business name: ${business}
What they sell / who they serve: ${offer}
Vibe they want: ${vibe}
Main goals: ${goals}
Rough monthly budget: ${budget}
Founder notes: ${notes}
Contact email: ${email}

Focus on: what they GET out of working with us (foot traffic, social presence, trust, etc.).
Do not talk about "ChatGPT" or "AI", just say "our team" or "we".
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly marketing strategist for local brands. You give clear, specific plans, not generic advice.",
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ||
      "We’ll review your answers and craft a starting plan with you live.";

    res.json({ plan: text });
  } catch (err) {
    console.error("Error in /api/ai/plan:", err);
    res.status(500).json({
      plan: "We had a small technical issue. A human from the Barb team will suggest a plan live.",
    });
  }
});

// --- OpenAI (optional) ---
let openai = null;
try {
  const { default: OpenAI } = await import('openai');
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch {
  // openai package not installed — run without AI
}

// ===== CONTACT FORM =====
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body || {};
    if (!name || !email || !message)
      return res.json({ success: false, error: "missing_fields" });
    const submissions = (await fs.readJSON(dataFile).catch(() => [])) || [];
    const entry = { ...req.body, date: new Date().toISOString(), type: "contact" };
    submissions.push(entry);
    await fs.writeJSON(dataFile, submissions, { spaces: 2 });

    // Optional email via SMTP
    if (process.env.MAIL_HOST) {
      const transport = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      });
      await transport.sendMail({
        from: process.env.MAIL_FROM || "Barb <no-reply@localhost>",
        to: process.env.MAIL_TO || process.env.MAIL_FROM,
        subject: "New Contact — Barb Agency",
        text: `Name: ${req.body.name}\nEmail: ${req.body.email}\nMessage: ${req.body.message}`,
      });
    }
    res.json({ success: true });
  } catch (e) {
    console.error("CONTACT ERR", e);
    res.json({ success: false });
  }
});

// ===== AI INTAKE / RECOMMEND =====
app.post("/api/ai/recommend", async (req, res) => {
  try {
    const submissions = (await fs.readJSON(dataFile).catch(() => [])) || [];
    const entry = { type: "ai-intake", ...req.body, date: new Date().toISOString() };
    if (!entry.consent) return res.json({ success: false, error: "consent_required" });
    submissions.push(entry);
    await fs.writeJSON(dataFile, submissions, { spaces: 2 });

    // ---- AI: generate tailored plan if API key present; otherwise fall back ----
    async function llmPlan() {
      if (!openai) return null;
      const sys = `You are a senior growth strategist for a boutique local marketing agency. 
Return a STRICT JSON object with keys: title (string), summary (string), actions (array of 3-6 concise strings).
Tune for the client's budget, goals and brand vibe; keep scope realistic and high-leverage. No markdown, no commentary.`;
      const user = {
        business: entry.business,
        offer: entry.offer,
        vibe: entry.vibe,
        goals: entry.goals,
        budget: entry.budget,
        about: entry.about,
        city_hint: "Sarasota, FL (local-first).",
      };
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Client brief:\n${JSON.stringify(user, null, 2)}\n\nRespond ONLY with JSON.`,
          },
        ],
      });
      const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
      const json = JSON.parse(raw.replace(/^```json|```$/g, "").trim());
      if (!json.title || !Array.isArray(json.actions)) throw new Error("Invalid AI plan");
      return json;
    }

    let plan = null;
    try {
      plan = await llmPlan();
    } catch {
      plan = null;
    }
    if (!plan) {
      // fallback heuristic
      const b = String(entry.budget || "");
      plan = {
        title: "Essentials Plus",
        summary: "Targeted content and ads with monthly optimization.",
        actions: [
          "Ad creatives (A/B) + copy",
          "Two campaign variants",
          "Monthly optimization & report",
        ],
      };
      if (b.includes("3,000") || b.includes("6,000") || b.includes("+")) {
        plan = {
          title: "Growth System",
          summary: "Full-funnel creative, tracking and weekly iteration for ROAS.",
          actions: [
            "Offer + landing test matrix",
            "Event tracking & ROAS dashboards",
            "Weekly content cadence & budget shifts",
          ],
        };
      }
    }

    // --- Optional: forward to Google Sheets webhook (Apps Script) ---
    if (process.env.GOOGLE_SHEETS_WEBHOOK) {
      try {
        await fetch(process.env.GOOGLE_SHEETS_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...entry, plan }),
        });
      } catch (err) {
        console.error("Sheets webhook error:", err.message);
      }
    }

    res.json({ success: true, plan });
  } catch (e) {
    console.error("AI RECOMMEND ERR", e);
    res.json({ success: false });
  }
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
// 404 fallback for unmatched GET requests (after all routes; static is first)
app.use((req,res,next)=>{
  if (req.method === 'GET' && req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname,'public','404.html'));
  }
  next();
});
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
