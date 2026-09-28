function getAuthSession() {
  try { return JSON.parse(localStorage.getItem('greenlife-session') || 'null'); } catch { return null; }
}

function renderAuthControl() {
  const actions = document.querySelector('.header-actions');
  if (!actions) return;
  actions.querySelector('.auth-control')?.remove();
  const session = getAuthSession();
  const control = document.createElement('div');
  control.className = 'auth-control';
  if (session?.token) {
    const name = session.email.split('@')[0].replace(/[._-]/g, ' ');
    control.innerHTML = `<span class="auth-greeting">Hi, ${name}</span><button class="signout-button" type="button">Sign out</button>`;
    control.querySelector('.signout-button').addEventListener('click', () => {
      localStorage.removeItem('greenlife-session');
      window.location.href = '/login.html';
    });
  } else {
    control.innerHTML = '<a class="signin-link" href="/login.html"><i data-lucide="user-round"></i><span>Sign in</span></a>';
  }
  actions.prepend(control);
  if (window.lucide) lucide.createIcons();
}

renderAuthControl();

document.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form') return;
  if (event.target.dataset.mode === 'register') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const email = document.querySelector('#login-email').value;
  const password = document.querySelector('#login-password').value;
  const role = document.querySelector('#login-role')?.value || 'customer';
  const message = document.querySelector('#login-message');
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, role }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Sign in failed');
    localStorage.setItem('greenlife-session', JSON.stringify({ ...result, email }));
    message.textContent = `Signed in as ${email}`;
    message.className = 'success-message';
    renderAuthControl();
    window.setTimeout(() => { window.location.replace(result.role === 'admin' ? '/admin.html' : '/index.html'); }, 250);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'error-message';
  }
}, true);
