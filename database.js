require('dotenv').config();
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

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

// ============================================================================
// LOCAL DB FALLBACK SYSTEM (Self-healing in case of Firestore Quota limits)
// ============================================================================

class MockDocRef {
  constructor(collectionPath, docId, localDb) {
    this.collectionPath = collectionPath;
    this.id = docId;
    this.localDb = localDb;
  }

  async get() {
    const data = this.localDb.getData(this.collectionPath, this.id);
    return {
      exists: !!data,
      data: () => data
    };
  }

  async set(data, options = {}) {
    this.localDb.setData(this.collectionPath, this.id, data, options.merge);
    return { writeTime: new Date() };
  }

  async update(data) {
    this.localDb.setData(this.collectionPath, this.id, data, true);
    return { writeTime: new Date() };
  }

  async delete() {
    this.localDb.deleteData(this.collectionPath, this.id);
    return { writeTime: new Date() };
  }

  collection(subCollectionName) {
    return new MockCollectionRef(`${this.collectionPath}/${this.id}/${subCollectionName}`, this.localDb);
  }
}

class MockCollectionRef {
  constructor(collectionPath, localDb) {
    this.collectionPath = collectionPath;
    this.localDb = localDb;
    this.orderField = null;
    this.orderDirection = 'asc';
    this.limitCount = null;
  }

  doc(id) {
    return new MockDocRef(this.collectionPath, id, this.localDb);
  }

  async add(data) {
    const id = 'doc_' + Math.random().toString(36).substr(2, 9);
    this.localDb.setData(this.collectionPath, id, { id, ...data });
    return new MockDocRef(this.collectionPath, id, this.localDb);
  }

  orderBy(field, direction = 'asc') {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  async get() {
    let docsData = this.localDb.getCollectionData(this.collectionPath);
    if (this.orderField) {
      docsData.sort((a, b) => {
        const valA = a[this.orderField];
        const valB = b[this.orderField];
        if (valA === valB) return 0;
        const compareVal = valA > valB ? 1 : -1;
        return this.orderDirection === 'desc' ? -compareVal : compareVal;
      });
    }
    if (this.limitCount !== null) {
      docsData = docsData.slice(0, this.limitCount);
    }

    const docs = docsData.map(data => ({
      id: data.id || 'id',
      data: () => data
    }));

    return {
      forEach: (callback) => docs.forEach(callback),
      docs
    };
  }
}

class LocalDatabase {
  constructor() {
    this.dbPath = path.join(__dirname, 'local_db.json');
    this.data = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        this.data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      }
    } catch (e) {
      console.error('Failed to load local DB, using empty DB:', e);
      this.data = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save local DB:', e);
    }
  }

  getData(collectionPath, docId) {
    const col = this.data[collectionPath] || {};
    return col[docId];
  }

  setData(collectionPath, docId, data, merge = false) {
    if (!this.data[collectionPath]) {
      this.data[collectionPath] = {};
    }
    const current = this.data[collectionPath][docId] || {};
    if (merge) {
      this.data[collectionPath][docId] = { ...current, ...data };
    } else {
      this.data[collectionPath][docId] = data;
    }
    this.save();
  }

  deleteData(collectionPath, docId) {
    if (this.data[collectionPath]) {
      delete this.data[collectionPath][docId];
      this.save();
    }
  }

  getCollectionData(collectionPath) {
    const col = this.data[collectionPath] || {};
    return Object.values(col);
  }

  collection(name) {
    return new MockCollectionRef(name, this);
  }
}

const localDbInstance = new LocalDatabase();
let useLocalDb = false;

let firestoreDb;
try {
  firestoreDb = getFirestore();
} catch (err) {
  console.warn('Failed to initialize Firestore. Switched to local JSON database.');
  useLocalDb = true;
}

function isQuotaError(err) {
  return err && err.message && (
    err.message.includes('RESOURCE_EXHAUSTED') ||
    err.message.includes('Quota exceeded') ||
    err.code === 8 ||
    err.code === 16
  );
}

