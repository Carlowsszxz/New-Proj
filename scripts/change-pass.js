// Fade in main container and setup Lucide
// Must be loaded after DOMContentLoaded
// Attach this file in change-pass.html (as scripts/change-pass.js)
document.addEventListener('DOMContentLoaded', function () {
  document.querySelector('.fade-content')?.classList.add('is-visible');
  if (window.lucide) lucide.createIcons();
});

// Supabase client
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', function () {
  const emailForm = document.getElementById('changePassForm');
  const msg = document.getElementById('changePassMsg');

  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      msg.className = 'mt-5 text-center text-sm';
      emailForm.querySelector('button[type="submit"]').disabled = true;
      const email = document.getElementById('resetEmail').value.trim();
      if (!email || !email.includes('@')) {
        msg.textContent = 'Please enter a valid email address.';
        msg.classList.add('text-red-600');
        emailForm.querySelector('button[type="submit"]').disabled = false;
        return;
      }
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password.html'
        });
        if (error) {
          msg.textContent = error.message || 'Error sending reset link.';
          msg.classList.add('text-red-600');
        } else {
          msg.textContent = 'If your email exists, a password reset link has been sent to your inbox.';
          msg.classList.add('text-green-700');
        }
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        msg.classList.add('text-red-600');
      }
      emailForm.querySelector('button[type="submit"]').disabled = false;
    });
  }
});
