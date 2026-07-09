// SS TestSphere Dashboard logic

// State Management
let activeRunId = null;
let pollingInterval = null;
let knownLogsCount = 0;
let uploadedFigmaBase64 = null;
let uploadedAppBase64 = null;

// DOM Elements
const runForm = document.getElementById('runForm');
const submitBtn = document.getElementById('submitBtn');
const runsHistoryList = document.getElementById('runsHistoryList');
const noSelectionView = document.getElementById('noSelectionView');
const runDetailView = document.getElementById('runDetailView');

const detailRunId = document.getElementById('detailRunId');
const detailStatus = document.getElementById('detailStatus');
const detailTime = document.getElementById('detailTime');
const refreshBtn = document.getElementById('refreshBtn');

const reportOverviewCard = document.getElementById('reportOverviewCard');
const scoreProgressCircle = document.getElementById('scoreProgressCircle');
const qualityScoreVal = document.getElementById('qualityScoreVal');
const recBadge = document.getElementById('recBadge');
const reportSummary = document.getElementById('reportSummary');

const defectsCard = document.getElementById('defectsCard');
const defectsTableBody = document.getElementById('defectsTableBody');
const consoleBody = document.getElementById('consoleBody');

const deductionsContainer = document.getElementById('deductionsContainer');
const deductionsTableBody = document.getElementById('deductionsTableBody');
const testCasesContainer = document.getElementById('testCasesContainer');
const testCasesTableBody = document.getElementById('testCasesTableBody');
const coverageBadge = document.getElementById('coverageBadge');

const agentDetailCard = document.getElementById('agentDetailCard');
const agentDetailName = document.getElementById('agentDetailName');
const agentDetailStatus = document.getElementById('agentDetailStatus');
const agentDetailStart = document.getElementById('agentDetailStart');
const agentDetailEnd = document.getElementById('agentDetailEnd');
const agentDetailErrorContainer = document.getElementById('agentDetailErrorContainer');
const agentDetailErrorText = document.getElementById('agentDetailErrorText');
const agentDetailOutputText = document.getElementById('agentDetailOutputText');
const closeAgentDetailBtn = document.getElementById('closeAgentDetailBtn');

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  fetchRunsHistory();
  // Poll runs history list every 5 seconds
  setInterval(fetchRunsHistory, 5000);
  
  // Attach event listeners
  runForm.addEventListener('submit', handleFormSubmit);
  refreshBtn.addEventListener('click', () => pollActiveRunDetails(true));
  closeAgentDetailBtn.addEventListener('click', hideAgentDetail);
  
  // Setup node click event listeners
  document.querySelectorAll('.flow-node').forEach(node => {
    node.addEventListener('click', () => {
      const agentName = node.getAttribute('data-agent');
      if (agentName) showAgentDetail(agentName);
    });
  });

  // Dynamic panel toggles based on checkboxes
  const runUICheckbox = document.getElementById('runUI');
  const runBackendCheckbox = document.getElementById('runBackend');
  const uiInputsContainer = document.getElementById('uiInputsContainer');
  const backendInputsContainer = document.getElementById('backendInputsContainer');

  function updatePanelVisibilities() {
    const repoInput = document.getElementById('repoUrl');
    
    if (runUICheckbox.checked) {
      uiInputsContainer.classList.remove('hidden');
    } else {
      uiInputsContainer.classList.add('hidden');
    }

    if (runBackendCheckbox.checked) {
      backendInputsContainer.classList.remove('hidden');
      repoInput.required = true;
    } else {
      backendInputsContainer.classList.add('hidden');
      repoInput.required = false;
    }
  }

  runUICheckbox.addEventListener('change', updatePanelVisibilities);
  runBackendCheckbox.addEventListener('change', updatePanelVisibilities);

  // Initialize visibility state
  updatePanelVisibilities();

  // Setup tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.form-group');
      const targetType = btn.closest('.tab-control').getAttribute('data-target');
      const selectedTab = btn.getAttribute('data-tab');
      
      parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      parent.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      parent.querySelector(`#${targetType}-tab-${selectedTab}`).classList.remove('hidden');
      
      if (selectedTab === 'link') {
        if (targetType === 'figma') {
          uploadedFigmaBase64 = null;
          document.getElementById('figmaPreview').classList.add('hidden');
          document.getElementById('figmaDropZone').querySelector('.drop-zone-prompt').classList.remove('hidden');
          document.getElementById('figmaFile').value = '';
        } else {
          uploadedAppBase64 = null;
          document.getElementById('appPreview').classList.add('hidden');
          document.getElementById('appDropZone').querySelector('.drop-zone-prompt').classList.remove('hidden');
          document.getElementById('appFile').value = '';
        }
      } else {
        if (targetType === 'figma') {
          document.getElementById('figmaUrl').value = '';
        } else {
          document.getElementById('appUrl').value = '';
        }
      }
    });
  });

  // Setup Drag and Drop
  ['figma', 'app'].forEach(type => {
    const dropZone = document.getElementById(`${type}DropZone`);
    const fileInput = document.getElementById(`${type}File`);
    const previewContainer = document.getElementById(`${type}Preview`);
    const previewImg = previewContainer.querySelector('.preview-img');
    const promptText = dropZone.querySelector('.drop-zone-prompt');

    dropZone.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-preview-btn') || e.target.closest('.preview-container')) {
        return;
      }
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        handleFileSelect(fileInput.files[0], type, previewContainer, previewImg, promptText);
      }
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(e.dataTransfer.files[0], type, previewContainer, previewImg, promptText);
      }
    });
  });

  // Setup preview removal
  document.querySelectorAll('.remove-preview-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetType = btn.getAttribute('data-target');
      const dropZone = document.getElementById(`${targetType}DropZone`);
      const promptText = dropZone.querySelector('.drop-zone-prompt');
      const fileInput = document.getElementById(`${targetType}File`);
      const previewContainer = document.getElementById(`${targetType}Preview`);
      
      fileInput.value = '';
      if (targetType === 'figma') {
        uploadedFigmaBase64 = null;
      } else {
        uploadedAppBase64 = null;
      }
      previewContainer.classList.add('hidden');
      promptText.classList.remove('hidden');
    });
  });
});

