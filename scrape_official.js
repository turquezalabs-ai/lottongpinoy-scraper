// scrape_official.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const https = require('https');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const LIVE_DATA_URL = 'https://lottong-pinoy.com/results.json';
const PCSO_URL = 'https://www.pcso.gov.ph/SearchLottoResult.aspx';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// 1. FORCE CORRECT NAMES
// ==========================================
const GAMES = [
    { id: '18', name: 'Ultra Lotto 6/58' }, { id: '17', name:Grand Lotto 6/55' },
    { id: '1', name: 'Super Lotto 6/49' }, { id: '2', name: 'Mega Lotto 6/45' },
    { id: '13', name: 'Lotto 6/42' }, { id: '5', name: '6D Lotto' },
    { id: '6', name: '4D Lotto' },
    
    // FORCED MAPPING
    { id: '8', name: '3D Lotto 2PM' }, 
    { id: '9', name: '3D Lotto 5PM' }, 
    { id: '10', name: '3D Lotto 9PM' },
    
    { id: '15', name: '2D Lotto 2PM' }, 
    { id: '16', name: '2D Lotto 5PM' }, 
    { id: '11', name: '2D Lotto 9PM' }
];

async function fetchExistingData(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve([]); }});
        }).on('error', () => resolve([]));
    });
}

// ==========================================
// SMART CLEANUP FUNCTION
// ==========================================
function cleanItem(item) {
    // 1. Normalize Prize strings (remove K, etc)
    let prize = item.prize.replace('₱', '').trim();
    
    // 2. FIX FIXED PRIZES (2D/3D)
    if (item.game.includes('3D Lotto')) {
        item.prize = '₱ 4,500.00';
        return; // Stop here, force value
    }
    if (item.game.includes('2D Lotto')) {
        item.prize = '₱ 4,000.00';
        return; // Stop here, force value
    }

    // 3. FIX MAJOR GAMES (6/58, 6D, 4D, etc)
    // If prize is 0, 0.00, empty, or "TBA" -> Set to TBA (We don't know the Jackpot)
    const isZero = prize === '0' || prize === '0.00';
    const isEmpty = !prize || prize === '';
    
    if (isZero || isEmpty) {
        item.prize = '₱ TBA';
    } else {
        // Restore peso sign
        item.prize = `₱ ${prize}`;
    }

    // 4. FIX WINNERS
    if (!item.winners || item.winners === '0' || item.winners.trim() === '') {
        item.winners = 'TBA';
    }
}

