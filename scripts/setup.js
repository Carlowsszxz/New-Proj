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
    
    // User is admin, load data
    loadUsers();
    loadStats();
    viewOccupancy();
    viewNoiseLevel(); // Load initial noise level for Table 1
    loadAnnouncements(); // Load announcements
});

// Load statistics
async function loadStats() {
    try {
        // Total users
        const { count: userCount } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        // Total access devices
        const { count: rfidCount } = await supabase
            .from('rfid_cards')
            .select('*', { count: 'exact', head: true });
        
        // Occupied seats
        const { count: occupiedCount } = await supabase
            .from('occupancy')
            .select('*', { count: 'exact', head: true })
            .eq('table_id', 'table-1')
            .eq('is_occupied', true);
        
        // Pending reports
        const { count: pendingCount } = await supabase
            .from('student_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');
        
        document.getElementById('totalUsers').textContent = userCount || 0;
        document.getElementById('totalRfid').textContent = rfidCount || 0;
        document.getElementById('occupiedSeats').textContent = occupiedCount || 0;
        document.getElementById('pendingReports').textContent = pendingCount || 0;
        
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

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
        
        // Refresh lists
        loadUsers();
        loadStats();
        
    } catch (err) {
        console.error('Error creating user:', err);
        resultDiv.textContent = '❌ Error: ' + err.message;
    }
}

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Only populate userSelect if it exists (it might not be on all pages)
        const select = document.getElementById('userSelect');
        if (!select) {
            // Silently return - userSelect is optional (not present in setup.html)
            return;
        }
        select.innerHTML = '<option value="">Select User...</option>';
        
        data.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            const name = (user.first_name || '') + ' ' + (user.last_name || '');
            option.textContent = user.email + (name.trim() ? ' (' + name.trim() + ')' : '') + (user.is_admin ? ' [ADMIN]' : '');
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

