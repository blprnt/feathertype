/*

Feather Text Generator - Creates text with bird feathers above each letter

*/

// Server mode detection
let serverMode = false;
let serverParams = null;
let serverLetterData = null; // Pre-built letter data from client
let videoMode = false;
let currentFrame = 0;
let totalFrames = 150;

// Global Variables
let birds;
let toLoad;
let codeMap = {};

// Stripe instance (initialized when needed)
let stripe = null;
let cardElement = null;

// Product configuration
const products = {
  digital: {
    name: "High-Res Digital Download",
    price: 5.00,
    width: 4800,
    height: 4800,
  },
  video: {
    name: "Animated Video (MP4)",
    price: 5.00,
    width: 1080,
    height: 1080,
  },
  "print-12x12": {
    name: "12x12 Print",
    basePrice: 25.00,
  },
  "print-12x12-framed": {
    name: "12x12 Framed Print",
    basePrice: 90.00,
  },
  "print-16x16": {
    name: "16x16 Print",
    basePrice: 35.00,
  },
  "print-16x16-framed": {
    name: "16x16 Framed Print",
    basePrice: 120.00,
  },
};

// Current purchase state
let currentPurchase = {
  type: null,
  clientSecret: null,
  email: null,
  address: null,
  discountCode: null,
  productPrice: 0,
  shippingCost: 0,
  totalAmount: 0,
};

// Colors
let colorMap = {};
let colorCount = 0;
let colorserver = "https://birdstocolors.binstobins.online/";

// Array of suitable background colors - varied subtle shades
const backgroundColors = [
  [245, 240, 230], // warm beige
  [240, 235, 225], // cream
  [235, 240, 235], // pale sage green
  [240, 235, 240], // soft lavender
  [235, 235, 240], // light periwinkle
  [240, 240, 235], // ivory
  [245, 235, 235], // blush pink
  [235, 240, 240], // powder blue
  [238, 238, 238], // soft gray
  [240, 238, 235], // warm white
  [235, 242, 235], // mint cream
  [242, 238, 242], // pale lilac
  [238, 235, 230], // taupe
  [230, 235, 240], // light steel blue
  [245, 240, 240], // pearl
];

let bcolor;
let fscale;

let myFont;

// Text to display
// Default phrases to randomly choose from
const defaultPhrases = [
  "FLOCK TOGETHER",
  "HOPE IS A THING WITH FEATHERS",
  "BECAUSE IT HAS A SONG."
];
let displayText = defaultPhrases[Math.floor(Math.random() * defaultPhrases.length)];

// Letter positions and feather assignments
let letterData = [];

// Animation variables
let animationStartTime = 0;
let drawDuration = 2500; // Fast sweep for drawing feathers
let swayDuration = 2000; // Wind sway at the end
let animationDuration = drawDuration + swayDuration;
let isAnimating = false;
let windPhase = 0; // For wind sway oscillation

function preload() {
  myFont = loadFont("PlayfairDisplay-VariableFont_wght.ttf");

  // Check for server mode
  if (window.SERVER_PARAMS) {
    serverMode = true;
    serverParams = window.SERVER_PARAMS;
  }
}

