import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

// Use Express for web server
import express from "express";

// Nunjucks for templating
import nunjucks from "nunjucks";

// Stripe for payments
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Puppeteer for server-side rendering
import puppeteer from "puppeteer";

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const LOCAL_URL = `http://localhost:${PORT}`; // Always use local URL for Puppeteer rendering

// Parse discount codes from environment (normalize keys to uppercase)
let discountCodes = {};
try {
  const parsed = JSON.parse(process.env.DISCOUNT_CODES || "{}");
  for (const [key, value] of Object.entries(parsed)) {
    discountCodes[key.toUpperCase()] = value;
  }
} catch (e) {
  console.error("Error parsing DISCOUNT_CODES:", e);
}

// Prodigi API configuration (using live API)
const PRODIGI_API_URL = 'https://api.prodigi.com/v4.0';

// Product configuration
const products = {
  digital: {
    name: "High-Res Digital Download",
    price: 500, // $5.00 in cents
    width: 4800,
    height: 4800,
  },
  // Print products - verify SKUs with Prodigi catalog
  "print-12x12": {
    name: "12x12 Print",
    sku: "GLOBAL-FAP-12x12",
    basePrice: 2500, // $25.00 in cents
    width: 3600, // 12" @ 300 DPI
    height: 3600,
  },
  "print-12x12-framed": {
    name: "12x12 Framed Print",
    sku: "GLOBAL-CFPM-12x12",
    basePrice: 6500, // $65.00 in cents
    width: 3600,
    height: 3600,
  },
  "print-16x16": {
    name: "16x16 Print",
    sku: "GLOBAL-FAP-16x16",
    basePrice: 3500, // $35.00 in cents
    width: 4800, // 16" @ 300 DPI
    height: 4800,
  },
  "print-16x16-framed": {
    name: "16x16 Framed Print",
    sku: "GLOBAL-CFPM-16x16",
    basePrice: 8500, // $85.00 in cents
    width: 4800,
    height: 4800,
  },
};

// Ensure prints directory exists
const printsDir = path.join(__dirname, "public", "prints");
if (!fs.existsSync(printsDir)) {
  fs.mkdirSync(printsDir, { recursive: true });
}

// Create Express app
const app = express();
app.use(express.json());
app.use(express.static("public"));

// Configure nunjucks
nunjucks.configure("public", {
  autoescape: true,
  noCache: true,
  express: app,
});

