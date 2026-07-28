/* =========================================================
   St. John's Christian Church — single site script
   ---------------------------------------------------------
   Everything the site needs lives here: your Firebase and
   Apps Script settings (top of file), the data layer, and
   the page logic for Home, About, I'm New, and the Admin
   dashboard. Each page-init function checks for its own
   elements first, so this one file is safe to include on
   every page — it only runs the parts that page actually has.
   ========================================================= */

/* =========================================================
   CONFIG — action needed (see SETUP.md)
   ========================================================= */

// ---- Firebase (members, milestones, church calendar, staff login) ----
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBA1DixfrOnsTQAuzqokCsAP8KNjnPLd7w",
  authDomain: "st-johns-christian-church.firebaseapp.com",
  projectId: "st-johns-christian-church",
  storageBucket: "st-johns-christian-church.firebasestorage.app",
  messagingSenderId: "1015532852084",
  appId: "1:1015532852084:web:ba3c1224809f8be4569221",
};
const FIREBASE_IS_CONFIGURED = !Object.values(FIREBASE_CONFIG).some(v => v.startsWith("REPLACE_ME"));

// ---- Google Apps Script (Connect Card + Contact form -> Google Sheet) ----
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzXzjD08CnVSJTHx67WPosJIYE2UwQ6q0DPOYqoThTckd2oivQNQrgSSUbe5kpceekCA/exec";
const APPS_SCRIPT_IS_CONFIGURED = APPS_SCRIPT_URL !== "REPLACE_ME_WITH_YOUR_WEB_APP_URL";

// Optional: paste the Google Sheet's own URL for a quick link in the admin dashboard.
const CHURCH_SHEET_URL = "https://docs.google.com/spreadsheets/d/1LZs3RNCsawB2qaZQ4zaVNPgEhJLE88GtbuGqmp6HUxI/edit?gid=0#gid=0";
const CHURCH_SHEET_IS_CONFIGURED = CHURCH_SHEET_URL !== "REPLACE_ME_WITH_YOUR_GOOGLE_SHEET_URL";


/* =========================================================
   DATA LAYER — Firestore (data) + Firebase Auth (admin login)
   Only touches `firebase` if the Firebase SDK script tags are
   present on the current page (Home/I'm New/Ministries/Giving
   don't need them; About needs Firestore; Admin needs both).
   ========================================================= */