function setup() {
  // Server mode: use provided dimensions, skip UI
  if (serverMode && serverParams) {
    // Check for video mode
    if (serverParams.videoMode) {
      videoMode = true;
      totalFrames = serverParams.totalFrames || 150;
    }

    // Calculate scale factor based on desired output vs base canvas
    const baseSize = videoMode ? serverParams.width : 1200;
    const outputSize = serverParams.width || 4800;
    const scaleFactor = videoMode ? 1 : outputSize / baseSize;

    // Use base canvas size with high pixel density for crisp output
    createCanvas(baseSize, baseSize);
    pixelDensity(scaleFactor);
    textFont(myFont);

    // Use settings from server params
    if (serverParams.settings) {
      displayText = serverParams.settings.displayText || displayText;
      if (serverParams.settings.backgroundColor) {
        let bg = serverParams.settings.backgroundColor;
        bcolor = color(bg[0], bg[1], bg[2]);
      } else {
        let bgArray = random(backgroundColors);
        bcolor = color(bgArray[0], bgArray[1], bgArray[2]);
      }

      // Load bird colors from settings
      if (serverParams.settings.birdColors) {
        colorMap = serverParams.settings.birdColors;
      }

      // Reconstruct letter data from settings
      if (serverParams.settings.letterData && serverParams.settings.letterData.length > 0) {
        serverLetterData = serverParams.settings.letterData;
      }
    } else {
      let bgArray = random(backgroundColors);
      bcolor = color(bgArray[0], bgArray[1], bgArray[2]);
    }

    fscale = 2.0;
    background(bcolor);

    // If we have pre-built letter data, use it directly
    if (serverLetterData) {
      setupLetterPositionsFromData(serverLetterData);
      // Set birds as loaded so draw() proceeds
      birds = [];
      toLoad = 0;
      colorCount = 0;
    } else {
      // Fallback: fetch birds (won't match client)
      getBirdsFromSearch(displayText);
    }

    // In video mode, stop automatic loop - server controls frame-by-frame with setAnimationFrame
    if (videoMode) {
      noLoop();
      // Signal that video mode is ready for frame capture
      let ready = document.createElement('div');
      ready.id = 'video-ready';
      ready.style.display = 'none';
      document.body.appendChild(ready);
    }
    return;
  }

  // Normal client mode
  // Create canvas for on-screen display
  createCanvas(800, 800);
  pixelDensity(2);
  textFont(myFont);

  // Pick random background color FIRST
  let bgArray = random(backgroundColors);
  bcolor = color(bgArray[0], bgArray[1], bgArray[2]);
  fscale = 2.0; // Further increased to ensure feathers fully render
  background(bcolor);

  // Style the page and canvas container - keep HTML background beige
  select('body').style('margin', '0');
  select('body').style('padding', '0');
  select('body').style('overflow', 'auto');
  select('body').style('background-color', '#f5f0e6'); // Always beige
  select('body').style('font-family', 'system-ui, -apple-system, sans-serif');

  // Add responsive CSS for bottom buttons
  let responsiveStyle = document.createElement('style');
  responsiveStyle.textContent = `
    #bottom-buttons {
      flex-direction: row;
    }
    @media (max-width: 600px) {
      #bottom-buttons {
        flex-direction: column;
        align-items: center;
      }
      #bottom-buttons > * {
        font-size: 12px !important;
        padding: 8px 14px !important;
      }
    }
  `;
  document.head.appendChild(responsiveStyle);

  // Position canvas to scale and center, with margin for top controls
  select('canvas').style('display', 'block');
  select('canvas').style('max-width', '100%');
  select('canvas').style('height', 'auto');
  select('canvas').style('box-shadow', '0 4px 20px rgba(0,0,0,0.1)');
  select('canvas').style('margin', '120px auto 20px auto'); // Top margin for controls (extra on mobile)
  select('canvas').style('padding', '0 10px');

  // Create container for controls - responsive layout
  let controlsDiv = createDiv('');
  controlsDiv.style('position', 'fixed');
  controlsDiv.style('top', '0');
  controlsDiv.style('left', '0');
  controlsDiv.style('right', '0');
  controlsDiv.style('display', 'flex');
  controlsDiv.style('flex-wrap', 'wrap');
  controlsDiv.style('align-items', 'center');
  controlsDiv.style('gap', '8px');
  controlsDiv.style('padding', '10px 15px');
  controlsDiv.style('background-color', '#f5f0e6'); // Always beige
  controlsDiv.style('border-bottom', '2px solid #ddd');
  controlsDiv.style('z-index', '1000');
  controlsDiv.style('box-shadow', '0 2px 4px rgba(0,0,0,0.05)');
  controlsDiv.id('controls');

  // Input for custom text
  const MAX_PHRASE_LENGTH = 50;

  let textInput = createInput(displayText);
  textInput.parent(controlsDiv);
  textInput.attribute('maxlength', MAX_PHRASE_LENGTH);
  textInput.style('padding', '10px');
  textInput.style('border', '2px solid #333');
  textInput.style('border-radius', '8px');
  textInput.style('font-size', '16px');
  textInput.style('font-family', 'Playfair Display, serif');
  textInput.style('background-color', '#fff');
  textInput.style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');
  textInput.style('min-width', '150px');
  textInput.style('flex', '1 1 200px');
  textInput.style('max-width', '300px');

  // Function to update text and fetch new birds
  const updateText = () => {
    // Sanitize: only allow letters, numbers, spaces, and basic punctuation
    let rawText = textInput.value().toUpperCase().slice(0, MAX_PHRASE_LENGTH);
    displayText = rawText.replace(/[^A-Z0-9\s\-'.!?]/g, '');

    // Pick new random background color for canvas only
    let bgArray = random(backgroundColors);
    bcolor = color(bgArray[0], bgArray[1], bgArray[2]);

    // Reset all state - don't start animation until new birds are loaded
    letterData = [];
    isAnimating = false;
    birds = undefined;
    colorCount = -1; // Use -1 to indicate loading state
    toLoad = 0;

    // Fetch new birds for the new text
    getBirdsFromSearch(displayText);

    // Note: animation will start in draw() once birds are loaded and letterData is set up
    loop();
  };
  
  // Only update on Enter key press
  textInput.elt.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      updateText();
    }
  });

  // Regenerate button
  let regenerateButton = createButton("regenerate");
  regenerateButton.parent(controlsDiv);
  regenerateButton.style('padding', '10px 16px');
  regenerateButton.style('border', '2px solid #333');
  regenerateButton.style('border-radius', '8px');
  regenerateButton.style('font-size', '14px');
  regenerateButton.style('background-color', '#333');
  regenerateButton.style('color', '#fff');
  regenerateButton.style('cursor', 'pointer');
  regenerateButton.style('font-weight', '600');
  regenerateButton.style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  regenerateButton.style('transition', 'all 0.2s');
  regenerateButton.mousePressed(updateText);
  regenerateButton.mouseOver(() => {
    regenerateButton.style('background-color', '#555');
    regenerateButton.style('transform', 'translateY(-1px)');
    regenerateButton.style('box-shadow', '0 4px 6px rgba(0,0,0,0.2)');
  });
  regenerateButton.mouseOut(() => {
    regenerateButton.style('background-color', '#333');
    regenerateButton.style('transform', 'translateY(0)');
    regenerateButton.style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  });

  // Spacer to push purchase buttons to the right (flexible)
  let spacer = createDiv('');
  spacer.parent(controlsDiv);
  spacer.style('flex', '1 1 auto');
  spacer.style('min-width', '10px');

  // Download High-Res button (free)
  let downloadButton = createButton("Get 🖼️");
  downloadButton.parent(controlsDiv);
  downloadButton.style('padding', '10px 14px');
  downloadButton.style('border', '2px solid #2563eb');
  downloadButton.style('border-radius', '8px');
  downloadButton.style('font-size', '13px');
  downloadButton.style('background-color', '#2563eb');
  downloadButton.style('color', '#fff');
  downloadButton.style('cursor', 'pointer');
  downloadButton.style('font-weight', '600');
  downloadButton.style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  downloadButton.style('transition', 'all 0.2s');
  downloadButton.style('white-space', 'nowrap');
  downloadButton.mousePressed(() => startDigitalDownload());
  downloadButton.mouseOver(() => {
    downloadButton.style('background-color', '#1d4ed8');
    downloadButton.style('transform', 'translateY(-1px)');
  });
  downloadButton.mouseOut(() => {
    downloadButton.style('background-color', '#2563eb');
    downloadButton.style('transform', 'translateY(0)');
  });

  // Download Video button (5)
  let videoButton = createButton("Get 🎬 $5");
  videoButton.parent(controlsDiv);
  videoButton.style('padding', '10px 14px');
  videoButton.style('border', '2px solid #7c3aed');
  videoButton.style('border-radius', '8px');
  videoButton.style('font-size', '13px');
  videoButton.style('background-color', '#7c3aed');
  videoButton.style('color', '#fff');
  videoButton.style('cursor', 'pointer');
  videoButton.style('font-weight', '600');
  videoButton.style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  videoButton.style('transition', 'all 0.2s');
  videoButton.style('white-space', 'nowrap');
  videoButton.mousePressed(() => startVideoPurchase());
  videoButton.mouseOver(() => {
    videoButton.style('background-color', '#6d28d9');
    videoButton.style('transform', 'translateY(-1px)');
  });
  videoButton.mouseOut(() => {
    videoButton.style('background-color', '#7c3aed');
    videoButton.style('transform', 'translateY(0)');
  });

  // Order Print button ($25+)
  let printButton = createButton("Order Print $25+");
  printButton.parent(controlsDiv);
  printButton.style('padding', '10px 14px');
  printButton.style('border', '2px solid #059669');
  printButton.style('border-radius', '8px');
  printButton.style('font-size', '13px');
  printButton.style('background-color', '#059669');
  printButton.style('color', '#fff');
  printButton.style('cursor', 'pointer');
  printButton.style('font-weight', '600');
  printButton.style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  printButton.style('transition', 'all 0.2s');
  printButton.style('white-space', 'nowrap');
  printButton.mousePressed(() => startPrintPurchase());
  printButton.mouseOver(() => {
    printButton.style('background-color', '#047857');
    printButton.style('transform', 'translateY(-1px)');
  });
  printButton.mouseOut(() => {
    printButton.style('background-color', '#059669');
    printButton.style('transform', 'translateY(0)');
  });

  // Bottom buttons container
  let bottomButtons = createDiv('');
  bottomButtons.id('bottom-buttons');
  bottomButtons.style('position', 'fixed');
  bottomButtons.style('bottom', '20px');
  bottomButtons.style('left', '50%');
  bottomButtons.style('transform', 'translateX(-50%)');
  bottomButtons.style('display', 'flex');
  bottomButtons.style('flex-wrap', 'wrap');
  bottomButtons.style('justify-content', 'center');
  bottomButtons.style('gap', '8px');
  bottomButtons.style('z-index', '1000');
  bottomButtons.style('max-width', '90vw');

  // "What is this?" button
  let infoButton = createButton("What is this?");
  infoButton.parent(bottomButtons);
  infoButton.style('padding', '10px 20px');
  infoButton.style('border', 'none');
  infoButton.style('border-radius', '20px');
  infoButton.style('font-size', '14px');
  infoButton.style('font-family', 'Playfair Display, serif');
  infoButton.style('background-color', 'rgba(0,0,0,0.1)');
  infoButton.style('color', '#333');
  infoButton.style('cursor', 'pointer');
  infoButton.style('transition', 'all 0.2s');
  infoButton.mousePressed(() => showInfoModal());
  infoButton.mouseOver(() => {
    infoButton.style('background-color', 'rgba(0,0,0,0.2)');
  });
  infoButton.mouseOut(() => {
    infoButton.style('background-color', 'rgba(0,0,0,0.1)');
  });

  // "Get in touch" button
  let contactButton = createButton("Get in touch");
  contactButton.parent(bottomButtons);
  contactButton.style('padding', '10px 20px');
  contactButton.style('border', 'none');
  contactButton.style('border-radius', '20px');
  contactButton.style('font-size', '14px');
  contactButton.style('font-family', 'Playfair Display, serif');
  contactButton.style('background-color', 'rgba(0,0,0,0.1)');
  contactButton.style('color', '#333');
  contactButton.style('cursor', 'pointer');
  contactButton.style('transition', 'all 0.2s');
  contactButton.mousePressed(() => {
    window.open('https://www.jerthorp.me/contact', '_blank');
  });
  contactButton.mouseOver(() => {
    contactButton.style('background-color', 'rgba(0,0,0,0.2)');
  });
  contactButton.mouseOut(() => {
    contactButton.style('background-color', 'rgba(0,0,0,0.1)');
  });

  // "Follow me on Instagram" button
  let instaButton = createDiv('Follow me on <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-left: 4px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>');
  instaButton.parent(bottomButtons);
  instaButton.style('padding', '10px 20px');
  instaButton.style('border', 'none');
  instaButton.style('border-radius', '20px');
  instaButton.style('font-size', '14px');
  instaButton.style('font-family', 'Playfair Display, serif');
  instaButton.style('background-color', 'rgba(0,0,0,0.1)');
  instaButton.style('color', '#333');
  instaButton.style('cursor', 'pointer');
  instaButton.style('transition', 'all 0.2s');
  instaButton.style('display', 'flex');
  instaButton.style('align-items', 'center');
  instaButton.mousePressed(() => {
    window.open('https://www.instagram.com/blprnt', '_blank');
  });
  instaButton.mouseOver(() => {
    instaButton.style('background-color', 'rgba(0,0,0,0.2)');
  });
  instaButton.mouseOut(() => {
    instaButton.style('background-color', 'rgba(0,0,0,0.1)');
  });

  // Use getBirdsFromSearch to load initial bird data based on displayText
  getBirdsFromSearch(displayText);
}

