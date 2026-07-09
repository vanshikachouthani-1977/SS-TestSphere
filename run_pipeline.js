const Orchestrator = require('./src/orchestrator');
const { db } = require('./database');

async function executeTestRun() {
  const orchestrator = new Orchestrator();

  const inputs = {
    repoUrl: 'https://github.com/vanshikachouthani-1977/SS-TestSphere.git',
    figmaUrl: 'https://figma.com/file/ss-shoppersstop-qa-spec',
    appUrl: 'https://ss-shoppersstop-staging.example.com',
    apiDocs: 'https://ss-shoppersstop-staging.example.com/swagger.json',
    userStories: [
      'User can successfully register and login',
      'Products can be fetched and display correctly in UI',
      'Security headers must prevent framing attacks'
    ]
  };

  console.log('\n======================================================');
  console.log('🚀 SS TestSphere: Triggering QA Orchestration Run...');
  console.log('======================================================');

  try {
    const { runId } = await orchestrator.run(inputs);
    
    console.log('\n======================================================');
    console.log('✅ Pipeline Run Completed Successfully!');
    console.log(`Run ID: ${runId}`);
    console.log('======================================================');

    // Fetch the final run document
    const docSnap = await db.collection('runs').doc(runId).get();
    const runData = docSnap.data();

    console.log('\n📊 Final Agent Run States (stored in Firestore):');
    console.log('------------------------------------------------------');
    for (const [agentName, state] of Object.entries(runData.agentStates)) {
      const duration = state.completedAt && state.startedAt 
        ? ((new Date(state.completedAt) - new Date(state.startedAt)) / 1000).toFixed(2) + 's'
        : 'N/A';
      console.log(`- ${agentName.padEnd(25)}: [${state.status}] in ${duration}`);
    }

    console.log('\n🗒️ Compiled Logs (showing interleaved parallel execution):');
    console.log('------------------------------------------------------');
    const logsSnap = await db.collection('runs').doc(runId).collection('logs').orderBy('timestamp').get();
    logsSnap.forEach(doc => {
      const log = doc.data();
      const time = log.timestamp.split('T')[1].substring(0, 8);
      console.log(`[${time}] [${log.agent.padEnd(23)}] [${log.level.toUpperCase().padEnd(5)}] ${log.message}`);
    });

    console.log('\n📑 Final Report Summary:');
    console.log('------------------------------------------------------');
    console.log(`Quality Score: ${runData.report.qualityScore}%`);
    console.log(`Deployment Recommendation: ${runData.report.deploymentRecommendation}`);
    console.log(`Summary: ${runData.report.summary}`);
    console.log('======================================================\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Pipeline Run Failed!');
    console.error(error);
    process.exit(1);
  }
}

executeTestRun();
