/**
 * Helpers compartidos para llamar a la API.
 * Basic Auth: el navegador incluye las credenciales automáticamente.
 */

const API = {
  base: '/api/v1',

  async request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
      ...options,
    });

    if (!response.ok) {
      let detail = `Error ${response.status}`;
      try {
        const data = await response.json();
        detail = data.detail?.mensaje || data.detail || detail;
      } catch (_) {}
      throw new Error(detail);
    }
    if (response.status === 204) return null;
    return response.json();
  },

  get(path) { return this.request(path); },
  post(path, body) {
    return this.request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  },
  put(path, body) { return this.request(path, { method: 'PUT', body: JSON.stringify(body) }); },
  del(path) { return this.request(path, { method: 'DELETE' }); },
};

function formatCOP(value) {
  const num = Number(value) || 0;
  return '$' + num.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toast(message, type = 'success') {
  const colors = {
    success: 'background:#5ee045;color:#333',
    error: 'background:#ef4444;color:#fff',
    info: 'background:#4d4d4d;color:#fff',
  };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:1rem;right:1rem;z-index:9999;padding:0.75rem 1.25rem;border-radius:0.5rem;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.15);transition:opacity 0.3s;${colors[type]}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}