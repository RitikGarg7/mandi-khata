/**
 * voice.js — Voice input for Form J
 *
 * Records audio from microphone using MediaRecorder API,
 * sends to /api/voice (Gemini) which transcribes + extracts fields.
 *
 * BROWSER SUPPORT:
 *   Chrome Android: ✅ webm/opus
 *   Safari iPhone:  ✅ mp4/aac
 *   Firefox:        ✅ webm/opus
 *
 * USAGE:
 *   const recorder = createRecorder();
 *   await recorder.start();
 *   // ... user speaks ...
 *   const result = await recorder.stop(); // returns Form J fields
 */

// Max recording duration — 30 seconds is plenty for one bill
const MAX_DURATION_MS = 30000;

export function createRecorder() {
  let mediaRecorder = null;
  let audioChunks   = [];
  let stream        = null;
  let stopTimer     = null;

  // Start recording from microphone
  const start = async () => {
    // Request microphone permission
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick best supported audio format
    // webm/opus: Chrome Android, Firefox
    // mp4/aac: Safari iPhone
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    audioChunks   = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.start(100); // collect data every 100ms

    // Auto-stop after MAX_DURATION_MS
    stopTimer = setTimeout(() => stop(), MAX_DURATION_MS);
  };

  // Stop recording and send to Gemini
  const stop = () => new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      reject(new Error("Recording nahi chal rahi"));
      return;
    }

    clearTimeout(stopTimer);

    mediaRecorder.onstop = async () => {
      // Stop microphone
      stream?.getTracks().forEach(t => t.stop());

      try {
        // Convert audio chunks to base64
        const blob     = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        const base64   = await blobToBase64(blob);
        const mimeType = blob.type.split(";")[0]; // strip codec info for API

        // Send to /api/voice
        const resp = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: base64, mimeType }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err?.error || `Server error: ${resp.status}`);
        }

        const result = await resp.json();

        console.log("=== VOICE TRANSCRIPTION ===", result.transcription);
        console.log("=== VOICE PARSED FIELDS ===", result.data);

        resolve(result);
      } catch (e) {
        reject(e);
      }
    };

    mediaRecorder.stop();
  });

  // Cancel recording without processing
  const cancel = () => {
    clearTimeout(stopTimer);
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    stream?.getTracks().forEach(t => t.stop());
    audioChunks = [];
  };

  return { start, stop, cancel };
}

// Convert Blob to base64 string
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
