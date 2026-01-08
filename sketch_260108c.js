// =====================================================
//  Interactive Bubble + ECG Intro (p5.js / WEBGL)
//  - Ported from Processing (P3D) to p5.js (WEBGL)
//  - Mic reactive ECG using p5.sound (AudioIn + Amplitude)
//  - Stars + Bubbles + Zoom + Music Detail + Phone Prompt
//  - 2D overlays are drawn in screen space with resetMatrix()
// =====================================================

// ---------------------
// Sound (Mic reactive ECG)
// ---------------------
let micIn, micAmp;
let enableMic = true;
let micLevelSmoothed = 0; // 0..1
let micReady = false;     // becomes true after user gesture

// ---------------------
// Globals
// ---------------------
let bubbles = [];
let avatarImages = [];

let selectedBubble = null;
let zoomProgress = 0;

let selectedRecord = null;
let musicDetailProgress = 0;

let phonePromptProgress = 0;

// Display modes
// -2: ECG (first)
// -1: Message
//  0: Bubble normal
//  1: Bubble zoom
//  2: Music detail
//  3: Phone prompt
let displayMode = -2;

// Stars
let stars = [];

// ECG data
let ecgPoints = [];
let ecgOffset = 0;
let introTimer = 0;

let ecgAmplitudeBase = 1.0;
let ecgWaveLengthBase = 520; // wider look
let ecgDrift = 0;

// Pulse circle
let pulseCircleSize = 0;
let pulsePhase = 0;

// =====================================================
// Helpers: depth test toggling for 2D overlays in WEBGL
// =====================================================
function disableDepth() {
  const gl = drawingContext;
  gl.disable(gl.DEPTH_TEST);
}
function enableDepth() {
  const gl = drawingContext;
  gl.enable(gl.DEPTH_TEST);
}

// Screen-space drawing in WEBGL:
// resetMatrix() resets to identity in WEBGL; origin becomes canvas center.
// We translate to top-left for 2D UI.
function begin2D() {
  push();
  resetMatrix();
  translate(-width / 2, -height / 2);
  disableDepth();
}
function end2D() {
  enableDepth();
  pop();
}

// ---------------------
// preload
// ---------------------
function preload() {
  // Load avatars from assets/
  avatarImages[0] = loadImage("assets/avatar1.png");
  avatarImages[1] = loadImage("assets/avatar2.png");
  avatarImages[2] = loadImage("assets/avatar3.png");
}

// ---------------------
// setup
// ---------------------
function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  smooth();

  // Try to initialize mic; actual audio permission requires user gesture
  try {
    micIn = new p5.AudioIn();
    micAmp = new p5.Amplitude();
  } catch (e) {
    enableMic = false;
  }

  generateECG(0.0);

  // Stars
  stars = [];
  for (let i = 0; i < 280; i++) stars.push(new Star());

  // Bubbles
  bubbles = [];
  const bubbleSize = min(width, height) / 2.5;

  // Front interactive bubbles
  for (let i = 0; i < 10; i++) {
    const angle = random(TWO_PI);
    const distance = random(width * 0.2, width * 0.6);
    const x = cos(angle) * distance;
    const y = sin(angle) * distance;
    const z = random(-300, 300);
    bubbles.push(new Bubble(x, y, z, bubbleSize, true));
  }

  // Background decorative bubbles
  for (let i = 0; i < 10; i++) {
    const angle = random(TWO_PI);
    const distance = random(width * 0.5, width * 1.5);
    const x = cos(angle) * distance;
    const y = sin(angle) * distance;
    const z = random(-1500, -600);
    bubbles.push(new Bubble(x, y, z, bubbleSize * random(0.8, 1.5), false));
  }
}

// ---------------------
// window resize
// ---------------------
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// =====================================================
// Music info
// =====================================================
class MusicInfo {
  constructor() {
    const titles = ["Midnight Dreams", "Summer Breeze", "Electric Soul", "Neon Lights", "Ocean Waves", "City Pulse"];
    const artists = ["The Dreamers", "Soul Collective", "Digital Hearts", "Night Riders", "Wave Makers", "Urban Sound"];
    const albums = ["Night Sessions", "Golden Hour", "Future Sounds", "Endless Journey", "Deep Blue", "Metropolitan"];

    this.title = random(titles);
    this.artist = random(artists);
    this.album = random(albums);
    this.albumColor = color(random(100, 255), random(100, 255), random(100, 255));
  }
}

