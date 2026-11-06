// Thin fetch wrapper. The session lives in an HttpOnly cookie set by the server,
// so no token is ever readable by (or stored in) JavaScript.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0)
  }
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
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
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  logout: () => request('POST', '/auth/logout', {}),
  me: () => request('GET', '/auth/me'),

  users: () => request('GET', '/users'),
  addUser: (b) => request('POST', '/users', b),
  setUserActive: (id, active) => request('PATCH', `/users/${id}`, { active }),

  facilities: () => request('GET', '/facilities'),
  addFacility: (b) => request('POST', '/facilities', b),
  updateFacility: (id, b) => request('PUT', `/facilities/${id}`, b),
  deleteFacility: (id) => request('DELETE', `/facilities/${id}`),

  config: () => request('GET', '/config'),
  staff: () => request('GET', '/staff'),

  patients: (q) => request('GET', `/patients${qs({ q })}`),
  patient: (id) => request('GET', `/patients/${id}`),
  addPatient: (b) => request('POST', '/patients', b),

  referrals: (params) => request('GET', `/referrals${qs(params)}`),
  outstanding: () => request('GET', '/referrals/outstanding'),
  referral: (id) => request('GET', `/referrals/${id}`),
  createReferral: (b) => request('POST', '/referrals', b),
  setStatus: (id, b) => request('POST', `/referrals/${id}/status`, b),

  followups: (params) => request('GET', `/followups${qs(params)}`),
  addFollowup: (referralId, b) => request('POST', `/referrals/${referralId}/followups`, b),
  completeFollowup: (id) => request('POST', `/followups/${id}/complete`, {}),

  notifications: (includeRead) => request('GET', `/notifications${qs({ include_read: includeRead })}`),
  generateNotifications: () => request('POST', '/notifications/generate', {}),
  readNotification: (id) => request('POST', `/notifications/${id}/read`, {}),
  readAllNotifications: () => request('POST', '/notifications/read', {}),

  stats: () => request('GET', '/stats'),
}
