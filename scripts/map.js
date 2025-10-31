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
    
    // User exists and is not admin, load map
    loadMap();
    
    // Auto-refresh every 2 seconds for real-time updates
    setInterval(loadMap, 2000);
    
    // Prevent navigation away from student pages
    setupNavigationGuard();
});

async function loadMap() {
    try {
        // Add loading indicator
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            // Target SVG (Lucide creates SVG) or fallback to i element
            const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('i');
            if (icon) {
                icon.style.animation = 'spin 1s linear infinite';
            }
        }
        
        // Check if user is logged in via RFID
        const userEmail = sessionStorage.getItem('userEmail');
        
        // Get user's information
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', userEmail)
            .single();
        
        if (userError) throw userError;
        
        // Get user's RFID card
        const { data: rfidCards, error: rfidError } = await supabase
            .from('rfid_cards')
            .select('rfid_uid')
            .eq('user_id', user.id)
            .eq('is_active', true);
        
        // Check if user is logged in via RFID
        let isLoggedIn = false;
        let userSeatNumber = null;
        
        if (rfidCards && rfidCards.length > 0) {
            // Check latest activity log to see if user is logged in
            const { data: latestLog, error: logError } = await supabase
                .from('actlog_iot')
                .select('event, seat_number')
                .eq('uid', rfidCards[0].rfid_uid)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            // User is logged in if latest event is 'login'
            if (latestLog && latestLog.event === 'login') {
                isLoggedIn = true;
                userSeatNumber = latestLog.seat_number;
            }
        }
        
        // Get all seats for table-1 (always show, regardless of login status)
        const { data: seats, error: seatsError } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', 'table-1')
            .order('seat_number', { ascending: true });
        
        // Handle case where seats might not exist yet or error occurs
        let seatsData = seats || [];
        if (seatsError) {
            console.warn('Error fetching seats:', seatsError);
            // Continue with empty seats array - will show all as available
        }
        
        // Calculate occupancy stats
        const totalSeats = 8;
        const occupiedSeats = seatsData.filter(s => s.is_occupied === true).length || 0;
        const availableSeats = totalSeats - occupiedSeats;
        const occupancyPercent = Math.round((occupiedSeats / totalSeats) * 100);
        
        // Update stats bar - always show stats even if no seats found
        const statsBar = document.getElementById('statsBar');
        if (statsBar) {
            statsBar.innerHTML = `
                <div class="flex items-center justify-center gap-6 flex-wrap">
                    <div class="flex items-center gap-2">
                        <i data-lucide="circle" class="w-5 h-5 text-gray-500"></i>
                        <span class="font-semibold text-gray-700">Available: ${availableSeats}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <i data-lucide="circle" class="w-5 h-5 text-green-600"></i>
                        <span class="font-semibold text-gray-700">Occupied: ${occupiedSeats}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <i data-lucide="activity" class="w-5 h-5 text-indigo-600"></i>
                        <span class="font-semibold text-gray-700">Capacity: ${occupancyPercent}%</span>
                    </div>
                </div>
            `;
            
            // Reinitialize icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
        
        // Update user status banner
        const userBanner = document.getElementById('userBanner');
        if (userBanner) {
            if (isLoggedIn && userSeatNumber) {
                userBanner.innerHTML = `
                    <div class="flex items-center justify-center gap-2">
                        <i data-lucide="map-pin" class="w-5 h-5 text-indigo-600"></i>
                        <span class="font-semibold text-indigo-700">You're at Seat ${userSeatNumber}</span>
                        <span class="text-sm text-gray-600">• Logged in via RFID</span>
                    </div>
                `;
                userBanner.className = 'p-4 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 mb-6';
            } else {
                userBanner.innerHTML = `
                    <div class="flex items-center justify-center gap-2">
                        <i data-lucide="info" class="w-5 h-5 text-blue-600"></i>
                        <span class="text-gray-700">Tap your RFID card at the reader to occupy a seat</span>
                    </div>
                `;
                userBanner.className = 'p-4 rounded-lg bg-blue-50 border border-blue-200 mb-6';
            }
            
            // Reinitialize icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
        
        // Clear existing map
        const mapDiv = document.getElementById('seatMap');
        mapDiv.classList.remove('message-mode');
        mapDiv.innerHTML = '';
        
        // Display 8 seats
        for (let i = 1; i <= 8; i++) {
            const seat = seatsData.find(s => s.seat_number === i) || {
                seat_number: i,
                is_occupied: false,
                occupied_by: null
            };
            
            const seatDiv = document.createElement('div');
            
            // Check if this is the user's seat
            const isUserSeat = isLoggedIn && userSeatNumber === i;
            
            if (isUserSeat) {
                seatDiv.className = 'seat user-seat';
                seatDiv.innerHTML = `
                    <div class="seat-badge">YOU</div>
                    <div class="seat-number">Seat ${i}</div>
                    <div class="seat-details">🎯 Your Seat</div>
                `;
            } else if (seat.is_occupied) {
                seatDiv.className = 'seat occupied';
                seatDiv.innerHTML = `
                    <div class="seat-number">Seat ${i}</div>
                    <div class="seat-details">🔒 Occupied</div>
                `;
            } else {
                seatDiv.className = 'seat available';
                seatDiv.innerHTML = `
                    <div class="seat-number">Seat ${i}</div>
                    <div class="seat-details">✅ Available</div>
                `;
            }
            
            mapDiv.appendChild(seatDiv);
        }
        
        // Update title based on login status
        const mapTitle = document.getElementById('mapTitle');
        if (mapTitle) {
            if (isLoggedIn && userSeatNumber) {
                // User is logged in - show their table
                mapTitle.textContent = `Seat Map - Table 1`;
            } else {
                // User not logged in - just show generic title
                mapTitle.textContent = 'Seat Map';
            }
            mapTitle.style.display = 'block';
        }
        
        // Show all UI elements
        const mapButtons = document.getElementById('mapButtons');
        const mapLegend = document.getElementById('mapLegend');
        const lastUpdate = document.getElementById('lastUpdate');
        if (mapButtons) mapButtons.style.display = 'flex';
        if (mapLegend) mapLegend.style.display = 'flex';
        if (lastUpdate) lastUpdate.style.display = 'block';
        
    } catch (err) {
        console.error('Error loading map:', err);
        
        // Show error in stats bar
        const statsBar = document.getElementById('statsBar');
        if (statsBar) {
            statsBar.innerHTML = `
                <div class="flex items-center justify-center gap-6 flex-wrap">
                    <span class="text-red-600">Error loading stats: ${err.message || 'Unknown error'}</span>
                </div>
            `;
        }
        
        // Show error in seat map
        const seatMap = document.getElementById('seatMap');
        if (seatMap) {
            seatMap.innerHTML = '<p class="text-red-600">Error loading seat map. Please refresh.</p>';
        }
    } finally {
        // Remove loading indicator
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            // Target SVG (Lucide creates SVG) or fallback to i element
            const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('i');
            if (icon) {
                icon.style.animation = '';
            }
        }
        
        // Update last refresh time
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            lastUpdate.textContent = `Updated: ${timeString}`;
        }
    }
}