// =====================================================
// Star (stable projection) - drawn in 2D pass
// =====================================================
class Star {
  constructor() {
    this.x = random(-width * 2, width * 2);
    this.y = random(-height * 2, height * 2);
    this.z = random(200, 2400);
    this.brightness = random(100, 255);
    this.twinkleSpeed = random(0.01, 0.03);
    this.twinklePhase = random(TWO_PI);
  }

  update() {
    this.twinklePhase += this.twinkleSpeed;
  }

  display2D() {
    const f = min(width, height) * 0.9;
    const screenX = width / 2 + (this.x / this.z) * f;
    const screenY = height / 2 + (this.y / this.z) * f;

    const size = map(this.z, 200, 2400, 2.8, 0.6);
    const a = this.brightness * (0.7 + 0.3 * sin(this.twinklePhase));

    noStroke();
    fill(255, a);
    circle(screenX, screenY, size);
  }
}

// =====================================================
// Music Record (each record has its own MusicInfo)
// =====================================================
class MusicRecord {
  constructor() {
    const angle = random(TWO_PI);
    const distance = random(40, 80);
    this.pos = createVector(cos(angle) * distance, sin(angle) * distance);
    this.vel = p5.Vector.random2D().mult(0.3);
    this.size = random(18, 30);
    this.rotation = random(TWO_PI);
    this.recordColor = color(random(40, 80), random(40, 80), random(40, 80));
    this.info = new MusicInfo();
  }

  update() {
    this.pos.add(this.vel);
    this.rotation += 0.02;

    const maxDist = 70;
    if (this.pos.mag() > maxDist) {
      const normal = this.pos.copy().normalize();
      const dotProduct = this.vel.dot(normal);
      this.vel.sub(p5.Vector.mult(normal, 2 * dotProduct));
      this.pos = normal.mult(maxDist);
    }
  }

  display(a) {
    push();
    translate(this.pos.x, this.pos.y, 0);
    rotateZ(this.rotation);

    fill(red(this.recordColor), green(this.recordColor), blue(this.recordColor), a * 220);
    stroke(0, a * 120);
    strokeWeight(1.5);
    circle(0, 0, this.size);

    fill(100, a * 180);
    noStroke();
    circle(0, 0, this.size * 0.3);

    noFill();
    stroke(0, a * 60);
    strokeWeight(0.8);
    for (let i = 1; i < 5; i++) circle(0, 0, this.size * 0.4 + i * 2.5);

    pop();
  }
}

// =====================================================
// Bubble (soap bubble look, optimized)
// =====================================================
class Bubble {
  constructor(x, y, z, s, interactive) {
    this.pos = createVector(x, y);
    this.z = z;
    this.vel = p5.Vector.random2D().mult(random(0.15, 0.4));
    this.size = s;
    this.rotation = random(TWO_PI);
    this.rotSpeed = random(-0.005, 0.005);
    this.isInteractive = interactive;

    const colorType = floor(random(8));
    switch (colorType) {
      case 0: this.bubbleColor = color(random(80, 150), random(150, 220), random(200, 255)); break;
      case 1: this.bubbleColor = color(random(180, 255), random(100, 180), random(200, 255)); break;
      case 2: this.bubbleColor = color(random(220, 255), random(150, 200), random(80, 140)); break;
      case 3: this.bubbleColor = color(random(100, 180), random(200, 255), random(150, 200)); break;
      case 4: this.bubbleColor = color(random(220, 255), random(100, 150), random(140, 200)); break;
      case 5: this.bubbleColor = color(random(80, 150), random(200, 255), random(200, 255)); break;
      case 6: this.bubbleColor = color(random(150, 200), random(100, 160), random(220, 255)); break;
      case 7: this.bubbleColor = color(random(180, 230), random(220, 255), random(100, 160)); break;
    }

    this.alpha = random(0.16, 0.30);
    this.pulsePhase = random(TWO_PI);

    this.avatarImage = null;
    this.records = null;

    if (this.isInteractive) {
      if (avatarImages && avatarImages.length > 0) {
        this.avatarImage = random(avatarImages);
      }
      this.records = [];
      for (let i = 0; i < 10; i++) this.records.push(new MusicRecord());
    }
  }

