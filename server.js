import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { exec } from "child_process";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, "uploads");
const OUTPUT_DIR = path.join(__dirname, "outputs");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use("/outputs", express.static(OUTPUT_DIR));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 30 * 1024 * 1024,
    files: 8
  }
});

function getPublicUrl(req, fileName) {
  return `${req.protocol}://${req.get("host")}/outputs/${fileName}`;
}

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch (err) {
    console.warn("Cleanup warning:", err.message);
  }
}

function baseRules() {
  return `
You are a senior professional real estate photo editor.

STRICT MLS-SAFE RULES:
- Keep the property accurate.
- Do not add or remove rooms, walls, doors, windows, furniture, pools, appliances, landscaping, views, or permanent features.
- Do not change architecture, roofline, lot shape, camera angle, or surroundings.
- Preserve realistic perspective and straight vertical lines.
- Make the photo realistic, premium, clean, bright, and human-editor quality.
- No CGI, cartoon, fantasy, fake HDR, plastic smoothing, or overprocessed look.
- Do not misrepresent the property.
`;
}

function batchColorMatching() {
  return `
BATCH COLOR MATCHING:
All uploaded photos must look edited by the same human real estate editor.
Keep consistent brightness, contrast, white balance, warmth, saturation, sharpness, shadow depth, sky tone, and HDR finish.
Do not make one image overly warm and another overly cool.
Use a clean premium real estate editing style across the entire batch.
`;
}

function autoDetectInteriorExterior() {
  return `
AUTO INTERIOR / EXTERIOR DETECTION:
If the photo is interior:
- Brighten naturally.
- Correct white balance.
- Clean whites and neutral walls.
- Balance window highlights.
- Recover window detail where possible.
- Lift shadows without making the image flat.
- Sharpen flooring, cabinets, fixtures, and room details.
- Keep the room realistic.

If the photo is exterior:
- Improve curb appeal.
- Clean or improve visible sky.
- Enhance lawn, driveway, walls, roof, and exterior detail.
- Control harsh shadows and blown highlights.
- Preserve roofline, landscaping, mountains, trees, fences, and property edges.
`;
}

function automaticSkyMasking() {
  return `
AUTOMATIC SKY MASKING:
If sky is visible, improve or replace ONLY the sky.
Use a realistic luxury real estate sky.
Preserve rooflines, trees, power lines, mountains, chimneys, fences, poles, and property edges.
No sky bleeding into the home.
No fake-looking clouds.
No warped roofline.
Do not change the house or surroundings.
`;
}

function twilightLightingZones() {
  return `
REAL TWILIGHT LIGHTING ZONES:
Create realistic dusk lighting zones:
- Sky: smooth blue/purple sunset gradient, natural dusk mood.
- Windows: warm glow only where real windows exist.
- Exterior lights: subtle warmth only where believable.
- Yard/driveway: slightly darker evening feel but still detailed.
- House body: natural evening contrast, not too dark.
- Shadows: soft and realistic.

Do not add fake windows.
Do not add fake lights where they do not belong.
Do not change architecture.
Do not make the image fantasy, CGI, or overly dramatic.
`;
}

function windowPullInstructions() {
  return `
WINDOW PULL EDIT:
Recover window detail naturally.
Reduce blown highlights.
Balance indoor exposure with outdoor view.
Keep window frames, blinds, reflections, and outside view believable.
Do not fake a view that was not there.
Do not darken the interior too much.
Make it look like a professional real estate window pull.
`;
}