function draw() {
  // Server mode with pre-built data - render immediately (but not video mode)
  if (serverMode && !videoMode && serverLetterData && letterData.length > 0) {
    drawFeatherText();
    signalRenderComplete();
    noLoop();
    return;
  }

  // Video mode - just draw current frame, server controls frame advancement
  if (videoMode && letterData.length > 0) {
    drawFeatherText();
    return;
  }

  if (birds === undefined || colorCount < 0) {
    background(bcolor);
    fill(0);
    textFont(myFont);
    textAlign(CENTER, CENTER);
    textSize(24);
    text("Waiting for bird data to load...", width / 2, height / 2);
    return;
  }

  if (toLoad === 0) {
    background(bcolor);
    fill(0);
    textFont(myFont);
    textAlign(CENTER, CENTER);
    textSize(24);
    text("No birds found for this search term.", width / 2, height / 2);
    noLoop();
  } else if (birds && colorCount == toLoad) {
    if (letterData.length === 0) {
      setupLetterPositions();
      // Start animation when letters are set up
      animationStartTime = millis();
      isAnimating = true;
    }

    drawFeatherText();

    // Only stop looping when animation is complete
    if (!isAnimating) {
      // In server mode, signal render completion
      if (serverMode) {
        signalRenderComplete();
      }
      noLoop();
    }
  } else {
    background(bcolor);
    fill(0);
    textFont(myFont);
    textAlign(CENTER, CENTER);
    textSize(24);
    text(
      `Loading colors... (${colorCount} / ${toLoad})`,
      width / 2,
      height / 2
    );
  }
}

// Setup letter positions from pre-built data (server mode)
function setupLetterPositionsFromData(data) {
  letterData = [];

  // Dynamically calculate text size based on phrase length
  let baseTextSize = 180;
  let textSizeAdjustment = map(displayText.length, 1, 15, 1, 0.4);
  let dynamicTextSize = baseTextSize * textSizeAdjustment;

  // For short phrases, limit size so feathers don't go off screen
  let maxSizeForFeathers = (height / 2 - 350) * 1.5;
  maxSizeForFeathers = max(maxSizeForFeathers, 80);

  dynamicTextSize = constrain(dynamicTextSize, 60, min(180, maxSizeForFeathers));

  textSize(dynamicTextSize);
  textAlign(CENTER, TOP);

  // Calculate the width of each letter and total width
  let letterWidths = [];
  let totalWidth = 0;
  for (let i = 0; i < displayText.length; i++) {
    let w = textWidth(displayText[i]);
    letterWidths.push(w);
    totalWidth += w;
  }

  // Add spacing between letters
  let letterSpacing = dynamicTextSize * 0.22;
  totalWidth += letterSpacing * (displayText.length - 1);

  // Scale everything to fit canvas with margins (leave room for framing)
  let maxWidth = width * 0.75;
  let scale = 1;
  if (totalWidth > maxWidth) {
    scale = maxWidth / totalWidth;
    dynamicTextSize *= scale;
    letterSpacing *= scale;
    for (let i = 0; i < letterWidths.length; i++) {
      letterWidths[i] *= scale;
    }
    totalWidth = maxWidth;
  }

  let startX = (width - totalWidth) / 2;
  let primaryY = height / 2 - dynamicTextSize / 2;
  let currentX = startX;

  // Reconstruct letter data using passed data
  for (let i = 0; i < displayText.length; i++) {
    let letter = displayText[i];
    let x = currentX + letterWidths[i] / 2;

    // Get pre-built data for this letter
    let prebuilt = data[i] || {};

    // Create a mock bird object with the data we need
    let mockBird = null;
    if (prebuilt.birdName) {
      mockBird = {
        comName: prebuilt.birdName,
        randomSeed: prebuilt.randomSeed || 0,
      };
    }

    letterData.push({
      char: letter,
      x: x,
      y: primaryY,
      size: dynamicTextSize,
      featherY: primaryY,
      featherHeight: 250,
      bird: mockBird,
      birdName: prebuilt.birdName || "",
      featherAngle: prebuilt.featherAngle || 0,
    });

    currentX += letterWidths[i] + letterSpacing;
  }

  // In server mode, skip animation - render final state immediately
  if (serverMode) {
    isAnimating = false;
  } else {
    animationStartTime = millis();
    isAnimating = true;
  }
}

