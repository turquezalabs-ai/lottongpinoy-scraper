// sniff_jackpot.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'jackpot_estimates.json');
const TARGET_URL = 'https://www.pcso.gov.ph/';

(async () => {
    console.log("🕵️ SNIFFING JACKPOT DATA...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // STEAL THE VARIABLE
        const jackpotData = await page.evaluate(() => {
            // Check if the variable exists
            if (window.jackpotestimate) {
                return window.jackpotestimate;
            }
            return null;
        });

        if (jackpotData) {
            console.log("✅ DATA FOUND!");
            console.log("📋 Structure of first item:", jackpotData[0]); // Let's see what keys it has

            // Filter valid items (where dateremoved is empty)
            const activeItems = jackpotData.filter(i => !i.dateremoved || i.dateremoved === "");

            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(activeItems, null, 2));
            console.log(`💾 Saved ${activeItems.length} active estimates to ${OUTPUT_FILE}`);
        } else {
            console.log("❌ Variable 'jackpotestimate' not found.");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    } finally {
        await browser.close();
    }
})();
