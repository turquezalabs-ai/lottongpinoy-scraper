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
    
    // 1. Load Data
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
        await wait(4000); // Wait for tables to render

        // --- PARSER: Targeting the specific HTML snippet provided ---
        const items = await page.evaluate(() => {
            const results = [];
            
            // Select all tables with the specific class
            const tables = document.querySelectorAll('table.has-fixed-layout');

            tables.forEach(table => {
                // 1. Get Game Name (from <thead> <th>)
                const th = table.querySelector('thead th');
                if (!th) return;
                
                let gameName = th.innerText.trim();
                
                // Normalize Names
                if (gameName.includes('Swertres')) gameName = '3D Lotto';
                if (gameName.includes('EZ2')) gameName = '2D Lotto';

                // STRATEGY: Only Real-Time scrape 2D and 3D.
                if (gameName !== '2D Lotto' && gameName !== '3D Lotto') {
                    return; // Skip other games
                }
                
                // 2. Get Date (from 2nd <th>)
                const ths = table.querySelectorAll('thead th');
                let dateStr = ths.length > 1 ? ths[1].innerText.trim() : '';
                let dateFormatted = dateStr;
                const dateParts = new Date(dateStr);
                if (!isNaN(dateParts)) dateFormatted = dateParts.toISOString().split('T')[0];

                // 3. Get Rows (from <tbody> <tr>)
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 2) return;

                    const col1 = cells[0].innerText.trim(); // Time
                    const col2 = cells[1].innerText.trim(); // Numbers

                    // FILTER: Ignore rows that are not Times (e.g. "First Prize")
                    if (!col1.match(/\d/) || col1.includes('Prize') || col1.includes('Winner')) return;

                    let timeRaw = col1; 
                    let numbers = col2.replace(/\s/g, '-');

                    // Normalize Time: "2:00 PM" -> "2PM"
                    let normalizedTime = timeRaw.replace(':00', '').replace(' ', '');

                    const finalGame = `${gameName} ${normalizedTime}`;

                    // SET FIXED PRIZES
                    let defaultPrize = '₱ TBA';
                    if (gameName === '3D Lotto') defaultPrize = 'P 4,500';
                    if (gameName === '2D Lotto') defaultPrize = 'P 4,000';

                    results.push({
                        game: finalGame,
                        combination: numbers,
                        prize: defaultPrize,
                        winners: 'TBA',
                        date: dateFormatted
                    });
                });
            });

            return results;
        });

        console.log(`🔍 Found ${items.length} potential results.`);

        // --- MERGE LOGIC ---
        items.forEach(item => {
            const existingIndex = currentData.findIndex(i => 
                i.date === item.date && 
                i.game === item.game && 
                i.combination === item.combination
            );

            if (existingIndex === -1) {
                currentData.push(item);
                newCount++;
                console.log(`   ✅ NEW: ${item.game} - ${item.combination}`);
            } else {
                // Update Prize if it was TBA
                const existingItem = currentData[existingIndex];
                if (existingItem.prize !== item.prize) {
                    currentData[existingIndex].prize = item.prize;
                    console.log(`   🔄 FIXED PRIZE: ${item.game}`);
                }
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
