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
    
    // User is admin, load reports
    viewAllReports();
});

// Global variables for filtering and sorting
let currentFilters = null;
let currentSortColumn = 'created_at';
let currentSortDirection = 'desc';

async function viewAllReports(filters = null, sortColumn = 'created_at', sortDirection = 'desc') {
    try {
        currentFilters = filters;
        currentSortColumn = sortColumn;
        currentSortDirection = sortDirection;
        
        // Build query
        let query = supabase
            .from('student_reports')
            .select('*, user:users!user_id(email), replied_by_user:users!replied_by(email)');
        
        // Apply filters if provided
        if (filters) {
            if (filters.user && filters.user !== '') {
                // Need to filter by user email - this requires a different approach
                // We'll filter client-side for user email, or use a subquery
                // For now, we'll get all and filter client-side
            }
            
            if (filters.status && filters.status !== '') {
                query = query.eq('status', filters.status);
            }
            
            if (filters.type && filters.type !== '') {
                query = query.eq('report_type', filters.type);
            }
            
            if (filters.dateFrom) {
                query = query.gte('created_at', filters.dateFrom);
            }
            
            if (filters.dateTo) {
                const endDate = new Date(filters.dateTo);
                endDate.setHours(23, 59, 59, 999);
                query = query.lte('created_at', endDate.toISOString());
            }
            
            if (filters.title && filters.title !== '') {
                query = query.ilike('title', '%' + filters.title + '%');
            }
            
            if (filters.hasReply === 'yes') {
                query = query.not('admin_reply', 'is', null);
            } else if (filters.hasReply === 'no') {
                query = query.is('admin_reply', null);
            }
        }
        
        // Apply sorting (skip if sorting by user - we'll sort client-side)
        if (sortColumn !== 'user') {
            query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
        }
        
        const { data: reports, error } = await query;
        
        if (error) throw error;
        
        // Filter by user email if specified (client-side filter)
        let filteredReports = reports || [];
        if (filters && filters.user && filters.user !== '') {
            filteredReports = filteredReports.filter(report => {
                if (!report.user) return false;
                return report.user.email && report.user.email.toLowerCase().includes(filters.user.toLowerCase());
            });
        }
        
        // Update statistics (always, even if no reports)
        updateStatistics(filteredReports);
        
        // Show search info if filters are active
        const searchInfo = document.getElementById('searchInfo');
        if (filters && hasActiveFilters(filters)) {
            const filterCount = countActiveFilters(filters);
            searchInfo.classList.remove('hidden');
            searchInfo.innerHTML = `🔍 Showing filtered results (${filteredReports.length} report${filteredReports.length !== 1 ? 's' : ''} found) - ${filterCount} filter${filterCount !== 1 ? 's' : ''} applied. <a href="javascript:void(0)" onclick="clearSearch()" style="color:#007bff;text-decoration:underline;">Clear filters</a>`;
        } else {
            searchInfo.classList.add('hidden');
        }
        
        if (!filteredReports || filteredReports.length === 0) {
            if (filters && hasActiveFilters(filters)) {
                document.getElementById('reportsData').innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No reports found matching your search criteria.</p>';
            } else {
                document.getElementById('reportsData').innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No reports submitted yet.</p>';
            }
            return;
        }
        
        // Sort client-side if sorting by user (nested field)
        if (sortColumn === 'user') {
            filteredReports.sort((a, b) => {
                const emailA = a.user ? (a.user.email || '').toLowerCase() : '';
                const emailB = b.user ? (b.user.email || '').toLowerCase() : '';
                if (sortDirection === 'asc') {
                    return emailA.localeCompare(emailB);
                } else {
                    return emailB.localeCompare(emailA);
                }
            });
        }
        
        let html = '<table class="reports-table"><thead><tr>';
        html += '<th onclick="sortTable(\'created_at\')">Date ' + getSortIcon('created_at') + '</th>';
        html += '<th onclick="sortTable(\'user\')">User ' + getSortIcon('user') + '</th>';
        html += '<th onclick="sortTable(\'report_type\')">Type ' + getSortIcon('report_type') + '</th>';
        html += '<th onclick="sortTable(\'title\')">Title ' + getSortIcon('title') + '</th>';
        html += '<th onclick="sortTable(\'status\')">Status ' + getSortIcon('status') + '</th>';
        html += '<th>Actions</th>';
        html += '</tr></thead><tbody>';
        
        filteredReports.forEach(report => {
            const date = new Date(report.created_at).toLocaleString();
            const reportId = String(report.id);
            
            html += '<tr>';
            html += '<td>' + date + '</td>';
            html += '<td>' + (report.user ? escapeHtml(report.user.email) : 'N/A') + '</td>';
            html += '<td><span style="text-transform:capitalize;">' + escapeHtml(report.report_type) + '</span></td>';
            html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(report.title) + '">' + escapeHtml(report.title) + '</td>';
            html += '<td><span class="report-status ' + report.status + '">' + escapeHtml(report.status) + '</span></td>';
            html += '<td><div class="action-buttons">';
            html += '<select class="status-select" onchange="updateReportStatus(\'' + reportId.replace(/'/g, "\\'") + '\', this.value)">';
            html += '<option value="pending" ' + (report.status === 'pending' ? 'selected' : '') + '>Pending</option>';
            html += '<option value="reviewing" ' + (report.status === 'reviewing' ? 'selected' : '') + '>Reviewing</option>';
            html += '<option value="resolved" ' + (report.status === 'resolved' ? 'selected' : '') + '>Resolved</option>';
            html += '<option value="dismissed" ' + (report.status === 'dismissed' ? 'selected' : '') + '>Dismissed</option>';
            html += '</select>';
            html += '<button class="btn-view" onclick="viewReportDetails(\'' + reportId.replace(/'/g, "\\'") + '\')">View</button>';
            html += '<button class="btn-reply" onclick="replyToReport(\'' + reportId.replace(/'/g, "\\'") + '\')">' + (report.admin_reply ? 'Edit Reply' : 'Reply') + '</button>';
            html += '</div></td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('reportsData').innerHTML = html;
    } catch (err) {
        document.getElementById('reportsData').innerHTML = '<p style="color:red;padding:20px;">Error: ' + err.message + '</p>';
    }
}

function updateStatistics(reports) {
    const counts = {
        pending: 0,
        reviewing: 0,
        resolved: 0,
        dismissed: 0
    };
    
    reports.forEach(report => {
        if (counts.hasOwnProperty(report.status)) {
            counts[report.status]++;
        }
    });
    
    document.getElementById('statPending').textContent = counts.pending;
    document.getElementById('statReviewing').textContent = counts.reviewing;
    document.getElementById('statResolved').textContent = counts.resolved;
    document.getElementById('statDismissed').textContent = counts.dismissed;
}

function toggleSearch() {
    const form = document.getElementById('searchForm');
    const toggle = document.getElementById('searchToggle');
    form.classList.toggle('active');
    toggle.classList.toggle('active');
    
    if (form.classList.contains('active')) {
        toggle.textContent = '✖️ Close Search';
    } else {
        toggle.textContent = '🔍 Advanced Search';
    }
}

function performSearch() {
    const filters = {
        user: document.getElementById('searchUser').value.trim(),
        status: document.getElementById('searchStatus').value,
        type: document.getElementById('searchType').value,
        dateFrom: document.getElementById('searchDateFrom').value,
        dateTo: document.getElementById('searchDateTo').value,
        title: document.getElementById('searchTitle').value.trim(),
        hasReply: document.getElementById('searchHasReply').value
    };
    
    // Convert empty strings to null
    Object.keys(filters).forEach(key => {
        if (filters[key] === '') {
            filters[key] = null;
        }
    });
    
    // Convert datetime-local to ISO string
    if (filters.dateFrom) {
        filters.dateFrom = new Date(filters.dateFrom).toISOString();
    }
    if (filters.dateTo) {
        filters.dateTo = new Date(filters.dateTo).toISOString();
    }
    
    // Update quick filter buttons
    updateFilterButtons(filters.status || '');
    
    viewAllReports(filters, currentSortColumn, currentSortDirection);
}

function clearSearch() {
    document.getElementById('searchUser').value = '';
    document.getElementById('searchStatus').value = '';
    document.getElementById('searchType').value = '';
    document.getElementById('searchDateFrom').value = '';
    document.getElementById('searchDateTo').value = '';
    document.getElementById('searchTitle').value = '';
    document.getElementById('searchHasReply').value = '';
    
    currentFilters = null;
    updateFilterButtons('');
    viewAllReports();
}

function filterByStatus(status) {
    updateFilterButtons(status);
    
    if (status === '') {
        clearSearch();
    } else {
        const filters = {
            status: status,
            user: null,
            type: null,
            dateFrom: null,
            dateTo: null,
            title: null,
            hasReply: null
        };
        viewAllReports(filters, currentSortColumn, currentSortDirection);
    }
}

function updateFilterButtons(activeStatus) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (activeStatus === '') {
        document.querySelector('.filter-btn.all').classList.add('active');
    } else {
        document.querySelector('.filter-btn.' + activeStatus).classList.add('active');
    }
}

function sortTable(column) {
    // For user column, we need to sort client-side since it's a nested field
    if (column === 'user') {
        // Toggle sort direction if clicking the same column
        if (currentSortColumn === column) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortDirection = 'asc';
        }
    } else {
        // For database columns, use server-side sorting
        // Toggle sort direction if clicking the same column
        if (currentSortColumn === column) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortColumn = column;
            currentSortDirection = 'asc';
        }
    }
    
    viewAllReports(currentFilters, currentSortColumn, currentSortDirection);
}

function getSortIcon(column) {
    if (currentSortColumn !== column) return '';
    return currentSortDirection === 'asc' ? '▲' : '▼';
}

function hasActiveFilters(filters) {
    return Object.values(filters).some(val => val !== null && val !== '');
}

function countActiveFilters(filters) {
    return Object.values(filters).filter(val => val !== null && val !== '').length;
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
        
        // Refresh the reports list (preserve current filters and sort)
        await viewAllReports(currentFilters, currentSortColumn, currentSortDirection);
        
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

