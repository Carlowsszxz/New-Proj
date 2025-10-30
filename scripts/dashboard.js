// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    
    // Verify user exists in database and check if admin
    const { data: existingUser } = await supabase
        .from('users')
        .select('*, is_admin')
        .eq('email', userEmail)
            .single();
        
    if (!existingUser) {
        // User was deleted, clear everything and redirect
        console.log('User was deleted from database, signing out...');
        await supabase.auth.signOut();
        sessionStorage.removeItem('userEmail');
        window.location.href = 'login.html';
                return;
            }
            
    // If admin, redirect to admin dashboard
    if (existingUser.is_admin === true) {
        window.location.href = 'setup.html';
            return;
        }
        
    // User exists and is not admin, load dashboard
    loadUserInfo(userEmail);
    
    // Auto-refresh dashboard every 2 seconds
    setInterval(function() {
        loadUserInfo(userEmail);
    }, 2000);
    
    // Prevent navigation away from student pages
    setupNavigationGuard();
});

async function loadUserInfo(email) {
    try {
        // Get user details
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (userError || !users) {
            // User not found, redirect to login
            console.log('User not found, redirecting...');
            await supabase.auth.signOut();
            sessionStorage.removeItem('userEmail');
            window.location.href = 'login.html';
            return;
        }
        
        // Display user's name, fallback to email if name not available
        let displayName = '';
        if (users.first_name || users.last_name) {
            displayName = (users.first_name || '') + ' ' + (users.last_name || '');
            displayName = displayName.trim();
        }
        if (!displayName) {
            displayName = users.email; // Fallback to email if no name
        }
        document.getElementById('userName').textContent = displayName;
        
        // Get user's RFID card
        const { data: rfidCards, error: rfidError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('user_id', users.id)
            .eq('is_active', true)
            .limit(1);
        
        if (rfidError) throw rfidError;
        
        const hasRfid = rfidCards && rfidCards.length > 0;
        const rfidUid = hasRfid ? rfidCards[0].rfid_uid : '';
        
        // Show/hide RFID assignment form
        if (hasRfid) {
            document.getElementById('rfidAssignment').style.display = 'none';
            document.getElementById('myStatus').style.display = 'block';
            document.getElementById('mySeat').style.display = 'block';
            document.getElementById('myNoise').style.display = 'block';
            
            // Check if currently logged in (has an active login event without logout)
            const { data: events, error: eventError } = await supabase
                .from('actlog_iot')
                .select('*')
                .eq('uid', rfidCards[0].rfid_uid)
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (!eventError && events && events.length > 0) {
                // Find most recent login or logout event (skip noise events)
                let lastEvent = null;
                for (let i = 0; i < events.length; i++) {
                    if (events[i].event === 'login' || events[i].event === 'logout') {
                        lastEvent = events[i];
                        break;
                    }
                }
                
                if (lastEvent && lastEvent.event === 'login') {
                    // Show logged in status with RFID
                    document.getElementById('statusText').innerHTML = 'RFID Card: ' + rfidUid + ' - <span style="color:green">Logged In</span>';
                    
                    // Check occupancy
                    const { data: occupancy, error: occError } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', 'table-1')
                        .eq('seat_number', lastEvent.seat_number)
                        .single();
                    
                    if (!occError && occupancy) {
                        if (occupancy.is_occupied) {
                            document.getElementById('seatInfo').innerHTML = 
                                '📍 Table 1, Seat ' + lastEvent.seat_number + ' - <span style="color:green">OCCUPIED</span>';
        } else {
                            document.getElementById('seatInfo').textContent = 
                                '📍 Table 1, Seat ' + lastEvent.seat_number + ' - AVAILABLE';
                        }
                    } else {
                        document.getElementById('seatInfo').textContent = 'No active seat';
                    }
                    
                    // Show noise level ONLY when logged in
                    displayCurrentNoiseLevel();
                } else {
                    document.getElementById('statusText').innerHTML = 'RFID Card: ' + rfidUid + ' - <span style="color:red">Logged Out</span>';
                    document.getElementById('seatInfo').textContent = 'No active seat';
                    document.getElementById('noiseLevel').textContent = 'Not logged in';
                }
            } else {
                document.getElementById('statusText').innerHTML = 'RFID Card: ' + rfidUid + ' - <span style="color:orange">Never logged in</span>';
                document.getElementById('seatInfo').textContent = 'No active seat';
                document.getElementById('noiseLevel').textContent = 'Not logged in';
            }
        } else {
            // No RFID card - show assignment form
            document.getElementById('rfidAssignment').style.display = 'block';
            document.getElementById('myStatus').style.display = 'none';
            document.getElementById('mySeat').style.display = 'none';
            document.getElementById('myNoise').style.display = 'none';
        }
        
    } catch (err) {
        console.error('Error loading user info:', err);
        
        if (err.message && (err.message.includes('not found') || err.message.includes('Row not found'))) {
            console.log('User not found, signing out...');
            await supabase.auth.signOut();
            sessionStorage.removeItem('userEmail');
            window.location.href = 'login.html';
            return;
        }
        
        document.getElementById('statusText').textContent = 'Error: ' + err.message;
    }
}

async function displayCurrentNoiseLevel() {
    try {
        // Fetch current noise level for table-1 (shows even when no user logged in)
        const { data: noiseData, error } = await supabase
            .from('noise_log')
            .select('*')
            .eq('table_id', 'table-1')
            .single();
        
        if (!error && noiseData && noiseData.decibel !== undefined) {
            const db = Math.round(noiseData.decibel);
            let emoji = '🟢';
            if (db > 60) emoji = '🔴';
            else if (db > 40) emoji = '🟡';
            
            document.getElementById('noiseLevel').innerHTML = 
                emoji + ' ' + db + ' dB' + 
                (noiseData.updated_at ? 
                    '<br><small style="color:#666">Updated: ' + new Date(noiseData.updated_at).toLocaleTimeString() + '</small>' : '');
        } else {
            document.getElementById('noiseLevel').textContent = 'No noise data available';
        }
    } catch (err) {
        document.getElementById('noiseLevel').textContent = 'Error loading noise data';
    }
}

// RFID Assignment form
document.getElementById('assignRfidForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const rfidInput = document.getElementById('rfidInput').value.trim();
    const userEmail = sessionStorage.getItem('userEmail');
    
    if (!rfidInput) {
        document.getElementById('rfidError').textContent = 'Please enter your RFID card ID';
        return;
    }
    
    try {
        // Get current user
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail)
            .single();
        
        if (userError) throw userError;
        
        // Check if RFID already exists
        const { data: existingCard, error: cardError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('rfid_uid', rfidInput)
            .single();
        
        if (!cardError && existingCard) {
            document.getElementById('rfidError').textContent = 'This RFID card is already assigned to another user';
            return;
        }
        
        // Insert new RFID card assignment
        const { error: insertError } = await supabase
            .from('rfid_cards')
            .insert({
                rfid_uid: rfidInput,
                user_id: users.id,
                is_active: true
            });
        
        if (insertError) throw insertError;
        
        alert('RFID card assigned successfully!');
        document.getElementById('rfidInput').value = '';
        loadUserInfo(userEmail);
    } catch (err) {
        document.getElementById('rfidError').textContent = 'Error: ' + err.message;
    }
});

