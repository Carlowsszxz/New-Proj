// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper function to check if user is admin and redirect accordingly
async function redirectBasedOnRole(email) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, is_admin')
            .eq('email', email)
            .single();
        
        if (error) {
            console.error('Error checking admin status:', error);
            
            if (error.message) {
                if (error.message.includes('column') && error.message.includes('is_admin')) {
                    console.log('is_admin column not found - redirecting to dashboard');
                } else if (error.message.includes('permission') || error.message.includes('policy')) {
                    console.log('RLS policy error - check if users table allows SELECT operations');
                }
            }
            
            window.location.href = 'dashboard.html';
            return;
        }
        
        if (user && user.hasOwnProperty('is_admin') && user.is_admin === true) {
            console.log('Admin user detected - redirecting to setup.html');
            window.location.href = 'setup.html';
        } else {
            console.log('Regular user - redirecting to dashboard.html');
            window.location.href = 'dashboard.html';
        }
    } catch (err) {
        console.error('Error in redirectBasedOnRole:', err);
        window.location.href = 'dashboard.html';
    }
}

// Check if user is already logged in on page load
document.addEventListener('DOMContentLoaded', async function() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session && session.user) {
        const email = session.user.email;
        sessionStorage.setItem('userEmail', email);
        await redirectBasedOnRole(email);
        return;
    }
    
    const userEmail = sessionStorage.getItem('userEmail');
    if (userEmail) {
        await redirectBasedOnRole(userEmail);
        return;
    }
    
    // Reinitialize icons after forms are visible
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});

// Login form submission
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login');
    const errorDiv = document.getElementById('login-error');
    const successDiv = document.getElementById('login-success');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Clear previous messages
            if (errorDiv) {
                errorDiv.textContent = '';
                errorDiv.classList.add('hidden');
            }
            if (successDiv) {
                successDiv.textContent = '';
                successDiv.classList.add('hidden');
            }
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            // Basic validation
            if (!email || !password) {
                if (errorDiv) {
                    errorDiv.textContent = 'Please fill in all fields';
                    errorDiv.classList.remove('hidden');
                }
                return;
            }
            
            try {
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (authError) {
                    if (errorDiv) {
                        if (authError.message.includes('Email not confirmed')) {
                            errorDiv.textContent = 'Please check your email and confirm your account before logging in.';
                        } else if (authError.message.includes('Invalid login')) {
                            errorDiv.textContent = 'Invalid email or password';
                        } else {
                            errorDiv.textContent = authError.message;
                        }
                        errorDiv.classList.remove('hidden');
                    }
                    return;
                }
                
                sessionStorage.setItem('userEmail', email);
                await redirectBasedOnRole(email);
            } catch (err) {
                if (errorDiv) {
                    errorDiv.textContent = 'Error: ' + err.message;
                    errorDiv.classList.remove('hidden');
                }
            }
        });
    }
});