function setupLetterPositions() {
  letterData = [];
  
  // Debug: Check what birds we actually have
  console.log("Total birds loaded:", birds.length);
  console.log("Sample bird names:", birds.slice(0, 10).map(b => b.comName || b.name));
  
  // Dynamically calculate text size based on phrase length
  let baseTextSize = 180;
  let textSizeAdjustment = map(displayText.length, 1, 15, 1, 0.4); // Scale down for longer phrases
  let dynamicTextSize = baseTextSize * textSizeAdjustment;

  // For short phrases, limit size so feathers don't go off screen
  // Feathers extend ~500px above the text, text is centered vertically
  // Max text size where feathers stay on screen: (height/2 - featherHeight) * 2
  let maxSizeForFeathers = (height / 2 - 350) * 1.5; // Leave room for feathers
  maxSizeForFeathers = max(maxSizeForFeathers, 80); // But not too small

  dynamicTextSize = constrain(dynamicTextSize, 60, min(180, maxSizeForFeathers));
  
  textSize(dynamicTextSize);
  textAlign(CENTER, TOP);
  
  // Calculate the width of each letter and total width
  let letterWidths = [];
  let totalWidth = 0;
  for (let i = 0; i < displayText.length; i++) {
    let w = textWidth(displayText[i]);
    letterWidths.push(w);
    totalWidth += w;
  }
  
  // Add spacing between letters - scale with text size
  let letterSpacing = dynamicTextSize * 0.22; // Proportional to text size
  totalWidth += letterSpacing * (displayText.length - 1);
  
  // Scale everything to fit canvas with margins (leave room for framing)
  let maxWidth = width * 0.75; // 75% of canvas width for frame-friendly spacing
  let scale = 1;
  if (totalWidth > maxWidth) {
    scale = maxWidth / totalWidth;
    dynamicTextSize *= scale;
    letterSpacing *= scale;
    for (let i = 0; i < letterWidths.length; i++) {
      letterWidths[i] *= scale;
    }
    totalWidth = maxWidth;
  }
  
  let startX = (width - totalWidth) / 2;
  // Center the big letters vertically in the canvas
  let primaryY = height / 2 - dynamicTextSize / 2;
  
  let currentX = startX;
  let maxBirdNameLength = 0; // Track longest bird name
  
  // Create letter data for primary text
  for (let i = 0; i < displayText.length; i++) {
    let letter = displayText[i];
    
    // Position at center of this letter's width
    let x = currentX + letterWidths[i] / 2;
    
    // Skip bird lookup for dashes
    let selectedBird = null;
    if (letter === '-') {
      console.log(`Letter ${letter}: Dash - rendering as vertical tick`);
    } else {
      // Find birds where the first word of the common name starts with this letter
      // For initial setup, accept all birds (color filtering happens during draw)
      let matchingBirds = birds.filter(b => {
        // Check both comName and name fields
        let birdName = b.comName || b.name;
        if (!birdName) {
          return false;
        }
        
        // Get the first word of the bird name
        let firstName = birdName.trim().split(/\s+/)[0];
        let matches = firstName.toUpperCase().startsWith(letter.toUpperCase());
        
        return matches;
      });
      
      // Filter for birds with color data if colors are loaded
      if (colorCount === toLoad) {
        matchingBirds = matchingBirds.filter(b => {
          let birdName = b.comName || b.name;
          let colorData = colorMap[birdName.toUpperCase()];
          return colorData && colorData.colors && colorData.colors.length > 2;
        });
      }
      
      // Debug logging
      console.log(`Letter ${letter}: ${matchingBirds.length} matching birds after color filter`);
      if (matchingBirds.length === 0) {
        // Show what birds we had before filtering
        let allMatching = birds.filter(b => {
          let birdName = b.comName || b.name;
          if (!birdName) return false;
          let firstName = birdName.trim().split(/\s+/)[0];
          return firstName.toUpperCase().startsWith(letter.toUpperCase());
        });
        console.log(`Letter ${letter}: Had ${allMatching.length} birds before color filter:`, allMatching.map(b => b.comName));
        allMatching.forEach(b => {
          let cd = colorMap[b.comName.toUpperCase()];
          console.log(`  - ${b.comName}: colors=${cd?.colors?.length || 0}`);
        });
      }

      // Pick a random bird from matching ones
      if (matchingBirds.length > 0) {
        selectedBird = random(matchingBirds);
        let colorData = colorMap[selectedBird.comName.toUpperCase()];
        let colorCount = colorData && colorData.colors ? colorData.colors.length : 0;
        console.log(`Letter ${letter}: Found ${matchingBirds.length} birds, selected ${selectedBird.comName || selectedBird.name} (${colorCount} colors)`);
        
        // Track longest bird name (minus first letter since we skip it)
        let birdNameLength = selectedBird.comName.length - 1;
        maxBirdNameLength = max(maxBirdNameLength, birdNameLength);
      } else {
        console.log(`Letter ${letter}: No birds found!`);
      }
    }
    
    letterData.push({
      char: letter,
      x: x,
      y: primaryY,
      size: dynamicTextSize,
      featherY: primaryY,
      featherHeight: 250,
      bird: selectedBird,
      birdName: selectedBird ? (selectedBird.comName || selectedBird.name) : "",
      featherAngle: random(-0.1, 0.1) // Store random angle so it doesn't change each frame
    });
    
    // Move to next letter position
    currentX += letterWidths[i] + letterSpacing;
  }
  
  // Note: Canvas stays square - bird names that extend beyond will be scrollable
  // Calculate how much vertical space is needed for reference
  let birdNameSize = dynamicTextSize * 0.1;
  let birdNameHeight = maxBirdNameLength * birdNameSize * 1.2;
  let requiredHeight = primaryY + dynamicTextSize * 0.84 + birdNameHeight + 100;
  
  if (requiredHeight > height) {
    console.log(`Bird names extend beyond canvas: needs ${requiredHeight}px, have ${height}px (will be scrollable)`);
  }
}

function drawFeatherText() {
  background(bcolor);

  // Calculate animation progress (0 to 1)
  let elapsedTime;
  let drawProgress; // Progress through the drawing phase (0-1)
  let swayProgress; // Progress through the sway phase (0-1)
  let windAngle = 0; // Wind sway angle offset

  // In video mode, use frame-based progress
  if (videoMode) {
    let totalProgress = currentFrame / (totalFrames - 1);
    let drawRatio = drawDuration / animationDuration;

    if (totalProgress <= drawRatio) {
      drawProgress = totalProgress / drawRatio;
      swayProgress = 0;
    } else {
      drawProgress = 1.0;
      swayProgress = (totalProgress - drawRatio) / (1 - drawRatio);
    }
  } else if (serverMode) {
    // In server mode (static image), skip animation - render final state
    drawProgress = 1.0;
    swayProgress = 0;
    isAnimating = false;
  } else {
    elapsedTime = millis() - animationStartTime;

    if (elapsedTime <= drawDuration) {
      drawProgress = elapsedTime / drawDuration;
      swayProgress = 0;
    } else {
      drawProgress = 1.0;
      swayProgress = (elapsedTime - drawDuration) / swayDuration;
    }

    drawProgress = constrain(drawProgress, 0, 1);
    swayProgress = constrain(swayProgress, 0, 1);

    // Stop animating when complete
    if (elapsedTime >= animationDuration) {
      isAnimating = false;
      drawProgress = 1.0;
      swayProgress = 1.0;
    }
  }

  // Calculate wind sway angle during sway phase
  if (swayProgress > 0 && (isAnimating || videoMode)) {
    // Ease into the sway, then oscillate, then settle
    let swayIntensity = sin(swayProgress * PI); // Ramps up and down
    let oscillation = sin(swayProgress * PI * 4); // Multiple waves
    windAngle = oscillation * swayIntensity * 0.15; // Max ~8.5 degrees
  }

  // Draw feathers for each letter
  for (let i = 0; i < letterData.length; i++) {
    let letter = letterData[i];

    // Start feathers earlier and extend their animation time for overlap
    // Account for the fact that feathers extend 2 letters forward
    let totalSlots = letterData.length + 2; // Add 2 slots for last feather to complete
    let featherStartTime = i / totalSlots;
    let featherEndTime = (i + 2) / totalSlots;

    // Calculate this feather's animation progress (0 to 1)
    let featherProgress = map(drawProgress, featherStartTime, featherEndTime, 0, 1);
    featherProgress = constrain(featherProgress, 0, 1);

    // Use a more sweeping ease - faster at the start
    let easedProgress = easeOutQuart(featherProgress);

    // Draw feathers above this letter (skip for dashes)
    if (letter.char !== '-') {
      // If animating or in video mode, use calculated progress; otherwise show full
      let finalProgress = (isAnimating || videoMode) ? easedProgress : 1.0;

      // Add individual feather sway as it appears (very gentle settling motion)
      let featherSway = 0;
      if ((isAnimating || videoMode) && featherProgress > 0 && featherProgress < 1) {
        // Very subtle sway that fades as feather completes
        let swayIntensity = (1 - featherProgress) * 0.04; // Much more subtle
        // Ease into the oscillation - slower at start
        let easedOscillation = easeOutQuart(featherProgress);
        featherSway = sin(easedOscillation * PI * 2) * swayIntensity; // Fewer oscillations
      }

      let totalSway = windAngle + featherSway;

      if ((!isAnimating && !videoMode) || featherProgress > 0) {
        drawFeathersForLetter(letter, finalProgress, totalSway);
      }
    }
  }
  
  // Draw the letters on top
  fill(0);
  textAlign(CENTER, TOP);

  for (let i = 0; i < letterData.length; i++) {
    let letter = letterData[i];

    // Calculate feather progress for this letter (same as above)
    let totalSlots = letterData.length + 2;
    let featherStartTime = i / totalSlots;
    let featherEndTime = (i + 2) / totalSlots;
    let featherProgress = map(drawProgress, featherStartTime, featherEndTime, 0, 1);
    featherProgress = constrain(featherProgress, 0, 1);

    // Letters appear after feather starts
    let letterStartTime = i / totalSlots + 0.3 / totalSlots;
    let letterEndTime = (i + 1) / totalSlots;
    let letterProgress = map(drawProgress, letterStartTime, letterEndTime, 0, 1);
    letterProgress = constrain(letterProgress, 0, 1);

    // Only draw if letter has started appearing
    if (letterProgress > 0) {
      // Handle dashes as vertical ticks
      if (letter.char === '-') {
        push();
        stroke(0);
        strokeWeight(letter.size * 0.08); // Scale stroke weight with text size
        let tickHeight = letter.size * 0.4; // Make tick 40% of text height
        line(letter.x, letter.y + letter.size * 0.3, letter.x, letter.y + letter.size * 0.3 + tickHeight);
        pop();
      } else {
        // Draw primary letter
        textSize(letter.size * 0.75);
        text(letter.char, letter.x, letter.y);
      }

      // Draw bird name below in vertical text (skip for dashes)
      // Bird name cascades down as feather appears
      if (letter.birdName && letter.char !== '-' && featherProgress > 0.2) {
        let birdNameSize = letter.size * 0.1; // Scale to 10% of main text size
        birdNameSize = max(birdNameSize, 12); // Minimum 12px for legibility
        textSize(birdNameSize);
        fill(100); // Lighter gray for bird names
        let yOffset = letter.y + letter.size * 0.84; // Position based on text size
        let birdName = letter.birdName.toLowerCase();

        // Skip the first letter since it's already shown as the big character
        let nameToDisplay = birdName.substring(1);

        // Calculate how many characters to show based on feather progress
        // Bird name cascades as feather draws, completes before sway phase
        let nameProgress;
        if (!isAnimating && !videoMode) {
          nameProgress = 1.0;
        } else {
          // Map feather progress (0.2 to 1.0) to full name - completes during draw phase
          nameProgress = map(featherProgress, 0.2, 1.0, 0, 1);
          nameProgress = constrain(nameProgress, 0, 1);
        }

        let charsToShow = floor(nameProgress * (nameToDisplay.length + 1));

        for (let j = 0; j < min(charsToShow, nameToDisplay.length); j++) {
          let char = nameToDisplay[j];
          let charY = yOffset + j * (birdNameSize * 1.2);

          // Handle dashes as vertical centered ticks
          if (char === '-') {
            push();
            stroke(0, 0, 0, 128); // 50% opacity (128 out of 255)
            strokeWeight(birdNameSize * 0.08); // Thinner stroke
            let tickHeight = birdNameSize * 0.25; // Shorter tick - 25% instead of 40%
            line(letter.x, charY + birdNameSize * 0.4, letter.x, charY + birdNameSize * 0.4 + tickHeight);
            pop();
          } else {
            text(char, letter.x, charY);
          }
        }
        fill(0); // Reset to black for next letter
      }
    }
  }
}