function promptForMode(mode) {
  const m = String(mode || "standard").toLowerCase();

  const prompts = {
    standard: `
${baseRules()}
${batchColorMatching()}
${autoDetectInteriorExterior()}

Create a professional HDR-style real estate enhancement.
Fix exposure, lighting, white balance, color, clarity, sharpness, shadows, and highlights.
Make it bright, natural, realistic, clean, and listing-ready.
`,

    hdr: `
${baseRules()}
${batchColorMatching()}
${autoDetectInteriorExterior()}
${windowPullInstructions()}

Create a premium bracketed-HDR style real estate edit.
Recover highlights, lift shadows naturally, balance windows, correct color cast, sharpen detail, and make it look like a human HDR editor finished it.
`,

    mls: `
${baseRules()}
${batchColorMatching()}
${autoDetectInteriorExterior()}
${windowPullInstructions()}

Create an MLS-ready professional edit.
Use natural HDR, clean whites, balanced exposure, controlled highlights, clear shadows, realistic color, and sharp detail.
Keep it accurate and listing-safe.
`,

    interior: `
${baseRules()}
${batchColorMatching()}
${windowPullInstructions()}

Professional interior real estate edit.
Brighten naturally, fix color cast, clean whites, recover window detail, lift shadows, sharpen flooring and fixtures, and keep the room realistic.
Do not add furniture or change layout.
`,

    exterior: `
${baseRules()}
${batchColorMatching()}
${automaticSkyMasking()}

Professional exterior real estate edit.
Improve curb appeal, sky realism, lawn color, driveway brightness, architectural detail, shadows, highlights, and overall clarity.
Keep property accurate.
`,

    sky: `
${baseRules()}
${batchColorMatching()}
${automaticSkyMasking()}

Replace or improve ONLY the sky with a realistic clean luxury real estate sky.
Preserve all property edges perfectly.
Make it look natural, not fake.
`,

    twilight: `
${baseRules()}
${batchColorMatching()}
${automaticSkyMasking()}
${twilightLightingZones()}

Convert this exterior real estate photo into a realistic premium twilight image.
Make it look like a professional human twilight editor created it.
`,

    luxury: `
${baseRules()}
${batchColorMatching()}
${autoDetectInteriorExterior()}
${automaticSkyMasking()}
${windowPullInstructions()}

Luxury magazine-level real estate edit.
Premium HDR balance, rich but realistic contrast, elegant color grade, clean whites, crisp detail, and high-end polish.
`,

    window: `
${baseRules()}
${batchColorMatching()}
${windowPullInstructions()}

Focus mainly on professional window pull recovery while keeping the full image natural, bright, and realistic.
`,

    denoise: `
${baseRules()}
${batchColorMatching()}
${autoDetectInteriorExterior()}

Reduce noise, compression artifacts, blur, muddy shadows, and grain.
Keep detail natural, not plastic.
`,

    pro: `
${baseRules()}
${batchColorMatching()}
${autoDetectInteriorExterior()}
${automaticSkyMasking()}
${windowPullInstructions()}

Full professional real estate edit:
- HDR polish
- Window pull recovery
- Natural color correction
- Clean white balance
- Sharpen detail
- Improve sky if exterior
- Improve curb appeal if exterior
- Keep everything realistic and MLS-safe
`
  };

  return prompts[m] || prompts.standard;
}

async function prepareImage(inputPath) {
  const preparedName = `prep-${Date.now()}-${Math.floor(Math.random() * 999999)}.png`;
  const preparedPath = path.join(UPLOAD_DIR, preparedName);

  await sharp(inputPath)
    .rotate()
    .resize({
      width: 1600,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toFile(preparedPath);

  return preparedPath;
}

async function editImage(imagePath, prompt) {
  const result = await openai.images.edit({
    model: process.env.IMAGE_MODEL || "dall-e-2",
    image: fs.createReadStream(imagePath),
    prompt,
    size: "1024x1024",
    response_format: "b64_json"
  });

  if (!result?.data?.[0]?.b64_json) {
    throw new Error("OpenAI did not return an edited image.");
  }

  return result.data[0].b64_json;
}

function saveBase64Image(base64) {
  const name = `vynex-${Date.now()}-${Math.floor(Math.random() * 999999)}.png`;
  const filePath = path.join(OUTPUT_DIR, name);
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  return name;
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Vynex AI Pro Real Estate Photo Engine",
    message: "Backend running.",
    endpoints: [
      "/health",
      "/enhance-pro",
      "/true-hdr",
      "/pro-edit",
      "/twilight-pro",
      "/window-pull"
    ]
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    openai_key_loaded: Boolean(process.env.OPENAI_API_KEY),
    image_model: process.env.IMAGE_MODEL || "gpt-image-1",
    enfuse_path: process.env.ENFUSE_PATH || "C:\\enfuse\\enfuse.exe"
  });
});

// =======================
// MAIN FRONTEND ROUTE
// Your current frontend calls this route.
// =======================

