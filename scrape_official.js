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
// 1. FORCE CORRECT NAMES (The Source of Truth)
// ==========================================
// We force the names to match the new standard: 2PM, 5PM, 9PM.
// Even if PCSO website structure changes, these names are used.
const GAMES = [
    { id: '18', name: 'Ultra Lotto 6/58' }, { id: '17', name: 'Grand Lotto 6/55' },
    { id: '1', name: 'Super Lotto 6/49' }, { id: '2', name: 'Mega Lotto 6/45' },
    { id: '13', name: 'Lotto 6/42' }, { id: '5', name: '6D Lotto' },
    { id: '6', name: '4D Lotto' },
    
    // --- DIGIT GAMES FORCED MAPPING ---
    // ID 8 is "11AM" on PCSO -> We force it to "2PM"
    { id: '8', name: '3D Lotto 2PM' }, 
    // ID 9 is "4PM" on PCSO -> We force it to "5PM"
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
    // 2. AUTO-MIGRATION: Fix Old Data
    // ==========================================
    // This runs every time to ensure all old "11AM" entries become "2PM"
    let migrationCount = 0;
    currentData.forEach(item => {
        const originalGame = item.game;
        
        // Replace 11AM -> 2PM
        if (item.game.includes('11AM')) {
            item.game = item.game.replace('11AM', '2PM');
        }
        // Replace 4PM -> 5PM
        if (item.game.includes('4PM')) {
            item.game = item.game.replace('4PM', '5PM');
        }

        if (originalGame !== item.game) migrationCount++;
    });

    if (migrationCount > 0) {
        console.log(`🔄 MIGRATION: Fixed ${migrationCount} entries (11AM->2PM, 4PM->5PM).`);
        
        // De-duplicate after renaming
        const uniqueMap = new Map();
        currentData.forEach(item => {
            const key = `${item.date}-${item.game}-${item.combination}`;
            // Keep the version with Prize info if possible
            if (!uniqueMap.has(key) || (item.prize && item.prize !== '₱ TBA')) {
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
            // Use the FORCED name from our list
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

                // Pass the FORCED name into the browser
                const results = await page.evaluate((correctName) => {
                    const items = [];
                    const table = document.querySelector('#cphContainer_cpContent_GridView1');
                    if (!table) return items;
                    table.querySelectorAll('tr').forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 5) {
                            const game = correctName; // USE THE FORCED NAME
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
                        currentData.push(item);
                        newCount++;
                        console.log(`\n   ✅ NEW: ${item.game} - ${item.combination}`);
                    } else {
                        // Update if we have TBA
                        const existingItem = currentData[existingIndex];
                        if (existingItem.prize === '₱ TBA' || existingItem.winners === 'TBA') {
                            currentData[existingIndex] = item; 
                            console.log(`\n   🔄 UPDATED: ${item.game} - ${item.combination}`);
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

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Done! Added: ${newCount}, Migrated: ${migrationCount}`);

    } catch (error) {
        console.error("❌ Error:", error.message);
    }

    await browser.close();
})();
