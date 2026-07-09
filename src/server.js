const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');
const Orchestrator = require('./orchestrator');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function saveBase64Image(base64Data, filename) {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;
  const buffer = Buffer.from(matches[2], 'base64');
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${filename}`;
}

const app = express();
const port = process.env.PORT || 3000;
const orchestrator = new Orchestrator();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

/**
 * API: Get all runs (summarized metadata)
 */
app.get('/api/runs', async (req, res) => {
  try {
    const snapshot = await db.collection('runs').orderBy('startedAt', 'desc').limit(20).get();
    const runs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      runs.push({
        id: data.id,
        status: data.status,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        inputs: data.inputs,
        report: data.report
      });
    });
    res.json(runs);
  } catch (error) {
    console.error('Failed to get runs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Get specific run details
 */
app.get('/api/runs/:runId', async (req, res) => {
  try {
    const doc = await db.collection('runs').doc(req.params.runId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(doc.data());
  } catch (error) {
    console.error('Failed to get run details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Get specific run logs
 */
app.get('/api/runs/:runId/logs', async (req, res) => {
  try {
    const snapshot = await db.collection('runs')
      .doc(req.params.runId)
      .collection('logs')
      .orderBy('timestamp', 'asc')
      .get();
      
    const logs = [];
    snapshot.forEach(doc => {
      logs.push(doc.data());
    });
    res.json(logs);
  } catch (error) {
    console.error('Failed to get run logs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * API: Start a new run (Asynchronous)
 */
app.post('/api/runs', async (req, res) => {
  const { repoUrl, figmaUrl, appUrl, apiDocs, userStories, figmaImage, appImage, runUI, runBackend } = req.body;
  
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required' });
  }

  const runId = 'run_' + Date.now();
  
  // Save base64 images to local files to avoid Firestore 1MB document size limit
  let figmaImagePath = null;
  let appImagePath = null;
  try {
    if (figmaImage) {
      figmaImagePath = saveBase64Image(figmaImage, `figma_${runId}.png`);
    }
    if (appImage) {
      appImagePath = saveBase64Image(appImage, `app_${runId}.png`);
    }
  } catch (err) {
    console.error('Failed to save uploaded image files:', err);
  }

  const inputs = {
    repoUrl,
    figmaUrl: figmaUrl || '',
    appUrl: appUrl || '',
    apiDocs: apiDocs || '',
    userStories: userStories || [],
    figmaImage: figmaImagePath,
    appImage: appImagePath,
    runUI: runUI !== false,
    runBackend: runBackend !== false
  };

  // Trigger orchestration asynchronously in the background
  orchestrator.run(inputs, runId).catch(err => {
    console.error(`Background Orchestration run ${runId} failed:`, err);
  });

  res.status(202).json({
    message: 'Orchestration run accepted and started in background.',
    runId
  });
});

app.listen(port, () => {
  console.log(`======================================================`);
  console.log(`🚀 SS TestSphere API server listening at http://localhost:${port}`);
  console.log(`======================================================`);
});
