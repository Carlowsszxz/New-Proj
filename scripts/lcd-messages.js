// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
    await checkAdminAuth();
    loadMessages();
    
    // Character count for textarea
    const messageInput = document.getElementById('messageInput');
    const charCount = document.getElementById('charCount');
    
    messageInput.addEventListener('input', function() {
        const text = this.value;
        charCount.textContent = text.length;
        updatePreview();
    });
    
    // Form submission
    document.getElementById('messageForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        await sendMessage();
    });
});

async function checkAdminAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    
    const userEmail = session.user.email;
    
    // Check if user is admin
    const { data: user, error } = await supabase
        .from('users')
        .select('is_admin')
        .eq('email', userEmail)
        .single();
    
    if (error || !user || !user.is_admin) {
        alert('Access denied. Admin privileges required.');
        window.location.href = 'dashboard.html';
        return;
    }
}

function updatePreview() {
    const message = document.getElementById('messageInput').value;
    const preview = document.getElementById('previewContent');
    const previewDiv = document.getElementById('messagePreview');
    
    if (!message.trim()) {
        previewDiv.classList.add('hidden');
        return;
    }
    
    previewDiv.classList.remove('hidden');
    
    // Split message into lines (max 4 lines, 20 chars each)
    const lines = message.split('\n').slice(0, 4);
    let previewText = '';
    
    for (let i = 0; i < 4; i++) {
        let line = lines[i] || '';
        // Truncate to 20 characters
        if (line.length > 20) {
            line = line.substring(0, 20);
        }
        // Pad to 20 characters
        line = line.padEnd(20, ' ');
        previewText += line + '\n';
    }
    
    preview.textContent = previewText.trim();
}

async function sendMessage() {
    const message = document.getElementById('messageInput').value.trim();
    const tableId = document.getElementById('tableSelect').value;
    const isPriority = document.getElementById('priorityCheck').checked;
    const duration = parseInt(document.getElementById('displayDuration').value) || 10;
    
    if (!message) {
        showStatus('Please enter a message', 'error');
        return;
    }
    
    if (message.length > 80) {
        showStatus('Message too long! Maximum 80 characters.', 'error');
        return;
    }
    
    try {
        // Get current user info
        const { data: { session } } = await supabase.auth.getSession();
        const userEmail = session.user.email;
        
        const { data: user } = await supabase
            .from('users')
            .select('first_name, last_name')
            .eq('email', userEmail)
            .single();
        
        const senderName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || userEmail : userEmail;
        
        // Insert or update LCD message
        const { data, error } = await supabase
            .from('lcd_messages')
            .upsert({
                table_id: tableId,
                message: message,
                is_priority: isPriority,
                duration_seconds: duration,
                sent_by: senderName,
                is_active: true,
                created_at: new Date().toISOString()
            }, {
                onConflict: 'table_id'
            })
            .select()
            .single();
        
        if (error) throw error;
        
        showStatus('Message sent successfully! It will appear on the LCD screen.', 'success');
        document.getElementById('messageInput').value = '';
        document.getElementById('charCount').textContent = '0';
        document.getElementById('messagePreview').classList.add('hidden');
        document.getElementById('priorityCheck').checked = false;
        document.getElementById('displayDuration').value = '10';
        
        // Refresh message list
        loadMessages();
    } catch (err) {
        console.error('Error sending message:', err);
        showStatus('Error: ' + err.message, 'error');
    }
}

async function clearMessage() {
    const tableId = document.getElementById('tableSelect').value;
    
    if (!confirm(`Are you sure you want to clear the LCD message for ${tableId}?`)) {
        return;
    }
    
    try {
        // Delete or deactivate the message
        const { error } = await supabase
            .from('lcd_messages')
            .update({ is_active: false, message: '' })
            .eq('table_id', tableId)
            .eq('is_active', true);
        
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows updated
        
        showStatus('LCD message cleared successfully!', 'success');
        loadMessages();
    } catch (err) {
        console.error('Error clearing message:', err);
        showStatus('Error: ' + err.message, 'error');
    }
}

async function loadMessages() {
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = '<p>Loading messages...</p>';
    
    try {
        const { data: messages, error } = await supabase
            .from('lcd_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        if (!messages || messages.length === 0) {
            messageList.innerHTML = '<p>No messages sent yet.</p>';
            return;
        }
        
        let html = '';
        messages.forEach(msg => {
            const date = new Date(msg.created_at);
            const formattedDate = date.toLocaleString();
            const statusClass = msg.is_active ? 'status-active' : 'status-inactive';
            const statusText = msg.is_active ? 'Active' : 'Inactive';
            
            html += `
                <div class="message-item">
                    <div class="message-item-header">
                        <div>
                            ${msg.table_id.toUpperCase()} - ${formattedDate}
                            <span class="status-badge ${statusClass}" style="margin-left: 10px;">${statusText}</span>
                        </div>
                        <div>
                            ${msg.is_priority ? '<span style="color:#dc3545;font-weight:bold;">PRIORITY</span>' : ''}
                            ${msg.duration_seconds ? `<span style="color:#666;">(${msg.duration_seconds}s)</span>` : ''}
                        </div>
                    </div>
                    <div class="message-item-content">${escapeHtml(msg.message || '(empty)')}</div>
                    <div style="margin-top:8px;font-size:0.9em;color:#666;">
                        Sent by: ${escapeHtml(msg.sent_by || 'Unknown')}
                    </div>
                </div>
            `;
        });
        
        messageList.innerHTML = html;
    } catch (err) {
        console.error('Error loading messages:', err);
        messageList.innerHTML = '<p style="color:red;">Error loading messages: ' + err.message + '</p>';
    }
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('messageStatus');
    statusDiv.className = 'message-status visible ' + type;
    statusDiv.textContent = message;
    
    setTimeout(() => {
        statusDiv.classList.remove('visible');
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function logout() {
    await supabase.auth.signOut();
    sessionStorage.removeItem('userEmail');
    window.location.href = 'login.html';
}

