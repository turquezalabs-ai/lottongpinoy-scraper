// scrape_prizes.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prizes.json');
// We use the mobile view page often, it's lighter. Or default.
const TARGET_URL = 'https://www.pcso.gov.ph/';

(async () => {
    console.log("💎 SCRAPING LIVE ESTIMATED JACKPOTS...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    try {
        console.log(`🌐 Navigating to PCSO Homepage...`);
        // Use domcontentloaded for speed
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for the prize labels to appear
        await page.waitForSelector('span[id*="lbl"]', { timeout: 10000 });

        const livePrizes = await page.evaluate(() => {
            const results = {};
            
            // ROBUST MAPPING: 
            // Uses [id*="lbl658"] which means "ID contains lbl658".
            // This works even if ASP.NET adds prefixes like "ct100_body_lbl658".
            const mapping = {
                "Ultra Lotto 6/58": "lbl658",
                "Grand Lotto 6/55": "lbl655",
                "Super Lotto 6/49": "lbl649",
                "Mega Lotto 6/45": "lbl645",
                "Lotto 6/42": "lbl642"
            };

            for (const [gameName, idSuffix] of Object.entries(mapping)) {
                // Find the element containing the ID suffix
                const element = document.querySelector(`span[id*="${idSuffix}"]`);
                
                if (element) {
                    let text = element.innerText.trim();
                    // Clean up text (remove "P" or weird spaces if needed)
                    results[gameName] = text;
                } else {
                    results[gameName] = "Not Found";
                }
            }
            return results;
        });

        // Prepare Final Output
        const finalOutput = {
            last_updated: new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
            prizes: livePrizes
        };

        // Save to file
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalOutput, null, 4));
        console.log("✅ SUCCESS! Live prizes captured:");
        console.table(livePrizes);

    } catch (error) {
        console.error("❌ Live Scrape Failed:", error.message);
    } finally {
        await browser.close();
    }
})();
