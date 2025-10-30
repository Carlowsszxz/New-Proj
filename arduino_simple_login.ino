#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <math.h>

// ====== Microphone Setup ======
#define I2S_WS   26  // Changed from 25 to match working code
#define I2S_SCK  25  // Changed from 33 to match working code
#define I2S_SD   32
#define NUM_SAMPLES 1024

// ================================================================
// ====== MICROPHONE SENSITIVITY TUNING GUIDE ======
// ================================================================
//
// How to Adjust Sensitivity (see readSoundLevel() function below):
//
// 1. SOFTWARE_GAIN (currently 4.0):
//    - Increases signal amplification (software boost)
//    - Range: 1.0 to 10.0
//    - If sounds are too quiet: Increase to 5.0 - 8.0
//    - If sounds clip/distort: Decrease to 2.0 - 3.0
//    - Watch Serial Monitor for "⚠ WARNING: Near clipping!"
//
// 2. SENSITIVITY_CALIBRATION (currently 100):
//    - Lower = more sensitive (detects quieter sounds)
//    - Higher = less sensitive (requires louder sounds)
//    - If microphone barely detects sounds: Decrease to 50 - 80
//    - If detecting too much noise: Increase to 200 - 300
//    - Typical range: 50 - 500
//
// 3. EMA_ALPHA (currently 0.5):
//    - Controls smoothing (higher = smoother but slower)
//    - Range: 0.0 to 1.0
//    - For fast response: Use 0.2 - 0.4
//    - For stable readings: Use 0.6 - 0.8
//    - Current 0.5 is balanced
//
// 4. RMS_NOISE_FLOOR (currently 5.0):
//    - Filters out electrical noise
//    - Values below this return 0 dB
//    - If getting false readings: Increase to 8.0 - 15.0
//    - If missing quiet sounds: Decrease to 2.0 - 4.0
//
// 5. Sample Rate (in initMicrophone(), currently 22050 Hz):
//    - Higher = better sensitivity to quick sounds
//    - Options: 16000 (standard), 22050 (better), 44100 (best)
//    - Higher rates use more CPU
//
// How to Verify Readings:
// - Open Serial Monitor at 115200 baud
// - Watch debug output every 10 readings:
//   - "RMS (raw)" should increase when you speak
//   - "Peak Amplitude" should jump during sound
//   - "Decibel" is the final output value
// - If RMS stays low (< 20) even when speaking: Increase SOFTWARE_GAIN
// - If RMS is high (> 500) when silent: Check DC offset or increase RMS_NOISE_FLOOR
//
// Quick Tuning Steps:
// 1. Test in quiet room - should show 0-5 dB
// 2. Speak normally - should show 15-35 dB
// 3. Speak loudly - should show 35-60 dB
// 4. Adjust SOFTWARE_GAIN if values are too low
// 5. Adjust SENSITIVITY_CALIBRATION if range feels wrong
//
// ================================================================

// ====== WiFi Credentials ======
const char* ssid = "PLDTHOMEFIBRq2uKx";        // Change to your WiFi
const char* password = "PLDTWIFInxW5A";          // Change to your WiFi password

// ====== Supabase Configuration ======
const char* supabaseUrl = "https://xnqffcutsadthghqxeha.supabase.co";
const char* supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk";
const char* tableId = "table-1";

// ====== LCD & RFID Setup ======
LiquidCrystal_I2C lcd(0x27, 20, 4);
#define SS_PIN  5
#define RST_PIN 2
MFRC522 rfid(SS_PIN, RST_PIN);

// ====== State Tracking ======
String loggedInUser = "";  // Store current logged in user
int currentSeat = 0;  // Store user's seat number
String currentRfidUid = "";  // Store current RFID UID for logging
String currentUserName = "";  // Store current user name

// ====== LCD Message Display State ======
String lcdMessage = "";  // Current message to display
unsigned long lcdMessageStartTime = 0;  // When message started showing
unsigned long lcdMessageDuration = 0;  // How long to show (milliseconds)
bool showingLcdMessage = false;  // Whether we're currently showing an admin message
bool lcdMessagePriority = false;  // Whether this is a priority message that overrides everything
unsigned long lastLcdCheck = 0;  // Last time we checked for new messages
const unsigned long LCD_CHECK_INTERVAL = 5000;  // Check for new messages every 5 seconds

// ====== Noise Threshold Warnings ======
const int NOISE_THRESHOLD_LOW = 40;   // Above this: Slightly noisy (green/yellow)
const int NOISE_THRESHOLD_MEDIUM = 55; // Above this: Moderate noise (yellow)
const int NOISE_THRESHOLD_HIGH = 70;   // Above this: Too noisy (red)
const int NOISE_THRESHOLD_CRITICAL = 85; // Above this: Very loud (red warning)
bool showingNoiseWarning = false;  // Whether we're currently showing a noise warning
unsigned long noiseWarningStartTime = 0;  // When noise warning started
const unsigned long NOISE_WARNING_DURATION = 5000;  // Show warning for 5 seconds
int lastNoiseLevel = 0;  // Track last noise level for threshold detection