  update() {
    this.pos.add(this.vel);
    this.rotation += this.rotSpeed;
    this.pulsePhase += 0.02;

    if (this.isInteractive && this.records) {
      for (const r of this.records) r.update();
    }

    const boundary = width * 1.2;
    if (this.pos.x < -boundary || this.pos.x > boundary) {
      this.vel.x *= -1;
      this.pos.x = constrain(this.pos.x, -boundary, boundary);
    }
    if (this.pos.y < -height || this.pos.y > height) {
      this.vel.y *= -1;
      this.pos.y = constrain(this.pos.y, -height, height);
    }

    if (this.isInteractive) {
      for (const other of bubbles) {
        if (other !== this && other.isInteractive && abs(this.z - other.z) < 200) {
          const d = p5.Vector.dist(this.pos, other.pos);
          if (d < (this.size + other.size) / 2) {
            const pushDir = p5.Vector.sub(this.pos, other.pos).normalize();
            this.vel.add(pushDir.mult(0.1));
            this.vel.limit(0.6);
          }
        }
      }
    }
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y, this.z);

    const depthScale = map(this.z, -1500, 500, 0.3, 1.2);
    const depthAlpha = map(this.z, -1500, 500, 0.25, 1.0);
    scale(depthScale);

    rotateY(this.rotation);
    rotateX(sin(this.pulsePhase) * 0.08);

    const pulse = 1 + sin(this.pulsePhase) * 0.04;
    const currentSize = this.size * pulse;

    this.drawSoapBubbleSphere(currentSize / 2, depthAlpha);

    pop();
  }

  drawSoapBubbleSphere(r, depthAlpha) {
    noStroke();

    // weaker material (avoid blowout)
    specularMaterial(255);
    shininess(10);

    let a = 255 * this.alpha * depthAlpha;
    a *= 0.85;

    ambientMaterial(red(this.bubbleColor), green(this.bubbleColor), blue(this.bubbleColor), a);

    const depthScale = map(this.z, -1500, 500, 0.3, 1.2);
    let detail = floor(map(depthScale, 0.3, 1.2, 12, 32));
    detail = constrain(detail, 10, 34);

    sphereDetail(detail);
    sphere(r);

    // rim (screen-space circle after 3D sphere is expensive; we keep simple 2D rim in local plane)
    push();
    noFill();

    const rimA1 = 38 * depthAlpha;
    const rimA2 = 18 * depthAlpha;

    const hueT = (sin(frameCount * 0.008) * 0.5 + 0.5);
    const rimC1 = lerpColor(color(120, 220, 255), color(255, 180, 230), hueT);
    const rimC2 = lerpColor(color(150, 255, 150), color(255, 240, 150), 1 - hueT);

    stroke(rimC1, rimA1);
    strokeWeight(1.6);
    // draw in XY plane
    circle(0, 0, r * 2.02);

    stroke(rimC2, rimA2);
    strokeWeight(2.6);
    circle(0, 0, r * 2.07);

    pop();
  }

  displayMusicRecords() {
    if (!this.isInteractive || !this.records) return;

    push();
    translate(0, this.size * 0.15, 0);

    for (const r of this.records) {
      r.update();
      r.display(1.0);
    }

    pop();
  }

  isClicked(mx, my) {
    if (!this.isInteractive) return false;

    const depthScale = map(this.z, -1500, 500, 0.3, 1.2);
    // screen coordinates: Processing used +width/2, +height/2
    // p5 WEBGL origin is center, but mouseX/mouseY are top-left.
    const screenX = this.pos.x + width / 2;
    const screenY = this.pos.y + height / 2;

    const d = dist(mx, my, screenX, screenY);
    return d < (this.size * depthScale) / 2;
  }
}