function handleFileSelect(file, type, previewContainer, previewImg, promptText) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file only.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    if (type === 'figma') {
      uploadedFigmaBase64 = base64;
    } else {
      uploadedAppBase64 = base64;
    }
    previewImg.src = base64;
    previewContainer.classList.remove('hidden');
    promptText.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

// Fetch all runs from API to populate sidebar
async function fetchRunsHistory() {
  try {
    const response = await fetch('/api/runs');
    if (!response.ok) throw new Error('Failed to load history');
    const runs = await response.json();
    
    if (runs.length === 0) {
      runsHistoryList.innerHTML = '<div class="no-runs-text">No test runs found.</div>';
      return;
    }
    
    let html = '';
    runs.forEach(run => {
      const activeClass = run.id === activeRunId ? 'active' : '';
      const dateStr = new Date(run.startedAt).toLocaleTimeString();
      const scoreStr = run.report ? `${run.report.qualityScore}%` : '--';
      
      html += `
        <div class="history-item ${activeClass}" onclick="selectRun('${run.id}')">
          <div class="history-meta">
            <h4>${run.id}</h4>
            <p>Started: ${dateStr} | Score: ${scoreStr}</p>
          </div>
          <span class="status-indicator ${run.status}"></span>
        </div>
      `;
    });
    runsHistoryList.innerHTML = html;
  } catch (error) {
    console.error('Error fetching history:', error);
  }
}