async function viewAllUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;"><thead><tr><th>Email</th><th>Name</th><th>Admin</th><th>Actions</th></tr></thead><tbody>';
        
        users.forEach(user => {
            html += '<tr>';
            html += '<td>' + user.email + '</td>';
            html += '<td>' + (user.first_name || '') + ' ' + (user.last_name || '') + '</td>';
            html += '<td>' + (user.is_admin ? '✅ Yes' : '❌ No') + '</td>';
            html += '<td>';
            html += '<button onclick="toggleAdmin(\'' + user.id + '\', \'' + user.email + '\', ' + !user.is_admin + ')">';
            html += user.is_admin ? 'Remove Admin' : 'Make Admin';
            html += '</button> ';
            html += '<button class="danger" onclick="deleteUser(\'' + user.id + '\', \'' + user.email + '\')">Delete</button>';
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('allUsersData').innerHTML = html;
    } catch (err) {
        document.getElementById('allUsersData').innerHTML = 'Error: ' + err.message;
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
        
        alert('Admin status updated! ✅');
        viewAllUsers();
        loadUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteUser(userId, userEmail) {
    if (!confirm('Are you sure you want to delete user: ' + userEmail + '?\n\nThis will also delete their access devices and related data!')) {
        return;
    }
    
    try {
        // Delete access devices first (foreign key constraint)
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
        
        alert('User deleted! ✅');
        viewAllUsers();
        loadUsers();
        loadStats();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function assignRfid() {
    const rfidUid = document.getElementById('rfidUid').value.trim().toUpperCase();
    const userId = document.getElementById('userSelect').value;
    
    if (!rfidUid || !userId) {
        alert('Please enter RFID UID and select a user');
        return;
    }
    
    try {
        // Check if RFID already exists
        const { data: existing } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('rfid_uid', rfidUid)
            .eq('is_active', true)
            .single();
        
        if (existing) {
            document.getElementById('rfidResult').textContent = '❌ This device is already registered to another user!';
            return;
        }
        
        // Deactivate any existing RFID for this user
        await supabase
            .from('rfid_cards')
            .update({ is_active: false })
            .eq('user_id', userId);
        
        // Assign new RFID
        const { data, error } = await supabase
            .from('rfid_cards')
            .insert({ rfid_uid: rfidUid, user_id: userId, is_active: true });
        
        if (error) throw error;
        
        document.getElementById('rfidResult').textContent = 'Device registered! ✅';
        document.getElementById('rfidUid').value = '';
        loadUsers();
        loadStats();
    } catch (err) {
        document.getElementById('rfidResult').textContent = 'Error: ' + err.message;
    }
}

async function viewAllRfid() {
    try {
        const { data: rfidCards, error } = await supabase
            .from('rfid_cards')
            .select('*, users(email, first_name, last_name)')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;"><thead><tr><th>RFID UID</th><th>User</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
        
        rfidCards.forEach(card => {
            const user = card.users;
            html += '<tr>';
            html += '<td>' + card.rfid_uid + '</td>';
            html += '<td>' + (user ? user.email : 'N/A') + '</td>';
            html += '<td>' + (card.is_active ? '🟢 Active' : '🔴 Inactive') + '</td>';
            html += '<td>';
            html += '<button onclick="toggleRfidStatus(\'' + card.id + '\', ' + !card.is_active + ')">';
            html += card.is_active ? 'Deactivate' : 'Activate';
            html += '</button>';
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('allRfidData').innerHTML = html;
    } catch (err) {
        document.getElementById('allRfidData').innerHTML = 'Error: ' + err.message;
    }
}

async function toggleRfidStatus(rfidId, activate) {
    try {
        const { error } = await supabase
            .from('rfid_cards')
            .update({ is_active: activate })
            .eq('id', rfidId);
        
        if (error) throw error;
        
        alert('Device status updated! ✅');
        viewAllRfid();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function viewAllReports() {
    try {
        const { data: reports, error } = await supabase
            .from('student_reports')
            .select('*, user:users!user_id(email), replied_by_user:users!replied_by(email)')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!reports || reports.length === 0) {
            document.getElementById('reportsData').innerHTML = '<p>No reports submitted yet.</p>';
            return;
        }
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr style="background:#333;color:white;"><th style="padding:10px;">Date</th><th style="padding:10px;">User</th><th style="padding:10px;">Type</th><th style="padding:10px;">Title</th><th style="padding:10px;">Status</th><th style="padding:10px;">Actions</th></tr></thead><tbody>';
        
        reports.forEach(report => {
            const date = new Date(report.created_at).toLocaleString();
            const reportId = String(report.id); // Ensure it's a string
            
            html += '<tr style="border-bottom:1px solid #ddd;">';
            html += '<td style="padding:10px;">' + date + '</td>';
            html += '<td style="padding:10px;">' + (report.user ? escapeHtml(report.user.email) : 'N/A') + '</td>';
            html += '<td style="padding:10px;">' + escapeHtml(report.report_type) + '</td>';
            html += '<td style="padding:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(report.title) + '">' + escapeHtml(report.title) + '</td>';
            html += '<td style="padding:10px;"><span class="report-status ' + report.status + '">' + escapeHtml(report.status) + '</span></td>';
            html += '<td style="padding:10px;">';
            html += '<select onchange="updateReportStatus(\'' + reportId.replace(/'/g, "\\'") + '\', this.value)" style="padding:5px;margin-right:5px;border:1px solid #ddd;border-radius:3px;">';
            html += '<option value="pending" ' + (report.status === 'pending' ? 'selected' : '') + '>Pending</option>';
            html += '<option value="reviewing" ' + (report.status === 'reviewing' ? 'selected' : '') + '>Reviewing</option>';
            html += '<option value="resolved" ' + (report.status === 'resolved' ? 'selected' : '') + '>Resolved</option>';
            html += '<option value="dismissed" ' + (report.status === 'dismissed' ? 'selected' : '') + '>Dismissed</option>';
            html += '</select>';
            html += '<button onclick="viewReportDetails(\'' + reportId.replace(/'/g, "\\'") + '\')" style="background:#007bff;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;margin-right:5px;">View Details</button>';
            html += '<button onclick="replyToReport(\'' + reportId.replace(/'/g, "\\'") + '\')" style="background:#17a2b8;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;">' + (report.admin_reply ? 'Edit Reply' : 'Reply') + '</button>';
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('reportsData').innerHTML = html;
    } catch (err) {
        document.getElementById('reportsData').innerHTML = 'Error: ' + err.message;
    }
}

async function updateReportStatus(reportId, newStatus) {
    if (!reportId || !newStatus) {
        console.error('Missing reportId or newStatus', { reportId, newStatus });
        alert('Error: Missing report ID or status');
        return;
    }
    
    console.log('Updating report status:', { reportId, newStatus });
    
    try {
        // First verify the report exists
        const { data: existingReport, error: fetchError } = await supabase
            .from('student_reports')
            .select('id, status')
            .eq('id', reportId)
            .single();
        
        if (fetchError) {
            console.error('Error fetching report:', fetchError);
            throw new Error('Report not found: ' + fetchError.message);
        }
        
        if (!existingReport) {
            throw new Error('Report not found');
        }
        
        console.log('Current report status:', existingReport.status);
        console.log('Updating to:', newStatus);
        
        // Update the status
        const { data, error } = await supabase
            .from('student_reports')
            .update({ status: newStatus })
            .eq('id', reportId)
            .select();
        
        if (error) {
            console.error('Supabase update error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            throw error;
        }
        
        if (!data || data.length === 0) {
            console.error('Update returned no data');
            throw new Error('Update failed: No data returned. Check RLS policies.');
        }
        
        console.log('Update successful:', data[0]);
        
        // Show success message
        const statusMessages = {
            'pending': 'marked as Pending',
            'reviewing': 'marked as Reviewing',
            'resolved': 'marked as Resolved',
            'dismissed': 'dismissed'
        };
        
        const message = statusMessages[newStatus] || 'updated';
        
        // Refresh the reports list
        await viewAllReports();
        await loadStats();
        
        // Show a subtle notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Report ' + message + '!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
    } catch (err) {
        console.error('Error updating report status:', err);
        
        // Show error notification
        const errorNotification = document.createElement('div');
        errorNotification.style.cssText = 'position:fixed;top:20px;right:20px;background:#dc3545;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;';
        errorNotification.innerHTML = '❌ Error: ' + err.message + '<br><small>Check console for details</small>';
        document.body.appendChild(errorNotification);
        
        setTimeout(() => {
            errorNotification.style.opacity = '0';
            errorNotification.style.transition = 'opacity 0.3s';
            setTimeout(() => errorNotification.remove(), 300);
        }, 5000);
        
        // Also show alert for critical errors
        if (err.message && err.message.includes('RLS') || err.message.includes('policy')) {
            alert('Permission Error:\n\n' + err.message + '\n\nYou may need to update RLS policies in Supabase to allow admins to update reports.');
        }
    }
}

async function viewReportDetails(reportId) {
    if (!reportId) {
        console.error('Missing reportId');
        return;
    }
    
    try {
        const { data: report, error } = await supabase
            .from('student_reports')
            .select('*, user:users!user_id(email, first_name, last_name), replied_by_user:users!replied_by(email, first_name, last_name)')
            .eq('id', reportId)
            .single();
        
        if (error) throw error;
        
        if (!report) {
            alert('Report not found');
            return;
        }
        
        // Create a modal for better display
        const modal = document.createElement('div');
        modal.className = 'report-details-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:white;padding:30px;border-radius:10px;max-width:600px;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
        
        const userInfo = report.user ? 
            report.user.email + (report.user.first_name ? ' (' + report.user.first_name + ' ' + report.user.last_name + ')' : '') : 
            'N/A';
        
        modalContent.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h2 style="margin:0;color:#333;">Report Details</h2>
                <button class="close-modal-btn" style="background:#dc3545;color:white;border:none;padding:5px 15px;border-radius:5px;cursor:pointer;font-size:18px;">×</button>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Report ID:</strong> ${report.id}
            </div>
            <div style="margin-bottom:15px;">
                <strong>User:</strong> ${escapeHtml(userInfo)}
            </div>
            <div style="margin-bottom:15px;">
                <strong>Type:</strong> <span class="report-status ${report.report_type}" style="padding:3px 10px;border-radius:3px;font-size:0.9em;">${escapeHtml(report.report_type)}</span>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Status:</strong> <span class="report-status ${report.status}" style="padding:3px 10px;border-radius:3px;font-size:0.9em;">${escapeHtml(report.status)}</span>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Title:</strong>
                <div style="padding:10px;background:#f8f9fa;border-radius:5px;margin-top:5px;">${escapeHtml(report.title)}</div>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Description:</strong>
                <div style="padding:10px;background:#f8f9fa;border-radius:5px;margin-top:5px;white-space:pre-wrap;">${escapeHtml(report.description)}</div>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Submitted:</strong> ${new Date(report.created_at).toLocaleString()}
            </div>
            <div style="margin-bottom:15px;">
                <strong>Last Updated:</strong> ${new Date(report.updated_at).toLocaleString()}
            </div>
            ${report.admin_reply ? `
            <div style="margin-top:20px;margin-bottom:15px;padding:15px;background:#e7f3ff;border-left:4px solid #007bff;border-radius:5px;">
                <strong style="display:block;margin-bottom:10px;color:#007bff;">Admin Reply:</strong>
                <div style="white-space:pre-wrap;color:#333;">${escapeHtml(report.admin_reply)}</div>
                <small style="color:#666;display:block;margin-top:10px;">
                    Replied: ${report.replied_at ? new Date(report.replied_at).toLocaleString() : 'N/A'}
                </small>
            </div>
            ` : `
            <div style="margin-top:20px;margin-bottom:15px;padding:15px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:5px;">
                <strong style="color:#856404;">No admin reply yet</strong>
            </div>
            `}
            <div style="margin-top:20px;text-align:right;">
                <button onclick="replyToReport('${report.id}'); this.closest('.report-details-modal').remove();" style="background:#17a2b8;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-right:10px;">${report.admin_reply ? 'Edit Reply' : 'Add Reply'}</button>
                <button class="close-modal-btn" style="background:#007bff;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Close</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Add event listeners to close buttons
        const closeButtons = modalContent.querySelectorAll('.close-modal-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                modal.remove();
            });
        });
        
        // Close on outside click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Close on Escape key
        const escapeHandler = function(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
    } catch (err) {
        console.error('Error viewing report details:', err);
        alert('Error loading report details: ' + err.message);
    }
}

async function replyToReport(reportId) {
    if (!reportId) {
        console.error('Missing reportId');
        return;
    }
    
    try {
        // Get current report and existing reply
        const { data: report, error: fetchError } = await supabase
            .from('student_reports')
            .select('*, user:users!user_id(email, first_name, last_name), replied_by_user:users!replied_by(email, first_name, last_name)')
            .eq('id', reportId)
            .single();
        
        if (fetchError) throw fetchError;
        
        if (!report) {
            alert('Report not found');
            return;
        }
        
        // Get current admin user
        const userEmail = sessionStorage.getItem('userEmail');
        const { data: currentAdmin } = await supabase
            .from('users')
            .select('id')
            .eq('email', userEmail)
            .single();
        
        // Create reply modal
        const modal = document.createElement('div');
        modal.className = 'report-reply-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:white;padding:30px;border-radius:10px;max-width:600px;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
        
        const userInfo = report.user ? 
            report.user.email + (report.user.first_name ? ' (' + report.user.first_name + ' ' + report.user.last_name + ')' : '') : 
            'N/A';
        
        modalContent.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h2 style="margin:0;color:#333;">${report.admin_reply ? 'Edit Reply' : 'Reply to Report'}</h2>
                <button class="close-reply-modal-btn" style="background:#dc3545;color:white;border:none;padding:5px 15px;border-radius:5px;cursor:pointer;font-size:18px;">×</button>
            </div>
            <div style="margin-bottom:15px;padding:10px;background:#f8f9fa;border-radius:5px;">
                <strong>Report from:</strong> ${escapeHtml(userInfo)}<br>
                <strong>Title:</strong> ${escapeHtml(report.title)}<br>
                <strong>Type:</strong> ${escapeHtml(report.report_type)}
            </div>
            ${report.admin_reply ? `
            <div style="margin-bottom:15px;padding:10px;background:#fff3cd;border-radius:5px;border-left:4px solid #ffc107;">
                <strong style="color:#856404;">Current Reply:</strong>
                <div style="margin-top:5px;white-space:pre-wrap;color:#333;">${escapeHtml(report.admin_reply)}</div>
                <small style="color:#666;display:block;margin-top:5px;">
                    Last replied: ${report.replied_at ? new Date(report.replied_at).toLocaleString() : 'N/A'}
                </small>
            </div>
            ` : ''}
            <div style="margin-bottom:15px;">
                <label for="replyText" style="display:block;margin-bottom:5px;font-weight:bold;">Your Reply:</label>
                <textarea id="replyText" rows="8" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:5px;font-family:inherit;box-sizing:border-box;" placeholder="Enter your reply to the student...">${report.admin_reply ? escapeHtml(report.admin_reply) : ''}</textarea>
            </div>
            <div style="margin-top:20px;text-align:right;">
                <button class="close-reply-modal-btn" style="background:#6c757d;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-right:10px;">Cancel</button>
                <button onclick="saveReply('${reportId}', ${currentAdmin ? "'" + currentAdmin.id + "'" : 'null'})" style="background:#17a2b8;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Save Reply</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Add event listeners to close buttons
        const closeButtons = modalContent.querySelectorAll('.close-reply-modal-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                modal.remove();
            });
        });
        
        // Close on outside click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // Close on Escape key
        const escapeHandler = function(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
    } catch (err) {
        console.error('Error opening reply modal:', err);
        alert('Error: ' + err.message);
    }
}

async function saveReply(reportId, adminId) {
    const replyTextarea = document.getElementById('replyText');
    
    if (!replyTextarea) {
        alert('Reply textarea not found');
        return;
    }
    
    const replyText = replyTextarea.value.trim();
    
    if (!replyText) {
        alert('Please enter a reply');
        return;
    }
    
    try {
        const updateData = {
            admin_reply: replyText,
            replied_at: new Date().toISOString()
        };
        
        if (adminId) {
            updateData.replied_by = adminId;
        }
        
        const { data, error } = await supabase
            .from('student_reports')
            .update(updateData)
            .eq('id', reportId)
            .select();
        
        if (error) throw error;
        
        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:10001;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Reply saved successfully!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        // Close modal
        const modal = document.querySelector('.report-reply-modal');
        if (modal) {
            modal.remove();
        }
        
        // Refresh reports list
        await viewAllReports();
        
    } catch (err) {
        console.error('Error saving reply:', err);
        alert('Error saving reply: ' + err.message);
    }
}

// Helper function to escape HTML (prevent XSS)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function viewLogs() {
    try {
        const { data: logs, error } = await supabase
            .from('actlog_iot')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        if (logs.length === 0) {
            document.getElementById('logData').innerHTML = '<p>No events yet.</p>';
            return;
        }
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Seat</th><th>Noise (dB)</th><th>RFID UID</th></tr></thead><tbody>';
        
        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleString();
            const eventIcon = log.event === 'login' ? '🔵' : log.event === 'logout' ? '🔴' : '🔊';
            
            html += '<tr>';
            html += '<td>' + time + '</td>';
            html += '<td>' + eventIcon + ' ' + log.event.toUpperCase() + '</td>';
            html += '<td>' + (log.name || 'N/A') + '</td>';
            html += '<td>' + (log.seat_number ? 'Seat ' + log.seat_number : '-') + '</td>';
            html += '<td>' + (log.decibel ? log.decibel + ' dB' : '-') + '</td>';
            html += '<td>' + (log.uid || 'N/A') + '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('logData').innerHTML = html;
    } catch (err) {
        document.getElementById('logData').innerHTML = 'Error: ' + err.message;
    }
}

async function viewOccupancy() {
    const occupancyDataDiv = document.getElementById('occupancyData');
    const tableSelect = document.getElementById('occupancyTableSelect');
    
    if (!tableSelect) {
        occupancyDataDiv.innerHTML = '<p>Error: Table selector not found</p>';
        return;
    }
    
    const selectedTable = tableSelect.value;
    
    // Check if it's a future expansion table
    const isFutureExpansion = selectedTable.startsWith('table-') && 
                              (selectedTable === 'table-2' || selectedTable === 'table-3' || selectedTable === 'table-4');
    
    if (isFutureExpansion) {
        occupancyDataDiv.innerHTML = 
            '<div style="padding:20px;background:#fff3cd;border-radius:5px;border:1px solid #ffc107;">' +
            '<h3 style="color:#856404;margin-top:0;">Future Expansion</h3>' +
            '<p style="color:#856404;">This table is planned for future expansion. Seat occupancy management will be available once the table is set up.</p>' +
            '</div>';
        return;
    }
    
    try {
        const { data: seats, error } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', selectedTable)
            .order('seat_number', { ascending: true });
        
        if (error) throw error;
        
        if (seats.length === 0) {
            occupancyDataDiv.innerHTML = '<p>No seats found for ' + selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) + '.</p>';
            return;
        }
        
        const tableName = selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()); // "table-1" -> "Table 1"
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr style="background:#333;color:white;"><th style="padding:10px;">Seat</th><th style="padding:10px;">Status</th><th style="padding:10px;">Occupied By</th><th style="padding:10px;">Occupied At</th><th style="padding:10px;">Actions</th></tr></thead><tbody>';
        
        seats.forEach(seat => {
            const seatId = seat.id || (selectedTable + '-seat-' + seat.seat_number);
            html += '<tr style="border-bottom:1px solid #ddd;">';
            html += '<td style="padding:10px;">' + tableName + ' - Seat ' + seat.seat_number + '</td>';
            html += '<td style="padding:10px;">' + (seat.is_occupied ? '<span style="color:red;font-weight:bold;">🔴 Occupied</span>' : '<span style="color:green;font-weight:bold;">🟢 Available</span>') + '</td>';
            html += '<td style="padding:10px;">' + (seat.occupied_by || '-') + '</td>';
            html += '<td style="padding:10px;">' + (seat.occupied_at ? new Date(seat.occupied_at).toLocaleString() : '-') + '</td>';
            html += '<td style="padding:10px;">';
            
            if (seat.is_occupied) {
                html += '<button onclick="toggleSeatOccupancy(\'' + selectedTable + '\', ' + seat.seat_number + ', false, \'' + seatId + '\')" class="danger" style="background:#dc3545;color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;">Free Seat</button>';
            } else {
                html += '<button onclick="toggleSeatOccupancy(\'' + selectedTable + '\', ' + seat.seat_number + ', true, \'' + seatId + '\')" style="background:#28a745;color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;">Occupy Seat</button>';
            }
            
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        occupancyDataDiv.innerHTML = html;
    } catch (err) {
        console.error('Error loading occupancy:', err);
        occupancyDataDiv.innerHTML = 
            '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
            '<p style="color:#721c24;margin:0;">Error loading occupancy data: ' + err.message + '</p>' +
            '</div>';
    }
}

async function toggleSeatOccupancy(tableId, seatNumber, occupy, seatId) {
    const action = occupy ? 'occupy' : 'free';
    const confirmMessage = occupy 
        ? `Are you sure you want to manually occupy Seat ${seatNumber} on ${tableId.replace('-', ' ')}?`
        : `Are you sure you want to free Seat ${seatNumber} on ${tableId.replace('-', ' ')}?`;
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const updateData = {
            is_occupied: occupy,
            table_id: tableId,
            seat_number: seatNumber
        };
        
        if (occupy) {
            // When occupying, set occupied_by to "ADMIN" and let trigger set occupied_at
            updateData.occupied_by = 'ADMIN';
        } else {
            // When freeing, clear occupied_by and let trigger set freed_at
            updateData.occupied_by = null;
        }
        
        // Try to update existing seat first
        const { data: updated, error: updateError } = await supabase
            .from('occupancy')
            .update(updateData)
            .eq('table_id', tableId)
            .eq('seat_number', seatNumber)
            .select();
        
        if (updateError) {
            // If update fails, try to upsert
            console.log('Update failed, trying upsert...', updateError);
            
            const { data: upserted, error: upsertError } = await supabase
                .from('occupancy')
                .upsert({
                    ...updateData,
                    id: seatId
                }, {
                    onConflict: 'table_id,seat_number'
                })
                .select();
            
            if (upsertError) throw upsertError;
            
            console.log('Seat occupancy toggled via upsert:', upserted);
        } else {
            console.log('Seat occupancy toggled via update:', updated);
        }
        
        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Seat ' + (occupy ? 'occupied' : 'freed') + ' successfully!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        // Refresh the occupancy view
        await viewOccupancy();
        
    } catch (err) {
        console.error('Error toggling seat occupancy:', err);
        alert('Error: ' + err.message);
    }
}

async function viewNoiseLevel() {
    const noiseDataDiv = document.getElementById('noiseData');
    const tableSelect = document.getElementById('noiseTableSelect');
    
    if (!tableSelect) {
        noiseDataDiv.innerHTML = '<p>Error: Table selector not found</p>';
        return;
    }
    
    const selectedTable = tableSelect.value;
    
    // Check if it's a future expansion table
    const isFutureExpansion = selectedTable.startsWith('table-') && 
                              (selectedTable === 'table-2' || selectedTable === 'table-3' || selectedTable === 'table-4');
    
    if (isFutureExpansion) {
        noiseDataDiv.innerHTML = 
            '<div style="padding:20px;background:#fff3cd;border-radius:5px;border:1px solid #ffc107;">' +
            '<h3 style="color:#856404;margin-top:0;">Future Expansion</h3>' +
            '<p style="color:#856404;">This table is planned for future expansion. Noise monitoring will be available once the table is set up.</p>' +
            '</div>';
        return;
    }
    
    try {
        const { data: noise, error } = await supabase
            .from('noise_log')
            .select('*')
            .eq('table_id', selectedTable)
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                noiseDataDiv.innerHTML = 
                    '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
                    '<p style="color:#721c24;margin:0;">No noise data available yet for ' + selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) + '.</p>' +
                    '</div>';
            } else {
                throw error;
            }
            return;
        }
        
        const lastUpdate = noise.updated_at ? new Date(noise.updated_at).toLocaleString() : 'N/A';
        const tableName = selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()); // "table-1" -> "Table 1"
        
        noiseDataDiv.innerHTML = 
            '<div style="padding:20px;background:white;border-radius:5px;border:1px solid #ddd;">' +
            '<h3 style="margin-top:0;color:#333;">' + tableName + '</h3>' +
            '<div style="margin:15px 0;">' +
            '<span style="font-size:2em;color:#28a745;font-weight:bold;">' + noise.decibel + ' dB</span>' +
            '</div>' +
            '<p style="color:#666;margin:0;"><small>Last Updated: ' + lastUpdate + '</small></p>' +
            '</div>';
    } catch (err) {
        console.error('Error loading noise level:', err);
        noiseDataDiv.innerHTML = 
            '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
            '<p style="color:#721c24;margin:0;">Error loading noise data: ' + err.message + '</p>' +
            '</div>';
    }
}

async function logout() {
    // Sign out from Supabase Auth
    await supabase.auth.signOut();
    
    // Clear session storage
    sessionStorage.removeItem('userEmail');
    
    // Redirect to login
    window.location.href = 'login.html';
}

// ========== ANNOUNCEMENTS MANAGEMENT ==========

// Initialize announcement form character counter
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('announcementMessage');
    if (messageInput) {
        const charCount = document.getElementById('charCount');
        messageInput.addEventListener('input', () => {
            if (charCount) charCount.textContent = messageInput.value.length;
        });
    }

    // Announcement form submission
    const announcementForm = document.getElementById('announcementForm');
    if (announcementForm) {
        announcementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createAnnouncement();
        });
    }
});