function showFullMap() {
    // Create full-screen modal for image
    const modal = document.createElement('div');
    modal.className = 'full-map-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;overflow-y:auto;';
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'position:relative;max-width:95vw;max-height:95vh;display:flex;align-items:center;justify-content:center;';
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-full-map-btn';
    closeBtn.setAttribute('aria-label', 'Close full map view');
    closeBtn.innerHTML = '<i data-lucide="x" class="close-icon"></i>';
    
    // Create PDF viewer element for floor plan
    const pdfViewer = document.createElement('iframe');
    pdfViewer.src = 'images/FloorPlan.pdf';
    pdfViewer.style.cssText = 'width:90vw;height:90vh;border:none;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.5);background:white;';
    pdfViewer.title = 'Floor Plan';
    
    // Fallback message if PDF can't load
    const fallbackMsg = document.createElement('div');
    fallbackMsg.style.cssText = 'padding:40px;background:white;border-radius:10px;text-align:center;color:#333;display:none;';
    fallbackMsg.innerHTML = `
        <h2 style="color:#dc3545;">Floor Plan PDF</h2>
        <p>If the PDF doesn't load, you can <a href="images/FloorPlan.pdf" target="_blank" style="color:#007bff;">download it here</a></p>
        <p style="font-size:0.9em;color:#666;margin-top:20px;">Make sure the file exists at: <code>images/FloorPlan.pdf</code></p>
    `;
    
    // Fallback if iframe fails to load (some browsers)
    pdfViewer.onerror = function() {
        pdfViewer.style.display = 'none';
        fallbackMsg.style.display = 'block';
    };
    
    modalContent.appendChild(pdfViewer);
    modalContent.appendChild(fallbackMsg);
    modal.appendChild(modalContent);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);
    
    // Close button functionality
    closeBtn.addEventListener('click', function() {
        modal.remove();
    });
    
    // Initialize Lucide icon for close button
    if (window.lucide) {
        setTimeout(() => {
            lucide.createIcons();
        }, 100);
    }
    
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
}

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
                window.history.pushState(null, '', 'map.html');
                window.location.href = 'map.html';
            }
        }
    });
    
    // Removed leave-warning on student pages
    
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