// Select a run to view its details
function selectRun(runId) {
  activeRunId = runId;
  knownLogsCount = 0;
  hideAgentDetail();
  
  // Toggle UI views
  noSelectionView.classList.add('hidden');
  runDetailView.classList.remove('hidden');
  
  // Update selected class in sidebar
  document.querySelectorAll('.history-item').forEach(item => {
    item.classList.remove('active');
  });
  fetchRunsHistory(); // Re-fetch to apply active classes
  
  // Reset terminal console
  consoleBody.innerHTML = '<div class="console-line system-line">[System] Fetching run logs...</div>';
  
  // Poll details immediately
  pollActiveRunDetails(true);
  
  // Reset polling interval
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(() => pollActiveRunDetails(false), 1500);
}

// Trigger a new run pipeline
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const runUI = document.getElementById('runUI').checked;
  const runBackend = document.getElementById('runBackend').checked;
  
  if (!runUI && !runBackend) {
    alert('Please select at least one verification module to execute.');
    return;
  }
  
  // Disable button & show spinner
  const submitBtnText = submitBtn.querySelector('span');
  const spinner = submitBtn.querySelector('.spinner');
  submitBtn.disabled = true;
  submitBtnText.textContent = 'Launching Pipeline...';
  spinner.classList.remove('hidden');
  
  const storiesText = document.getElementById('userStories').value;
  const userStories = storiesText
    ? storiesText.split(',').map(s => s.trim()).filter(Boolean)
    : [];
    
  const payload = {
    repoUrl: document.getElementById('repoUrl').value,
    figmaUrl: document.getElementById('figmaUrl').value,
    appUrl: document.getElementById('appUrl').value,
    apiDocs: document.getElementById('apiDocs').value,
    userStories,
    figmaImage: uploadedFigmaBase64,
    appImage: uploadedAppBase64,
    runUI: document.getElementById('runUI').checked,
    runBackend: document.getElementById('runBackend').checked
  };
  
  try {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error('Failed to launch pipeline');
    const result = await response.json();
    
    // Select and monitor the new run ID
    selectRun(result.runId);
  } catch (error) {
    alert('Failed to execute QA run: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtnText.textContent = 'Execute QA Run';
    spinner.classList.add('hidden');
  }
}

