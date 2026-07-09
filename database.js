require('dotenv').config();
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

// Load service account key from env or file
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
  try {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
  } catch (error) {
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_B64 from environment:', error);
    process.exit(1);
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    let jsonStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
    if (jsonStr.startsWith("'") && jsonStr.endsWith("'")) {
      jsonStr = jsonStr.slice(1, -1);
    }
    serviceAccount = JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_JSON from environment:', error);
    process.exit(1);
  }
} else {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  try {
    serviceAccount = require(serviceAccountPath);
  } catch (error) {
    console.error('Error loading serviceAccountKey.json. Please make sure the file exists or credentials are set in env.');
    process.exit(1);
  }
}

// Initialize Firebase Admin SDK
try {
  admin.initializeApp({
    credential: admin.cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error.message);
  process.exit(1);
}

// Get Firestore instance
const db = getFirestore();

module.exports = {
  admin,
  db
};
