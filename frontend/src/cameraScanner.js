/**
 * cameraScanner.js
 *
 * In-browser camera capture + Tesseract.js OCR + chord validation.
 * No server round-trips. Tesseract worker is lazily created and reused.
 *
 * Exports:
 *   openCamera()                   → Promise<MediaStream>
 *   captureFrame(videoEl)          → ImageData
 *   extractChords(imageData)       → Promise<CameraScanResult>
 *   stopCamera(stream)             → void
 *   CHORD_REGEX                    (exported for testing)
 */

import { createWorker } from "tesseract.js";

// ─── Chord Validation ─────────────────────────────────────────────────────────

/**
 * Regex that matches valid chord name tokens.
 * Examples that pass:  C, Am, F#m7, Bb, Cmaj7, Gsus4, Dadd9, Bm7b5
 * Examples that fail:  "the", "of", "verse", "---", "123"
 */
export const CHORD_REGEX =
  /^[A-Ga-g][#b]?(maj|min|m|M|dim|aug|sus[24]?|add[0-9]+|[0-9]+)*$/;

/**
 * Validate a token as a chord name.
 * Also normalises the root to uppercase.
 */
export function validateChord(token) {
  const trimmed = String(token || "").trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  // Normalise: first char uppercase, rest as-is
  const normalised = trimmed[0].toUpperCase() + trimmed.slice(1);
  return CHORD_REGEX.test(normalised) ? normalised : null;
}

// ─── Camera ───────────────────────────────────────────────────────────────────

/**
 * Request camera permission and return the MediaStream.
 * Prefers rear (environment) camera on mobile.
 *
 * @returns {Promise<MediaStream>}
 */
export async function openCamera() {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw new Error(`Camera permission denied: ${err.message}`);
  }
}

/**
 * Stop all tracks on a MediaStream.
 * @param {MediaStream} stream
 */
export function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * Capture the current frame of a <video> element into an ImageData object.
 * @param {HTMLVideoElement} videoEl
 * @returns {ImageData}
 */
export function captureFrame(videoEl) {
  const w = videoEl.videoWidth  || 640;
  const h = videoEl.videoHeight || 480;
  const canvas = document.createElement("canvas");
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// ─── OCR Worker (singleton, lazy) ────────────────────────────────────────────

let _worker = null;

async function getWorker() {
  if (_worker) return _worker;
  _worker = await createWorker("eng", 1, {
    // Suppress verbose Tesseract logs in the console
    logger: () => {},
  });
  return _worker;
}

// ─── OCR + Extraction ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} CameraScanResult
 * @property {string[]} chords          Valid chords (confidence ≥ 60%)
 * @property {string[]} lowConfidence   Valid chord tokens but confidence < 60%
 * @property {string}   rawText         Full OCR text for fallback display
 */

/**
 * extractChords(imageData) → Promise<CameraScanResult>
 *
 * Runs Tesseract.js on the captured frame, filters tokens to chord names,
 * separates high-confidence from low-confidence results.
 *
 * @param {ImageData} imageData
 * @returns {Promise<CameraScanResult>}
 */
export async function extractChords(imageData) {
  // Convert ImageData to a canvas (Tesseract accepts HTMLCanvasElement)
  const canvas = document.createElement("canvas");
  canvas.width  = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);

  // Pre-process: increase contrast for better OCR accuracy
  preProcessCanvas(ctx, canvas.width, canvas.height);

  const worker = await getWorker();

  // recognizeImage with word-level confidence data
  const { data } = await worker.recognize(canvas);

  const rawText = data.text || "";

  const chords        = [];
  const lowConfidence = [];

  // Tesseract returns word-level data with confidence scores
  if (data.words && data.words.length > 0) {
    for (const word of data.words) {
      const text       = word.text?.trim() || "";
      const confidence = word.confidence ?? 0; // 0–100

      // Split on common delimiters in case multiple chords are fused
      const tokens = text.split(/[\s,|/\\\-]+/).filter(Boolean);

      for (const token of tokens) {
        const valid = validateChord(token);
        if (!valid) continue;

        if (confidence >= 60) {
          if (!chords.includes(valid)) chords.push(valid);
        } else {
          if (!lowConfidence.includes(valid)) lowConfidence.push(valid);
        }
      }
    }
  } else {
    // Fallback: split raw text and validate without confidence data
    const tokens = rawText.split(/[\s,|/\\\-\n]+/).filter(Boolean);
    for (const token of tokens) {
      const valid = validateChord(token);
      if (valid && !chords.includes(valid)) {
        lowConfidence.push(valid); // treat as low-confidence without word data
      }
    }
  }

  return { chords, lowConfidence, rawText };
}

// ─── Image Pre-Processing ─────────────────────────────────────────────────────

/**
 * Boost contrast and convert to greyscale in-place on a canvas context.
 * This improves Tesseract accuracy on chord sheets significantly.
 */
function preProcessCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data      = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Greyscale via luminance
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Boost contrast: stretch towards 0 or 255
    const boosted = grey < 128 ? Math.max(0, grey - 40) : Math.min(255, grey + 40);
    data[i]     = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
    // Alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0);
}
