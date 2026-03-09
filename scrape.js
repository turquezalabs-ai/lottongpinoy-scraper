// scrape.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const TARGET_URL = 'https://www.lottopcso.com/';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const SAFETY_THRESHOLD = 5000;

(async () => {
    console.log("⚡ REAL-TIME SCRAPER STARTED");
    
    let currentData = [];
    
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const rawData = fs.readFileSync(OUTPUT_FILE);
            currentData = JSON.parse(rawData);
            console.log(`💾 Loaded ${currentData.length} entries from Local Repo.`);
        } catch (e) {
            console.log("⚠️ Error reading local file. Starting fresh.");
            currentData = [];
        }
    } else {
        console.log("⚠️ No local data file found. Starting fresh.");
    }

    const initialCount = currentData.length;

    // FAILSAFE
    if (initialCount > 0 && initialCount < SAFETY_THRESHOLD) {
        console.error(`❌ FAILSAFE TRIGGERED: Database size is ${initialCount}.`);
        console.error("❌ Restore backup.");
        process.exit(1); 
    }
    if (initialCount === 0) console.warn("⚠️ WARNING: No data loaded.");

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage' 
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    let newCount = 0;

    try {
        console.log(`🌐 Navigating to ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(4000);

        // --- HTML TABLE PARSER (No Time Mapping) ---
        const items = await page.evaluate(() => {
            const results = [];
            const tables = document.querySelectorAll('table.has-fixed-layout');

            tables.forEach(table => {
                const th = table.querySelector('thead th');
                if (!th) return;
                
                                let gameName = th.innerText.trim();
                
                // STRATEGY: Only Real-Time scrape 2D and 3D.
                // Skip 4D, 6D, and Major games (let Official Scraper handle them).
                if (!gameName.includes('2D Lotto') && !gameName.includes('3D Lotto')) {
                    return; // Skip this table
                }
                if (gameName.includes('Swertres')) gameName = '3D Lotto';
                if (gameName.includes('EZ2')) gameName = '2D Lotto';
                
                const ths = table.querySelectorAll('thead th');
                let dateStr = ths.length > 1 ? ths[1].innerText.trim() : '';
                let dateFormatted = dateStr;
                const dateParts = new Date(dateStr);
                if (!isNaN(dateParts)) dateFormatted = dateParts.toISOString().split('T')[0];

                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 2) return;

                    const col1 = cells[0].innerText.trim();
                    const col2 = cells[1].innerText.trim();

                    if (col1.includes('Prize') || col1.includes('Winner')) return;
                    const isNumbers = /(\d{1,2}[-\s]\d{1,2})/.test(col2);
                    if (!isNumbers) return;

                    let timeRaw = col1; // e.g., "2:00 PM"
                    let numbers = col2.replace(/\s/g, '-');

                    // --- KEEP ORIGINAL TIMES (2PM / 5PM) ---
                    // Convert "2:00 PM" -> "2PM"
                    let normalizedTime = timeRaw.replace(':00', '').replace(' ', '');

                    const finalGame = `${gameName} ${normalizedTime}`;

                    results.push({
                        game: finalGame,
                        combination: numbers,
                        prize: '₱ TBA',
                        winners: 'TBA',
                        date: dateFormatted
                    });
                });
            });

            return results;
        });

        console.log(`🔍 Found ${items.length} potential results.`);

        items.forEach(item => {
            const exists = currentData.some(i => 
                i.date === item.date && 
                i.game === item.game && 
                i.combination === item.combination
            );

            if (!exists) {
                currentData.push(item);
                newCount++;
                console.log(`   ✅ NEW: ${item.game} - ${item.combination}`);
            }
        });

        currentData.sort((a, b) => {
            const getTs = (str) => {
                const parts = str.split('-');
                return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
            };
            return getTs(b.date) - getTs(a.date);
        });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Database updated. Size: ${currentData.length} entries. (New: ${newCount})`);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }

    await browser.close();
})();
