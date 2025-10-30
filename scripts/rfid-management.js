// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let allUsers = []; // Store all users for searching

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
    viewAllRfid();
});

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Store all users for searching
        allUsers = data || [];
        
        // Populate dropdown
        populateUserDropdown(allUsers);
        
    } catch (err) {
        console.error('Error loading users:', err);
        alert('Error loading users: ' + err.message);
    }
}

function populateUserDropdown(users) {
    const dropdown = document.getElementById('userDropdown');
    dropdown.innerHTML = '';
    
    if (!users || users.length === 0) {
        dropdown.innerHTML = '<div style="padding:10px;color:#666;">No users found</div>';
        return;
    }
    
    users.forEach(user => {
        const name = (user.first_name || '') + ' ' + (user.last_name || '');
        const displayText = user.email + (name.trim() ? ' (' + name.trim() + ')' : '') + (user.is_admin ? ' [ADMIN]' : '');
        
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid #eee;';
        item.className = 'user-dropdown-item';
        item.innerHTML = displayText;
        
        item.addEventListener('mouseenter', function() {
            this.style.background = '#f0f0f0';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.background = 'white';
        });
        
        item.addEventListener('click', function() {
            selectUser(user.id, displayText);
        });
        
        dropdown.appendChild(item);
    });
}

function selectUser(userId, displayText) {
    document.getElementById('userSelect').value = userId;
    document.getElementById('userSearch').value = displayText;
    document.getElementById('clearUserBtn').style.display = 'block';
    hideUserDropdown();
}

function clearUserSelection() {
    document.getElementById('userSelect').value = '';
    document.getElementById('userSearch').value = '';
    document.getElementById('clearUserBtn').style.display = 'none';
    hideUserDropdown();
}

function filterUsers() {
    const searchInput = document.getElementById('userSearch');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const clearBtn = document.getElementById('clearUserBtn');
    const selectedUserId = document.getElementById('userSelect').value;
    
    // If user types something new (different from selected user's display), clear selection
    if (selectedUserId && searchTerm) {
        const selectedUser = allUsers.find(u => u.id === selectedUserId);
        if (selectedUser) {
            const selectedDisplay = selectedUser.email + ((selectedUser.first_name || selectedUser.last_name) ? ' (' + (selectedUser.first_name || '') + ' ' + (selectedUser.last_name || '') + ')' : '');
            if (searchInput.value !== selectedDisplay) {
                document.getElementById('userSelect').value = '';
            }
        }
    }
    
    // Show/hide clear button
    if (searchTerm || document.getElementById('userSelect').value) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }
    
    // If search is empty and no user selected, show all users
    if (!searchTerm && !document.getElementById('userSelect').value) {
        populateUserDropdown(allUsers);
        showUserDropdown();
        return;
    }
    
    // If user is already selected and search matches, don't show dropdown
    if (document.getElementById('userSelect').value && !searchTerm) {
        hideUserDropdown();
        return;
    }
    
    // Filter users based on search
    const filtered = allUsers.filter(user => {
        const email = (user.email || '').toLowerCase();
        const firstName = (user.first_name || '').toLowerCase();
        const lastName = (user.last_name || '').toLowerCase();
        const fullName = (firstName + ' ' + lastName).trim();
        
        return email.includes(searchTerm) || firstName.includes(searchTerm) || lastName.includes(searchTerm) || fullName.includes(searchTerm);
    });
    
    populateUserDropdown(filtered);
    showUserDropdown();
}

function showUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    
    if (allUsers.length > 0) {
        dropdown.style.display = 'block';
    }
}

function hideUserDropdown() {
    document.getElementById('userDropdown').style.display = 'none';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const searchBox = document.getElementById('userSearch');
    const dropdown = document.getElementById('userDropdown');
    
    if (searchBox && dropdown && !searchBox.contains(event.target) && !dropdown.contains(event.target)) {
        hideUserDropdown();
    }
});