// =====================================================
// ECG generation
// =====================================================
function generateECG(micLevel01) {
  ecgPoints = [];

  const amp = ecgAmplitudeBase * lerp(0.9, 1.45, micLevel01);
  const noiseAmt = lerp(0.6, 2.2, micLevel01);
  const waveLength = ecgWaveLengthBase * lerp(1.05, 0.85, micLevel01);

  for (let i = 0; i < width * 2; i += 3) {
    // you had: height/2 + 120
    let y = height / 2 + 120;

    const drift = sin((i * 0.002) + ecgDrift) * 4.0;
    y += drift;

    y += random(-2.0, 2.0) * amp * noiseAmt;

    const spikePos = (i % waveLength);
    const spikeProgress = spikePos / waveLength;

    if (spikeProgress < 0.06) {
      y -= sin((spikeProgress / 0.06) * PI) * 10 * amp;
    } else if (spikeProgress > 0.17 && spikeProgress < 0.28) {
      const qrsProgress = (spikeProgress - 0.17) / 0.11;
      if (qrsProgress < 0.28) {
        y += sin((qrsProgress / 0.28) * PI) * 22 * amp;
      } else if (qrsProgress < 0.52) {
        y -= sin(((qrsProgress - 0.28) / 0.24) * PI) * 150 * amp;
      } else {
        y += sin(((qrsProgress - 0.52) / 0.48) * PI) * 40 * amp;
      }
    } else if (spikeProgress > 0.43 && spikeProgress < 0.54) {
      y -= sin(((spikeProgress - 0.43) / 0.11) * PI) * 18 * amp;
    }

    ecgPoints.push(createVector(i, y));
  }
}

// =====================================================
// Lighting for bubbles (once per frame)
// =====================================================
function setupBubbleLights() {
  // p5 WEBGL lights
  ambientLight(18, 18, 24);
  directionalLight(55, 55, 65, -0.2, -0.6, -1);
  directionalLight(28, 32, 45, 0.8, 0.2, -1);
}

// =====================================================
// 2D Avatars overlay (centered in floating bubble scene)
// =====================================================
function drawAvatarsOverlayNormal() {
  begin2D();
  imageMode(CENTER);

  for (const b of bubbles) {
    if (!b.isInteractive || !b.avatarImage) continue;

    const depthScale = map(b.z, -1500, 500, 0.3, 1.2);
    const depthAlpha = map(b.z, -1500, 500, 0.25, 1.0);

    const screenX = width / 2 + b.pos.x;
    const screenY = height / 2 + b.pos.y;

    const avatarSize = (b.size * 0.36) * depthScale;

    tint(255, 180 * depthAlpha);
    image(b.avatarImage, screenX, screenY, avatarSize, avatarSize);
  }

  noTint();
  end2D();
}

function drawAvatarOverlayZoom(t) {
  if (!selectedBubble || !selectedBubble.isInteractive || !selectedBubble.avatarImage) return;

  const a = 220 * t;
  const avatarSize = (selectedBubble.size * 0.42) * lerp(1, 1.20, t);

  begin2D();
  imageMode(CENTER);
  tint(255, a);

  // You set height/4 in Processing version:
  image(selectedBubble.avatarImage, width / 2, height / 4, avatarSize, avatarSize);

  noTint();
  end2D();
}

