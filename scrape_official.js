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

const GAMES = [
    { id: '18', name: 'Ultra Lotto 6/58' }, { id: '17', name: 'Grand Lotto 6/55' },
    { id: '1', name: 'Super Lotto 6/49' }, { id: '2', name: 'Mega Lotto 6/45' },
    { id: '13', name: 'Lotto 6/42' }, { id: '5', name: '6D Lotto' },
    { id: '6', name: '4D Lotto' },
    { id: '8', name: '3D Lotto 2PM' }, { id: '9', name: '3D Lotto 5PM' }, { id: '10', name: '3D Lotto 9PM' },
    { id: '15', name: '2D Lotto 2PM' }, { id: '16', name: '2D Lotto 5PM' }, { id: '11', name: '2D Lotto 9PM' }
];

(async () => {
    console.log("🏛️ OFFICIAL SCRAPER (Smart Failsafe)");
    
    // 1. LOAD
    let currentData = [];
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const rawData = fs.readFileSync(OUTPUT_FILE);
            currentData = JSON.parse(rawData);
            console.log(`💾 Loaded ${currentData.length} entries.`);
        } catch (e) { currentData = []; }
    }

    const rawLoadCount = currentData.length;

    // 2. CLEAN GARBAGE
    currentData = currentData.filter(i => i.combination && i.combination.match(/\d/));
    
        // 3. MIGRATE & FIX
    currentData.forEach(i => {
        // Fix Game Names
        if (i.game.includes('11AM')) i.game = i.game.replace('11AM', '2PM');
        if (i.game.includes('4PM')) i.game = i.game.replace('4PM', '5PM');
        
        // Fix Prizes
        if (i.game.includes('3D Lotto')) i.prize = 'P 4,500';
        if (i.game.includes('2D Lotto')) i.prize = 'P 4,000';

        // ==========================================
        // MIGRATE DATE FORMAT (YYYY-MM-DD -> M/D/YYYY)
        // ==========================================
        if (i.date && i.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const parts = i.date.split('-');
            const year = parts[0];
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            i.date = `${month}/${day}/${year}`;
        }
    });

    // 4. DEDUPLICATE
    const map = new Map();
    currentData.forEach(i => map.set(`${i.date}-${i.game}-${i.combination}`, i));
    currentData = Array.from(map.values());
    
    // SET BASELINE AFTER CLEANUP
    const baselineCount = currentData.length;
    if(currentData.length < rawLoadCount) {
        console.log(`🧹 Cleaned ${rawLoadCount - currentData.length} duplicates/garbage.`);
    }
    console.log(`📊 Baseline: ${baselineCount} valid entries.`);

    // 5. SCRAPE
    const browser = await puppeteer.launch({ 
        headless: true, executablePath: '/opt/google/chrome/chrome', 
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
        const toMonth = months[now.getMonth()]; const toYear = now.getFullYear().toString(); const toDay = now.getDate().toString();
        const past = new Date(); past.setDate(past.getDate() - 3);
        const fromMonth = months[past.getMonth()]; const fromYear = past.getFullYear().toString(); const fromDay = past.getDate().toString();

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
                            const combo = cells[1].innerText.trim();
                            if (!combo.match(/\d/)) return; // Skip headers
                            const dateStr = cells[2].innerText.trim();
                            let dateFormatted = dateStr;
                            const parts = dateStr.split('/');
                            if (parts.length === 3) dateFormatted = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
                            items.push({ game: correctName, combination: combo, date: dateFormatted, prize: cells[3].innerText.trim(), winners: cells[4].innerText.trim() });
                        }
                    });
                    return items;
                }, game.name);

                               // --- MERGE LOGIC ---
                results.forEach(item => {
                    // Fix Prize
                    if (item.game.includes('3D Lotto')) item.prize = 'P 4,500';
                    else if (item.game.includes('2D Lotto')) item.prize = 'P 4,000';
                    else if (item.prize === '0' || item.prize === '0.00') item.prize = '₱ TBA';
                    else item.prize = `₱ ${item.prize}`;

                    // Fix Winners
                    if (!item.winners || item.winners === '0') item.winners = 'TBA';

                    const idx = currentData.findIndex(i => i.date === item.date && i.game === item.game && i.combination === item.combination);
                    
                    if (idx === -1) {
                        currentData.push(item);
                        newCount++;
                        console.log(`\n   ✅ NEW`);
                    } else {
                        const existingItem = currentData[idx];
                        
                        // ==========================================
                        // SMART UPDATE LOGIC
                        // ==========================================
                        let needsUpdate = false;

                        // 1. Update Prize if we have TBA in DB
                        if (existingItem.prize === '₱ TBA' && item.prize !== '₱ TBA') {
                            needsUpdate = true;
                        }
                        
                        // 2. UPDATE WINNERS if we have TBA in DB (THE FIX!)
                        if (existingItem.winners === 'TBA' && item.winners !== 'TBA') {
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            currentData[idx] = item;
                            console.log(`\n   🔄 Updated Data`);
                        }
                    }
                });
                process.stdout.write(`✅\n`);
            } catch (e) { console.log(`\n   ❌ Error`); }
        }

        currentData.sort((a, b) => { const getTs = (str) => { const p = str.split('-'); return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]); }; return getTs(b.date) - getTs(a.date); });

        // ==========================================
        // SMART FAILSAFE
        // ==========================================
        const finalCount = currentData.length;

        // Only trigger if we LOST data during the scrape (relative to baseline)
        if (finalCount < baselineCount - 50) {
            console.error("❌ FAILSAFE TRIGGERED!");
            console.error(`❌ Baseline: ${baselineCount}, Final: ${finalCount}.`);
            console.error("❌ DATA LOSS DURING SCRAPE. FILE NOT SAVED.");
            process.exit(1);
        }
        
        // Also fail if we somehow wiped everything
        if (rawLoadCount > 1000 && finalCount < 100) {
             console.error("❌ FAILSAFE: File wiped?");
             process.exit(1);
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Saved. Total: ${finalCount} (Added: ${newCount})`);

    } catch (error) { console.error("❌ Error:", error.message); }

    await browser.close();
})();