function wrapCollectionRef(colRef, colName) {
  return new Proxy(colRef, {
    get(target, prop, receiver) {
      if (prop === 'doc') {
        return (docId) => {
          if (useLocalDb) return localDbInstance.collection(colName).doc(docId);
          try {
            const docRef = target.doc(docId);
            return wrapDocRef(docRef, colName, docId);
          } catch (err) {
            console.warn('Firestore doc creation failed. Switching to local JSON database.');
            useLocalDb = true;
            return localDbInstance.collection(colName).doc(docId);
          }
        };
      }
      if (prop === 'add') {
        return async (data) => {
          if (useLocalDb) return localDbInstance.collection(colName).add(data);
          try {
            return await target.add(data);
          } catch (err) {
            if (isQuotaError(err)) {
              console.warn('Firestore add failed due to quota. Switching to local JSON database.');
              useLocalDb = true;
              return localDbInstance.collection(colName).add(data);
            }
            throw err;
          }
        };
      }
      if (prop === 'orderBy' || prop === 'limit') {
        return (...args) => {
          if (useLocalDb) return localDbInstance.collection(colName)[prop](...args);
          try {
            const query = target[prop](...args);
            return wrapQuery(query, colName);
          } catch (err) {
            useLocalDb = true;
            return localDbInstance.collection(colName)[prop](...args);
          }
        };
      }
      if (prop === 'get') {
        return async () => {
          if (useLocalDb) return localDbInstance.collection(colName).get();
          try {
            return await target.get();
          } catch (err) {
            if (isQuotaError(err)) {
              console.warn('Firestore get failed due to quota. Switching to local JSON database.');
              useLocalDb = true;
              return localDbInstance.collection(colName).get();
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapDocRef(docRef, colName, docId) {
  return new Proxy(docRef, {
    get(target, prop, receiver) {
      if (prop === 'collection') {
        return (subName) => {
          const subPath = `${colName}/${docId}/${subName}`;
          if (useLocalDb) return localDbInstance.collection(subPath);
          try {
            const subCol = target.collection(subName);
            return wrapCollectionRef(subCol, subPath);
          } catch (err) {
            useLocalDb = true;
            return localDbInstance.collection(subPath);
          }
        };
      }
      if (prop === 'get' || prop === 'set' || prop === 'update' || prop === 'delete') {
        return async (...args) => {
          if (useLocalDb) {
            const localDoc = localDbInstance.collection(colName).doc(docId);
            return localDoc[prop](...args);
          }
          try {
            return await target[prop](...args);
          } catch (err) {
            if (isQuotaError(err)) {
              console.warn(`Firestore doc.${prop} failed due to quota. Switching to local JSON database.`);
              useLocalDb = true;
              const localDoc = localDbInstance.collection(colName).doc(docId);
              return localDoc[prop](...args);
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function wrapQuery(query, colName) {
  return new Proxy(query, {
    get(target, prop, receiver) {
      if (prop === 'orderBy' || prop === 'limit') {
        return (...args) => {
          if (useLocalDb) return localDbInstance.collection(colName)[prop](...args);
          try {
            return wrapQuery(target[prop](...args), colName);
          } catch (err) {
            useLocalDb = true;
            return localDbInstance.collection(colName)[prop](...args);
          }
        };
      }
      if (prop === 'get') {
        return async () => {
          if (useLocalDb) return localDbInstance.collection(colName).get();
          try {
            return await target.get();
          } catch (err) {
            if (isQuotaError(err)) {
              console.warn('Firestore query.get failed due to quota. Switching to local JSON database.');
              useLocalDb = true;
              return localDbInstance.collection(colName).get();
            }
            throw err;
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

// Proxy wrapper for the db object
const db = new Proxy({}, {
  get(target, prop) {
    if (prop === 'collection') {
      return (name) => {
        if (useLocalDb) return localDbInstance.collection(name);
        try {
          const colRef = firestoreDb.collection(name);
          return wrapCollectionRef(colRef, name);
        } catch (err) {
          console.warn('Firestore collection lookup failed. Switching to local JSON database.');
          useLocalDb = true;
          return localDbInstance.collection(name);
        }
      };
    }
    return useLocalDb ? localDbInstance[prop] : firestoreDb[prop];
  }
});

module.exports = {
  admin,
  db
};
