import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BarChart3, Bell, BellRing, Building2, CalendarClock, Check, ClipboardList, HeartPulse, Lock,
  LogIn, ShieldCheck, TrendingUp, UserPlus, Users,
} from 'lucide-react'
import { Card, DeltaPill, Spinner, StatCard, StatusBadge, UrgencyBadge } from '../components/ui.jsx'
import { ThemeToggle } from '../theme.jsx'

// recharts is large; the preview charts load after the first paint
const charts = import('../components/DashboardCharts.jsx')
const ActivityBars = lazy(() => charts.then((m) => ({ default: m.ActivityBars })))
const StatusRadial = lazy(() => charts.then((m) => ({ default: m.StatusRadial })))

// Illustrative numbers only, shown in the product preview. Not read from the database.
const SAMPLE_MONTHLY = [
  { label: 'Jun', referred: 9, completed: 5 },
  { label: 'Jul', referred: 12, completed: 8 },
  { label: 'Aug', referred: 8, completed: 6 },
  { label: 'Sep', referred: 14, completed: 9 },
  { label: 'Oct', referred: 11, completed: 8 },
  { label: 'Nov', referred: 15, completed: 10 },
]
const SAMPLE_STATUS = { COMPLETED: 16, ATTENDED: 6, PENDING: 4, NO_SHOW: 3, CANCELLED: 1 }
const SAMPLE_OVERDUE = [
  { patient: 'Amina Y.', facility: 'City General Hospital', urgency: 'EMERGENCY', status: 'NO_SHOW', days: 12 },
  { patient: 'Kwame M.', facility: 'Unity Cardiac Institute', urgency: 'URGENT', status: 'PENDING', days: 6 },
  { patient: 'Grace O.', facility: 'Eastgate Eye Centre', urgency: 'ROUTINE', status: 'PENDING', days: 3 },
]

const NAV = [['Features', '#features'], ['How it works', '#how'], ['Roles', '#roles']]

const FEATURES = [
  { icon: ClipboardList, title: 'Referral tracking', text: 'Every referral moves through a clear workflow: Pending, Attended, Completed, with No-show and Cancelled handled properly. Each change is recorded with who made it and when.' },
  { icon: BellRing, title: 'Overdue alerts', text: 'Referrals that pass their expected date and follow-ups that fall due are flagged automatically, so a patient who did not attend is noticed the same day.' },
  { icon: CalendarClock, title: 'Follow-up scheduling', text: 'Schedule check-ins from any referral, see everything due today or this week in one schedule, and mark each one done.' },
  { icon: Users, title: 'Patient records', text: 'Register patients once with an automatic unique ID, search by name, phone or ID, and see a patient’s full referral history on one page.' },
  { icon: Building2, title: 'Facility directory', text: 'Keep the hospitals and specialist units you refer to in one list, and see which facilities receive the most patients.' },
  { icon: BarChart3, title: 'Reports and insights', text: 'A live dashboard with completion rate, trends and recommendations, plus printable reports, all calculated from your own records.' },
]

const STEPS = [
  { icon: UserPlus, title: 'Register and refer', text: 'Add the patient, choose the receiving facility, the urgency and the reason.' },
  { icon: Check, title: 'Confirm attendance', text: 'Record when the patient actually attends. Unconfirmed referrals stay visible.' },
  { icon: CalendarClock, title: 'Schedule follow-up', text: 'Set check-ins for recovery and treatment progress, with reminders when due.' },
  { icon: TrendingUp, title: 'Review the results', text: 'Watch completion rates, overdue cases and facility activity on the dashboard.' },
]

const ROLES = [
  { name: 'Administrator', text: 'Runs the system.', items: ['Everything health workers can do', 'Create and manage staff accounts', 'Edit or delete facilities'] },
  { name: 'Health worker', text: 'Day-to-day referral work.', items: ['Register patients and create referrals', 'Confirm attendance and complete referrals', 'Schedule follow-ups and view reports'], featured: true },
  { name: 'Viewer', text: 'Read-only oversight.', items: ['See referrals, patients and follow-ups', 'View facilities and reports', 'No changes can be made'] },
]

function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2.5" aria-label="Referral Tracker home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white ring-1 ring-inset ring-white/20 transition-transform duration-200 group-hover:-translate-y-0.5"><HeartPulse className="h-[18px] w-[18px]" /></span>
      <span className="font-heading text-[15px] font-bold tracking-tight text-ink">Referral Tracker</span>
    </Link>
  )
}

const FOOTER_LINKS = [['Features', '#features'], ['How it works', '#how'], ['Roles and security', '#roles']]