async function assignRfid() {
    const rfidUid = document.getElementById('rfidUid').value.trim().toUpperCase();
    const userId = document.getElementById('userSelect').value;
    
    if (!rfidUid || !userId) {
        alert('Please enter RFID UID and select a user');
        return;
    }
    
    try {
        // Check if RFID UID is already assigned to a different user
        const { data: existingRfid, error: rfidCheckError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('rfid_uid', rfidUid)
            .maybeSingle();
        
        // If error is not a "not found" error, handle it
        if (rfidCheckError && rfidCheckError.code !== 'PGRST116') {
            throw rfidCheckError;
        }
        
        if (existingRfid && existingRfid.user_id !== userId) {
            document.getElementById('rfidResult').textContent = '❌ This RFID card is already assigned to another user!';
            return;
        }
        
        // Check if this user already has an RFID card (active or inactive)
        const { data: userRfidCards } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (userRfidCards && userRfidCards.length > 0) {
            // User already has an RFID card - UPDATE it instead of creating new one
            const existingCard = userRfidCards[0];
            
            const { data, error } = await supabase
                .from('rfid_cards')
                .update({ 
                    rfid_uid: rfidUid, 
                    is_active: true 
                })
                .eq('id', existingCard.id)
                .select();
            
            if (error) throw error;
            
            document.getElementById('rfidResult').textContent = '✅ RFID card updated for this user!';
        } else {
            // User doesn't have an RFID card - create new one
            const { data, error } = await supabase
                .from('rfid_cards')
                .insert({ 
                    rfid_uid: rfidUid, 
                    user_id: userId, 
                    is_active: true 
                })
                .select();
            
            if (error) throw error;
            
            document.getElementById('rfidResult').textContent = '✅ RFID card assigned!';
        }
        
        document.getElementById('rfidUid').value = '';
        clearUserSelection();
        loadUsers();
        viewAllRfid();
        
    } catch (err) {
        console.error('Error assigning RFID:', err);
        document.getElementById('rfidResult').textContent = 'Error: ' + err.message;
    }
}

async function viewAllRfid() {
    try {
        const { data: rfidCards, error } = await supabase
            .from('rfid_cards')
            .select('*, user:users!user_id(email, first_name, last_name)')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!rfidCards || rfidCards.length === 0) {
            document.getElementById('allRfidData').innerHTML = '<p>No RFID cards found.</p>';
            return;
        }
        
        let html = '<table border="1" style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr style="background:#333;color:white;"><th style="padding:10px;">RFID UID</th><th style="padding:10px;">User</th><th style="padding:10px;">Status</th><th style="padding:10px;">Created</th><th style="padding:10px;">Actions</th></tr></thead><tbody>';
        
        rfidCards.forEach(card => {
            const user = card.user;
            const createdDate = new Date(card.created_at).toLocaleDateString();
            html += '<tr style="border-bottom:1px solid #ddd;">';
            html += '<td style="padding:10px;font-family:monospace;font-weight:bold;">' + card.rfid_uid + '</td>';
            html += '<td style="padding:10px;">' + (user ? user.email : 'N/A') + '</td>';
            html += '<td style="padding:10px;">' + (card.is_active ? '<span style="color:green;font-weight:bold;">🟢 Active</span>' : '<span style="color:red;font-weight:bold;">🔴 Inactive</span>') + '</td>';
            html += '<td style="padding:10px;">' + createdDate + '</td>';
            html += '<td style="padding:10px;">';
            html += '<button onclick="toggleRfidStatus(\'' + card.id + '\', ' + !card.is_active + ')" style="background:' + (card.is_active ? '#dc3545' : '#28a745') + ';color:white;border:none;padding:5px 15px;border-radius:3px;cursor:pointer;">';
            html += card.is_active ? 'Deactivate' : 'Activate';
            html += '</button>';
            html += '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('allRfidData').innerHTML = html;
    } catch (err) {
        console.error('Error loading RFID cards:', err);
        document.getElementById('allRfidData').innerHTML = '<p>Error loading RFID cards: ' + err.message + '</p>';
    }
}

async function toggleRfidStatus(rfidId, activate) {
    if (!confirm('Are you sure you want to ' + (activate ? 'activate' : 'deactivate') + ' this RFID card?')) {
        return;
    }
    
    try {
        const { error } = await supabase
            .from('rfid_cards')
            .update({ is_active: activate })
            .eq('id', rfidId);
        
        if (error) throw error;
        
        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ RFID card ' + (activate ? 'activated' : 'deactivated') + ' successfully!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
        
        viewAllRfid();
    } catch (err) {
        alert('Error: ' + err.message);
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

