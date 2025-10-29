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
    
    // User exists, load map
    loadMap();
    
    // Auto-refresh every 5 seconds
    setInterval(loadMap, 5000);
});

async function loadMap() {
    try {
        // Get all seats for table-1
        const { data: seats, error } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', 'table-1')
            .order('seat_number', { ascending: true });
        
        if (error) throw error;
        
        // Clear existing map
        const mapDiv = document.getElementById('seatMap');
        mapDiv.innerHTML = '';
        
        // Display 8 seats
        for (let i = 1; i <= 8; i++) {
            const seat = seats?.find(s => s.seat_number === i) || {
                seat_number: i,
                is_occupied: false,
                occupied_by: null
            };
            
            const seatDiv = document.createElement('div');
            seatDiv.className = seat.is_occupied ? 'seat occupied' : 'seat available';
            
            seatDiv.innerHTML = `
                <div class="seat-number">Seat ${i}</div>
                <div class="seat-details">
                    ${seat.is_occupied ? '🔒 Occupied' : '✅ Available'}
                </div>
            `;
            
            mapDiv.appendChild(seatDiv);
        }
        
    } catch (err) {
        console.error('Error loading map:', err);
        document.getElementById('seatMap').innerHTML = '<p>Error loading seat map</p>';
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

