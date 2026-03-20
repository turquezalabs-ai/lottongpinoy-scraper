// scrape_prize.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const TARGET_URL = 'https://www.pcso.gov.ph/searchlottoresult.aspx';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    console.log("🚀 STARTING PERSISTENT PRIZE SCRAPER (Merge Mode)...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    let masterData = { last_updated: "", prizes: {} };
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            masterData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`💾 Loaded existing prizes for ${Object.keys(masterData.prizes).length} games.`);
        } catch (e) { masterData = { last_updated: "", prizes: {} }; }
    }

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        
        // Increased timeout and changed to 'networkidle0' to wait for all scripts
        await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 90000 });
        
        console.log("⏳ Waiting for the prize table to load...");
        // This is the CRITICAL fix: wait until the table actually exists in the HTML
        await page.waitForSelector('table[id*="gvLottoSearch"]', { timeout: 30000 });
        
        await wait(3000); // Small extra buffer

        const scrapedItems = await page.evaluate(() => {
            const results = {};
            const table = document.querySelector('table[id*="gvLottoSearch"]');
            if (!table) return null;

            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                // In the search table, Game is index 0, Date is index 2, Prize is index 3
                if (cols.length >= 5) {
                    const gameName = cols[0].innerText.trim();
                    const drawDate = cols[2].innerText.trim();
                    const jackpot = cols[3].innerText.trim();

                    // Only take the first (newest) result for each game
                    if (gameName && jackpot && !results[gameName]) {
                        results[gameName] = {
                            prize: jackpot,
                            date: drawDate
                        };
                    }
                }
            });
            return results;
        });

        if (scrapedItems && Object.keys(scrapedItems).length > 0) {
            console.log("🔄 Merging new prizes...");
            for (const [game, info] of Object.entries(scrapedItems)) {
                masterData.prizes[game] = info;
                console.log(`   ✅ ${game}: ${info.prize}`);
            }

            masterData.last_updated = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterData, null, 4));
            console.log("\n📁 prizes.json successfully merged!");
        } else {
            console.error("❌ Table found, but it was empty or could not be parsed.");
        }

    } catch (error) {
        console.error("❌ Prize Scrape Failed:", error.message);
        // Take a screenshot on failure to see what went wrong (viewable in GitHub artifacts)
        await page.screenshot({ path: 'error_screenshot.png' });
    } finally {
        await browser.close();
    }
})();
