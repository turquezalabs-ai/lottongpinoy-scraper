// scrape_partial_winners_history.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'partial_winners_history.json');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TARGETS = [
    { name: 'Ultra Lotto 6/58', baseUrl: 'https://www.lottopcso.com/6-58-lotto-result/' },
    { name: 'Grand Lotto 6/55', baseUrl: 'https://www.lottopcso.com/6-55-lotto-result/' },
    { name: 'Super Lotto 6/49', baseUrl: 'https://www.lottopcso.com/6-49-lotto-result/' },
    { name: 'Mega Lotto 6/45', baseUrl: 'https://www.lottopcso.com/6-45-lotto-result/' },
    { name: 'Lotto 6/42', baseUrl: 'https://www.lottopcso.com/6-42-lotto-result/' }
];

const MAX_PAGES_PER_GAME = 999; 

(async () => {
    console.log("📚 SCRAPING PARTIAL WINNERS (Smart Update Mode)...");

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

    // 1. Load Existing Data (To avoid duplicates)
    let currentData = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            currentData = JSON.parse(fs.readFileSync(OUTPUT_FILE));
            console.log(`💾 Loaded ${currentData.length} existing entries.`);
        } catch (e) { currentData = []; }
    }

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
            console.log(`\n📂 Processing Game: ${target.name}`);
            
            // Set Date Limit (4 Days Ago)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 4);
            cutoffDate.setHours(0,0,0,0);

            for (let pageNum = 1; pageNum <= MAX_PAGES_PER_GAME; pageNum++) {
                let url = pageNum === 1 ? target.baseUrl : `${target.baseUrl}page/${pageNum}/`;
                
                process.stdout.write(`   Page ${pageNum}... `);

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await wait(1000);

                    const pageTitle = await page.title();
                    if (pageTitle.includes('Page not found') || pageTitle.includes('Nothing found')) {
                        process.stdout.write(`⏹️ End of pages.\n`);
                        break; 
                    }

                    const resultsOnPage = await page.evaluate((gameName) => {
                        const items = [];
                        const tables = document.querySelectorAll('table.has-fixed-layout');
                        tables.forEach(table => {
                            const th = table.querySelector('thead th:nth-child(2)');
                            if (!th) return;
                            const d = new Date(th.innerText.trim());
                            if (isNaN(d)) return;
                            const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

                            const getValue = (label) => {
                                const rows = table.querySelectorAll('tbody tr');
                                for (const row of rows) {
                                    if (row.cells[0].innerText.trim().includes(label)) return row.cells[1].innerText.trim();
                                }
                                return null;
                            };
                            const parseValue = (val) => {
                                if (!val) return { winners: '0', prize: 'N/A' };
                                const match = val.match(/^([\d,]+)\s*\((.+?)\)$/);
                                if (match) return { winners: match[1].replace(/,/g, ''), prize: match[2] };
                                return { winners: val.replace(/,/g, ''), prize: 'N/A' };
                            };

                            const p2 = getValue('2nd Prize');
                            const p3 = getValue('3rd Prize');
                            const p4 = getValue('4th Prize');

                            items.push({
                                game: gameName, date: date,
                                combination: getValue('Winning Combination'),
                                jackpot_prize: getValue('Jackpot Prize'),
                                jackpot_winners: getValue('Jackpot Winner'),
                                winners_2nd: parseValue(p2).winners, prize_2nd: parseValue(p2).prize,
                                winners_3rd: parseValue(p3).winners, prize_3rd: parseValue(p3).prize,
                                winners_4th: parseValue(p4).winners, prize_4th: parseValue(p4).prize
                            });
                        });
                        return items;
                    }, target.name);

                    if (resultsOnPage.length === 0) {
                        process.stdout.write(`⏹️ No data found.\n`);
                        break;
                    }

                    // ==========================================
                    // SMART LOGIC (Date Limit + Duplicate Check)
                    // ==========================================
                    let stopLoop = false;

                    for (const item of resultsOnPage) {
                        const itemDate = new Date(item.date);

                        // 1. Check Date Limit
                        if (itemDate < cutoffDate) {
                            process.stdout.write(`🗓️ Reached 4-day limit.\n`);
                            stopLoop = true;
                            break; 
                        }

                        // 2. Check if exists in DB
                        const exists = currentData.some(d => d.game === item.game && d.date === item.date);
                        if (exists) {
                            // We found data we already have. Stop.
                            stopLoop = true;
                            break;
                        }

                        // 3. Add if new
                        currentData.push(item);
                        newCount++;
                    }

                    if (!stopLoop) {
                         process.stdout.write(`✅ Added ${resultsOnPage.length}\n`);
                    } else {
                         break; // Stop the Page Loop
                    }

                } catch (e) {
                    process.stdout.write(`❌ Error: ${e.message}\n`);
                    break; 
                }
            }
        }

        // Sort by Date (Newest First)
        currentData.sort((a, b) => {
            const getTs = str => { const p = str.split('/'); return parseInt(p[2]) * 10000 + parseInt(p[0]) * 100 + parseInt(p[1]); };
            return getTs(b.date) - getTs(a.date);
        });

        // Deduplicate (Safety)
        const map = new Map();
        currentData.forEach(i => map.set(`${i.game}-${i.date}`, i));
        currentData = Array.from(map.values());

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(currentData, null, 2));
        console.log(`\n🎉 UPDATE COMPLETE!`);
        console.log(`💾 Added ${newCount} new entries.`);
        console.log(`📂 Total Size: ${currentData.length}`);

    } catch (error) {
        console.error("❌ Fatal Error:", error.message);
    } finally {
        await browser.close();
    }
})();
