// scrape_partial_winners.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'partial_winners.json');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TARGETS = [
    { url: 'https://www.lottopcso.com/6-58-lotto-result/', game: 'Ultra Lotto 6/58' },
    { url: 'https://www.lottopcso.com/6-55-lotto-result/', game: 'Grand Lotto 6/55' },
    { url: 'https://www.lottopcso.com/6-49-lotto-result/', game: 'Super Lotto 6/49' },
    { url: 'https://www.lottopcso.com/6-45-lotto-result/', game: 'Mega Lotto 6/45' },
    { url: 'https://www.lottopcso.com/6-42-lotto-result/', game: 'Lotto 6/42' }
];

(async () => {
    console.log("💎 Scraping Partial Winners (Merge Mode)...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    // 1. Load Existing Data
    let currentData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try { currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE)); } 
        catch (e) { currentData = []; }
    }
    const initialCount = currentData.length;
    console.log(`💾 Loaded ${initialCount} existing entries.`);

    const browser = await puppeteer.launch({ 
        headless: "new", 
        executablePath: '/opt/google/chrome/chrome', 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    let newCount = 0;

    try {
        for (const target of TARGETS) {
            process.stdout.write(`🔍 ${target.game}... `);
            try {
                await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await wait(2000);

                const details = await page.evaluate(() => {
                    const data = {};
                    const table = document.querySelector('table.has-fixed-layout');
                    if (!table) return null;

                    // 1. Get Date
                    const th = table.querySelector('thead th:nth-child(2)');
                    if (!th) return null;
                    const d = new Date(th.innerText.trim());
                    if (isNaN(d)) return null;
                    data.date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

                    // 2. Helpers
                    const getValue = (labelText) => {
                        const rows = table.querySelectorAll('tbody tr');
                        for (const row of rows) {
                            if (row.cells[0].innerText.trim().includes(labelText)) {
                                return row.cells[1].innerText.trim();
                            }
                        }
                        return null;
                    };

                    const parseValue = (val) => {
                        if (!val) return { winners: '0', prize: 'N/A' };
                        const match = val.match(/^([\d,]+)\s*\((.+?)\)$/);
                        if (match) return { winners: match[1].replace(/,/g, ''), prize: match[2] };
                        return { winners: val.replace(/,/g, ''), prize: 'N/A' };
                    };

                    // 3. Get Data
                    data.combination = getValue('Winning Combination');
                    data.jackpot_prize = getValue('Jackpot Prize');
                    data.jackpot_winners = getValue('Jackpot Winner');

                    const p2 = getValue('2nd Prize');
                    const p3 = getValue('3rd Prize');
                    const p4 = getValue('4th Prize');

                    data.second = parseValue(p2);
                    data.third = parseValue(p3);
                    data.fourth = parseValue(p4);

                    return data;
                });

                if (details) {
                    // 4. MERGE LOGIC: Check if this Date+Game already exists
                    const exists = currentData.some(i => i.date === details.date && i.game === target.game);
                    
                    if (!exists) {
                        currentData.push({
                            game: target.game,
                            date: details.date,
                            combination: details.combination,
                            jackpot_prize: details.jackpot_prize,
                            jackpot_winners: details.jackpot_winners,
                            winners_2nd: details.second.winners,
                            prize_2nd: details.second.prize,
                            winners_3rd: details.third.winners,
                            prize_3rd: details.third.prize,
                            winners_4th: details.fourth.winners,
                            prize_4th: details.fourth.prize
                        });
                        newCount++;
                        process.stdout.write(`✅ NEW\n`);
                    } else {
                        process.stdout.write(`✔️ Exists\n`);
                    }
                } else {
                    process.stdout.write(`❌ Parse Error\n`);
                }

            } catch (e) {
                process.stdout.write(`❌ Error\n`);
            }
        }

        // 5. Save (Append to end, no sorting/deleting)
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`💾 Done! Added ${newCount} new entries.`);

    } catch (error) {
        console.error("❌ Fatal Error:", error.message);
    } finally {
        await browser.close();
    }
})();
