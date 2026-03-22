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
    console.log("⚡ REAL-TIME SCRAPER");
    
    // 1. Load Local Data
    let currentData = [];
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE));
            console.log(`💾 Loaded ${currentData.length} entries.`);
        } catch (e) { currentData = []; }
    }

    const initialCount = currentData.length;

    // FAILSAFE: Abort if database is suspiciously small
    if (initialCount > 0 && initialCount < SAFETY_THRESHOLD) {
        console.error("❌ FAILSAFE: Database too small. Aborting.");
        process.exit(1);
    }

    const browser = await puppeteer.launch({ 
        headless: "new", executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    let newCount = 0;

    try {
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await wait(4000);

        const items = await page.evaluate(() => {
            const results = [];
            const tables = document.querySelectorAll('table.has-fixed-layout');

            tables.forEach(table => {
                const th = table.querySelector('thead th');
                if (!th) return;
                
                let gameName = th.innerText.trim();
                if (gameName.includes('Swertres')) gameName = '3D Lotto';
                if (gameName.includes('EZ2')) gameName = '2D Lotto';

                // STRICT: Only 2D and 3D
                if (gameName !== '2D Lotto' && gameName !== '3D Lotto') return;
                
                // Get Date
                const ths = table.querySelectorAll('thead th');
                let dateStr = ths.length > 1 ? ths[1].innerText.trim() : '';
                const d = new Date(dateStr);
                if (isNaN(d)) return;
                const dateFormatted = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

                // Get Rows
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 2) return;

                    const timeRaw = cells[0].innerText.trim();
                    const combo = cells[1].innerText.trim();

                    // Filter Garbage
                    if (!timeRaw.match(/\d/) || !combo.match(/\d/)) return;

                    let normalizedTime = timeRaw.replace(':00', '').replace(' ', ''); // "2PM"
                    const finalGame = `${gameName} ${normalizedTime}`;

                    results.push({
                        game: finalGame,
                        combination: combo.replace(/\s/g, '-'),
                        prize: gameName === '3D Lotto' ? 'P 4,500.00' : 'P 4,000.00',
                        winners: 'TBA', 
                        date: dateFormatted
                    });
                });
            });
            return results;
        });

        // MERGE: Only Add New, Never Delete
        items.forEach(item => {
            const exists = currentData.some(i => i.date === item.date && i.game === item.game && i.combination === item.combination);
            if (!exists) {
                currentData.push(item);
                newCount++;
                console.log(`   ✅ NEW: ${item.game}`);
            }
        });

        // FAILSAFE CHECK 2
        if (currentData.length < initialCount - 10) {
            console.error("❌ FAILSAFE: Data lost during processing. File not saved.");
            process.exit(1);
        }

        // ==========================================
        // COPYRIGHT TRAP (Watermark)
        // ==========================================
        // Check if trap exists to avoid duplicates, otherwise add it.
        const hasTrap = currentData.some(i => i.game === "COPYRIGHT © LOTTO NG PINOY");
        if (!hasTrap) {
            currentData.push({
                game: "COPYRIGHT © LOTTO NG PINOY",
                combination: "THIS-DATA-IS-STOLEN",
                date: "12/31/2099",
                prize: "LEGAL ACTION WILL BE TAKEN",
                winners: "0"
            });
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Done. Added: ${newCount}`);

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }

    await browser.close();
})();
