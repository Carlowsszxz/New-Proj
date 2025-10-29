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
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
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
  
  // Professional decibel calculation
  int samples_read = bytes_read / sizeof(int32_t);
  double sum = 0;
  
  for (int i = 0; i < samples_read; i++) {
    // Use >> 14 for I2S 32-bit samples (standard practice)
    int32_t sample = buffer[i] >> 14;
    sum += sample * sample;
  }
  
  if (samples_read == 0) return 0;
  
  double mean = sum / samples_read;
  double rms = sqrt(mean);
  
  // Professional decibel formula: 20 * log10(rms / reference + 1)
  // Reference value of 1000 provides appropriate scaling
  double decibelValue = 20.0 * log10(rms / 1000.0 + 1.0);
  int decibel = (int)decibelValue;
  
  // Clamp to realistic range (40-100 dB)
  // Don't clamp minimum too low - let it be lower if mic is quiet
  if (decibel < 0) decibel = 0;
  if (decibel > 100) decibel = 100;
  
  // Debug output every 5 reads to see what's happening
  static int debugCount = 0;
  if (debugCount++ % 5 == 0) {
    Serial.println("Mic - RMS: " + String((int)rms) + ", Raw dB: " + String(decibelValue, 2) + ", Final dB: " + String(decibel));
  }
  
  return decibel;
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
      if (db > 0) {  // Only count if mic is working
        totalDb += db;
        samples++;
      }
    }
    
    if (samples > 0) {
      int avgDb = (int)(totalDb / samples);
      
      // ALWAYS show noise level on line 3 when idle (never hide it)
      if (showingIdle) {
        lcd.setCursor(0, 3);
        lcd.print("Noise: " + String(avgDb) + " dB    ");
        Serial.println("Average noise: " + String(avgDb) + " dB");
      }
      
      // Log noise to database every 5 seconds (continuously, even when no user logged in)
      if (millis() - lastNoiseLog > 5000) {
        logNoiseUpdate(avgDb);
        lastNoiseLog = millis();
      }
    } else {
      // If microphone reading fails, show error
      if (showingIdle) {
        lcd.setCursor(0, 3);
        lcd.print("Mic error        ");
      }
    }
    lastSoundCheck = millis();
  }
  
  // Check for RFID card
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    showingIdle = false; // Stop showing noise while processing
    
    // Read RFID UID
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    
    Serial.println("\n=================================");
    Serial.println("RFID Card Detected: " + uid);
    
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
        lcd.clear();
        lcd.print("Ready for RFID...");
        lcd.setCursor(0, 1);
        lcd.print("Tap your card");
        showingIdle = true;
        
        // Immediately show current noise level
        int currentNoise = readSoundLevel();
        if (currentNoise > 0) {
          lcd.setCursor(0, 3);
          lcd.print("Noise: " + String(currentNoise) + " dB    ");
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
          lcd.clear();
          lcd.print("Ready for RFID...");
          lcd.setCursor(0, 1);
          lcd.print("Tap your card");
          showingIdle = true;
          
          // Immediately show current noise level
          int currentNoise = readSoundLevel();
          if (currentNoise > 0) {
            lcd.setCursor(0, 3);
            lcd.print("Noise: " + String(currentNoise) + " dB    ");
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
          lcd.clear();
          lcd.print("Ready for RFID...");
          lcd.setCursor(0, 1);
          lcd.print("Tap to LOGOUT");
          showingIdle = true;
          
          // Immediately show current noise level
          int currentNoise = readSoundLevel();
          if (currentNoise > 0) {
            lcd.setCursor(0, 3);
            lcd.print("Noise: " + String(currentNoise) + " dB    ");
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
      
      lcd.clear();
      lcd.print("Ready for RFID...");
      lcd.setCursor(0, 1);
      lcd.print("Tap your card");
      showingIdle = true;
      
      // Immediately show current noise level
      int currentNoise = readSoundLevel();
      if (currentNoise > 0) {
        lcd.setCursor(0, 3);
        lcd.print("Noise: " + String(currentNoise) + " dB    ");
      }
    }
    
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }
  
  delay(100);
}

