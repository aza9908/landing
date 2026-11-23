'use strict';
/* Ночная копия базы: node api/backup.js → $AIRL_DATA_DIR/backups/airl-ГГГГММДД.sqlite,
   хранятся последние 14. Запускает таймер airl-landing-backup на сервере. */
const fs = require('fs');
const path = require('path');

const dir = process.env.AIRL_DATA_DIR;
if (!dir) { console.error('AIRL_DATA_DIR is not set'); process.exit(1); }
const out = path.join(dir, 'backups');
const store = require('./store').open(dir);
const file = path.join(out, `airl-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.sqlite`);
store.backupTo(file);
store.close();
const old = fs.readdirSync(out).filter((f) => /^airl-\d{8}\.sqlite$/.test(f)).sort().slice(0, -14);
old.forEach((f) => fs.unlinkSync(path.join(out, f)));
console.log(`backup: ${file} (${fs.statSync(file).size} bytes), kept ${Math.min(14, fs.readdirSync(out).length)}`);
