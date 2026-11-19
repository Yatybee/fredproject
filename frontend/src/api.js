// Thin fetch wrapper. The session lives in an HttpOnly cookie set by the server,
// so no token is ever readable by (or stored in) JavaScript.
//
// All requests go to same-origin `/api/...`. In production Vercel rewrites them to the
// backend (see vercel.json); in development Vite proxies them (see vite.config.js).
// The browser therefore never makes a cross-site request, so no CORS or third-party cookies.

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

async function request(method, path, body) {
  const hasBody = body !== undefined
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin', // send the session cookie to our own origin
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    const detail = typeof data?.detail === 'string' ? data.detail : `Request failed (${res.status})`
    throw new ApiError(detail, res.status)
  }
  return data
}

const qs = (params) => {
  const p = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== '' && v != null && v !== false) p.set(k, v)
  })
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  // auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  logout: () => request('POST', '/auth/logout', {}),
  me: () => request('GET', '/auth/me'),

  // users
  users: () => request('GET', '/users'),
  addUser: (b) => request('POST', '/users', b),
  setUserActive: (id, active) => request('PATCH', `/users/${id}`, { active }),

  // facilities
  facilities: () => request('GET', '/facilities'),
  addFacility: (b) => request('POST', '/facilities', b),
  updateFacility: (id, b) => request('PUT', `/facilities/${id}`, b),
  deleteFacility: (id) => request('DELETE', `/facilities/${id}`),

  // config & staff
  config: () => request('GET', '/config'),
  staff: () => request('GET', '/staff'),

  // patients
  patients: (q) => request('GET', `/patients${qs({ q })}`),
  patient: (id) => request('GET', `/patients/${id}`),
  addPatient: (b) => request('POST', '/patients', b),

  // referrals
  referrals: (params) => request('GET', `/referrals${qs(params)}`),
  outstanding: () => request('GET', '/referrals/outstanding'),
  referral: (id) => request('GET', `/referrals/${id}`),
  createReferral: (b) => request('POST', '/referrals', b),
  setStatus: (id, b) => request('POST', `/referrals/${id}/status`, b),

  // follow-ups
  followups: (params) => request('GET', `/followups${qs(params)}`),
  addFollowup: (referralId, b) => request('POST', `/referrals/${referralId}/followups`, b),
  completeFollowup: (id) => request('POST', `/followups/${id}/complete`, {}),

  // notifications
  notifications: (includeRead) =>
    request('GET', `/notifications${qs({ include_read: includeRead })}`),
  generateNotifications: () => request('POST', '/notifications/generate', {}),
  readNotification: (id) => request('POST', `/notifications/${id}/read`, {}),
  readAllNotifications: () => request('POST', '/notifications/read', {}),

  // stats
  stats: () => request('GET', '/stats'),
}