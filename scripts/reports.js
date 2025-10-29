// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUserId = null;

// Check authentication on page load
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
        console.log('No user found, redirecting to login...');
        window.location.href = 'login.html';
        return;
    }
    
    // Verify user exists in database and get user ID
    const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('email', userEmail)
        .single();
    
    if (userError || !existingUser) {
        // User was deleted, clear everything and redirect
        console.log('User was deleted from database, signing out...');
        await supabase.auth.signOut();
        sessionStorage.removeItem('userEmail');
        window.location.href = 'login.html';
        return;
    }
    
    currentUserId = existingUser.id;
    
    // Load submitted reports
    await loadMyReports();
});

async function submitReport() {
    const errorDiv = document.getElementById('reportError');
    const successDiv = document.getElementById('reportSuccess');
    const reportForm = document.getElementById('reportForm');
    
    // Clear previous messages
    errorDiv.textContent = '';
    successDiv.textContent = '';
    
    if (!currentUserId) {
        errorDiv.textContent = 'Error: User not found. Please log in again.';
        return;
    }
    
    const reportType = document.getElementById('reportType').value;
    const title = document.getElementById('reportTitle').value.trim();
    const description = document.getElementById('reportDescription').value.trim();
    
    if (!reportType || !title || !description) {
        errorDiv.textContent = 'Please fill in all fields.';
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('student_reports')
            .insert([
                {
                    user_id: currentUserId,
                    report_type: reportType,
                    title: title,
                    description: description,
                    status: 'pending'
                }
            ])
            .select();
        
        if (error) throw error;
        
        // Success
        successDiv.textContent = 'Report submitted successfully!';
        reportForm.reset();
        
        // Reload reports list
        await loadMyReports();
        
        // Clear success message after 3 seconds
        setTimeout(() => {
            successDiv.textContent = '';
        }, 3000);
        
    } catch (err) {
        console.error('Error submitting report:', err);
        errorDiv.textContent = 'Error submitting report: ' + (err.message || 'Unknown error');
    }
}

async function loadMyReports() {
    const reportsListDiv = document.getElementById('reportsList');
    
    if (!currentUserId) {
        reportsListDiv.innerHTML = '<p>Error: User not found.</p>';
        return;
    }
    
    try {
        const { data: reports, error } = await supabase
            .from('student_reports')
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!reports || reports.length === 0) {
            reportsListDiv.innerHTML = '<p>No reports submitted yet.</p>';
            return;
        }
        
        // Display reports
        let html = '';
        reports.forEach(report => {
            const date = formatDate(report.created_at);
            const replyDate = report.replied_at ? formatDate(report.replied_at) : null;
            
            html += `
                <div class="report-card">
                    <div class="report-header">
                        <span class="report-type ${report.report_type}">${report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1)}</span>
                        <span class="report-status ${report.status}">${report.status.charAt(0).toUpperCase() + report.status.slice(1)}</span>
                    </div>
                    <div class="report-title">${escapeHtml(report.title)}</div>
                    <div class="report-description">${escapeHtml(report.description)}</div>
                    <div class="report-date">Submitted: ${date}</div>
                    ${report.admin_reply ? `
                    <div style="margin-top:15px;padding:15px;background:#e7f3ff;border-left:4px solid #007bff;border-radius:5px;">
                        <div style="display:flex;align-items:center;margin-bottom:10px;">
                            <strong style="color:#007bff;font-size:1.1em;">📩 Admin Reply</strong>
                        </div>
                        <div style="white-space:pre-wrap;color:#333;margin-bottom:8px;line-height:1.6;">${escapeHtml(report.admin_reply)}</div>
                        <small style="color:#666;">Replied: ${replyDate}</small>
                    </div>
                    ` : `
                    <div style="margin-top:15px;padding:10px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:5px;">
                        <small style="color:#856404;">⏳ Waiting for admin response...</small>
                    </div>
                    `}
                </div>
            `;
        });
        
        reportsListDiv.innerHTML = html;
        
    } catch (err) {
        console.error('Error loading reports:', err);
        reportsListDiv.innerHTML = '<p>Error loading reports: ' + (err.message || 'Unknown error') + '</p>';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
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
