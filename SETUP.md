# Setup Guide — St. John's Christian Church Website

This walks you through the two accounts the site needs: **Firebase** (members, milestones,
church calendar, and staff login) and **Google Apps Script** (Connect Card and Contact form
submissions, sent to a Google Sheet). Both are free for a church this size. Budget about 30
minutes total, and do them in order.

---

## Part 1: Firebase (members, calendar, and staff login)

### Step 1 — Create the project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with a
   Google account the church controls (not a personal one, if you can help it).
2. Click **Add project**. Name it something like `st-johns-groton`. You can decline Google
   Analytics — it isn't needed here.
3. Click **Create project** and wait for it to finish.

### Step 2 — Register a Web App
1. On the project's home screen, click the **`</>`** (web) icon to add a web app.
2. Give it a nickname like "SJCC Website" and click **Register app**. You don't need Firebase
   Hosting for this step.
3. Firebase will show a code block with a `firebaseConfig` object — something like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "st-johns-groton.firebaseapp.com",
     projectId: "st-johns-groton",
     storageBucket: "st-johns-groton.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
4. Copy those six values into **the config section at the top of `app.js`** in this project, replacing every
   `"REPLACE_ME"`. Save the file.

### Step 3 — Turn on Firestore (the database)
1. In the left sidebar, click **Build ▸ Firestore Database**.
2. Click **Create database**. Choose **Start in production mode**, pick a location close to
   Connecticut (e.g. `us-east4` or `nam5`), and click **Enable**.