// Easing function for smooth animation
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

// Sweepier easing - fast start, gentle end
function easeOutQuart(t) {
  return 1 - pow(1 - t, 4);
}

function drawFeathersForLetter(letter, progress = 1, windAngle = 0) {
  if (!letter.bird) {
    // No bird found for this letter
    return;
  }

  let bird = letter.bird;
  let colorData = colorMap[bird.comName.toUpperCase()];

  if (!colorData || !colorData.colors || colorData.colors.length === 0) {
    return;
  }

  // Draw only ONE feather per letter
  let yPos = letter.featherY; // Start immediately above letter

  push();
  translate(letter.x, yPos);
  // Apply base angle plus wind sway
  rotate(PI + letter.featherAngle + windAngle);
  
  // Scale feather size based on text size so they remain proportional
  let textSizeScale = letter.size / 180; // Ratio compared to base size
  let featherLength = map(bird.wingLength || 10, 0, 300, 200, 350) * textSizeScale;
  
  drawFeather(
    featherLength * fscale,
    colorData.colors,
    progress, // Pass animation progress
    bird.randomSeed || random(1000)
  );
  
  pop();
}

function getBirdsFromSearch(_query) {
  // Extract unique letters from the query (ignore spaces and dashes)
  const uniqueLetters = [...new Set(
    _query.toUpperCase()
      .split('')
      .filter(char => char.match(/[A-Z]/))
  )].join(',');

  console.log(`Fetching birds starting with: ${uniqueLetters}`);

  // Use the startsWith endpoint with perToken=3 to get a few random birds per letter
  const searchUrl = colorserver + "search?query=startsWith:" + uniqueLetters + "&perToken=3&limit=100";
  console.log("Fetching from:", searchUrl);

  fetch(searchUrl)
    .then(res => res.json())
    .then(data => {
      console.log("=== SERVER RESPONSE ===");
      console.log("Total results:", data.results?.length);
      console.log("Results:", data.results?.map(b => b.name));
      console.log("Full response:", JSON.stringify(data, null, 2));
      onSearch(data);
    })
    .catch(err => console.error("Fetch error:", err));
}

function onSearch(_birds) {
  console.log("GOT SEARCH BIRDS: " + _birds.results.length);
  console.log("Raw search results:", _birds);

  birds = _birds.results;

  // Debug: show what birds we got for each starting letter
  let birdsByLetter = {};
  birds.forEach((b) => {
    b.comName = b.name;
    b.featherProgress = 1;
    b.randomSeed = random(10000);
    colorMap[b.comName.toUpperCase()] = b;

    // Track birds by starting letter
    let firstLetter = (b.comName || '').trim().split(/\s+/)[0]?.[0]?.toUpperCase();
    if (firstLetter) {
      if (!birdsByLetter[firstLetter]) birdsByLetter[firstLetter] = [];
      birdsByLetter[firstLetter].push(b.comName);
    }
  });

  console.log("Birds by starting letter:", birdsByLetter);
  console.log("Looking for letters:", displayText.toUpperCase().split('').filter(c => c.match(/[A-Z]/)));

  toLoad = birds.length;
  colorCount = 0;

  // Reset letterData so it gets regenerated with new birds
  letterData = [];

  colorBirds(birds);
}

function colorBirds(_birds) {
  _birds.forEach((bird) => {
    if (bird.comName) {
      let cn = bird.comName.toLowerCase();
      getColorsForBird(cn);
    } else if (bird.speciesCode) {
      let cn = bird.speciesCode;
      getColorsForBird(cn, true);
    } else {
      colorCount++;
    }
  });
}

function getColorsForBird(_birdName, isCode) {
  fetch(
    colorserver +
      "birdcolor?species=" +
      encodeURIComponent(_birdName) +
      "&isCode=" +
      encodeURIComponent(isCode)
  )
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `HTTP error! status: ${response.status} for ${_birdName}`
        );
      }
      return response.json();
    })
    .then((data) => {
      addColor(data);
    })
    .catch((error) => {
      console.error("Error fetching data:", error);
      colorCount++;
    });
}

function addColor(_data) {
  if (codeMap[_data.ebirdCode]) {
    codeMap[_data.ebirdCode].comName = _data.name;
  }
  colorMap[_data.name.toUpperCase()] = _data;

  colorCount++;
  if (colorCount == toLoad) {
    console.log("All bird colors loaded.");
    // Force regeneration of letter positions now that we have all color data
    letterData = [];
    loop();
  }
}

function drawFeather(_length, _colors, _progress = 1, _rseed = 0) {
  let newColors = [];
  _colors.forEach((col) => {
    for (let i = 0; i < Math.sqrt(col.span) * 10; i++) {
      newColors.push(col);
    }
  });
  newColors.reverse();
  
  push();
  scale(1, 1.65);
  scale(0.5);
  
  try {
    randomSeed(_rseed);
    drawFeatherSide(_length * 2, newColors, _progress);
    scale(-1, 1);
    randomSeed(_rseed);
    drawFeatherSide(_length * 2, newColors, _progress);
  } catch (_e) {
    console.error("Error in drawFeather:", _e, _colors);
  }
  
  pop();
}

function drawFeatherSide(_length, _colors, _progress = 1) {
  let hf = 0.5;
  let w = _length * 0.15;
  let h = _length * hf;
  let step = 2.5;

  let stack = 0;
  let stuck = false;

  strokeWeight(1.5);

  if (!_colors || _colors.length === 0) {
    stroke(128);
  }

  for (let i = 0; i < _length * _progress; i += step) {
    if (_colors && _colors.length > 0) {
      let colorIndex = floor(map(i, 0, _length, 0, _colors.length));
      stroke(_colors[colorIndex % _colors.length].hex);
    }

    /*
    if (!stuck && random(100) < 5) {
      stuck = true;
    }
    if (stuck && (random(100) < 20 || i > _length - 3)) {
      stuck = !stuck;
    }
    */

    let aw = sin(map(i, 0, _length, 0, PI)) * w;
    if (i < _length * 0.2) aw *= random(0.1, 0.3);

    if (!stuck) stack += step * hf + pow(i, 0.03) * 0.25;

    let p0 = createVector(0, stack * 0.75);
    let p1 = createVector(aw, stack);

    noFill();
    beginShape();
    vertex(p0.x, p0.y);
    vertex(p1.x, p1.y);
    endShape();
  }
}