// ================================================================
// ====== Log Event to Database ======
void logEvent(String rfidUid, String userName, String eventType, int seatNum = 0, int decibel = 0) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("✗ WiFi not connected, cannot log");
    return;
  }
  
  Serial.println("=== Logging Event: " + eventType + " ===");
  
  // Read current sound level if not provided
  if (decibel == 0) {
    decibel = readSoundLevel();
  }
  
  Serial.println("Sound level: " + String(decibel) + " dB");
  
  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/actlog_iot";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  http.addHeader("Prefer", "return=minimal");
  
  StaticJsonDocument<200> doc;
  doc["event"] = eventType;
  doc["table_name"] = tableId;
  doc["uid"] = rfidUid;
  doc["name"] = userName;
  doc["decibel"] = decibel;
  if (seatNum > 0) {
    doc["seat_number"] = seatNum;
  }
  
  String body;
  serializeJson(doc, body);
  Serial.println("POST body: " + body);
  Serial.println("POST URL: " + url);
  
  int code = http.POST(body);
  Serial.println("HTTP Code: " + String(code));
  
  if (code > 0 && code < 300) {
    Serial.println("✓ Event logged successfully");
  } else {
    Serial.println("✗ HTTP Error: " + String(code));
  }
  
  http.end();
}

// ================================================================
// ====== WiFi Connection ======
void connectWiFi() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi...");
  
  WiFi.begin(ssid, password);
  int tries = 0;
  
  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    lcd.setCursor(0, 1);
    lcd.print(".");
    Serial.print(".");
    tries++;
  }
  
  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcd.print("WiFi Connected!");
    Serial.println("\nWiFi Connected!");
  } else {
    lcd.print("WiFi Failed!");
    Serial.println("\nWiFi Failed!");
  }
  delay(2000);
  lcd.clear();
}

// ================================================================
// ====== Get User Info from RFID ======
String getUserFromRfid(String rfidUid) {
  Serial.println("=== Looking up user ===");
  Serial.println("RFID: " + rfidUid);
  
  HTTPClient http;
  // Query: Get user_id and user name from rfid_cards and users tables
  String url = String(supabaseUrl) + "/rest/v1/rfid_cards?rfid_uid=eq." + rfidUid + 
               "&select=user_id,users(first_name,last_name,email)&is_active=eq.true";
  
  http.begin(url);
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  
  int code = http.GET();
  String userName = "";
  
  if (code == 200) {
    String response = http.getString();
    Serial.println("Response: " + response);
    
    StaticJsonDocument<500> doc;
    DeserializationError err = deserializeJson(doc, response);
    
    if (!err && doc.size() > 0) {
      // Try to get name from nested user data
      JsonObject users = doc[0]["users"];
      if (!users.isNull()) {
        String firstName = users["first_name"] | "";
        String lastName = users["last_name"] | "";
        String email = users["email"] | "";
        
        if (firstName.length() > 0) {
          userName = firstName + " " + lastName;
        } else if (email.length() > 0) {
          userName = email;
        }
      }
      
      if (userName.length() > 0) {
        Serial.println("✓ User found: " + userName);
      } else {
        Serial.println("✗ No name found");
      }
    } else {
      Serial.println("✗ No user for this card");
    }
  } else {
    Serial.println("✗ HTTP Error: " + String(code));
  }
  
  http.end();
  return userName;
}

// ================================================================
// ====== Seat Management ======
int findAvailableSeat() {
  Serial.println("Finding available seat...");
  
  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/occupancy?table_id=eq.table-1&is_occupied=eq.true&select=seat_number";
  http.begin(url);
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  
  int code = http.GET();
  int occupiedSeats[8] = {0,0,0,0,0,0,0,0};
  int count = 0;
  
  if (code == 200) {
    String response = http.getString();
    StaticJsonDocument<500> doc;
    deserializeJson(doc, response);
    
    for (int i = 0; i < doc.size() && i < 8; i++) {
      occupiedSeats[i] = doc[i]["seat_number"].as<int>();
      count++;
    }
  }
  
  http.end();
  
  // Find first available seat (1-8)
  for (int i = 1; i <= 8; i++) {
    bool taken = false;
    for (int j = 0; j < count; j++) {
      if (occupiedSeats[j] == i) {
        taken = true;
        break;
      }
    }
    if (!taken) {
      Serial.println("Found available seat: " + String(i));
      return i;
    }
  }
  
  Serial.println("No seats available!");
  return -1;
}

void occupySeat(int seatNumber, String uid) {
  Serial.println("Occupying seat " + String(seatNumber) + " by user " + uid);
  
  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/occupancy?table_id=eq.table-1&seat_number=eq." + String(seatNumber);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  
  StaticJsonDocument<250> doc;
  doc["is_occupied"] = true;
  doc["occupied_by"] = uid;
  
  String body;
  serializeJson(doc, body);
  Serial.println("Occupying URL: " + url);
  Serial.println("Occupying body: " + body);
  
  int code = http.sendRequest("PATCH", body);
  Serial.println("HTTP Code: " + String(code));
  
  if (code != 204 && code != 200) {
    String response = http.getString();
    Serial.println("Response: " + response);
  }
  
  http.end();
}