// =====================================================
// Main draw
// =====================================================
function draw() {
  background(5, 10, 20);

  // mic smoothing (requires user gesture to start)
  let micNow = 0;
  if (enableMic && micReady && micAmp) {
    micNow = constrain(micAmp.getLevel() * 7.0, 0, 1);
  }
  micLevelSmoothed = lerp(micLevelSmoothed, micNow, 0.08);

  if (displayMode === -2) {
    drawECGScreen(micLevelSmoothed);

  } else if (displayMode === -1) {
    drawMessageScreen();

  } else if (displayMode === 3) {
    if (phonePromptProgress < 1) phonePromptProgress += 0.03;
    drawPhonePrompt();

  } else if (displayMode === 2) {
    if (musicDetailProgress < 1) musicDetailProgress += 0.05;
    if (phonePromptProgress > 0) phonePromptProgress -= 0.1;
    drawMusicDetail();

  } else if (displayMode === 1) {
    if (zoomProgress < 1) zoomProgress += 0.05;
    if (musicDetailProgress > 0) musicDetailProgress -= 0.1;
    if (phonePromptProgress > 0) phonePromptProgress -= 0.1;
    drawZoomedBubble();

  } else {
    if (zoomProgress > 0) zoomProgress -= 0.05;
    if (musicDetailProgress > 0) musicDetailProgress -= 0.1;
    if (phonePromptProgress > 0) phonePromptProgress -= 0.1;

    // Stars (2D)
    begin2D();
    for (const s of stars) { s.update(); s.display2D(); }
    end2D();

    // Bubbles (3D)
    setupBubbleLights();

    // sort far -> near
    bubbles.sort((a, b) => a.z - b.z);

    // draw bubbles around center (WEBGL origin is already center)
    for (const b of bubbles) {
      b.update();
      b.display();
    }

    // Avatars overlay (2D)
    drawAvatarsOverlayNormal();
  }
}

// =====================================================
// ECG Screen (2D)
// =====================================================
function drawECGScreen(micLevel01) {
  // background is already set in draw()
  begin2D();
  background(10, 15, 25);

  ecgOffset -= 2.0;
  if (ecgOffset < -width) ecgOffset = 0;

  ecgDrift += 0.015;

  const regenInterval = floor(lerp(16, 8, micLevel01));
  if (frameCount % regenInterval === 0) {
    generateECG(micLevel01);
  }

  // glow layers (white)
  noFill();

  stroke(255, 40);
  strokeWeight(10);
  beginShape();
  for (let i = 0; i < ecgPoints.length - 1; i++) {
    const p = ecgPoints[i];
    const x = p.x + ecgOffset;
    const y = p.y;
    if (x > -50 && x < width + 50) vertex(x, y);
  }
  endShape();

  stroke(255, 70);
  strokeWeight(6);
  beginShape();
  for (let i = 0; i < ecgPoints.length - 1; i++) {
    const p = ecgPoints[i];
    const x = p.x + ecgOffset;
    const y = p.y;
    if (x > -50 && x < width + 50) vertex(x, y);
  }
  endShape();

  stroke(255, 220);
  strokeWeight(3);
  beginShape();
  for (let i = 0; i < ecgPoints.length - 1; i++) {
    const p = ecgPoints[i];
    const x = p.x + ecgOffset;
    const y = p.y;
    if (x > -50 && x < width + 50) vertex(x, y);
  }
  endShape();

  pulsePhase += 0.05;
  const audioBoost = lerp(1.0, 1.6, micLevel01);
  pulseCircleSize = (100 + 50 * sin(pulsePhase)) * audioBoost;
  const circleAlpha = (150 + 105 * sin(pulsePhase)) * lerp(0.9, 1.3, micLevel01);

  push();
  translate(width / 2, height / 2 + 100);

  for (let i = 3; i > 0; i--) {
    noFill();
    stroke(255, circleAlpha / (i + 1));
    strokeWeight(i * 3);
    circle(0, 0, pulseCircleSize + i * 30);
  }

  noFill();
  stroke(255, circleAlpha);
  strokeWeight(4);
  circle(0, 0, pulseCircleSize);

  pop();

  fill(255, 230);
  textAlign(CENTER, BASELINE);
  textSize(32);
  text("Hold your smartphone on the screen.", width / 2, height / 2 + 250);

  textSize(18);
  fill(255, 180);
  text("Tap the screen to continue", width / 2, height - 50);

  end2D();
}

// =====================================================
// Message Screen (2D)
// =====================================================
function drawMessageScreen() {
  begin2D();
  background(5, 10, 20);

  introTimer += 0.016;
  const textAlpha = min(255, introTimer * 100);

  fill(255, textAlpha);
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Let's discover songs you don't know from others' perspectives.", width / 2, height / 2);

  textSize(18);
  fill(255, textAlpha * 0.75);
  text("Tap to skip", width / 2, height - 50);

  if (introTimer > 3) {
    displayMode = 0;
    introTimer = 0;
  }
  end2D();
}

