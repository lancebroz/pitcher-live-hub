// Checks lib.py's port against the app's own pitchRunValue.   python sample.py <statcast dir> > sample.json && node validate.js sample.json
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/App.jsx'), 'utf8');
const block = (from, last) => { const i = src.indexOf(from), j = src.indexOf(last, i), k = src.indexOf('\n};\n', j); return src.slice(i, k + 4); };
const code = block('const XWOBACON = ', 'const _xwobaconLookup') + block('const RV_SEASON = ', 'const pitchRunValue = (p, expected)') + 'return pitchRunValue;';
const pitchRunValue = new Function(code)();
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); let worst = 0, bad = 0;
for (const r of rows) { const d = Math.abs(pitchRunValue(r, true) - r.py); if (d > worst) worst = d; if (d > 1e-9 && bad++ < 5) console.log('differs', pitchRunValue(r, true), JSON.stringify(r)); }
console.log(`${rows.length} pitches, ${bad} differ, largest difference ${worst.toExponential(2)}`);