int findMySeat(String uid) {
  // Check if this user already has an occupied seat
  // Get the most recent login event
  Serial.println("Checking if user has occupied seat...");
  
  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/actlog_iot?uid=eq." + uid + "&order=created_at.desc&limit=10";
  http.begin(url);
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  
  int code = http.GET();
  int seatNum = -1;
  
  if (code == 200) {
    String response = http.getString();
    Serial.println("Recent events: " + response);
    
    StaticJsonDocument<1000> doc;
    deserializeJson(doc, response);
    
    if (doc.size() > 0) {
      // Look for the most recent login event that hasn't been followed by logout
      bool foundLogin = false;
      int loginSeat = -1;
      
      for (int i = 0; i < doc.size(); i++) {
        String event = doc[i]["event"] | "";
        
        if (event == "login") {
          // Found a login event - this is the seat to free
          loginSeat = doc[i]["seat_number"] | -1;
          seatNum = loginSeat;
          Serial.println("Found login event with seat: " + String(loginSeat));
          foundLogin = true;
          break;
        } else if (event == "logout") {
          // Found a logout event - user is not logged in
          Serial.println("Found logout event - user not logged in");
          break;
        }
      }
    }
  }
  
  http.end();
  
  if (seatNum > 0) {
    Serial.println("User has occupied seat: " + String(seatNum));
  } else {
    Serial.println("User has no occupied seat");
  }
  
  return seatNum;
}

void freeSeat(int seatNumber) {
  Serial.println("Freeing seat " + String(seatNumber));
  
  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/occupancy?table_id=eq.table-1&seat_number=eq." + String(seatNumber);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  
  StaticJsonDocument<250> doc;
  doc["is_occupied"] = false;
  
  String body;
  serializeJson(doc, body);
  Serial.println("Freeing URL: " + url);
  Serial.println("Freeing body: " + body);
  
  int code = http.sendRequest("PATCH", body);
  Serial.println("HTTP Code: " + String(code));
  
  if (code != 204 && code != 200) {
    String response = http.getString();
    Serial.println("Response: " + response);
  }
  
  http.end();
}

// ================================================================
// ====== Log Noise Level Update ======
void logNoiseUpdate(int db) {
  if (WiFi.status() != WL_CONNECTED) {
    return;  // Not connected
  }
  
  // Try PATCH first (update existing record)
  HTTPClient http;
  http.setTimeout(2000);  // 2 second timeout
  
  String url = String(supabaseUrl) + "/rest/v1/noise_log?table_id=eq." + tableId;
  if (!http.begin(url)) {
    Serial.println("✗ Failed to begin HTTP");
    return;
  }
  
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  
  StaticJsonDocument<100> doc;
  doc["decibel"] = db;
  String body;
  serializeJson(doc, body);
  
  int code = http.sendRequest("PATCH", body);
  http.end();
  
  // If PATCH failed (404 = record doesn't exist), create it with POST
  if (code == 404 || code < 200 || code >= 300) {
    http.setTimeout(2000);
    if (!http.begin(String(supabaseUrl) + "/rest/v1/noise_log")) {
      return;
    }
    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", supabaseKey);
    http.addHeader("Authorization", "Bearer " + String(supabaseKey));
    
    StaticJsonDocument<100> insertDoc;
    insertDoc["table_id"] = tableId;
    insertDoc["decibel"] = db;
    String insertBody;
    serializeJson(insertDoc, insertBody);
    
    http.POST(insertBody);
    http.end();
    Serial.println("✓ Created noise_log record");
  } else {
    Serial.println("✓ Updated noise_log: " + String(db) + " dB");
  }
}

// ================================================================
// ====== Microphone Functions ======
void initMicrophone() {
  // Higher sample rate improves sensitivity to transient sounds
  // 22050 Hz provides better audio quality and detection range
  // You can try: 16000 (standard), 22050 (better), 44100 (best, but more CPU)
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 22050,  // Increased from 16000 for better sensitivity
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 1024,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  esp_err_t err1 = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  if (err1 == ESP_OK) {
    esp_err_t err2 = i2s_set_pin(I2S_NUM_0, &pin_config);
    if (err2 == ESP_OK) {
      i2s_zero_dma_buffer(I2S_NUM_0);  // Clear buffer for clean readings
      Serial.println("✓ Microphone initialized");
    } else {
      Serial.println("✗ Microphone pin setup failed");
    }
  } else {
    Serial.println("✗ Microphone driver install failed");
  }
}

// ================================================================
// ====== Sensitivity Configuration ======
// ADJUST THESE VALUES TO TUNE MICROPHONE SENSITIVITY:

// Software Gain Multiplier (1.0 = no gain, higher = more sensitive)
// Range: 1.0 to 10.0
// For low-volume environments: try 3.0 - 5.0
// For medium-volume environments: try 2.0 - 3.0
// For loud environments: use 1.0 - 2.0
#define SOFTWARE_GAIN 4.0

// Sensitivity Calibration Constant
// Lower values = more sensitive (detects quieter sounds)
// Higher values = less sensitive (requires louder sounds)
// Typical range: 50 - 500
// For quiet environments: use 50 - 150
// For normal environments: use 150 - 300
// For loud environments: use 300 - 500
#define SENSITIVITY_CALIBRATION 100