function SiteFooter() {
  const year = new Date().getFullYear()
  const link = 'text-sm text-slate-500 underline decoration-transparent decoration-2 underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-blue-600'
  return (
    <footer id="site-footer" className="relative">
      {/* wavy top edge: a soft, slow swell that stretches with the width */}
      <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="block h-10 w-full sm:h-16 lg:h-24" aria-hidden>
        <path d="M0 58 C180 8 380 2 560 38 S900 92 1100 52 S1340 6 1440 30 V81 H0Z" className="fill-surface" />
        <path d="M0 58 C180 8 380 2 560 38 S900 92 1100 52 S1340 6 1440 30" fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-slate-200/80" />
      </svg>
      <div className="-mt-px bg-surface pb-8 pt-4 sm:pt-6">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-slate-500">Making referrals easier to manage and follow up.</p>
          </div>
          <nav aria-label="Footer" className="md:text-right">
            <ul className="flex flex-wrap gap-x-7 gap-y-3 md:justify-end">
              {FOOTER_LINKS.map(([label, href]) => (<li key={href}><a href={href} className={link}>{label}</a></li>))}
              <li><Link to="/login" className={link}>Sign in</Link></li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-slate-200/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">© {year} Referral Tracker. All rights reserved.</p>
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" /> Authorised health centre staff only
          </p>
        </div>

        <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-slate-400">
          Photographs from Wikimedia Commons: President’s Malaria Initiative (public domain), US Navy (public domain), US military (public domain), Department of Foreign Affairs and Trade (CC BY 4.0).
        </p>
      </div>
      </div>
    </footer>
  )
}

function SectionHead({ eyebrow, title, text }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{eyebrow}</span>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-base leading-relaxed text-slate-500">{text}</p>}
    </div>
  )
}

function ChartFallback({ h }) {
  return <div className={`${h} grid place-items-center`}><Spinner label="Loading chart…" /></div>
}

/** A framed, non-interactive look at the real dashboard, using the same components and sample data. */
function ProductPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-blue-500/20 via-blue-400/5 to-transparent blur-2xl" aria-hidden />
      <div className="rounded-3xl border border-slate-200/60 bg-slate-100/70 p-3 shadow-2xl shadow-blue-900/10 backdrop-blur sm:p-4" role="img"
        aria-label="Preview of the dashboard: referral totals, monthly activity and referral status rings, using sample data">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <p className="text-sm font-semibold text-ink">Referral overview</p>
            <p className="text-xs text-slate-500">Sample data</p>
          </div>
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-5" aria-hidden>
          <div className="space-y-3 lg:col-span-3">
            <div className="grid grid-cols-2 gap-3">
              <StatCard variant="primary" label="Total referrals" value="30" icon={ClipboardList} hint="11 this month" delta={{ text: '+38%', tone: 'up' }} />
              <StatCard label="Completed" value="16" icon={Check} tone="green" hint="of 30" delta={{ text: '53.3%', tone: 'up' }} />
            </div>
            <Card title="Referral activity" subtitle="Received and completed each month">
              <Suspense fallback={<ChartFallback h="h-64" />}><ActivityBars data={SAMPLE_MONTHLY} /></Suspense>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <Card title="Referral statistics" subtitle="Share of referrals by status" className="h-full">
              <div className="pt-3"><Suspense fallback={<ChartFallback h="h-56" />}><StatusRadial byStatus={SAMPLE_STATUS} total={30} completionRate={53.3} /></Suspense></div>
            </Card>
          </div>
        </div>
      </div>

      {/* floating callouts, in the style of the dashboard's dark tooltip and green pill */}
      <div className="absolute -left-4 bottom-12 hidden items-center gap-3 rounded-2xl bg-navy-950 px-4 py-3 text-white shadow-2xl ring-1 ring-white/10 xl:flex" aria-hidden>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/20 text-red-300"><Bell className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-semibold">5 referrals overdue</p>
          <p className="text-xs text-white/60">Contact patients today</p>
        </div>
      </div>
      <div className="absolute -right-3 -top-3 hidden sm:block" aria-hidden>
        <DeltaPill tone="up" className="px-3 py-1.5 text-xs shadow-lg">+38% vs last month</DeltaPill>
      </div>
    </div>
  )
}

const PHOTO = {
  hero: '/img/hero.jpg',
  exam: '/img/exam.jpg',
  clinic: '/img/clinic.jpg',
  nepal: '/img/nepal.jpg',
}

const FACTS = [
  ['5', 'Referral statuses'],
  ['1 hr', 'Overdue check interval'],
  ['3', 'Access roles'],
  ['0', 'Public sign-ups'],
]

