// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// == UI INIT: Fade, cursor, nav, lucide ==
document.addEventListener('DOMContentLoaded', function() {
  // Lucide icons
  if (window.lucide) lucide.createIcons();

  // Fade in content
  setTimeout(() => {
    const fadeContent = document.querySelector('.fade-content');
    if (fadeContent) fadeContent.classList.add('is-visible');
  }, 100);

  // Cursor follower effect
  const cursorFollower = document.getElementById('cursor-follower');
  let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursorFollower.style.opacity = '1';
  });
  function animateCursor() {
    followerX += (mouseX - followerX) * 0.1;
    followerY += (mouseY - followerY) * 0.1;
    cursorFollower.style.transform = `translate(${followerX}px, ${followerY}px) translate(-50%, -50%)`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // Header trigger menu logic
  const headerTrigger = document.getElementById('headerTrigger');
  const headerNav = document.getElementById('headerNav');
  let headerExpanded = false;
  headerTrigger?.addEventListener('click', () => {
    headerExpanded = !headerExpanded;
    if (headerExpanded) {
      headerTrigger.classList.add('header-expanded', 'trigger-expanded');
      headerNav.classList.remove('header-collapsed');
      headerNav.classList.add('header-expanded');
    } else {
      headerTrigger.classList.remove('header-expanded', 'trigger-expanded');
      headerNav.classList.remove('header-expanded');
      headerNav.classList.add('header-collapsed');
    }
  });

  // Mobile burger menu logic
  const burgerBtn = document.getElementById('burgerMenuBtn');
  const mobileOverlay = document.getElementById('mobileMenuOverlay');
  const mobilePanel = document.getElementById('mobileMenuPanel');
  burgerBtn?.addEventListener('click', () => {
    burgerBtn.classList.toggle('active');
    mobileOverlay.classList.toggle('active');
    mobilePanel.classList.toggle('active');
  });
  mobileOverlay?.addEventListener('click', () => {
    burgerBtn.classList.remove('active');
    mobileOverlay.classList.remove('active');
    mobilePanel.classList.remove('active');
  });

  // Navigation item hover label (UI label)
  const navItems = document.querySelectorAll('.sidebar-nav-item');
  const navLabel = document.getElementById('navLabel');
  navItems.forEach(item => {
    item.addEventListener('mouseenter', (e) => {
      const label = e.currentTarget.getAttribute('data-label');
      navLabel.textContent = label; navLabel.classList.add('visible');
    });
    item.addEventListener('mouseleave', () => navLabel.classList.remove('visible'));
  });
});

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
    startNowClock();
    loadUserInfo(userEmail);
    
    // Auto-refresh dashboard every 2 seconds
    // Polling with Page Visibility pause
    let pollHandle = null;
    const startPolling = () => {
        if (pollHandle) return;
        pollHandle = setInterval(() => loadUserInfo(userEmail), 2000);
    };
    const stopPolling = () => {
        if (pollHandle) {
            clearInterval(pollHandle);
            pollHandle = null;
        }
    };
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPolling(); else startPolling();
    });
    startPolling();
    
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
        document.getElementById('welcomeSub').textContent = 'Student Portal';
        
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
                    setSessionPill(true);
                    document.getElementById('statusText').innerHTML = 'RFID Card: ' + rfidUid + ' · <span style="color:green">Logged In</span>';
                    
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
                    
                    // Show noise level
                    displayCurrentNoiseLevel();

                    // Update stats (lightweight placeholders)
                    updateStatsApprox(lastEvent.created_at);

                    // Load announcements and activity
                    loadAnnouncementsAndActivity(rfidUid);
                } else {
                    setSessionPill(false);
                    document.getElementById('statusText').innerHTML = 'RFID Card: ' + rfidUid + ' · <span style="color:red">Logged Out</span>';
                    document.getElementById('seatInfo').textContent = 'No active seat';
                    setNoiseUI(null);
                    loadAnnouncementsAndActivity(rfidUid);
                }
            } else {
                setSessionPill(false);
                document.getElementById('statusText').innerHTML = 'RFID Card: ' + rfidUid + ' · <span style="color:orange">Never logged in</span>';
                document.getElementById('seatInfo').textContent = 'No active seat';
                setNoiseUI(null);
                loadAnnouncementsAndActivity(rfidUid);
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
            let tip = 'Quiet environment.';
            if (db > 70) { emoji = '🔴'; tip = 'Very loud. Consider moving or reporting a noise issue.'; }
            else if (db > 55) { emoji = '🟠'; tip = 'Loud. Headphones recommended.'; }
            else if (db > 40) { emoji = '🟡'; tip = 'Moderate noise.'; }

            setNoiseUI({ db, emoji, updatedAt: noiseData.updated_at, tip });
        } else {
            setNoiseUI(null);
        }
    } catch (err) {
        setNoiseUI(null);
    }
}