const SJCC = (() => {

  let auth = null, db = null;
  const configured = FIREBASE_IS_CONFIGURED && typeof firebase !== "undefined";

  if (configured){
    firebase.initializeApp(FIREBASE_CONFIG);
    if (typeof firebase.auth === "function") auth = firebase.auth();
    if (typeof firebase.firestore === "function") db = firebase.firestore();
  }

  function isConfigured(){ return configured; }

  function requireDb(){
    if (!configured || !db) throw new Error("Firebase isn't configured yet — see SETUP.md.");
    return db;
  }

  // ---------- Auth ----------
  function onAuthChange(cb){
    if (!configured || !auth) { cb(null); return; }
    auth.onAuthStateChanged(cb);
  }
  function login(email, password){
    if (!configured || !auth) return Promise.reject(new Error("Firebase isn't configured yet."));
    return auth.signInWithEmailAndPassword(email, password);
  }
  function logout(){ return configured && auth ? auth.signOut() : Promise.resolve(); }
  function currentUser(){ return configured && auth ? auth.currentUser : null; }

  // ---------- Generic collection helpers ----------
  async function getAll(collection){
    const snap = await requireDb().collection(collection).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function saveDoc(collection, item){
    const data = { ...item };
    const id = data.id;
    delete data.id;
    if (id){
      await requireDb().collection(collection).doc(id).set(data, { merge: true });
      return { id, ...data };
    } else {
      data.createdAt = Date.now();
      const ref = await requireDb().collection(collection).add(data);
      return { id: ref.id, ...data };
    }
  }
  async function deleteDoc(collection, id){ await requireDb().collection(collection).doc(id).delete(); }

  // ---------- Members ----------
  const getMembers = () => getAll("members");
  const saveMember = (m) => saveDoc("members", m);
  const deleteMember = (id) => deleteDoc("members", id);
  async function getMember(id){
    const doc = await requireDb().collection("members").doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  // ---------- Milestones: baptisms, weddings, funerals, dedications ----------
  const getEvents = () => getAll("milestones");
  const saveEvent = (e) => saveDoc("milestones", e);
  const deleteEvent = (id) => deleteDoc("milestones", id);

  // ---------- Church calendar (public read, admin write) ----------
  const getCalendarEvents = () => getAll("calendarEvents");
  const saveCalendarEvent = (e) => saveDoc("calendarEvents", e);
  const deleteCalendarEvent = (id) => deleteDoc("calendarEvents", id);

  // ---------- Cross-reference search ----------
  async function search(query){
    const q = query.trim().toLowerCase();
    if (!q) return { members: [], events: [] };
    const [members, events] = await Promise.all([getMembers(), getEvents()]);
    return {
      members: members.filter(m =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.phone || "").toLowerCase().includes(q)
      ),
      events: events.filter(e => (e.personName || "").toLowerCase().includes(q)),
    };
  }

  // ---------- Verse of the Day ----------
  // Each entry below does double duty: `ref` picks which passage shows
  // today (rotating through the year), and `text` is the offline fallback
  // used only if the live API can't be reached. The actual text shown to
  // visitors is normally fetched fresh from bible-api.com (no key, no
  // signup) so it's easy to swap translations later by changing
  // VOTD_TRANSLATION below.
  const VOTD_TRANSLATION = "kjv";
  const VOTD_CACHE_KEY = "sjcc_votd_cache";

  const VERSES = [
    { text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.", ref: "John 3:16" },
    { text: "I can do all things through Christ which strengtheneth me.", ref: "Philippians 4:13" },
    { text: "Trust in the LORD with all thine heart; and lean not unto thine own understanding.", ref: "Proverbs 3:5" },
    { text: "The LORD is my shepherd; I shall not want.", ref: "Psalm 23:1" },
    { text: "Be strong and of a good courage, be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.", ref: "Joshua 1:9" },
    { text: "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.", ref: "Romans 8:28" },
    { text: "Which hope we have as an anchor of the soul, both sure and stedfast.", ref: "Hebrews 6:19" },
    { text: "Come unto me, all ye that labour and are heavy laden, and I will give you rest.", ref: "Matthew 11:28" },
    { text: "Fear thou not; for I am with thee: be not dismayed; for I am thy God.", ref: "Isaiah 41:10" },
    { text: "This is the day which the LORD hath made; we will rejoice and be glad in it.", ref: "Psalm 118:24" },
    { text: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles.", ref: "Isaiah 40:31" },
    { text: "Let all that you do be done in love.", ref: "1 Corinthians 16:14" },
    { text: "Rejoice in the Lord alway: and again I say, Rejoice.", ref: "Philippians 4:4" },
    { text: "Cast thy burden upon the LORD, and he shall sustain thee.", ref: "Psalm 55:22" },
    { text: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.", ref: "Jeremiah 29:11" },
    { text: "Draw nigh to God, and he will draw nigh to you.", ref: "James 4:8" },
    { text: "Delight thyself also in the LORD: and he shall give thee the desires of thine heart.", ref: "Psalm 37:4" },
    { text: "Have I not commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed.", ref: "Joshua 1:9" },
    { text: "The LORD is my light and my salvation; whom shall I fear?", ref: "Psalm 27:1" },
    { text: "Love suffereth long, and is kind; love envieth not.", ref: "1 Corinthians 13:4" },
    { text: "Blessed are the pure in heart: for they shall see God.", ref: "Matthew 5:8" },
    { text: "Be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you.", ref: "Ephesians 4:32" },
    { text: "Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you.", ref: "Matthew 7:7" },
    { text: "The name of the LORD is a strong tower: the righteous runneth into it, and is safe.", ref: "Proverbs 18:10" },
    { text: "Let not your heart be troubled: ye believe in God, believe also in me.", ref: "John 14:1" },
    { text: "For where two or three are gathered together in my name, there am I in the midst of them.", ref: "Matthew 18:20" },
    { text: "Create in me a clean heart, O God; and renew a right spirit within me.", ref: "Psalm 51:10" },
    { text: "Give thanks unto the LORD; for he is good: for his mercy endureth for ever.", ref: "Psalm 107:1" },
    { text: "In the beginning was the Word, and the Word was with God, and the Word was God.", ref: "John 1:1" },
    { text: "But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.", ref: "Matthew 6:33" }
  ];

  function todaysFallbackEntry(){
    const start = new Date(new Date().getFullYear(), 0, 0);
    const diff = new Date() - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return VERSES[dayOfYear % VERSES.length];
  }

  async function verseOfTheDay(){
    const entry = todaysFallbackEntry();
    const todayKey = new Date().toISOString().slice(0, 10);

    // Serve from cache if we already fetched today's verse once.
    try {
      const cached = JSON.parse(localStorage.getItem(VOTD_CACHE_KEY) || "null");
      if (cached && cached.date === todayKey && cached.ref === entry.ref && cached.text){
        return { text: cached.text, ref: cached.displayRef || entry.ref };
      }
    } catch (e){ /* ignore bad cache, fall through to fetch */ }

    // Fetch fresh text from bible-api.com — free, no API key required.
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const url = `https://bible-api.com/${encodeURIComponent(entry.ref)}?translation=${VOTD_TRANSLATION}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`bible-api.com responded ${res.status}`);
      const data = await res.json();
      const text = (data.text || "").replace(/\n/g, " ").trim();
      const displayRef = data.reference || entry.ref;
      if (!text) throw new Error("bible-api.com returned no text");

      try {
        localStorage.setItem(VOTD_CACHE_KEY, JSON.stringify({ date: todayKey, ref: entry.ref, displayRef, text }));
      } catch (e){ /* storage full or unavailable — not critical */ }

      return { text, ref: displayRef };
    } catch (err){
      console.warn("Verse of the Day: bible-api.com unavailable, showing offline verse instead.", err);
      return { text: entry.text, ref: entry.ref };
    }
  }

  return {
    isConfigured, onAuthChange, login, logout, currentUser,
    getMembers, saveMember, deleteMember, getMember,
    getEvents, saveEvent, deleteEvent,
    getCalendarEvents, saveCalendarEvent, deleteCalendarEvent,
    search, verseOfTheDay,
  };
})();


/* =========================================================
   SHARED HELPERS
   ========================================================= */

function esc(str){
  return (str || "").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function fmtDate(d){
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
}
const TYPE_LABEL = { baptism:"Baptism", wedding:"Wedding", funeral:"Funeral", dedication:"Dedication" };

/* Fire-and-forget submit to the Apps Script web app (Sheets backend).
   Uses text/plain to avoid a CORS preflight; Apps Script still parses
   the body as JSON. mode:"no-cors" means we can't read the response,
   so "the request went out" is treated as success. */
function submitToAppsScript(payload){
  if (!APPS_SCRIPT_IS_CONFIGURED) return Promise.reject(new Error("not-configured"));
  return fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

function showConfigBanner(message){
  const banner = document.getElementById("config-banner");
  if (!banner) return;
  banner.style.display = "block";
  banner.innerHTML = message;
}


/* =========================================================
   PAGE INIT — NAV (every page)
   ========================================================= */

function initNav(){
  const navToggle = document.querySelector(".nav-toggle");
  const mainNav = document.querySelector(".main-nav");
  if (navToggle && mainNav){
    navToggle.addEventListener("click", () => {
      mainNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", mainNav.classList.contains("open") ? "true" : "false");
    });
    mainNav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => mainNav.classList.remove("open")));
  }
  document.querySelectorAll(".footer-year").forEach(el => el.textContent = new Date().getFullYear());
}


/* =========================================================
   PAGE INIT — HOME (verse of the day + contact form)
   ========================================================= */

function initHomePage(){
  const verseTextEl = document.getElementById("verse-text");
  if (!verseTextEl) return; // not the home page

  SJCC.verseOfTheDay().then((verse) => {
    verseTextEl.textContent = `“${verse.text}”`;
    const verseRefEl = document.getElementById("verse-ref");
    if (verseRefEl) verseRefEl.textContent = verse.ref;
  });

  if (!APPS_SCRIPT_IS_CONFIGURED){
    showConfigBanner(`This site's contact form isn't fully wired up yet — see <a href="SETUP.md">SETUP.md</a> to connect Google Apps Script.`);
  }

  const contactForm = document.getElementById("contact-form");
  if (contactForm){
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("contact-status");
      const payload = {
        formType: "contactForm",
        name: document.getElementById("c-name").value.trim(),
        email: document.getElementById("c-email").value.trim(),
        message: document.getElementById("c-message").value.trim(),
      };
      try{
        await submitToAppsScript(payload);
        status.style.color = "#3f5f54";
        status.textContent = "Thanks for reaching out — we'll get back to you soon.";
        contactForm.reset();
      }catch(err){
        status.style.color = "#B3402E";
        status.textContent = "This form isn't connected yet — see SETUP.md, or call the church office directly.";
      }
    });
  }
}


/* =========================================================
   PAGE INIT — ABOUT (public church calendar)
   ========================================================= */

async function initAboutPage(){
  const list = document.getElementById("calendar-list");
  if (!list) return; // not the about page

  if (!SJCC.isConfigured()){
    showConfigBanner(`The church calendar isn't connected yet — see <a href="SETUP.md">SETUP.md</a> to set up Firebase.`);
    list.innerHTML = `<p class="empty-state">The calendar will appear here once Firebase is connected (see SETUP.md).</p>`;
    return;
  }

  try {
    const events = await SJCC.getCalendarEvents();
    const upcoming = events
      .filter(e => !e.date || new Date(e.date + "T23:59:59") >= new Date())
      .sort((a,b) => new Date(a.date||0) - new Date(b.date||0));

    if (!upcoming.length){
      list.innerHTML = `<p class="empty-state">Nothing on the calendar yet — check back soon.</p>`;
      return;
    }

    list.innerHTML = upcoming.map(e => {
      const d = e.date ? new Date(e.date + "T00:00:00") : null;
      const month = d ? d.toLocaleDateString(undefined, { month: "short" }) : "TBD";
      const day = d ? d.getDate() : "–";
      const metaParts = [];
      if (e.time) metaParts.push(e.time);
      if (e.location) metaParts.push(e.location);
      return `
        <div class="calendar-item">
          <div class="cal-date"><div class="month">${month}</div><div class="day">${day}</div></div>
          <div class="cal-info">
            <div class="title">${esc(e.title || "Untitled event")}</div>
            <div class="meta">${esc(metaParts.join(" · "))}</div>
            ${e.description ? `<div class="meta" style="margin-top:4px;">${esc(e.description)}</div>` : ""}
          </div>
        </div>`;
    }).join("");
  } catch (err){
    console.error(err);
    list.innerHTML = `<p class="empty-state">Couldn't load the calendar right now. Please check back later.</p>`;
  }
}


/* =========================================================
   PAGE INIT — I'M NEW (FAQ accordion + connect card)
   ========================================================= */

function initImNewPage(){
  const form = document.getElementById("connect-form");
  const faqList = document.getElementById("faq-list");
  if (!form && !faqList) return; // not the I'm New page

  if (!APPS_SCRIPT_IS_CONFIGURED){
    showConfigBanner(`The connect card isn't fully wired up yet — see <a href="SETUP.md">SETUP.md</a> to connect Google Apps Script.`);
  }

  document.querySelectorAll(".faq-q").forEach(btn => {
    btn.addEventListener("click", () => {
      const answer = btn.nextElementSibling;
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", isOpen ? "false" : "true");
      answer.style.maxHeight = isOpen ? "0px" : answer.scrollHeight + "px";
    });
  });

  if (form){
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("connect-status");
      const interests = Array.from(form.querySelectorAll('input[name="interest"]:checked')).map(el => el.value);
      const payload = {
        formType: "connectCard",
        name: document.getElementById("cc-name").value.trim(),
        email: document.getElementById("cc-email").value.trim(),
        phone: document.getElementById("cc-phone").value.trim(),
        interests,
        message: document.getElementById("cc-message").value.trim(),
      };
      try{
        await submitToAppsScript(payload);
        status.style.color = "#3f5f54";
        status.textContent = "Thank you! Your connect card has been submitted.";
        form.reset();
      }catch(err){
        status.style.color = "#B3402E";
        status.textContent = "This form isn't connected yet — see SETUP.md, or speak with our staff after service.";
      }
    });
  }
}


/* =========================================================
   PAGE INIT — ADMIN DASHBOARD
   ========================================================= */

function initAdminPage(){
  const shell = document.getElementById("admin-shell");
  if (!shell) return; // not the admin page

  if (!SJCC.isConfigured()){
    document.getElementById("gate-backdrop").style.display = "none";
    document.getElementById("not-configured-backdrop").style.display = "flex";
    return;
  }

  // ---------- Auth gate ----------
  const gateBackdrop = document.getElementById("gate-backdrop");
  const gateForm = document.getElementById("gate-form");
  const gateEmail = document.getElementById("gate-email");
  const gatePassword = document.getElementById("gate-password");
  const gateError = document.getElementById("gate-error");

  SJCC.onAuthChange((user) => {
    if (user){
      gateBackdrop.classList.remove("open");
      shell.style.visibility = "visible";
      const emailTag = document.getElementById("current-user-email");
      if (emailTag) emailTag.textContent = user.email;
      renderAll();
    } else {
      shell.style.visibility = "hidden";
      gateBackdrop.classList.add("open");
    }
  });

  gateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    gateError.textContent = "";
    try { await SJCC.login(gateEmail.value.trim(), gatePassword.value); }
    catch (err){ gateError.textContent = "That email or password isn't right. Try again."; }
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await SJCC.logout();
    window.location.href = "index.html";
  });

  // ---------- Panel navigation ----------
  const navButtons = document.querySelectorAll(".admin-nav-btn[data-panel]");
  const panels = document.querySelectorAll(".panel-group");
  const panelTitle = document.getElementById("panel-title");
  const titles = {
    dashboard: "Dashboard", members: "Members", events: "Baptisms & Milestones",
    calendar: "Church Calendar", forms: "Connect Cards & Contact", settings: "Settings",
  };
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.panel;
      panels.forEach(p => p.style.display = (p.id === `panel-${target}` ? "" : "none"));
      panelTitle.textContent = titles[target];
      document.getElementById("search-results-panel").style.display = "none";
      document.getElementById("global-search").value = "";
    });
  });

  // ---------- Dashboard ----------
  async function renderDashboard(){
    const [members, events] = await Promise.all([SJCC.getMembers(), SJCC.getEvents()]);
    document.getElementById("stat-members").textContent = members.length;
    document.getElementById("stat-baptized").textContent = members.filter(m => m.baptized).length;
    document.getElementById("stat-pending").textContent = members.filter(m => m.wantsBaptism && !m.baptized).length;
    document.getElementById("stat-events").textContent = events.length;

    const recentMembers = [...members].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,5);
    document.getElementById("recent-members-list").innerHTML = recentMembers.length ? `<div class="results-list">${recentMembers.map(m => `
      <div class="result-item">
        <div><div class="who">${esc(m.name)}</div><div class="meta">${esc(m.email || "no email on file")}</div></div>
        <span class="tag ${m.baptized ? "tag-yes" : (m.wantsBaptism ? "tag-pending" : "tag-no")}">
          ${m.baptized ? "Baptized" : (m.wantsBaptism ? "Wants Baptism" : "Not Baptized")}
        </span>
      </div>`).join("")}</div>` : `<p class="empty-state">No members yet — add your first one from the Members tab.</p>`;

    const recentEvents = [...events].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,5);
    document.getElementById("recent-events-list").innerHTML = recentEvents.length ? `<div class="results-list">${recentEvents.map(e => `
      <div class="result-item">
        <div><div class="who">${esc(e.personName)}</div><div class="meta">${fmtDate(e.date)}</div></div>
        <span class="tag tag-pending">${TYPE_LABEL[e.type] || e.type}</span>
      </div>`).join("")}</div>` : `<p class="empty-state">No milestones logged yet.</p>`;
  }

  // ---------- Members ----------
  const memberFormPanel = document.getElementById("member-form-panel");
  const memberForm = document.getElementById("member-form");

  async function renderMembersTable(){
    const members = [...(await SJCC.getMembers())].sort((a,b) => a.name.localeCompare(b.name));
    const wrap = document.getElementById("members-table-wrap");
    if (!members.length){
      wrap.innerHTML = `<p class="empty-state">No members yet. Click "Add Member" to create your first record.</p>`;
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Member Since</th><th>Baptism</th><th></th></tr></thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td><strong>${esc(m.name)}</strong>${m.address ? `<div class="meta" style="color:#5b6b76;font-size:0.8rem;">${esc(m.address)}</div>` : ""}</td>
              <td>${esc(m.email)||"—"}<div style="font-size:0.82rem;color:#5b6b76;">${esc(m.phone)||""}</div></td>
              <td>${fmtDate(m.memberSince)}</td>
              <td>
                ${m.baptized
                  ? `<span class="tag tag-yes">Baptized ${m.baptismDate ? fmtDate(m.baptismDate) : ""}</span>`
                  : (m.wantsBaptism ? `<span class="tag tag-pending">Wants Baptism</span>` : `<span class="tag tag-no">Not Baptized</span>`)}
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn edit-member-btn" data-id="${m.id}" title="Edit" aria-label="Edit ${esc(m.name)}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="icon-btn delete-member-btn" data-id="${m.id}" title="Delete" aria-label="Delete ${esc(m.name)}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                  </button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    wrap.querySelectorAll(".edit-member-btn").forEach(b => b.addEventListener("click", async () => openMemberForm(await SJCC.getMember(b.dataset.id))));
    wrap.querySelectorAll(".delete-member-btn").forEach(b => b.addEventListener("click", async () => {
      const m = await SJCC.getMember(b.dataset.id);
      if (m && confirm(`Delete ${m.name} from your records? This can't be undone.`)){ await SJCC.deleteMember(m.id); renderAll(); }
    }));
  }

  function openMemberForm(member){
    memberFormPanel.style.display = "";
    document.getElementById("member-form-title").textContent = member ? "Edit Member" : "Add Member";
    document.getElementById("m-id").value = member ? member.id : "";
    document.getElementById("m-name").value = member ? member.name || "" : "";
    document.getElementById("m-since").value = member ? member.memberSince || "" : "";
    document.getElementById("m-email").value = member ? member.email || "" : "";
    document.getElementById("m-phone").value = member ? member.phone || "" : "";
    document.getElementById("m-address").value = member ? member.address || "" : "";
    document.getElementById("m-baptism-date").value = member ? member.baptismDate || "" : "";
    document.getElementById("m-baptized").checked = !!(member && member.baptized);
    document.getElementById("m-wants-baptism").checked = !!(member && member.wantsBaptism);
    document.getElementById("m-notes").value = member ? member.notes || "" : "";
    memberFormPanel.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  document.getElementById("add-member-btn").addEventListener("click", () => openMemberForm(null));
  document.getElementById("member-form-cancel").addEventListener("click", () => memberFormPanel.style.display = "none");
  memberForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await SJCC.saveMember({
      id: document.getElementById("m-id").value || null,
      name: document.getElementById("m-name").value.trim(),
      memberSince: document.getElementById("m-since").value,
      email: document.getElementById("m-email").value.trim(),
      phone: document.getElementById("m-phone").value.trim(),
      address: document.getElementById("m-address").value.trim(),
      baptized: document.getElementById("m-baptized").checked,
      baptismDate: document.getElementById("m-baptism-date").value,
      wantsBaptism: document.getElementById("m-wants-baptism").checked,
      notes: document.getElementById("m-notes").value.trim(),
    });
    memberFormPanel.style.display = "none";
    renderAll();
  });

  // ---------- Milestones ----------
  const eventFormPanel = document.getElementById("event-form-panel");
  const eventForm = document.getElementById("event-form");
  let activeEventFilter = "all";
  let allMembersCache = [];

  async function renderEventsTable(){
    let events = [...(await SJCC.getEvents())].sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    if (activeEventFilter !== "all") events = events.filter(e => e.type === activeEventFilter);
    const wrap = document.getElementById("events-table-wrap");
    if (!events.length){
      wrap.innerHTML = `<p class="empty-state">No milestones logged yet. Click "Add Milestone" to record a baptism, wedding, funeral, or dedication.</p>`;
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Type</th><th>Person</th><th>Date</th><th>Notes</th><th></th></tr></thead>
        <tbody>
          ${events.map(e => `
            <tr>
              <td><span class="tag tag-pending">${TYPE_LABEL[e.type] || e.type}</span></td>
              <td><strong>${esc(e.personName)}</strong></td>
              <td>${fmtDate(e.date)}</td>
              <td style="max-width:260px;color:#4c5c67;font-size:0.86rem;">${esc(e.notes)||"—"}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn edit-event-btn" data-id="${e.id}" title="Edit" aria-label="Edit event for ${esc(e.personName)}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="icon-btn delete-event-btn" data-id="${e.id}" title="Delete" aria-label="Delete event for ${esc(e.personName)}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                  </button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    wrap.querySelectorAll(".edit-event-btn").forEach(b => b.addEventListener("click", async () => {
      const evt = (await SJCC.getEvents()).find(e => e.id === b.dataset.id);
      if (evt) openEventForm(evt);
    }));
    wrap.querySelectorAll(".delete-event-btn").forEach(b => b.addEventListener("click", async () => {
      const evt = (await SJCC.getEvents()).find(e => e.id === b.dataset.id);
      if (evt && confirm(`Delete this ${TYPE_LABEL[evt.type]} record for ${evt.personName}?`)){ await SJCC.deleteEvent(evt.id); renderAll(); }
    }));
  }

  document.querySelectorAll(".event-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".event-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeEventFilter = btn.dataset.type;
      renderEventsTable();
    });
  });

  function openEventForm(evt){
    eventFormPanel.style.display = "";
    document.getElementById("event-form-title").textContent = evt ? "Edit Milestone" : "Add Milestone";
    document.getElementById("e-id").value = evt ? evt.id : "";
    document.getElementById("e-type").value = evt ? evt.type : "baptism";
    document.getElementById("e-date").value = evt ? evt.date || "" : "";
    document.getElementById("e-person").value = evt ? evt.personName || "" : "";
    document.getElementById("e-notes").value = evt ? evt.notes || "" : "";
    eventFormPanel.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  document.getElementById("add-event-btn").addEventListener("click", () => openEventForm(null));
  document.getElementById("event-form-cancel").addEventListener("click", () => eventFormPanel.style.display = "none");
  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const personName = document.getElementById("e-person").value.trim();
    const match = allMembersCache.find(m => m.name.toLowerCase() === personName.toLowerCase());
    await SJCC.saveEvent({
      id: document.getElementById("e-id").value || null,
      type: document.getElementById("e-type").value,
      date: document.getElementById("e-date").value,
      personName,
      memberId: match ? match.id : null,
      notes: document.getElementById("e-notes").value.trim(),
    });
    eventFormPanel.style.display = "none";
    renderAll();
  });

  async function refreshMemberDatalist(){
    allMembersCache = await SJCC.getMembers();
    document.getElementById("member-name-options").innerHTML = allMembersCache.map(m => `<option value="${esc(m.name)}">`).join("");
  }

  // ---------- Church calendar ----------
  const calendarFormPanel = document.getElementById("calendar-form-panel");
  const calendarForm = document.getElementById("calendar-form");

  async function renderCalendarTable(){
    const events = [...(await SJCC.getCalendarEvents())].sort((a,b) => new Date(a.date||0) - new Date(b.date||0));
    const wrap = document.getElementById("calendar-table-wrap");
    if (!events.length){
      wrap.innerHTML = `<p class="empty-state">Nothing on the calendar yet. Add your first event.</p>`;
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>Title</th><th>Date</th><th>Time</th><th>Location</th><th></th></tr></thead>
        <tbody>
          ${events.map(e => `
            <tr>
              <td><strong>${esc(e.title)}</strong>${e.description ? `<div class="meta" style="font-size:0.82rem;color:#5b6b76;">${esc(e.description)}</div>` : ""}</td>
              <td>${fmtDate(e.date)}</td>
              <td>${esc(e.time)||"—"}</td>
              <td>${esc(e.location)||"—"}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn edit-cal-btn" data-id="${e.id}" title="Edit" aria-label="Edit ${esc(e.title)}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
                  </button>
                  <button class="icon-btn delete-cal-btn" data-id="${e.id}" title="Delete" aria-label="Delete ${esc(e.title)}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
                  </button>
                </div>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>`;
    wrap.querySelectorAll(".edit-cal-btn").forEach(b => b.addEventListener("click", async () => {
      const evt = (await SJCC.getCalendarEvents()).find(e => e.id === b.dataset.id);
      if (evt) openCalendarForm(evt);
    }));
    wrap.querySelectorAll(".delete-cal-btn").forEach(b => b.addEventListener("click", async () => {
      const evt = (await SJCC.getCalendarEvents()).find(e => e.id === b.dataset.id);
      if (evt && confirm(`Remove "${evt.title}" from the calendar?`)){ await SJCC.deleteCalendarEvent(evt.id); renderAll(); }
    }));
  }

  function openCalendarForm(evt){
    calendarFormPanel.style.display = "";
    document.getElementById("calendar-form-title").textContent = evt ? "Edit Calendar Event" : "Add Calendar Event";
    document.getElementById("cal-id").value = evt ? evt.id : "";
    document.getElementById("cal-title").value = evt ? evt.title || "" : "";
    document.getElementById("cal-date").value = evt ? evt.date || "" : "";
    document.getElementById("cal-time").value = evt ? evt.time || "" : "";
    document.getElementById("cal-location").value = evt ? evt.location || "" : "";
    document.getElementById("cal-description").value = evt ? evt.description || "" : "";
    calendarFormPanel.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  document.getElementById("add-calendar-btn").addEventListener("click", () => openCalendarForm(null));
  document.getElementById("calendar-form-cancel").addEventListener("click", () => calendarFormPanel.style.display = "none");
  calendarForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await SJCC.saveCalendarEvent({
      id: document.getElementById("cal-id").value || null,
      title: document.getElementById("cal-title").value.trim(),
      date: document.getElementById("cal-date").value,
      time: document.getElementById("cal-time").value.trim(),
      location: document.getElementById("cal-location").value.trim(),
      description: document.getElementById("cal-description").value.trim(),
    });
    calendarFormPanel.style.display = "none";
    renderAll();
  });

  // ---------- Forms panel (Sheet link) ----------
  function renderFormsPanel(){
    const wrap = document.getElementById("sheet-link-wrap");
    wrap.innerHTML = CHURCH_SHEET_IS_CONFIGURED
      ? `<a href="${CHURCH_SHEET_URL}" target="_blank" rel="noopener" class="btn btn-primary">Open Google Sheet</a>`
      : `<p class="empty-state" style="text-align:left;padding:0;">Add your Sheet's URL to the config section at the top of app.js (CHURCH_SHEET_URL) to get a direct link here — see SETUP.md.</p>`;
  }

  // ---------- Global search (cross-reference) ----------
  const searchInput = document.getElementById("global-search");
  const searchPanel = document.getElementById("search-results-panel");
  const searchList = document.getElementById("search-results-list");

  searchInput.addEventListener("input", async () => {
    const q = searchInput.value.trim();
    if (!q){ searchPanel.style.display = "none"; return; }
    const { members, events } = await SJCC.search(q);
    searchPanel.style.display = "";

    if (!members.length && !events.length){
      searchList.innerHTML = `<p class="empty-state">No member or event records match "${esc(q)}". They may not be in the system yet.</p>`;
      return;
    }
    let html = "";
    if (members.length){
      html += members.map(m => `
        <div class="result-item">
          <div>
            <div class="who">${esc(m.name)} <span class="tag tag-yes" style="margin-left:6px;">Member</span></div>
            <div class="meta">${esc(m.email)||"no email"} · ${esc(m.phone)||"no phone"}</div>
          </div>
          <span class="tag ${m.baptized ? "tag-yes" : (m.wantsBaptism ? "tag-pending" : "tag-no")}">
            ${m.baptized ? "Baptized" : (m.wantsBaptism ? "Wants Baptism" : "Not Baptized")}
          </span>
        </div>`).join("");
    }
    if (events.length){
      html += events.map(e => `
        <div class="result-item">
          <div>
            <div class="who">${esc(e.personName)}</div>
            <div class="meta">${fmtDate(e.date)}${e.notes ? " · " + esc(e.notes) : ""}</div>
          </div>
          <span class="tag tag-pending">${TYPE_LABEL[e.type] || e.type} record</span>
        </div>`).join("");
    }
    if (!members.length){
      html = `<p class="empty-state" style="padding:8px 0 16px;">No existing member found named "${esc(q)}" — they may be new.</p>` + html;
    }
    searchList.innerHTML = html;
  });

  // ---------- Init ----------
  async function renderAll(){
    await Promise.all([renderDashboard(), renderMembersTable(), renderEventsTable(), renderCalendarTable(), refreshMemberDatalist()]);
    renderFormsPanel();
  }
}


/* =========================================================
   PAGE INIT — LIGHT MOTION (scroll reveal + hero parallax)
   Both respect prefers-reduced-motion by skipping straight
   to the "settled" state — no animation, content still shows.
   ========================================================= */

function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function initScrollReveal(){
  const els = document.querySelectorAll(".reveal, .reveal-fade");
  if (!els.length) return;

  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined"){
    els.forEach(el => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });

  els.forEach(el => observer.observe(el));
}

function initHeroParallax(){
  const media = document.getElementById("hero-media");
  if (!media || prefersReducedMotion()) return;

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const offset = Math.min(window.scrollY * 0.22, 90);
      media.style.transform = `translateY(${offset}px)`;
      ticking = false;
    });
  }, { passive: true });
}


/* =========================================================
   BOOT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initHomePage();
  initAboutPage();
  initImNewPage();
  initAdminPage();
  initScrollReveal();
  initHeroParallax();
});
