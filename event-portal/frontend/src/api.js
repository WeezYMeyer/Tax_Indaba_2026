const BASE = '';

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('adminToken');
}

async function request(path, { method = 'GET', body, token } = {}) {
  const authToken = token || getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),
  changePassword: (newPassword) => request('/api/auth/change-password', { method: 'POST', body: { newPassword } }),
  streamAccess: (day = 1) => request(`/api/stream/access?day=${day}`),
  streamDays: () => request('/api/stream/days'),
  adminLogin: (password) => request('/api/admin/login', { method: 'POST', body: { password } }),
  addAttendees: (attendees, token) => request('/api/admin/add-attendees', { method: 'POST', body: { attendees }, token }),
  listAttendees: (token) => request('/api/admin/attendees', { token }),
  removeAttendee: (id, token) => request(`/api/admin/attendees/${id}`, { method: 'DELETE', token }),
  resendAttendee: (id, token) => request(`/api/admin/attendees/${id}/resend`, { method: 'POST', token }),
  attendanceReport: (token) => request('/api/admin/attendance-report', { token }),
};
