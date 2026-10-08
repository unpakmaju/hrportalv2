const rawApiBase = import.meta.env.VITE_API_BASE_URL;
const LOCAL_API_BASE = (rawApiBase !== undefined && rawApiBase !== null && rawApiBase !== '')
  ? rawApiBase
  : (import.meta.env.PROD ? '' : 'http://localhost:3000');

export const apiClient = {
  getToken() {
    const raw = localStorage.getItem('token') || localStorage.getItem('hrportal_token') || '';
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    const parts = raw.split('.');
    if (parts.length !== 3) return '';
    return raw;
  },

  getHeaders(isFormData = false) {
    const token = this.getToken();
    const activeRole = localStorage.getItem('active_role') || 'tendik';
    const headers = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (activeRole) {
      headers['X-Active-Role'] = activeRole;
    }
    return headers;
  },

  resolveUrl(endpoint) {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    let path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    if (path.startsWith('/api/') && !path.startsWith('/api/v2/') && !path.startsWith('/api/sso/')) {
      path = path.replace('/api/', '/api/v2/');
    }
    const baseUrl = (LOCAL_API_BASE || '').replace(/\/+$/, '');
    return `${baseUrl}${path}`;
  },

  async refreshAccessToken() {
    try {
      const refreshToken = localStorage.getItem('refresh') || localStorage.getItem('refresh_token');
      if (!refreshToken) return null;

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'hrportal',
        refresh_token: refreshToken,
      });

      const response = await fetch('/api/sso/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) return null;

      const tokenData = await response.json();
      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token || refreshToken;
      const newIdToken = tokenData.id_token || '';

      if (newAccessToken) {
        localStorage.setItem('token', newAccessToken);
        if (newRefreshToken) localStorage.setItem('refresh', newRefreshToken);
        if (newIdToken) localStorage.setItem('id_token', newIdToken);
        window.dispatchEvent(new CustomEvent('token-refreshed', { detail: newAccessToken }));
        return newAccessToken;
      }
    } catch (e) {
      console.warn('apiClient auto-refresh error:', e);
    }
    return null;
  },

  async request(endpoint, options = {}) {
    const url = this.resolveUrl(endpoint);
    const isFormData = options.body instanceof FormData || options.isFormData;
    
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(isFormData),
        ...(options.headers || {}),
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (response.status === 401 && !endpoint.includes('login') && !options._isRetry) {
        // Attempt auto-refresh using refresh_token
        const newToken = await this.refreshAccessToken();
        if (newToken) {
          const retryHeaders = {
            ...this.getHeaders(isFormData),
            ...(options.headers || {}),
            'Authorization': `Bearer ${newToken}`,
          };
          return this.request(endpoint, {
            ...options,
            _isRetry: true,
            headers: retryHeaders,
          });
        }

        // Token expired and refresh failed
        localStorage.removeItem('token');
        localStorage.removeItem('refresh');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-logout'));
        throw new Error('Sesi login telah berakhir. Silakan login kembali.');
      }

      const contentType = response.headers.get('content-type') || '';
      
      let data;
      const text = await response.text();

      if (contentType.includes('text/event-stream') || text.startsWith('total:') || text.includes('event: start') || text.includes('data: {') || text.includes('data:{"')) {
        const list = [];
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.substring(5).trim();
            if (jsonStr) {
              try {
                list.push(JSON.parse(jsonStr));
              } catch (e) {
                console.warn('Failed to parse SSE line JSON:', jsonStr);
              }
            }
          }
        }
        data = list;
      } else if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      } else {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        const errorMsg = data?.message || data?.error || `Request failed with status ${response.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint} -> ${url}:`, err);
      throw err;
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const queryString = query.toString();
    const finalUrl = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(finalUrl, { method: 'GET' });
  },

  post(endpoint, body = {}) {
    if (body instanceof FormData) {
      return this.request(endpoint, {
        method: 'POST',
        body: body,
        isFormData: true,
      });
    }
    const form = new URLSearchParams();
    if (typeof body === 'object' && body !== null) {
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          form.append(k, v);
        }
      });
      return this.request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    }
    return this.request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: String(body),
    });
  },

  postForm(endpoint, formData) {
    if (formData instanceof FormData) {
      return this.request(endpoint, {
        method: 'POST',
        body: formData,
        isFormData: true,
      });
    }
    const form = new URLSearchParams();
    if (typeof formData === 'object' && formData !== null) {
      Object.entries(formData).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          form.append(k, v);
        }
      });
    }
    return this.request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  },

  put(endpoint, body = {}) {
    if (body instanceof FormData) {
      return this.request(endpoint, {
        method: 'PUT',
        body: body,
        isFormData: true,
      });
    }
    const form = new URLSearchParams();
    if (typeof body === 'object' && body !== null) {
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          form.append(k, v);
        }
      });
      return this.request(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
    }
    return this.request(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: String(body),
    });
  },

  putForm(endpoint, formData) {
    if (formData instanceof FormData) {
      return this.request(endpoint, {
        method: 'PUT',
        body: formData,
        isFormData: true,
      });
    }
    const form = new URLSearchParams();
    if (typeof formData === 'object' && formData !== null) {
      Object.entries(formData).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          form.append(k, v);
        }
      });
    }
    return this.request(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },
};
