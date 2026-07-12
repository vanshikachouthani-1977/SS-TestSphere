require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  orderBy, 
  limit 
} = require('firebase/firestore');

// User Provided Firebase Web Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0p1n2dNzrPlNfmDUzRIcLD_-fuF0o0AA",
  authDomain: "shoppersstop-72ddf.firebaseapp.com",
  projectId: "shoppersstop-72ddf",
  storageBucket: "shoppersstop-72ddf.firebasestorage.app",
  messagingSenderId: "510002731119",
  appId: "1:510002731119:web:ed79881fed8ac82252559a",
  measurementId: "G-VW8TT1DZP4"
};

// ============================================================================
// COMPATIBILITY ADAPTER CLASSES FOR FIREBASE CLIENT SDK (Chainable Interface)
// ============================================================================

class DocumentReferenceCompat {
  constructor(clientDb, basePath, docId) {
    this.clientDb = clientDb;
    this.basePath = basePath;
    this.id = docId;
    this.ref = doc(clientDb, basePath, docId);
  }

  async get() {
    const snap = await getDoc(this.ref);
    return {
      exists: snap.exists(),
      data: () => snap.data()
    };
  }

  async set(data, options = {}) {
    await setDoc(this.ref, data, options);
    return { writeTime: new Date() };
  }

  async update(data) {
    await updateDoc(this.ref, data);
    return { writeTime: new Date() };
  }

  async delete() {
    await deleteDoc(this.ref);
    return { writeTime: new Date() };
  }

  collection(subCollectionName) {
    return new CollectionReferenceCompat(this.clientDb, `${this.basePath}/${this.id}/${subCollectionName}`);
  }
}

class CollectionReferenceCompat {
  constructor(clientDb, basePath) {
    this.clientDb = clientDb;
    this.basePath = basePath;
    this.ref = collection(clientDb, basePath);
    this.queryConstraints = [];
  }

  doc(id) {
    return new DocumentReferenceCompat(this.clientDb, this.basePath, id);
  }

  async add(data) {
    const docRef = await addDoc(this.ref, data);
    return new DocumentReferenceCompat(this.clientDb, this.basePath, docRef.id);
  }

  orderBy(field, direction = 'asc') {
    this.queryConstraints.push(orderBy(field, direction));
    return this;
  }

  limit(count) {
    this.queryConstraints.push(limit(count));
    return this;
  }

  async get() {
    let q = query(this.ref, ...this.queryConstraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({
      id: d.id,
      data: () => d.data()
    }));
    return {
      forEach: (callback) => docs.forEach(callback),
      docs
    };
  }
}

// ============================================================================
// LOCAL DB FALLBACK SYSTEM (Self-healing in case of connection or rule errors)
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

// Initialize Firebase Client App and Firestore
let firebaseApp;
let clientDb;

try {
  firebaseApp = initializeApp(firebaseConfig);
  clientDb = getFirestore(firebaseApp);
  console.log('Firebase Client App and Firestore initialized successfully.');
} catch (err) {
  console.warn('Failed to initialize Firebase Client SDK. Switched to local JSON database:', err.message);
  useLocalDb = true;
}

function isErrorTriggeringFallback(err) {
  if (!err) return false;
  const msg = err.message ? err.message.toLowerCase() : '';
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota exceeded') ||
    msg.includes('permission-denied') ||
    msg.includes('permission denied') ||
    msg.includes('unauthenticated') ||
    err.code === 'permission-denied' ||
    err.code === 'resource-exhausted'
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
            if (isErrorTriggeringFallback(err)) {
              console.warn('Firestore add failed. Switching to local JSON database:', err.message);
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
            if (isErrorTriggeringFallback(err)) {
              console.warn('Firestore get failed. Switching to local JSON database:', err.message);
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
            if (isErrorTriggeringFallback(err)) {
              console.warn(`Firestore doc.${prop} failed. Switching to local JSON database:`, err.message);
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
            if (isErrorTriggeringFallback(err)) {
              console.warn('Firestore query.get failed. Switching to local JSON database:', err.message);
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

// Compatibility DB Object
const compatDbInstance = {
  collection(name) {
    return new CollectionReferenceCompat(clientDb, name);
  }
};

// Proxy wrapper for the db object
const db = new Proxy({}, {
  get(target, prop) {
    if (prop === 'collection') {
      return (name) => {
        if (useLocalDb) return localDbInstance.collection(name);
        try {
          const colRef = compatDbInstance.collection(name);
          return wrapCollectionRef(colRef, name);
        } catch (err) {
          console.warn('Firestore collection lookup failed. Switching to local JSON database:', err.message);
          useLocalDb = true;
          return localDbInstance.collection(name);
        }
      };
    }
    return useLocalDb ? localDbInstance[prop] : compatDbInstance[prop];
  }
});

module.exports = {
  admin: firebaseApp,
  db
};