// Main route
app.get(`/`, (req, res) => {
  res.render(`index.njk`, {
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

// Serve rendered print images
app.get("/prints/:filename", (req, res) => {
  const filePath = path.join(printsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("Image not found");
  }
});

// Render high-res digital download (free)
app.post("/render-digital", async (req, res) => {
  try {
    const { settings } = req.body;

    // Generate unique filename
    const filename = `feathertype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
    const outputPath = path.join(printsDir, filename);

    // Render high-res image with Puppeteer
    await renderImage(settings, products.digital.width, products.digital.height, outputPath);

    res.json({
      success: true,
      downloadUrl: `/prints/${filename}`,
    });
  } catch (error) {
    console.error("Error rendering digital image:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get shipping quote from Prodigi and create payment intent
app.post("/get-quote", async (req, res) => {
  try {
    const { address, email, discountCode, settings, productType } = req.body;

    const product = products[productType];
    if (!product || productType === 'digital') {
      return res.status(400).json({ error: "Invalid product type" });
    }

    // Get shipping quote from Prodigi
    const shippingCost = await getProdigiShippingQuote(address, product.sku);

    let productPrice = product.basePrice;

    // Apply discount if valid
    if (discountCode && discountCodes[discountCode.toUpperCase()]) {
      const discount = discountCodes[discountCode.toUpperCase()];
      productPrice = Math.round(productPrice * (1 - discount));
    }

    const totalAmount = productPrice + shippingCost;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
      metadata: {
        type: "print",
        productType: productType,
        email: email,
        displayText: settings.displayText || "",
      },
      receipt_email: email,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      productName: product.name,
      productPrice: productPrice,
      shippingCost: shippingCost,
      totalAmount: totalAmount,
    });
  } catch (error) {
    console.error("Error getting quote:", error);
    res.status(500).json({ error: error.message });
  }
});

// Finalize print order - render image and submit to Prodigi
app.post("/finalize-order", async (req, res) => {
  try {
    const { paymentIntentId, settings, address, email, productType } = req.body;

    const product = products[productType];
    if (!product || productType === 'digital') {
      return res.status(400).json({ error: "Invalid product type" });
    }

    // Verify payment was successful
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    // Generate unique filename
    const filename = `print-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;
    const outputPath = path.join(printsDir, filename);

    // Render print-resolution image with Puppeteer
    await renderImage(settings, product.width, product.height, outputPath);

    // Submit order to Prodigi
    const prodigiOrder = await submitProdigiOrder(
      `${BASE_URL}/prints/${filename}`,
      address,
      email,
      product.sku
    );

    res.json({
      success: true,
      orderId: prodigiOrder.id,
    });
  } catch (error) {
    console.error("Error finalizing order:", error);
    res.status(500).json({ error: error.message });
  }
});

// Puppeteer rendering function
async function renderImage(settings, width, height, outputPath) {
  // Try to find Chrome on macOS
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
    headless: "new",
    executablePath: executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();

    // Set viewport to match base canvas size (scaling handled by p5.js pixelDensity)
    const baseSize = 1200;
    await page.setViewport({
      width: baseSize,
      height: baseSize,
      deviceScaleFactor: 1,
    });

    // Inject server parameters before page load
    await page.evaluateOnNewDocument((params) => {
      window.SERVER_PARAMS = params;
    }, {
      settings: settings,
      width: width,
      height: height,
      serverMode: true,
    });

    // Navigate to the page (use local URL for rendering)
    await page.goto(LOCAL_URL, { waitUntil: "networkidle0" });

    // Wait for render completion signal
    await page.waitForSelector("#render-complete", { timeout: 60000 });

    // Extract the canvas data URL (this gets the full resolution with pixelDensity)
    const dataUrl = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      return canvas.toDataURL("image/png");
    });

    if (!dataUrl) {
      throw new Error("Canvas element not found");
    }

    // Convert data URL to buffer and save
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(outputPath, Buffer.from(base64Data, "base64"));

    console.log(`Image rendered: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

// Get shipping quote from Prodigi
async function getProdigiShippingQuote(address, sku) {
  try {
    const response = await fetch(`${PRODIGI_API_URL}/quotes`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.PRODIGI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shippingMethod: "Standard",
        destinationCountryCode: address.country,
        items: [
          {
            sku: sku,
            copies: 1,
            assets: [
              {
                printArea: "default",
                // Use Prodigi's sample image from their docs
                url: "https://www.prodigi.com/img/products/product-image-frame-702x702.png",
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok || data.outcome !== "Created") {
      console.error("Prodigi Quote API error:", data);
      console.log("Using fallback shipping estimate");
      // Fall back to estimates if API fails
      return getFallbackShippingEstimate(address, sku);
    }

    // Return shipping cost in cents
    const shippingCost = data.quotes?.[0]?.shipmentSummary?.shipping?.cost?.amount || "0";
    return Math.round(parseFloat(shippingCost) * 100);
  } catch (error) {
    console.error("Prodigi Quote error:", error);
    // Fall back to estimates if API fails
    return getFallbackShippingEstimate(address, sku);
  }
}

// Fallback shipping estimates if Prodigi API fails
function getFallbackShippingEstimate(address, sku) {
  const shippingRates = {
    US: 599,
    CA: 899,
    GB: 699,
    AU: 1199,
    DEFAULT: 1299,
  };

  const rate = shippingRates[address.country] || shippingRates.DEFAULT;
  const isFramed = sku.includes("CFPM") || sku.toLowerCase().includes("frame");
  const framedSurcharge = isFramed ? 500 : 0;

  return rate + framedSurcharge;
}

// Submit order to Prodigi
async function submitProdigiOrder(imageUrl, address, email, sku) {
  const response = await fetch(`${PRODIGI_API_URL}/orders`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.PRODIGI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shippingMethod: "Standard",
      recipient: {
        name: address.name,
        email: email,
        address: {
          line1: address.address1,
          postalOrZipCode: address.zip,
          countryCode: address.country,
          townOrCity: address.city,
          stateOrCounty: address.state,
        },
      },
      items: [
        {
          sku: sku,
          copies: 1,
          sizing: "fillPrintArea",
          assets: [
            {
              printArea: "default",
              url: imageUrl,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok || data.outcome === "Error") {
    console.error("Prodigi order error:", data);
    throw new Error(data.issues?.[0]?.description || "Failed to create order");
  }

  return data.order;
}

// Start server
app.listen(PORT, () => {
  console.log(`FeatherType server listening on port ${PORT}`);
  console.log(`Visit ${BASE_URL} to view the app`);
});
