import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Layout from './components/Layout.jsx'
import { Spinner } from './components/ui.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewReferral from './pages/NewReferral.jsx'
import Referrals from './pages/Referrals.jsx'
import ReferralDetail from './pages/ReferralDetail.jsx'
import FollowUps from './pages/FollowUps.jsx'
import Notifications from './pages/Notifications.jsx'
import Facilities from './pages/Facilities.jsx'
import Patients from './pages/Patients.jsx'
import PatientDetail from './pages/PatientDetail.jsx'
import Staff from './pages/Staff.jsx'

// recharts is large; load it only when the Reports page is opened
const Reports = lazy(() => import('./pages/Reports.jsx'))

function Guard({ perm, children }) {
  const { can } = useAuth()
  return can(perm) ? children : <Navigate to="/" replace />
}

export default function App() {
  const { user, ready } = useAuth()
  if (!ready) return <div className="grid min-h-screen place-items-center"><Spinner /></div>
  // Signed out: the public landing page at "/", and the sign-in form for every other address
  // (so a deep link such as /referrals/5 still opens that page right after signing in).
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="referrals" element={<Referrals />} />
        <Route path="referrals/new" element={<Guard perm="write_referral"><NewReferral /></Guard>} />
        <Route path="referrals/:id" element={<ReferralDetail />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="follow-ups" element={<FollowUps />} />
        <Route path="notifications" element={<Guard perm="notify"><Notifications /></Guard>} />
        <Route path="reports" element={<Suspense fallback={<Spinner />}><Reports /></Suspense>} />
        <Route path="facilities" element={<Facilities />} />
        <Route path="staff" element={<Guard perm="manage_users"><Staff /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
