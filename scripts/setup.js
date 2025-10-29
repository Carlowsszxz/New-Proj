// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Auto-connect on page load
document.addEventListener('DOMContentLoaded', function() {
    loadUsers();
    viewOccupancy();
});

async function addUser() {
    const email = document.getElementById('userEmail').value;
    const firstName = document.getElementById('userFirstName').value;
    const lastName = document.getElementById('userLastName').value;
    
    if (!email) {
        alert('Please enter email');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('users')
            .insert({ email, first_name: firstName, last_name: lastName });
        
        if (error) {
            if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
                document.getElementById('userResult').textContent = '❌ User with this email already exists!';
            } else {
                document.getElementById('userResult').textContent = 'Error: ' + error.message;
            }
            console.error('Supabase error:', error);
        } else if (data && data.length > 0) {
            document.getElementById('userResult').textContent = 'User added! ✅ ID: ' + data[0].id;
            document.getElementById('userEmail').value = '';
            document.getElementById('userFirstName').value = '';
            document.getElementById('userLastName').value = '';
            loadUsers();
        } else {
            document.getElementById('userResult').textContent = 'User added! ✅';
            document.getElementById('userEmail').value = '';
            document.getElementById('userFirstName').value = '';
            document.getElementById('userLastName').value = '';
            loadUsers();
        }
    } catch (err) {
        document.getElementById('userResult').textContent = 'Error: ' + err.message;
    }
}

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const select = document.getElementById('userSelect');
        select.innerHTML = '<option value="">Select User...</option>';
        
        data.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.email + ' (' + user.first_name + ' ' + user.last_name + ')';
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

async function assignRfid() {
    const rfidUid = document.getElementById('rfidUid').value;
    const userId = document.getElementById('userSelect').value;
    
    if (!rfidUid || !userId) {
        alert('Please enter RFID UID and select a user');
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('rfid_cards')
            .insert({ rfid_uid: rfidUid.toUpperCase(), user_id: userId });
        
        if (error) {
            if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
                document.getElementById('rfidResult').textContent = '❌ This RFID card is already assigned!';
            } else {
                document.getElementById('rfidResult').textContent = 'Error: ' + error.message;
            }
            console.error('Supabase error:', error);
        } else {
            document.getElementById('rfidResult').textContent = 'RFID card assigned! ✅';
            document.getElementById('rfidUid').value = '';
            loadUsers();
            viewAll();
        }
    } catch (err) {
        document.getElementById('rfidResult').textContent = 'Error: ' + err.message;
    }
}

async function viewAll() {
    try {
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*, rfid_cards(rfid_uid, is_active)');
        
        if (userError) throw userError;
        
        let html = '<table border="1"><thead><tr><th>Email</th><th>Name</th><th>RFID UID</th><th>Status</th></tr></thead><tbody>';
        
        users.forEach(user => {
            const rfidCards = user.rfid_cards || [];
            if (rfidCards.length > 0) {
                rfidCards.forEach(card => {
                    html += '<tr>';
                    html += '<td>' + user.email + '</td>';
                    html += '<td>' + user.first_name + ' ' + user.last_name + '</td>';
                    html += '<td>' + card.rfid_uid + '</td>';
                    html += '<td>' + (card.is_active ? 'Active' : 'Inactive') + '</td>';
                    html += '</tr>';
                });
            } else {
                html += '<tr>';
                html += '<td>' + user.email + '</td>';
                html += '<td>' + user.first_name + ' ' + user.last_name + '</td>';
                html += '<td colspan="2">No RFID card assigned</td>';
                html += '</tr>';
            }
        });
        
        html += '</tbody></table>';
        document.getElementById('allData').innerHTML = html;
    } catch (err) {
        document.getElementById('allData').innerHTML = 'Error: ' + err.message;
    }
}

async function viewLogs() {
    try {
        const { data: logs, error } = await supabase
            .from('actlog_iot')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        
        if (logs.length === 0) {
            document.getElementById('logData').innerHTML = '<p>No events yet. Tap your RFID card to see events!</p>';
            return;
        }
        
        let html = '<table border="1"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Seat</th><th>Noise (dB)</th><th>RFID UID</th></tr></thead><tbody>';
        
        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleString();
            
            html += '<tr>';
            html += '<td>' + time + '</td>';
            html += '<td>' + (log.event === 'login' ? '🔵 LOGIN' : '🔴 LOGOUT') + '</td>';
            html += '<td>' + (log.name || 'N/A') + '</td>';
            html += '<td>' + (log.seat_number ? 'Seat ' + log.seat_number : '-') + '</td>';
            html += '<td>' + (log.decibel ? log.decibel + ' dB' : '-') + '</td>';
            html += '<td>' + (log.uid || 'N/A') + '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('logData').innerHTML = html;
    } catch (err) {
        document.getElementById('logData').innerHTML = 'Error: ' + err.message;
    }
}

async function viewOccupancy() {
    try {
        const { data: seats, error } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', 'table-1')
            .order('seat_number', { ascending: true });
        
        if (error) throw error;
        
        if (seats.length === 0) {
            document.getElementById('occupancyData').innerHTML = '<p>No seats found. Run create_occupancy_table.sql first.</p>';
            return;
        }
        
        let html = '<table border="1"><thead><tr><th>Seat</th><th>Status</th><th>Occupied By</th></tr></thead><tbody>';
        
        seats.forEach(seat => {
            html += '<tr>';
            html += '<td>' + seat.seat_number + '</td>';
            html += '<td>' + (seat.is_occupied ? '🔴 Occupied' : '🟢 Available') + '</td>';
            html += '<td>' + (seat.occupied_by || '-') + '</td>';
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        document.getElementById('occupancyData').innerHTML = html;
    } catch (err) {
        document.getElementById('occupancyData').innerHTML = 'Error: ' + err.message;
    }
}