// Signal render completion for server mode
function signalRenderComplete() {
  if (serverMode && !document.getElementById('render-complete')) {
    let d = document.createElement('div');
    d.id = 'render-complete';
    d.style.display = 'none';
    d.textContent = 'done';
    document.body.appendChild(d);
  }
}

// Set animation frame for video rendering (called by server)
function setAnimationFrame(frameNum, total) {
  currentFrame = frameNum;
  totalFrames = total;
  // Redraw with new frame
  redraw();
}

// Expose for server-side video rendering
window.setAnimationFrame = setAnimationFrame;

// Get current design settings for server rendering
function getCurrentSettings() {
  return {
    displayText: displayText,
    backgroundColor: bcolor ? [red(bcolor), green(bcolor), blue(bcolor)] : null,
    // Pass complete letter data including bird info and random seeds
    letterData: letterData.map(l => ({
      char: l.char,
      birdName: l.birdName,
      featherAngle: l.featherAngle,
      randomSeed: l.bird ? l.bird.randomSeed : 0,
    })),
    // Pass the color map for birds used
    birdColors: letterData
      .filter(l => l.birdName)
      .reduce((acc, l) => {
        const key = l.birdName.toUpperCase();
        if (colorMap[key]) {
          acc[key] = colorMap[key];
        }
        return acc;
      }, {}),
  };
}

// Initialize Stripe
function initStripe() {
  if (!stripe && window.Stripe && window.STRIPE_PUBLISHABLE_KEY) {
    stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);
  }
  return stripe;
}

// Track if modal is in processing state (prevent closing)
let modalProcessing = false;

// Create modal element
function createModal(content, onClose) {
  // Remove existing modal if any
  let existing = document.getElementById('purchase-modal');
  if (existing) existing.remove();

  modalProcessing = false;

  let overlay = document.createElement('div');
  overlay.id = 'purchase-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="closeModal()">&times;</button>
      ${content}
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on overlay click (only if not processing)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && !modalProcessing) {
      closeModal();
      if (onClose) onClose();
    }
  });

  return overlay;
}

function closeModal() {
  // Don't close if processing
  if (modalProcessing) return;

  let modal = document.getElementById('purchase-modal');
  if (modal) modal.remove();
  cardElement = null;
}

// Set modal to processing state (prevents closing)
function setModalProcessing(processing) {
  modalProcessing = processing;
  const closeBtn = document.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.style.display = processing ? 'none' : 'block';
  }
}

// Start digital download (free with optional tip)
function startDigitalDownload() {
  const modalContent = `
    <h2>Download High-Resolution Image</h2>
    <p style="margin-bottom: 8px;"><strong>4800 x 4800 pixels</strong> (16" x 16" at 300 DPI)</p>
    <p>Your high-res image is free! If you'd like to support this project, consider sending a tip.</p>
    <div class="venmo-tip-box">
      <a href="https://venmo.com/u/Jer-Thorp?txn=pay&amount=5&note=FeatherType" target="_blank" class="venmo-link">
        <img src="https://cdn.worldvectorlogo.com/logos/venmo.svg" alt="Venmo" class="venmo-logo">
        <span class="venmo-handle">@Jer-Thorp</span>
      </a>
      <p class="venmo-note">Suggested tip: $5</p>
    </div>
    <button onclick="handleDigitalDownload()" id="download-button" class="submit-button">
      <span id="download-button-text">Get 🖼️</span>
      <span id="download-spinner" class="spinner hidden"></span>
    </button>
  `;

  createModal(modalContent);
}

