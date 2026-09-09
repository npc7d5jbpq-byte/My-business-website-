(async function () {
  const session = await initShell('account.html');
  if (!session) return;
  setPageTitle('Account Settings');

  const form = document.getElementById('account-form');
  const errorBox = document.getElementById('account-error');
  const successBox = document.getElementById('account-success');
  const saveBtn = document.getElementById('account-save-btn');

  try {
    const account = await apiRequest('/account');
    document.getElementById('current-username').textContent = account.username;
    form.elements.newUsername.value = account.username;
  } catch (err) {
    showBanner(err.message);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    successBox.hidden = true;

    const newPassword = form.elements.newPassword.value;
    const confirmNewPassword = form.elements.confirmNewPassword.value;
    if (newPassword && newPassword !== confirmNewPassword) {
      errorBox.textContent = 'New password and confirmation do not match.';
      errorBox.hidden = false;
      return;
    }
    if (newPassword && newPassword.length < 6) {
      errorBox.textContent = 'New password must be at least 6 characters.';
      errorBox.hidden = false;
      return;
    }

    setButtonLoading(saveBtn, true, 'Saving…');
    try {
      const result = await apiRequest('/account/change-credentials', {
        method: 'POST',
        body: {
          currentPassword: form.elements.currentPassword.value,
          newUsername: form.elements.newUsername.value,
          newPassword: newPassword || undefined,
        },
      });
      document.getElementById('current-username').textContent = result.username;
      form.elements.currentPassword.value = '';
      form.elements.newPassword.value = '';
      form.elements.confirmNewPassword.value = '';
      successBox.textContent = 'Saved. Use the new username/password next time you sign in.';
      successBox.hidden = false;
      // Refresh the topbar's "Signed in as" text.
      initShell('account.html');
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      setButtonLoading(saveBtn, false);
    }
  });
})();
