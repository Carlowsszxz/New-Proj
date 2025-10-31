// Supabase client
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function getAllParams() {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, '').replace(/^\//, ''));
  for (const [k, v] of h.entries()) q.set(k, v);
  return q;
}

document.addEventListener('DOMContentLoaded', function () {
  const params = getAllParams();
  const accessToken = params.get('access_token');
  const recoveryType = params.get('type');
  const isRecovery = accessToken && recoveryType === 'recovery';

  const form = document.getElementById('resetPasswordForm');
  const msg = document.getElementById('resetPasswordMsg');

  if (!isRecovery) {
    form.style.display = 'none';
    msg.textContent = 'Password reset link is invalid or expired. Please request a new one.';
    msg.className = 'mt-5 text-center text-sm text-red-700';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.className = 'mt-5 text-center text-sm';
    form.querySelector('button[type="submit"]').disabled = true;
    const npw = document.getElementById('newPassword').value.trim();
    const cpw = document.getElementById('confirmPassword').value.trim();
    if (!npw || !cpw) {
      msg.textContent = 'Please enter your new password twice.';
      msg.classList.add('text-red-600');
      form.querySelector('button[type="submit"]').disabled = false;
      return;
    }
    if (npw.length < 6) {
      msg.textContent = 'Password must be at least 6 characters.';
      msg.classList.add('text-red-600');
      form.querySelector('button[type="submit"]').disabled = false;
      return;
    }
    if (npw !== cpw) {
      msg.textContent = 'Passwords do not match.';
      msg.classList.add('text-red-600');
      form.querySelector('button[type="submit"]').disabled = false;
      return;
    }
    try {
      // updateUser will use the URL token/session automatically
      const { error } = await supabase.auth.updateUser({ password: npw });
      if (error) {
        msg.textContent = error.message || 'Error setting new password. The link may have expired.';
        msg.classList.add('text-red-600');
        form.querySelector('button[type="submit"]').disabled = false;
        return;
      }
      msg.textContent = 'Your password has been changed successfully! Redirecting to login...';
      msg.classList.add('text-green-700');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2000);
    } catch (err) {
      msg.textContent = 'Error: ' + err.message;
      msg.classList.add('text-red-600');
      form.querySelector('button[type="submit"]').disabled = false;
    }
  });
});

