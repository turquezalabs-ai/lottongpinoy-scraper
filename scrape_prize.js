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

    // 1. Ensure Directory and Load Existing Data
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    let masterData = {
        last_updated: "",
        prizes: {}
    };

    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const fileContent = fs.readFileSync(OUTPUT_FILE, 'utf8');
            masterData = JSON.parse(fileContent);
            console.log(`💾 Loaded existing prizes for ${Object.keys(masterData.prizes).length} games.`);
        } catch (e) {
            console.log("⚠️ Could not parse existing JSON, starting fresh.");
        }
    }

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await wait(5000); 

        const scrapedItems = await page.evaluate(() => {
            const results = {};
            const table = document.querySelector('table[id*="gvLottoSearch"]');
            if (!table) return null;

            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length >= 5) {
                    const gameName = cols[0].innerText.trim();
                    const jackpot = cols[3].innerText.trim();
                    const drawDate = cols[2].innerText.trim();

                    // Only capture the very first (top-most) occurrence of each game
                    if (!results[gameName]) {
                        results[gameName] = {
                            prize: jackpot,
                            date: drawDate
                        };
                    }
                }
            });
            return results;
        });

        if (scrapedItems) {
            console.log("🔄 Merging new prizes into master database...");
            
            // 2. MERGE LOGIC: Update or Add new, keep old if not found in current scrape
            for (const [game, info] of Object.entries(scrapedItems)) {
                masterData.prizes[game] = info;
                console.log(`   ✅ Updated ${game}: ${info.prize}`);
            }

            masterData.last_updated = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

            // 3. Save the merged file
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(masterData, null, 4));
            console.log("\n📁 prizes.json successfully merged and saved!");
        } else {
            console.error("❌ Prize table not found on page.");
        }

    } catch (error) {
        console.error("❌ Prize Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
