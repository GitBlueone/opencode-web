const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(process.env.USERPROFILE, '.local', 'share', 'opencode', 'storage', 'session');

const projDirs = fs.readdirSync(STORAGE_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

for (const projId of projDirs) {
  const projDir = path.join(STORAGE_DIR, projId);
  const sessionFiles = fs.readdirSync(projDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.json'))
    .map(d => d.name);

  if (sessionFiles.length === 0) continue;

  const firstFile = path.join(projDir, sessionFiles[0]);
  const content = JSON.parse(fs.readFileSync(firstFile, 'utf8'));
  const dir = content.directory;

  console.log('Directory value:', dir);
  console.log('Backslashes count:', dir.split('\\').length - 1);

  const encoded = encodeURIComponent(dir);
  console.log('URL encoded:', encoded);
  const decoded = decodeURIComponent(encoded);
  console.log('URL decoded:', decoded);
  console.log('Match:', dir === decoded);

  break;
}
