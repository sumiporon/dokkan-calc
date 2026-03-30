const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const scraperDir = path.join(rootDir, 'scraper');

// Delete files matching pattern in a directory
function deleteMatchingFiles(dir, patterns) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);

    for (const file of files) {
        let shouldDelete = false;

        for (const pattern of patterns) {
            // Very basic regex matching for our patterns like "patch_*.js"
            const regexStr = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexStr}$`);

            if (regex.test(file)) {
                shouldDelete = true;
                break;
            }
        }

        if (shouldDelete) {
            try {
                fs.unlinkSync(path.join(dir, file));
                console.log(`Deleted: ${file}`);
            } catch (e) {
                console.log(`Failed to delete: ${file} - ${e.message}`);
            }
        }
    }
}

console.log('--- Root Directory ---');
const rootPatterns = ['patch_*.js', 'fix_*.js', 'stream_fix_*.js', 'temp_fix_*.js', 'fast_fix.js', 'check_*.js', 'test_read.js', 'cleanup.bat'];
deleteMatchingFiles(rootDir, rootPatterns);

console.log('\n--- Scraper Directory ---');
const scraperPatterns = ['test*.json', 'testOutput*.txt', 'test*.js', 'patch_*.js', 'list_crit*.js', 'find_crit*.*', 'check_crit*.js', 'sort_crit*.js', 'search_specific*.js', 'all_enemies_progress.json', 'temp_dokkan.html'];
deleteMatchingFiles(scraperDir, scraperPatterns);

// Also remove delete_files.js itself at the end if we want
try {
    const me = path.join(rootDir, 'delete_files.js');
    if (fs.existsSync(me)) {
        console.log(`Deleted: delete_files.js`);
        fs.unlinkSync(me);
    }
} catch (e) { }

console.log('\nCleanup complete.');
