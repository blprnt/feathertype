/**
 * Pre-render gallery images for the landing page
 * Run with: node scripts/render-gallery.js
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const GALLERY_DIR = path.join(__dirname, '..', 'public', 'gallery');

// Gallery image settings
const IMAGE_SIZE = 800; // Output size in pixels
const RENDER_WAIT = 6000; // Wait for animation to complete

async function renderGalleryImages() {
  // Read gallery.json
  const galleryPath = path.join(GALLERY_DIR, 'gallery.json');
  const galleryData = JSON.parse(fs.readFileSync(galleryPath, 'utf-8'));

  console.log(`Found ${galleryData.items.length} gallery items to render`);

  // Find Chrome
  const possiblePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];

  let executablePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const item of galleryData.items) {
      console.log(`\nRendering: ${item.phrase} (${item.id})`);

      const page = await browser.newPage();

      // Set viewport
      await page.setViewport({
        width: 1200,
        height: 1200,
        deviceScaleFactor: 1,
      });

      // Navigate to the create page with the phrase
      const url = `${BASE_URL}/create?phrase=${encodeURIComponent(item.phrase)}&embed=true`;
      console.log(`  URL: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

      // Wait for animation to complete
      console.log(`  Waiting ${RENDER_WAIT / 1000}s for animation...`);
      await new Promise(r => setTimeout(r, RENDER_WAIT));

      // Get canvas data
      const dataUrl = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return canvas ? canvas.toDataURL('image/jpeg', 0.9) : null;
      });

      if (dataUrl) {
        // Save image
        const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
        const outputPath = path.join(GALLERY_DIR, `${item.id}.jpg`);
        fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
        console.log(`  Saved: ${outputPath}`);

        // Update gallery.json with the correct image path
        item.image = `/gallery/${item.id}.jpg`;
      } else {
        console.log(`  ERROR: Could not capture canvas`);
      }

      await page.close();
    }

    // Save updated gallery.json
    fs.writeFileSync(galleryPath, JSON.stringify(galleryData, null, 2));
    console.log(`\nUpdated gallery.json with image paths`);

  } finally {
    await browser.close();
  }

  console.log('\nDone! Gallery images rendered.');
}

renderGalleryImages().catch(console.error);
