// Contact footer form (quiet)
const contactForm = document.getElementById("contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(contactForm).entries());
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const ok = (await res.json()).success;
    alert(ok ? "Thanks! Weâ€™ll reply soon." : "Something went wrong.");
    contactForm.reset();
  });
}

// Robust modal open/close
document.addEventListener("DOMContentLoaded", () => {
  // Find elements (tolerant selector for the CTA in case ID was missed)
  const modal = document.getElementById("aiModal");
  const begin =
    document.getElementById("beginBrief") ||
    document.querySelector('a.btn.primary[href="#"], a[href="#story"], a[href="#brief"]');
  const closeBtn = modal ? modal.querySelector(".x") : null;

  // Guard: if any required element is missing, log helpful tips
  if (!modal) {
    console.warn(
      '[Barb] #aiModal not found. Create <div id="aiModal" class="modal hidden">...</div> in index.html'
    );
    return;
  }
  if (!begin) {
    console.warn(
      '[Barb] Begin CTA not found. Ensure: <a id="beginBrief" class="btn primary" href="#">Begin your story</a>'
    );
  }

  // Open
  begin &&
    begin.addEventListener("click", (e) => {
      e.preventDefault();
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      // Optional: focus the first input in the form for accessibility
      const firstInput = modal.querySelector("input, textarea, select, button:not(.x)");
      firstInput && firstInput.focus();
    });

  // Close via Ã—
  closeBtn &&
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    });

  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
  });

  // Close on Esc
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
  });
});

// Intake submit â†’ save + recommend â†’ redirect to live.html
document.addEventListener("DOMContentLoaded", () => {
  const aiIntake = document.getElementById("aiIntake");
  const aiStatus = document.getElementById("aiStatus");
  const pg = document.getElementById("pg");

  function summarizeProfile(data) {
    const vibes = (data.vibe || []).join(", ");
    const goals = (data.goals || []).join(", ");
    return `
Business: ${data.business}
Offer/Audience: ${data.offer}
Vibe: ${vibes || "â€”"}
Goals: ${goals || "â€”"}
Budget: ${data.budget || "â€”"}
Founder notes: ${data.about || "â€”"}
Email: ${data.email}
`.trim();
  }

  if (aiIntake) {
    aiIntake.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fd = new FormData(aiIntake);
      const payload = Object.fromEntries(fd.entries());
      payload.vibe = fd.getAll("vibe");
      payload.goals = fd.getAll("goals");
      payload.consent = !!fd.get("consent");

      // Button lock helper
      const submitBtn = aiIntake.querySelector('button[type="submit"]');
      function lock(b){
        if(!submitBtn) return;
        submitBtn.disabled = b;
        submitBtn.textContent = b ? "Creating plan…" : "Create my plan";
      }

      // Require consent
      if (!fd.get("consent")) {
        alert("Please check consent to continue.");
        return;
      }

      // local cache for instant handoff page
      const profile = summarizeProfile(payload);
      localStorage.setItem("barb_ai_profile_text", profile);
      localStorage.setItem("barb_ai_profile_obj", JSON.stringify(payload));

      // Lock UI and show status
      lock(true);

      if (aiStatus) {
        aiStatus.style.display = "block";
        aiStatus.textContent = "Thinkingâ€¦";
        // progress
        if (pg){ pg.style.width = "25%"; setTimeout(()=>pg.style.width="55%", 200); }
      }

      try {
        const res = await fetch("/api/ai/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        localStorage.setItem("barb_ai_reco", JSON.stringify(json));
      } catch (e) {
        console.warn("[Barb] recommend error", e);
        alert("Network error. We’ll still connect you to a human on the next page.");
      } finally {
        if (pg){ pg.style.width = "100%"; setTimeout(()=>pg.style.width="0%", 600); }
        lock(false);
        setTimeout(()=>{ window.location.href = "live.html"; }, 350);
      }
    });
  }
});

(async function initCalendly(){
  try {
    const r = await fetch('/env.json');
    const env = await r.json();
    const url = (env && env.CALENDLY_URL || '').trim();
    if (!url) return; // nothing to do

    const section = document.getElementById('schedule');
    const btn = document.getElementById('bookBtn');
    const link = document.getElementById('bookLink');
    const mount = document.getElementById('calendlyMount');

    // Reveal the section
    if (section) section.style.display = 'block';

    // Popup on click
    if (btn) {
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        if (window.Calendly && window.Calendly.initPopupWidget) {
          window.Calendly.initPopupWidget({ url });
        } else {
          // Fallback to new tab if widget not loaded yet
          window.open(url, '_blank', 'noopener');
        }
      });
    }

    // Direct link fallback
    if (link) link.href = url;

    // Inline embed
    if (mount) {
      mount.innerHTML =
        `<div class="calendly-inline-widget" data-url="${url}" style="min-width:320px;height:700px;"></div>`;
      // If Calendly script hasn’t executed yet, try reloading it once
      if (!(window.Calendly && window.Calendly.initInlineWidget)) {
        const s = document.createElement('script');
        s.src = 'https://assets.calendly.com/assets/external/widget.js';
        s.async = true;
        document.body.appendChild(s);
      }
    }
  } catch (e) {
    console.warn('[Calendly] init failed', e);
  }
})();

// --- Live page logic (AI + email handoff) ---
function loadBarbProfile() {
  try {
    const raw = localStorage.getItem("barbProfile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function initLivePage() {
  const profile = loadBarbProfile() || {};

  // Fill profile block
  const profileEl = document.querySelector("[data-profile]");
  if (profileEl) {
    profileEl.textContent = [
      `Business: ${profile.business || "-"}`,
      `Offer / audience: ${profile.offer || "-"}`,
      `Vibe: ${(profile.vibe || []).join(", ") || "-"}`,
      `Goals: ${(profile.goals || []).join(", ") || "-"}`,
      `Budget: ${profile.budget || "-"}`,
      `Founder notes: ${profile.notes || "-"}`,
      `Email: ${profile.email || "-"}`,
    ].join("\n");
  }

  // Fire AI request
  const planEl = document.querySelector("[data-plan]");
  if (planEl) {
    planEl.textContent = "We’re drafting a starting plan based on your answers…";

    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });

      const data = await res.json();
      planEl.textContent =
        data.plan ||
        "We’ll suggest a starting plan with you live. (Our AI helper is taking a break.)";
    } catch (err) {
      console.error("AI plan error", err);
      planEl.textContent =
        "We’ll suggest a starting plan with you live. (We hit a small technical snag.)";
    }
  }

  // Forget profile button
  const forgetBtn = document.getElementById("forgetProfile");
  if (forgetBtn) {
    forgetBtn.addEventListener("click", () => {
      localStorage.removeItem("barbProfile");
      window.location.href = "index.html";
    });
  }

  // Start live (email)
  const startBtn = document.getElementById("startLiveBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const email = profile.email || "";
      const subject = encodeURIComponent("Barb: Ready to talk");
      const body = encodeURIComponent(
        `Hi Barb team,

Here’s my profile and AI starting plan from the website:

${profileEl ? profileEl.textContent : ""}

${planEl ? "\n\nAI starting plan:\n" + planEl.textContent : ""}

Let’s talk about next steps and pricing.

Thanks!`
      );

      window.location.href = `mailto:hello@youragency.com?subject=${subject}&body=${body}`;
    });
  }
}

// Auto-run when on live page
if (window.location.pathname.endsWith("live.html")) {
  initLivePage();
}
