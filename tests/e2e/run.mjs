// Browser end-to-end test: drives the real React UI against a running server on a FRESH database
// that contains only the admin account (admin / adminpass1). See "Testing" in the README.
//   REFERRAL_DB=<path to that db> [BASE=http://localhost:8000] [CHROME_PATH=...] node run.mjs
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE || 'http://localhost:8000'
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), 'screenshots')
fs.mkdirSync(OUT, { recursive: true })
const results = []
const consoleErrors = []

const ok = (name, cond, extra = '') => {
  results.push([cond ? 'PASS' : 'FAIL', name, extra])
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
})

async function newPage(w = 1280, h = 900, fresh = false) {
  const page = await (fresh ? (await browser.createBrowserContext()).newPage() : browser.newPage())
  await page.setViewport({ width: w, height: h })
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + e.message))
  if (process.env.TRACE) page.on('response', async (r) => { if (r.url().includes('/api/') && r.request().method() !== 'GET') console.log('   API', r.request().method(), r.url().replace(BASE, ''), r.status(), (await r.text().catch(() => '')).slice(0, 160)) })
  return page
}
const text = (page) => page.evaluate(() => document.body.innerText)
const goto = async (page, p) => { await page.goto(BASE + p, { waitUntil: 'networkidle0' }) }
const idFor = async (page, label) => { await page.waitForFunction((label) => [...document.querySelectorAll('label')].some((x) => x.textContent.trim().replace(/\s*\*$/, '').startsWith(label)), { timeout: 5000 }, label).catch(() => {}); return idFor0(page, label) }
const idFor0 = (page, label) => page.evaluate((label) => {
  const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim().replace(/\s*\*$/, '').startsWith(label))
  return l ? l.htmlFor : null
}, label)
async function fill(page, label, value) {
  const id = await idFor(page, label)
  if (!id) throw new Error('no field ' + label)
  const sel = '#' + id.replace(/:/g, '\\:')
  await page.click(sel, { clickCount: 3 })
  await page.type(sel, value)
}
async function fillDate(page, label, value) { // date inputs: set via native setter
  const id = await idFor(page, label)
  await page.$eval('#' + id.replace(/:/g, '\\:'), (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}
async function choose(page, label, value) {
  const id = await idFor(page, label)
  await page.select('#' + id.replace(/:/g, '\\:'), value)
}
async function clickText(page, txt, scope = 'button') {
  const h = await page.evaluateHandle((txt, scope) =>
    [...document.querySelectorAll(scope)].find((b) => b.textContent.trim().includes(txt) && !b.disabled), txt, scope)
  if (!h.asElement()) throw new Error('no ' + scope + ' with text: ' + txt)
  await h.asElement().click()
}
async function clickDlg(page, txt) {
  await page.evaluate((txt) => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === txt).click(), txt)
}
const settle = () => sleep(700)
async function login(page, u, p) {
  await goto(page, '/')
  await fill(page, 'Username', u)
  await fill(page, 'Password', p)
  await clickText(page, 'Sign in')
  await page.waitForFunction(() => /Good (morning|afternoon|evening)/.test(document.body.innerText) || document.body.innerText.includes('Invalid'), { timeout: 10000 })
  await sleep(900)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true })