// =====================================================
// Zoomed Bubble
// =====================================================
function drawZoomedBubble() {
  const t = easeInOutCubic(zoomProgress);

  begin2D();
  fill(5, 10, 20, 200 * t);
  noStroke();
  rect(0, 0, width, height);
  end2D();

  push();
  // WEBGL center origin, so translate(0,0)
  const bubbleScale = lerp(1, 1.8, t);
  scale(bubbleScale);

  if (selectedBubble) {
    setupBubbleLights();
    selectedBubble.drawSoapBubbleSphere((selectedBubble.size * 0.5), 1.0);
  }

  if (t > 0.8 && selectedBubble) {
    selectedBubble.displayMusicRecords();
  }

  pop();

  if (t > 0.05) drawAvatarOverlayZoom(t);

  if (t > 0.9) {
    begin2D();
    fill(255, 200);
    textAlign(CENTER, BASELINE);
    textSize(20);
    text("Tap the record to play the song", width / 2, height - 80);
    end2D();
  }
}

// =====================================================
// Music Detail Screen
// =====================================================
function drawMusicDetail() {
  const t = easeInOutCubic(musicDetailProgress);

  begin2D();
  fill(5, 10, 20, 240 * t);
  noStroke();
  rect(0, 0, width, height);
  end2D();

  push();
  translate(0, -50, 0); // width/2,height/2-50 in Processing -> center already, so y offset only

  if (selectedRecord) {
    push();

    const recordScale = lerp(1, 12, t);
    scale(recordScale);
    rotateZ(selectedRecord.rotation + frameCount * 0.01);

    fill(selectedRecord.recordColor);
    stroke(0, 150);
    strokeWeight(2 / recordScale);
    circle(0, 0, selectedRecord.size);

    fill(100);
    noStroke();
    circle(0, 0, selectedRecord.size * 0.3);

    noFill();
    stroke(0, 100);
    strokeWeight(1 / recordScale);
    for (let i = 1; i < 8; i++) circle(0, 0, selectedRecord.size * 0.4 + i * 3);

    fill(255, 60);
    noStroke();
    arc(0, 0, selectedRecord.size * 0.8, selectedRecord.size * 0.8, -PI / 3, PI / 3);

    pop();
  }

  pop();

  if (t > 0.5) drawMusicPlayer(t);

  if (t > 0.7) {
    begin2D();
    fill(255, 200 * (t - 0.7) / 0.3);
    textAlign(CENTER, BASELINE);
    textSize(18);
    text("if you like it, lets tap the record", width / 2, height - 60);
    end2D();
  }
}

// =====================================================
// Music Player (UPDATED PANEL LAYOUT) - 2D
// =====================================================
function drawMusicPlayer(t) {
  const alpha = map(t, 0.5, 1, 0, 255);

  const panelW = width * 0.62;
  const panelH = 210;
  const radius = 18;

  const cx = width / 2;
  const cy = height * 0.78;

  const info = selectedRecord ? selectedRecord.info : null;

  begin2D();

  fill(20, 25, 35, alpha);
  noStroke();
  rectMode(CENTER);
  rect(cx, cy, panelW, panelH, radius);

  const topY = cy - 60;
  const titleY = topY;
  const artistY = topY + 28;
  const albumY = topY + 52;

  fill(255, alpha);
  textAlign(CENTER, BASELINE);

  textSize(24);
  text(info ? info.title : "—", cx, titleY);

  textSize(18);
  fill(210, alpha);
  text(info ? info.artist : "", cx, artistY);

  textSize(15);
  fill(170, alpha);
  text(info ? info.album : "", cx, albumY);

  const btnY = cy + 62;
  const btnR = 64;

  fill(255, alpha);
  noStroke();
  circle(cx, btnY, btnR);

  fill(20, 25, 35, alpha);
  triangle(cx - 10, btnY - 12, cx - 10, btnY + 12, cx + 16, btnY);

  end2D();
}

