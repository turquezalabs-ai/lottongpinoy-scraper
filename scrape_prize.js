const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const TARGET_URL = 'https://www.pcso.gov.ph/default.aspx';

(async () => {
    console.log("🚀 SCRAPING FRESH ROLLING JACKPOTS...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to Homepage...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for one of the jackpot labels to ensure the ticker has loaded
        await page.waitForSelector('#lbl649', { timeout: 20000 });

        const freshPrizes = await page.evaluate(() => {
            const results = {};
            const mapping = {
                "6/58": "lbl658",
                "6/55": "lbl655",
                "6/49": "lbl649",
                "6/45": "lbl645",
                "6/42": "lbl642",
                "6D": "lbl6D",
                "4D": "lbl6D" // Note: 4D sometimes shares a container or ID lbl4D
            };

            for (const [game, id] of Object.entries(mapping)) {
                const el = document.getElementById(id);
                if (el && el.innerText.trim() !== "") {
                    results[game] = {
                        prize: el.innerText.trim(),
                        type: "Fresh/Rolling"
                    };
                }
            }
            return results;
        });

        if (Object.keys(freshPrizes).length > 0) {
            const finalOutput = {
                last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
                prizes: freshPrizes
            };

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
            console.log("✅ FRESH prizes captured for TRQZLABS banners!");
            console.table(freshPrizes);
        } else {
            console.error("❌ Failed to find rolling jackpot labels.");
        }

    } catch (error) {
        console.error("❌ Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