// Handle digital download
async function handleDigitalDownload() {
  const button = document.getElementById('download-button');
  const buttonText = document.getElementById('download-button-text');
  const spinner = document.getElementById('download-spinner');

  button.disabled = true;
  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const response = await fetch('/render-digital', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: getCurrentSettings(),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    // Show success message with download link
    const modalContent = document.querySelector('.modal-content');
    modalContent.innerHTML = `
      <h2>Your Image is Ready!</h2>
      <p>Thanks for using FeatherType!</p>
      <a href="${data.downloadUrl}" download class="download-link">Download Image</a>
      <div class="venmo-tip-box" style="margin-top: 20px;">
        <p style="margin: 0 0 8px 0; font-size: 14px;">Enjoying FeatherType? Suggested tip: $5</p>
        <a href="https://venmo.com/u/Jer-Thorp?txn=pay&amount=5&note=FeatherType" target="_blank" class="venmo-link">
          <img src="https://cdn.worldvectorlogo.com/logos/venmo.svg" alt="Venmo" class="venmo-logo">
          <span class="venmo-handle">@Jer-Thorp</span>
        </a>
      </div>
      <button onclick="closeModal()" class="submit-button" style="margin-top: 20px;">Close</button>
    `;
  } catch (error) {
    alert('Error generating image: ' + error.message);
    button.disabled = false;
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

// Start print purchase (2-step process)
function startPrintPurchase() {
  currentPurchase.type = 'print';

  const modalContent = `
    <h2>Order a Print</h2>
    <form id="address-form" onsubmit="handleAddressSubmit(event)">
      <div class="form-group">
        <label>Select Size & Style <span class="info-icon" onclick="showPrintInfo()" title="Print info">ⓘ</span></label>
        <div class="product-options">
          <label class="product-option">
            <input type="radio" name="productType" value="print-12x12" checked>
            <span class="option-content">
              <span class="option-name">12x12 Print</span>
              <span class="option-price">$25.00</span>
            </span>
          </label>
          <label class="product-option">
            <input type="radio" name="productType" value="print-12x12-framed">
            <span class="option-content">
              <span class="option-name">12x12 Framed</span>
              <span class="option-price">$90.00</span>
            </span>
          </label>
          <label class="product-option">
            <input type="radio" name="productType" value="print-16x16">
            <span class="option-content">
              <span class="option-name">16x16 Print</span>
              <span class="option-price">$35.00</span>
            </span>
          </label>
          <label class="product-option">
            <input type="radio" name="productType" value="print-16x16-framed">
            <span class="option-content">
              <span class="option-name">16x16 Framed</span>
              <span class="option-price">$120.00</span>
            </span>
          </label>
        </div>
      </div>
      <div class="form-group hidden" id="frame-color-group">
        <label for="frame-color">Frame Color</label>
        <select id="frame-color" name="frameColor">
          <option value="black">Black</option>
          <option value="white">White</option>
          <option value="brown">Brown</option>
          <option value="darkgrey">Dark Grey</option>
          <option value="lightgrey">Light Grey</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="name">Full Name</label>
          <input type="text" id="name" name="name" required placeholder="John Doe">
        </div>
      </div>
      <div class="form-group">
        <label for="print-email">Email Address</label>
        <input type="email" id="print-email" name="email" required placeholder="your@email.com">
      </div>
      <div class="form-group">
        <label for="address1">Street Address</label>
        <input type="text" id="address1" name="address1" required placeholder="123 Main St">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="city">City</label>
          <input type="text" id="city" name="city" required placeholder="New York">
        </div>
        <div class="form-group">
          <label for="state">State</label>
          <input type="text" id="state" name="state" required placeholder="NY">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="zip">ZIP Code</label>
          <input type="text" id="zip" name="zip" required placeholder="10001">
        </div>
        <div class="form-group">
          <label for="country">Country</label>
          <select id="country" name="country" required>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="GB">United Kingdom</option>
            <option value="AU">Australia</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label for="print-discount">Discount Code (optional)</label>
        <input type="text" id="print-discount" name="discountCode" placeholder="Enter code">
      </div>
      <button type="submit" id="address-submit" class="submit-button">
        <span id="address-button-text">Get Shipping Quote</span>
        <span id="address-spinner" class="spinner hidden"></span>
      </button>
    </form>
  `;

  createModal(modalContent);

  // Show/hide frame color based on product selection
  const productOptions = document.querySelectorAll('input[name="productType"]');
  const frameColorGroup = document.getElementById('frame-color-group');

  const updateFrameColorVisibility = () => {
    const selected = document.querySelector('input[name="productType"]:checked').value;
    if (selected.includes('framed')) {
      frameColorGroup.classList.remove('hidden');
    } else {
      frameColorGroup.classList.add('hidden');
    }
  };

  productOptions.forEach(option => {
    option.addEventListener('change', updateFrameColorVisibility);
  });
}

// Handle address form submission - get shipping quote
async function handleAddressSubmit(event) {
  event.preventDefault();

  const submitButton = document.getElementById('address-submit');
  const buttonText = document.getElementById('address-button-text');
  const spinner = document.getElementById('address-spinner');

  submitButton.disabled = true;
  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  const productType = document.querySelector('input[name="productType"]:checked').value;
  const frameColor = document.getElementById('frame-color').value;

  const address = {
    name: document.getElementById('name').value,
    address1: document.getElementById('address1').value,
    city: document.getElementById('city').value,
    state: document.getElementById('state').value,
    zip: document.getElementById('zip').value,
    country: document.getElementById('country').value,
  };

  const email = document.getElementById('print-email').value;
  const discountCode = document.getElementById('print-discount').value;

  try {
    const response = await fetch('/get-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: address,
        email: email,
        discountCode: discountCode,
        productType: productType,
        frameColor: frameColor,
        settings: getCurrentSettings(),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    // Store purchase details
    currentPurchase.clientSecret = data.clientSecret;
    currentPurchase.email = email;
    currentPurchase.address = address;
    currentPurchase.productType = productType;
    currentPurchase.frameColor = frameColor;
    currentPurchase.productName = data.productName;
    currentPurchase.productPrice = data.productPrice;
    currentPurchase.shippingCost = data.shippingCost;
    currentPurchase.totalAmount = data.totalAmount;

    // Show payment step
    showPaymentStep();
  } catch (error) {
    alert('Error getting shipping quote: ' + error.message);
    submitButton.disabled = false;
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

// Show payment step with price breakdown
function showPaymentStep() {
  const modalContent = document.querySelector('.modal-content');

  modalContent.innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h2>Complete Your Order</h2>
    <div class="price-breakdown">
      <div class="price-row">
        <span>${currentPurchase.productName}</span>
        <span>$${(currentPurchase.productPrice / 100).toFixed(2)}</span>
      </div>
      <div class="price-row">
        <span>Shipping</span>
        <span>$${(currentPurchase.shippingCost / 100).toFixed(2)}</span>
      </div>
      <div class="price-row total">
        <span>Total</span>
        <span>$${(currentPurchase.totalAmount / 100).toFixed(2)}</span>
      </div>
    </div>
    <form id="payment-form" onsubmit="handlePrintPayment(event)">
      <div class="form-group">
        <label>Card Details</label>
        <div id="card-element"></div>
        <div id="card-errors" class="error-message"></div>
        <div style="margin-top: 8px; text-align: right;">
          <img src="https://cdn.brandfolder.io/KGT2DTA4/at/8vbr8k4mr5xjwk4hxq4t9vs/Powered_by_Stripe_-_blurple.svg" alt="Powered by Stripe" style="height: 20px;">
        </div>
      </div>
      <button type="submit" id="pay-submit" class="submit-button">
        <span id="pay-button-text">Pay $${(currentPurchase.totalAmount / 100).toFixed(2)}</span>
        <span id="pay-spinner" class="spinner hidden"></span>
      </button>
    </form>
  `;

  // Initialize Stripe Elements
  initStripe();
  if (stripe) {
    const elements = stripe.elements();
    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#333',
          '::placeholder': { color: '#aab7c4' },
        },
      },
    });
    cardElement.mount('#card-element');

    cardElement.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      displayError.textContent = event.error ? event.error.message : '';
    });
  }
}

// Handle print payment
async function handlePrintPayment(event) {
  event.preventDefault();

  const submitButton = document.getElementById('pay-submit');
  const buttonText = document.getElementById('pay-button-text');
  const spinner = document.getElementById('pay-spinner');

  submitButton.disabled = true;
  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const { error, paymentIntent } = await stripe.confirmCardPayment(currentPurchase.clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (paymentIntent.status === 'succeeded') {
      await finalizePrintOrder(paymentIntent.id);
    }
  } catch (error) {
    const errorDiv = document.getElementById('card-errors');
    errorDiv.textContent = error.message;
    submitButton.disabled = false;
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

// Finalize print order
async function finalizePrintOrder(paymentIntentId) {
  try {
    const response = await fetch('/finalize-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId: paymentIntentId,
        settings: getCurrentSettings(),
        address: currentPurchase.address,
        email: currentPurchase.email,
        productType: currentPurchase.productType,
        frameColor: currentPurchase.frameColor,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    // Show success message
    const modalContent = document.querySelector('.modal-content');
    modalContent.innerHTML = `
      <h2>Order Confirmed!</h2>
      <p>Your print has been ordered and will ship soon.</p>
      <p>Order ID: ${data.orderId}</p>
      <p class="modal-note">A confirmation email has been sent to ${currentPurchase.email}</p>
      <button onclick="closeModal()" class="submit-button" style="margin-top: 20px;">Close</button>
    `;
  } catch (error) {
    const errorDiv = document.getElementById('card-errors');
    if (errorDiv) errorDiv.textContent = error.message;
  }
}

// Show info modal
function showInfoModal() {
  const modalContent = `
    <h2>What is FeatherType?</h2>
    <p>FeatherType generates unique text art using the colors of bird feathers. Each letter is paired with a bird whose name starts with that letter.</p>
    <p>The colors for each feather are extracted from plumage descriptions on Wikipedia, translating words into the palette of each species.</p>
    <p>Type any word or phrase, and watch as birds from around the world come together to spell it out.</p>
    <p><a href="https://www.jerthorp.me/post/of-a-feather" target="_blank" style="color: #2563eb;">Read more about the project</a></p>
    <p style="margin-top: 10px;">Created by <a href="https://jerthorp.com" target="_blank" style="color: #2563eb;">Jer Thorp</a></p>
    <button onclick="closeModal()" class="submit-button" style="margin-top: 20px;">Close</button>
  `;

  createModal(modalContent);
}

// Show print info popup
function showPrintInfo() {
  event.stopPropagation();

  // Remove existing popup if any
  let existing = document.getElementById('print-info-popup');
  if (existing) {
    existing.remove();
    return;
  }

  let popup = document.createElement('div');
  popup.id = 'print-info-popup';
  popup.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    z-index: 3000;
    max-width: 350px;
    font-size: 14px;
    line-height: 1.5;
  `;
  popup.innerHTML = `
    <p style="margin: 0 0 12px 0;"><strong>About Our Prints</strong></p>
    <p style="margin: 0 0 12px 0;">Art prints are on Enhanced Matte Art paper, 200gsm, and are printed with archival quality inks.</p>
    <p style="margin: 0 0 12px 0;">Unframed prints ship locally to the US, Canada, UK, EU and Australia!</p>
    <p style="margin: 0;">Framed prints ship locally to the US and the UK.</p>
    <button onclick="document.getElementById('print-info-popup').remove()" style="margin-top: 15px; padding: 8px 16px; border: none; background: #333; color: white; border-radius: 6px; cursor: pointer;">Got it</button>
  `;

  document.body.appendChild(popup);

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', closePopup);
      }
    });
  }, 100);
}

// Make showPrintInfo available globally
window.showPrintInfo = showPrintInfo;

