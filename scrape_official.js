// scrape_official.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const PCSO_URL = 'https://www.pcso.gov.ph/SearchLottoResult.aspx';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// GAMES
const GAMES = [
    { id: '18', name: 'Ultra Lotto 6/58' }, { id: '17', name: 'Grand Lotto 6/55' },
    { id: '1', name: 'Super Lotto 6/49' }, { id: '2', name: 'Mega Lotto 6/45' },
    { id: '13', name: 'Lotto 6/42' }, { id: '5', name: '6D Lotto' },
    { id: '6', name: '4D Lotto' },
    { id: '8', name: '3D Lotto 2PM' }, { id: '9', name: '3D Lotto 5PM' }, { id: '10', name: '3D Lotto 9PM' },
    { id: '15', name: '2D Lotto 2PM' }, { id: '16', name: '2D Lotto 5PM' }, { id: '11', name: '2D Lotto 9PM' }
];

// HELPER: Clean Data
function cleanItem(item) {
    // 1. DELETE GARBAGE (WinningCombination)
    if (item.combination.includes('Combination') || item.combination.includes('Winning') || !item.combination.match(/\d/)) {
        return false; // Mark for deletion
    }

    // 2. FIX PRIZES
    let prize = item.prize.replace('₱', '').trim();
    
    if (item.game.includes('3D Lotto')) {
        item.prize = 'P 4,500';
        return true;
    }
    if (item.game.includes('2D Lotto')) {
        item.prize = 'P 4,000';
        return true;
    }

    // Major Games
    const isZero = prize === '0' || prize === '0.00';
    const isEmpty = !prize || prize === '';
    if (isZero || isEmpty) item.prize = '₱ TBA';
    else item.prize = `₱ ${prize}`;

    // 3. FIX WINNERS
    if (!item.winners || item.winners === '0' || item.winners.trim() === '') item.winners = 'TBA';

    return true;
}

(async () => {
    console.log("🏛️ OFFICIAL SCRAPER STARTED");
    
    // 1. LOAD LOCAL
    let currentData = [];
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const rawData = fs.readFileSync(OUTPUT_FILE);
            currentData = JSON.parse(rawData);
            console.log(`💾 Loaded ${currentData.length} entries.`);
        } catch (e) { console.log("⚠️ Error reading file."); currentData = []; }
    }

    // 2. CLEAN EXISTING DATA (Remove WinningCombination)
    const oldSize = currentData.length;
    currentData = currentData.filter(item => cleanItem(item));
    if (currentData.length < oldSize) console.log(`🗑️ Removed ${oldSize - currentData.length} garbage entries.`);

    // 3. MIGRATION (Fix Time Labels)
    currentData.forEach(item => {
        if (item.game.includes('11AM')) item.game = item.game.replace('11AM', '2PM');
        if (item.game.includes('4PM')) item.game = item.game.replace('4PM', '5PM');
    });

    // Deduplicate
    const map = new Map();
    currentData.forEach(item => {
        const key = `${item.date}-${item.game}-${item.combination}`;
        if (!map.has(key) || (item.prize && !item.prize.includes('TBA'))) map.set(key, item);
    });
    currentData = Array.from(map.values());
    console.log(`💾 Cleaned size: ${currentData.length}.`);

    // 4. SCRAPE
    const browser = await puppeteer.launch({ 
        headless: true,
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    let newCount = 0;

    try {
        await page.goto(PCSO_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('#cphContainer_cpContent_ddlStartMonth', { timeout: 10000 });

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
                await wait(4000);

                const results = await page.evaluate((correctName) => {
                    const items = [];
                    const table = document.querySelector('#cphContainer_cpContent_GridView1');
                    if (!table) return items;
                    table.querySelectorAll('tr').forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 5) {
                            items.push({
                                game: correctName,
                                combination: cells[1].innerText.trim(),
                                date: cells[2].innerText.trim(),
                                prize: cells[3].innerText.trim(),
                                winners: cells[4].innerText.trim()
                            });
                        }
                    });
                    return items;
                }, game.name);

                results.forEach(item => {
                    // Format Date
                    const parts = item.date.split('/');
                    if (parts.length === 3) item.date = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
                    item.prize = `₱ ${item.prize}`;

                    // Clean and Check if valid
                    if (!cleanItem(item)) return; // Skip garbage

                    const idx = currentData.findIndex(i => i.date === item.date && i.game === item.game && i.combination === item.combination);
                    
                    if (idx === -1) {
                        currentData.push(item);
                        newCount++;
                        console.log(`\n   ✅ NEW: ${item.game}`);
                    } else {
                        const old = currentData[idx];
                        if (old.prize === '₱ TBA' && item.prize !== '₱ TBA') {
                            currentData[idx] = item;
                            console.log(`\n   🔄 UPDATED Prize`);
                        }
                    }
                });
                process.stdout.write(`✅\n`);
            } catch (e) { console.log(`\n   ❌ Error: ${e.message}`); }
        }

        // Sort
        currentData.sort((a, b) => {
            const getTs = (str) => { const p = str.split('-'); return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]); };
            return getTs(b.date) - getTs(a.date);
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Done! Added: ${newCount}`);

    } catch (error) { console.error("❌ Error:", error.message); }

    await browser.close();
})();
