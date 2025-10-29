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
    
    // Verify user exists in database
    const { data: existingUser } = await supabase
        .from('users')
            .select('*')
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
            
    // User exists, load dashboard
    loadUserInfo(userEmail);
    
    // Auto-refresh dashboard every 2 seconds
    setInterval(function() {
        loadUserInfo(userEmail);
    }, 2000);
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
        
        document.getElementById('userName').textContent = users.email;
        
        // Get user's RFID card
        const { data: rfidCards, error: rfidError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('user_id', users.id)
            .eq('is_active', true)
            .limit(1);
        
        if (rfidError) throw rfidError;
        
        const hasRfid = rfidCards && rfidCards.length > 0;
        
        // Show/hide RFID assignment form
        if (hasRfid) {
            document.getElementById('rfidAssignment').style.display = 'none';
            document.getElementById('myStatus').style.display = 'block';
            document.getElementById('mySeat').style.display = 'block';
            document.getElementById('myNoise').style.display = 'block';
            document.getElementById('statusText').textContent = 'RFID Card: ' + rfidCards[0].rfid_uid;
            
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
                    document.getElementById('statusText').textContent = 'Status: Logged Out';
                    document.getElementById('seatInfo').textContent = 'No active seat';
                    document.getElementById('noiseLevel').textContent = 'Not logged in';
                }
            } else {
                document.getElementById('statusText').textContent = 'Status: Not logged in';
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

async function logout() {
    // Sign out from Supabase Auth
    await supabase.auth.signOut();
    
    // Clear session storage
    sessionStorage.removeItem('userEmail');
    
    // Redirect to login
    window.location.href = 'login.html';
}

