const { execSync } = require('child_process');
const path = require('path');

const htmlPath = path.resolve(__dirname, 'public/deck.html');
const pdfPath = path.resolve(__dirname, 'public/deck.pdf');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
const cmd = `"${chrome}" --headless --disable-gpu --no-sandbox --print-to-pdf="${pdfPath}" --print-to-pdf-no-header "${fileUrl}"`;

console.log('Generating PDF...');
execSync(cmd, { timeout: 30000 });
console.log('Done! PDF saved to:', pdfPath);