// Exponential Moving Average (EMA) Smoothing Factor
// Range: 0.0 to 1.0 (0 = no smoothing, 1 = max smoothing)
// Higher values = smoother but slower response
// Lower values = faster response but more fluctuation
// Recommended: 0.3 - 0.7
#define EMA_ALPHA 0.5

// Minimum RMS threshold to avoid noise floor
// Values below this are treated as silence (return 0)
// Increase if getting false readings from electrical noise
#define RMS_NOISE_FLOOR 5.0

// ================================================================

int readSoundLevel() {
  const int samples = NUM_SAMPLES;
  int32_t buffer[samples];
  size_t bytes_read;
  
  int result = i2s_read(I2S_NUM_0, (char*)buffer, sizeof(buffer), &bytes_read, portMAX_DELAY);
  
  if (result != ESP_OK) {
    // Silent fail - mic not connected or error
    return 0;
  }
  
  if (bytes_read == 0) {
    return 0;
  }
  
  int samples_read = bytes_read / sizeof(int32_t);
  if (samples_read == 0) return 0;
  
  // ====== STEP 1: Extract raw samples and remove DC bias ======
  double sum_raw = 0;
  double max_sample = 0;
  double min_sample = 0;
  
  for (int i = 0; i < samples_read; i++) {
    // I2S 32-bit samples: shift right to get meaningful audio range
    // >> 14 is standard, but >> 12 gives higher resolution for sensitivity
    int32_t raw_sample = buffer[i] >> 12;  // Changed from >> 14 to >> 12 for better resolution
    
    sum_raw += raw_sample;
    if (raw_sample > max_sample) max_sample = raw_sample;
    if (raw_sample < min_sample) min_sample = raw_sample;
  }
  
  // Calculate DC offset (bias) - the average value when silent
  double dc_offset = sum_raw / samples_read;
  
  // ====== STEP 2: Remove DC bias and calculate RMS with software gain ======
  double sum_squared = 0;
  double peak_amplitude = 0;
  
  for (int i = 0; i < samples_read; i++) {
    // Remove DC bias first
    double centered_sample = (buffer[i] >> 12) - dc_offset;
    
    // Apply software gain for sensitivity boost
    // This amplifies the signal without hardware changes
    centered_sample *= SOFTWARE_GAIN;
    
    // Track peak for clipping detection
    double abs_sample = abs(centered_sample);
    if (abs_sample > peak_amplitude) peak_amplitude = abs_sample;
    
    // Accumulate for RMS calculation
    sum_squared += centered_sample * centered_sample;
  }
  
  // Calculate RMS (Root Mean Square)
  double mean_squared = sum_squared / samples_read;
  double rms = sqrt(mean_squared);
  
  // Check if signal is above noise floor
  if (rms < RMS_NOISE_FLOOR) {
    return 0;  // Too quiet, treat as silence
  }
  
  // ====== STEP 3: Apply exponential moving average for stability ======
  static double ema_rms = 0.0;
  static bool ema_initialized = false;
  
  if (!ema_initialized) {
    ema_rms = rms;  // Initialize on first reading
    ema_initialized = true;
  } else {
    // EMA formula: new_value = alpha * current + (1 - alpha) * previous
    ema_rms = EMA_ALPHA * rms + (1.0 - EMA_ALPHA) * ema_rms;
  }
  
  // Use smoothed RMS for decibel calculation
  double final_rms = ema_rms;
  
  // ====== STEP 4: Convert RMS to Decibels with calibration ======
  // Calibrated decibel formula:
  // dB = 20 * log10(rms / calibration + 1)
  // Lower calibration value = more sensitive (detects quieter sounds)
  double decibelValue = 20.0 * log10(final_rms / SENSITIVITY_CALIBRATION + 1.0);
  
  // ====== STEP 5: Scale to 0-100 dB range ======
  int decibel = (int)decibelValue;
  
  // Clamp to realistic range
  if (decibel < 0) decibel = 0;
  if (decibel > 100) decibel = 100;
  
  // ====== STEP 6: Debug Output (every 10 reads to reduce spam) ======
  static int debugCount = 0;
  if (debugCount++ % 10 == 0) {
    Serial.println("=== Microphone Sensitivity Debug ===");
    Serial.println("Raw Peak: " + String(max_sample) + " / " + String(min_sample));
    Serial.println("DC Offset: " + String(dc_offset, 2));
    Serial.println("Peak Amplitude (after gain): " + String(peak_amplitude, 2));
    Serial.println("RMS (raw): " + String(rms, 2));
    Serial.println("RMS (smoothed): " + String(ema_rms, 2));
    Serial.println("Decibel: " + String(decibelValue, 2) + " -> " + String(decibel) + " dB");
    
    // Clipping warning
    if (peak_amplitude > 32767 * 0.9) {
      Serial.println("⚠ WARNING: Near clipping! Reduce SOFTWARE_GAIN.");
    }
    Serial.println("---");
  }
  
  return decibel;
}