// Poll specific run states & logs
async function pollActiveRunDetails(forceRefresh = false) {
  if (!activeRunId) return;
  
  try {
    // 1. Fetch Run details
    const runResponse = await fetch(`/api/runs/${activeRunId}`);
    if (!runResponse.ok) throw new Error('Failed to fetch details');
    const run = await runResponse.json();
    
    // Update UI headers
    detailRunId.textContent = run.id;
    detailStatus.textContent = run.status;
    detailStatus.className = `status-badge status-${run.status.toLowerCase()}`;
    
    const startStr = new Date(run.startedAt).toLocaleTimeString();
    const endStr = run.completedAt ? new Date(run.completedAt).toLocaleTimeString() : 'In Progress...';
    detailTime.textContent = `Started: ${startStr} | Completed: ${endStr}`;
    
    // Update Agent nodes state in visualizer
    updatePipelineVisualizer(run.agentStates);
    
    // Store agent states for clicked detail inspection
    window.currentAgentStates = run.agentStates;
    
    // Update report card
    if (run.report) {
      reportOverviewCard.classList.remove('hidden');
      qualityScoreVal.textContent = run.report.qualityScore;
      
      // Update SVG radial stroke offset
      // Radius = 50, Circumference = 2 * PI * 50 = 314
      const strokeOffset = 314 * (1 - run.report.qualityScore / 100);
      scoreProgressCircle.style.strokeDashoffset = strokeOffset;
      
      // Recommendation badge styling
      recBadge.textContent = run.report.deploymentRecommendation;
      recBadge.className = `rec-badge badge-${run.report.deploymentRecommendation.toLowerCase()}`;
      
      reportSummary.textContent = run.report.summary;
      
      // Load defects
      loadDefectsTable(run.report.defects);

      // Load deductions table
      if (run.report.scoreDeductions && run.report.scoreDeductions.length > 0) {
        deductionsContainer.classList.remove('hidden');
        let dedHtml = '';
        run.report.scoreDeductions.forEach(ded => {
          dedHtml += `
            <tr>
              <td><strong>${ded.module}</strong></td>
              <td><span class="deduction-badge">-${ded.deduction}%</span></td>
              <td>${ded.reason}</td>
            </tr>
          `;
        });
        deductionsTableBody.innerHTML = dedHtml;
      } else {
        deductionsContainer.classList.add('hidden');
      }

      // Load test cases checklist table
      if (run.report.reqCoverage) {
        testCasesContainer.classList.remove('hidden');
        const pct = run.report.reqCoverage.coveragePercentage || 0;
        coverageBadge.textContent = `${pct}% Passed`;
        
        let tcHtml = '';
        const statuses = run.report.reqCoverage.storiesStatus || {};
        for (const [story, details] of Object.entries(statuses)) {
          const detailObj = typeof details === 'string' ? { status: details, reason: 'Verified successfully.' } : details;
          const status = detailObj.status || 'PASS';
          const reason = detailObj.reason || 'Verified successfully.';
          tcHtml += `
            <tr>
              <td>${story}</td>
              <td><span class="status-pill ${status.toLowerCase()}">${status}</span></td>
              <td>${reason}</td>
            </tr>
          `;
        }
        testCasesTableBody.innerHTML = tcHtml;
      } else {
        testCasesContainer.classList.add('hidden');
      }
    } else {
      reportOverviewCard.classList.add('hidden');
      defectsCard.classList.add('hidden');
      deductionsContainer.classList.add('hidden');
      testCasesContainer.classList.add('hidden');
    }

    // Render side-by-side comparison images
    const visualDiffContainer = document.getElementById('visualDiffContainer');
    const diffMockupWrapper = document.getElementById('diffMockupWrapper');
    const diffScreenshotWrapper = document.getElementById('diffScreenshotWrapper');
    
    const hasFigmaInput = run.inputs.figmaImage || run.inputs.figmaUrl;
    const hasAppInput = run.inputs.appImage || run.inputs.appUrl;
    
    if (hasFigmaInput || hasAppInput) {
      visualDiffContainer.classList.remove('hidden');
      
      // Render mockup box
      if (run.inputs.figmaImage) {
        diffMockupWrapper.innerHTML = `<img src="${run.inputs.figmaImage}" alt="Mockup Image">`;
      } else if (run.inputs.figmaUrl) {
        diffMockupWrapper.innerHTML = `
          <div class="link-placeholder-box">
            <span class="link-icon">🔗</span>
            <a href="${run.inputs.figmaUrl}" target="_blank" class="placeholder-link">${run.inputs.figmaUrl}</a>
          </div>
        `;
      } else {
        diffMockupWrapper.innerHTML = `<span class="img-placeholder">No Design Mockup Provided</span>`;
      }

      // Render screenshot box
      if (run.inputs.appImage) {
        diffScreenshotWrapper.innerHTML = `<img src="${run.inputs.appImage}" alt="Staging Screenshot">`;
      } else if (run.inputs.appUrl) {
        diffScreenshotWrapper.innerHTML = `
          <div class="link-placeholder-box">
            <span class="link-icon">🌐</span>
            <a href="${run.inputs.appUrl}" target="_blank" class="placeholder-link">${run.inputs.appUrl}</a>
          </div>
        `;
      } else {
        diffScreenshotWrapper.innerHTML = `<span class="img-placeholder">No App Screenshot Provided</span>`;
      }
    } else {
      visualDiffContainer.classList.add('hidden');
    }
    
    // 2. Fetch logs
    const logsResponse = await fetch(`/api/runs/${activeRunId}/logs`);
    if (logsResponse.ok) {
      const logs = await logsResponse.json();
      if (logs.length > knownLogsCount || forceRefresh) {
        updateConsoleLogs(logs);
        knownLogsCount = logs.length;
      }
    }
    
    // Stop polling if completed or failed
    if (run.status === 'COMPLETED' || run.status === 'FAILED') {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
    
  } catch (error) {
    console.error('Error polling run:', error);
  }
}

// Update the nodes classes in the parallel flowchart visualizer
function updatePipelineVisualizer(agentStates) {
  if (!agentStates) return;
  
  for (const [agentName, state] of Object.entries(agentStates)) {
    const nodeEl = document.getElementById(`node-${agentName}`);
    if (nodeEl) {
      // Clear status classes
      nodeEl.classList.remove('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
      nodeEl.classList.add(state.status);
      
      // Update label status
      const statusTextEl = nodeEl.querySelector('.node-status');
      if (statusTextEl) {
        statusTextEl.textContent = state.status;
      }
    }
  }
}

// Draw defects table
function loadDefectsTable(defects) {
  if (!defects || defects.length === 0) {
    defectsCard.classList.add('hidden');
    return;
  }
  
  defectsCard.classList.remove('hidden');
  
  let html = '';
  defects.forEach(defect => {
    html += `
      <tr>
        <td><span class="defect-type-icon">${getDefectTypeIcon(defect.type)}</span> ${defect.type.toUpperCase()}</td>
        <td><pre>${defect.file}</pre></td>
        <td><span class="defect-severity-badge severity-${defect.severity}">${defect.severity}</span></td>
        <td>${defect.message}</td>
      </tr>
    `;
  });
  
  defectsTableBody.innerHTML = html;
}

function getDefectTypeIcon(type) {
  if (type === 'security') return '🛡️';
  if (type === 'lint') return '🧬';
  if (type === 'database') return '💾';
  if (type === 'visual') return '🎨';
  return '⚠️';
}

// Update the terminal console stream
function updateConsoleLogs(logs) {
  consoleBody.innerHTML = '';
  
  if (logs.length === 0) {
    consoleBody.innerHTML = '<div class="console-line system-line">[System] Awaiting execution trace logs...</div>';
    return;
  }
  
  logs.forEach(log => {
    const time = log.timestamp.split('T')[1].substring(0, 8);
    const lineClass = log.level === 'error' ? 'error-line' : (log.level === 'warn' ? 'warn-line' : 'info-line');
    
    const div = document.createElement('div');
    div.className = `console-line ${lineClass}`;
    div.textContent = `[${time}] [${log.agent.padEnd(23)}] [${log.level.toUpperCase().padEnd(5)}] ${log.message}`;
    consoleBody.appendChild(div);
  });
  
  // Auto-scroll to bottom of console terminal
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

// Show detailed output dialog/panel for individual flowchart nodes
function showAgentDetail(agentName) {
  if (!window.currentAgentStates || !window.currentAgentStates[agentName]) {
    return;
  }
  
  const state = window.currentAgentStates[agentName];
  
  agentDetailCard.classList.remove('hidden');
  agentDetailName.textContent = agentName;
  agentDetailStatus.textContent = state.status;
  agentDetailStatus.className = `status-badge status-${state.status.toLowerCase()}`;
  
  agentDetailStart.textContent = state.startedAt ? new Date(state.startedAt).toLocaleString() : '--';
  agentDetailEnd.textContent = state.completedAt ? new Date(state.completedAt).toLocaleString() : '--';
  
  // Error display
  if (state.error) {
    agentDetailErrorContainer.classList.remove('hidden');
    agentDetailErrorText.textContent = state.error;
  } else {
    agentDetailErrorContainer.classList.add('hidden');
  }
  
  // Output display (format as pretty JSON if it exists)
  if (state.output) {
    agentDetailOutputText.textContent = JSON.stringify(state.output, null, 2);
  } else {
    agentDetailOutputText.textContent = 'No outputs recorded yet.';
  }
  
  // Scroll details panel into view
  agentDetailCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAgentDetail() {
  agentDetailCard.classList.add('hidden');
}