3. Once it's created, click the **Rules** tab and replace the contents with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function isApprovedStaff() {
         return request.auth != null && request.auth.token.email in [
           'REPLACE_ME@example.com'
         ];
       }
       match /calendarEvents/{doc} {
         allow read: if true;
         allow write: if isApprovedStaff();
       }
       match /members/{doc} {
         allow read, write: if isApprovedStaff();
       }
       match /milestones/{doc} {
         allow read, write: if isApprovedStaff();
       }
     }
   }
   ```
   **Important:** the email(s) inside that `in [...]` list must exactly match the
   `ADMIN_EMAILS` list at the top of `app.js` — add one line per staff member, in quotes,
   separated by commas. This list (not the one in `app.js`) is what actually protects your
   data — the one in `app.js` just gives people a friendly error message.
4. Click **Publish**. This makes the public calendar visible to any visitor, while member and
   milestone records can only be read or changed by someone on your approved-staff list.

### Step 4 — Turn on staff login (Google Sign-In)
The dashboard uses **"Sign in with Google"** rather than a separate church password — one less
password for staff to remember, and Google handles the security of the login itself.
1. In the left sidebar, click **Build ▸ Authentication**, then **Get started**.
2. Under **Sign-in method**, click **Google**, toggle it **on**, choose a support email
   (any email on the account works), and click **Save**.
3. Click **Settings ▸ Authorized domains** (still within Authentication) and make sure the
   domain you're hosting the site on is listed (e.g. `yourchurch.netlify.app` or your own
   domain). `localhost` is included by default for testing.
4. Open `app.js`, find the `ADMIN_EMAILS` list near the top, and replace the placeholder with
   the real Google account email of every staff member who should have access — one per line,
   in quotes, separated by commas:
   ```js
   const ADMIN_EMAILS = [
     "pastor@gmail.com",
     "officeadmin@gmail.com",
   ];
   ```
5. Make sure that same list of emails is also pasted into the Firestore rules from Step 3
   (the `isApprovedStaff()` function) — both lists need to match.
6. To remove someone's access later, delete their email from both lists and re-publish the
   Firestore rules.

Firebase is now fully connected. Open `admin.html`, click **Sign in with Google**, and — using
one of the approved emails — you should land on the dashboard. Signing in with any other Google
account will show a polite "not approved" message and won't get in.

---

## Part 2: Google Apps Script (Connect Card + Contact form → Google Sheet)

### Step 1 — Create the Sheet
1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
   Name it something like "SJCC Website Submissions".

### Step 2 — Add the script
1. In the Sheet, click **Extensions ▸ Apps Script**.
2. Delete any starter code in `Code.gs`.
3. Open **`AppsScript-Code.gs.txt`** from this project, copy its entire contents, and paste
   them into `Code.gs`.
4. Click the **Save** icon (or `Ctrl+S` / `Cmd+S`).

### Step 3 — Deploy it as a web app
1. Click **Deploy ▸ New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**. The first time, Google will ask you to authorize the script — click
   through the consent screens (you'll see an "unverified app" warning since this is your own
   private script; click **Advanced ▸ Go to (project name)** to proceed).
5. Copy the **Web app URL** it gives you.

### Step 4 — Connect it to the site
1. Open **the config section at the top of `app.js`** in this project.
2. Paste the Web app URL as the value of `APPS_SCRIPT_URL`.
3. Optionally, paste the Sheet's own URL (from your browser's address bar while viewing it) as
   `CHURCH_SHEET_URL` — this adds a quick link to the Sheet from the admin dashboard.
4. Save the file.

Submissions from the Connect Card (I'm New page) and the Contact form (Home page) will now
appear as new rows in two tabs of your Sheet: **Connect Cards** and **Contact Messages**. Both
tabs are created automatically the first time each form is submitted.

---

## Part 3: Payments (already set up separately)

The Giving page uses a PayPal donate button. To make it live, open **`giving.html`**, find the
`YOUR-PAYPAL-BUSINESS-EMAIL@example.com` placeholder, and replace it with your church's real
PayPal business email (create one free at [paypal.com/business](https://www.paypal.com/business)
if you don't have one yet).

---

## Part 3.5: The Verse of the Day

The homepage now fetches its daily verse text live from [bible-api.com](https://bible-api.com) —
a free, no-key API. Nothing to set up here; it works out of the box. A few things worth knowing:

- Each day of the year is pre-mapped to a reference (e.g. "John 3:16") in the `VERSES` list near
  the top of `app.js`. The site asks bible-api.com for that day's reference and displays whatever
  text comes back.
- **If bible-api.com is ever unreachable** (down, blocked, no internet), the site automatically
  falls back to the KJV text already stored alongside that reference in `app.js` — visitors will
  never see a broken or blank verse.
- **Caching:** once a verse is fetched, it's saved in the visitor's browser for the rest of that
  day, so repeat page loads don't re-fetch it.
- **Changing translation:** find `const VOTD_TRANSLATION = "kjv";` near the top of `app.js` and
  change it to another code bible-api.com supports (e.g. `"web"` for the World English Bible) —
  see bible-api.com's site for the full list of available translations.
- **Changing which verses appear:** edit the `VERSES` list in `app.js` — add, remove, or reorder
  entries (each just needs a `ref`; the `text` field only matters as the offline fallback).

---

## Part 3.6: The homepage hero video

The homepage is built for a full-bleed video of an aerial/drone view of Groton — harbor, coastline,
or the church itself all work well. To add it:

1. Get footage. A few realistic options:
   - Hire a local drone operator for an afternoon (search "drone videographer Groton CT" or
     "drone videographer New London County") — often $150–$400 for a short flight.
   - Check if the Town of Groton or the CT Office of Tourism has existing aerial footage they'll
     license for community/nonprofit use.
   - License a generic New England coastline aerial clip from a stock site like
     [Pexels Videos](https://www.pexels.com/videos/) or [Coverr](https://coverr.co) if you'd
     rather not wait on original footage — just double-check the license allows commercial/church
     website use (most free-tier clips do, but always read the specific terms).
2. Export or trim it to a short (10–25 second), silent, looping clip — no audio is needed since
   the video plays muted.
3. Save it as `hero-video.mp4` inside the `assets` folder, replacing nothing (there's no
   placeholder file — you're adding a new one).
4. Optional: grab one still frame from the video, save it as `hero-poster.jpg` in `assets` — it
   shows briefly while the video loads.

Until you add the video, the hero displays its purple gradient background on its own, so the
site never looks broken in the meantime.

---

## Part 4: Publishing the site

This is a static site (plain HTML/CSS/JS) — it doesn't need a special server. Two easy, free
options:

- **[Netlify Drop](https://app.netlify.com/drop)** — drag this whole folder onto the page and
  it's live in seconds, with a free `.netlify.app` address you can later point your own domain
  (e.g. `stjohnsgroton.org`) at.
- **GitHub Pages** — push this folder to a GitHub repository and enable Pages in the repo
  settings.

Either way, once Firebase and Apps Script are configured as above, everything will work exactly
the same on the live site as it does on your computer.

---

## A note on security

- Firestore rules above mean member and milestone data can only be read or written by a signed-in
  staff account — not by the public.
- Only add staff members you trust with this data as Firebase Authentication users.
- The Google Sheet is only as private as your Google Drive sharing settings — don't share it
  publicly, and consider restricting it to specific church staff.