const PILLARS = [
  { icon: ClipboardList, title: 'Track every referral', text: 'From the first referral to the final outcome, with who changed what and when.', img: PHOTO.exam, pos: 'object-[30%_center]' },
  { icon: BellRing, title: 'Catch missed visits', text: 'Overdue referrals surface the same day, with the patient to contact.', img: PHOTO.clinic, pos: 'object-center' },
  { icon: HeartPulse, title: 'Follow up on recovery', text: 'Schedule check-ins and see what is due today or this week.', img: PHOTO.nepal, pos: 'object-[40%_center]' },
]

const pill = 'group inline-flex items-center gap-3 rounded-full bg-blue-600 py-1.5 pl-6 pr-1.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 active:scale-[0.97]'
const pillIcon = 'grid h-9 w-9 place-items-center rounded-full bg-white text-blue-600 transition-transform duration-200 group-hover:translate-x-0.5'
const softBtn = 'inline-flex items-center rounded-full bg-surface px-6 py-3 text-sm font-semibold text-ink ring-1 ring-slate-200/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.97]'

function HeroNav() {
  const link = 'rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-white hover:text-ink dark:hover:bg-slate-700/50'
  return (
    <nav aria-label="Primary" className="relative z-20 flex items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
      <Logo />
      <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface/75 p-1 shadow-card ring-1 ring-slate-200/60 backdrop-blur md:flex">
        <li><a href="#top" className={link + ' bg-white text-ink shadow-sm dark:bg-slate-700/50'} aria-current="page">Home</a></li>
        {NAV.map(([label, href]) => (<li key={href}><a href={href} className={link}>{label}</a></li>))}
      </ul>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link to="/login" className="inline-flex h-11 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition duration-200 hover:-translate-y-0.5 hover:bg-blue-700 active:scale-[0.97]">
          <LogIn className="h-4 w-4" /> Sign in
        </Link>
      </div>
    </nav>
  )
}

function Hero() {
  return (
    <section id="top" className="p-3">
      <div className="relative flex min-h-[calc(100svh-1.5rem)] flex-col overflow-hidden rounded-[2rem] bg-surface shadow-card ring-1 ring-slate-200/50">
        {/* photograph, fading into the card on the text side */}
        <div className="relative order-3 h-[360px] lg:absolute lg:inset-y-0 lg:right-0 lg:order-none lg:h-auto lg:w-[56%]">
          <img src={PHOTO.hero} alt="A community health worker explaining a treatment to a mother holding her child" width="1280" height="879" fetchPriority="high"
            className="h-full w-full object-cover object-[60%_center]" />
          <div className="absolute inset-0 bg-gradient-to-b from-surface via-transparent to-transparent lg:bg-gradient-to-r" aria-hidden />
        </div>

        <HeroNav />

        <div className="relative z-10 flex flex-1 flex-col gap-10 px-5 pb-8 pt-6 sm:px-8 lg:w-[58%] lg:px-12 lg:pb-12">
          <div className="flex flex-1 flex-col justify-center">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700">
              <HeartPulse className="h-3.5 w-3.5" /> Built for community health centres
            </span>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.04] tracking-tight text-ink sm:text-6xl xl:text-7xl">
              Every referral,<br /><span className="text-blue-600 dark:text-blue-400">followed through.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-500">
              Track patients you refer to hospitals and specialist facilities, confirm they attended, schedule follow-up, and know the moment a referral is overdue.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login" className={pill}>Sign in to your workspace <span className={pillIcon}><ArrowRight className="h-4 w-4" /></span></Link>
              <a href="#features" className={softBtn}>See what it does</a>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FACTS.map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-shell/70 px-4 py-3.5 ring-1 ring-slate-200/50">
                <dt className="sr-only">{l}</dt>
                <dd className="text-2xl font-semibold tracking-tight text-ink" aria-hidden>{n}</dd>
                <dd className="mt-0.5 text-xs leading-snug text-slate-500">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}

