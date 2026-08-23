const fs = require('fs');
const lines = fs.readFileSync('sw.js', 'utf8').split(/\r?\n/);
let depth = 0, bdepth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const stripped = line
    .replace(/\/\/.*$/, '')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
  for (const ch of stripped) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '{') bdepth++;
    else if (ch === '}') bdepth--;
  }
  if (i >= 300) console.log(String(i + 1).padStart(3), 'p=' + depth, 'b=' + bdepth, '|', line.trim().slice(0, 90));
}
