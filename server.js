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
Professional real estate photo edit.
Keep property accurate.
Do not add or remove rooms, walls, doors, windows, furniture, pools, appliances, landscaping, views, or permanent features.
Do not change architecture, roofline, lot shape, camera angle, or surroundings.
Keep image realistic, MLS-safe, clean, premium, and natural.
No cartoon, CGI, fantasy, fake objects, fake rooms, or overprocessed look.
`;
}

function promptForMode(mode) {
  const m = String(mode || "standard").toLowerCase();

  const prompts = {
    standard: `
${baseRules()}
Create a clean HDR-style real estate enhancement.
Auto-detect interior or exterior.
If interior: brighten naturally, clean white balance, recover windows, lift shadows, sharpen floors and fixtures.
If exterior: improve curb appeal, sky tone, lawn, driveway, shadows, highlights, and architectural detail.
Keep color natural and professional.
`,

    hdr: `
${baseRules()}
Create realistic premium HDR real estate editing.
Recover highlights, lift shadows, balance exposure, clean color cast, sharpen details, and make it look like a human HDR editor finished it.
Do not make it fake or oversaturated.
Keep whites clean and windows controlled.
`,

    mls: `
${baseRules()}
Create an MLS-ready edit.
Natural HDR, clean whites, balanced exposure, controlled highlights, clear shadows, realistic color, sharp detail, and professional real estate finish.
`,

    interior: `
${baseRules()}
Interior real estate edit.
Brighten the room naturally.
Correct white balance.
Clean whites and neutral walls.
Recover window brightness naturally.
Lift shadows without flattening the image.
Sharpen flooring, cabinets, fixtures, and room detail.
Do not add furniture or change layout.
`,

    exterior: `
${baseRules()}
Exterior real estate edit.
Improve curb appeal, sky realism, lawn color, driveway brightness, house detail, shadows, highlights, and clarity.
Keep roofline, trees, mountains, fences, and property edges accurate.
`,

    sky: `
${baseRules()}
Improve or replace only the sky with a realistic clean real estate sky.
Keep rooflines, trees, power lines, mountains, fences, poles, and property edges untouched.
No sky bleeding into the house.
No fake clouds.
`,

    twilight: `
${baseRules()}
Create a realistic premium twilight real estate edit.
Natural dusk sky with blue and purple evening gradient.
Warm glow only in real windows.
Subtle exterior lighting only where believable.
Slightly darker yard and driveway while keeping detail visible.
Natural evening contrast on the home.
No fake windows.
No fake lights.
No fantasy sky.
Make it look like a professional human twilight editor created it.
`,

    luxury: `
${baseRules()}
Luxury real estate magazine edit.
Premium HDR balance, elegant color grade, clean whites, realistic contrast, crisp detail, polished finish, and high-end listing quality.
Keep it natural and believable.
`,

    window: `
${baseRules()}
Professional window pull edit.
Recover outside window detail naturally.
Reduce blown highlights.
Balance indoor exposure with outside view.
Keep window frames, blinds, reflections, and view believable.
Do not fake a view.
Do not darken the room too much.
`,

    denoise: `
${baseRules()}
Reduce noise, grain, compression artifacts, blur, and muddy shadows.
Keep natural detail and avoid plastic smoothing.
`,

    pro: `
${baseRules()}
Full professional real estate edit.
HDR polish.
Window pull recovery.
Natural white balance.
Clean color correction.
Sharpen detail.
Improve sky if exterior.
Improve curb appeal if exterior.
Make it look like a paid human real estate editor finished it.
`
  };

  return prompts[m] || prompts.standard;
}

async function makeOpenAIPng(inputPath) {
  const pngPath = path.join(
    UPLOAD_DIR,
    `openai-${Date.now()}-${Math.floor(Math.random() * 999999)}.png`
  );

  await sharp(inputPath)
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toFile(pngPath);

  return pngPath;
}

async function editImage(imagePath, prompt) {
  const pngPath = await makeOpenAIPng(imagePath);

  try {
    const result = await openai.images.edit({
      model: "dall-e-2",
      image: fs.createReadStream(pngPath),
      prompt,
      size: "1024x1024",
      response_format: "b64_json"
    });

    if (!result?.data?.[0]?.b64_json) {
      throw new Error("OpenAI did not return an edited image.");
    }

    return result.data[0].b64_json;
  } finally {
    safeDelete(pngPath);
  }
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
    image_model: "dall-e-2",
    enfuse_path: process.env.ENFUSE_PATH || "C:\\enfuse\\enfuse.exe"
  });
});

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

    try {
      const editedBase64 = await editImage(file.path, prompt);
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

  exec(command, (err, stdout, stderr) => {
    files.forEach((f) => safeDelete(f.path));

    if (err) {
      console.error("Enfuse error:", err);
      return res.status(500).json({
        success: false,
        error: "HDR merge failed. Enfuse must be installed locally or available on server.",
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

app.post("/pro-edit", upload.single("photo"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "Upload one photo using field name photo."
    });
  }

  try {
    const editedBase64 = await editImage(file.path, promptForMode("pro"));
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
  }
});

app.post("/twilight-pro", upload.single("photo"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "Upload one photo using field name photo."
    });
  }

  try {
    const editedBase64 = await editImage(file.path, promptForMode("twilight"));
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
  }
});

app.post("/window-pull", upload.single("photo"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      error: "Upload one photo using field name photo."
    });
  }

  try {
    const editedBase64 = await editImage(file.path, promptForMode("window"));
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
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Vynex AI PRO running on port ${PORT}`);
});