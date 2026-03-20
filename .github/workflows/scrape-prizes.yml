// scrape_prizes.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
const TARGET_URL = 'https://www.pcso.gov.ph/';

(async () => {
    console.log("💎 SCRAPING LIVE JACKPOTS (Carousel Strategy)...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // PRO-TIP: Give the carousel script a moment to "wake up" and fill the spans.
        console.log("⏳ Waiting for carousel data to inject...");
        await page.waitForTimeout(2000);

        const livePrizes = await page.evaluate(() => {
            const results = {};
            
            // MAPPING: Target the Hidden Spans via ID Contains selector
            const mapping = {
                "Ultra Lotto 6/58": "lbl658",
                "Grand Lotto 6/55": "lbl655",
                "Super Lotto 6/49": "lbl649",
                "Mega Lotto 6/45": "lbl645",
                "Lotto 6/42": "lbl642",
                "6D Lotto": "lbl6D",
                "4D Lotto": "lbl4D"
            };

            for (const [gameName, idSuffix] of Object.entries(mapping)) {
                // STRATEGY: Find span where ID contains our target (e.g., id*="lbl655")
                const element = document.querySelector(`span[id*="${idSuffix}"]`);
                
                if (element) {
                    // It works even if hidden (display:none)!
                    let text = element.innerText.trim();
                    results[gameName] = text || "N/A";
                } else {
                    results[gameName] = "Not Found";
                }
            }
            return results;
        });

        const finalOutput = {
            last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
            prizes: livePrizes
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
        console.log("✅ SUCCESS! Live prizes captured from Carousel:");
        console.table(livePrizes);

    } catch (error) {
        console.error("❌ Live Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
