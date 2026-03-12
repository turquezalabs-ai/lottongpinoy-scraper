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
    console.log("🏛️ OFFICIAL SCRAPER (Validation Mode)");
    
    // 1. Load
    let currentData = [];
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    if (fs.existsSync(OUTPUT_FILE)) {
        try { currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE)); } 
        catch (e) { currentData = []; }
    }
    const rawCount = currentData.length;
    console.log(`💾 Loaded ${rawCount} raw entries.`);

    // 2. Clean ONLY Garbage (Headers)
    currentData = currentData.filter(i => i.combination && i.combination.match(/\d/));

    // 3. Migrate Labels (Align 11AM->2PM, 4PM->5PM)
    currentData.forEach(i => {
        if (i.game.includes('11AM')) i.game = i.game.replace('11AM', '2PM');
        if (i.game.includes('4PM')) i.game = i.game.replace('4PM', '5PM');
        if (i.game.includes('3D Lotto')) i.prize = 'P 4,500.00';
        if (i.game.includes('2D Lotto')) i.prize = 'P 4,000.00';
    });

    // 4. SET BASELINE (AFTER Cleaning!)
    const initialCount = currentData.length;
    console.log(`📊 Baseline set to ${initialCount} valid entries.`);

    // 5. Scrape
    const browser = await puppeteer.launch({ 
        headless: true, executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    let updatedCount = 0;

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
                            if (!combo.match(/\d/)) return;
                            const dateStr = cells[2].innerText.trim();
                            let dateFormatted = dateStr;
                            const parts = dateStr.split('/');
                            if (parts.length === 3) dateFormatted = `${parseInt(parts[0])}/${parseInt(parts[1])}/${parts[2]}`;
                            
                            items.push({
                                game: correctName, combination: combo, date: dateFormatted,
                                prize: cells[3].innerText.trim(), winners: cells[4].innerText.trim()
                            });
                        }
                    });
                    return items;
                }, game.name);

                results.forEach(item => {
                    // Fix Prizes
                    if (item.game.includes('3D Lotto')) item.prize = 'P 4,500.00';
                    else if (item.game.includes('2D Lotto')) item.prize = 'P 4,000.00';
                    else if (item.prize === '0' || item.prize === '0.00') item.prize = '₱ TBA';
                    else item.prize = `₱ ${item.prize}`;
                    
                    if (!item.winners || item.winners === '') item.winners = '0';

                    // NORMALIZE COMBINATION (Match Real-Time Scraper)
                    item.combination = item.combination.replace(/\s/g, '-');

                    const idx = currentData.findIndex(i => i.date === item.date && i.game === item.game && i.combination === item.combination);
                    
                    if (idx === -1) {
                        currentData.push(item); // Add if new
                    } else {
                        // UPDATE: If DB has "TBA" and New has valid data
                        const oldItem = currentData[idx];
                        if (oldItem.winners === 'TBA' && item.winners !== 'TBA') {
                            currentData[idx] = item; // Replace with better data
                            updatedCount++;
                        }
                    }
                });
                process.stdout.write(`✅\n`);
            } catch (e) { console.log(`\n   ❌ Error`); }
        }

        // 6. Final Failsafe
        if (currentData.length < initialCount - 10) {
            console.error("❌ FAILSAFE: Data loss detected. Aborting save.");
            return;
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Done! Updated: ${updatedCount}`);

    } catch (error) { console.error("❌ Error:", error.message); }

    await browser.close();
})();
