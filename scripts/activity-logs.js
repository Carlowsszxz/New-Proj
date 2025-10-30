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
    
    // User is admin, load logs automatically
    viewLogs();
});

let currentFilters = null;

async function viewLogs(filters = null) {
    try {
        currentFilters = filters;
        
        // Build query
        let query = supabase
            .from('actlog_iot')
            .select('*');
        
        // Apply filters if provided
        if (filters) {
            if (filters.userName) {
                // Use ilike for case-insensitive partial match
                query = query.ilike('name', '%' + filters.userName + '%');
            }
            
            if (filters.event && filters.event !== '') {
                query = query.eq('event', filters.event);
            }
            
            if (filters.dateFrom) {
                query = query.gte('created_at', filters.dateFrom);
            }
            
            if (filters.dateTo) {
                // Add one day to include the entire end date
                const endDate = new Date(filters.dateTo);
                endDate.setHours(23, 59, 59, 999);
                query = query.lte('created_at', endDate.toISOString());
            }
            
            if (filters.seat && filters.seat !== '') {
                query = query.eq('seat_number', parseInt(filters.seat));
            }
            
            if (filters.rfid && filters.rfid !== '') {
                query = query.ilike('uid', '%' + filters.rfid + '%');
            }
            
            if (filters.noiseMin !== null && filters.noiseMin !== '') {
                query = query.gte('decibel', parseFloat(filters.noiseMin));
            }
            
            if (filters.noiseMax !== null && filters.noiseMax !== '') {
                query = query.lte('decibel', parseFloat(filters.noiseMax));
            }
        }
        
        // Order by date descending and limit
        query = query.order('created_at', { ascending: false }).limit(500);
        
        const { data: logs, error } = await query;
        
        if (error) throw error;
        
        // Show search info if filters are active
        const searchInfo = document.getElementById('searchInfo');
        if (filters && hasActiveFilters(filters)) {
            const filterCount = countActiveFilters(filters);
            searchInfo.classList.remove('hidden');
            searchInfo.innerHTML = `🔍 Showing filtered results (${logs ? logs.length : 0} event${logs && logs.length !== 1 ? 's' : ''} found) - ${filterCount} filter${filterCount !== 1 ? 's' : ''} applied. <a href="javascript:void(0)" onclick="clearSearch()" style="color:#007bff;text-decoration:underline;">Clear filters</a>`;
        } else {
            searchInfo.classList.add('hidden');
        }
        
        if (!logs || logs.length === 0) {
            if (filters && hasActiveFilters(filters)) {
                document.getElementById('logData').innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No events found matching your search criteria.</p>';
            } else {
                document.getElementById('logData').innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No events yet.</p>';
            }
            return;
        }
        
        let html = '<table class="logs-table"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Seat</th><th>Noise (dB)</th><th>RFID UID</th></tr></thead><tbody>';
        
        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleString();
            const eventIcon = log.event === 'login' ? '🔵' : log.event === 'logout' ? '🔴' : '🔊';
            const eventText = log.event === 'login' ? 'LOGIN' : log.event === 'logout' ? 'LOGOUT' : log.event.toUpperCase();
            const eventClass = log.event === 'login' ? 'event-login' : log.event === 'logout' ? 'event-logout' : 'event-noise';
            
            html += '<tr>';
            html += '<td>' + time + '</td>';
            html += '<td class="' + eventClass + '">' + eventIcon + ' ' + escapeHtml(eventText) + '</td>';
            html += '<td>' + escapeHtml(log.name || 'N/A') + '</td>';
            html += '<td>' + (log.seat_number ? 'Seat ' + log.seat_number : '-') + '</td>';
            html += '<td>' + (log.decibel !== null && log.decibel !== undefined ? log.decibel + ' dB' : '-') + '</td>';
            html += '<td>' + escapeHtml(log.uid || 'N/A') + '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('logData').innerHTML = html;
    } catch (err) {
        console.error('Error loading logs:', err);
        document.getElementById('logData').innerHTML = '<p style="color:red;padding:20px;">Error loading logs: ' + err.message + '</p>';
    }
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
        userName: document.getElementById('searchUserName').value.trim(),
        event: document.getElementById('searchEvent').value,
        dateFrom: document.getElementById('searchDateFrom').value,
        dateTo: document.getElementById('searchDateTo').value,
        seat: document.getElementById('searchSeat').value.trim(),
        rfid: document.getElementById('searchRfid').value.trim(),
        noiseMin: document.getElementById('searchNoiseMin').value.trim(),
        noiseMax: document.getElementById('searchNoiseMax').value.trim()
    };
    
    // Convert empty strings to null for cleaner checks
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
    
    viewLogs(filters);
}

function clearSearch() {
    document.getElementById('searchUserName').value = '';
    document.getElementById('searchEvent').value = '';
    document.getElementById('searchDateFrom').value = '';
    document.getElementById('searchDateTo').value = '';
    document.getElementById('searchSeat').value = '';
    document.getElementById('searchRfid').value = '';
    document.getElementById('searchNoiseMin').value = '';
    document.getElementById('searchNoiseMax').value = '';
    
    currentFilters = null;
    viewLogs();
}

function hasActiveFilters(filters) {
    return Object.values(filters).some(val => val !== null && val !== '');
}

function countActiveFilters(filters) {
    return Object.values(filters).filter(val => val !== null && val !== '').length;
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

