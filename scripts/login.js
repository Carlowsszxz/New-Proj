// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper function to check if user is admin and redirect accordingly
async function redirectBasedOnRole(email) {
    try {
        // First, get the authenticated session to ensure we're using authenticated requests
        const { data: { session } } = await supabase.auth.getSession();
        
        // Check if user is admin - select all columns to avoid error if is_admin doesn't exist
        // Using authenticated session if available
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, is_admin')
            .eq('email', email)
            .single();
        
        if (error) {
            console.error('Error checking admin status:', error);
            
            // Check if it's a column error or RLS error
            if (error.message) {
                if (error.message.includes('column') && error.message.includes('is_admin')) {
                    console.log('is_admin column not found - redirecting to dashboard (run setup_admin_accounts.sql first)');
                } else if (error.message.includes('permission') || error.message.includes('policy')) {
                    console.log('RLS policy error - check if users table allows SELECT operations');
                    console.log('Try running the RLS policy SQL from setup_admin_accounts.sql');
                }
            }
            
            // Default to dashboard if error
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Redirect based on admin status
        // Check if is_admin exists and is true
        if (user && user.hasOwnProperty('is_admin') && user.is_admin === true) {
            console.log('Admin user detected - redirecting to setup.html');
            window.location.href = 'setup.html';
        } else {
            console.log('Regular user - redirecting to dashboard.html');
            window.location.href = 'dashboard.html';
        }
    } catch (err) {
        console.error('Error in redirectBasedOnRole:', err);
        // Default to dashboard on error
        window.location.href = 'dashboard.html';
    }
}

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', async function() {
    // Check for Supabase Auth session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session && session.user) {
        const email = session.user.email;
        sessionStorage.setItem('userEmail', email);
        await redirectBasedOnRole(email);
        return;
    }
    
    // Check for session storage login
    const userEmail = sessionStorage.getItem('userEmail');
    if (userEmail) {
        // Redirect based on role
        await redirectBasedOnRole(userEmail);
    }
});

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('signupForm').style.display = 'none';
}

function showSignup() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
}

// Login form
document.getElementById('login').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        // Use Supabase Auth to sign in (requires email confirmation)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) {
            // Check for specific error messages
            if (authError.message.includes('Email not confirmed')) {
                document.getElementById('loginError').textContent = 'Please check your email and confirm your account before logging in.';
            } else if (authError.message.includes('Invalid login')) {
                document.getElementById('loginError').textContent = 'Invalid email or password';
            } else {
                document.getElementById('loginError').textContent = authError.message;
            }
            return;
        }
        
        // Save to session
        sessionStorage.setItem('userEmail', email);
        
        // Redirect based on admin status
        await redirectBasedOnRole(email);
    } catch (err) {
        document.getElementById('loginError').textContent = 'Error: ' + err.message;
    }
});

// Sign up form
document.getElementById('signup').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('signupEmail').value;
    const firstName = document.getElementById('signupFirst').value;
    const lastName = document.getElementById('signupLast').value;
    const password = document.getElementById('signupPassword').value;
    
    try {
        // Sign up using Supabase Auth (sends email confirmation)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName
                }
            }
        });
        
        if (authError) {
            document.getElementById('signupError').textContent = 'Error: ' + authError.message;
            return;
        }
        
        // Also insert into public.users table for compatibility
        const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
                email: email,
                first_name: firstName,
                last_name: lastName,
                password: password
            })
            .select();
        
        if (userError) {
            console.log('Note: User may already exist in public.users table');
        }
        
        // Check if email confirmation was sent
        if (authData.user && !authData.user.email_confirmed_at) {
            alert('Account created! Please check your email to confirm your account before logging in.');
        } else {
            alert('Account created! You can now login.');
        }
        
        showLogin();
    } catch (err) {
        document.getElementById('signupError').textContent = 'Error: ' + err.message;
    }
});
