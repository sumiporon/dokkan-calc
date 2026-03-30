@echo off
del /Q patch_*.js fix_*.js stream_fix_*.js temp_fix_*.js fast_fix.js check_*.js test_read.js
cd scraper
del /Q test*.json testOutput*.txt test*.js patch_*.js list_crit*.js find_crit*.* check_crit*.js sort_crit*.js search_specific*.js all_enemies_progress.json temp_dokkan.html
echo Done
