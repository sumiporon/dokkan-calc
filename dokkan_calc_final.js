document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    let durabilityLines = [];
    let savedCharacters = [];
    let savedEnemies = [];
    let scenarioCounter = 0;
    let sortable = null;
    let isCharacterEditMode = false;
    let selectedCharacterIndex = -1;

    // DOM Elements
    const addLineBtn = document.getElementById('add-line-btn');
    const newLineInput = document.getElementById('new-line-input');
    const linesListContainer = document.getElementById('durability-lines-list');
    const addScenarioBtn = document.getElementById('add-scenario-btn');
    const cardsContainer = document.getElementById('scenario-cards-container');

    const charactersList = document.getElementById('characters-list');
    const loadCharacterBtn = document.getElementById('load-character-btn');
    const deleteCharacterBtn = document.getElementById('delete-character-btn');
    const newCharacterNameInput = document.getElementById('new-character-name');
    const saveCharacterBtn = document.getElementById('save-character-btn');
    const summaryViewBtn = document.getElementById('summary-view-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const newCharacterBtn = document.getElementById('new-character-btn');
    const expandAllBtn = document.getElementById('expand-all-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');

    // Enemy Management DOM Elements
    const enemyEventTypeList = document.getElementById('enemy-event-type-list');
    const enemySeriesList = document.getElementById('enemy-series-list');
    const enemyStageList = document.getElementById('enemy-stage-list');
    const enemyBossList = document.getElementById('enemy-boss-list');
    const deleteEnemyBtn = document.getElementById('delete-enemy-btn');
    const editEnemyBtn = document.getElementById('edit-enemy-btn');
    const clearEnemyFormBtn = document.getElementById('clear-enemy-form-btn');
    const newEnemyNameInput = document.getElementById('new-enemy-name');
    const newEnemyEventTypeInput = document.getElementById('new-enemy-event-type');
    const newEnemySeriesNameInput = document.getElementById('new-enemy-series-name');
    const newEnemyStageNameInput = document.getElementById('new-enemy-stage-name');
    const newEnemyAttacksContainer = document.getElementById('new-enemy-attacks-container');
    const addAttackPatternBtn = document.getElementById('add-attack-pattern-btn');
    const newEnemyClassSelect = document.getElementById('new-enemy-class');
    const newEnemyTypeSelect = document.getElementById('new-enemy-type');
    const newEnemyCritAtkInput = document.getElementById('new-enemy-crit-atk');
    const newEnemyCritDefInput = document.getElementById('new-enemy-crit-def');
    const newEnemyCritDefaultEnabledCheckbox = document.getElementById('new-enemy-crit-default-enabled');
    const newEnemyCritInputsContainer = document.getElementById('new-enemy-crit-inputs-container');
    const saveEnemyBtn = document.getElementById('save-enemy-btn');

    const STORAGE_KEY = 'dokkan_calc_data_v21';

    // --- PRESET START ---
    const DEFAULT_ENEMIES_PRESET = [
  {
    "eventType": "レッドゾーン",
    "series": []
  },
  {
    "eventType": "バトルスペクタクル",
    "series": []
  }
];
// --- PRESET END ---

        const previewOverlay = document.getElementById('preview-overlay');
    const overlayCardsContainer = document.getElementById('overlay-cards-container');
    const overlayDownloadBtn = document.getElementById('overlay-download-btn');
    const overlayCloseBtn = document.getElementById('overlay-close-btn');

    // New Selection Buttons
    const selectionCloseBtn = document.getElementById('selection-close-btn');
    const selectionSelectAllBtn = document.getElementById('selection-select-all-btn');
    const selectionDeselectAllBtn = document.getElementById('selection-deselect-all-btn');
    const selectionGenerateBtn = document.getElementById('selection-generate-btn');

    // Enemy Selection Modal DOM Elements
    const enemySelectionModal = document.getElementById('enemy-selection-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalEnemyList = document.getElementById('modal-enemy-list');
    let activeModalTargetCard = null;

    // --- Utility Functions ---
    const formatNumber = (num) => {
      if (isNaN(num) || !isFinite(num)) return '---';
      if (num >= 10000) return `${Math.floor(num / 10000)}万`;
      return Math.round(num).toLocaleString();
    };

    const applyTheme = (theme) => {
      if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggleBtn.textContent = '☀️';
      } else {
        document.body.classList.remove('dark-mode');
        themeToggleBtn.textContent = '🌙';
      }
    };

    const toggleTheme = () => {
      const newTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
      applyTheme(newTheme);
      saveState();
    };



    // --- Critical Setup Logic ---
    const checkAndShowCritBanner = () => {
        const overrides = JSON.parse(localStorage.getItem('dokkan_crit_overrides') || '{}');
        let unsetBosses = [];

        savedEnemies.forEach((et, etIndex) => {
            et.series.forEach((ser, serIndex) => {
                ser.stages.forEach((stg, stgIndex) => {
                    stg.bosses.forEach((boss, bossIndex) => {
                        const bossId = `${et.eventType}_${ser.seriesName}_${stg.stageName}_${boss.name}`;

                        // Apply overrides on load
                        if (overrides[bossId]) {
                            boss.critAtkUp = overrides[bossId].critAtkUp;
                            boss.critDefDown = overrides[bossId].critDefDown;
                        }

                        // Check if needs setup (hasSaCrit or isCriticalDefault but values are 0)
                        const hasCritContext = boss.hasSaCrit || boss.isCriticalDefault || boss.critFixedRate > 0 || boss.critTurnMax > 0 || boss.critHpRate > 0;
                        const needsSetup = hasCritContext && (!boss.critAtkUp && !boss.critDefDown);

                        if (needsSetup) {
                            unsetBosses.push({ etIndex, serIndex, stgIndex, bossIndex, boss, bossId, etName: et.eventType, serName: ser.seriesName, stgName: stg.stageName });
                        }
                    });
                });
            });
        });

        const banner = document.getElementById('crit-setup-banner');
        const countSpan = document.getElementById('crit-unset-count');

        if (unsetBosses.length > 0) {
            if (countSpan) countSpan.textContent = unsetBosses.length;
            if (banner) banner.style.display = 'block';

            // Store unset bosses for modal
            window._dokkanUnsetBosses = unsetBosses;
        } else {
            if (banner) banner.style.display = 'none';
        }
    };

    const populateCritSetupModal = () => {
        const listDiv = document.getElementById('crit-setup-list');
        listDiv.innerHTML = '';
        const unsetBosses = window._dokkanUnsetBosses || [];

        if (unsetBosses.length === 0) {
            listDiv.innerHTML = '<p>設定が必要なボスはいません。</p>';
            return;
        }

        unsetBosses.forEach(item => {
            const div = document.createElement('div');
            div.className = 'crit-setup-item form-grid';
            div.style.marginBottom = '1rem';
            div.style.paddingBottom = '1rem';
            div.style.borderBottom = '1px solid var(--border-color)';
            div.dataset.bossId = item.bossId;
            div.dataset.etIndex = item.etIndex;
            div.dataset.serIndex = item.serIndex;
            div.dataset.stgIndex = item.stgIndex;
            div.dataset.bossIndex = item.bossIndex;

            div.innerHTML = `
                <div style="grid-column: 1 / -1; font-weight: bold; margin-bottom: 0.5rem; color: var(--primary-color);">
                    ${item.etName} / ${item.serName} / ${item.stgName} - ${item.boss.name}
                </div>
                <div class="form-group">
                    <label>会心時ATK上昇率 (%)</label>
                    <input type="number" class="form-control crit-atk-input" value="${item.boss.critAtkUp || ''}">
                </div>
                <div class="form-group">
                    <label>会心時相手DEF低下率 (%)</label>
                    <input type="number" class="form-control crit-def-input" value="${item.boss.critDefDown || ''}">
                </div>
            `;
            listDiv.appendChild(div);
        });
    };

    const saveCritSetupLocal = () => {
        const overrides = JSON.parse(localStorage.getItem('dokkan_crit_overrides') || '{}');
        const items = document.querySelectorAll('.crit-setup-item');
        let hasChanges = false;

        items.forEach(item => {
            const atkVal = parseFloat(item.querySelector('.crit-atk-input').value);
            const defVal = parseFloat(item.querySelector('.crit-def-input').value);

            if (!isNaN(atkVal) || !isNaN(defVal)) {
                const finalAtk = isNaN(atkVal) ? 0 : atkVal;
                const finalDef = isNaN(defVal) ? 0 : defVal;
                const bossId = item.dataset.bossId;

                overrides[bossId] = {
                    critAtkUp: finalAtk,
                    critDefDown: finalDef
                };

                // Also update live savedEnemies array
                const b = savedEnemies[item.dataset.etIndex].series[item.dataset.serIndex].stages[item.dataset.stgIndex].bosses[item.dataset.bossIndex];
                b.critAtkUp = finalAtk;
                b.critDefDown = finalDef;

                hasChanges = true;
            }
        });

        if (hasChanges) {
            localStorage.setItem('dokkan_crit_overrides', JSON.stringify(overrides));
            saveState(false);
            checkAndShowCritBanner();
            alert('ローカルに保存しました。');
            document.getElementById('crit-setup-modal').classList.add('hidden');
        } else {
            alert('保存する値がありません。');
        }

        return overrides;
    };

    const critSetupBannerBtn = document.getElementById('crit-setup-banner');
    if (critSetupBannerBtn) {
        critSetupBannerBtn.addEventListener('click', () => {
            populateCritSetupModal();
            document.getElementById('crit-setup-modal').classList.remove('hidden');
        });
    }

    const critModalCloseBtn = document.getElementById('crit-modal-close-btn');
    if (critModalCloseBtn) {
        critModalCloseBtn.addEventListener('click', () => {
            document.getElementById('crit-setup-modal').classList.add('hidden');
        });
    }

    const saveCritSetupBtn = document.getElementById('save-crit-setup-btn');
    if (saveCritSetupBtn) {
        saveCritSetupBtn.addEventListener('click', () => {
            saveCritSetupLocal();
        });
    }




    // --- GitHub Sync Logic ---
    const syncCritOverridesToGithub = async () => {
        const patInput = document.getElementById('github-pat-input');
        const syncStatus = document.getElementById('crit-sync-status');
        const overrides = saveCritSetupLocal();
        const pat = patInput.value.trim();

        if (!pat) {
            alert('GitHub PATを入力してください。');
            return;
        }

        // Save PAT locally for convenience
        localStorage.setItem('dokkan_github_pat', pat);

        syncStatus.textContent = '同期中...';
        syncStatus.style.color = 'var(--secondary-color)';

        try {
            const repoUrl = 'https://api.github.com/repos/sumiporon/dokkan-calc/contents/scraper/crit_overrides.json';

            // 1. Get current file sha
            let sha = '';
            const getRes = await fetch(repoUrl, {
                headers: {
                    'Authorization': `token ${pat}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (getRes.ok) {
                const getData = await getRes.json();
                sha = getData.sha;
            } else if (getRes.status !== 404) {
                throw new Error('現在のファイルの取得に失敗しました: ' + getRes.statusText);
            }

            // 2. Put new file content
            const contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(overrides, null, 2))));

            const putRes = await fetch(repoUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${pat}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update critical setup overrides via UI',
                    content: contentBase64,
                    sha: sha || undefined
                })
            });

            if (!putRes.ok) {
                const errorData = await putRes.json();
                throw new Error(errorData.message || '更新に失敗しました');
            }

            syncStatus.textContent = '✅ GitHubへの同期が完了しました';
            syncStatus.style.color = 'green';
            setTimeout(() => { syncStatus.textContent = ''; }, 5000);

        } catch (err) {
            console.error('GitHub Sync Error:', err);
            syncStatus.textContent = '❌ 同期エラー: ' + err.message;
            syncStatus.style.color = 'red';
        }
    };

    const syncCritGithubBtn = document.getElementById('sync-crit-github-btn');
    if (syncCritGithubBtn) {
        syncCritGithubBtn.addEventListener('click', syncCritOverridesToGithub);
    }

    // Load saved PAT
    const savedPat = localStorage.getItem('dokkan_github_pat');
    const patInput = document.getElementById('github-pat-input');
    if (savedPat && patInput) {
        patInput.value = savedPat;
    }


    // --- State Management ---
    const saveState = (saveCurrentScenarios = true) => {
      if (document.body.classList.contains('sortable-mode')) return;
      const state = {
        durabilityLines,
        savedCharacters,
        savedEnemies,
        currentScenarios: saveCurrentScenarios ? getCurrentScenariosData() : [],
        theme: document.body.classList.contains('dark-mode') ? 'dark' : 'light'
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) { console.error("Failed to save state", e); }
    };

    const loadState = () => {
      try {
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (savedState) {
          const state = JSON.parse(savedState);
          durabilityLines = state.durabilityLines || [];
          savedCharacters = state.savedCharacters || [];
          savedEnemies = state.savedEnemies || [];
          applyTheme(state.theme || 'light');
          recreateScenarioCards(state.currentScenarios || []);
        } else {
          // Initial setup for new users
          durabilityLines = [{ name: '完封', value: 0 }, { name: '70万', value: 700000 }];
          savedEnemies = JSON.parse(JSON.stringify(DEFAULT_ENEMIES_PRESET));
        }

        // Data Migration: old formats -> 4-tier (eventType -> series -> stages -> bosses)
        if (savedEnemies.length > 0) {
          // Migration from 2-tier (groupName -> enemies)
          if (typeof savedEnemies[0].groupName !== 'undefined') {
            savedEnemies = savedEnemies.map(group => ({
              eventType: group.groupName || "その他",
              series: [{ seriesName: "-", stages: [{ stageName: "ステージ1", bosses: group.enemies || [] }] }]
            }));
          }
          // Migration from 3-tier (categoryName -> events -> bosses)
          else if (typeof savedEnemies[0].categoryName !== 'undefined') {
            savedEnemies = savedEnemies.map(cat => ({
              eventType: cat.categoryName || "その他",
              series: (cat.events || []).map(evt => ({
                seriesName: evt.eventName || "-",
                stages: [{ stageName: "ステージ1", bosses: evt.bosses || [] }]
              }))
            }));
          }
        }
        if (cardsContainer.children.length === 0) {
          addScenarioCard();
        }
      } catch (e) {
        console.error("Failed to load state", e);
        // Reset to a known good state on error
        durabilityLines = [{ name: '完封', value: 0 }, { name: '70万', value: 700000 }];
        savedEnemies = [];
        addScenarioCard();
      }
      renderDurabilityLines();
      updateCharacterList();
      updateEnemiesList();
      updateAllScenarioResults();
      initSortable();
      checkAndShowCritBanner();
    };

    // --- Enemy Data Fetching Functions ---
    const fetchEnemyDataBtn = document.getElementById('fetch-enemy-data-btn');
    const enemyDataUrlInput = document.getElementById('enemy-data-url');
    const fetchStatusMsg = document.getElementById('fetch-status-msg');
    const fetchDebugDetails = document.getElementById('fetch-debug-details');
    const fetchDebugLog = document.getElementById('fetch-debug-log');

    // Add Enter Key Support for Fetch
    if (enemyDataUrlInput && fetchEnemyDataBtn) {
      enemyDataUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          fetchEnemyDataBtn.click();
        }
      });
    }

    const logDebug = (msg) => {
      console.log(msg);
      if (fetchDebugLog) {
        fetchDebugLog.textContent += msg + '\r\n';
      }
    };

    const PROXY_URL = 'https://api.allorigins.win/get?url=';

    const cleanText = (text) => text ? text.replace(/\s+/g, ' ').trim() : '';

    const parseJapaneseNumber = (str) => {
      if (!str) return 0;
      const cleanStr = str.replace(/,/g, '');
      const match = cleanStr.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const fetchViaProxy = async (targetUrl) => {
      // List of proxies to try in order
      const strategies = [
        {
          name: 'corsproxy.io',
          url: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
          handler: async (res) => {
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return await res.text();
          }
        },
        {
          name: 'allorigins',
          url: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
          handler: async (res) => {
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const json = await res.json();
            if (!json.contents) throw new Error('No content');
            return json.contents;
          }
        }
      ];

      let lastError = null;
      for (const strategy of strategies) {
        try {
          logDebug(`Trying proxy: ${strategy.name}`);
          const response = await fetch(strategy.url(targetUrl));
          const text = await strategy.handler(response);
          if (text && text.length > 0) {
            logDebug(`Proxy ${strategy.name} success. Length: ${text.length}`);
            return text;
          }
        } catch (e) {
          logDebug(`Proxy ${strategy.name} failed: ${e.message}`);
          console.warn(`Proxy ${strategy.name} failed:`, e);
          lastError = e;
        }
      }
      throw lastError || new Error('All proxies failed');
    };

    const calculatePostSaNormalAtk = (normalAtk, saDescription) => {
      if (!saDescription) return null;
      let multiplier = 1.0;
      const desc = saDescription.replace(/\s+/g, '');
      logDebug(`Checking SA Desc for multiplier: "${desc}"`);

      // Check for "Greatly raises ATK for 1 turn"
      // Patterns: "1ターンATKが大幅上昇", "1ターンATK大幅上昇"
      if (/1ターン.*ATK.*大幅.*上昇/.test(desc) || /GreatlyraisesATKfor1turn/i.test(desc)) {
        multiplier = 1.5;
        logDebug("Matched: Greatly raises (1.5x)");
      }
      // Check for normal "Raises"
      // Patterns: "1ターンATKが上昇", "1ターンATK上昇", "1ターンATK,DEFが上昇"
      else if (/1ターン.*ATK.*(?<!大幅)上昇/.test(desc) || /RaisesATKfor1turn/i.test(desc)) {
        multiplier = 1.3;
        logDebug("Matched: Raises (1.3x)");
      } else {
        logDebug("No multiplier keywords found.");
      }

      if (multiplier > 1.0) {
        return Math.floor(normalAtk * multiplier);
      }
      return null;
    };

    const parseDokkanInfo = (html) => {
      logDebug("=== PARSE START (Version: v7 / Final Fallback) ===");
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const bodyText = doc.body.innerText; // Moved up to be accessible for Attribute Parsing

      // STRATEGY: Meta Tag Extraction (SEO/Social Data)
      // Proxies often strip scripts but keep Meta tags.
      // Look for <meta property="og:description" content="Extreme PHY Type ...">
      const metaTags = doc.getElementsByTagName('meta');
      for (let i = 0; i < metaTags.length; i++) {
        const tag = metaTags[i];
        const prop = tag.getAttribute('property') || tag.getAttribute('name');
        const content = tag.getAttribute('content');

        if (content && (prop === 'og:description' || prop === 'description' || prop === 'twitter:description')) {
          logDebug(`Meta Tag Found [${prop}]: "${content}"`);

          // Check for Type in description
          let cls = null;
          let typ = null;

          if (content.match(/Super/i) || content.match(/超/)) cls = 'super';
          if (content.match(/Extreme/i) || content.match(/極/)) cls = 'extreme';

          if (content.match(/STR/i) || content.match(/力/)) typ = 'str';
          else if (content.match(/AGL/i) || content.match(/速/)) typ = 'agl';
          else if (content.match(/TEQ/i) || content.match(/技/)) typ = 'teq';
          else if (content.match(/PHY/i) || content.match(/体/)) typ = 'phy';
          else if (content.match(/INT/i) || content.match(/知/)) typ = 'int';

          if (cls && typ) {
            logDebug(`Type found via Meta Tag: ${cls} ${typ}`);
            enemyClass = cls;
            enemyType = typ;
            jaMatch = true; // Flag success
            break;
          }
        }
      }

      const nameEl = doc.querySelector('.title_h2') || doc.querySelector('h2') || doc.querySelector('h1') || doc.querySelector('h3') || doc.querySelector('.card_name') || doc.querySelector('.title') || doc.querySelector('[class*="name" i]');
      const name = nameEl ? cleanText(nameEl.textContent) : 'Unknown Enemy';
      logDebug(`Name found: ${name}`);

      // --- Attribute Parsing (Class & Type) ---
      let enemyClass = 'extreme'; // Default
      let enemyType = null; // Default to null so we don't return wrong data (was 'int')

      // 1. Text Search (Primary Method)
      // Regex for Japanese (e.g. 超力, 極体) and English (e.g. Super STR, Extreme PHY)

      // Japanese: Match (超|極) followed by (速|技|知|力|体)
      logDebug(`Body Text Snippet: ${bodyText.substring(0, 500).replace(/\s+/g, ' ')}...`);
      // Japanese: Match (超|極) followed optionally by space/colon, then (速|技|知|力|体)
      const jaMatch = bodyText.match(/(超|極)\s*[:：]?\s*(速|技|知|力|体)/);

      // English: Match (Super|Extreme) followed by (AGL|TEQ|INT|STR|PHY)
      // Case insensitive, allowing for typical separators
      // English: Match (Super|Extreme) followed by (AGL|TEQ|INT|STR|PHY)
      // Case insensitive, allowing for typical separators
      const enMatch = bodyText.match(/(Super|Extreme)[\s\-_]*(AGL|TEQ|INT|STR|PHY)/i);

      // 1.2 Image Alt/Title Scan (Effective for images acting as text)
      // Also Strict Image Src Scan (Excluding skill_icon)
      let imgTypeMatch = null;
      if (!jaMatch && !enMatch) {
        const imgs = doc.querySelectorAll('img');
        for (const img of imgs) {
          // Check Alt/Title text
          const alt = (img.getAttribute('alt') || '').trim();
          const title = (img.getAttribute('title') || '').trim();
          const src = (img.getAttribute('src') || '').toLowerCase(); // Moved up
          const combinedText = `${alt} ${title}`;

          // Text match on Alt/Title
          const altJa = combinedText.match(/(超|極)\s*[:：]?\s*(速|技|知|力|体)/);
          const altEn = combinedText.match(/(Super|Extreme)[\s\-_]*(AGL|TEQ|INT|STR|PHY)/i);

          if (altJa) {
            imgTypeMatch = { class: (altJa[1] === '超' ? 'super' : 'extreme'), type: altJa[2] };
            logDebug(`Type found via Image Alt (JP): ${combinedText}`);
            break;
          }
          if (altEn) {
            imgTypeMatch = { class: (altEn[1].toLowerCase() === 'super' ? 'super' : 'extreme'), type: altEn[2].toLowerCase() };
            logDebug(`Type found via Image Alt (EN): ${combinedText}`);
            break;
          }

          // Special Case: cha_type_icon_XX.png (Used in Boss Rush/Challenge events)
          // Standard Dokkan Mapping:
          // 10-14: Super (AGL, TEQ, INT, STR, PHY)
          // 20-24: Extreme (AGL, TEQ, INT, STR, PHY)
          // (Last Digit: 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY)
          const chaIconMatch = src.match(/cha_type_icon_(\d+)/);
          if (chaIconMatch) {
            const id = parseInt(chaIconMatch[1], 10);
            const typeId = id % 10;
            const classId = Math.floor(id / 10);

            let cls = null;
            if (classId === 1) cls = 'super';
            else if (classId === 2) cls = 'extreme';

            const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
            let typ = typeMap[typeId];

            if (cls && typ) {
              imgTypeMatch = { class: cls, type: typ };
              logDebug(`Type found via cha_type_icon_ID (${id}): ${cls} ${typ}`);
              break;
            }
          }

          // Strict Src Scan (Re-enabled but safer)
          // EXPLICITLY IGNORE sp_skill_icon (Fighting/Ki Blast icons)
          if (src.includes('skill_icon') || src.includes('sp_skill') || src.includes('attack_type')) continue;

          // 1.5 RAW HTML SCAN (The Nuclear Option for Icons in Scripts)
          // If the image loop didn't find cha_type_icon (because it's in a script/JSON), scan the raw HTML.
          if (!imgTypeMatch) {
            const rawChaMatch = html.match(/cha_type_icon_(\d+)/);
            if (rawChaMatch) {
              const id = parseInt(rawChaMatch[1], 10);
              // Same logic as above
              const typeId = id % 10;
              const classId = Math.floor(id / 10);

              let cls = null;
              if (classId === 1) cls = 'super';
              else if (classId === 2) cls = 'extreme';

              const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
              let typ = typeMap[typeId];

              if (cls && typ) {
                imgTypeMatch = { class: cls, type: typ };
                logDebug(`Type found via Raw HTML Scan (cha_type_icon_${id}): ${cls} ${typ}`);
              }
            }
          }

          // Look for Class + Type in filename (e.g. super_str.png, character_type_extreme_phy.png)
          // Removed requirement for "type" or "attr" string to include more variations
          if (src.includes('super') || src.includes('extreme')) {
            let cls = src.includes('super') ? 'super' : 'extreme';
            let typ = '';
            if (src.includes('str')) typ = 'str';
            else if (src.includes('agl')) typ = 'agl';
            else if (src.includes('teq')) typ = 'teq';
            else if (src.includes('phy')) typ = 'phy';
            else if (src.includes('int')) typ = 'int';

            if (typ) {
              imgTypeMatch = { class: cls, type: typ };
              logDebug(`Type found via Image Src (Relaxed): ${src}`);
              break;
            }
          }
        }
      }

      // 1.5 RAW HTML SCAN (The Nuclear Option for Icons in Scripts)
      // If the image loop didn't find cha_type_icon (because it's in a script/JSON), scan the raw HTML.
      if (!imgTypeMatch) {
        logDebug('--- Raw HTML Scan ---');
        const rawChaMatch = html.match(/cha_type_icon_(\d+)/);
        logDebug(`cha_type_icon pattern: ${rawChaMatch ? rawChaMatch[0] : 'NOT FOUND'}`);

        if (rawChaMatch) {
          const id = parseInt(rawChaMatch[1], 10);
          const typeId = id % 10;
          const classId = Math.floor(id / 10);

          let cls = null;
          if (classId === 1) cls = 'super';
          else if (classId === 2) cls = 'extreme';

          const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
          let typ = typeMap[typeId];

          if (cls && typ) {
            imgTypeMatch = { class: cls, type: typ };
            logDebug(`Type found via Raw HTML Scan (cha_type_icon_${id}): ${cls} ${typ}`);
          }
        } else {
          // Log any icon pattern found for debugging
          const iconPatterns = html.match(/icon[_-]\d+\.png/gi);
          logDebug(`Other icon patterns found: ${iconPatterns ? iconPatterns.slice(0, 5).join(', ') : 'NONE'}`);
        }
      }

      // Debug: If still not found, log all images to see what we missed
      // Debug: Deep Inspection if Not Found
      // 3. Deep Context Scan (for pages where text is concatenated)
      // Example: "HP:500,000...属性:..."
      // 3. Deep Context Scan (Attribute Label Traversal)
      // Handles cases where "属性:" is its own element, followed by icons
      if (!jaMatch && !enMatch && !imgTypeMatch) {
        logDebug("--- Attributes Label Traversal ---");
        const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
          const txt = node.textContent.trim();
          if (txt === '属性' || txt.includes('属性:') || txt === 'Type' || txt.includes('Attribute')) {
            let currentEl = node.parentElement;
            logDebug(`Found Label "${txt}" in <${currentEl.tagName}>`);

            // Look ahead at siblings (up to 5 for safety)
            // Use nextSibling to catch Text Nodes (Node.TEXT_NODE === 3)

            // DEBUG: Dump the entire parent structure to solve the mystery
            logDebug(`Parent innerHTML of "属性": ${currentEl.parentElement.innerHTML}`);

            let sibling = currentEl.nextSibling;
            // ... (rest of loop)
            let attempts = 0;
            while (sibling && attempts < 5) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === 'IMG') {
                const src = (sibling.getAttribute('src') || '').toLowerCase();
                const alt = (sibling.getAttribute('alt') || '').toLowerCase();
                logDebug(`  Sibling IMG: src="${src}" alt="${alt}"`);

                // 1. Check for sp_skill_icon - USE AS LAST RESORT FALLBACK
                // These may represent type, but mapping is uncertain
                if (src.includes('skill_icon') || src.includes('sp_skill') || src.includes('attack_type')) {
                  logDebug(`  -> Found sp_skill_icon pattern in src`);
                  // Extract numeric ID from alt or filename
                  const iconIdMatch = alt.match(/^(\d+)$/) || src.match(/icon[_-]?(\d+)/);
                  logDebug(`  -> iconIdMatch: ${iconIdMatch ? iconIdMatch[0] : 'null'}, imgTypeMatch already set: ${!!imgTypeMatch}`);
                  if (iconIdMatch) {
                    const iconId = parseInt(iconIdMatch[1], 10);
                    // EXPERIMENTAL MAPPING (Based on dokkan standard type IDs)
                    // 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY
                    // BUT this might be wrong! Log warning.
                    const typeMap = ['agl', 'teq', 'int', 'str', 'phy'];
                    if (typeMap[iconId]) {
                      logDebug(`  -> sp_skill_icon Fallback: ID ${iconId} -> Experimental mapping to ${typeMap[iconId]} (UNVERIFIED)`);
                      imgTypeMatch = { class: 'extreme', type: typeMap[iconId], experimental: true };
                    } else {
                      logDebug(`  -> iconId ${iconId} is out of typeMap range`);
                    }
                  }
                } else {
                  // 2. Check for Reliable Type Icons (containing 'super', 'extreme', 'str', etc. in filename)
                  if (src.includes('super') || src.includes('extreme') ||
                    src.includes('str') || src.includes('agl') || src.includes('teq') || src.includes('int') || src.includes('phy') ||
                    alt.includes('super') || alt.includes('extreme') || alt.includes('str')) {

                    let cls = 'extreme';
                    let typ = 'int';

                    if (src.includes('super') || alt.includes('super')) cls = 'super';
                    if (src.includes('extreme') || alt.includes('extreme')) cls = 'extreme';

                    if (src.includes('str') || alt.includes('str')) typ = 'str';
                    else if (src.includes('agl') || alt.includes('agl')) typ = 'agl';
                    else if (src.includes('teq') || alt.includes('teq')) typ = 'teq';
                    else if (src.includes('phy') || alt.includes('phy')) typ = 'phy';
                    else if (src.includes('int') || alt.includes('int')) typ = 'int';

                    logDebug(`  -> Type Found via Sibling: ${cls} ${typ}`);
                    enemyClass = cls;
                    enemyType = typ;
                    imgTypeMatch = { class: cls, type: typ };
                    break;
                  }
                }
              } else if (sibling.nodeType === Node.TEXT_NODE) {
                const val = sibling.textContent.trim();
                if (val.length > 0) {
                  logDebug(`  Sibling Text Node: "${val}"`);
                  // Check for Japanese Attribute Text (e.g., "極体")
                  if (val.match(/[超極][\s\u3000]*[速技知力体]/)) {
                    if (val.includes('速')) { enemyClass = (val.includes('超') ? 'super' : 'extreme'); enemyType = 'agl'; }
                    else if (val.includes('技')) { enemyClass = (val.includes('超') ? 'super' : 'extreme'); enemyType = 'teq'; }
                    else if (val.includes('知')) { enemyClass = (val.includes('超') ? 'super' : 'extreme'); enemyType = 'int'; }
                    else if (val.includes('力')) { enemyClass = (val.includes('超') ? 'super' : 'extreme'); enemyType = 'str'; }
                    else if (val.includes('体')) { enemyClass = (val.includes('超') ? 'super' : 'extreme'); enemyType = 'phy'; }

                    logDebug(`  -> Type Found via Text Sibling: ${val} -> ${enemyClass} ${enemyType}`);
                    imgTypeMatch = { class: enemyClass, type: enemyType };
                    jaMatch = [val, (enemyClass === 'super' ? '超' : '極'), (enemyType === 'agl' ? '速' : enemyType === 'teq' ? '技' : enemyType === 'int' ? '知' : enemyType === 'str' ? '力' : '体')];
                    break;
                  }
                }
              }
              sibling = sibling.nextSibling;
              attempts++;
            }
            if (imgTypeMatch) break;
          }
        }
      }

      if (name === 'Unknown Enemy') {
        const titleMatch = doc.title.match(/(.*) \|/);
        if (titleMatch) parsedName = cleanText(titleMatch[1]);
        else parsedName = cleanText(doc.title);
        logDebug(`Name updated via Title: ${parsedName}`);
        // Note: We need to update the returned object's name property later to reflect this if possible
      }

      // 4. Numeric/ID Class Scan (User suggestion)
      // Look for type-1, element_id_2, etc.
      if (!jaMatch && !enMatch && !imgTypeMatch) {
        logDebug("--- Numeric/ID Class Scan ---");
        const allEls = doc.querySelectorAll('*');

        for (const el of allEls) {
          if (el.className && typeof el.className === 'string') {
            const cls = el.className.toLowerCase();

            // Check for common numeric patterns for dokkan types (0-4 or 1-5)
            const typeNumMatch = cls.match(/(?:type|attr|element)[-_]?(\d)/);
            if (typeNumMatch) {
              logDebug(`Numeric Type Class Found: "${cls}" (ID: ${typeNumMatch[1]}) in <${el.tagName}>`);
            }
          }

          // Check Data Attributes
          if (el.dataset.type || el.dataset.element || el.dataset.attribute) {
            logDebug(`Data Attribute Found: type="${el.dataset.type}", element="${el.dataset.element}" in <${el.tagName}>`);
          }
        }
      }

      // 5. Global Class Name Scan (Last Resort)
      // Sometimes the type is only in a generic div class like <div class="element_type_str">
      if (!jaMatch && !enMatch && !imgTypeMatch) {
        logDebug("--- Global Class Name Scan ---");
        const allEls = doc.querySelectorAll('*');
        const counts = { super: 0, extreme: 0, str: 0, agl: 0, teq: 0, int: 0, phy: 0 };

        for (const el of allEls) {
          if (el.className && typeof el.className === 'string') {
            const cls = el.className.toLowerCase();
            if (cls.includes('bootstrap') || cls.includes('container') || cls.includes('navbar')) continue;

            if (cls.includes('super')) counts.super++;
            if (cls.includes('extreme')) counts.extreme++;
            if (cls.includes('str')) counts.str++;
            if (cls.includes('agl')) counts.agl++;
            if (cls.includes('teq')) counts.teq++;
            if (cls.includes('int')) counts.int++;
            if (cls.includes('phy')) counts.phy++;

            if (cls.match(/type.*(str|agl|teq|phy|int)/) || cls.match(/(str|agl|teq|phy|int).*type/)) {
              logDebug(`Strong Class Match: "${cls}" in <${el.tagName}>`);
              classMatch = cls;
            }
          }
        }
        logDebug(`Class Keyword Counts: ${JSON.stringify(counts)}`);
      }

      // 1.5 Class Name Search (Fallback for specific divs)
      // Many sites put type in class like "type_str" or "attr_phy"
      let classMatch = null;
      if (!jaMatch && !enMatch) {
        const typeClasses = doc.querySelectorAll('[class*="type"], [class*="attr"]');
        for (const el of typeClasses) {
          const cls = el.className.toLowerCase();
          if (cls.match(/(super|extreme).*(str|agl|teq|phy|int)/) || cls.match(/(str|agl|teq|phy|int).*(super|extreme)/)) {
            classMatch = cls;
            break;
          }
        }
      }

      if (jaMatch) {
        enemyClass = (jaMatch[1] === '超') ? 'super' : 'extreme';
        const typeMap = { '速': 'agl', '技': 'teq', '知': 'int', '力': 'str', '体': 'phy' };
        enemyType = typeMap[jaMatch[2]];
        logDebug(`Type found via Japanese Text: ${enemyClass} ${enemyType}`);
      } else if (enMatch) {
        enemyClass = (enMatch[1].toLowerCase() === 'super') ? 'super' : 'extreme';
        enemyType = enMatch[2].toLowerCase();
        logDebug(`Type found via English Text: ${enemyClass} ${enemyType}`);
      } else if (imgTypeMatch) {
        enemyClass = imgTypeMatch.class;
        const typeMap = { '速': 'agl', '技': 'teq', '知': 'int', '力': 'str', '体': 'phy' };
        // Handle JP characters if they came from Alt text
        enemyType = typeMap[imgTypeMatch.type] || imgTypeMatch.type;
        logDebug(`Type found via Image: ${enemyClass} ${enemyType}`);
      } else if (classMatch) {
        if (classMatch.includes('super')) enemyClass = 'super';
        if (classMatch.includes('extreme')) enemyClass = 'extreme';
        if (classMatch.includes('str')) enemyType = 'str';
        if (classMatch.includes('agl')) enemyType = 'agl';
        if (classMatch.includes('teq')) enemyType = 'teq';
        if (classMatch.includes('phy')) enemyType = 'phy';
        if (classMatch.includes('int')) enemyType = 'int';
        logDebug(`Type found via Class Name: ${enemyClass} ${enemyType} ("${classMatch}")`);
      } else {
        logDebug('No Type/Class found via text search. Using defaults (Extreme Class, Type: null).');
      }

      // Scrape Logic
      let candidates = [];
      // bodyText already defined above

      // 1. Text Search for "Attack Stat: 1,234,567" or similar
      // DokkanInfo often formats as "Attack Stat: 21,000,000"
      const atkMatches = bodyText.matchAll(/(?:Attack Stat|ATK)[:\s]+([\d,]+)/gi);
      for (const match of atkMatches) {
        const val = parseJapaneseNumber(match[1]);
        if (val > 10000) candidates.push({ normalAtk: val, source: 'text_atk' });
      }

      // 2. Scan parsed elements if text search fails (fallback)
      if (candidates.length === 0) {
        const tds = doc.querySelectorAll('td, div, span');
        tds.forEach(el => {
          if (el.textContent.includes('Attack Stat') || el.textContent === 'ATK') {
            // Look around
            const text = el.parentElement.textContent;
            const val = parseJapaneseNumber(text);
            if (val > 10000) candidates.push({ normalAtk: val, source: 'dom_scan' });
          }
        });
      }

      // DokkanInfo SA Description
      // Targeted selection for DokkanInfo's specific classes if known
      let saDescription = "";

      // General search for description-like containers
      // .skill-description, .passive-skill-description, .ca-text (Super Attack text)
      // Trying to catch the Japanese text specifically
      const descSelectors = [
        '.skill_desc',
        '.passive_desc',
        '.super_desc',
        '.card_passive_description',
        '.card_super_attack_description'
      ];

      const potentialDescs = [];
      descSelectors.forEach(sel => {
        doc.querySelectorAll(sel).forEach(el => {
          const text = cleanText(el.textContent);
          if (text) potentialDescs.push(text);
        });
      });

      // Also look for specific keyword containers
      doc.querySelectorAll('*').forEach(el => {
        if (el.textContent.includes('1ターンATK') && el.textContent.includes('上昇')) {
          potentialDescs.push(cleanText(el.textContent));
        }
      });

      // Filter and pick the most relevant description (longest containing keyword?)
      const saDescCandidates = potentialDescs.filter(t => t.includes('1ターンATK') || t.includes('1 turn'));
      if (saDescCandidates.length > 0) {
        // Sort by length (assume longer = full description)
        saDescCandidates.sort((a, b) => b.length - a.length);
        saDescription = saDescCandidates[0];
      } else if (potentialDescs.length > 0) {
        // Fallback
        saDescription = potentialDescs[0];
      }

      logDebug(`SA Desc Candidates found: ${potentialDescs.length}`);
      logDebug(`Selected SA Desc: "${saDescription.substring(0, 50)}..."`);

      // Select best ATK
      let best = { normalAtk: 1000000, saAtk: 0 };
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.normalAtk - a.normalAtk);
        best.normalAtk = candidates[0].normalAtk;
        logDebug(`Max Base ATK found: ${best.normalAtk} (Source: ${candidates[0].source})`);
      } else {
        logDebug("No Base ATK found via standard patterns.");
      }

      // SA ATK Logic (often SA Multiplier or Max SA Stat)
      const saMatches = bodyText.matchAll(/(?:Super Attack Power|Maximum Super Attack|SA)[:\s]+([\d,]+)/gi);
      let saCandidates = [];
      for (const match of saMatches) {
        saCandidates.push(parseJapaneseNumber(match[1]));
      }
      if (saCandidates.length > 0) {
        saCandidates.sort((a, b) => b - a);
        best.saAtk = saCandidates[0];
        logDebug(`Max SA ATK found: ${best.saAtk}`);
      } else {
        best.saAtk = best.normalAtk * 3;
        logDebug(`SA ATK estimated (3x): ${best.saAtk}`);
      }

      return {
        name,
        normalAtk: best.normalAtk,
        saAtk: best.saAtk,
        saDescription,
        enemyClass,
        enemyType
      };
    };

    const parseGameDB = (html) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const name = cleanText(doc.querySelector('h1')?.textContent || 'Unknown Enemy');
      logDebug(`Name found: ${name}`);

      let candidateSets = [];
      let enemyClass = 'extreme'; // Default
      let enemyType = 'int'; // Default

      // 1. Text Search for Attribute (GameDB often has "属性：超力")
      const bodyText = doc.body.innerText;
      const typeMatch = bodyText.match(/属性[:：\s]*(超|極)(速|技|知|力|体)/);
      if (typeMatch) {
        enemyClass = (typeMatch[1] === '超') ? 'super' : 'extreme';
        const typeMap = { '速': 'agl', '技': 'teq', '知': 'int', '力': 'str', '体': 'phy' };
        enemyType = typeMap[typeMatch[2]];
        logDebug(`Type found via GameDB Text: ${enemyClass} ${enemyType}`);
      }

      const rows = doc.querySelectorAll('tr');
      rows.forEach((row, rowIndex) => {
        let set = { normalAtk: 0, saAtk: 0, saDescription: "" };
        const cells = row.querySelectorAll('td, th');

        for (let i = 0; i < cells.length; i++) {
          const text = cleanText(cells[i].textContent);
          if (i + 1 < cells.length) {
            const valCell = cells[i + 1];
            const valText = cleanText(valCell.textContent);

            if (text === 'ATK') {
              set.normalAtk = parseJapaneseNumber(valText);
            }
            if (text === '必殺ATK' || text === '最大必殺ATK') {
              set.saAtk = parseJapaneseNumber(valText);
            }
            if (text.includes('必殺') && (text.includes('効果') || text.includes('詳細'))) {
              set.saDescription = valCell.innerText || valCell.textContent;
            }
            // Sometimes type is in table
            if (text === '属性') {
              const cellTypeMatch = valText.match(/(超|極)(速|技|知|力|体)/);
              if (cellTypeMatch) {
                enemyClass = (cellTypeMatch[1] === '超') ? 'super' : 'extreme';
                const typeMap = { '速': 'agl', '技': 'teq', '知': 'int', '力': 'str', '体': 'phy' };
                enemyType = typeMap[cellTypeMatch[2]];
                logDebug(`Type found via Table: ${enemyClass} ${enemyType}`);
              }
            }
          }
        }
        if (set.normalAtk > 0) {
          if (set.saAtk === 0) set.saAtk = set.normalAtk * 3;
          candidateSets.push(set);
          logDebug(`Row ${rowIndex}: Found ATK ${set.normalAtk}, SA ${set.saAtk}, Desc "${set.saDescription.substring(0, 20)}..."`);
        }
      });

      if (candidateSets.length === 0) {
        const textContent = doc.body.textContent;
        const matches = textContent.matchAll(/ATK[:\s]*約?([\d,]+)/g);
        for (const match of matches) {
          const val = parseJapaneseNumber(match[1]);
          if (val > 10000) {
            candidateSets.push({ normalAtk: val, saAtk: val * 3, saDescription: "" });
          }
        }
        logDebug(`Fallback Text Scan found ${candidateSets.length} candidates.`);
      }

      if (candidateSets.length > 0) {
        candidateSets.sort((a, b) => b.normalAtk - a.normalAtk);
        const best = candidateSets[0];
        return { name, ...best, enemyClass, enemyType };
      }

      return { name, normalAtk: 0, saAtk: 0, saDescription: "", enemyClass, enemyType };
    };

    const handleFetch = async () => {
      const url = enemyDataUrlInput.value.trim();
      if (!url) {
        alert('URLを入力してください。');
        return;
      }

      fetchStatusMsg.textContent = '取得中...';
      fetchStatusMsg.style.color = '#666';

      // Reset Debug Log
      if (fetchDebugDetails) fetchDebugDetails.style.display = 'block';
      if (fetchDebugLog) fetchDebugLog.textContent = `Fetching URL: ${url}\r\n`;

      try {
        const html = await fetchViaProxy(url);
        logDebug('HTML content fetched successfully.');

        let data = null;

        if (url.includes('dokkan.game-db.org')) {
          logDebug('Using GameDB Parser');
          data = parseGameDB(html);
        } else {
          logDebug('Using DokkanInfo Parser');
          data = parseDokkanInfo(html);

          // FALLBACK STRATEGY: Try English Site if Type is "Extreme INT" (Default) or NULL and URL is Japanese
          // This handles cases where JP meta tags/scripts are stripped or formatted differently
          if (data && (data.enemyClass === 'extreme' && (data.enemyType === 'int' || data.enemyType === null)) && url.includes('jpnja.dokkaninfo.com')) {
            logDebug('--- Type Detection Suspicious (Default Found). Attempting English Fallback... ---');
            try {
              const enUrl = url.replace('jpnja.', '');
              logDebug(`Fetching English URL: ${enUrl}`);
              const enHtml = await fetchViaProxy(enUrl);
              logDebug('English HTML fetched.');

              // Debug: Dump Body Text to see if Attribute is present in text
              const parser = new DOMParser();
              const enDoc = parser.parseFromString(enHtml, 'text/html');
              logDebug(`English Body Text Snippet: ${enDoc.body.innerText.substring(0, 1000).replace(/\r\n/g, ' ')}`);

              const enData = parseDokkanInfo(enHtml);

              // Only use English result if it found a VALID type (not null)
              if (enData.enemyType && enData.enemyType !== 'int') {
                logDebug(`English Fallback SUCCESS! Found: ${enData.enemyClass} ${enData.enemyType}`);
                data.enemyClass = enData.enemyClass;
                data.enemyType = enData.enemyType;
                // Can also check if Name is clearer, but usually we prefer JP name
              } else {
                logDebug(`English Fallback did not improve: ${enData.enemyClass} ${enData.enemyType} - keeping original.`);
              }
            } catch (enErr) {
              logDebug(`English Fallback failed: ${enErr.message}`);
            }
          }
        }
        logDebug('Parsing complete.');

        if (!data || data.normalAtk === 0) {
          logDebug('ERROR: No valid data found (ATK is 0).');
          throw new Error('Parsing failed or no stats found');
        }

        // Populate Form
        newEnemyNameInput.value = data.name;
        newEnemyAttacksContainer.innerHTML = '';

        // Set Class and Type
        newEnemyClassSelect.value = data.enemyClass || 'extreme';
        newEnemyTypeSelect.value = data.enemyType || ''; // Clear if null so it doesn't keep previous val

        // 1. Normal Attack
        if (data.normalAtk) {
          addAttackPatternRow({ name: '通常', value: data.normalAtk });
        }

        // 2. Super Attack
        if (data.saAtk) {
          addAttackPatternRow({ name: '必殺', value: data.saAtk });
        }

        // 3. Post-SA Normal (logic)
        const postSaAtk = calculatePostSaNormalAtk(data.normalAtk, data.saDescription);
        if (postSaAtk && postSaAtk > data.normalAtk) {
          logDebug(`Calculated Post-SA ATK: ${postSaAtk}`);
          addAttackPatternRow({ name: '通常(必殺後)', value: postSaAtk });
        } else {
          logDebug(`No Post-SA ATK calculated.`);
        }

        // If no attacks found, add blank
        if (newEnemyAttacksContainer.children.length === 0) {
          addAttackPatternRow();
        }

        fetchStatusMsg.textContent = '取得成功!';
        fetchStatusMsg.style.color = 'green';
        setTimeout(() => { fetchStatusMsg.textContent = ''; }, 3000);

      } catch (err) {
        console.error(err);
        logDebug(`ERROR: ${err.message}`);
        fetchStatusMsg.textContent = '取得失敗: ' + err.message;
        fetchStatusMsg.style.color = 'red';
      }
    };

    const copyLogBtn = document.getElementById('copy-log-btn');
    if (copyLogBtn) {
      copyLogBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (fetchDebugLog) {
          navigator.clipboard.writeText(fetchDebugLog.textContent)
            .then(() => {
              const originalText = copyLogBtn.textContent;
              copyLogBtn.textContent = 'コピーしました!';
              setTimeout(() => { copyLogBtn.textContent = originalText; }, 2000);
            })
            .catch(err => {
              console.error('Failed to copy:', err);
              alert('ログのコピーに失敗しました。');
            });
        }
      });
    }

    if (fetchEnemyDataBtn) {
      fetchEnemyDataBtn.addEventListener('click', handleFetch);
    }

    // --- Clipboard Import (Chrome Extension Integration) ---
    const importClipboardBtn = document.getElementById('import-clipboard-btn');
    const importStatusMsg = document.getElementById('import-status-msg');

    const handleClipboardImport = async () => {
      if (importStatusMsg) {
        importStatusMsg.textContent = '読み込み中...';
        importStatusMsg.style.color = 'var(--secondary-color)';
      }

      try {
        const text = await navigator.clipboard.readText();
        const data = JSON.parse(text);

        // Validate data source
        if (data.source !== 'dokkan-extension') {
          throw new Error('拡張機能のデータではありません');
        }

        if (!data.enemy) {
          throw new Error('敵データが含まれていません');
        }

        const enemy = data.enemy;

        // Fill in form fields
        if (newEnemyNameInput && enemy.name) {
          newEnemyNameInput.value = enemy.name;
        }

        if (newEnemyClassSelect && enemy.class) {
          newEnemyClassSelect.value = enemy.class;
        }

        if (newEnemyTypeSelect && enemy.type) {
          newEnemyTypeSelect.value = enemy.type;
        }

        // Clear existing attack patterns and add new ones
        if (enemy.attacks && enemy.attacks.length > 0) {
          clearAttackPatternInputs();
          enemy.attacks.forEach(atk => {
            addAttackPatternRow(atk);
          });
        }

        if (importStatusMsg) {
          importStatusMsg.textContent = '✅ インポート成功!';
          importStatusMsg.style.color = 'green';
          setTimeout(() => { importStatusMsg.textContent = ''; }, 3000);
        }

        console.log('[Dokkan Calc] Imported from extension:', enemy);

      } catch (err) {
        console.error('[Dokkan Calc] Import failed:', err);
        if (importStatusMsg) {
          if (err.name === 'NotAllowedError') {
            importStatusMsg.textContent = '❌ クリップボードへのアクセスが拒否されました';
          } else if (err instanceof SyntaxError) {
            importStatusMsg.textContent = '❌ クリップボードにJSONデータがありません';
          } else {
            importStatusMsg.textContent = '❌ ' + err.message;
          }
          importStatusMsg.style.color = 'red';
          setTimeout(() => { importStatusMsg.textContent = ''; }, 5000);
        }
      }
    };

    if (importClipboardBtn) {
      importClipboardBtn.addEventListener('click', handleClipboardImport);
    }


    // --- Enemy Management Functions ---

    const addAttackPatternRow = (attack = { name: '', value: 0 }) => {
      const row = document.createElement('div');
      row.className = 'attack-pattern-row';
      const attackValueInMan = attack.value ? attack.value / 10000 : '';
      row.innerHTML = `
            <input type="text" class="form-control attack-name" placeholder="攻撃名 (例: 通常)" value="${attack.name || ''}">
            <div class="input-group">
                <input type="number" class="form-control attack-value" placeholder="0" value="${attackValueInMan}">
                <span class="input-group-text">万</span>
            </div>
            <button type="button" class="btn btn-danger remove-attack-btn">&times;</button>
        `;
      newEnemyAttacksContainer.appendChild(row);
    };

    const clearAttackPatternInputs = () => {
      newEnemyAttacksContainer.innerHTML = '';
      addAttackPatternRow(); // Add a single blank row back
    };

    const clearEnemyForm = () => {
      newEnemyEventTypeInput.value = '';
      newEnemySeriesNameInput.value = '';
      newEnemyStageNameInput.value = '';
      newEnemyNameInput.value = '';
      newEnemyCritAtkInput.value = '';
      newEnemyCritDefInput.value = '';
      newEnemyCritDefaultEnabledCheckbox.checked = false;
      newEnemyCritInputsContainer.style.display = 'none';
      clearAttackPatternInputs();
      saveEnemyBtn.textContent = '新しい敵を保存';
    };

    // --- 4-Tier Cascade Logic ---
    const updateEnemiesList = () => {
      try {
      if (!enemyEventTypeList || !enemySeriesList || !enemyStageList || !enemyBossList) {
        console.error("Cascade select elements not found, skipping update.");
        return;
      }

      const selectedET = enemyEventTypeList.value || null;

      enemyEventTypeList.innerHTML = '';
      enemySeriesList.innerHTML = '';
      enemyStageList.innerHTML = '';
      enemyBossList.innerHTML = '';

      if (savedEnemies.length === 0) {
        enemyEventTypeList.innerHTML = '<option value="-1">保存済みの敵はいません</option>';
        enemySeriesList.innerHTML = '<option value="-1">-</option>';
        enemyStageList.innerHTML = '<option value="-1">-</option>';
        enemyBossList.innerHTML = '<option value="-1">-</option>';
        return;
      }

      savedEnemies.forEach((et, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = et.eventType;
        enemyEventTypeList.appendChild(option);
      });

      if (selectedET !== null && savedEnemies[selectedET]) {
        enemyEventTypeList.value = selectedET;
      } else {
        enemyEventTypeList.selectedIndex = 0;
      }

      if (savedEnemies.length <= 2 && savedEnemies[0].series && savedEnemies[0].series.length === 0) {
        throw new Error("取得できたイベントがレッドゾーン等の一部のみ（中身が空）になっています。データ更新の不具合、または過去のエラーデータが残っています。");
      }
      updateSeriesList();
      } catch (err) {
        console.error("Critical error in updateEnemiesList:", err);
        alert("敵データの読み込み中にエラーが発生しました。過去の不正なデータが残っている可能性があります。\n\n詳細: " + err.message + "\n\n【解決方法】\n「敵キャラクター管理」の下部にある「全データをリセット」ボタンを押して初期化してください。");
      }
    };

    const updateSeriesList = (selectedSerStr = null, selectedStgStr = null, selectedBossStr = null) => {
      enemySeriesList.innerHTML = '';
      enemyStageList.innerHTML = '';
      enemyBossList.innerHTML = '';
      const etIndex = enemyEventTypeList.value;

      if (etIndex === "-1" || !savedEnemies[etIndex]) {
        enemySeriesList.innerHTML = '<option value="-1">-</option>';
        enemyStageList.innerHTML = '<option value="-1">-</option>';
        enemyBossList.innerHTML = '<option value="-1">-</option>';
        return;
      }

      const et = savedEnemies[etIndex];
      if (et.series.length === 0) {
        enemySeriesList.innerHTML = '<option value="-1">シリーズがありません</option>';
        updateStageList();
        return;
      }

      et.series.forEach((ser, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = ser.seriesName;
        enemySeriesList.appendChild(option);
      });

      if (selectedSerStr !== null && et.series[selectedSerStr]) {
        enemySeriesList.value = selectedSerStr;
      } else {
        enemySeriesList.selectedIndex = 0;
      }

      updateStageList(selectedStgStr, selectedBossStr);
    };

    const updateStageList = (selectedStgStr = null, selectedBossStr = null) => {
      enemyStageList.innerHTML = '';
      enemyBossList.innerHTML = '';
      const etIndex = enemyEventTypeList.value;
      const serIndex = enemySeriesList.value;

      if (etIndex === "-1" || serIndex === "-1" || !savedEnemies[etIndex]?.series[serIndex]) {
        enemyStageList.innerHTML = '<option value="-1">-</option>';
        enemyBossList.innerHTML = '<option value="-1">-</option>';
        return;
      }

      const ser = savedEnemies[etIndex].series[serIndex];
      if (ser.stages.length === 0) {
        enemyStageList.innerHTML = '<option value="-1">ステージがありません</option>';
        updateBossList();
        return;
      }

      ser.stages.forEach((stg, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = stg.stageName;
        enemyStageList.appendChild(option);
      });

      if (selectedStgStr !== null && ser.stages[selectedStgStr]) {
        enemyStageList.value = selectedStgStr;
      } else {
        enemyStageList.selectedIndex = 0;
      }

      updateBossList(selectedBossStr);
    };

    const updateBossList = (selectedBossStr = null) => {
      enemyBossList.innerHTML = '';
      const etIndex = enemyEventTypeList.value;
      const serIndex = enemySeriesList.value;
      const stgIndex = enemyStageList.value;

      if (etIndex === "-1" || serIndex === "-1" || stgIndex === "-1" ||
        !savedEnemies[etIndex]?.series[serIndex]?.stages[stgIndex]) {
        enemyBossList.innerHTML = '<option value="-1">-</option>';
        return;
      }

      const stg = savedEnemies[etIndex].series[serIndex].stages[stgIndex];
      if (stg.bosses.length === 0) {
        enemyBossList.innerHTML = '<option value="-1">ボスがいません</option>';
        return;
      }

      stg.bosses.forEach((boss, index) => {
        const option = document.createElement('option');
        option.value = `${etIndex}_${serIndex}_${stgIndex}_${index}`;
        option.textContent = boss.name;
        enemyBossList.appendChild(option);
      });

      if (selectedBossStr !== null && Array.from(enemyBossList.options).some(o => o.value === selectedBossStr)) {
        enemyBossList.value = selectedBossStr;
      } else {
        enemyBossList.selectedIndex = 0;
      }
    };

    const saveEnemy = () => {
      const eventTypeName = newEnemyEventTypeInput.value.trim() || 'その他';
      const seriesName = newEnemySeriesNameInput.value.trim() || '-';
      const stageName = newEnemyStageNameInput.value.trim() || 'ステージ1';
      const name = newEnemyNameInput.value.trim();
      if (!name) { alert('ボスの名前を入力してください。'); return; }

      const attacks = [];
      const attackRows = newEnemyAttacksContainer.querySelectorAll('.attack-pattern-row');
      for (const row of attackRows) {
        const attackName = row.querySelector('.attack-name').value.trim();
        const attackValue = parseFloat(row.querySelector('.attack-value').value) * 10000;
        if (attackName && !isNaN(attackValue) && attackValue >= 0) {
          attacks.push({ name: attackName, value: attackValue });
        }
      }
      if (attacks.length === 0) { alert('有効な攻撃パターンを最低1つ入力してください。'); return; }

      // Find or create event type
      let eventType = savedEnemies.find(e => e.eventType === eventTypeName);
      if (!eventType) {
        eventType = { eventType: eventTypeName, series: [] };
        savedEnemies.push(eventType);
      }

      // Find or create series
      let series = eventType.series.find(s => s.seriesName === seriesName);
      if (!series) {
        series = { seriesName, stages: [] };
        eventType.series.push(series);
      }

      // Find or create stage
      let stage = series.stages.find(s => s.stageName === stageName);
      if (!stage) {
        stage = { stageName, bosses: [] };
        series.stages.push(stage);
      }

      const enemyData = {
        name,
        class: newEnemyClassSelect.value,
        type: newEnemyTypeSelect.value,
        attacks,
        critAtkUp: parseFloat(newEnemyCritAtkInput.value) || 0,
        critDefDown: parseFloat(newEnemyCritDefInput.value) || 0,
        isCriticalDefault: newEnemyCritDefaultEnabledCheckbox.checked
      };

      const existingBossIndex = stage.bosses.findIndex(b => b.name === name);
      if (existingBossIndex > -1) {
        if (confirm(`「${name}」はステージ「${stageName}」に既に存在します。上書きしますか？`)) {
          stage.bosses[existingBossIndex] = enemyData;
        } else {
          return;
        }
      } else {
        stage.bosses.push(enemyData);
      }

      clearEnemyForm();

      // Set selection to the newly saved enemy
      const newETIndex = savedEnemies.findIndex(e => e.eventType === eventTypeName);
      const newSerIndex = savedEnemies[newETIndex].series.findIndex(s => s.seriesName === seriesName);
      const newStgIndex = savedEnemies[newETIndex].series[newSerIndex].stages.findIndex(s => s.stageName === stageName);
      const newBossIndex = savedEnemies[newETIndex].series[newSerIndex].stages[newStgIndex].bosses.findIndex(b => b.name === name);

      enemyEventTypeList.value = newETIndex;
      updateSeriesList(newSerIndex, newStgIndex, `${newETIndex}_${newSerIndex}_${newStgIndex}_${newBossIndex}`);

      saveState(false);
      alert(`ボス「${name}」を保存しました。`);
    };

    const deleteEnemy = () => {
      const selectedValue = enemyBossList.value;

      if (!selectedValue || selectedValue === "-1") return;

      const [etIdx, serIdx, stgIdx, bossIdx] = selectedValue.split('_').map(Number);
      const eventType = savedEnemies[etIdx];
      const series = eventType?.series[serIdx];
      const stage = series?.stages[stgIdx];
      if (!stage || !stage.bosses[bossIdx]) return;

      const enemyName = stage.bosses[bossIdx].name;
      if (!confirm(`ボス「${enemyName}」を削除しますか？`)) return;

      stage.bosses.splice(bossIdx, 1);

      // Cleanup empty stages/series/eventTypes
      if (stage.bosses.length === 0) {
        series.stages.splice(stgIdx, 1);
      }
      if (series.stages.length === 0) {
        eventType.series.splice(serIdx, 1);
      }
      if (eventType.series.length === 0) {
        savedEnemies.splice(etIdx, 1);
      }

      updateEnemiesList();
      saveState(false);
      clearEnemyForm();
    };


    // --- Character Preset Functions ---
    const updateCharacterList = () => {
      const selectedValue = charactersList.value;
      charactersList.innerHTML = '';
      if (savedCharacters.length === 0) {
        charactersList.innerHTML = '<option value="-1">保存済みのキャラクターはいません</option>';
        return;
      }
      savedCharacters.forEach((char, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = char.name;
        charactersList.appendChild(option);
      });
      charactersList.value = selectedValue;
    };

    const saveCharacter = () => {
      const name = newCharacterNameInput.value.trim();
      if (!name) { alert('キャラクター名を入力してください。'); return; }

      const scenariosData = getCurrentScenariosData();
      if (scenariosData.length === 0) { alert('保存するシナリオがありません。'); return; }

      const characterData = { name, scenarios: scenariosData };

      const existingIndex = savedCharacters.findIndex(c => c.name === name);

      if (isCharacterEditMode && selectedCharacterIndex > -1 && savedCharacters[selectedCharacterIndex].name !== name && existingIndex > -1) {
        // Renaming to a name that already exists
        if (!confirm(`「${name}」は既に存在します。上書きしますか？`)) return;
        savedCharacters.splice(existingIndex, 1);
      }

      if (isCharacterEditMode && selectedCharacterIndex > -1) {
        savedCharacters[selectedCharacterIndex] = characterData;
      } else if (existingIndex > -1) {
        if (!confirm(`「${name}」は既に存在します。上書きしますか？`)) return;
        savedCharacters[existingIndex] = characterData;
      } else {
        savedCharacters.push(characterData);
      }

      selectedCharacterIndex = savedCharacters.findIndex(c => c.name === name);
      updateCharacterList();
      charactersList.value = selectedCharacterIndex;
      saveState(false);
      alert(`「${name}」を保存しました。`);
    };

    const loadCharacter = () => {
      const selectedIndex = charactersList.value;
      if (selectedIndex < 0) {
        alert('キャラクターを選択してください。');
        return false;
      }
      if (!confirm('現在のシナリオは破棄されます。選択したキャラクターを読み込みますか？')) return false;

      const character = savedCharacters[selectedIndex];
      recreateScenarioCards(character.scenarios);
      newCharacterNameInput.value = character.name;
      selectedCharacterIndex = parseInt(selectedIndex, 10);
      saveState();
      return true;
    };

    const deleteCharacter = () => {
      const selectedIndex = charactersList.value;
      if (selectedIndex < 0) {
        alert('キャラクターを選択してください。');
        return;
      }
      const characterName = savedCharacters[selectedIndex].name;
      if (!confirm(`「${characterName}」を削除しますか？この操作は元に戻せません。`)) return;

      savedCharacters.splice(selectedIndex, 1);
      selectedCharacterIndex = -1;
      newCharacterNameInput.value = '';
      updateCharacterList();
      saveState(false);
    };

    const startNewCharacter = () => {
      if (!confirm('現在のシナリオをすべてクリアして、新しいキャラクターを作成しますか？')) return;
      recreateScenarioCards([]);
      addScenarioCard();
      newCharacterNameInput.value = '';
      selectedCharacterIndex = -1;
      saveState();
    };

    // --- Durability Line Functions ---
    const addDurabilityLine = () => {
      if (durabilityLines.length >= 4) {
        alert('耐久ラインは4つまでしか設定できません。');
        return;
      }
      const valueRaw = parseInt(newLineInput.value, 10);
      if (!isNaN(valueRaw) && valueRaw >= 0) {
        const value = valueRaw * 10000;
        const name = valueRaw === 0 ? '完封' : formatNumber(value);
        if (!durabilityLines.some(line => line.value === value)) {
          durabilityLines.push({ name, value });
          durabilityLines.sort((a, b) => a.value - b.value);
          newLineInput.value = '';
          renderDurabilityLines();
          saveState();
        }
      }
    };

    const deleteDurabilityLine = (index) => {
      durabilityLines.splice(index, 1);
      renderDurabilityLines();
      saveState();
    };

    const renderDurabilityLines = () => {
      linesListContainer.innerHTML = '';
      durabilityLines.forEach((line, index) => {
        const badge = document.createElement('div');
        badge.className = 'line-badge';
        badge.innerHTML = `<span>${line.name}</span><button data-index="${index}">&times;</button>`;
        linesListContainer.appendChild(badge);
      });
      updateAllScenarioResults();
    };

    // --- Scenario Card Functions ---
    const getCurrentScenariosData = () => {
      return Array.from(document.querySelectorAll('#scenario-cards-container .card')).map((card, index) => {
        const scenarioData = { originalIndex: index }; // Store original index
        card.querySelectorAll('.scenario-input, .scenario-title-input').forEach(input => {
          const key = input.dataset.input;
          scenarioData[key] = (input.type === 'checkbox') ? input.checked : input.value;
        });
        if (card.dataset.loadedEnemy) {
          scenarioData.loadedEnemy = JSON.parse(card.dataset.loadedEnemy);
        }
        return scenarioData;
      });
    };

    const recreateScenarioCards = (scenariosData) => {
      cardsContainer.innerHTML = '';
      scenarioCounter = 0;
      if (scenariosData && scenariosData.length > 0) {
        scenariosData.forEach(data => addScenarioCard(data));
      }
    };

    const addScenarioCard = (initialData = null, insertAfterCard = null) => {
      scenarioCounter++;
      const cardId = `scenario-${Date.now()}-${scenarioCounter}`;
      const card = document.createElement('div');
      card.className = 'card';
      card.id = cardId;

      if (initialData && initialData.loadedEnemy) {
        card.dataset.loadedEnemy = JSON.stringify(initialData.loadedEnemy);
      }

      const scenarioTitle = initialData?.scenario_title || `状況 ${scenarioCounter}`;

      card.innerHTML = `
            <div class="card-header scenario-card-header">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-grow: 1;" class="header-main-area">
                    <span class="toggle-arrow collapsed">▼</span>
                    <span class="scenario-title-text">${scenarioTitle}</span>
                    <input type="text" id="${cardId}-title" class="scenario-title-input scenario-input" data-input="scenario_title" value="${scenarioTitle}" placeholder="状況のタイトル">
                </div>
                <div class="summary-icons">
                    <div class="icon-item"><span>🛡️</span><span class="def-value">---</span></div>
                    <div class="icon-item"><span>🔻</span><span class="dr-value">---</span></div>
                    <div class="icon-item"><span>🛡️</span><span class="guard-value">-</span></div>
                    <div class="icon-item"><span>💥</span><span class="line-value">---</span></div>
                </div>
                <div class="header-action-buttons">
                    <button type="button" class="btn-sort-mode" title="並べ替えモード切り替え">✥</button>
                    <button type="button" class="btn btn-edit-title">編集</button>
                    <button type="button" class="btn btn-danger delete-scenario-btn">削除</button>
                </div>
            </div>
            <div class="scenario-card-body">
                <div class="scenario-actions">
                    <button class="btn btn-secondary reset-scenario-btn">リセット</button>
                    <button class="btn btn-primary duplicate-scenario-btn">複製</button>
                </div>
                <div class="scenario-content">
                    <div class="form-section">
                        <div class="final-def-display">最終DEF: ---</div>
                        <div class="form-grid">
                            <div class="form-group"><label for="${cardId}-char_def">キャラDEF</label><input type="number" id="${cardId}-char_def" class="form-control scenario-input" data-input="char_def" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-passive">足し算パッシブ (%)</label><input type="number" id="${cardId}-passive" class="form-control scenario-input" data-input="passive" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-multi_passive">掛け算パッシブ (%)</label><input type="number" id="${cardId}-multi_passive" class="form-control scenario-input" data-input="multi_passive" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-memory">メモリー (%)</label><input type="number" id="${cardId}-memory" class="form-control scenario-input" data-input="memory" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-link">リンクスキル (%)</label><input type="number" id="${cardId}-link" class="form-control scenario-input" data-input="link" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-super_attack">必殺技 (%)</label><input type="number" id="${cardId}-super_attack" class="form-control scenario-input" data-input="super_attack" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-leader">リーダースキル (%)</label><input type="number" id="${cardId}-leader" class="form-control scenario-input" data-input="leader" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-field">フィールド (%)</label><input type="number" id="${cardId}-field" class="form-control scenario-input" data-input="field" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-active">アクティブ (%)</label><input type="number" id="${cardId}-active" class="form-control scenario-input" data-input="active" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-support">サポートアイテム (%)</label><input type="number" id="${cardId}-support" class="form-control scenario-input" data-input="support_item" placeholder="0"></div>
                            <div class="form-group"><label for="${cardId}-dr_input">ダメージ軽減率 (%)</label><input type="number" id="${cardId}-dr_input" class="form-control scenario-input" data-input="dr_input" placeholder="0"></div>
                            <div class="form-check"><input class="scenario-input" type="checkbox" data-input="is_guard" id="${cardId}-guard"><label for="${cardId}-guard">全ガ</label></div>
                        </div>
                        <div class="sub-section-container" style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
                            <div class="sub-section-header" style="cursor: pointer; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <span class="toggle-arrow collapsed">▼</span>
                                <h5 style="margin: 0; color: var(--secondary-color);">対戦相手・相性設定</h5>
                            </div>
                            <div class="sub-section-body form-grid" style="display: none;">
                                <div class="form-group full-width" style="grid-column: 1 / -1; margin-bottom: 1rem; border-bottom: 1px solid #eee; padding-bottom: 1rem;">
                                    <label style="font-size: 0.9rem; font-weight: bold; margin-bottom: 0.5rem; display: block;">登録済みの敵を直接読み込む</label>
                                    <div class="cascade-select-group" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                                        <select id="${cardId}-enemy-event-type-list" class="form-control scenario-enemy-select scenario-input" data-input="loaded_enemy_event_type" aria-label="イベント種別" style="flex: 1 1 45%;"></select>
                                        <select id="${cardId}-enemy-series-list" class="form-control scenario-enemy-select scenario-input" data-input="loaded_enemy_series" aria-label="シリーズ" style="flex: 1 1 45%;"></select>
                                        <select id="${cardId}-enemy-stage-list" class="form-control scenario-enemy-select scenario-input" data-input="loaded_enemy_stage" aria-label="ステージ" style="flex: 1 1 45%;"></select>
                                        <select id="${cardId}-enemy-boss-list" class="form-control scenario-enemy-select scenario-input" data-input="loaded_enemy_boss" aria-label="ボス名" style="flex: 1 1 45%;"></select>
                                    </div>
                                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                                        <button type="button" class="btn btn-action load-enemy-to-card-cascade-btn" style="padding: 0.3rem 0.8rem; font-size: 0.85rem;">反映</button>
                                        <button type="button" class="btn btn-outline clear-enemy-from-card-btn" style="padding: 0.3rem 0.8rem; font-size: 0.85rem;">クリア</button>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="${cardId}-own-class">自分のクラス</label>
                                    <select id="${cardId}-own-class" class="form-control scenario-input" data-input="own_class">
                                        <option value="super">超</option>
                                        <option value="extreme">極</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="${cardId}-own-type">自分の属性</label>
                                    <select id="${cardId}-own-type" class="form-control scenario-input" data-input="own_type">
                                        <option value="teq">技</option>
                                        <option value="agl">速</option>
                                        <option value="str">力</option>
                                        <option value="phy">体</option>
                                        <option value="int">知</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="${cardId}-enemy-class">敵のクラス</label>
                                    <select id="${cardId}-enemy-class" class="form-control scenario-input" data-input="enemy_class">
                                        <option value="super">超</option>
                                        <option value="extreme">極</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="${cardId}-enemy-type">敵の属性</label>
                                    <select id="${cardId}-enemy-type" class="form-control scenario-input" data-input="enemy_type">
                                        <option value="teq">技</option>
                                        <option value="agl">速</option>
                                        <option value="str">力</option>
                                        <option value="phy">体</option>
                                        <option value="int">知</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="${cardId}-attr-def-up">属性防御アップ Lv.</label>
                                    <input type="number" id="${cardId}-attr-def-up" class="form-control scenario-input" data-input="attr_def_up" placeholder="0" min="0">
                                </div>
                                <div class="form-group" id="${cardId}-enemy-atk-group" style="display: none;">
                                    <label for="${cardId}-enemy-atk">敵のATK</label>
                                    <div class="input-group">
                                        <input type="number" id="${cardId}-enemy-atk" class="form-control scenario-input" data-input="enemy_atk" placeholder="0" min="0">
                                        <span class="input-group-text">万</span>
                                    </div>
                                </div>
                                 <div class="form-check" style="grid-column: 1 / -1; border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 0.5rem;">
                                    <input class="scenario-input" type="checkbox" data-input="is_critical" id="${cardId}-critical">
                                    <label for="${cardId}-critical" style="font-weight: bold;">会心</label>
                                </div>
                                <div class="crit-inputs-container" style="display: none; grid-column: 1 / -1; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem;">
                                    <div class="form-group">
                                        <label for="${cardId}-crit-atk-up">会心時ATK補正 (%)</label>
                                        <input type="number" id="${cardId}-crit-atk-up" class="form-control scenario-input" data-input="crit_atk_up" placeholder="0">
                                    </div>
                                    <div class="form-group">
                                        <label for="${cardId}-crit-def-down">会心時DEF補正 (%)</label>
                                        <input type="number" id="${cardId}-crit-def-down" class="form-control scenario-input" data-input="crit_def_down" placeholder="0">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="result-section">
                        <table class="result-table">
                            <thead><tr><th>目標被ダメージ</th><th>耐久ライン (敵ATK)</th></tr></thead>
                            <tbody class="result-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

      if (initialData) {
        card.querySelectorAll('.scenario-input').forEach(input => {
          const key = input.dataset.input;
          if (initialData[key] !== undefined) {
            if (input.type === 'checkbox') input.checked = initialData[key];
            else input.value = initialData[key];
          }
        });
      }

      if (insertAfterCard) {
        insertAfterCard.insertAdjacentElement('afterend', card);
      } else {
        cardsContainer.appendChild(card);
      }
      // カスケードドロップダウンを初期化
      initScenarioCascade(card, cardId);

      updateScenarioResults(card);
    };

    // --- シナリオカード用カスケードドロップダウン ---
    const initScenarioCascade = (card, cardId) => {
      const etList = card.querySelector('[data-input="loaded_enemy_event_type"]');
      const serList = card.querySelector('[data-input="loaded_enemy_series"]');
      const stgList = card.querySelector('[data-input="loaded_enemy_stage"]');
      const bossList = card.querySelector('[data-input="loaded_enemy_boss"]');
      if (!etList || !serList || !stgList || !bossList) return;

      const fillET = () => {
        etList.innerHTML = '';
        serList.innerHTML = '<option value="-1">-</option>';
        stgList.innerHTML = '<option value="-1">-</option>';
        bossList.innerHTML = '<option value="-1">-</option>';
        if (savedEnemies.length === 0) {
          etList.innerHTML = '<option value="-1">敵がいません</option>';
          return;
        }
        savedEnemies.forEach((et, i) => {
          const o = document.createElement('option');
          o.value = i; o.textContent = et.eventType;
          etList.appendChild(o);
        });
        etList.selectedIndex = 0;
        fillSer();
      };

      const fillSer = () => {
        serList.innerHTML = '';
        stgList.innerHTML = '<option value="-1">-</option>';
        bossList.innerHTML = '<option value="-1">-</option>';
        const etIdx = etList.value;
        if (etIdx === '-1' || !savedEnemies[etIdx]) return;
        savedEnemies[etIdx].series.forEach((ser, i) => {
          const o = document.createElement('option');
          o.value = i; o.textContent = ser.seriesName;
          serList.appendChild(o);
        });
        serList.selectedIndex = 0;
        fillStg();
      };

      const fillStg = () => {
        stgList.innerHTML = '';
        bossList.innerHTML = '<option value="-1">-</option>';
        const etIdx = etList.value;
        const serIdx = serList.value;
        if (etIdx === '-1' || serIdx === '-1') return;
        const ser = savedEnemies[etIdx]?.series[serIdx];
        if (!ser) return;
        ser.stages.forEach((stg, i) => {
          const o = document.createElement('option');
          o.value = i; o.textContent = stg.stageName;
          stgList.appendChild(o);
        });
        stgList.selectedIndex = 0;
        fillBoss();
      };

      const fillBoss = () => {
        bossList.innerHTML = '';
        const etIdx = etList.value;
        const serIdx = serList.value;
        const stgIdx = stgList.value;
        if (etIdx === '-1' || serIdx === '-1' || stgIdx === '-1') return;
        const stg = savedEnemies[etIdx]?.series[serIdx]?.stages[stgIdx];
        if (!stg) return;
        stg.bosses.forEach((boss, i) => {
          const o = document.createElement('option');
          o.value = etIdx + '_' + serIdx + '_' + stgIdx + '_' + i;
          o.textContent = boss.name;
          bossList.appendChild(o);
        });
        bossList.selectedIndex = 0;
      };

      etList.addEventListener('change', fillSer);
      serList.addEventListener('change', fillStg);
      stgList.addEventListener('change', fillBoss);
      fillET();
    };

    // --- Calculation Functions ---
    const calculateNewDurability = (scenarioData) => {
      const {
        char_def, leader, field, passive, memory, link, multi_passive, super_attack, active, support_item,
        own_class = 'super', own_type = 'teq',
        enemy_class = 'super', enemy_type = 'teq',
        attr_def_up = 0, is_guard = false, dr_input = 0,
        is_critical = false, crit_atk_up = 0, crit_def_down = 0
      } = scenarioData;

      // 1. Calculate final DEF
      let final_def = (parseFloat(char_def) || 0) *
        (1 + (parseFloat(leader) || 0) / 100) *
        (1 + (parseFloat(field) || 0) / 100) *
        (1 + (parseFloat(passive) || 0) / 100) *
        (1 + (parseFloat(memory) || 0) / 100) *
        (1 + (parseFloat(link) || 0) / 100) *
        (1 + (parseFloat(multi_passive) || 0) / 100) *
        (1 + (parseFloat(super_attack) || 0) / 100) *
        (1 + (parseFloat(active) || 0) / 100) *
        (1 + (parseFloat(support_item) || 0) / 100);

      // 2. Determine Group 1 (Type) Advantage
      const typeAdvantageMap = { teq: 'agl', agl: 'str', str: 'phy', phy: 'int', 'int': 'teq' };
      let group1_advantage_status = 'neutral';
      if (typeAdvantageMap[own_type] === enemy_type) {
        group1_advantage_status = 'advantage';
      } else if (typeAdvantageMap[enemy_type] === own_type) {
        group1_advantage_status = 'disadvantage';
      }

      // 3. Determine base modifiers
      let guard_mod = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;
      let attr_mod = 1.0;
      const is_same_class = own_class === enemy_class;
      if (is_same_class) {
        if (group1_advantage_status === 'advantage') attr_mod = 0.9;
        else if (group1_advantage_status === 'disadvantage') attr_mod = 1.25;
      } else {
        if (group1_advantage_status === 'advantage') attr_mod = 1.0;
        else if (group1_advantage_status === 'disadvantage') attr_mod = 1.5;
        else attr_mod = 1.15;
      }

      // 4. Handle All-Guard (is_guard) override
      if (is_guard) {
        attr_mod = 0.8;
        guard_mod = 0.5;
      }

      // 5. Apply Attribute DEF Up skill
      // This skill is only active when the character has type advantage.
      if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
        attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
      }

      // 6. Handle Critical Hit logic
      let atk_crit_mod = 1.0;
      let def_crit_mod = 1.0;
      if (is_critical) {
        atk_crit_mod = 1 + ((parseFloat(crit_atk_up) || 0) / 100);
        def_crit_mod = 1 - ((parseFloat(crit_def_down) || 0) / 100);

        if (is_guard) {
          // 全ガあり: 属性相性は0.8ベース、ガード補正(0.5)は常時発動
          attr_mod = 0.8;
          guard_mod = 0.5;
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        } else {
          // 全ガなし: 属性相性は1.0(中立)、ガード無効
          attr_mod = 1.0;
          guard_mod = 1.0;
          if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
            attr_mod -= ((parseFloat(attr_def_up) || 0) * 0.01);
          }
        }
      }

      // 7. Final DR modifier
      const dr_mod = 1 - ((parseFloat(dr_input) || 0) / 100);

      return {
        final_def: final_def,
        final_def_crit_mod: final_def * def_crit_mod,
        attr_mod: Math.max(0, attr_mod),
        guard_mod,
        dr_mod,
        atk_crit_mod,
        group1_advantage_status
      };
    };

    const updateScenarioResults = (card) => {
      const scenarioData = {};
      card.querySelectorAll('.scenario-input').forEach(input => {
        const key = input.dataset.input;
        scenarioData[key] = (input.type === 'checkbox') ? input.checked : (input.type === 'number' ? parseFloat(input.value) : input.value);
      });

      const calcResults = calculateNewDurability(scenarioData);
      const { final_def, final_def_crit_mod, attr_mod, guard_mod, dr_mod, atk_crit_mod, group1_advantage_status } = calcResults;
      const is_critical = scenarioData.is_critical || false;
      const crit_atk_up = scenarioData.crit_atk_up || 0;
      const crit_def_down = scenarioData.crit_def_down || 0;
      const attr_def_up = scenarioData.attr_def_up || 0;
      const is_guard = scenarioData.is_guard || false;
      card.querySelector('.final-def-display').textContent = `最終DEF: ${Math.round(final_def).toLocaleString()}`;

      const selectedMode = document.querySelector('input[name="calc_mode"]:checked').value;
      const resultSection = card.querySelector('.result-section');
      const enemyAtkGroup = card.querySelector(`[id$="-enemy-atk-group"]`);
      const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;

      if (selectedMode === 'durability') {
        enemyAtkGroup.style.display = 'none';
        resultSection.innerHTML = `
                <table class="result-table">
                    <thead><tr><th>目標被ダメージ</th><th>耐久ライン (敵ATK)</th></tr></thead>
                    <tbody class="result-body"></tbody>
                </table>
            `;
        const resultBody = resultSection.querySelector('.result-body');
        const isCritUnconfigured = is_critical && (parseFloat(crit_atk_up) || 0) === 0 && (parseFloat(crit_def_down) || 0) === 0;

        durabilityLines.forEach(line => {
          const dmg = line.value;
          let atkDisplay = "";
          if (isCritUnconfigured) {
              atkDisplay = "--";
          } else {
              const requiredEnemyAtk = ((dmg / guard_mod) + final_def_crit_mod) / (attr_mod * dr_mod * atk_crit_mod);
              atkDisplay = formatNumber(requiredEnemyAtk);
          }
          const row = resultBody.insertRow();
          row.innerHTML = `<th>${line.name}</th><td>${atkDisplay}</td>`;
        });

      } else { // 'damage' mode
        if (loadedEnemyData && loadedEnemyData.attacks) {
          enemyAtkGroup.style.display = 'none';
          // === 状態保持付きで再生成（クロージャ等のバグを完全に回避する） ===
          // 既存のセレクタがあればその値を保持
          const existingContainer = resultSection.querySelector('.dynamic-damage-container');
          const savedConds = {
            turn: existingContainer?.querySelector('.cond-turn')?.value,
            hit: existingContainer?.querySelector('.cond-hit')?.value,
            hp: existingContainer?.querySelector('.cond-hp')?.value,
            appear: existingContainer?.querySelector('.cond-appear')?.value
          };

          // 毎回HTMLを再生成する（最新の変数を束縛した renderDynamicAttacks を安全に動作させるため）
          resultSection.innerHTML = '<div class="dynamic-damage-container"></div>';
          const dynContainer = resultSection.querySelector('.dynamic-damage-container');
          const currentEnemyName = loadedEnemyData.name || '';
          dynContainer.dataset.enemyName = currentEnemyName;

          // 旧データにbaseAtkが無い場合のフォールバック
          if (!loadedEnemyData.baseAtk && loadedEnemyData.attacks && loadedEnemyData.attacks.length > 0) {
            const normalAtk = loadedEnemyData.attacks.find(a => a.name === '通常');
            if (normalAtk) {
              loadedEnemyData.baseAtk = normalAtk.value;
              const saAtk = loadedEnemyData.attacks.find(a => a.name === '必殺' || a.name.includes('必殺'));
              loadedEnemyData.saMulti = saAtk ? saAtk.value / normalAtk.value : 3;
              loadedEnemyData.saBuffMod = loadedEnemyData.saBuffMod || 0;
              const aoeAtk = loadedEnemyData.attacks.find(a => a.name === '全体攻撃');
              loadedEnemyData.aoeDamage = aoeAtk ? aoeAtk.value : 0;
              loadedEnemyData.hasSaCrit = loadedEnemyData.hasSaCrit || false;
              loadedEnemyData.turnAtkUpStartTurn = loadedEnemyData.turnAtkUpStartTurn || 1;
              loadedEnemyData.turnAtkUp = loadedEnemyData.turnAtkUp || 0;
              loadedEnemyData.turnAtkMax = loadedEnemyData.turnAtkMax || 0;
              loadedEnemyData.hitAtkUp = loadedEnemyData.hitAtkUp || 0;
              loadedEnemyData.hitAtkMax = loadedEnemyData.hitAtkMax || 0;
              loadedEnemyData.hpAtkUp = loadedEnemyData.hpAtkUp || 0;
              loadedEnemyData.hpAtkThreshold = loadedEnemyData.hpAtkThreshold || 0;
              loadedEnemyData.appearEntries = loadedEnemyData.appearEntries || [];
            }
          }

          if (!loadedEnemyData.baseAtk || loadedEnemyData.baseAtk <= 0) {
            dynContainer.innerHTML = '<p>この敵にはATKデータがありません。</p>';
          } else {
            const d = loadedEnemyData;
            // --- 条件セレクターを生成 ---
            let selectorsHTML = '<div class="condition-selectors" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">';

            if (d.turnAtkUp > 0 && d.turnAtkMax > 0) {
              const startTurn = d.turnAtkUpStartTurn || 1;
              const steps = Math.floor(d.turnAtkMax / d.turnAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">ターン経過</label><select class="form-control cond-turn" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const currentTurn = startTurn + i - 1;
                const pct = d.turnAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + currentTurn + 'ターン (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

            if (d.hitAtkUp > 0 && d.hitAtkMax > 0) {
              const steps = Math.floor(d.hitAtkMax / d.hitAtkUp);
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">被弾回数</label><select class="form-control cond-hit" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">なし</option>';
              for (let i = 1; i <= steps; i++) {
                const pct = d.hitAtkUp * i;
                selectorsHTML += '<option value="' + pct + '">' + i + '回 (ATK+' + pct + '%)</option>';
              }
              selectorsHTML += '</select></div>';
            }

            if (d.hpAtkUp > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">HP条件</label><select class="form-control cond-hp" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">HP' + d.hpAtkThreshold + '%以上</option>';
              selectorsHTML += '<option value="' + d.hpAtkUp + '">HP' + d.hpAtkThreshold + '%以下 (ATK+' + d.hpAtkUp + '%)</option>';
              selectorsHTML += '</select></div>';
            }

            if (d.appearEntries && d.appearEntries.length > 0) {
              selectorsHTML += '<div style="flex:1 1 45%;"><label style="font-size:0.8rem;display:block;">登場ターン</label><select class="form-control cond-appear" style="font-size:0.85rem;">';
              selectorsHTML += '<option value="0">初期</option>';
              d.appearEntries.forEach(e => {
                selectorsHTML += '<option value="' + e.cumulativeAtkUp + '">' + e.turn + 'ターン目 (ATK+' + e.cumulativeAtkUp + '%)</option>';
              });
              selectorsHTML += '</select></div>';
            }

            selectorsHTML += '</div>';
            dynContainer.innerHTML = selectorsHTML + '<div class="dynamic-attacks-list"></div>';

            // --- 保存した状態を復元 ---
            const turnSel = dynContainer.querySelector('.cond-turn');
            if (turnSel && savedConds.turn) turnSel.value = savedConds.turn;
            const hitSel = dynContainer.querySelector('.cond-hit');
            if (hitSel && savedConds.hit) hitSel.value = savedConds.hit;
            const hpSel = dynContainer.querySelector('.cond-hp');
            if (hpSel && savedConds.hp) hpSel.value = savedConds.hp;
            const appSel = dynContainer.querySelector('.cond-appear');
            if (appSel && savedConds.appear) appSel.value = savedConds.appear;

            const renderDynamicAttacks = () => {
              const turnPct = parseFloat(dynContainer.querySelector('.cond-turn')?.value || 0);
              const hitPct = parseFloat(dynContainer.querySelector('.cond-hit')?.value || 0);
              const hpPct = parseFloat(dynContainer.querySelector('.cond-hp')?.value || 0);
              const appearPct = parseFloat(dynContainer.querySelector('.cond-appear')?.value || 0);

              const totalAtkUpPct = turnPct + hitPct + hpPct + appearPct;
              const atkMulti = 1 + (totalAtkUpPct / 100);

              const boostedAtk = Math.floor(d.baseAtk * atkMulti);
              const trueSaMulti = d.saMulti + d.saBuffMod;
              const postSaNormalMulti = 1.0 + d.saBuffMod;

              const dynamicAttacks = [];
              dynamicAttacks.push({ name: '通常', value: boostedAtk, isCrit: false });
              if (d.saBuffMod > 0) dynamicAttacks.push({ name: '通常(必殺後)', value: Math.floor(boostedAtk * postSaNormalMulti), isCrit: false });

              if (d.hasSaCrit) {
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
                dynamicAttacks.push({ name: '必殺[会心]', value: Math.floor(boostedAtk * trueSaMulti), isCrit: true });
              } else {
                dynamicAttacks.push({ name: '必殺', value: Math.floor(boostedAtk * trueSaMulti), isCrit: false });
              }

              if (d.aoeDamage > 0) dynamicAttacks.push({ name: '全体攻撃', value: Math.floor(d.aoeDamage * atkMulti), isCrit: false });

              const listDiv = dynContainer.querySelector('.dynamic-attacks-list');
              let condLabel = totalAtkUpPct > 0 ? '<div style="font-size:0.8rem;color:var(--secondary-color);margin-bottom:0.3rem;">合計ATK +' + totalAtkUpPct + '% (x' + atkMulti.toFixed(2) + ')</div>' : '';
              let html = condLabel;

              dynamicAttacks.forEach(atk => {
                let atkCritMod_local = 1.0;
                let defForCalc = final_def;
                let attrMod_local = 1.0;
                let guardMod_local = (group1_advantage_status === 'advantage') ? 0.5 : 1.0;

                const o_class = scenarioData.own_class || 'super';
                const e_class = scenarioData.enemy_class || 'extreme';
                const is_same_class = o_class === e_class;
                if (is_same_class) {
                  if (group1_advantage_status === 'advantage') attrMod_local = 0.9;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.25;
                } else {
                  if (group1_advantage_status === 'advantage') attrMod_local = 1.0;
                  else if (group1_advantage_status === 'disadvantage') attrMod_local = 1.5;
                  else attrMod_local = 1.15;
                }

                if (is_guard) {
                  attrMod_local = 0.8;
                  guardMod_local = 0.5;
                }

                if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                  attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                }

                const is_this_attack_crit = atk.isCrit || is_critical;

                if (is_this_attack_crit) {
                  // プリセットの d.critAtkUp ではなく、UIから取得・編集可能な scenarioData の値を使用する
                  const critAtkUpVal = parseFloat(scenarioData.crit_atk_up) || 0;
                  const critDefDownVal = parseFloat(scenarioData.crit_def_down) || 0;
                  const isCritUnconfigured = (critAtkUpVal === 0 && critDefDownVal === 0);

                  if (isCritUnconfigured) {
                    // 会心条件が未設定 → "--" 表示してスキップ
                    const critLabel = atk.name.includes('会心') ? '' : ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>';
                    html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                      '<span class="attack-name" style="font-weight:bold;">' + atk.name + critLabel + '</span>' +
                      '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                      '</div>' +
                      '<div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">\u26a0\ufe0f 条件が設定されていません。</div>' +
                      '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--secondary-color);">被ダメ: --</div>' +
                      '</div>';
                    return;
                  }

                  // 会心条件が設定済み: ATK上昇率・DEF減少率を適用
                  atkCritMod_local = 1 + (critAtkUpVal / 100);
                  defForCalc = final_def * (1 - (critDefDownVal / 100));

                  if (is_guard) {
                    // 全ガあり: 属性相性は0.8ベース、ガード(0.5)常時発動
                    attrMod_local = 0.8;
                    guardMod_local = 0.5;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  } else {
                    // 全ガなし: 属性相性は1.0(中立)、ガード無効
                    attrMod_local = 1.0;
                    guardMod_local = 1.0;
                    if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                      attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                    }
                  }
                }

                const dmg = Math.max(0, ((atk.value * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
                const critBadge = (is_this_attack_crit && !atk.name.includes('会心')) ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';
                html += '<div class="multi-attack-result-item" style="padding:0.3rem 0;border-bottom:1px solid var(--border-color);">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                  '<span class="attack-name" style="font-weight:bold;">' + atk.name + critBadge + '</span>' +
                  '<span style="font-size:0.85rem;color:var(--secondary-color);">ATK: ' + formatNumber(atk.value) + '</span>' +
                  '</div>' +
                  '<div style="text-align:right;font-size:1.1rem;font-weight:bold;color:var(--danger-color);">被ダメ: ' + formatNumber(dmg) + '</div>' +
                  '</div>';
              });

              listDiv.innerHTML = html;
            };

            // イベントリスナーを毎回割り当てる
            dynContainer.querySelectorAll('.condition-selectors select').forEach(sel => {
              sel.addEventListener('change', () => {
                // セレクトボックス変更時に親カード（シナリオ）全体を再計算し、
                // 他のデータ（DEFなど）との整合性を保つ
                updateScenarioResults(card);
                saveState();
              });
            });

            renderDynamicAttacks();
          }
        } else {
          enemyAtkGroup.style.display = 'block';
          const enemy_atk_input = (parseFloat(scenarioData.enemy_atk) || 0) * 10000;

          let atkCritMod_local = 1.0;
          let defForCalc = final_def;
          let attrMod_local = attr_mod;
          let guardMod_local = guard_mod;
          
          if (is_critical) {
            const critAtkUpVal = parseFloat(crit_atk_up) || 0;
            const critDefDownVal = parseFloat(crit_def_down) || 0;

            if (critAtkUpVal === 0 && critDefDownVal === 0) {
              resultSection.innerHTML = `
                    <div class="manual-damage-result" style="padding:0.5rem; border: 1px solid var(--border-color); border-radius: 5px;">
                        <div class="attack-details" style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="attack-stat" style="font-weight:bold;">敵ATK: ${formatNumber(enemy_atk_input)} <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span></span>
                        </div>
                        <div style="font-size:0.8rem;color:#ffc107;margin-top:0.2rem;">⚠️ 条件が設定されていません。</div>
                        <div style="text-align:right; font-size:1.1rem; font-weight:bold; color:var(--secondary-color);">被ダメ: --</div>
                    </div>
                `;
              return;
            } else {
              atkCritMod_local = 1 + (critAtkUpVal / 100);
              defForCalc = final_def * (1 - (critDefDownVal / 100));
              
              if (is_guard) {
                 attrMod_local = 0.8;
                 guardMod_local = 0.5;
                 if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                    attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                 }
              } else {
                 attrMod_local = 1.0;
                 guardMod_local = 1.0;
                 if (group1_advantage_status === 'advantage' && attr_def_up > 0) {
                    attrMod_local -= ((parseFloat(attr_def_up) || 0) * 0.01);
                 }
              }
            }
          }

          const damage_taken = Math.max(0, ((enemy_atk_input * atkCritMod_local) * attrMod_local * dr_mod - defForCalc)) * guardMod_local;
          const critBadge = is_critical ? ' <span style="background:#dc3545;color:white;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.7rem;">会心</span>' : '';

          resultSection.innerHTML = `
                    <div class="manual-damage-result">
                        <div class="attack-details">
                            <span class="attack-stat">敵ATK: ${formatNumber(enemy_atk_input)}${critBadge}</span>
                            <span class="arrow">→</span>
                            <span class="damage-value">被ダメ: ${formatNumber(damage_taken)}</span>
                        </div>
                    </div>
                `;
        }
      }

      // Simplified summary icons update
      const summaryIcons = card.querySelector('.summary-icons');
      if (summaryIcons) {
        const { dr_input = 0, is_guard = false } = scenarioData;
        summaryIcons.innerHTML = `
                <div class="icon-item"><span>🛡️</span><span>DEF:${Math.round(final_def).toLocaleString()}</span></div>
                <div class="icon-item"><span>🔻</span><span>軽減:${dr_input > 0 ? `${dr_input}%` : '-'}</span></div>
                <div class="icon-item"><span></span><span>全ガ:${is_guard ? 'あり' : '-'}</span></div>
            `;
      }
    };

    const updateAllScenarioResults = () => {
      document.querySelectorAll('#scenario-cards-container .card').forEach(updateScenarioResults);
    };

    // --- Screenshot & Selection Functions ---
    const calculateFinalDefFromData = (scenario) => {
      const values = ['char_def', 'leader', 'field', 'passive', 'memory', 'link', 'multi_passive', 'super_attack'].map(key => parseFloat(scenario[key]) || 0);
      const [char_def, leader, field, passive, memory, link, multi_passive, super_attack] = values;
      return char_def * (1 + leader / 100) * (1 + field / 100) * (1 + passive / 100) * (1 + memory / 100) * (1 + link / 100) * (1 + multi_passive / 100) * (1 + super_attack / 100);
    };

    const renderPreview = (scenarios, lines, container) => {
      container.innerHTML = '';

      scenarios.forEach((scenario) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.originalIndex = scenario.originalIndex;

        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `<span class="scenario-title-text">${scenario.scenario_title}</span>`;
        card.appendChild(header);

        const infoArea = document.createElement('div');
        infoArea.className = 'summary-info';

        // Use the original, simpler calculation logic for the screenshot
        const defValue = calculateFinalDefFromData(scenario);
        const dr_input = parseFloat(scenario.dr_input) || 0;
        const is_guard = scenario.is_guard === true || String(scenario.is_guard) === 'true';

        const addInfoItem = (container, label, value, noColon = false) => {
          const item = document.createElement('div');
          item.className = 'summary-item-pair';
          const labelHtml = noColon ? `<span class="label">${label}</span>` : `<span class="label">${label}:</span>`;
          item.innerHTML = `${labelHtml}<span class="value">${value}</span>`;
          container.appendChild(item);
        };

        addInfoItem(infoArea, 'DEF', formatNumber(defValue));
        addInfoItem(infoArea, '軽減', dr_input > 0 ? `${dr_input}%` : '-');
        addInfoItem(infoArea, '全ガ', is_guard ? 'あり' : '-');

        lines.forEach(line => {
          const dmg = line.value;
          const dr_rate = 1 - (dr_input / 100);
          // This is the original, simple formula without detailed attribute modifiers
          let enemy_atk = is_guard ? ((dmg / 0.5) + defValue) / (0.8 * (dr_rate > 0 ? dr_rate : 1)) : (dr_input > 0) ? (dmg + defValue) / dr_rate : dmg + defValue;
          addInfoItem(infoArea, line.name, formatNumber(enemy_atk));
        });

        card.appendChild(infoArea);
        container.appendChild(card);
      });
    };

    const openPreviewOverlay = (scenarios, mode = 'preview') => {
      document.documentElement.style.setProperty('--overlay-safe-height', `${window.innerHeight}px`);

      const isSelectionMode = mode === 'selection';
      previewOverlay.classList.toggle('selection-mode', isSelectionMode);

      // Show/hide buttons based on mode
      overlayDownloadBtn.classList.toggle('hidden', isSelectionMode);
      overlayCloseBtn.classList.toggle('hidden', isSelectionMode);
      selectionCloseBtn.classList.toggle('hidden', !isSelectionMode);
      selectionSelectAllBtn.classList.toggle('hidden', !isSelectionMode);
      selectionDeselectAllBtn.classList.toggle('hidden', !isSelectionMode);
      selectionGenerateBtn.classList.toggle('hidden', !isSelectionMode);

      // Set layout class based on number of cards
      const cardCount = scenarios.length;
      overlayCardsContainer.className = 'cards-grid'; // Reset
      if (cardCount > 0) {
        overlayCardsContainer.classList.add(`card-count-${cardCount}`);
      }

      renderPreview(scenarios, durabilityLines, overlayCardsContainer);

      // Add selectable class in selection mode
      if (isSelectionMode) {
        overlayCardsContainer.querySelectorAll('.card').forEach(card => {
          card.classList.add('selectable');
        });
      }

      previewOverlay.classList.remove('hidden');
    };

    const openEnemySelectionModal = (targetCard) => {
      if (!targetCard) return;
      activeModalTargetCard = targetCard;

      modalEnemyList.innerHTML = ''; // Clear previous list
      if (savedEnemies.length === 0) {
        modalEnemyList.innerHTML = '<p>保存されている敵がいません。</p>';
      } else {
        savedEnemies.forEach((eventType, etIndex) => {
          const etDiv = document.createElement('div');
          etDiv.className = 'modal-enemy-category';
          const etHeader = document.createElement('h5');
          etHeader.style.color = 'var(--primary-color)';
          etHeader.style.borderBottom = '1px solid var(--border-color)';
          etHeader.style.paddingBottom = '0.3rem';
          etHeader.style.marginBottom = '0.5rem';
          etHeader.textContent = eventType.eventType;
          etDiv.appendChild(etHeader);

          eventType.series.forEach((series, serIndex) => {
            const serDiv = document.createElement('div');
            serDiv.className = 'modal-enemy-group';
            if (series.seriesName !== '-') {
              const serHeader = document.createElement('h6');
              serHeader.style.color = 'var(--secondary-color)';
              serHeader.style.marginBottom = '0.3rem';
              serHeader.textContent = series.seriesName;
              serDiv.appendChild(serHeader);
            }

            series.stages.forEach((stage, stgIndex) => {
              const stgLabel = document.createElement('div');
              stgLabel.style.fontSize = '0.8rem';
              stgLabel.style.color = 'var(--secondary-color)';
              stgLabel.style.marginBottom = '0.2rem';
              stgLabel.textContent = stage.stageName;
              serDiv.appendChild(stgLabel);

              const enemyGrid = document.createElement('div');
              enemyGrid.className = 'modal-enemy-grid';

              stage.bosses.forEach((boss, bossIndex) => {
                const item = document.createElement('div');
                item.className = 'modal-enemy-item';
                item.textContent = boss.name;
                item.dataset.etIndex = etIndex;
                item.dataset.serIndex = serIndex;
                item.dataset.stgIndex = stgIndex;
                item.dataset.bossIndex = bossIndex;
                enemyGrid.appendChild(item);
              });
              serDiv.appendChild(enemyGrid);
            });
            etDiv.appendChild(serDiv);
          });
          modalEnemyList.appendChild(etDiv);
        });
      }
      enemySelectionModal.classList.remove('hidden');
    };

    const closeEnemySelectionModal = () => {
      enemySelectionModal.classList.add('hidden');
      activeModalTargetCard = null;
    };

    const downloadPreview = () => {
      const captureTarget = document.getElementById('overlay-cards-container');
      if (!captureTarget) return;
      const isDarkMode = document.body.classList.contains('dark-mode');
      const backgroundColor = isDarkMode ? '#18191a' : '#f0f2f5';

      html2canvas(captureTarget, {
        useCORS: true,
        backgroundColor: backgroundColor,
        scale: 2
      }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `dokkan-capture-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }).catch(err => {
        console.error('Screenshot generation failed:', err);
        alert('エラーが発生し、スクリーンショットを生成できませんでした。');
      });
    };

    // --- SortableJS Logic ---
    function initSortable() {
      if (typeof Sortable === 'undefined') {
        console.warn('SortableJS not loaded, sorting disabled.');
        document.querySelectorAll('.btn-sort-mode').forEach(btn => btn.style.display = 'none');
        return;
      }
      if (sortable) sortable.destroy();

      // Sortable for scenario cards
      sortable = new Sortable(cardsContainer, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        handle: '.scenario-card-header',
        onEnd: function () { saveState(); },
        disabled: true,
      });
    }

    function toggleSortableMode() {
      if (typeof Sortable === 'undefined') return;
      const isActive = !sortable.option('disabled');
      sortable.option('disabled', isActive);
      document.body.classList.toggle('sortable-mode', !isActive);
      document.querySelectorAll('.btn-sort-mode').forEach(btn => btn.classList.toggle('active', !isActive));
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
      // --- Calculation Mode Switch Logic ---
      const enemyManagementCard = document.getElementById('enemy-management-card');
      const calcModeRadios = document.querySelectorAll('input[name="calc_mode"]');

      const handleModeChange = () => {
        const selectedMode = document.querySelector('input[name="calc_mode"]:checked').value;
        document.querySelectorAll('#scenario-cards-container .card').forEach(card => {
          const enemyAtkGroup = card.querySelector(`[id$="-enemy-atk-group"]`);
          const loadedEnemyData = card.dataset.loadedEnemy ? JSON.parse(card.dataset.loadedEnemy) : null;

          // Show manual ATK input only in damage mode AND when no preset is loaded
          if (selectedMode === 'damage' && !loadedEnemyData) {
            enemyAtkGroup.style.display = 'block';
          } else {
            enemyAtkGroup.style.display = 'none';
          }
        });
        updateAllScenarioResults();
      };

      calcModeRadios.forEach(radio => {
        radio.addEventListener('change', handleModeChange);
      });

      // Make enemy management card visible by default, its visibility is now handled by its own collapse/expand state
      if (enemyManagementCard) enemyManagementCard.style.display = 'block';

      // --- Enemy Management Collapse/Expand Logic ---
      const enemyHeader = document.getElementById('enemy-management-header');
      const enemyBody = document.getElementById('enemy-management-body');
      if (enemyHeader) {
        enemyHeader.addEventListener('click', (e) => {
          if (e.target.closest('button')) return; // Ignore clicks on buttons inside header
          const isCollapsed = enemyBody.style.display === 'none';
          enemyBody.style.display = isCollapsed ? 'block' : 'none';
          enemyHeader.querySelector('.toggle-arrow').classList.toggle('collapsed', !isCollapsed);
        });
      }

      // Set initial visibility on load
      handleModeChange();

      addLineBtn.addEventListener('click', addDurabilityLine);
      newLineInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addDurabilityLine(); });
      addScenarioBtn.addEventListener('click', () => { addScenarioCard(); saveState(); });

      saveCharacterBtn.addEventListener('click', () => {
        saveCharacter();
        isCharacterEditMode = false;
        saveCharacterBtn.textContent = '現在の状況を保存';
        newCharacterNameInput.value = ''; // Clear name input after saving
      });

      loadCharacterBtn.addEventListener('click', () => {
        if (loadCharacter()) { // loadCharacter returns true on success
          isCharacterEditMode = true;
          saveCharacterBtn.textContent = '変更を上書き保存';
        }
      });

      deleteCharacterBtn.addEventListener('click', () => {
        deleteCharacter();
        isCharacterEditMode = false;
        saveCharacterBtn.textContent = '現在の状況を保存';
      });

      themeToggleBtn.addEventListener('click', toggleTheme);

      newCharacterBtn.addEventListener('click', () => {
        startNewCharacter();
        isCharacterEditMode = false;
        saveCharacterBtn.textContent = '現在の状況を保存';
      });

      summaryViewBtn.addEventListener('click', () => {
        if (cardsContainer.children.length === 0) {
          alert('スクリーンショットの対象となる状況がありません。');
          return;
        }
        const scenarios = getCurrentScenariosData();
        openPreviewOverlay(scenarios, 'selection');
      });

      // Preview Overlay Listeners
      overlayCloseBtn.addEventListener('click', () => previewOverlay.classList.add('hidden'));
      overlayDownloadBtn.addEventListener('click', downloadPreview);

      // Enemy Modal Listeners
      modalCloseBtn.addEventListener('click', closeEnemySelectionModal);
      enemySelectionModal.addEventListener('click', (e) => {
        // Handle clicks on the overlay to close it
        if (e.target === enemySelectionModal) {
          closeEnemySelectionModal();
          return;
        }
        // Handle clicks on enemy items
        const enemyItem = e.target.closest('.modal-enemy-item');
        if (enemyItem && activeModalTargetCard) {
          const etIndex = parseInt(enemyItem.dataset.etIndex, 10);
          const serIndex = parseInt(enemyItem.dataset.serIndex, 10);
          const stgIndex = parseInt(enemyItem.dataset.stgIndex, 10);
          const bossIndex = parseInt(enemyItem.dataset.bossIndex, 10);
          const enemyData = savedEnemies[etIndex]?.series[serIndex]?.stages[stgIndex]?.bosses[bossIndex];

          if (enemyData) {
            // Store the entire enemy object on the card
            activeModalTargetCard.dataset.loadedEnemy = JSON.stringify(enemyData);

            // Set attributes and crit values
            activeModalTargetCard.querySelector('[data-input="enemy_class"]').value = enemyData.class;
            activeModalTargetCard.querySelector('[data-input="enemy_type"]').value = enemyData.type;
            // 会心ATK上昇率と会心DEF低下率を設定
            // critFixedRate, critHpRate, critTurnMax などから推定値を設定
            let effectiveCritAtkUp = enemyData.critAtkUp || 0;
            let effectiveCritDefDown = enemyData.critDefDown || 0;

            // 条件付き会心の場合、最大値を初期値として使用
            if (effectiveCritAtkUp === 0) {
              // critFixedRate（固定会心ATK上昇率）があればそれを使う
              if (enemyData.critFixedRate > 0) {
                effectiveCritAtkUp = enemyData.critFixedRate;
              }
              // critTurnMax（ターン経過会心の最大値）があればそれを使う
              else if (enemyData.critTurnMax > 0) {
                effectiveCritAtkUp = enemyData.critTurnMax;
              }
              // critHpRate (HP条件会心) があればそれを使う
              else if (enemyData.critHpRate > 0) {
                effectiveCritAtkUp = enemyData.critHpRate;
              }
            }

            activeModalTargetCard.querySelector('[data-input="crit_atk_up"]').value = effectiveCritAtkUp || '';
            activeModalTargetCard.querySelector('[data-input="crit_def_down"]').value = effectiveCritDefDown || '';

            const critCheckbox = activeModalTargetCard.querySelector('[data-input="is_critical"]');
            critCheckbox.checked = enemyData.isCriticalDefault || false;

            // Manually trigger the visibility toggle
            const critContainer = activeModalTargetCard.querySelector('.crit-inputs-container');
            critContainer.style.display = critCheckbox.checked ? 'grid' : 'none';


            // Clear the manual ATK input as it's no longer primary
            activeModalTargetCard.querySelector('[data-input="enemy_atk"]').value = '';

            updateScenarioResults(activeModalTargetCard);
            saveState();
          }
          closeEnemySelectionModal();
        }
      });

      // Selection Mode Listeners
      selectionCloseBtn.addEventListener('click', () => previewOverlay.classList.add('hidden'));

      overlayCardsContainer.addEventListener('click', (e) => {
        if (!previewOverlay.classList.contains('selection-mode')) return;
        const card = e.target.closest('.card.selectable');
        if (card) {
          card.classList.toggle('selected');
        }
      });

      selectionSelectAllBtn.addEventListener('click', () => {
        overlayCardsContainer.querySelectorAll('.card.selectable').forEach(card => {
          card.classList.add('selected');
        });
      });

      selectionDeselectAllBtn.addEventListener('click', () => {
        overlayCardsContainer.querySelectorAll('.card.selectable').forEach(card => {
          card.classList.remove('selected');
        });
      });

      selectionGenerateBtn.addEventListener('click', () => {
        const allScenarios = getCurrentScenariosData();
        const selectedScenarios = [];

        overlayCardsContainer.querySelectorAll('.card.selected').forEach(card => {
          const scenarioIndex = parseInt(card.dataset.originalIndex, 10);
          if (!isNaN(scenarioIndex) && allScenarios[scenarioIndex]) {
            selectedScenarios.push(allScenarios[scenarioIndex]);
          }
        });

        if (selectedScenarios.length === 0) {
          alert('スクリーンショットに含めるカードを1枚以上選択してください。');
          return;
        }

        openPreviewOverlay(selectedScenarios, 'preview');
      });

      expandAllBtn.addEventListener('click', () => {
        document.querySelectorAll('#scenario-cards-container .card .scenario-card-body').forEach(body => body.classList.add('show'));
        document.querySelectorAll('#scenario-cards-container .card .toggle-arrow').forEach(arrow => arrow.classList.remove('collapsed'));
      });
      collapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('#scenario-cards-container .card .scenario-card-body').forEach(body => body.classList.remove('show'));
        document.querySelectorAll('#scenario-cards-container .card .toggle-arrow').forEach(arrow => arrow.classList.add('collapsed'));
      });

      cardsContainer.addEventListener('input', (e) => {
        if (document.body.classList.contains('sortable-mode')) return;
        if (e.target.matches('.scenario-input')) {
          const card = e.target.closest('.card');
          if (card) {
            if (e.target.dataset.input === 'enemy_atk') {
              // If user types in manual ATK, clear the loaded preset
              if (card.dataset.loadedEnemy) {
                delete card.dataset.loadedEnemy;
              }
            }
            if (e.target.dataset.input === 'is_critical') {
              const critContainer = card.querySelector('.crit-inputs-container');
              critContainer.style.display = e.target.checked ? 'grid' : 'none';
            }
            if (e.target.matches('.scenario-title-input')) {
              card.querySelector('.scenario-title-text').textContent = e.target.value;
            }
            updateScenarioResults(card);
            saveState();
          }
        }
      });

      cardsContainer.addEventListener('change', (e) => {
        if (document.body.classList.contains('sortable-mode')) return;
        if (e.target.matches('.scenario-input[type="checkbox"], select.scenario-input')) {
          const card = e.target.closest('.card');
          if (card) {
            if (e.target.dataset.input === 'is_critical') {
              const critContainer = card.querySelector('.crit-inputs-container');
              if(critContainer) critContainer.style.display = e.target.checked ? 'grid' : 'none';
            }
            updateScenarioResults(card);
            saveState();
          }
        }
      });

      saveEnemyBtn.addEventListener('click', saveEnemy);
      deleteEnemyBtn.addEventListener('click', deleteEnemy);
      clearEnemyFormBtn.addEventListener('click', clearEnemyForm);

      const resetAllDataBtn = document.getElementById('reset-all-data-btn');
      if (resetAllDataBtn) {
        resetAllDataBtn.addEventListener('click', () => {
          if (confirm('全てのデータ（敵・キャラクター・状況）をリセットしますか？\r\nこの操作は元に戻せません。')) {
            localStorage.clear();
            location.reload();
          }
        });
      }

      const updatePresetEnemiesBtn = document.getElementById('update-preset-enemies-btn');
      if (updatePresetEnemiesBtn) {
        updatePresetEnemiesBtn.addEventListener('click', () => {
          if (confirm('敵のデータを最新のプリセットに更新しますか？\r\n\r\n※この操作を行っても、登録した「マイキャラクター」などの設定はそのまま残ります。\r\n※手動で追加した敵は一旦リセットされます。')) {
            let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            state.savedEnemies = JSON.parse(JSON.stringify(DEFAULT_ENEMIES_PRESET));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            alert("敵データを最新のプリセット (" + DEFAULT_ENEMIES_PRESET.length + " イベント) に更新しました！画面を再読み込みします。");
            location.reload();
          }
        });
      }

      addAttackPatternBtn.addEventListener('click', () => {
        addAttackPatternRow();
      });

      newEnemyAttacksContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-attack-btn')) {
          if (newEnemyAttacksContainer.querySelectorAll('.attack-pattern-row').length > 1) {
            e.target.closest('.attack-pattern-row').remove();
          } else {
            alert('最低1つの攻撃パターンが必要です。');
          }
        }
      });

      newEnemyCritDefaultEnabledCheckbox.addEventListener('click', () => {
        newEnemyCritInputsContainer.style.display = newEnemyCritDefaultEnabledCheckbox.checked ? 'grid' : 'none';
      });

      enemyEventTypeList.addEventListener('change', () => updateSeriesList());
      enemySeriesList.addEventListener('change', () => updateStageList());
      enemyStageList.addEventListener('change', () => updateBossList());

      editEnemyBtn.addEventListener('click', () => {
        const selectedValue = enemyBossList.value;
        if (!selectedValue || selectedValue === "-1") {
          alert('編集するボスを選択してください。');
          return;
        }

        const [etIdx, serIdx, stgIdx, bossIdx] = selectedValue.split('_').map(Number);
        const eventType = savedEnemies[etIdx];
        const series = eventType?.series[serIdx];
        const stage = series?.stages[stgIdx];
        const boss = stage?.bosses[bossIdx];

        if (!boss) {
          alert('選択されたボスが見つかりませんでした。');
          return;
        }

        // Populate the form fields
        newEnemyEventTypeInput.value = eventType.eventType;
        newEnemySeriesNameInput.value = series.seriesName;
        newEnemyStageNameInput.value = stage.stageName;
        newEnemyNameInput.value = boss.name;
        newEnemyClassSelect.value = boss.class;
        newEnemyTypeSelect.value = boss.type;
        newEnemyCritAtkInput.value = boss.critAtkUp || '';
        newEnemyCritDefInput.value = boss.critDefDown || '';
        newEnemyCritDefaultEnabledCheckbox.checked = boss.isCriticalDefault || false;
        newEnemyCritInputsContainer.style.display = newEnemyCritDefaultEnabledCheckbox.checked ? 'grid' : 'none';

        // Populate attack patterns
        newEnemyAttacksContainer.innerHTML = ''; // Clear existing rows
        if (boss.attacks && boss.attacks.length > 0) {
          boss.attacks.forEach(attack => addAttackPatternRow(attack));
        } else {
          addAttackPatternRow(); // Add a blank one if none exist
        }

        // Change button text to indicate edit mode
        saveEnemyBtn.textContent = '変更を保存';
      });

      cardsContainer.addEventListener('click', (e) => {
        const target = e.target;
        const card = target.closest('.card');
        if (!card) return;

        // --- Button-specific actions ---
        // Using .closest() is more robust as it handles clicks on child elements of the button
        if (target.closest('.load-enemy-to-card-cascade-btn')) {
          const bossSel = card.querySelector('[data-input="loaded_enemy_boss"]');
          if (!bossSel || bossSel.value === '-1') {
            alert('ボスを選択してください');
            return;
          }
          const [etIdx, serIdx, stgIdx, bossIdx] = bossSel.value.split('_').map(Number);
          const boss = savedEnemies[etIdx]?.series[serIdx]?.stages[stgIdx]?.bosses[bossIdx];
          if (!boss) { alert('ボスが見つかりません'); return; }

          card.dataset.loadedEnemy = JSON.stringify(boss);
          const classSelect = card.querySelector('[data-input="enemy_class"]');
          const typeSelect = card.querySelector('[data-input="enemy_type"]');
          if (classSelect) classSelect.value = boss.class || 'super';
          if (typeSelect) typeSelect.value = boss.type || 'teq';

          // 会心自動設定: hasSaCrit のみで全体会心をONにしないように修正
          const critCheckbox = card.querySelector('[data-input="is_critical"]');
          const hasGlobalCrit = (boss.critHpRate > 0) || (boss.critTurnUp > 0) || (boss.critFixedRate > 0) || (boss.isCriticalDefault && !boss.hasSaCrit);
          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }

          const critAtkInput = card.querySelector('[data-input="crit_atk_up"]');
          const critDefInput = card.querySelector('[data-input="crit_def_down"]');
          if (critAtkInput) critAtkInput.value = boss.critAtkUp || '';
          if (critDefInput) critDefInput.value = boss.critDefDown || '';

          handleModeChange();
          saveState();
          return;
        }
        if (target.closest('.load-enemy-to-card-cascade-btn')) {
          const bossSel = card.querySelector('[data-input="loaded_enemy_boss"]');
          if (!bossSel || bossSel.value === '-1') {
            alert('ボスを選択してください');
            return;
          }
          const [etIdx, serIdx, stgIdx, bossIdx] = bossSel.value.split('_').map(Number);
          const boss = savedEnemies[etIdx]?.series[serIdx]?.stages[stgIdx]?.bosses[bossIdx];
          if (!boss) { alert('ボスが見つかりません'); return; }
          card.dataset.loadedEnemy = JSON.stringify(boss);
          const classSelect = card.querySelector('[data-input="enemy_class"]');
          const typeSelect = card.querySelector('[data-input="enemy_type"]');
          if (classSelect) classSelect.value = boss.class || 'super';
          if (typeSelect) typeSelect.value = boss.type || 'teq';
          const critCheckbox = card.querySelector('[data-input="is_critical"]');
          const hasGlobalCrit = (boss.critHpRate > 0) || (boss.critTurnUp > 0) || (boss.critFixedRate > 0) || (boss.isCriticalDefault && !boss.hasSaCrit);
          if (critCheckbox && hasGlobalCrit) {
            critCheckbox.checked = true;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'grid';
          } else if (critCheckbox) {
            critCheckbox.checked = false;
            const critContainer = card.querySelector('.crit-inputs-container');
            if (critContainer) critContainer.style.display = 'none';
          }
          const critAtkInput = card.querySelector('[data-input="crit_atk_up"]');
          const critDefInput = card.querySelector('[data-input="crit_def_down"]');
          if (critAtkInput) critAtkInput.value = boss.critAtkUp || '';
          if (critDefInput) critDefInput.value = boss.critDefDown || '';
          handleModeChange();
          saveState();
          return;
        }
        if (target.closest('.load-enemy-to-card-btn')) {
          openEnemySelectionModal(card);
          return;
        }
        if (target.closest('.clear-enemy-from-card-btn')) {
          if (card.dataset.loadedEnemy) {
            delete card.dataset.loadedEnemy;
            card.querySelector('[data-input="enemy_class"]').value = 'super';
            card.querySelector('[data-input="enemy_type"]').value = 'teq';
            handleModeChange();
            saveState();
          }
          return;
        }
        if (target.closest('.reset-scenario-btn')) {
          if (confirm('この状況の入力値をリセットしますか？')) {
            if (card.dataset.loadedEnemy) delete card.dataset.loadedEnemy;
            card.querySelector('.crit-inputs-container').style.display = 'none';
            card.querySelectorAll('.scenario-input').forEach(input => {
              if (input.type === 'checkbox') input.checked = false;
              else if (input.dataset.input !== 'scenario_title') input.value = '';
            });
            handleModeChange();
            saveState();
          }
          return;
        }
        if (target.closest('.duplicate-scenario-btn')) {
          const scenarios = getCurrentScenariosData();
          const currentData = scenarios.find(d => d.scenario_title === card.querySelector('.scenario-title-text').textContent);
          if (currentData) {
            const newData = JSON.parse(JSON.stringify(currentData));
            newData.scenario_title = `${newData.scenario_title} (コピー)`;
            addScenarioCard(newData, card);
            saveState();
          }
          return;
        }
        if (target.closest('.delete-scenario-btn')) {
          if (document.querySelectorAll('#scenario-cards-container .card').length > 1) {
            card.remove();
            saveState();
          } else {
            alert('最低1つの状況が必要です。');
          }
          return;
        }
        if (target.closest('.btn-edit-title')) {
          const header = target.closest('.scenario-card-header');
          const input = header.querySelector('.scenario-title-input');
          const text = header.querySelector('.scenario-title-text');
          const commitTitleEdit = () => {
            header.classList.remove('is-editing');
            text.textContent = input.value.trim() || "状況";
            saveState();
            input.removeEventListener('blur', commitTitleEdit);
            input.removeEventListener('keydown', handleKeydown);
          };
          const handleKeydown = (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTitleEdit();
            } else if (event.key === 'Escape') {
              header.classList.remove('is-editing');
              input.removeEventListener('blur', commitTitleEdit);
              input.removeEventListener('keydown', handleKeydown);
            }
          };
          if (!header.classList.contains('is-editing')) {
            header.classList.add('is-editing');
            input.value = text.textContent;
            input.focus();
            input.select();
            input.addEventListener('blur', commitTitleEdit);
            input.addEventListener('keydown', handleKeydown);
          } else {
            commitTitleEdit();
          }
          return;
        }
        if (target.closest('.btn-sort-mode')) {
          toggleSortableMode();
          return;
        }

        // --- Collapsible Header actions (will only be reached if a button was not clicked) ---
        const subHeader = target.closest('.sub-section-header');
        if (subHeader) {
          const body = subHeader.nextElementSibling;
          body.style.display = body.style.display === 'none' ? '' : 'none';
          subHeader.querySelector('.toggle-arrow').classList.toggle('collapsed', body.style.display === 'none');
          return;
        }

        const mainHeader = target.closest('.scenario-card-header');
        if (mainHeader) {
          const body = card.querySelector('.scenario-card-body');
          const arrow = card.querySelector('.toggle-arrow');
          body.classList.toggle('show');
          arrow.classList.toggle('collapsed', !body.classList.contains('show'));
          return;
        }
      });

      linesListContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
          deleteDurabilityLine(parseInt(e.target.dataset.index, 10));
        }
      });
    }

    // --- Initial Load ---
    try {
      loadState();
      setupEventListeners();
      // Initial call to add one attack pattern row to the form
      addAttackPatternRow();
    } catch (e) {
      console.error("Initialization failed", e);
      const errorDiv = document.createElement('div');
      errorDiv.style.position = 'fixed';
      errorDiv.style.top = '0';
      errorDiv.style.left = '0';
      errorDiv.style.width = '100%';
      errorDiv.style.padding = '10px';
      errorDiv.style.backgroundColor = 'red';
      errorDiv.style.color = 'white';
      errorDiv.style.zIndex = '9999';
      errorDiv.textContent = 'エラーが発生しました。ページを再読み込みしてください。 ' + e.message;
      document.body.appendChild(errorDiv);
    }
  }, 0);
});