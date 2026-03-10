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

        // --- HTML TABLE PARSER ---
        const items = await page.evaluate(() => {
            const results = [];
            const tables = document.querySelectorAll('table.has-fixed-layout');

            tables.forEach(table => {
                const th = table.querySelector('thead th');
                if (!th) return;
                
                let gameName = th.innerText.trim();
                
                // 1. NORMALIZE NAMES
                if (gameName.includes('Swertres')) gameName = '3D Lotto';
                if (gameName.includes('EZ2')) gameName = '2D Lotto';

                // 2. STRICT WHITELIST
                // Only scrape if EXACTLY "2D Lotto" or "3D Lotto".
                // This prevents 6D, 4D, 6/55 etc from ever entering this scraper.
                if (gameName !== '2D Lotto' && gameName !== '3D Lotto') {
                    return; 
                }
                
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

                    let timeRaw = col1; 
                    let numbers = col2.replace(/\s/g, '-');
                    let normalizedTime = timeRaw.replace(':00', '').replace(' ', '');
                    const finalGame = `${gameName} ${normalizedTime}`;

                    // --- SET FIXED PRIZES (Format: P X,XXX) ---
                    let defaultPrize = '₱ TBA';
                    if (gameName === '3D Lotto') {
                        defaultPrize = 'P 4,500';
                    } else if (gameName === '2D Lotto') {
                        defaultPrize = 'P 4,000';
                    }

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
                // Update if prize was TBA or wrong
                const existingItem = currentData[existingIndex];
                if (existingItem.prize !== item.prize) {
                    currentData[existingIndex].prize = item.prize;
                    console.log(`   🔄 FIXED PRIZE: ${item.game} -> ${item.prize}`);
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
