// scrape_prize.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const TARGET_URL = 'https://www.pcso.gov.ph/default.aspx'; // Switch to homepage for LIVE prizes

(async () => {
    console.log("🚀 SCRAPING LIVE ESTIMATED JACKPOTS...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 60000 });

        const livePrizes = await page.evaluate(() => {
            const results = {};
            
            // These IDs are used for the 'LIVE' jackpot labels on the PCSO homepage
            const mapping = {
                "6/58": "lbl658",
                "6/55": "lbl655",
                "6/49": "lbl649",
                "6/45": "lbl645",
                "6/42": "lbl642"
            };

            for (const [game, id] of Object.entries(mapping)) {
                const element = document.getElementById(id);
                if (element) {
                    results[game] = {
                        prize: element.innerText.trim(),
                        status: "Estimated Next Jackpot"
                    };
                }
            }
            return results;
        });

        if (Object.keys(livePrizes).length > 0) {
            const finalOutput = {
                last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
                prizes: livePrizes
            };

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
            console.log("✅ LIVE prizes captured for banners!");
            console.table(livePrizes);
        } else {
            console.error("❌ Could not find the LIVE jackpot labels.");
        }

    } catch (error) {
        console.error("❌ Live Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
