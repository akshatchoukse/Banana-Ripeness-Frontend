"use client";

import { useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const API_URL = "https://banana-ripeness-backend.onrender.com/analyze";

const STAGES = ["Image Selected", "Banana Check", "Ripeness Result"];

function formatPct(x) {
  if (x === null || x === undefined) return "";
  return `${Math.round(x * 100)}%`;
}

function tipFor(ripeness) {
  switch (ripeness) {
    case "Green":
      return "Not ready yet. Keep at room temperature. Avoid fridge for now.";
    case "Turning":
      return "Almost ready. 1–2 days at room temperature.";
    case "Ripe":
      return "Perfect to eat now. If you want to slow it down, refrigerate.";
    case "Overripe":
      return "Best for smoothies/baking. Refrigerate to stop further ripening.";
    default:
      return "Take a clear banana photo in good light.";
  }
}

export default function Page() {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [mode, setMode] = useState("idle"); // idle | camera | preview | analyzing | result
  const [imageURL, setImageURL] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);

  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [busy, setBusy] = useState(false);

  const canAnalyze = useMemo(() => !!imageBlob && !busy, [imageBlob, busy]);

  async function openCamera() {
    setError(null);
    setResult(null);
    setStepIndex(-1);

    try {
      setMode("camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setMode("idle");
      setError("Camera access failed. Please allow camera permission or use Gallery upload.");
    }
  }

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function closeCamera() {
    stopCamera();
    setMode("idle");
  }

  async function capturePhoto() {
    setError(null);
    setResult(null);

    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));

    if (!blob) {
      setError("Could not capture image. Please try again.");
      return;
    }

    stopCamera();
    const url = URL.createObjectURL(blob);

    setImageURL(url);
    setImageBlob(blob);
    setMode("preview");
  }

  function pickFromGallery() {
    setError(null);
    setResult(null);
    setStepIndex(-1);
    fileInputRef.current?.click();
  }

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImageURL(url);
    setImageBlob(file);
    setMode("preview");
  }

  function resetAll() {
    stopCamera();
    setMode("idle");
    setImageURL(null);
    setImageBlob(null);
    setResult(null);
    setError(null);
    setStepIndex(-1);
    setBusy(false);
  }

  async function analyze() {
    if (!imageBlob) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setMode("analyzing");

    setStepIndex(0);

    try {
      setStepIndex(1);

      const formData = new FormData();
      formData.append("file", imageBlob, "banana.jpg");

      const res = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to analyze image.");
      }

      setStepIndex(2);
      setResult(data);
      setMode("result");
    } catch (e) {
      setMode("preview");
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.bg}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <div className={styles.logo}>🍌</div>
            <div className={styles.brandText}>
              <div className={styles.title}>Color Recognition using Neural Networks to Determine the Ripeness of Banana</div>
              <div className={styles.subtitle}>
                Use Camera or Upload Image from Gallery
              </div>
            </div>
          </div>

          <div className={styles.badge}>Next.js + FastAPI</div>
        </header>

        <main className={styles.grid}>
          {/* Capture Section */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Capture</h2>
              <p>Best results: bright light, single banana, simple background.</p>
            </div>

            {mode === "camera" ? (
              <div className={styles.cameraWrap}>
                <video
                  ref={videoRef}
                  className={styles.video}
                  playsInline
                  autoPlay
                  muted
                />

                <div className={styles.cameraBar}>
                  <button className={styles.btnGhost} onClick={closeCamera}>
                    Back
                  </button>

                  <button className={styles.btnPrimary} onClick={capturePhoto}>
                    Capture
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                <button className={styles.btnPrimary} onClick={openCamera}>
                  📷 Use Camera
                </button>

                <button className={styles.btnSecondary} onClick={pickFromGallery}>
                  🖼 Upload from Gallery
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFileSelected}
                  className={styles.hidden}
                />
              </div>
            )}

            {error && <div className={styles.alertError}>⚠️ {error}</div>}

            <div className={styles.smallNote}>
              Tip: if Banana is not in Frame or not visible clearly, "No Banana Detected" may show.
            </div>
          </section>

          {/* Analyze Section */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Analyze</h2>
              <p>Preview → Banana check → Ripeness + confidence</p>
            </div>

            <div className={styles.previewArea}>
              {imageURL ? (
                <img src={imageURL} alt="preview" className={styles.previewImg} />
              ) : (
                <div className={styles.placeholder}>
                  <div className={styles.placeholderIcon}>📸</div>
                  <div className={styles.placeholderText}>No image selected</div>
                </div>
              )}
            </div>

            <div className={styles.steps}>
              {STAGES.map((s, idx) => {
                const active = idx === stepIndex;
                const done = idx < stepIndex;

                return (
                  <div
                    key={s}
                    className={`${styles.step} ${active ? styles.stepActive : ""} ${
                      done ? styles.stepDone : ""
                    }`}
                  >
                    <div className={styles.stepDot}>{done ? "✓" : idx + 1}</div>
                    <div className={styles.stepLabel}>{s}</div>
                  </div>
                );
              })}
            </div>

            <div className={styles.analyzeBar}>
              <button className={styles.btnGhost} onClick={resetAll}>
                Reset
              </button>

              <button
                className={styles.btnPrimary}
                onClick={analyze}
                disabled={!canAnalyze}
              >
                {busy ? "Analyzing..." : "Analyze"}
              </button>
            </div>

            {mode === "result" && result && (
              <>
                {!result.is_banana ? (
                  <div className={styles.alertWarn}>
                    <div className={styles.alertTitle}>⚠️ No banana detected</div>
                    <div className={styles.alertBody}>
                      Please take a clear banana photo. Try better lighting and a cleaner background.
                    </div>

                    <div className={styles.metaRow}>
                      <span className={styles.metaPill}>
                        Banana confidence: {formatPct(result.banana_confidence)}
                      </span>

                      {result?.warnings?.too_dark && (
                        <span className={styles.metaPill}>Too dark</span>
                      )}

                      {result?.warnings?.too_blurry && (
                        <span className={styles.metaPill}>Too blurry</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.resultCard}>
                    <div className={styles.resultTop}>
                      <div>
                        <div className={styles.resultLabel}>{result.ripeness}</div>
                        <div className={styles.resultSub}>
                          Confidence: {formatPct(result.confidence)}
                        </div>
                      </div>

                      <div className={styles.okBadge}>✅ Banana detected</div>
                    </div>

                    <div className={styles.barWrap}>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, (result.confidence || 0) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className={styles.tips}>
                      <div className={styles.tipsTitle}>Tip</div>
                      <div className={styles.tipsBody}>{tipFor(result.ripeness)}</div>
                    </div>

                    <div className={styles.metaRow}>
                      <span className={styles.metaPill}>
                        Banana confidence: {formatPct(result.banana_confidence)}
                      </span>

                      {result?.warnings?.too_dark && (
                        <span className={styles.metaPill}>Too dark</span>
                      )}

                      {result?.warnings?.too_blurry && (
                        <span className={styles.metaPill}>Too blurry</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </main>

        <footer className={styles.footer}>
          <span>Backend must be running on</span>
          <code className={styles.code}>http://localhost:8000</code>
          <span>and endpoint</span>
          <code className={styles.code}>/analyze</code>
        </footer>
      </div>
    </div>
  );
}