function Mission() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pt-6 sm:px-6">
      <div className="grid items-center gap-10 rounded-[2rem] bg-surface p-7 shadow-card ring-1 ring-slate-200/50 sm:p-10 lg:grid-cols-12 lg:gap-12 lg:p-14">
        <div className="lg:col-span-5">
          <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Our purpose</span>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
            No referred patient <span className="text-blue-600 dark:text-blue-400">lost</span> between the centre and the hospital.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-500">
            Not a full hospital system. A focused tool for one job: making sure the care a patient was sent for is the care they receive.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#features" className={pill}>Explore features <span className={pillIcon}><ArrowRight className="h-4 w-4" /></span></a>
            <a href="#how" className={softBtn}>How it works</a>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
          {PILLARS.map(({ icon: Icon, title, text, img, pos }) => (
            <li key={title} className="group relative aspect-[3/4] overflow-hidden rounded-3xl bg-navy-900 sm:aspect-[3/4.4]">
              <img src={img} alt="" loading="lazy" className={'h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ' + pos} />
              <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/30 to-transparent" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-blue-600"><Icon className="h-[18px] w-[18px]" /></span>
                <h3 className="mt-3 text-base font-semibold leading-snug">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-white/75">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function OverdueShowcase() {
  return (
    <Card title="Overdue referrals" subtitle="Sample data" className="shadow-xl" padded={false}>
      <ul className="divide-y divide-slate-100 px-2 pb-2 pt-2" aria-label="Sample overdue referrals">
        {SAMPLE_OVERDUE.map((r) => (
          <li key={r.patient} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3.5">
            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate text-sm font-semibold text-ink">{r.patient}</p>
              <p className="truncate text-xs text-slate-500">{r.facility}</p>
            </div>
            <UrgencyBadge urgency={r.urgency} />
            <StatusBadge status={r.status} />
            <span className="w-20 text-right text-xs font-semibold text-red-600">{r.days} day(s)</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-shell text-slate-800">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[640px] bg-gradient-to-b from-blue-100/70 to-transparent dark:from-blue-100/40" aria-hidden />

      <main>
        <Hero />
        <Mission />

        {/* product preview */}
        <section className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <SectionHead eyebrow="The dashboard" title="Every referral, one live overview" />
          <div className="mx-auto mt-12 max-w-[1100px]"><ProductPreview /></div>
        </section>

        {/* features */}
        <section id="features" className="scroll-mt-24 mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <SectionHead eyebrow="Features" title="Everything needed to close the loop on a referral"
            text="Not a full hospital system. A focused tool for one job: making sure no referred patient is lost between the centre and the hospital." />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-slate-200/50 bg-surface p-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* showcase */}
        <section className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">Never miss a patient</span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">See who has not turned up, while there is still time to act</h2>
              <p className="mt-4 text-base leading-relaxed text-slate-500">
                Referrals that pass their expected date appear on the dashboard with how many days late they are, and who to contact. Alerts are generated automatically, every hour.
              </p>
              <ul className="mt-6 space-y-3">
                {['Urgent and emergency cases are flagged by urgency', 'Contact details one click away from each referral', 'Alerts for follow-ups that are due or overdue'].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-600"><Check className="h-3 w-3" strokeWidth={3} /></span>{t}
                  </li>
                ))}
              </ul>
            </div>
            <OverdueShowcase />
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-24 mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <SectionHead eyebrow="How it works" title="From referral to recovery in four steps" />
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-2xl border border-slate-200/50 bg-surface p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-50 text-blue-600 ring-1 ring-slate-200/70"><Icon className="h-5 w-5" /></span>
                  <span className="text-3xl font-semibold text-slate-200" aria-hidden>0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-ink"><span className="sr-only">Step {i + 1}: </span>{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* roles */}
        <section id="roles" className="scroll-mt-24 mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
          <SectionHead eyebrow="Roles and security" title="The right access for everyone on the team"
            text="Permissions are enforced by the server, not just hidden in the interface. There is no public sign-up: an administrator issues every account." />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {ROLES.map((r) => (
              <article key={r.name} className={r.featured
                ? 'rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 p-6 text-white shadow-xl shadow-blue-600/25'
                : 'rounded-2xl border border-slate-200/50 bg-surface p-6 shadow-card'}>
                <h3 className={`text-lg font-semibold ${r.featured ? 'text-white' : 'text-ink'}`}>{r.name}</h3>
                <p className={`mt-1 text-sm ${r.featured ? 'text-white/80' : 'text-slate-500'}`}>{r.text}</p>
                <ul className="mt-5 space-y-3">
                  {r.items.map((t) => (
                    <li key={t} className={`flex items-start gap-3 text-sm ${r.featured ? 'text-white' : 'text-slate-700'}`}>
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${r.featured ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}><Check className="h-3 w-3" strokeWidth={3} /></span>{t}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            <li className="flex items-center gap-2"><Lock className="h-4 w-4 text-blue-600" />Passwords are stored hashed, never in plain text</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-600" />Every change is recorded in an audit log</li>
          </ul>
        </section>

        {/* closing call to action */}
        <section className="mx-auto max-w-[1240px] px-4 pb-20 pt-8 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 px-6 py-14 text-center text-white shadow-2xl shadow-blue-600/25 sm:px-12">
            <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10" aria-hidden />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/10" aria-hidden />
            <h2 className="relative mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Ready to see every referral through?</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-base text-white/80">Sign in with the account your administrator issued to you.</p>
            <Link to="/login" className="relative mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[#3544c8] shadow-lg transition hover:-translate-y-0.5">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
