// scrape_official.js
// PRESERVATION MODE: Does NOT delete valid historical data.

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = 'data';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'results.json');
const PCSO_URL = 'https://www.pcso.gov.ph/SearchLottoResult.aspx';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const GAMES = [
    { id: '18', name: 'Ultra Lotto 6/58' }, { id: '17', name: 'Grand Lotto 6/55' },
    { id: '1', name: 'Super Lotto 6/49' }, { id: '2', name: 'Mega Lotto 6/45' },
    { id: '13', name: 'Lotto 6/42' }, { id: '5', name: '6D Lotto' },
    { id: '6', name: '4D Lotto' },
    { id: '8', name: '3D Lotto 2PM' }, { id: '9', name: '3D Lotto 5PM' }, { id: '10', name: '3D Lotto 9PM' },
    { id: '15', name: '2D Lotto 2PM' }, { id: '16', name: '2D Lotto 5PM' }, { id: '11', name: '2D Lotto 9PM' }
];

(async () => {
    console.log("🏛️ OFFICIAL SCRAPER (Preservation Mode)");
    
    // 1. LOAD
    let currentData = [];
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const rawData = fs.readFileSync(OUTPUT_FILE);
            currentData = JSON.parse(rawData);
            console.log(`💾 Loaded ${currentData.length} entries.`);
        } catch (e) {
            console.error("❌ ERROR READING FILE. Aborting to prevent data loss.");
            return; 
        }
    }

    const initialCount = currentData.length;

    // 2. CLEAN (Only remove absolute garbage like headers)
    const beforeClean = currentData.length;
    currentData = currentData.filter(i => {
        // Delete ONLY if combination contains text like "Winning" (headers)
        if (i.combination && i.combination.includes("Winning")) return false;
        // Delete if combination is missing entirely
        if (!i.combination) return false;
        return true;
    });
    if (currentData.length < beforeClean) console.log(`🧹 Removed ${beforeClean - currentData.length} garbage headers.`);

    // 3. DEDUPLICATE (Smart Merge - Keeps the one with best Prize)
    console.log("🧹 Deduplicating...");
    const map = new Map();
    currentData.forEach(item => {
        const key = `${item.date}-${item.game}-${item.combination}`;
        const existing = map.get(key);

        if (!existing) {
            map.set(key, item);
        } else {
            // If new item is better (has real prize/winners), replace it
            const isBetterPrize = item.prize && item.prize !== '₱ TBA' && item.prize !== 'P 4,500' && item.prize !== 'P 4,000'; // Major game logic
            const hasWinners = item.winners && item.winners !== 'TBA' && item.winners !== '0';
            
            // Simple rule: If the new one has better data, keep it.
            if (isBetterPrize || hasWinners) {
                map.set(key, item);
            }
        }
    });
    currentData = Array.from(map.values());

    // Fix 2D/3D Prizes visually
    currentData.forEach(i => {
        if (i.game.includes('3D Lotto')) i.prize = 'P 4,500';
        if (i.game.includes('2D Lotto')) i.prize = 'P 4,000';
        if (i.game.includes('11AM')) i.game = i.game.replace('11AM', '2PM');
        if (i.game.includes('4PM')) i.game = i.game.replace('