try {
  // ---------- login ----------
  let page = await newPage()
  await goto(page, '/')
  ok('login page shown when signed out', (await text(page)).includes('Sign in'))
  await shot(page, '01-login')
  await fill(page, 'Username', 'admin'); await fill(page, 'Password', 'wrongwrong')
  await clickText(page, 'Sign in'); await settle()
  ok('wrong password shows error', (await text(page)).includes('Invalid username or password'))
  await page.reload({ waitUntil: 'networkidle0' })
  await login(page, 'admin', 'adminpass1')
  ok('admin signs in -> dashboard', /Good (morning|afternoon|evening), admin/.test(await text(page)))

  // ---------- empty states ----------
  let t = await text(page)
  ok('dashboard empty state, zero stats (no fake data)', t.includes('No referrals yet') && /Total referrals\s*\n?\s*0/.test(t), t.slice(0, 300))
  await shot(page, '02-dashboard-empty')

  // ---------- facilities (admin) ----------
  await goto(page, '/facilities')
  ok('facilities empty state', (await text(page)).includes('No facilities yet'))

  // New referral must open the REFERRAL FORM even when no facility exists, and let the user add
  // one in a pop-up without losing what they already typed.
  await goto(page, '/referrals/new')
  t = await text(page)
  ok('New referral opens the referral form (not Add Facility) with zero facilities',
    page.url().endsWith('/referrals/new') && t.includes('Create referral') && t.includes('Patient information') && t.includes('Add a new facility'), t.slice(0, 300))
  await fill(page, 'Reason for referral', 'Typed before adding facility')
  await fill(page, 'Full name', 'Draft Patient')
  await clickText(page, 'Add a new facility'); await sleep(300)
  await fill(page, 'Facility name', 'City General Hospital')
  await fill(page, 'Location', 'Downtown')
  await fill(page, 'Phone', '0712345678')
  await clickDlg(page, 'Add facility'); await settle()
  const ids = [await idFor(page, 'Receiving facility'), await idFor(page, 'Reason for referral'), await idFor(page, 'Full name')]
  const kept = await page.evaluate((a, b, c) => ({
    sel: document.getElementById(a).selectedOptions[0].textContent,
    reason: document.getElementById(b).value, name: document.getElementById(c).value }), ...ids)
  ok('inline facility saved, auto-selected, entered data retained',
    kept.sel.includes('City General Hospital') && kept.reason === 'Typed before adding facility' && kept.name === 'Draft Patient', JSON.stringify(kept))

  await goto(page, '/facilities')
  ok('inline-added facility is listed on Facilities page', (await text(page)).includes('City General Hospital'))
  await clickText(page, 'Add facility'); await sleep(300)
  await fill(page, 'Facility name', 'Northgate Hospital')
  await clickDlg(page, 'Add facility'); await settle()
  ok('facility created on Facilities page', (await text(page)).includes('Northgate Hospital'))
  await clickText(page, 'Add facility'); await sleep(300)
  await fill(page, 'Facility name', 'City General Hospital')
  await clickDlg(page, 'Add facility'); await settle()
  ok('duplicate facility rejected with message', (await text(page)).includes('already exists'))
  await page.keyboard.press('Escape'); await sleep(300)

  // ---------- staff ----------
  await goto(page, '/staff')
  await clickText(page, 'Add staff'); await sleep(300)
  await fill(page, 'Username', 'nurse1'); await fill(page, 'Temporary password', 'nursepass1')
  await clickDlg(page, 'Create account'); await settle()
  await clickText(page, 'Add staff'); await sleep(300)
  await fill(page, 'Username', 'viewer1'); await fill(page, 'Temporary password', 'viewpass12')
  await choose(page, 'Role', 'VIEWER')
  await clickDlg(page, 'Create account'); await settle()
  t = await text(page)
  ok('staff accounts created', t.includes('nurse1') && t.includes('viewer1'))
  await clickText(page, 'Sign out'); await settle()
  ok('sign out returns to login', (await text(page)).includes('Sign in'))

  // ---------- health worker flow ----------
  await login(page, 'nurse1', 'nursepass1')
  t = await text(page)
  ok('worker sees New referral, not Staff', t.includes('New referral') && !t.includes('User management'))
  ok('navigation has all required sections',
    ['Dashboard', 'Referrals', 'Patients', 'Facilities', 'Follow-up schedule', 'Notifications', 'Reports & analytics'].every((x) => t.includes(x)) && ['main', 'follow-up', 'management'].every((x) => t.toLowerCase().includes(x)), t.slice(0, 400))
  await goto(page, '/staff')
  ok('worker redirected away from /staff', !(await text(page)).includes('Add staff'))

  await goto(page, '/referrals/new')
  await fill(page, 'Full name', 'Jane Doe')
  await fillDate(page, 'Date of birth', '1990-05-01')
  await fill(page, 'Phone', '0700111222')
  await fill(page, 'Address', '12 Market Road')
  ok('form shows referring facility default, patient ID note, responsible worker',
    (await page.evaluate((id) => document.getElementById(id).value, await idFor(page, 'Referring facility'))) === 'Community Health Centre'
    && (await text(page)).includes('Unique ID in the form PT-00001') && (await text(page)).includes('Responsible health worker'))
  await choose(page, 'Receiving facility', '1')
  await fill(page, 'Reason for referral', 'Suspected fracture needing X-ray')
  await fill(page, 'Notes', 'Fell from bicycle; pain on weight bearing')
  await choose(page, 'Urgency', 'URGENT')
  await choose(page, 'Responsible health worker', '1') // assign to the admin account
  await shot(page, '03-new-referral')
  await clickText(page, 'Create referral'); await settle()
  t = await text(page)
  ok('referral created -> detail page', t.includes('Referral #1') && t.includes('Pending') && t.includes('Jane Doe'), t.slice(0, 200))
  ok('history shows creation', t.includes('Referral created'))
  ok('detail shows patient ID, address, notes, referring facility, responsible worker',
    t.includes('PT-00001') && t.includes('12 Market Road') && t.includes('Fell from bicycle') && t.includes('Community Health Centre')
    && /Responsible worker\s*\n?\s*admin/.test(t), t.slice(0, 700))
  await shot(page, '04-detail-pending')

  // bad input surfaces server validation
  await goto(page, '/referrals/new')
  await fill(page, 'Full name', 'Bad Phone'); await fillDate(page, 'Date of birth', '1990-01-01')
  await fill(page, 'Phone', 'abc'); await choose(page, 'Receiving facility', '1')
  await fill(page, 'Reason for referral', 'Chest pain')
  await clickText(page, 'Create referral'); await settle()
  ok('server validation error shown (phone)', (await text(page)).includes('Phone must be'))

  // second referral for existing patient
  await goto(page, '/referrals/new')
  await clickText(page, 'Existing patient'); await sleep(200)
  await page.type('input[aria-label="Search patients"]', 'Jane'); await sleep(900)
  await clickText(page, 'Jane Doe'); await sleep(200)
  await fill(page, 'Reason for referral', 'Follow-up imaging')
  // the health worker (not an admin) adds a missing facility without leaving the form
  await clickText(page, 'Add a new facility'); await sleep(300)
  await fill(page, 'Facility name', 'Eastside Clinic')
  await clickDlg(page, 'Add facility'); await settle()
  ok('worker adds a facility inline; reason text retained',
    (await page.evaluate((id) => document.getElementById(id).value, await idFor(page, 'Reason for referral'))) === 'Follow-up imaging')
  await clickText(page, 'Create referral'); await settle()
  t = await text(page)
  ok('referral for existing patient', t.includes('Referral #2') && t.includes('Eastside Clinic') && t.includes('PT-00001'), t.slice(0, 600))

  // ---------- patients (separate from facilities and referrals) ----------
  await goto(page, '/patients')
  t = await text(page)
  ok('patients page lists patient with ID and referral count', t.includes('PT-00001') && t.includes('Jane Doe') && t.includes('1 patient(s)'), t.slice(0, 300))
  await page.type('input[aria-label="Search patients"]', 'PT-00001'); await sleep(900)
  ok('search by patient ID', (await text(page)).includes('1 patient(s)'))
  await page.$eval('input[aria-label="Search patients"]', (el) => { el.value = '' })
  await page.click('input[aria-label="Search patients"]', { clickCount: 3 }); await page.type('input[aria-label="Search patients"]', 'zzznobody'); await sleep(900)
  ok('patient search empty state', (await text(page)).includes('No patients match your search'))
  await goto(page, '/patients')
  await clickText(page, 'Register patient'); await sleep(300)
  await fill(page, 'Full name', 'Peter Kamau'); await fillDate(page, 'Date of birth', '1982-02-02')
  await fill(page, 'Phone', '0722333444'); await fill(page, 'Address', 'Hilltop Estate')
  await clickDlg(page, 'Register patient'); await settle()
  t = await text(page)
  ok('patient registered -> detail page with new ID', t.includes('Peter Kamau') && t.includes('PT-00002') && t.includes('Hilltop Estate') && t.includes('No referrals for this patient'), t.slice(0, 300))
  await clickText(page, 'New referral for this patient', 'a'); await settle()
  t = await text(page)
  ok('New referral from patient page pre-selects that patient', t.includes('Peter Kamau') && t.includes('PT-00002') && t.includes('Create referral'))
  await shot(page, '03b-patient-preselected')
  await goto(page, '/patients/1')
  ok('patient 1 detail lists referral history', (await text(page)).includes('Referral history') && (await text(page)).includes('Eastside Clinic'))

  // status workflow on referral 1
  await goto(page, '/referrals/1')
  await clickText(page, 'Confirm attendance'); await sleep(300)
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Confirm attendance').click())
  await settle()
  t = await text(page)
  ok('attendance confirmed -> Attended', t.includes('Attended') && t.includes('Mark completed'))
  await clickText(page, 'Schedule', 'button'); await sleep(300)
  const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
  await fillDate(page, 'Follow-up date', future)
  await fill(page, 'Notes', 'Review cast')
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Schedule').click())
  await settle()
  t = await text(page)
  ok('follow-up scheduled and displayed', t.includes('Review cast'))
  await clickText(page, 'Mark completed'); await sleep(300)
  await fill(page, 'Outcome', 'Treated and discharged')
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Mark completed').click())
  await settle()
  t = await text(page)
  ok('completed with outcome + 3-step history', t.includes('Completed') && t.includes('Treated and discharged') && t.includes('Referral created'))
  await shot(page, '05-detail-completed')

  // list: search + filter
  await goto(page, '/referrals')
  t = await text(page)
  ok('referral table lists both', t.includes('Jane Doe') && t.includes('2 referral(s)'))
  await page.select('select[aria-label="Filter by status"]', 'COMPLETED'); await settle()
  ok('status filter', (await text(page)).includes('1 referral(s)'))
  await page.select('select[aria-label="Filter by status"]', 'ZZZ').catch(() => {})
  await page.select('select[aria-label="Filter by status"]', ''); await settle()
  await page.type('input[aria-label="Search referrals"]', 'imaging'); await sleep(900)
  ok('text search', (await text(page)).includes('1 referral(s)'))
  await page.$eval('input[aria-label="Search referrals"]', (el) => { el.focus() })
  await page.type('input[aria-label="Search referrals"]', ' nomatchxyz'); await sleep(900)
  ok('no-match empty state', (await text(page)).includes('No referrals match your filters'))
  await goto(page, '/referrals'); await shot(page, '06-referrals')

  // follow-ups page
  await goto(page, '/follow-ups')
  ok('follow-ups page shows scheduled item', (await text(page)).includes('Review cast'))
  await shot(page, '07-followups')
  await clickText(page, 'Mark done'); await settle()
  ok('follow-up marked done', (await text(page)).includes('No upcoming follow-ups'))

  // notifications: make referral 2 overdue directly in DB is done outside; here just generate (none yet)
  await goto(page, '/notifications')
  await clickText(page, 'Check for new alerts'); await settle()
  ok('notifications page works (nothing overdue yet)', (await text(page)).includes('No alerts'))

  // dashboard + reports with real data
  await goto(page, '/')
  t = await text(page)
  ok('dashboard stats from DB', /Total referrals\s*\n?\s*2/.test(t), t.slice(0, 400))
  ok('dashboard shows total, pending, completed and follow-up statistics',
    /Pending referrals\s*\n?\s*1/.test(t) && /Completed referrals\s*\n?\s*1/.test(t) && /Requiring follow-up\s*\n?\s*0/.test(t), t.slice(0, 600))
  await sleep(600)
  ok('dashboard charts render (trend, status donut, facility bars)', (await page.$$('.recharts-wrapper')).length >= 3)
  ok('dashboard insights come from records', t.includes('Insights and recommendations') && /receives the most referrals/.test(t) && /% of referrals completed/.test(t))
  ok('dashboard recent referrals table has required columns', ['patient', 'referral id', 'receiving facility', 'referral date', 'status', 'follow-up'].every((x) => t.toLowerCase().includes(x)))
  await shot(page, '08-dashboard')
  await clickText(page, 'New referral', 'a'); await settle()
  ok('dashboard New referral button opens the referral form', (await page.evaluate(() => location.pathname)) === '/referrals/new' && (await text(page)).includes('Create referral'))
  await goto(page, '/')
  await page.click('button[aria-label="Collapse sidebar"]'); await sleep(300)
  ok('sidebar collapses to icons with tooltips', (await page.$$('[role=tooltip]')).length >= 5)
  await page.reload({ waitUntil: 'networkidle0' })
  ok('sidebar collapsed state is remembered', (await page.$$('[role=tooltip]')).length >= 5)
  await page.click('button[aria-label="Expand sidebar"]'); await sleep(300)
  await goto(page, '/reports'); await sleep(800)
  t = await text(page)
  ok('reports page has charts', (await page.$$('svg.recharts-surface')).length >= 3 && t.includes('Referrals by status'))
  await shot(page, '09-reports')

  // notifications w/ overdue data (DB tweaked by driver script between phases)
  {
    execFileSync('python', ['-c', "import sqlite3,sys,datetime as d;c=sqlite3.connect(sys.argv[1]);c.execute('update referrals set expected_by=? where id=2',((d.date.today()-d.timedelta(5)).isoformat(),));c.commit()", process.env.REFERRAL_DB])
    await goto(page, '/notifications')
    await clickText(page, 'Check for new alerts'); await settle()
    t = await text(page)
    ok('overdue alert generated + listed', t.includes('Attendance not confirmed') && t.includes('has not been confirmed as attended') && t.includes('Open referral #2'), t.slice(0, 400))
    ok('notifications cover overdue follow-ups and pending referrals', t.includes('Overdue follow-ups') && t.includes('Pending referrals') && t.includes('Upcoming follow-ups'))
    await shot(page, '10-notifications')
    await goto(page, '/')
    t = await text(page)
    ok('dashboard shows overdue', /1 outstanding/.test(t) && t.includes('Overdue referrals') && t.includes('awaiting confirmed attendance'))
    await goto(page, '/referrals/2')
    ok('detail flags overdue', (await text(page)).includes('Overdue'))
  }

  // ---------- viewer permissions ----------
  await clickText(page, 'Sign out'); await settle()
  await login(page, 'viewer1', 'viewpass12')
  t = await text(page)
  ok('viewer has no New referral / Notifications / Staff', !t.includes('New referral') && !t.includes('Notifications') && !t.includes('User management'))
  await goto(page, '/referrals/2')
  t = await text(page)
  ok('viewer sees details but no action buttons', t.includes('Referral #2') && !t.includes('Confirm attendance') && !t.includes('Cancel referral'))
  await goto(page, '/facilities')
  ok('viewer cannot add facilities', !(await text(page)).includes('Add facility'))
  await goto(page, '/patients')
  ok('viewer can search patients but not register', (await text(page)).includes('PT-00001') && !(await text(page)).includes('Register patient'))
  await goto(page, '/referrals/new')
  ok('viewer redirected from /referrals/new', !(await text(page)).includes('Create referral'))

  // ---------- mobile ----------
  const m = await newPage(390, 800, true)
  await login(m, 'admin', 'adminpass1')
  await goto(m, '/')
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  ok('mobile: no horizontal page overflow (dashboard)', !overflow)
  await shot(m, '11-mobile-dashboard')
  await m.click('button[aria-label="Open menu"]'); await sleep(300)
  ok('mobile: drawer opens with nav', (await text(m)).includes('Follow-up schedule'))
  await shot(m, '12-mobile-menu')
  await m.keyboard.press('Escape')
  await goto(m, '/referrals')
  ok('mobile: no horizontal page overflow (table)', !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)))
  await shot(m, '13-mobile-referrals')
  const tab = await newPage(820, 1100, true)
  await login(tab, 'admin', 'adminpass1')
  await goto(tab, '/'); await shot(tab, '14-tablet-dashboard')
} catch (e) {
  ok('script completed without exception', false, e.stack)
}
await browser.close()
const fails = results.filter((r) => r[0] === 'FAIL').length
const realErrors = consoleErrors.filter((e) => !/Failed to load resource.*(401|422|409)/.test(e))
console.log(`\n${results.length - fails}/${results.length} checks passed`)
console.log('console errors:', realErrors.length ? realErrors : 'none (401/409/422 network noise from deliberate negative tests ignored)')
process.exit(fails ? 1 : 0)
