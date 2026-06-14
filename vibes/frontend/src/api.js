const BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() { return localStorage.getItem('vibes_token'); }
export function setToken(t) { localStorage.setItem('vibes_token', t); }
export function clearToken() { localStorage.removeItem('vibes_token'); }

async function req(method, path, body, isForm = false) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  register:       (b) => req('POST', '/auth/register', b),
  login:          (b) => req('POST', '/auth/login', b),
  me:             ()  => req('GET',  '/auth/me'),
  changePassword: (b) => req('POST', '/auth/change-password', b),

  // Profile
  getProfile:    (username) => req('GET',  `/profile/${username}`),
  updateProfile: (b)        => req('PUT',  '/profile', b),

  // Links
  getLinks:    ()       => req('GET',    '/links'),
  addLink:     (b)      => req('POST',   '/links', b),
  updateLink:  (id, b)  => req('PUT',    `/links/${id}`, b),
  deleteLink:  (id)     => req('DELETE', `/links/${id}`),
  reorderLinks:(order)  => req('PUT',    '/links/reorder/bulk', { order }),
  clickLink:   (id)     => req('POST',   `/links/${id}/click`),

  // Photos
  getPhotos:  ()  => req('GET',    '/photos'),
  deletePhoto:(id)=> req('DELETE', `/photos/${id}`),
  uploadPhoto: async (file) => {
    const form = new FormData();
    form.append('photo', file);
    return req('POST', '/photos', form, true);
  },

  // Analytics
  getAnalytics: () => req('GET', '/analytics'),

  // Tier
  upgradeTier: (tier) => req('POST', '/tier/upgrade', { tier }),

  // Presave
  getPresave:       ()        => req('GET', '/presave'),
  updatePresave:    (b)       => req('PUT', '/presave', b),
  getPublicPresave: (username)=> req('GET', `/presave/${username}`),
  appleClick:       (username)=> req('POST', `/presave/${username}/apple-click`),
  spotifyLookup:    (url)     => req('GET', `/presave/spotify-lookup?url=${encodeURIComponent(url)}`),

  // Settings
  getSettings:    ()  => req('GET', '/settings'),
  updateSettings: (b) => req('PUT', '/settings', b),
};

export const spotifyPresaveUrl = (username) => `${BASE}/presave/spotify/login/${username}`;