// Show sample video in a player
function showSampleVideo() {
  const videoModal = document.createElement('div');
  videoModal.id = 'sample-video-modal';
  videoModal.className = 'modal-overlay';
  videoModal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <button class="modal-close" onclick="document.getElementById('sample-video-modal').remove()">&times;</button>
      <h2>Sample Video</h2>
      <video controls autoplay loop playsinline style="width: 100%; border-radius: 8px; margin: 15px 0;">
        <source src="/prints/feathertype-1769623470552-08i1r32em.mp4" type="video/mp4">
        Your browser does not support video playback.
      </video>
      <button onclick="document.getElementById('sample-video-modal').remove()" class="submit-button">Close</button>
    </div>
  `;
  document.body.appendChild(videoModal);

  // Close on overlay click
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) {
      videoModal.remove();
    }
  });
}

window.showSampleVideo = showSampleVideo;

// Start video purchase
function startVideoPurchase() {
  currentPurchase.type = 'video';

  // Get thumbnail from current canvas
  const canvas = document.querySelector('canvas');
  const thumbnail = canvas ? canvas.toDataURL('image/jpeg', 0.7) : '';

  const modalContent = `
    <h2>Download Animated Video</h2>
    <p class="modal-price" id="video-price">$5.00</p>
    <p>Get a 5-second animated MP4 video (1080x1080) of your feather text design.</p>
    ${thumbnail ? `<div style="text-align: center; margin: 15px 0;">
      <img src="${thumbnail}" style="max-width: 200px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
    </div>` : ''}
    <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
      <a href="#" onclick="showSampleVideo(); return false;" style="color: #2563eb;">See sample video →</a><br>
      Videos are rendered on our server and may take 1-2 minutes to generate.
    </p>
    <form id="video-form" onsubmit="handleVideoSubmit(event)">
      <div class="form-group">
        <label for="video-email">Email Address</label>
        <input type="email" id="video-email" name="email" required placeholder="your@email.com">
      </div>
      <div class="form-group">
        <label for="video-discount">Discount Code (optional)</label>
        <input type="text" id="video-discount" name="discountCode" placeholder="Enter code">
        <div id="discount-status" style="font-size: 13px; margin-top: 4px;"></div>
      </div>
      <div id="card-section">
        <div class="form-group">
          <label>Card Details</label>
          <div id="card-element"></div>
          <div id="card-errors" class="error-message"></div>
          <div style="margin-top: 8px; text-align: right;">
            <img src="https://cdn.brandfolder.io/KGT2DTA4/at/8vbr8k4mr5xjwk4hxq4t9vs/Powered_by_Stripe_-_blurple.svg" alt="Powered by Stripe" style="height: 20px;">
          </div>
        </div>
      </div>
      <button type="submit" id="video-submit" class="submit-button">
        <span id="video-button-text">Get 🎬 $5.00</span>
        <span id="video-spinner" class="spinner hidden"></span>
      </button>
    </form>
  `;

  createModal(modalContent);

  // Add discount code checker
  const discountInput = document.getElementById('video-discount');
  let discountTimeout;
  discountInput.addEventListener('input', () => {
    clearTimeout(discountTimeout);
    discountTimeout = setTimeout(() => checkVideoDiscount(), 500);
  });

  // Initialize Stripe Elements
  initStripe();
  if (stripe) {
    const elements = stripe.elements();
    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#333',
          '::placeholder': { color: '#aab7c4' },
        },
      },
    });
    cardElement.mount('#card-element');

    cardElement.on('change', (event) => {
      const displayError = document.getElementById('card-errors');
      displayError.textContent = event.error ? event.error.message : '';
    });
  }
}

// Check video discount code and update price display
async function checkVideoDiscount() {
  const discountCode = document.getElementById('video-discount').value.trim();
  const priceEl = document.getElementById('video-price');
  const buttonText = document.getElementById('video-button-text');
  const cardSection = document.getElementById('card-section');
  const statusEl = document.getElementById('discount-status');

  if (!discountCode) {
    priceEl.textContent = '$5.00';
    buttonText.textContent = 'Get 🎬 $5.00';
    cardSection.classList.remove('hidden');
    statusEl.textContent = '';
    return;
  }

  try {
    const response = await fetch('/check-discount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discountCode, productPrice: 1000 }),
    });

    const data = await response.json();
    if (data.valid) {
      const newPrice = data.discountedPrice / 100;
      if (newPrice === 0) {
        priceEl.textContent = 'FREE';
        buttonText.textContent = 'Get 🎬';
        cardSection.classList.add('hidden');
        statusEl.innerHTML = '<span style="color: #059669;">100% discount applied!</span>';
      } else {
        priceEl.textContent = `$${newPrice.toFixed(2)}`;
        buttonText.textContent = `Get 🎬 $${newPrice.toFixed(2)}`;
        cardSection.classList.remove('hidden');
        statusEl.innerHTML = `<span style="color: #059669;">${Math.round(data.discountPercent * 100)}% discount applied!</span>`;
      }
    } else {
      priceEl.textContent = '$5.00';
      buttonText.textContent = 'Get 🎬 $5.00';
      cardSection.classList.remove('hidden');
      statusEl.innerHTML = '<span style="color: #dc2626;">Invalid code</span>';
    }
  } catch (error) {
    statusEl.textContent = '';
  }
}

// Handle video form submission
async function handleVideoSubmit(event) {
  event.preventDefault();

  const submitButton = document.getElementById('video-submit');
  const buttonText = document.getElementById('video-button-text');
  const spinner = document.getElementById('video-spinner');

  submitButton.disabled = true;
  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  const email = document.getElementById('video-email').value;
  const discountCode = document.getElementById('video-discount').value;

  try {
    // Create payment intent
    const response = await fetch('/purchase-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        discountCode: discountCode,
        settings: getCurrentSettings(),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    // Show rendering message helper (prevents modal from being closed)
    const showRenderingMessage = () => {
      setModalProcessing(true);
      const modalContent = document.querySelector('.modal-content');
      modalContent.innerHTML = `
        <h2>Rendering Your Video...</h2>
        <p>This may take a minute. Please wait.</p>
        <div style="display: flex; justify-content: center; margin: 30px 0;">
          <span class="spinner" style="width: 40px; height: 40px; border-width: 3px;"></span>
        </div>
      `;
    };

    // Handle free video (100% discount)
    if (data.freeWithCode) {
      showRenderingMessage();
      await finalizeVideoOrder(null, email);
      return;
    }

    // Confirm payment
    const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (paymentIntent.status === 'succeeded') {
      showRenderingMessage();
      await finalizeVideoOrder(paymentIntent.id, email);
    }
  } catch (error) {
    const errorDiv = document.getElementById('card-errors');
    if (errorDiv) errorDiv.textContent = error.message;
    submitButton.disabled = false;
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

// Finalize video order
async function finalizeVideoOrder(paymentIntentId, email) {
  try {
    const response = await fetch('/finalize-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId: paymentIntentId,
        settings: getCurrentSettings(),
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    // Allow modal to be closed now
    setModalProcessing(false);

    // Show success message with video player
    const modalContent = document.querySelector('.modal-content');
    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <h2>Your Video is Ready!</h2>
      <video controls autoplay loop playsinline style="width: 100%; max-width: 400px; border-radius: 8px; margin: 15px 0;">
        <source src="${data.downloadUrl}" type="video/mp4">
        Your browser does not support video playback.
      </video>
      <div style="text-align: center;">
        <a href="${data.downloadUrl}" download class="download-link">Download Video</a>
      </div>
      <p class="modal-note" style="margin-top: 15px;">A receipt has been sent to ${email}</p>
      <button onclick="closeModal()" class="submit-button" style="margin-top: 20px;">Close</button>
    `;
  } catch (error) {
    // Allow modal to be closed on error too
    setModalProcessing(false);

    const modalContent = document.querySelector('.modal-content');
    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <h2>Error</h2>
      <p>There was an error rendering your video: ${error.message}</p>
      <p>Your payment was processed. Please contact support.</p>
      <button onclick="closeModal()" class="submit-button" style="margin-top: 20px;">Close</button>
    `;
  }
}

// Make functions available globally for onclick handlers
window.handleDigitalDownload = handleDigitalDownload;
window.handleAddressSubmit = handleAddressSubmit;
window.handlePrintPayment = handlePrintPayment;
window.handleVideoSubmit = handleVideoSubmit;
window.closeModal = closeModal;
window.showInfoModal = showInfoModal;
