const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = ['.git', 'node_modules', '.gemini'];
const IGNORED_FILES = ['.env', 'serviceAccountKey.json', 'package-lock.json'];
const ALLOWED_EXTENSIONS = ['.js', '.json', '.md', '.html', '.css'];

/**
 * Scan workspace files recursively
 */
function scanDir(dirPath, rootDir, fileList = []) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relPath = path.relative(rootDir, fullPath);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.includes(file)) {
        scanDir(fullPath, rootDir, fileList);
      }
    } else {
      if (!IGNORED_FILES.includes(file)) {
        fileList.push({
          name: file,
          path: fullPath,
          relPath: relPath.replace(/\\/g, '/'),
          size: stat.size,
          ext: path.extname(file)
        });
      }
    }
  }

  return fileList;
}

/**
 * Get a list of all non-ignored files in the workspace
 */
function scanWorkspace() {
  const rootDir = path.resolve(__dirname, '../../');
  return scanDir(rootDir, rootDir);
}

/**
 * Get contents of code files for LLM analysis
 */
function readCodeFiles() {
  const files = scanWorkspace();
  const codeFiles = {};

  for (const file of files) {
    // Exclude the QA orchestrator platform files from being parsed as code under test
    if (file.relPath.startsWith('src/') || file.relPath === 'run_pipeline.js') {
      continue;
    }
    if (ALLOWED_EXTENSIONS.includes(file.ext) && file.size < 50000) { // Limit size to avoid context bloat
      try {
        const content = fs.readFileSync(file.path, 'utf8');
        codeFiles[file.relPath] = content;
      } catch (err) {
        console.error(`Failed to read file ${file.relPath}:`, err.message);
      }
    }
  }

  return codeFiles;
}

module.exports = {
  scanWorkspace,
  readCodeFiles
};
