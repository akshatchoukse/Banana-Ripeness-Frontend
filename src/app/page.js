"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const STAGES = ["Image Selected", "Banana Check", "Ripeness Result"];

function formatPct(x) {
  if (x === null || x === undefined) return "-";
  return `${Math.round(x * 100)}%`;
}

function tipFor(ripeness) {
  switch (ripeness) {
    case "Unripe":
      return "Banana is still green. Keep it at room temperature for 2-4 days.";
    case "Ripe":
      return "Banana is ready to eat now. Best stage for direct consumption.";
    case "Overripe":
      return "Banana is best for shakes, cake, pancakes, or banana bread.";
    default:
      return "Take a clear fruit image in good lighting.";
  }
}

function extractErrorMessage(err) {
  try {
    const parsed = JSON.parse(err.message);
    if (parsed.detail) {
      if (Array.isArray(parsed.detail)) {
        return parsed.detail.map((item) => item.msg).join(", ");
      }
      return parsed.detail;
    }
  } catch {}
  return err.message || "Something went wrong";
}

export default function Page() {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [authMode, setAuthMode] = useState("login");
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [mode, setMode] = useState("idle");
  const [imageURL, setImageURL] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState("main"); 
  const [adminData, setAdminData] = useState({ users: [], history: [] });
  const [adminBusy, setAdminBusy] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedHistory, setSelectedHistory] = useState(null);

  const canAnalyze = useMemo(() => !!imageBlob && !busy && !!token, [imageBlob, busy, token]);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("banana_token");
    const savedUser = window.localStorage.getItem("banana_user");
    if (savedToken) setToken(savedToken);
    if (savedUser) {
        const u = JSON.parse(savedUser);
        setUser(u);
        if (u.role === 'admin') setView('admin');
    }
  }, []);

  useEffect(() => {
    if (token) loadHistory(token);
  }, [token]);

  async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data;
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !email.trim()) return "Email is required";
    if (!re.test(email.trim())) return "Enter a valid email address";
    return "";
  }

  function validateName(name) {
    if (!name || !name.trim()) return "Name is required";
    if (name.length < 2) return "Min 2 characters";
    if (/\d/.test(name)) return "Names cannot contain numbers";
    return "";
  }

  const uniqueEmails = useMemo(() => {
    const emails = adminData.history.map(h => h.userEmail);
    return ["All Emails", ...new Set(emails)];
  }, [adminData.history]);

  function validateAuthForm() {
    const errors = {};
    errors.email = validateEmail(authForm.email);
    const password = authForm.password;
    if (!password) errors.password = "Password is required";
    else if (password.length < 6) errors.password = "Min 6 characters";

    const clean = Object.fromEntries(Object.entries(errors).filter(([_, v]) => !!v));
    setFieldErrors(clean);
    return Object.keys(clean).length === 0;
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    if (!validateAuthForm()) return;
    setAuthBusy(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authForm.email.trim(), password: authForm.password }),
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("banana_token", data.token);
      localStorage.setItem("banana_user", JSON.stringify(data.user));
      setView(data.user.role === 'admin' ? 'admin' : 'main');
      setAuthForm({ name: "", email: "", password: "" });
      setFieldErrors({});
    } catch (err) {
      setAuthError(extractErrorMessage(err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError("");
    const errors = {};
    errors.name = validateName(createForm.name);
    errors.email = validateEmail(createForm.email);
    if (!createForm.password) errors.password = "Password is required";
    else if (createForm.password.length < 6) errors.password = "Min 6 characters";
    
    if (errors.name || errors.email || errors.password) {
       setCreateError(Object.values(errors).filter(Boolean)[0]); // Set first error
       return;
    }

    setCreateBusy(true);
    try {
      await api("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      setCreateForm({ name: "", email: "", password: "" });
      loadAdminData();
      alert("User created successfully");
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleDeleteUser(userId) {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE" });
      loadAdminData();
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  async function handleUpdateUser(e) {
    e.preventDefault();
    const nameErr = validateName(editingUser.name);
    const emailErr = validateEmail(editingUser.email);
    if (nameErr || emailErr) {
        alert(nameErr || emailErr);
        return;
    }

    try {
      await api(`/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role,
            password: editingUser.password || ""
        }),
      });
      setEditingUser(null);
      loadAdminData();
      alert("User updated successfully");
    } catch (err) {
      alert(extractErrorMessage(err));
    }
  }

  async function loadHistory(currentToken = token) {
    try {
      const res = await api("/history");
      setHistory(res.items || []);
    } catch {}
  }

  function logout() {
    stopCamera();
    setToken("");
    setUser(null);
    setHistory([]);
    setView("main");
    localStorage.removeItem("banana_token");
    localStorage.removeItem("banana_user");
  }

  async function loadAdminData() {
    if (user?.role !== "admin") return;
    setAdminBusy(true);
    try {
      const [usersRes, historyRes] = await Promise.all([
        api("/admin/users"),
        api("/admin/history")
      ]);
      setAdminData({ users: usersRes.users || [], history: historyRes.items || [] });
    } catch (err) {
      console.error("Admin data load failed", err);
    } finally {
      setAdminBusy(false);
    }
  }

  function getRipenessSummary(resObj) {
    if (!resObj || !resObj.results) return "Processed";
    const stages = [...new Set(resObj.results.filter(r => r.is_banana).map(r => r.ripeness))];
    if (stages.length === 0) {
       const nonBananas = [...new Set(resObj.results.map(r => r.detected_object))].filter(Boolean);
       return nonBananas.length > 0 ? `${nonBananas.join(", ")} found` : "No fruits detected";
    }
    const stageStr = stages.length === 1 ? stages[0] : 
                    stages.length === 2 ? `${stages[0]} and ${stages[1]}` :
                    `${stages.slice(0, -1).join(", ")}, and ${stages.slice(-1)}`;
    
    return `There are ${stageStr} ${stages.length > 1 ? "both type of banana" : "banana"} in the image`;
  }

  useEffect(() => {
    if (view === "admin") loadAdminData();
  }, [view]);

  async function openCamera() {
    setError(null);
    setResult(null);
    setStepIndex(-1);
    try {
      setMode("camera");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setMode("idle");
      setError("Camera access failed.");
    }
  }

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function closeCamera() {
    stopCamera();
    setMode("idle");
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    stopCamera();
    setImageBlob(blob);
    setImageURL(URL.createObjectURL(blob));
    setMode("preview");
    setResult(null);
    setError(null);
  }

  function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageBlob(file);
    setImageURL(URL.createObjectURL(file));
    setMode("preview");
    setResult(null);
    setError(null);
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
    if (!imageBlob || !token) return;
    setBusy(true);
    setMode("analyzing");
    setStepIndex(0);
    try {
      setStepIndex(1);
      const formData = new FormData();
      formData.append("file", imageBlob, "fruit.jpg");
      const data = await api("/analyze", { method: "POST", body: formData });
      setStepIndex(2);
      setResult(data);
      setMode("result");
      loadHistory();
    } catch (err) {
      setMode("preview");
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authCard}>
          <h1>Banana Ripeness Detection</h1>
          <p>Login to your account to continue.</p>
          <form onSubmit={handleAuthSubmit} className={styles.authForm}>
            <div className={styles.fieldWrap}>
              <input type="email" placeholder="Email" value={authForm.email} onChange={(e) => { setAuthForm({ ...authForm, email: e.target.value }); setFieldErrors(p => ({...p, email: ""})) }} required />
              {fieldErrors.email && <div className={styles.fieldError}>{fieldErrors.email}</div>}
            </div>
            <div className={styles.fieldWrap}>
              <input type="password" placeholder="Password" value={authForm.password} onChange={(e) => { setAuthForm({ ...authForm, password: e.target.value }); setFieldErrors(p => ({...p, password: ""})) }} required />
              {fieldErrors.password && <div className={styles.fieldError}>{fieldErrors.password}</div>}
            </div>
            {authError && <div className={styles.alertError}>{authError}</div>}
            <button type="submit" className={styles.btnPrimary} disabled={authBusy}>{authBusy ? "Logging in..." : "Login"}</button>
          </form>
        </div>
      </div>
    );
  }

  const isPageAdmin = user.role === "admin";

  return (
    <div className={styles.bg}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <h1>Banana Ripeness Major Project</h1>
            <p>Welcome, {user.name} ({user.role}).</p>
          </div>
          <button className={styles.btnGhost} onClick={logout}>Logout</button>
        </header>

        {isPageAdmin ? (
          <main className={styles.adminMain}>
            <section className={styles.card}>
              <div className={styles.rowBetween}>
                <h2>Admin Panel</h2>
                <button className={styles.btnGhost} onClick={loadAdminData} disabled={adminBusy}>{adminBusy ? "..." : "Refresh"}</button>
              </div>

              <div className={styles.createBox}>
                <h3>Create User</h3>
                <form onSubmit={handleCreateUser} className={styles.adminForm}>
                  <input placeholder="Name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
                  <input type="email" placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
                  <input type="password" placeholder="Password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
                  <button className={styles.btnPrimary} style={{marginTop: '0'}} disabled={createBusy}>Create</button>
                </form>
                {createError && <div className={styles.fieldError} style={{marginTop: '10px'}}>{createError}</div>}
              </div>

              <div className={styles.adminScroll} style={{ marginTop: "2rem" }}>
                <h3>Users</h3>
                <table className={styles.adminTable}>
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
                  <tbody>
                    {adminData.users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>
                          <span className={u.role === "admin" ? styles.badgeAdmin : styles.badgeUser}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <button className={styles.btnSecondary} style={{padding: '4px 8px', fontSize: '12px', marginRight: '4px'}} onClick={() => setEditingUser({ ...u, password: "" })}>Edit</button>
                          {u.role !== "admin" && (
                            <button className={styles.btnGhost} style={{padding: '4px 8px', fontSize: '12px', color: 'red'}} onClick={() => handleDeleteUser(u.id)}>Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.adminScroll} style={{ marginTop: "2rem" }}>
                <div className={styles.rowBetween}>
                  <h3>Global History</h3>
                  <select 
                    value={historySearch} 
                    onChange={(e) => setHistorySearch(e.target.value === "All Emails" ? "" : e.target.value.toLowerCase())} 
                    style={{ height: '36px', border: '1px solid #ddd', borderRadius: '8px', padding: '0 10px', width: '240px' }}
                  >
                    {uniqueEmails.map(email => (
                      <option key={email} value={email}>{email}</option>
                    ))}
                  </select>
                </div>
                <table className={styles.adminTable}>
                  <thead><tr><th>Email</th><th>Image</th><th>Result</th></tr></thead>
                  <tbody>{adminData.history
                    .filter(h => h.userEmail.toLowerCase().includes(historySearch))
                    .map((h) => (
                      <tr key={h.id}>
                        <td 
                          onClick={() => setSelectedHistory(h)} 
                          style={{ color: '#1f6feb', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                        >
                          {h.userEmail}
                        </td>
                        <td>
                          {h.imageUrl ? (
                            <img src={h.imageUrl} alt="upload" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                          ) : "No Image"}
                        </td>
                        <td>{getRipenessSummary(h.result)}</td>
                      </tr>
                    ))
                  }</tbody>
                </table>
              </div>

              {selectedHistory && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 1100, padding: '20px' }}>
                  <div className={styles.card} style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
                    <div className={styles.rowBetween}>
                      <h3>Analysis Detail</h3>
                      <button className={styles.btnGhost} onClick={() => setSelectedHistory(null)}>Close</button>
                    </div>
                    <p><strong>User:</strong> {selectedHistory.userEmail}</p>
                    <p><strong>Date:</strong> {new Date(selectedHistory.createdAt).toLocaleString()}</p>
                    
                    <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        {selectedHistory.imageUrl ? (
                          <img src={selectedHistory.imageUrl} alt="ripe" style={{ width: '100%', borderRadius: '12px' }} />
                        ) : (
                          <div className={styles.placeholder}>No image available</div>
                        )}
                      </div>
                      <div>
                        <h4 style={{ marginBottom: '10px' }}>{getRipenessSummary(selectedHistory.result)}</h4>
                        {selectedHistory.result?.results?.map((r, i) => (
                           <div key={i} className={r.is_banana ? styles.resultCard : styles.resultWarn} style={{ marginBottom: '10px', padding: '10px' }}>
                              <strong>{r.is_banana ? r.ripeness : (r.detected_object || "Object")}</strong>
                              <p style={{fontSize: '12px'}}>Conf: {formatPct(r.confidence)}</p>
                           </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editingUser && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
                  <div className={styles.card} style={{ width: '100%', maxWidth: '400px' }}>
                    <h3>Edit User: {editingUser.name}</h3>
                    <form onSubmit={handleUpdateUser} className={styles.authForm}>
                      <input placeholder="Name" value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} required />
                      <input type="email" placeholder="Email" value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} required />
                      <select value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })} style={{ height: '44px', border: '1px solid #ddd', borderRadius: '10px', padding: '0 10px' }}>
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                      </select>
                      <input type="password" placeholder="New Password (Optional)" value={editingUser.password} onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })} />
                      <div className={styles.row}>
                        <button type="button" className={styles.btnGhost} onClick={() => setEditingUser(null)}>Cancel</button>
                        <button type="submit" className={styles.btnPrimary}>Save</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          </main>
        ) : (
          <>
            <main className={styles.grid}>
              <section className={styles.card}>
                <h2>Input</h2>
                <div className={styles.row}>
                  <button className={styles.btnPrimary} onClick={openCamera}>Use Camera</button>
                  <button className={styles.btnSecondary} onClick={() => fileInputRef.current?.click()}>Upload</button>
                  <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileSelected} />
                </div>
                {error && <div className={styles.alertError}>{error}</div>}
                <div className={styles.previewArea}>
                  {imageURL ? <img src={imageURL} alt="preview" className={styles.previewImg} /> : <div className={styles.placeholder}>No image selected</div>}
                </div>
                <div className={styles.row}>
                    <button className={styles.btnPrimary} onClick={analyze} disabled={!canAnalyze}>{busy ? "..." : "Analyze"}</button>
                    <button className={styles.btnGhost} onClick={resetAll}>Reset</button>
                </div>
              </section>

              <section className={styles.card}>
                <h2>Result</h2>
                {!result ? (
                  <div className={styles.placeholder}>Waiting for analysis...</div>
                ) : (
                  <div className={styles.resultsContainer}>
                    <h3 style={{ marginBottom: '15px', color: '#1f6feb' }}>
                      Summary: {getRipenessSummary(result)}
                    </h3>
                    {(() => {
                      const stagesShown = new Set();
                      return result.results
                        .filter(res => {
                          const key = res.is_banana ? res.ripeness : (res.detected_object || "Unknown");
                          if (stagesShown.has(key)) return false;
                          stagesShown.add(key);
                          return true;
                        })
                        .map((res, idx) => (
                          <div key={idx} className={res.is_banana ? styles.resultCard : styles.resultWarn} style={{marginBottom: '10px'}}>
                            {res.is_banana ? (
                              <>
                                <div className={styles.bigText}>{res.ripeness}</div>
                                <p>Confidence: {formatPct(res.confidence)}</p>
                                <p>{tipFor(res.ripeness)}</p>
                              </>
                            ) : (
                              <>
                                <h3 style={{ color: "red", marginBottom: "4px" }}>Object {idx + 1}: Not Banana</h3>
                                <p>{res.detected_object || "Unknown"}: {res.message}</p>
                                <p style={{ fontSize: "12px", opacity: 0.7 }}>
                                  May be it is orange like example
                                </p>
                              </>
                            )}
                          </div>
                      ));
                    })()}
                  </div>
                )}
              </section>
            </main>

            <section className={styles.historyCard}>
              <h2>Your History</h2>
              <div className={styles.historyList}>
                {history.map((item) => (
                  <div key={item.id} className={styles.historyItem}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt="ban" style={{ width: '30px', height: '30px', borderRadius: '4px', objectFit: 'cover' }} />
                      )}
                      <strong>
                        {getRipenessSummary(item.result)}
                      </strong>
                    </div>
                    <small>{new Date(item.createdAt).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}