// =====================================================
// Phone Prompt (2D)
// =====================================================
function drawPhonePrompt() {
  const t = easeInOutCubic(phonePromptProgress);

  begin2D();
  fill(5, 10, 20, 250);
  noStroke();
  rect(0, 0, width, height);

  fill(255, 255 * t);
  textAlign(CENTER, BASELINE);
  textSize(32);
  text("Hold your smartphone on the screen.", width / 2, height / 2 - 200);

  const blinkAlpha = 150 + 105 * sin(frameCount * 0.05);

  rectMode(CENTER);
  fill(255, blinkAlpha * t);
  rect(width / 2, height / 2 + 50, 180, 320, 20);

  fill(200, 220, 255, blinkAlpha * 0.6 * t);
  rect(width / 2, height / 2 + 40, 160, 280, 10);

  fill(255, blinkAlpha * t);
  circle(width / 2, height / 2 + 190, 40);

  fill(50, blinkAlpha * t);
  circle(width / 2, height / 2 - 140, 12);

  for (let i = 1; i <= 3; i++) {
    noFill();
    stroke(255, (blinkAlpha * 0.3 * t) / i);
    strokeWeight(i * 4);
    rect(width / 2, height / 2 + 50, 180 + i * 20, 320 + i * 20, 20 + i * 5);
  }

  noStroke();
  fill(255, 150 * t);
  textAlign(CENTER, BASELINE);
  textSize(16);
  text("Tap the black area to return to the previous screen.", width / 2, height - 40);

  end2D();
}

// =====================================================
// Easing
// =====================================================
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

// =====================================================
// Mic start helper (required on web)
// =====================================================
async function ensureMicStarted() {
  if (!enableMic) return;
  if (micReady) return;

  try {
    await userStartAudio(); // required by browsers
    micIn.start(() => {
      micAmp.setInput(micIn);
      micReady = true;
    });
  } catch (e) {
    // If permission denied, keep running without mic
    enableMic = false;
  }
}

// =====================================================
// Mouse Interaction
// =====================================================
async function mousePressed() {
  await ensureMicStarted();

  if (displayMode === -2) {
    displayMode = -1;
    introTimer = 0;

  } else if (displayMode === -1) {
    displayMode = 0;
    introTimer = 0;

  } else if (displayMode === 3) {
    displayMode = 2;
    phonePromptProgress = 0;

  } else if (displayMode === 2) {
    // record center is at canvas center, shifted up by 50 in drawMusicDetail
    const distFromCenter = dist(mouseX, mouseY, width / 2, height / 2 - 50);
    if (distFromCenter < 100) {
      displayMode = 3;
      phonePromptProgress = 0;
    } else if (distFromCenter > 200) {
      displayMode = 1;
      selectedRecord = null;
      musicDetailProgress = 0;
    }

  } else if (displayMode === 1) {
    let recordClicked = false;

    if (selectedBubble && zoomProgress > 0.8) {
      const bubbleScale = lerp(1, 1.8, easeInOutCubic(zoomProgress));

      for (const r of selectedBubble.records) {
        // NOTE: In zoom mode, we draw records in WEBGL center coordinates,
        // but click coordinates are in screen space.
        // We'll approximate same as Processing version:
        const screenX = width / 2 + r.pos.x * bubbleScale;
        const screenY = height / 2 + r.pos.y * bubbleScale + selectedBubble.size * 0.15 * bubbleScale;
        const d = dist(mouseX, mouseY, screenX, screenY);

        if (d < (r.size * bubbleScale) / 2) {
          selectedRecord = r;
          displayMode = 2;
          musicDetailProgress = 0;
          recordClicked = true;
          break;
        }
      }
    }

    if (!recordClicked) {
      const distFromCenter = dist(mouseX, mouseY, width / 2, height / 2);
      if (distFromCenter > 400) {
        displayMode = 0;
        selectedBubble = null;
        selectedRecord = null;
        zoomProgress = 0;
      }
    }

  } else if (displayMode === 0) {
    // Normal: click bubble
    for (const b of bubbles) {
      if (b.isClicked(mouseX, mouseY)) {
        selectedBubble = b;
        displayMode = 1;
        zoomProgress = 0;
        break;
      }
    }
  }
}
