const form = document.querySelector('#login-form');
const tabs = document.querySelectorAll('.login-tab');
const message = document.querySelector('#login-message');
const registerFields = document.querySelectorAll('.register-only');
const title = document.querySelector('#login-title');
const copy = document.querySelector('#login-copy');
const submit = document.querySelector('#login-submit');
const phoneField = document.querySelector('#phone');

function isValidPhoneNumber(value) {
  return /^\d{10}$/.test((value || '').trim());
}

function updateRegisterSubmitState() {
  if (!phoneField || form.dataset.mode !== 'register') {
    submit.disabled = false;
    return;
  }
  const valid = isValidPhoneNumber(phoneField.value);
  submit.disabled = !valid;
  submit.style.opacity = valid ? '1' : '0.6';
  submit.style.cursor = valid ? 'pointer' : 'not-allowed';
}

if (phoneField) {
  phoneField.setAttribute('inputmode', 'numeric');
  phoneField.setAttribute('maxlength', '10');
  phoneField.setAttribute('pattern', '[0-9]{10}');
  phoneField.setAttribute('required', 'required');
  phoneField.addEventListener('input', () => {
    phoneField.value = phoneField.value.replace(/\D/g, '').slice(0, 10);
    updateRegisterSubmitState();
  });
}
const roleField = document.createElement('div');
roleField.className = 'form-field login-role-field';
roleField.innerHTML = '<label for="login-role">Continue as</label><select id="login-role" name="role"><option value="customer">User</option><option value="admin">Admin</option></select>';
form.querySelector('.form-field:not(.register-only)')?.before(roleField);
const roleSelect = roleField.querySelector('#login-role');

function requestErrorMessage(detail, fallback) {
  if (Array.isArray(detail)) {
    if (detail.some(issue => issue.loc?.includes('email'))) {
      return 'Enter a valid email address, such as name@example.com.';
    }
    if (detail.some(issue => issue.type === 'value_error' || issue.type === 'string_pattern_mismatch')) {
      return 'Phone number must be exactly 10 digits.';
    }
    return detail.map(issue => issue.msg).filter(Boolean).join('. ') || fallback;
  }
  if (typeof detail === 'string' && detail.includes('pattern')) {
    return 'Phone number must be exactly 10 digits.';
  }
  return typeof detail === 'string' ? detail : fallback;
}

function setMode(mode) {
  form.dataset.mode = mode;
  const registering = mode === 'register';
  roleField.style.display = registering ? 'none' : 'flex';
  roleSelect.disabled = registering;
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  registerFields.forEach(field => { field.style.display = registering ? 'flex' : 'none'; field.querySelectorAll('input').forEach(input => { input.required = registering; }); });
  title.innerHTML = registering ? 'Create your <em>GreenLife profile.</em>' : 'Sign in to your <em>good life.</em>';
  copy.textContent = registering ? 'Save your wishlist, track orders, and make every purchase more personal.' : 'Use your customer account or admin credentials to continue.';
  submit.innerHTML = registering ? 'Create profile <i data-lucide="user-plus"></i>' : 'Sign in <i data-lucide="arrow-right"></i>';
  submit.disabled = registering ? !isValidPhoneNumber(phoneField?.value || '') : false;
  submit.style.opacity = registering && !isValidPhoneNumber(phoneField?.value || '') ? '0.6' : '1';
  submit.style.cursor = registering && !isValidPhoneNumber(phoneField?.value || '') ? 'not-allowed' : 'pointer';
  message.textContent = '';
  lucide.createIcons();
}

tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
setMode('signin');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const registering = form.dataset.mode === 'register';
  const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
  try {
    if (registering) {
      const cleanedPhone = (data.phone || '').trim();
      if (!/^\d{10}$/.test(cleanedPhone)) {
        throw new Error('Phone number must be exactly 10 digits.');
      }
      data.phone = cleanedPhone;
    }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(requestErrorMessage(result.detail, 'Request failed'));
    if (registering) {
      setMode('signin');
      document.querySelector('#login-email').value = data.email;
      message.className = 'success-message';
      message.textContent = 'Profile created. Please sign in with your new account.';
      return;
    }
    localStorage.setItem('greenlife-session', JSON.stringify(result));
    message.textContent = 'Login successful. Redirecting...';
    message.className = 'success-message';
    setTimeout(() => { window.location.replace(result.role === 'admin' ? '/admin.html' : '/index.html'); }, 250);
  } catch (error) {
    message.textContent = error.message;
    message.className = 'error-message';
  }
});