// Helpers/UI updaters
function startNowClock() {
    const el = document.getElementById('nowTime');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleString(); };
    tick();
    setInterval(tick, 1000);
}

function setSessionPill(isLoggedIn) {
    const pill = document.getElementById('sessionPill');
    if (!pill) return;
    if (isLoggedIn) {
        pill.textContent = 'RFID Active';
        pill.className = 'text-xs px-3 py-1 rounded-full bg-green-100 text-green-800';
    } else {
        pill.textContent = 'RFID Inactive';
        pill.className = 'text-xs px-3 py-1 rounded-full bg-gray-200 text-gray-700';
    }
}

function setNoiseUI(payload) {
    const emojiEl = document.getElementById('noiseEmoji');
    const dbEl = document.getElementById('noiseDb');
    const updEl = document.getElementById('noiseUpdated');
    const tipEl = document.getElementById('noiseTip');
    if (!emojiEl || !dbEl || !updEl || !tipEl) return;
    if (!payload) {
        emojiEl.textContent = '—';
        dbEl.textContent = '—';
        updEl.textContent = 'No noise data';
        tipEl.textContent = '';
        return;
    }
    emojiEl.textContent = payload.emoji;
    dbEl.textContent = payload.db;
    updEl.textContent = payload.updatedAt ? 'Updated: ' + new Date(payload.updatedAt).toLocaleTimeString() : '—';
    tipEl.textContent = payload.tip || '';
}

function updateStatsApprox(loginAt) {
    const sessionEl = document.getElementById('statSessionTime');
    const weekEl = document.getElementById('statWeekSessions');
    const avgEl = document.getElementById('statAvgLength');
    if (sessionEl && loginAt) {
        const ms = Date.now() - new Date(loginAt).getTime();
        const mins = Math.max(0, Math.floor(ms / 60000));
        sessionEl.textContent = mins + 'm';
    }
    if (weekEl) weekEl.textContent = '—';
    if (avgEl) avgEl.textContent = '—';
}

async function loadAnnouncementsAndActivity(rfidUid) {
    // Announcements (lcd_messages for table-1)
    try {
        const { data: msgs } = await supabase
            .from('lcd_messages')
            .select('*')
            .eq('table_id', 'table-1')
            .order('is_priority', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(3);
        const container = document.getElementById('announcements');
        const annUpdated = document.getElementById('annUpdated');
        if (annUpdated) annUpdated.textContent = 'Updated ' + new Date().toLocaleTimeString();
        if (container) {
            if (!msgs || msgs.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-sm">No announcements</p>';
            } else {
                container.innerHTML = msgs.map(m => `
                    <div class="p-3 rounded-lg border ${m.is_priority ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}">
                        <div class="flex items-center justify-between gap-2 text-sm mb-1">
                            <span class="font-medium ${m.is_priority ? 'text-rose-700' : 'text-slate-700'}">${m.is_priority ? 'Priority' : 'Announcement'}</span>
                            <span class="text-xs text-gray-500">${m.updated_at ? new Date(m.updated_at).toLocaleTimeString() : ''}</span>
                        </div>
                        <div class="text-gray-800 whitespace-pre-wrap text-sm">${escapeHtml(m.message || '')}</div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        // ignore
    }

    // Activity (recent login/logout for this RFID)
    try {
        if (!rfidUid) {
            const tl = document.getElementById('activityTimeline');
            if (tl) tl.innerHTML = '<p class="text-gray-500 text-sm">No activity yet</p>';
            return;
        }
        const { data: events } = await supabase
            .from('actlog_iot')
            .select('event, seat_number, created_at')
            .eq('uid', rfidUid)
            .in('event', ['login', 'logout'])
            .order('created_at', { ascending: false })
            .limit(8);
        const tl = document.getElementById('activityTimeline');
        if (tl) {
            if (!events || events.length === 0) {
                tl.innerHTML = '<p class="text-gray-500 text-sm">No activity yet</p>';
            } else {
                tl.innerHTML = events.map(e => `
                    <div class="flex items-start gap-3">
                        <div class="mt-0.5 text-lg">${e.event === 'login' ? '🔵' : '🔴'}</div>
                        <div class="text-sm text-gray-800">
                            <div class="font-medium">${e.event === 'login' ? 'Logged In' : 'Logged Out'}</div>
                            <div class="text-gray-600">Seat ${e.seat_number || '—'} · ${getTimeAgo(e.created_at)}</div>
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        const tl = document.getElementById('activityTimeline');
        if (tl) tl.innerHTML = '<p class="text-gray-500 text-sm">Unable to load activity</p>';
    }
}

// Utilities
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' mins ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Locate on map action
document.addEventListener('click', function(e) {
    const btn = e.target.closest('#locateOnMapBtn');
    if (btn) {
        window.location.href = 'map.html';
    }
});

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