// ================================================================
// ====== Fetch LCD Message from Database ======
void checkLcdMessage() {
  if (WiFi.status() != WL_CONNECTED) {
    return;  // Skip if WiFi not connected
  }
  
  HTTPClient http;
  String url = String(supabaseUrl) + "/rest/v1/lcd_messages?table_id=eq." + String(tableId) + "&is_active=eq.true&select=message,is_priority,duration_seconds&limit=1";
  http.begin(url);
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + String(supabaseKey));
  http.setTimeout(2000);  // 2 second timeout
  
  int code = http.GET();
  
  if (code == 200) {
    String response = http.getString();
    
    // Check if response is not empty array
    if (response.length() > 2 && response != "[]") {
      StaticJsonDocument<300> doc;
      DeserializationError err = deserializeJson(doc, response);
      
      if (!err && doc.size() > 0) {
        String newMessage = doc[0]["message"].as<String>();
        bool isPriority = doc[0]["is_priority"] | false;
        int duration = doc[0]["duration_seconds"] | 10;
        
        // If we got a non-empty message and it's new or priority
        if (newMessage.length() > 0) {
          // If it's a priority message, always show it
          // If it's not priority, only show if we're not already showing a message
          if (isPriority || !showingLcdMessage) {
            lcdMessage = newMessage;
            lcdMessagePriority = isPriority;
            lcdMessageDuration = (unsigned long)duration * 1000;  // Convert to milliseconds
            lcdMessageStartTime = millis();
            showingLcdMessage = true;
            
            // Display the message immediately if priority, or if not currently showing anything important
            if (isPriority || loggedInUser == "") {
              displayLcdMessage();
            }
            
            Serial.println("✓ LCD Message received: " + newMessage.substring(0, min(20, (int)newMessage.length())));
            Serial.println("  Priority: " + String(isPriority ? "YES" : "NO"));
            Serial.println("  Duration: " + String(duration) + " seconds");
          }
        } else {
          // Empty message means clear
          if (showingLcdMessage && lcdMessage.length() > 0) {
            Serial.println("✓ LCD Message cleared by admin");
            showingLcdMessage = false;
            lcdMessage = "";
            lcdMessagePriority = false;
            
            // Return to normal display
            if (loggedInUser == "") {
              lcd.clear();
              lcd.print("Ready for RFID...");
              lcd.setCursor(0, 1);
              lcd.print("Tap your card");
            } else {
              // User is logged in, show their status
              lcd.clear();
              lcd.print("Welcome!");
              lcd.setCursor(0, 1);
              lcd.print(currentUserName);
              lcd.setCursor(0, 2);
              lcd.print("Logged IN");
              if (currentSeat > 0) {
                lcd.setCursor(0, 3);
                lcd.print("Seat: " + String(currentSeat));
              }
            }
          }
        }
      }
    } else {
      // No active message - clear if we were showing one
      if (showingLcdMessage && lcdMessage.length() > 0) {
        showingLcdMessage = false;
        lcdMessage = "";
        lcdMessagePriority = false;
      }
    }
  }
  
  http.end();
}

// ================================================================
// ====== Display LCD Message ======
void displayLcdMessage() {
  if (lcdMessage.length() == 0) {
    return;
  }
  
  lcd.clear();
  
  // Split message into lines (up to 4 lines, 20 chars each)
  String lines[4];
  int lineCount = 0;
  int lastPos = 0;
  
  // Split by newline first
  for (int i = 0; i < lcdMessage.length() && lineCount < 4; i++) {
    if (lcdMessage.charAt(i) == '\n' || i == lcdMessage.length() - 1) {
      String line = lcdMessage.substring(lastPos, i + 1);
      line.trim();
      
      // If line is longer than 20 chars, split it further
      while (line.length() > 20 && lineCount < 4) {
        lines[lineCount] = line.substring(0, 20);
        line = line.substring(20);
        lineCount++;
      }
      
      if (line.length() > 0 && lineCount < 4) {
        lines[lineCount] = line;
        lineCount++;
      }
      
      lastPos = i + 1;
    }
  }
  
  // Display lines on LCD (up to 4 lines)
  for (int i = 0; i < lineCount && i < 4; i++) {
    lcd.setCursor(0, i);
    // Pad to 20 chars to clear any leftover text
    String displayLine = lines[i];
    while (displayLine.length() < 20) {
      displayLine += " ";
    }
    displayLine = displayLine.substring(0, 20);  // Ensure max 20 chars
    lcd.print(displayLine);
  }
}

