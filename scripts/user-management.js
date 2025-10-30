// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Check if user is admin on page load
document.addEventListener('DOMContentLoaded', async function() {
    // Check for Supabase Auth session
    const { data: { session } } = await supabase.auth.getSession();
    
    let userEmail = sessionStorage.getItem('userEmail');
    
    // If no session storage but has Supabase Auth session, get email from session
    if (!userEmail && session && session.user) {
        userEmail = session.user.email;
        sessionStorage.setItem('userEmail', userEmail);
    }
    
    // If no user email at all, redirect to login
    if (!userEmail) {
        window.location.href = 'login.html';
        return;
    }
    
    // Verify user is admin
    const { data: user, error } = await supabase
        .from('users')
        .select('is_admin')
        .eq('email', userEmail)
        .single();
    
    if (error || !user || !user.is_admin) {
        // Not admin or error, redirect to dashboard
        console.log('Not an admin user, redirecting...');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // User is admin, load users list
    viewAllUsers();
});

async function addUser() {
    const email = document.getElementById('userEmail').value.trim();
    const firstName = document.getElementById('userFirstName').value.trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const password = document.getElementById('userPassword').value;
    const makeAdmin = document.getElementById('makeAdmin').checked;
    
    if (!email) {
        document.getElementById('userResult').textContent = '❌ Please enter email';
        return;
    }
    
    if (!password || password.length < 6) {
        document.getElementById('userResult').textContent = '❌ Password must be at least 6 characters';
        return;
    }
    
    const resultDiv = document.getElementById('userResult');
    resultDiv.textContent = 'Creating user and sending confirmation email...';
    
    try {
        // Step 1: Create user in Supabase Auth (this sends confirmation email)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName
                },
                emailRedirectTo: window.location.origin + '/login.html'
            }
        });
        
        if (authError) {
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                resultDiv.textContent = '❌ User with this email already exists in the system!';
            } else {
                resultDiv.textContent = '❌ Error creating user: ' + authError.message;
            }
            console.error('Auth error:', authError);
            return;
        }
        
        if (!authData.user) {
            resultDiv.textContent = '❌ Failed to create user. Please try again.';
            return;
        }
        
        // Step 2: Insert/Update user in public.users table with admin status
        const { data: userData, error: userError } = await supabase
            .from('users')
            .upsert({
                email: email,
                first_name: firstName,
                last_name: lastName,
                is_admin: makeAdmin || false,
                password: password  // Store password for legacy compatibility
            }, {
                onConflict: 'email'
            })
            .select();
        
        // Even if there's an error in public.users, the auth user was created and email was sent
        if (userError) {
            console.warn('Warning: User created in Auth but error in public.users table:', userError);
            // Still show success since email was sent
            resultDiv.innerHTML = '✅ User created and confirmation email sent!<br>' +
                                  '⚠️ Note: There was an issue updating the user profile. You may need to update manually.';
        } else {
            // Update admin status if needed
            if (makeAdmin && userData && userData.length > 0) {
                await supabase
                    .from('users')
                    .update({ is_admin: true })
                    .eq('email', email);
            }
            
            resultDiv.textContent = '✅ User created successfully! Confirmation email sent to ' + email + 
                                  (makeAdmin ? ' (as Admin)' : '');
        }
        
        // Clear form
        document.getElementById('userEmail').value = '';
        document.getElementById('userFirstName').value = '';
        document.getElementById('userLastName').value = '';
        document.getElementById('userPassword').value = '';
        document.getElementById('makeAdmin').checked = false;
        
        // Refresh users list
        viewAllUsers();
        
    } catch (err) {
        console.error('Error creating user:', err);
        resultDiv.textContent = '❌ Error: ' + err.message;
    }
}

async function viewAllUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!users || users.length === 0) {
            document.getElementById('allUsersData').innerHTML = '<p>No users found.</p>';
            return;
        }
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr style="background:#333;color:white;"><th style="padding:10px;">Email</th><th style="padding:10px;">Name</th><th style="padding:10px;">Admin</th><th style="padding:10px;">Actions</th></tr></thead><tbody>';
        
        users.forEach(user => {
            html += '<tr style="border-bottom:1px solid #ddd;">';
            html += '<td style="padding:10px;">' + escapeHtml(user.email) + '</td>';
            html += '<td style="padding:10px;">' + escapeHtml((user.first_name || '') + ' ' + (user.last_name || '')) + '</td>';
            html += '<td style="padding:10px;">' + (user.is_admin ? '<span style="color:green;font-weight:bold;">✅ Yes</span>' : '<span style="color:red;">❌ No</span>') + '</td>';
            html += '<td style="padding:10px;">';
            html += '<button onclick="toggleAdmin(\'' + user.id + '\', \'' + escapeHtml(user.email) + '\', ' + !user.is_admin + ')" style="background:' + (user.is_admin ? '#dc3545' : '#28a745') + ';color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;margin-right:5px;">';
            html += user.is_admin ? 'Remove Admin' : 'Make Admin';
            html += '</button> ';
            html += '<button class="danger" onclick="deleteUser(\'' + user.id + '\', \'' + escapeHtml(user.email) + '\')" style="background:#dc3545;color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;">Delete</button>';
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('allUsersData').innerHTML = html;
    } catch (err) {
        console.error('Error loading users:', err);
        document.getElementById('allUsersData').innerHTML = '<p>Error loading users: ' + err.message + '</p>';
    }
}

async function toggleAdmin(userId, userEmail, makeAdmin) {
    if (!confirm('Are you sure you want to ' + (makeAdmin ? 'make' : 'remove') + ' ' + userEmail + ' ' + (makeAdmin ? 'an admin' : 'from admin') + '?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('users')
            .update({ is_admin: makeAdmin })
            .eq('id', userId);
        
        if (error) throw error;
        
        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Admin status updated!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        viewAllUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteUser(userId, userEmail) {
    if (!confirm('Are you sure you want to delete user: ' + userEmail + '?\n\nThis will also delete their RFID cards and related data!')) {
        return;
    }
    
    try {
        // Delete RFID cards first (foreign key constraint)
        await supabase
            .from('rfid_cards')
            .delete()
            .eq('user_id', userId);
        
        // Delete user
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);
        
        if (error) throw error;
        
        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ User deleted!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        viewAllUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function logout() {
    // Sign out from Supabase Auth
    await supabase.auth.signOut();
    
    // Clear session storage
    sessionStorage.removeItem('userEmail');
    
    // Redirect to login
    window.location.href = 'login.html';
}

