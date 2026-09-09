(async function () {
  // If already logged in, skip straight to the dashboard.
  try {
    const session = await apiRequest('/session');
    if (session.authenticated) {
      window.location.href = 'index.html';
      return;
    }
  } catch (e) { /* ignore, show the login form */ }

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      await apiRequest('/login', {
        method: 'POST',
        body: {
          username: form.elements.username.value,
          password: form.elements.password.value,
        },
      });
      window.location.href = 'index.html';
    } catch (err) {
      errorBox.textContent = err.message || 'Login failed.';
      errorBox.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
})();