// ================================================================
// ====== Check Noise Thresholds and Display Warnings ======
void checkNoiseThresholds(int db) {
  // Only show warnings if we're not in the middle of an important operation
  // and if enough time has passed since last warning check
  
  String warningMessage = "";
  bool shouldShowWarning = false;
  
  if (db >= NOISE_THRESHOLD_CRITICAL) {
    // Critical: Very loud
    warningMessage = "!! TOO LOUD !!  \nPlease keep quiet!\nNoise: " + String(db) + " dB";
    shouldShowWarning = true;
  } else if (db >= NOISE_THRESHOLD_HIGH) {
    // High: Too noisy
    warningMessage = "Too Noisy!      \nPlease lower your\nvoice. " + String(db) + " dB";
    shouldShowWarning = true;
  } else if (db >= NOISE_THRESHOLD_MEDIUM) {
    // Medium: Getting noisy
    warningMessage = "Getting Noisy   \nPlease keep it down\nNoise: " + String(db) + " dB";
    shouldShowWarning = true;
  } else if (db >= NOISE_THRESHOLD_LOW && db < NOISE_THRESHOLD_MEDIUM) {
    // Low: Slightly noisy (only show briefly)
    // Don't show warning for low levels to avoid spam
  }
  
  // Show warning if threshold crossed or already showing warning
  if (shouldShowWarning) {
    // Check if threshold was just crossed (going up) or we're already showing a warning
    bool thresholdJustCrossed = false;
    
    if (db >= NOISE_THRESHOLD_CRITICAL && lastNoiseLevel < NOISE_THRESHOLD_CRITICAL) {
      thresholdJustCrossed = true;
    } else if (db >= NOISE_THRESHOLD_HIGH && lastNoiseLevel < NOISE_THRESHOLD_HIGH) {
      thresholdJustCrossed = true;
    } else if (db >= NOISE_THRESHOLD_MEDIUM && lastNoiseLevel < NOISE_THRESHOLD_MEDIUM) {
      thresholdJustCrossed = true;
    }
    
    // Show warning if threshold just crossed, or if we're already showing one and still above threshold
    if (thresholdJustCrossed || showingNoiseWarning) {
      if (!showingNoiseWarning || thresholdJustCrossed) {
        // Display the warning
        displayNoiseWarning(warningMessage);
      }
      
      // Keep showing if still above threshold and duration not expired
      if (millis() - noiseWarningStartTime < NOISE_WARNING_DURATION) {
        return;  // Keep showing current warning
      } else {
        // Duration expired but still noisy - update message
        if (db >= NOISE_THRESHOLD_CRITICAL || db >= NOISE_THRESHOLD_HIGH) {
          // Still very noisy, keep showing updated warning
          displayNoiseWarning(warningMessage);
        } else {
          // Noise decreased, clear warning
          clearNoiseWarning();
        }
      }
    }
  } else {
    // Below all thresholds - clear warning if one was showing
    if (showingNoiseWarning) {
      clearNoiseWarning();
    }
  }
}

// ================================================================
// ====== Display Noise Warning on LCD ======
void displayNoiseWarning(String message) {
  // Don't show if admin priority message is active
  if (showingLcdMessage && lcdMessagePriority) {
    return;
  }
  
  showingNoiseWarning = true;
  noiseWarningStartTime = millis();
  
  lcd.clear();
  
  // Split message into lines (up to 4 lines, 20 chars each)
  String lines[4];
  int lineCount = 0;
  int lastPos = 0;
  
  // Split by newline first
  for (int i = 0; i < message.length() && lineCount < 4; i++) {
    if (message.charAt(i) == '\n' || i == message.length() - 1) {
      String line = message.substring(lastPos, i + 1);
      line.trim();
      
      // If line is longer than 20 chars, split it further
      while (line.length() > 20 && lineCount < 4) {
        lines[lineCount] = line.substring(0, 20);
        line = line.substring(20);
        lineCount++;
      }
      
      if (line.length() > 0 && lineCount < 4) {
        lines[lineCount] = line;
        lineCount++;
      }
      
      lastPos = i + 1;
    }
  }
  
  // Display lines on LCD (up to 4 lines)
  for (int i = 0; i < lineCount && i < 4; i++) {
    lcd.setCursor(0, i);
    // Pad to 20 chars to clear any leftover text
    String displayLine = lines[i];
    while (displayLine.length() < 20) {
      displayLine += " ";
    }
    displayLine = displayLine.substring(0, 20);  // Ensure max 20 chars
    lcd.print(displayLine);
  }
  
  Serial.println("⚠ Noise Warning: " + String(lastNoiseLevel) + " dB - " + message.substring(0, min(30, (int)message.length())));
}

// ================================================================
// ====== Clear Noise Warning ======
void clearNoiseWarning() {
  if (!showingNoiseWarning) {
    return;
  }
  
  showingNoiseWarning = false;
  noiseWarningStartTime = 0;
  
  // Return to normal display only if no admin message is showing
  if (!showingLcdMessage) {
    if (loggedInUser == "") {
      lcd.clear();
      lcd.print("Ready for RFID...");
      lcd.setCursor(0, 1);
      lcd.print("Tap your card");
    } else {
      // User is logged in, show their status
      lcd.clear();
      lcd.print("Welcome!");
      lcd.setCursor(0, 1);
      lcd.print(currentUserName);
      lcd.setCursor(0, 2);
      lcd.print("Logged IN");
      if (currentSeat > 0) {
        lcd.setCursor(0, 3);
        lcd.print("Seat: " + String(currentSeat));
      }
    }
  }
  
  Serial.println("✓ Noise warning cleared");
}

// ================================================================
// ====== Setup ======
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=== STARTING ESP32 ===");
  Serial.println("Baud rate: 115200");
  Serial.println("System initializing...\n");
  
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("Initializing...");
  
  SPI.begin();
  rfid.PCD_Init();
  
  Serial.println("\n=== ESP32 RFID Login System ===");
  
  // Initialize microphone
  initMicrophone();
  
  connectWiFi();
  
  lcd.clear();
  lcd.print("Ready for RFID...");
  lcd.setCursor(0, 1);
  lcd.print("Tap your card");
  
  Serial.println("System ready!");
}