async function loadAnnouncements() {
    try {
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('*')
            .order('is_priority', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        // Filter out expired announcements client-side
        const data = announcements ? announcements.filter(ann => {
            if (!ann.expires_at) return true;
            return new Date(ann.expires_at) > new Date();
        }) : [];

        const container = document.getElementById('announcementsList');
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No announcements yet. Create one above!</p>';
            return;
        }

        container.innerHTML = data.map(ann => {
            const createdAt = new Date(ann.created_at).toLocaleString();
            const expiresAt = ann.expires_at ? new Date(ann.expires_at).toLocaleString() : null;
            const isExpired = ann.expires_at ? new Date(ann.expires_at) < new Date() : false;

            return `
                <div class="p-4 rounded-lg border ${ann.is_priority ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white'} ${isExpired ? 'opacity-60' : ''}">
                    <div class="flex items-start justify-between gap-3 mb-2">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold ${ann.is_priority ? 'text-rose-700' : 'setup-title-color'}">${escapeHtml(ann.title || 'Untitled')}</h4>
                                ${ann.is_priority ? '<span class="px-2 py-0.5 text-xs rounded bg-rose-200 text-rose-800 font-medium">Priority</span>' : ''}
                                ${isExpired ? '<span class="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">Expired</span>' : ''}
                            </div>
                            <p class="text-sm text-gray-600 mb-2 whitespace-pre-wrap">${escapeHtml(ann.message || '')}</p>
                            <div class="text-xs text-gray-500">
                                Created: ${createdAt}
                                ${expiresAt ? ` • Expires: ${expiresAt}` : ''}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="deleteAnnouncement('${ann.id}')" 
                                    class="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Reinitialize Lucide icons for the new buttons
        if (window.lucide) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    } catch (err) {
        console.error('Error loading announcements:', err);
        const container = document.getElementById('announcementsList');
        if (container) {
            container.innerHTML = `<p class="text-red-500 text-sm text-center py-4">Error loading announcements: ${err.message}</p>`;
        }
    }
}

async function createAnnouncement() {
    const titleInput = document.getElementById('announcementTitle');
    const messageInput = document.getElementById('announcementMessage');
    const priorityCheck = document.getElementById('announcementPriority');
    const expiresInput = document.getElementById('announcementExpires');
    const resultDiv = document.getElementById('announcementResult');

    if (!titleInput || !messageInput) return;

    const title = titleInput.value.trim();
    const message = messageInput.value.trim();
    const isPriority = priorityCheck ? priorityCheck.checked : false;
    const expiresAt = expiresInput && expiresInput.value ? new Date(expiresInput.value).toISOString() : null;

    if (!title || !message) {
        if (resultDiv) {
            resultDiv.innerHTML = '<span class="text-red-600">Please fill in both title and message.</span>';
        }
        return;
    }

    try {
        // Get current user ID
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // Verify admin status before creating
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_admin')
            .eq('email', session.user.email)
            .single();

        if (userError || !user || !user.is_admin) {
            throw new Error('Admin privileges required');
        }

        const { data, error } = await supabase
            .from('announcements')
            .insert([
                {
                    title: title,
                    message: message,
                    is_priority: isPriority,
                    created_by: session.user.id,
                    expires_at: expiresAt
                }
            ])
            .select()
            .single();

        if (error) throw error;

        if (resultDiv) {
            resultDiv.innerHTML = '<span class="text-green-600">Announcement posted successfully!</span>';
        }

        // Clear form
        clearAnnouncementForm();

        // Reload announcements list
        setTimeout(() => {
            loadAnnouncements();
            if (resultDiv) resultDiv.innerHTML = '';
        }, 1500);
    } catch (err) {
        console.error('Error creating announcement:', err);
        if (resultDiv) {
            resultDiv.innerHTML = `<span class="text-red-600">Error: ${err.message}</span>`;
        }
    }
}

function clearAnnouncementForm() {
    const titleInput = document.getElementById('announcementTitle');
    const messageInput = document.getElementById('announcementMessage');
    const priorityCheck = document.getElementById('announcementPriority');
    const expiresInput = document.getElementById('announcementExpires');
    const charCount = document.getElementById('charCount');
    const resultDiv = document.getElementById('announcementResult');

    if (titleInput) titleInput.value = '';
    if (messageInput) messageInput.value = '';
    if (priorityCheck) priorityCheck.checked = false;
    if (expiresInput) expiresInput.value = '';
    if (charCount) charCount.textContent = '0';
    if (resultDiv) resultDiv.innerHTML = '';
}


async function deleteAnnouncement(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
        // First verify admin status
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_admin')
            .eq('email', session.user.email)
            .single();

        if (userError || !user || !user.is_admin) {
            throw new Error('Admin privileges required');
        }

        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) throw error;

        loadAnnouncements();
    } catch (err) {
        console.error('Error deleting announcement:', err);
        alert('Error deleting announcement: ' + err.message);
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
