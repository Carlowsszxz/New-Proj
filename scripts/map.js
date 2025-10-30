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
    
    // Auto-refresh every 5 seconds
    setInterval(loadMap, 5000);
    
    // Prevent navigation away from student pages
    setupNavigationGuard();
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
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;background:#dc3545;color:white;border:none;padding:15px 25px;border-radius:50%;cursor:pointer;font-size:32px;width:50px;height:50px;line-height:20px;z-index:10001;box-shadow:0 4px 10px rgba(0,0,0,0.3);';
    
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
    
    // Prevent closing tab/window without logout
    beforeUnloadHandler = function(e) {
        const userEmail = sessionStorage.getItem('userEmail');
        if (userEmail) {
            const message = 'Are you sure you want to leave? Please use the Logout button to properly end your session.';
            e.returnValue = message;
            return message;
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