// ================================================================
// ====== Main Loop ======
void loop() {
  // Check for LCD messages every 5 seconds
  if (millis() - lastLcdCheck > LCD_CHECK_INTERVAL) {
    checkLcdMessage();
    lastLcdCheck = millis();
  }
  
  // Check if LCD message duration has expired
  if (showingLcdMessage && lcdMessage.length() > 0) {
    if (millis() - lcdMessageStartTime > lcdMessageDuration) {
      // Message duration expired
      Serial.println("✓ LCD Message duration expired, clearing");
      showingLcdMessage = false;
      lcdMessage = "";
      lcdMessagePriority = false;
      
      // Return to normal display
      if (loggedInUser == "") {
        lcd.clear();
        lcd.print("Ready for RFID...");
        lcd.setCursor(0, 1);
        lcd.print("Tap your card");
      } else {
        // User is logged in, show their status
        lcd.clear();
        lcd.print("Welcome!");
        lcd.setCursor(0, 1);
        lcd.print(currentUserName);
        lcd.setCursor(0, 2);
        lcd.print("Logged IN");
        if (currentSeat > 0) {
          lcd.setCursor(0, 3);
          lcd.print("Seat: " + String(currentSeat));
        }
      }
    }
  }
  
  // If showing priority message, don't update noise display or process RFID
  if (showingLcdMessage && lcdMessagePriority && lcdMessage.length() > 0) {
    delay(100);
    return;  // Skip normal operations while priority message is showing
  }
  
  // Monitor sound levels every 2 seconds and display
  static unsigned long lastSoundCheck = 0;
  static unsigned long lastNoiseLog = 0;
  static bool showingIdle = true;
  
  if (millis() - lastSoundCheck > 2000) {  // Check every 2 seconds for stability
    // Take average of 5 readings for stable value
    float totalDb = 0;
    int samples = 0;
    for (int i = 0; i < 5; i++) {
      int db = readSoundLevel();
      totalDb += db;  // Include all readings, even 0 (quiet = 0 dB, not an error)
      samples++;
    }
    
    if (samples > 0) {
      int avgDb = (int)(totalDb / samples);
      
      // Check for noise threshold warnings (only if not showing admin message or admin message is not priority)
      if (!showingLcdMessage || !lcdMessagePriority) {
        checkNoiseThresholds(avgDb);
      }
      
      // ALWAYS show noise level on line 3 when idle (never hide it)
      // But only if we're not showing an LCD message or noise warning
      if (showingIdle && !showingLcdMessage && !showingNoiseWarning) {
        lcd.setCursor(0, 3);
        lcd.print("Noise: " + String(avgDb) + " dB    ");
        Serial.println("Average noise: " + String(avgDb) + " dB");
      }
      
      // Log noise to database every 5 seconds (continuously, even when no user logged in)
      if (millis() - lastNoiseLog > 5000) {
        logNoiseUpdate(avgDb);
        lastNoiseLog = millis();
      }
      
      lastNoiseLevel = avgDb;  // Store for threshold detection
    }
    lastSoundCheck = millis();
  }
  
  // Check for RFID card (but not if showing priority admin message)
  if (!showingLcdMessage || !lcdMessagePriority) {
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      showingIdle = false; // Stop showing noise while processing
      showingNoiseWarning = false; // Clear noise warning when processing RFID
    
    // Read RFID UID
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    
    Serial.println("\n=================================");
    Serial.println("RFID Card Detected: " + uid);
    
    // Store whether we were showing an LCD message before processing RFID
    bool wasShowingLcdMessage = showingLcdMessage;
    String savedLcdMessage = lcdMessage;
    bool savedLcdMessagePriority = lcdMessagePriority;
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Card: " + uid.substring(0, 10));
    
    // Look up user
    String userName = getUserFromRfid(uid);
    
    if (userName.length() > 0) {
      // User found
      if (loggedInUser == uid) {
        // LOGOUT
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Goodbye!");
        lcd.setCursor(0, 1);
        lcd.print(userName);
        lcd.setCursor(0, 2);
        lcd.print("Logged OUT");
        
        Serial.println("✓ Logged OUT: " + userName);
        
        // Free the seat (if one was assigned)
        if (currentSeat > 0) {
          freeSeat(currentSeat);
          lcd.setCursor(0, 3);
          lcd.print("Seat " + String(currentSeat) + " freed");
          
          // Log logout event with seat number
          logEvent(uid, userName, "logout", currentSeat);
        } else {
          // Log logout event without seat
          logEvent(uid, userName, "logout", 0);
          lcd.setCursor(0, 3);
          lcd.print("Seat freed");
        }
        
        loggedInUser = "";  // Clear logged in user
        currentSeat = 0;
        currentRfidUid = "";
        currentUserName = "";
        
        delay(3000);
        if (wasShowingLcdMessage && savedLcdMessage.length() > 0) {
          // Restore LCD message
          lcdMessage = savedLcdMessage;
          lcdMessagePriority = savedLcdMessagePriority;
          showingLcdMessage = true;
          displayLcdMessage();
        } else if (!showingLcdMessage) {
          lcd.clear();
          lcd.print("Ready for RFID...");
          lcd.setCursor(0, 1);
          lcd.print("Tap your card");
        }
        showingIdle = true;
        
        // Immediately show current noise level (if not showing LCD message)
        if (!showingLcdMessage) {
          int currentNoise = readSoundLevel();
          if (currentNoise > 0) {
            lcd.setCursor(0, 3);
            lcd.print("Noise: " + String(currentNoise) + " dB    ");
          }
        }
      } else {
        // Check if this user already has an occupied seat
        int myExistingSeat = findMySeat(uid);
        
        if (myExistingSeat > 0) {
          // User already has a seat - LOGOUT
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Goodbye!");
          lcd.setCursor(0, 1);
          lcd.print(userName);
          lcd.setCursor(0, 2);
          lcd.print("Logged OUT");
          
          Serial.println("✓ Logged OUT: " + userName);
          
          // Free the seat
          freeSeat(myExistingSeat);
          lcd.setCursor(0, 3);
          lcd.print("Seat " + String(myExistingSeat) + " freed");
          
          // Log logout event
          logEvent(uid, userName, "logout", myExistingSeat);
          
          delay(3000);
          if (wasShowingLcdMessage && savedLcdMessage.length() > 0) {
            // Restore LCD message
            lcdMessage = savedLcdMessage;
            lcdMessagePriority = savedLcdMessagePriority;
            showingLcdMessage = true;
            displayLcdMessage();
          } else if (!showingLcdMessage) {
            lcd.clear();
            lcd.print("Ready for RFID...");
            lcd.setCursor(0, 1);
            lcd.print("Tap your card");
          }
          showingIdle = true;
          
          // Immediately show current noise level (if not showing LCD message)
          if (!showingLcdMessage) {
            int currentNoise = readSoundLevel();
            if (currentNoise > 0) {
              lcd.setCursor(0, 3);
              lcd.print("Noise: " + String(currentNoise) + " dB    ");
            }
          }
        } else {
          // LOGIN - User doesn't have a seat
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Welcome!");
          lcd.setCursor(0, 1);
          lcd.print(userName);
          lcd.setCursor(0, 2);
          lcd.print("Logged IN");
          
          Serial.println("✓ Logged IN: " + userName);
          
          // Find and occupy a seat
          int availableSeat = findAvailableSeat();
          if (availableSeat > 0) {
            occupySeat(availableSeat, uid);
            currentSeat = availableSeat;
            lcd.setCursor(0, 3);
            lcd.print("Seat: " + String(availableSeat));
            
            // Log login event with seat number
            logEvent(uid, userName, "login", availableSeat);
          } else {
            lcd.setCursor(0, 3);
            lcd.print("No free seats!");
            Serial.println("⚠ No seats available");
            logEvent(uid, userName, "login", 0);
          }
          
          loggedInUser = uid;  // Store logged in user
          currentRfidUid = uid;  // Store for noise logging
          currentUserName = userName;  // Store for noise logging
          
          delay(3000);
          if (wasShowingLcdMessage && savedLcdMessage.length() > 0) {
            // Restore LCD message
            lcdMessage = savedLcdMessage;
            lcdMessagePriority = savedLcdMessagePriority;
            showingLcdMessage = true;
            displayLcdMessage();
          } else if (!showingLcdMessage) {
            lcd.clear();
            lcd.print("Ready for RFID...");
            lcd.setCursor(0, 1);
            lcd.print("Tap to LOGOUT");
          }
          showingIdle = true;
          
          // Immediately show current noise level (if not showing LCD message)
          if (!showingLcdMessage) {
            int currentNoise = readSoundLevel();
            if (currentNoise > 0) {
              lcd.setCursor(0, 3);
              lcd.print("Noise: " + String(currentNoise) + " dB    ");
            }
          }
        }
      }
    } else {
      // User not found - Display RFID ID for registration
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Unregistered Card");
      lcd.setCursor(0, 1);
      lcd.print("ID: " + uid.substring(0, 13));
      lcd.setCursor(0, 2);
      lcd.print(uid.substring(13, 20));
      lcd.setCursor(0, 3);
      lcd.print("Copy this ID");
      
      Serial.println("✗ Card not registered in database");
      Serial.println("CARD ID FOR REGISTRATION: " + uid);
      
      delay(12000); // Show for 12 seconds so user can write it down
      
      if (wasShowingLcdMessage && savedLcdMessage.length() > 0) {
        // Restore LCD message
        lcdMessage = savedLcdMessage;
        lcdMessagePriority = savedLcdMessagePriority;
        showingLcdMessage = true;
        displayLcdMessage();
      } else if (!showingLcdMessage) {
        lcd.clear();
        lcd.print("Ready for RFID...");
        lcd.setCursor(0, 1);
        lcd.print("Tap your card");
      }
      showingIdle = true;
      
      // Immediately show current noise level (if not showing LCD message)
      if (!showingLcdMessage) {
        int currentNoise = readSoundLevel();
        if (currentNoise > 0) {
          lcd.setCursor(0, 3);
          lcd.print("Noise: " + String(currentNoise) + " dB    ");
        }
      }
    }
    
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
    }
  }
  
  delay(100);
}

