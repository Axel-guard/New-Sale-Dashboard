const Database = require('better-sqlite3');

const dbFiles = [
  '/home/user/webapp/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a4cbf95b06cc05ac18912e42ea1dd3c229ea877895f964b2fcd2b1a46ff17dbc.sqlite',
  '/home/user/webapp/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/4f8ab9fe-4b4d-4484-b86c-1abf0bdf8208.sqlite'
];

dbFiles.forEach((dbPath, index) => {
  console.log(`\n=== Database ${index + 1}: ${dbPath.split('/').pop()} ===`);
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
    console.log('Tables:', tables.map(t => t.name).join(', '));
    
    if (tables.some(t => t.name === 'inventory')) {
      const invCount = db.prepare('SELECT COUNT(*) as count FROM inventory').get();
      const qcCount = db.prepare('SELECT COUNT(*) as count FROM quality_check').get();
      console.log(`  - inventory: ${invCount.count} records`);
      console.log(`  - quality_check: ${qcCount.count} records`);
      console.log('  ✓ This is the correct database!');
    }
    
    db.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
});