// Store beforeunload handler so we can remove it on logout
let beforeUnloadHandler = null;

// ================================================================
// ====== Navigation Guard for Students ======
function setupNavigationGuard() {
    // Prevent browser back/forward navigation to login or admin pages
    window.addEventListener('popstate', function(event) {
        const userEmail = sessionStorage.getItem('userEmail');
        if (userEmail) {
            // If logged in, prevent going to login page
            if (window.location.href.includes('login.html')) {
                window.history.pushState(null, '', 'dashboard.html');
                window.location.href = 'dashboard.html';
            }
        }
    });
    
    // Prevent closing tab/window without logout
    beforeUnloadHandler = function(e) {
        const userEmail = sessionStorage.getItem('userEmail');
        if (userEmail) {
            const message = 'Are you sure you want to leave? Please use the Logout button to properly end your session.';
            e.returnValue = message; // For Chrome
            return message; // For Firefox/Safari
        }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    
    // Override all anchor clicks to check if they're allowed
    document.addEventListener('click', function(e) {
        const anchor = e.target.closest('a');
        if (!anchor) return;
        
        const href = anchor.getAttribute('href');
        if (!href) return;
        
        // Allow navigation to student pages
        const allowedPages = ['dashboard.html', 'map.html', 'reports.html'];
        const isAllowed = allowedPages.some(page => href.includes(page));
        
        // Block navigation to login or admin pages
        if (href.includes('login.html') || href.includes('setup.html') || 
            href.includes('user-management.html') || href.includes('rfid-management.html') ||
            href.includes('student-reports.html') || href.includes('activity-logs.html') ||
            href.includes('lcd-messages.html')) {
            e.preventDefault();
            alert('Please use the Logout button to leave your session.');
            return false;
        }
        
        // If it's a student page, allow it
        if (isAllowed) {
            return true;
        }
    }, true);
}

async function logout() {
    // Remove beforeunload listener before logout
    if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
    }
    
    // Sign out from Supabase Auth
    await supabase.auth.signOut();
    
    // Clear session storage
    sessionStorage.removeItem('userEmail');
    
    // Redirect to login
    window.location.href = 'login.html';
}