app.post("/enhance-pro", upload.array("photos", 8), async (req, res) => {
  const files = req.files || [];
  const mode = String(req.body.mode || "standard").toLowerCase();

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing OPENAI_API_KEY."
    });
  }

  if (!files.length) {
    return res.status(400).json({
      success: false,
      error: "No photos uploaded."
    });
  }

  const images = [];
  const errors = [];
  const prompt = promptForMode(mode);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let preparedPath = null;

    try {
      preparedPath = await prepareImage(file.path);
      const editedBase64 = await editImage(preparedPath, prompt);
      const outputName = saveBase64Image(editedBase64);

      images.push(getPublicUrl(req, outputName));
    } catch (err) {
      console.error("Photo failed:", err);
      errors.push({
        photo: i + 1,
        error: err.message || "Photo failed."
      });
    } finally {
      safeDelete(file.path);
      safeDelete(preparedPath);
    }
  }

  if (!images.length) {
    return res.status(500).json({
      success: false,
      error: "All photos failed.",
      details: errors
    });
  }

  res.json({
    success: true,
    mode,
    count: images.length,
    images,
    errors
  });
});

// =======================
// TRUE HDR WITH ENFUSE
// Works locally on your PC.
// Render will only work if Enfuse exists on Render.
// =======================

app.post("/true-hdr", upload.array("photos", 5), async (req, res) => {
  const files = req.files || [];

  if (!files || files.length < 3) {
    return res.status(400).json({
      success: false,
      error: "Upload 3–5 bracketed photos for true HDR."
    });
  }

  const enfusePath = process.env.ENFUSE_PATH || "C:\\enfuse\\enfuse.exe";
  const outputName = `hdr-${Date.now()}-${Math.floor(Math.random() * 999999)}.jpg`;
  const outputPath = path.join(OUTPUT_DIR, outputName);

  const inputPaths = files.map((f) => `"${path.resolve(f.path)}"`).join(" ");
  const command = `"${enfusePath}" -o "${outputPath}" ${inputPaths}`;

  exec(command, async (err, stdout, stderr) => {
    files.forEach((f) => safeDelete(f.path));

    if (err) {
      console.error("Enfuse error:", err);
      console.error("stderr:", stderr);

      return res.status(500).json({
        success: false,
        error: "HDR merge failed. Make sure Enfuse is installed and ENFUSE_PATH is correct.",
        details: stderr || err.message
      });
    }

    return res.json({
      success: true,
      type: "true-hdr",
      image: getPublicUrl(req, outputName),
      message: "True HDR merge completed."
    });
  });
});

// =======================
// PRO EDIT SINGLE PHOTO
// =======================

app.post("/pro-edit", upload.single("photo"), async (req, res) => {
  const file = req.file;
  let preparedPath = null;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "Upload one photo using field name photo."
    });
  }

  try {
    preparedPath = await prepareImage(file.path);
    const prompt = promptForMode("pro");
    const editedBase64 = await editImage(preparedPath, prompt);
    const outputName = saveBase64Image(editedBase64);

    res.json({
      success: true,
      image: getPublicUrl(req, outputName)
    });
  } catch (err) {
    console.error("Pro edit failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Pro edit failed."
    });
  } finally {
    safeDelete(file.path);
    safeDelete(preparedPath);
  }
});

// =======================
// TWILIGHT PRO SINGLE PHOTO
// =======================

app.post("/twilight-pro", upload.single("photo"), async (req, res) => {
  const file = req.file;
  let preparedPath = null;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "Upload one photo using field name photo."
    });
  }

  try {
    preparedPath = await prepareImage(file.path);
    const prompt = promptForMode("twilight");
    const editedBase64 = await editImage(preparedPath, prompt);
    const outputName = saveBase64Image(editedBase64);

    res.json({
      success: true,
      image: getPublicUrl(req, outputName)
    });
  } catch (err) {
    console.error("Twilight failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Twilight edit failed."
    });
  } finally {
    safeDelete(file.path);
    safeDelete(preparedPath);
  }
});

// =======================
// WINDOW PULL SINGLE PHOTO
// =======================

app.post("/window-pull", upload.single("photo"), async (req, res) => {
  const file = req.file;
  let preparedPath = null;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "Upload one photo using field name photo."
    });
  }

  try {
    preparedPath = await prepareImage(file.path);
    const prompt = promptForMode("window");
    const editedBase64 = await editImage(preparedPath, prompt);
    const outputName = saveBase64Image(editedBase64);

    res.json({
      success: true,
      image: getPublicUrl(req, outputName)
    });
  } catch (err) {
    console.error("Window pull failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Window pull failed."
    });
  } finally {
    safeDelete(file.path);
    safeDelete(preparedPath);
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Vynex AI PRO running on port ${PORT}`);
});