(async () => {
    console.log("🏛️ Starting OFFICIAL PCSO Scraper...");
    
    let currentData = await fetchExistingData(LIVE_DATA_URL);
    const initialCount = currentData.length;
    console.log(`💾 Loaded ${initialCount} existing entries.`);

    if (initialCount === 0) {
        console.error("❌ FAILSAFE: No data loaded. Aborting.");
        return;
    }

    // ==========================================
    // 2. AUTO-MIGRATION: Fix Old Labels
    // ==========================================
    let migrationCount = 0;
    currentData.forEach(item => {
        const originalGame = item.game;
        
        if (item.game.includes('11AM')) item.game = item.game.replace('11AM', '2PM');
        if (item.game.includes('4PM')) item.game = item.game.replace('4PM', '5PM');

        if (originalGame !== item.game) migrationCount++;
    });

    if (migrationCount > 0) {
        console.log(`🔄 MIGRATION: Fixed ${migrationCount} entries (11AM->2PM, 4PM->5PM).`);
        
        const uniqueMap = new Map();
        currentData.forEach(item => {
            const key = `${item.date}-${item.game}-${item.combination}`;
            // Prefer the one with good prize data
            if (!uniqueMap.has(key) || (item.prize && !item.prize.includes('TBA'))) {
                uniqueMap.set(key, item);
            }
        });
        currentData = Array.from(uniqueMap.values());
        console.log(`💾 Merged duplicates. New size: ${currentData.length}.`);
    }

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: true,
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    let newCount = 0;

    try {
        await page.goto(PCSO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const now = new Date();
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const toMonth = months[now.getMonth()];
        const toYear = now.getFullYear().toString();
        const toDay = now.getDate().toString();

        const past = new Date();
        past.setDate(past.getDate() - 3);
        const fromMonth = months[past.getMonth()];
        const fromYear = past.getFullYear().toString();
        const fromDay = past.getDate().toString();

        for (const game of GAMES) {
            process.stdout.write(`🔍 ${game.name}... `);
            try {
                await page.select('#cphContainer_cpContent_ddlStartMonth', fromMonth);
                await page.select('#cphContainer_cpContent_ddlStartYear', fromYear);
                await page.select('#cphContainer_cpContent_ddlStartDate', fromDay);

                await page.select('#cphContainer_cpContent_ddlEndMonth', toMonth);
                await page.select('#cphContainer_cpContent_ddlEndYear', toYear);
                await page.select('#cphContainer_cpContent_ddlEndDay', toDay);

                await page.select('#cphContainer_cpContent_ddlSelectGame', game.id);
                await page.evaluate(() => document.querySelector('#cphContainer_cpContent_btnSearch').click());
                await wait(3000);

                const results = await page.evaluate((correctName) => {
                    const items = [];
                    const table = document.querySelector('#cphContainer_cpContent_GridView1');
                    if (!table) return items;
                    table.querySelectorAll('tr').forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 5) {
                            const game = correctName;
                            const combo = cells[1].innerText.trim();
                            const dateStr = cells[2].innerText.trim();
                            const prize = cells[3].innerText.trim();
                            const winners = cells[4].innerText.trim();
                            let dateFormatted = dateStr;
                            const parts = dateStr.split('/');
                            if (parts.length === 3) dateFormatted = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
                            items.push({ date: dateFormatted, game, combination: combo, prize: `₱ ${prize}`, winners });
                        }
                    });
                    return items;
                }, game.name);

                // --- MERGE LOGIC ---
                results.forEach(item => {
                    const existingIndex = currentData.findIndex(i => 
                        i.date === item.date && 
                        i.game === item.game && 
                        i.combination === item.combination
                    );

                    if (existingIndex === -1) {
                        // NEW ITEM: Clean it before adding
                        cleanItem(item);
                        currentData.push(item);
                        newCount++;
                        console.log(`\n   ✅ NEW: ${item.game} - ${item.combination}`);
                    } else {
                        // EXISTING ITEM: Clean the incoming data
                        cleanItem(item);
                        
                        // Update if our new data is better
                        const existingItem = currentData[existingIndex];
                        const isBetterPrize = item.prize !== '₱ TBA' && existingItem.prize === '₱ TBA';
                        const isBetterWinner = item.winners !== 'TBA' && existingItem.winners === 'TBA';

                        if (isBetterPrize || isBetterWinner) {
                             currentData[existingIndex] = item; 
                             console.log(`\n   🔄 UPDATED: ${item.game}`);
                        }
                    }
                });
                process.stdout.write(`✅\n`);
            } catch (e) {
                console.log(`❌ Error\n`);
            }
        }

        currentData.sort((a, b) => {
            const getTs = (str) => { const p = str.split('-'); return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]); };
            return getTs(b.date) - getTs(a.date);
        });

        // ==========================================
        // FINAL GLOBAL CLEANUP (Safety Pass)
        // ==========================================
        console.log("🛠️ Running Final Data Sanitization...");
        let fixCount = 0;
        currentData.forEach(item => {
            const oldPrize = item.prize;
            cleanItem(item);
            if (oldPrize !== item.prize) fixCount++;
        });
        if (fixCount > 0) console.log(`🛠️ Fixed ${fixCount} prize formatting issues.`);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Done! Added: ${newCount}, Migrated: ${migrationCount}`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    }

    await browser.close();
})();
