(async function () {
  spawnLoginParticles();

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
    setButtonLoading(btn, true, 'Signing in…');
    try {
      await apiRequest('/login', {
        method: 'POST',
        body: {
          username: form.elements.username.value,
          password: form.elements.password.value,
        },
      });
      goToDashboard();
    } catch (err) {
      errorBox.textContent = err.message || 'Login failed.';
      errorBox.hidden = false;
      setButtonLoading(btn, false);
    }
  });

  // A smooth fade-out on the whole page before moving to the dashboard,
  // instead of an abrupt jump - skipped (near-instant) for reduced-motion.
  function goToDashboard() {
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.add('page-leaving');
    setTimeout(() => { window.location.href = 'index.html'; }, reduced ? 50 : 1200);
  }

  // A handful of very slow, sparse drifting light points in the background
  // - deliberately understated so the page still reads as a serious
  // municipal/office system rather than a game or landing page.
  function spawnLoginParticles() {
    const container = document.getElementById('login-particles');
    if (!container || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const COUNT = 7;
    for (let i = 0; i < COUNT; i++) {
      const dot = document.createElement('div');
      dot.className = 'login-particle';
      dot.style.left = `${5 + Math.random() * 90}%`;
      dot.style.top = `${40 + Math.random() * 55}%`;
      dot.style.animationDuration = `${14 + Math.random() * 10}s`;
      dot.style.animationDelay = `${Math.random() * 10}s`;
      container.appendChild(dot);
    }
  }
})();
