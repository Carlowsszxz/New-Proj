// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Check if user is already logged in on page load
document.addEventListener('DOMContentLoaded', async function() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session && session.user) {
        // User is already logged in, redirect to dashboard
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
});

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

// Signup form submission
document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signup');
    const errorDiv = document.getElementById('signup-error');
    const successDiv = document.getElementById('signup-success');
    
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Clear previous messages
            errorDiv.textContent = '';
            errorDiv.classList.add('hidden');
            successDiv.textContent = '';
            successDiv.classList.add('hidden');
            
            const email = document.getElementById('signupEmail').value.trim();
            const firstName = document.getElementById('signupFirst').value.trim();
            const lastName = document.getElementById('signupLast').value.trim();
            const studentId = document.getElementById('signupStudentId').value.trim();
            const department = document.getElementById('signupDepartment').value;
            const password = document.getElementById('signupPassword').value;
            
            // Basic validation
            if (!email || !firstName || !lastName || !studentId || !department || !password) {
                errorDiv.textContent = 'Please fill in all fields';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            if (password.length < 6) {
                errorDiv.textContent = 'Password must be at least 6 characters';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            try {
                // Sign up using Supabase Auth (sends email confirmation)
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            first_name: firstName,
                            last_name: lastName,
                            student_id: studentId,
                            college_department: department
                        }
                    }
                });
                
                if (authError) {
                    errorDiv.textContent = 'Error: ' + authError.message;
                    errorDiv.classList.remove('hidden');
                    return;
                }
                
                // Insert user info into public.users table (without password - security fix!)
                const { error: userError } = await supabase
                    .from('users')
                    .insert({
                        email: email,
                        first_name: firstName,
                        last_name: lastName,
                        student_id: studentId,
                        college_department: department
                        // ✅ REMOVED password field - Supabase Auth handles password securely
                    });
                
                if (userError) {
                    console.log('Note: User may already exist in public.users table:', userError.message);
                }
                
                // Show success message
                if (authData.user && !authData.user.email_confirmed_at) {
                    successDiv.textContent = 'Account created! Please check your email to confirm your account before logging in. Redirecting to login page...';
                    successDiv.classList.remove('hidden');
                    
                    // Redirect to login page after 3 seconds
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 3000);
                } else {
                    successDiv.textContent = 'Account created! You can now login. Redirecting...';
                    successDiv.classList.remove('hidden');
                    
                    // Redirect to login page after 2 seconds
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                }
            } catch (err) {
                errorDiv.textContent = 'Error: ' + err.message;
                errorDiv.classList.remove('hidden');
            }
        });
    }
});

