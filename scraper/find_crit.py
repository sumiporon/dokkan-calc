import os
import re
import glob

cache_dir = r"c:\Users\kou20\OneDrive - 甲南大学\デスクトップ\ドッカン計算\scraper\html_cache"
output_file = r"c:\Users\kou20\OneDrive - 甲南大学\デスクトップ\ドッカン計算\scraper\crit_python_out.txt"

results = set()

# Load all HTML files
for file_path in glob.glob(os.path.join(cache_dir, "stage_*.html")):
    filename = os.path.basename(file_path)
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
        # Simple regex to find text containing 会心
        # Look for <div> tags that contain 会心
        matches = re.finditer(r'<div[^>]*>([^<]*(?:会心|クリティカル)[^<]*)<\/div>', content)
        for m in matches:
            text = m.group(1).strip()
            if "スキル玉" not in text and "ミッション" not in text and "報酬" not in text:
                # Find nearby debug info
                # A quick and dirty way is capturing 100 characters after this div and looking for ID
                start_index = m.end()
                snippet = content[m.start():m.end()+200]
                
                id_match = re.search(r'\(ID:\s*(\d+)\)', snippet)
                id_str = id_match.group(1) if id_match else "Unknown"
                
                results.add(f"{filename} | Text: {text} | ID: {id_str}")

with open(output_file, 'w', encoding='utf-8') as out:
    for r in sorted(list(results)):
        out.write(r + '\n')
        
print("Done writing " + str(len(results)) + " results.")
