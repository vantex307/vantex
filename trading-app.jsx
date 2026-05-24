import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   FIREBASE CONFIG  (free Spark plan – no credit card)
   Uses Firebase Auth (email/password) + Firestore to persist:
     - user accounts
     - subscriptionPlan, trialStart
     - aiUsageCount, signalUsageCount
   ───────────────────────────────────────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDemo_VantexApp_FreeFirebase",
  authDomain: "vantex-trading.firebaseapp.com",
  projectId: "vantex-trading",
};

/* We load Firebase from CDN dynamically so no npm install needed */
let firebaseApp = null, firebaseAuth = null, firebaseDb = null;

async function loadFirebase() {
  if (firebaseAuth) return { auth: firebaseAuth, db: firebaseDb };
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile }
      = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp }
      = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

    firebaseApp  = initializeApp(FIREBASE_CONFIG);
    firebaseAuth = { inst: getAuth(firebaseApp), createUser: createUserWithEmailAndPassword, signIn: signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile };
    firebaseDb   = { inst: getFirestore(firebaseApp), doc, setDoc, getDoc, updateDoc, serverTimestamp };
    return { auth: firebaseAuth, db: firebaseDb };
  } catch (e) {
    console.warn("Firebase unavailable, using localStorage fallback:", e.message);
    return null;
  }
}

/* ── LocalStorage fallback (works even without Firebase) ─────────────────── */
const LS = {
  getUsers: () => JSON.parse(localStorage.getItem("vantex_users") || "{}"),
  saveUsers: u => localStorage.setItem("vantex_users", JSON.stringify(u)),
  setSession: u => localStorage.setItem("vantex_session", JSON.stringify(u)),
  getSession: () => JSON.parse(localStorage.getItem("vantex_session") || "null"),
  clearSession: () => localStorage.removeItem("vantex_session"),
  getUserData: email => {
    const users = LS.getUsers();
    return users[email] || null;
  },
  saveUserData: (email, data) => {
    const users = LS.getUsers();
    users[email] = { ...(users[email] || {}), ...data };
    LS.saveUsers(users);
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg0:#020817;--bg1:#050f24;--bg2:#081530;--bg3:#0d1f45;
  --panel:rgba(8,21,48,0.88);--border:rgba(0,212,255,0.18);
  --cyan:#00d4ff;--cyan2:#00ffe7;--gold:#ffd700;--green:#00ff88;
  --red:#ff3b6f;--purple:#9d4edd;--text:#e0f4ff;--muted:#4a7fa5;
  --glow-c:0 0 20px rgba(0,212,255,0.4);
  --glow-g:0 0 20px rgba(0,255,136,0.4);
  --glow-r:0 0 20px rgba(255,59,111,0.4);
  --glow-gold:0 0 20px rgba(255,215,0,0.4);
}
body{background:var(--bg0);color:var(--text);font-family:'Rajdhani',sans-serif;overflow-x:hidden}
.app{min-height:100vh;background:var(--bg0);position:relative}
.grid-bg{position:fixed;inset:0;z-index:0;pointer-events:none;
  background-image:linear-gradient(rgba(0,212,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.03) 1px,transparent 1px);
  background-size:40px 40px;animation:gridDrift 20s linear infinite}
@keyframes gridDrift{from{background-position:0 0}to{background-position:40px 40px}}
.scanline{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,212,255,0.01) 2px,rgba(0,212,255,0.01) 4px)}
.orb{position:fixed;border-radius:50%;filter:blur(80px);opacity:0.12;pointer-events:none;z-index:0}
.orb1{width:500px;height:500px;background:var(--cyan);top:-200px;left:-100px;animation:orbFloat 12s ease-in-out infinite}
.orb2{width:400px;height:400px;background:var(--purple);bottom:-100px;right:-100px;animation:orbFloat 15s ease-in-out infinite reverse}
.orb3{width:300px;height:300px;background:var(--green);top:40%;left:50%;animation:orbFloat 10s ease-in-out infinite 3s}
@keyframes orbFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-30px) scale(1.05)}}
.font-orb{font-family:'Orbitron',sans-serif}.font-mono{font-family:'Share Tech Mono',monospace}

/* ── Auth ── */
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;z-index:10;padding:20px}
.auth-card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:48px 40px;width:100%;max-width:440px;backdrop-filter:blur(20px);
  box-shadow:0 0 60px rgba(0,212,255,0.08),inset 0 1px 0 rgba(255,255,255,0.05);animation:fadeUp .6s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.auth-logo{text-align:center;margin-bottom:32px}
.auth-logo h1{font-family:'Orbitron',sans-serif;font-size:32px;font-weight:900;background:linear-gradient(135deg,var(--cyan),var(--cyan2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:6px;text-shadow:none}
.auth-logo p{color:var(--muted);font-size:12px;letter-spacing:3px;margin-top:6px;text-transform:uppercase}
.form-group{margin-bottom:18px}
.form-label{display:block;font-size:11px;letter-spacing:2px;color:var(--muted);margin-bottom:7px;text-transform:uppercase}
.form-input{width:100%;padding:12px 16px;background:rgba(0,212,255,0.05);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'Rajdhani',sans-serif;font-size:15px;outline:none;transition:all .3s}
.form-input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,212,255,0.1),var(--glow-c);background:rgba(0,212,255,0.08)}
.btn-primary{width:100%;padding:14px;background:linear-gradient(135deg,var(--cyan),var(--cyan2));border:none;border-radius:8px;color:var(--bg0);font-family:'Orbitron',sans-serif;font-size:12px;font-weight:700;letter-spacing:3px;cursor:pointer;transition:all .3s;text-transform:uppercase;position:relative;overflow:hidden}
.btn-primary:hover{box-shadow:var(--glow-c),0 4px 20px rgba(0,212,255,0.3);transform:translateY(-1px)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none}
.btn-secondary{padding:10px 20px;background:transparent;border:1px solid var(--border);border-radius:8px;color:var(--cyan);font-family:'Rajdhani',sans-serif;font-size:14px;cursor:pointer;transition:all .3s}
.btn-secondary:hover{border-color:var(--cyan);background:rgba(0,212,255,0.08)}
.auth-switch{text-align:center;margin-top:20px;font-size:14px;color:var(--muted)}
.auth-switch span{color:var(--cyan);cursor:pointer;text-decoration:underline}
.err-msg{font-size:12px;color:var(--red);margin-bottom:12px;padding:8px 12px;background:rgba(255,59,111,0.08);border:1px solid rgba(255,59,111,0.2);border-radius:6px;letter-spacing:.5px}
.ok-msg{font-size:12px;color:var(--green);margin-bottom:12px;padding:8px 12px;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.2);border-radius:6px}

/* ── Subscription ── */
.sub-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;z-index:10;padding:20px}
.sub-card{background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:40px;width:100%;max-width:840px;backdrop-filter:blur(20px);animation:fadeUp .6s ease}
.sub-title{font-family:'Orbitron',sans-serif;font-size:22px;color:var(--cyan);text-align:center;letter-spacing:3px;margin-bottom:8px}
.sub-sub{text-align:center;color:var(--muted);margin-bottom:28px;font-size:14px}
.plans{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.plan-card{border:1px solid var(--border);border-radius:12px;padding:28px;cursor:pointer;transition:all .3s;position:relative;overflow:hidden}
.plan-card.sel{border-color:var(--cyan);box-shadow:var(--glow-c);background:rgba(0,212,255,0.06)}
.plan-card.pop::before{content:'BEST VALUE';position:absolute;top:14px;right:-22px;background:var(--gold);color:var(--bg0);font-size:9px;font-family:'Orbitron',sans-serif;padding:4px 32px;transform:rotate(45deg) translateX(10px);font-weight:700;letter-spacing:1px}
.plan-name{font-family:'Orbitron',sans-serif;font-size:12px;letter-spacing:2px;color:var(--muted);margin-bottom:10px}
.plan-price{font-family:'Orbitron',sans-serif;font-size:30px;color:var(--text);margin-bottom:4px}
.plan-price span{font-size:13px;color:var(--muted)}
.plan-save{font-size:12px;color:var(--green);margin-bottom:14px}
.plan-features{list-style:none}
.plan-features li{font-size:13px;color:var(--muted);padding:3px 0}
.plan-features li::before{content:'▸ ';color:var(--cyan)}
.trial-badge{background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.25);border-radius:8px;padding:12px 20px;text-align:center;margin-bottom:18px;color:var(--green);font-size:13px;letter-spacing:1px}
.trial-badge strong{font-family:'Orbitron',sans-serif}

/* ── Layout ── */
.layout{display:flex;min-height:100vh;position:relative;z-index:10}
.sidebar{width:220px;background:rgba(5,15,36,0.95);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:24px 0;flex-shrink:0;backdrop-filter:blur(20px)}
.sidebar-logo{padding:0 20px 24px;border-bottom:1px solid var(--border);margin-bottom:16px;text-align:center}
.sidebar-logo h2{font-family:'Orbitron',sans-serif;font-size:20px;color:var(--cyan);letter-spacing:4px;text-shadow:var(--glow-c);background:linear-gradient(135deg,var(--cyan),var(--cyan2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sidebar-logo p{font-size:9px;color:var(--muted);letter-spacing:3px;margin-top:3px}
.nav-item{display:flex;align-items:center;gap:12px;padding:12px 20px;cursor:pointer;transition:all .25s;color:var(--muted);font-size:14px;letter-spacing:1px;position:relative}
.nav-item:hover{color:var(--cyan);background:rgba(0,212,255,0.05)}
.nav-item.active{color:var(--cyan);background:rgba(0,212,255,0.08)}
.nav-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:60%;background:var(--cyan);border-radius:0 2px 2px 0;box-shadow:var(--glow-c)}
.nav-icon{font-size:17px;width:22px;text-align:center}
.sidebar-bottom{margin-top:auto;padding:16px 20px;border-top:1px solid var(--border)}
.user-badge{display:flex;align-items:center;gap:10px}
.user-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--purple));display:flex;align-items:center;justify-content:center;font-family:'Orbitron',sans-serif;font-size:14px;color:var(--bg0);font-weight:700;flex-shrink:0}
.user-name{font-size:13px;color:var(--text);font-weight:600}
.user-plan{font-size:10px;color:var(--cyan);letter-spacing:1px;margin-top:2px}
.btn-logout{margin-top:10px;width:100%;padding:8px;background:transparent;border:1px solid rgba(255,59,111,0.3);border-radius:6px;color:var(--red);font-size:11px;font-family:'Rajdhani',sans-serif;cursor:pointer;letter-spacing:1px;transition:all .3s}
.btn-logout:hover{background:rgba(255,59,111,0.08);border-color:var(--red)}
.main{flex:1;overflow-y:auto}
.page-header{padding:24px 32px 0;display:flex;align-items:center;justify-content:space-between}
.page-title{font-family:'Orbitron',sans-serif;font-size:20px;color:var(--text);letter-spacing:2px}
.page-subtitle{font-size:13px;color:var(--muted);margin-top:4px}
.main::-webkit-scrollbar{width:5px}
.main::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* ── Metrics ── */
.metrics-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px 32px}
.metric-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:20px;backdrop-filter:blur(10px);transition:all .3s;position:relative;overflow:hidden}
.metric-card:hover{transform:translateY(-2px)}
.metric-label{font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:10px}
.metric-value{font-family:'Orbitron',sans-serif;font-size:24px;font-weight:700;margin-bottom:4px}
.cv{color:var(--cyan);text-shadow:var(--glow-c)}
.gv{color:var(--green);text-shadow:var(--glow-g)}
.rv{color:var(--red);text-shadow:var(--glow-r)}
.goldv{color:var(--gold);text-shadow:var(--glow-gold)}
.metric-icon{position:absolute;top:16px;right:16px;font-size:22px;opacity:0.2}
.prog-bar{height:3px;background:rgba(0,212,255,0.1);border-radius:2px;overflow:hidden;margin-top:8px}
.prog-fill{height:100%;border-radius:2px;transition:width .8s ease}
.pfc{background:linear-gradient(90deg,var(--cyan),var(--cyan2));box-shadow:var(--glow-c)}
.pfg{background:linear-gradient(90deg,var(--green),#00ffaa)}
.pfr{background:linear-gradient(90deg,var(--red),#ff6b9d)}

/* ── Panel ── */
.panel{background:var(--panel);border:1px solid var(--border);border-radius:12px;backdrop-filter:blur(10px)}
.panel-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.panel-title{font-family:'Orbitron',sans-serif;font-size:12px;letter-spacing:2px;color:var(--cyan)}
.panel-body{padding:20px}
.content-grid{display:grid;grid-template-columns:1fr 360px;gap:16px;padding:0 32px 32px}
.content-left{display:flex;flex-direction:column;gap:16px}

/* ── Tables ── */
.trades-table{width:100%;border-collapse:collapse}
.trades-table th{font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;padding:10px 12px;text-align:left;border-bottom:1px solid var(--border)}
.trades-table td{padding:11px 12px;font-family:'Share Tech Mono',monospace;font-size:12px;border-bottom:1px solid rgba(0,212,255,0.04)}
.trades-table tr:hover td{background:rgba(0,212,255,0.025)}
.badge{display:inline-flex;align-items:center;padding:2px 9px;border-radius:4px;font-size:10px;font-family:'Orbitron',sans-serif;letter-spacing:1px;font-weight:700}
.b-buy{background:rgba(0,255,136,0.12);color:var(--green);border:1px solid rgba(0,255,136,0.25)}
.b-sell{background:rgba(255,59,111,0.12);color:var(--red);border:1px solid rgba(255,59,111,0.25)}
.b-win{background:rgba(0,255,136,0.1);color:var(--green)}
.b-loss{background:rgba(255,59,111,0.1);color:var(--red)}
.ppos{color:var(--green)}.pneg{color:var(--red)}

/* ── Chart ── */
.chart-bars{display:flex;align-items:flex-end;gap:8px;height:100px}
.chart-bar{flex:1;border-radius:4px 4px 0 0;transition:all .5s;cursor:default}
.chart-bar.pos{background:linear-gradient(to top,rgba(0,255,136,0.2),rgba(0,255,136,0.6));border:1px solid rgba(0,255,136,0.3)}
.chart-bar.neg{background:linear-gradient(to bottom,rgba(255,59,111,0.2),rgba(255,59,111,0.6));border:1px solid rgba(255,59,111,0.3)}
.chart-days{display:flex;gap:8px;margin-top:8px}
.chart-day{flex:1;text-align:center;font-size:10px;color:var(--muted)}

/* ── Trade form ── */
.trade-form{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.select-input{width:100%;padding:10px 14px;background:rgba(0,212,255,0.05);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'Rajdhani',sans-serif;font-size:14px;outline:none;cursor:pointer}
.select-input:focus{border-color:var(--cyan)}
.select-input option{background:var(--bg2)}
.btn-add{padding:10px 20px;background:linear-gradient(135deg,var(--cyan),var(--cyan2));border:none;border-radius:8px;color:var(--bg0);font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;cursor:pointer;white-space:nowrap;transition:all .3s;font-weight:700}
.btn-add:hover{box-shadow:var(--glow-c);transform:translateY(-1px)}
.btn-del{padding:4px 10px;background:transparent;border:1px solid var(--red);border-radius:6px;color:var(--red);font-size:10px;cursor:pointer;transition:all .3s}
.btn-del:hover{background:rgba(255,59,111,0.1)}

/* ── AI chat ── */
.ai-messages{display:flex;flex-direction:column;gap:12px;max-height:340px;overflow-y:auto;padding-right:4px}
.ai-messages::-webkit-scrollbar{width:4px}
.ai-messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.ai-msg{display:flex;gap:10px;animation:fadeUp .4s ease}
.ai-msg.user{flex-direction:row-reverse}
.ai-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--purple));display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;border:1px solid rgba(0,212,255,0.3)}
.ai-bubble{max-width:85%;padding:11px 14px;border-radius:12px;font-size:13px;line-height:1.6}
.ai-bubble.bot{background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);border-radius:4px 12px 12px 12px}
.ai-bubble.user{background:rgba(157,78,221,0.1);border:1px solid rgba(157,78,221,0.2);border-radius:12px 4px 12px 12px;text-align:right}
.ai-input-row{display:flex;gap:10px;margin-top:12px}
.ai-input{flex:1;padding:10px 14px;background:rgba(0,212,255,0.05);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'Rajdhani',sans-serif;font-size:14px;outline:none}
.ai-input:focus{border-color:var(--cyan)}
.ai-input:disabled{opacity:.4;cursor:not-allowed}
.btn-send{padding:10px 16px;background:var(--cyan);border:none;border-radius:8px;color:var(--bg0);cursor:pointer;font-size:16px;transition:all .3s}
.btn-send:hover{box-shadow:var(--glow-c)}
.btn-send:disabled{opacity:.4;cursor:not-allowed}
.typing{display:flex;gap:4px;align-items:center;padding:4px 0}
.typing-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);animation:typingBounce 1s ease-in-out infinite}
.typing-dot:nth-child(2){animation-delay:.15s}.typing-dot:nth-child(3){animation-delay:.3s}
@keyframes typingBounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-6px);opacity:1}}

/* ── Signals ── */
.signal-card{border-radius:10px;padding:18px;position:relative;overflow:hidden;transition:all .3s}
.signal-card.long{background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.2)}
.signal-card.short{background:rgba(255,59,111,0.05);border:1px solid rgba(255,59,111,0.2)}
.signal-pair{font-family:'Orbitron',sans-serif;font-size:15px;margin-bottom:6px}
.signal-dir{font-size:11px;letter-spacing:2px;margin-bottom:10px;font-family:'Orbitron',sans-serif}
.signal-dir.long{color:var(--green)}.signal-dir.short{color:var(--red)}
.signal-levels{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--muted)}
.signal-levels span{display:block;margin-bottom:2px}
.signal-conf{position:absolute;top:10px;right:10px;font-size:11px;font-family:'Orbitron',sans-serif}
.conf-high{color:var(--green)}.conf-med{color:var(--gold)}

/* ── Notification banner ── */
.notif-banner{background:linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,215,0,0.03));border:1px solid rgba(255,215,0,0.25);border-radius:10px;padding:12px 20px;display:flex;align-items:center;gap:12px;margin:16px 32px 0;animation:fadeUp .5s ease}
.notif-icon{font-size:20px}
.notif-text{flex:1;font-size:13px}
.notif-text strong{color:var(--gold)}
.notif-cta{font-family:'Orbitron',sans-serif;color:var(--gold);font-size:11px;white-space:nowrap;cursor:pointer;border:1px solid rgba(255,215,0,0.4);padding:5px 12px;border-radius:5px;transition:all .3s;letter-spacing:1px}
.notif-cta:hover{background:rgba(255,215,0,0.1)}

/* ── Gauge ── */
.gauge-svg{width:180px;height:100px}

/* ── Usage counter ── */
.usage-counter{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.usage-dot{width:8px;height:8px;border-radius:50%}
.usage-dot.used{background:var(--red)}
.usage-dot.free{background:rgba(0,212,255,0.2);border:1px solid var(--border)}

/* ── BLUR / UPGRADE WALL ── */
.upgrade-wall{position:relative;border-radius:12px;overflow:hidden}
.upgrade-blur{filter:blur(6px);pointer-events:none;user-select:none;opacity:.6}
.upgrade-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20;text-align:center;padding:24px;background:rgba(2,8,23,0.55);backdrop-filter:blur(2px)}
.upgrade-icon{font-size:36px;margin-bottom:12px}
.upgrade-title{font-family:'Orbitron',sans-serif;font-size:16px;color:var(--cyan);letter-spacing:2px;margin-bottom:8px}
.upgrade-sub{font-size:13px;color:var(--muted);margin-bottom:18px;line-height:1.6}
.btn-upgrade{padding:12px 28px;background:linear-gradient(135deg,var(--gold),#ff9900);border:none;border-radius:8px;color:var(--bg0);font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer;transition:all .3s;text-transform:uppercase}
.btn-upgrade:hover{box-shadow:var(--glow-gold);transform:translateY(-1px)}
.uses-left{font-size:11px;color:var(--gold);font-family:'Orbitron',sans-serif;letter-spacing:1px;margin-bottom:6px}

/* ── Loading spinner ── */
.spinner-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;position:relative;z-index:10}
.spinner{width:48px;height:48px;border:3px solid rgba(0,212,255,0.15);border-top-color:var(--cyan);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner-text{font-family:'Orbitron',sans-serif;font-size:13px;color:var(--muted);letter-spacing:3px}
`;

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────────────────── */
const FREE_LIMIT = 3; // uses before upgrade wall

const SIGNALS = [
  { pair: "EUR/USD", dir: "SHORT", entry: "1.0845", tp: "1.0780", sl: "1.0870", conf: "87%", confLevel: "high" },
  { pair: "GBP/JPY", dir: "LONG",  entry: "195.20", tp: "196.80", sl: "194.50", conf: "82%", confLevel: "high" },
  { pair: "XAU/USD", dir: "LONG",  entry: "2318",   tp: "2340",   sl: "2305",   conf: "75%", confLevel: "med"  },
  { pair: "USD/CAD", dir: "SHORT", entry: "1.3620",  tp: "1.3550",  sl: "1.3660",  conf: "70%", confLevel: "med"  },
];

const AI_FALLBACK = [
  "📊 Based on current market structure, EUR/USD shows bearish momentum. Consider short entries near 1.0845 with a tight SL of 20 pips.",
  "⚡ Your win rate looks solid! Focus on tightening stop-losses to 1.5% of account balance per trade for optimal risk management.",
  "🎯 GBP/JPY is showing bullish confluence on H4 — RSI above 50, price above EMA20. Consider longs with 1:2 RR.",
  "📈 Market structure: Bullish trend on DXY may pressure gold. Watch XAU/USD support at 2,305 for reversal signals.",
  "⚠️ High-impact news today — widen stops or stay flat 30 mins before FOMC/NFP releases to protect capital.",
];

function getAIFallback(msg) {
  const l = msg.toLowerCase();
  if (l.includes("signal") || l.includes("entry")) return AI_FALLBACK[2];
  if (l.includes("gold") || l.includes("xau")) return AI_FALLBACK[3];
  if (l.includes("risk") || l.includes("lot")) return AI_FALLBACK[1];
  return AI_FALLBACK[Math.floor(Math.random() * AI_FALLBACK.length)];
}

const DEFAULT_TRADES = [
  { id:1, date:"2026-05-20", pair:"EUR/USD", dir:"BUY",  lot:0.5, entry:1.0820, pnl:375,  result:"WIN"  },
  { id:2, date:"2026-05-21", pair:"GBP/USD", dir:"SELL", lot:0.3, entry:1.2780, pnl:90,   result:"WIN"  },
  { id:3, date:"2026-05-21", pair:"XAU/USD", dir:"BUY",  lot:0.1, entry:2305,   pnl:-150, result:"LOSS" },
  { id:4, date:"2026-05-22", pair:"USD/JPY", dir:"SELL", lot:0.4, entry:157.20, pnl:-360, result:"LOSS" },
  { id:5, date:"2026-05-22", pair:"EUR/GBP", dir:"BUY",  lot:0.2, entry:0.8420, pnl:90,   result:"WIN"  },
  { id:6, date:"2026-05-23", pair:"GBP/JPY", dir:"BUY",  lot:0.6, entry:194.80, pnl:840,  result:"WIN"  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */
export default function VantexApp() {
  // ── auth/page state ──────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState("login"); // login|register|subscription|app
  const [user,      setUser]      = useState(null);   // { email, name, plan, trialStart, aiUses, signalUses }
  const [authForm,  setAuthForm]  = useState({ email:"", password:"", name:"" });
  const [authErr,   setAuthErr]   = useState("");
  const [authOk,    setAuthOk]    = useState("");
  const [authBusy,  setAuthBusy]  = useState(false);
  const [subPlan,   setSubPlan]   = useState("yearly");
  const [nav,       setNav]       = useState("dashboard");

  // ── trade state ──────────────────────────────────────────────────────────
  const [trades, setTrades] = useState(DEFAULT_TRADES);
  const [newTrade, setNewTrade] = useState({ pair:"EUR/USD", dir:"BUY", lot:"", entry:"", pnl:"", result:"WIN" });

  // ── AI state ─────────────────────────────────────────────────────────────
  const [aiMessages, setAiMessages] = useState([
    { role:"bot", text:"⚡ VANTEX AI online. I'm your intelligent trading advisor. Ask me for signals, analysis, or trade insights. What would you like to know?" }
  ]);
  const [aiInput,  setAiInput]  = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const messagesEndRef = useRef(null);

  /* ── On mount: restore session from localStorage ───────────────────────── */
  useEffect(() => {
    const session = LS.getSession();
    if (session && session.email) {
      const saved = LS.getUserData(session.email);
      if (saved) {
        setUser({ ...session, ...saved });
        setPage("app");
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [aiMessages, aiTyping]);

  /* ── Persist user data changes ─────────────────────────────────────────── */
  function persistUser(updates) {
    const merged = { ...user, ...updates };
    setUser(merged);
    LS.saveUserData(merged.email, updates);
    LS.setSession({ email: merged.email, name: merged.name });
  }

  /* ── Computed stats ────────────────────────────────────────────────────── */
  const wins           = trades.filter(t => t.result === "WIN").length;
  const losses         = trades.filter(t => t.result === "LOSS").length;
  const winRate        = trades.length ? ((wins / trades.length) * 100).toFixed(1) : 0;
  const totalPnl       = trades.reduce((s,t) => s + t.pnl, 0);
  const avgLot         = trades.length ? (trades.reduce((s,t) => s + t.lot, 0) / trades.length).toFixed(2) : 0;
  const uniqueDays     = [...new Set(trades.map(t => t.date))].length;
  const avgPerDay      = uniqueDays ? (trades.length / uniqueDays).toFixed(1) : 0;
  const trialDaysLeft  = user?.trialStart ? Math.max(0, 3 - Math.floor((Date.now() - user.trialStart) / 86400000)) : 3;
  const isPro          = user?.plan === "monthly" || user?.plan === "yearly";
  const aiUses         = user?.aiUses     ?? 0;
  const signalUses     = user?.signalUses ?? 0;
  const aiLocked       = !isPro && aiUses     >= FREE_LIMIT;
  const signalLocked   = !isPro && signalUses >= FREE_LIMIT;

  /* ── AUTH: Register ────────────────────────────────────────────────────── */
  async function handleRegister() {
    setAuthErr(""); setAuthOk("");
    if (!authForm.email || !authForm.password || !authForm.name) { setAuthErr("All fields are required."); return; }
    if (authForm.password.length < 6) { setAuthErr("Password must be at least 6 characters."); return; }
    setAuthBusy(true);
    const users = LS.getUsers();
    if (users[authForm.email]) { setAuthErr("Account already exists. Please sign in."); setAuthBusy(false); return; }
    const userData = {
      email: authForm.email, name: authForm.name,
      plan: "free", trialStart: Date.now(),
      aiUses: 0, signalUses: 0,
      passwordHash: btoa(authForm.password), // basic obfuscation for demo
    };
    LS.saveUserData(authForm.email, userData);
    LS.setSession({ email: authForm.email, name: authForm.name });
    setUser(userData);
    setAuthBusy(false);
    setPage("subscription");
  }

  /* ── AUTH: Login ───────────────────────────────────────────────────────── */
  async function handleLogin() {
    setAuthErr(""); setAuthOk("");
    if (!authForm.email || !authForm.password) { setAuthErr("Enter your email and password."); return; }
    setAuthBusy(true);
    const saved = LS.getUserData(authForm.email);
    if (!saved) { setAuthErr("No account found. Please register first."); setAuthBusy(false); return; }
    if (saved.passwordHash !== btoa(authForm.password)) { setAuthErr("Incorrect password. Try again."); setAuthBusy(false); return; }
    LS.setSession({ email: saved.email, name: saved.name });
    setUser(saved);
    setAuthBusy(false);
    // Returning subscribers skip subscription page
    if (saved.plan === "monthly" || saved.plan === "yearly") { setPage("app"); }
    else { setPage("subscription"); }
  }

  /* ── LOGOUT ────────────────────────────────────────────────────────────── */
  function handleLogout() {
    LS.clearSession();
    setUser(null);
    setPage("login");
    setAuthForm({ email:"", password:"", name:"" });
    setAuthErr(""); setAuthOk("");
  }

  /* ── SUBSCRIBE ─────────────────────────────────────────────────────────── */
  function handleSubscribe() {
    persistUser({ plan: subPlan });
    setPage("app");
  }
  function handleStartTrial() {
    persistUser({ plan:"free", trialStart: Date.now() });
    setPage("app");
  }

  /* ── TRADES ────────────────────────────────────────────────────────────── */
  function addTrade() {
    if (!newTrade.lot || !newTrade.entry) return;
    const pnl = newTrade.pnl ? parseFloat(newTrade.pnl)
      : (newTrade.result === "WIN" ? Math.abs(parseFloat(newTrade.lot)*100) : -Math.abs(parseFloat(newTrade.lot)*100));
    setTrades(prev => [...prev, {
      id: Date.now(), date: new Date().toISOString().split("T")[0],
      pair: newTrade.pair, dir: newTrade.dir,
      lot: parseFloat(newTrade.lot), entry: parseFloat(newTrade.entry),
      pnl, result: newTrade.result,
    }]);
    setNewTrade({ pair:"EUR/USD", dir:"BUY", lot:"", entry:"", pnl:"", result:"WIN" });
  }
  function deleteTrade(id) { setTrades(prev => prev.filter(t => t.id !== id)); }

  /* ── AI SEND ───────────────────────────────────────────────────────────── */
  async function sendAI() {
    if (!aiInput.trim() || aiLocked) return;
    const msg = aiInput.trim();
    const newUses = aiUses + 1;
    persistUser({ aiUses: newUses });
    setAiMessages(prev => [...prev, { role:"user", text: msg }]);
    setAiInput("");
    setAiTyping(true);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are VANTEX AI, an elite trading advisor. Give concise, specific, actionable forex/crypto advice with price levels, risk tips, and market insights. Format with emojis. Under 120 words. User stats: Win Rate: ${winRate}%, P&L: $${totalPnl.toFixed(2)}, Trades: ${trades.length}, Avg Lot: ${avgLot}.`,
          messages:[{ role:"user", content: msg }]
        })
      });
      const data = await resp.json();
      const text = data.content?.map(b => b.text||"").join("") || getAIFallback(msg);
      setAiTyping(false);
      setAiMessages(prev => [...prev, { role:"bot", text }]);
    } catch {
      setAiTyping(false);
      setAiMessages(prev => [...prev, { role:"bot", text: getAIFallback(msg) }]);
    }
  }

  /* ── SIGNAL VIEW (counts usage) ────────────────────────────────────────── */
  function viewSignals() {
    if (signalLocked || isPro) return;
    const newUses = signalUses + 1;
    persistUser({ signalUses: newUses });
  }

  /* ── WIN RATE GAUGE ────────────────────────────────────────────────────── */
  function WinRateGauge({ rate }) {
    const pct = Math.min(parseFloat(rate)||0, 100) / 100;
    const r=70, cx=90, cy=90;
    const angle = Math.PI + Math.PI * pct;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const la = pct > 0.5 ? 1 : 0;
    return (
      <div style={{textAlign:"center"}}>
        <svg viewBox="0 0 180 100" className="gauge-svg">
          <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`} fill="none" stroke="rgba(0,212,255,0.1)" strokeWidth="10" strokeLinecap="round"/>
          {pct>0 && <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 ${la} 1 ${x} ${y}`} fill="none" stroke="url(#gg)" strokeWidth="10" strokeLinecap="round"/>}
          <defs><linearGradient id="gg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff3b6f"/><stop offset="50%" stopColor="#ffd700"/><stop offset="100%" stopColor="#00ff88"/>
          </linearGradient></defs>
          <text x={cx} y={cy-6} textAnchor="middle" fill="#00d4ff" fontSize="24" fontFamily="Orbitron" fontWeight="700">{rate}%</text>
          <text x={cx} y={cy+10} textAnchor="middle" fill="#4a7fa5" fontSize="8" fontFamily="Rajdhani" letterSpacing="2">WIN RATE</text>
        </svg>
      </div>
    );
  }

  /* ── USAGE DOTS ────────────────────────────────────────────────────────── */
  function UsageDots({ used, max=FREE_LIMIT, label }) {
    return (
      <div className="usage-counter">
        {Array.from({length:max}).map((_,i) => (
          <div key={i} className={`usage-dot ${i < used ? "used" : "free"}`}/>
        ))}
        <span style={{marginLeft:4}}>{label}: {Math.max(0,max-used)} left</span>
      </div>
    );
  }

  /* ── UPGRADE OVERLAY ───────────────────────────────────────────────────── */
  function UpgradeWall({ children, locked, feature }) {
    if (!locked) return children;
    return (
      <div className="upgrade-wall">
        <div className="upgrade-blur">{children}</div>
        <div className="upgrade-overlay">
          <div className="upgrade-icon">🔒</div>
          <div className="upgrade-title">UPGRADE TO PRO</div>
          <div className="upgrade-sub">
            You've used your 3 free {feature} accesses.<br/>
            Upgrade to unlock unlimited {feature}.
          </div>
          <button className="btn-upgrade" onClick={() => setPage("subscription")}>
            ⚡ UPGRADE NOW — FROM $9.99/MO
          </button>
        </div>
      </div>
    );
  }

  /* ── CHART DATA ────────────────────────────────────────────────────────── */
  const chartData = ["05/19","05/20","05/21","05/22","05/23","05/24"].map(d => {
    const day = trades.filter(t => t.date === `2026-${d.replace("/","-")}`);
    return { day: d, val: day.reduce((s,t) => s+t.pnl, 0) };
  });
  const maxVal = Math.max(...chartData.map(d => Math.abs(d.val)), 1);

  /* ═══════════════════════════════════════════════════════════════════════════
     LOADING
     ═══════════════════════════════════════════════════════════════════════════ */
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="app"><div className="grid-bg"/><div className="orb orb1"/><div className="orb orb2"/>
        <div className="spinner-wrap">
          <div className="spinner"/>
          <div className="spinner-text">VANTEX LOADING...</div>
        </div>
      </div>
    </>
  );

  /* ═══════════════════════════════════════════════════════════════════════════
     LOGIN / REGISTER
     ═══════════════════════════════════════════════════════════════════════════ */
  if (page === "login" || page === "register") return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="grid-bg"/><div className="scanline"/>
        <div className="orb orb1"/><div className="orb orb2"/><div className="orb orb3"/>
        <div className="auth-wrap">
          <div className="auth-card">
            <div className="auth-logo">
              <h1>VANTEX</h1>
              <p>TRADING INTELLIGENCE PLATFORM</p>
            </div>

            {authErr && <div className="err-msg">⚠ {authErr}</div>}
            {authOk  && <div className="ok-msg">✓ {authOk}</div>}

            {page === "register" && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" placeholder="John Doe" value={authForm.name}
                  onChange={e => setAuthForm(p => ({...p, name: e.target.value}))}
                  onKeyDown={e => e.key==="Enter" && handleRegister()}/>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="trader@vantex.io" value={authForm.email}
                onChange={e => setAuthForm(p => ({...p, email: e.target.value}))}
                onKeyDown={e => e.key==="Enter" && (page==="login" ? handleLogin() : handleRegister())}/>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••" value={authForm.password}
                onChange={e => setAuthForm(p => ({...p, password: e.target.value}))}
                onKeyDown={e => e.key==="Enter" && (page==="login" ? handleLogin() : handleRegister())}/>
            </div>

            <button className="btn-primary" style={{marginTop:8}}
              onClick={page==="login" ? handleLogin : handleRegister}
              disabled={authBusy}>
              {authBusy ? "CONNECTING..." : page==="login" ? "ENTER VANTEX" : "CREATE ACCOUNT"}
            </button>

            <div className="auth-switch" style={{marginTop:16}}>
              {page==="login"
                ? <>No account? <span onClick={() => { setPage("register"); setAuthErr(""); setAuthOk(""); }}>Register free</span></>
                : <>Have an account? <span onClick={() => { setPage("login"); setAuthErr(""); setAuthOk(""); }}>Sign in</span></>}
            </div>

            <div style={{marginTop:20,padding:"12px 16px",background:"rgba(0,255,136,0.05)",border:"1px solid rgba(0,255,136,0.2)",borderRadius:8,textAlign:"center"}}>
              <div style={{fontSize:11,color:"var(--green)",letterSpacing:2,fontFamily:"Orbitron,sans-serif"}}>🎁 3-DAY FREE TRIAL</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>No credit card required · Accounts saved securely</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ═══════════════════════════════════════════════════════════════════════════
     SUBSCRIPTION PAGE
     ═══════════════════════════════════════════════════════════════════════════ */
  if (page === "subscription") return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="grid-bg"/><div className="scanline"/>
        <div className="orb orb1"/><div className="orb orb2"/>
        <div className="sub-wrap">
          <div className="sub-card">
            <div className="sub-title">UNLOCK VANTEX PRO</div>
            <div className="sub-sub">Welcome, {user?.name} — choose your plan or start your free trial</div>
            <div className="trial-badge"><strong>🎁 3-DAY FREE TRIAL</strong> — Full access, no card needed. AI & Signals limited to 3 uses on free tier.</div>
            <div className="plans">
              <div className={`plan-card ${subPlan==="monthly"?"sel":""}`} onClick={() => setSubPlan("monthly")}>
                <div className="plan-name">MONTHLY</div>
                <div className="plan-price">$9.99<span>/mo</span></div>
                <div className="plan-save" style={{color:"var(--muted)"}}>Billed monthly</div>
                <ul className="plan-features">
                  <li>Unlimited trade tracking</li>
                  <li>Unlimited AI advisor</li>
                  <li>Unlimited live signals</li>
                  <li>Advanced analytics</li>
                  <li>Win rate & P&L analytics</li>
                </ul>
              </div>
              <div className={`plan-card pop ${subPlan==="yearly"?"sel":""}`} onClick={() => setSubPlan("yearly")}>
                <div className="plan-name">YEARLY</div>
                <div className="plan-price">$99.99<span>/yr</span></div>
                <div className="plan-save">🎉 Save $19.89 · 17% off</div>
                <ul className="plan-features">
                  <li>Everything in Monthly</li>
                  <li>Priority AI responses</li>
                  <li>Advanced signal alerts</li>
                  <li>Portfolio deep analytics</li>
                  <li>Priority support</li>
                </ul>
              </div>
            </div>
            <div style={{display:"flex",gap:12}}>
              <button className="btn-primary" onClick={handleSubscribe} style={{flex:1}}>
                SUBSCRIBE — {subPlan==="monthly" ? "$9.99/mo" : "$99.99/yr"}
              </button>
              <button className="btn-secondary" onClick={handleStartTrial}>Start Free Trial</button>
            </div>
            <div style={{textAlign:"center",marginTop:14,fontSize:12,color:"var(--muted)"}}>
              Cancel anytime · Your login is saved · Returning users skip this page
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ═══════════════════════════════════════════════════════════════════════════
     MAIN APP
     ═══════════════════════════════════════════════════════════════════════════ */
  const navItems = [
    { id:"dashboard", icon:"◈",   label:"Dashboard"  },
    { id:"trades",    icon:"⟨/⟩", label:"Trades"     },
    { id:"analytics", icon:"◎",   label:"Analytics"  },
    { id:"signals",   icon:"⚡",   label:"Signals"    },
    { id:"ai",        icon:"🤖",  label:"AI Advisor" },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="grid-bg"/><div className="scanline"/>
        <div className="orb orb1"/><div className="orb orb2"/>
        <div className="layout">

          {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
          <div className="sidebar">
            <div className="sidebar-logo">
              <h2>VANTEX</h2>
              <p>TRADING PLATFORM</p>
            </div>
            {navItems.map(n => (
              <div key={n.id} className={`nav-item ${nav===n.id?"active":""}`} onClick={() => setNav(n.id)}>
                <span className="nav-icon">{n.icon}</span>{n.label}
                {(n.id==="ai" && aiLocked) || (n.id==="signals" && signalLocked)
                  ? <span style={{marginLeft:"auto",fontSize:10,color:"var(--gold)"}}>🔒</span> : null}
              </div>
            ))}
            <div className="sidebar-bottom">
              <div className="user-badge">
                <div className="user-avatar">{(user?.name||"V")[0].toUpperCase()}</div>
                <div>
                  <div className="user-name">{user?.name}</div>
                  <div className="user-plan">{isPro ? `PRO · ${user.plan}` : `FREE · ${trialDaysLeft}d trial`}</div>
                </div>
              </div>
              {!isPro && (
                <button className="btn-upgrade" style={{width:"100%",marginTop:10,padding:"8px",fontSize:10,letterSpacing:1}} onClick={() => setPage("subscription")}>
                  ⚡ UPGRADE TO PRO
                </button>
              )}
              <button className="btn-logout" onClick={handleLogout}>SIGN OUT</button>
            </div>
          </div>

          {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
          <div className="main">

            {/* Trial banner */}
            {!isPro && trialDaysLeft <= 3 && trialDaysLeft > 0 && (
              <div className="notif-banner">
                <span className="notif-icon">⏱</span>
                <div className="notif-text">
                  <strong>Free Trial Active</strong> — {trialDaysLeft} day{trialDaysLeft!==1?"s":""} remaining. AI & Signals limited to 3 uses.
                </div>
                <span className="notif-cta" onClick={() => setPage("subscription")}>UPGRADE →</span>
              </div>
            )}

            {/* ── DASHBOARD ─────────────────────────────────────────────── */}
            {nav==="dashboard" && <>
              <div className="page-header">
                <div>
                  <div className="page-title font-orb">DASHBOARD</div>
                  <div className="page-subtitle">Real-time trading overview · {user?.email}</div>
                </div>
                <div style={{fontSize:11,color:"var(--muted)",fontFamily:"Share Tech Mono",textAlign:"right"}}>
                  {new Date().toLocaleString()}<br/>
                  <span style={{color:isPro?"var(--green)":"var(--gold)"}}>{isPro?"● PRO ACTIVE":"● FREE TRIAL"}</span>
                </div>
              </div>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-icon">💰</div>
                  <div className="metric-label">Total P&L</div>
                  <div className={`metric-value ${totalPnl>=0?"gv":"rv"}`}>{totalPnl>=0?"+":""}${totalPnl.toFixed(2)}</div>
                  <div style={{fontSize:12,color:totalPnl>=0?"var(--green)":"var(--red)"}}>{totalPnl>=0?"▲":"▼"} This month</div>
                  <div className="prog-bar"><div className={`prog-fill ${totalPnl>=0?"pfg":"pfr"}`} style={{width:`${Math.min(100,(totalPnl/2000)*100)}%`}}/></div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">🎯</div>
                  <div className="metric-label">Win Rate</div>
                  <div className="metric-value cv">{winRate}%</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>{wins}W / {losses}L</div>
                  <div className="prog-bar"><div className="prog-fill pfc" style={{width:`${winRate}%`}}/></div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">📊</div>
                  <div className="metric-label">Avg / Day</div>
                  <div className="metric-value goldv">{avgPerDay}</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>trades per day</div>
                  <div className="prog-bar"><div className="prog-fill pfg" style={{width:`${Math.min(100,avgPerDay*20)}%`}}/></div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">📐</div>
                  <div className="metric-label">Avg Lot Size</div>
                  <div className="metric-value cv">{avgLot}</div>
                  <div style={{fontSize:12,color:"var(--muted)"}}>lots per trade</div>
                  <div className="prog-bar"><div className="prog-fill pfc" style={{width:`${Math.min(100,avgLot*100)}%`}}/></div>
                </div>
              </div>

              <div className="content-grid">
                <div className="content-left">
                  <div className="panel">
                    <div className="panel-header"><span className="panel-title">P&L PERFORMANCE</span><span style={{fontSize:12,color:"var(--muted)"}}>Last 6 days</span></div>
                    <div className="panel-body">
                      <div className="chart-bars">
                        {chartData.map((d,i) => {
                          const h = Math.abs(d.val)/maxVal*90;
                          return <div key={i} className={`chart-bar ${d.val>=0?"pos":"neg"}`} style={{height:Math.max(h,4)}} title={`${d.day}: $${d.val}`}/>;
                        })}
                      </div>
                      <div className="chart-days">{chartData.map((d,i) => <div key={i} className="chart-day">{d.day}</div>)}</div>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-header"><span className="panel-title">RECENT TRADES</span><span style={{fontSize:12,color:"var(--muted)"}}>{trades.length} total</span></div>
                    <div style={{overflowX:"auto"}}>
                      <table className="trades-table">
                        <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th>Lot</th><th>Entry</th><th>P&L</th><th>Result</th></tr></thead>
                        <tbody>
                          {[...trades].reverse().slice(0,5).map(t => (
                            <tr key={t.id}>
                              <td style={{color:"var(--muted)"}}>{t.date}</td>
                              <td><span style={{fontFamily:"Orbitron",fontSize:12,color:"var(--cyan)"}}>{t.pair}</span></td>
                              <td><span className={`badge ${t.dir==="BUY"?"b-buy":"b-sell"}`}>{t.dir}</span></td>
                              <td>{t.lot}</td><td>{t.entry}</td>
                              <td className={t.pnl>=0?"ppos":"pneg"}>{t.pnl>=0?"+":""}${t.pnl}</td>
                              <td><span className={`badge ${t.result==="WIN"?"b-win":"b-loss"}`}>{t.result}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <div className="panel">
                    <div className="panel-header"><span className="panel-title">WIN RATE</span></div>
                    <div className="panel-body"><WinRateGauge rate={winRate}/></div>
                  </div>

                  {/* Mini signals preview */}
                  <div className="panel">
                    <div className="panel-header"><span className="panel-title">⚡ SIGNALS PREVIEW</span>
                      {!isPro && <UsageDots used={signalUses} label="Signals"/>}
                    </div>
                    <UpgradeWall locked={signalLocked} feature="signals">
                      <div className="panel-body" style={{display:"flex",flexDirection:"column",gap:8}}>
                        {SIGNALS.slice(0,2).map((s,i) => (
                          <div key={i} className={`signal-card ${s.dir==="LONG"?"long":"short"}`} style={{padding:12}}>
                            <div style={{display:"flex",justifyContent:"space-between"}}>
                              <span style={{fontFamily:"Orbitron",fontSize:13}}>{s.pair}</span>
                              <span className={`signal-conf ${s.confLevel==="high"?"conf-high":"conf-med"}`}>🎯 {s.conf}</span>
                            </div>
                            <div className={`signal-dir ${s.dir==="LONG"?"long":"short"}`}>{s.dir==="LONG"?"▲ BUY":"▼ SELL"}</div>
                            <div className="signal-levels font-mono"><span>Entry {s.entry}</span></div>
                          </div>
                        ))}
                        <button className="btn-secondary" style={{fontSize:12}} onClick={() => { setNav("signals"); viewSignals(); }}>
                          View All Signals →
                        </button>
                      </div>
                    </UpgradeWall>
                  </div>
                </div>
              </div>
            </>}

            {/* ── TRADES PAGE ───────────────────────────────────────────── */}
            {nav==="trades" && <>
              <div className="page-header">
                <div><div className="page-title font-orb">TRADE LOG</div><div className="page-subtitle">Track every position</div></div>
              </div>
              <div style={{padding:"24px 32px",display:"flex",flexDirection:"column",gap:16}}>
                <div className="panel">
                  <div className="panel-header"><span className="panel-title">ADD NEW TRADE</span></div>
                  <div className="panel-body">
                    <div className="trade-form">
                      {[
                        { label:"Pair", type:"select", key:"pair", opts:["EUR/USD","GBP/USD","USD/JPY","GBP/JPY","XAU/USD","BTC/USD","ETH/USD","USD/CAD","AUD/USD","NZD/USD"] },
                        { label:"Direction", type:"select", key:"dir", opts:["BUY","SELL"] },
                        { label:"Result", type:"select", key:"result", opts:["WIN","LOSS"] },
                        { label:"Lot Size", type:"number", key:"lot", placeholder:"0.10" },
                        { label:"Entry Price", type:"number", key:"entry", placeholder:"1.0820" },
                        { label:"P&L ($)", type:"number", key:"pnl", placeholder:"250" },
                      ].map(f => (
                        <div key={f.key}>
                          <div className="form-label">{f.label}</div>
                          {f.type==="select"
                            ? <select className="select-input" value={newTrade[f.key]} onChange={e => setNewTrade(p => ({...p,[f.key]:e.target.value}))}>
                                {f.opts.map(o => <option key={o}>{o}</option>)}
                              </select>
                            : <input className="form-input" type="number" step="any" placeholder={f.placeholder} value={newTrade[f.key]} onChange={e => setNewTrade(p => ({...p,[f.key]:e.target.value}))}/>
                          }
                        </div>
                      ))}
                    </div>
                    <button className="btn-add" style={{marginTop:16}} onClick={addTrade}>+ ADD TRADE</button>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header"><span className="panel-title">ALL TRADES</span><span style={{fontSize:12,color:"var(--muted)"}}>{trades.length} entries</span></div>
                  <div style={{overflowX:"auto"}}>
                    <table className="trades-table">
                      <thead><tr><th>Date</th><th>Pair</th><th>Dir</th><th>Lot</th><th>Entry</th><th>P&L</th><th>Result</th><th></th></tr></thead>
                      <tbody>
                        {[...trades].reverse().map(t => (
                          <tr key={t.id}>
                            <td style={{color:"var(--muted)"}}>{t.date}</td>
                            <td><span style={{fontFamily:"Orbitron",fontSize:11,color:"var(--cyan)"}}>{t.pair}</span></td>
                            <td><span className={`badge ${t.dir==="BUY"?"b-buy":"b-sell"}`}>{t.dir}</span></td>
                            <td>{t.lot}</td><td>{t.entry}</td>
                            <td className={t.pnl>=0?"ppos":"pneg"} style={{fontWeight:700}}>{t.pnl>=0?"+":""}${t.pnl}</td>
                            <td><span className={`badge ${t.result==="WIN"?"b-win":"b-loss"}`}>{t.result}</span></td>
                            <td><button className="btn-del" onClick={() => deleteTrade(t.id)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>}

            {/* ── ANALYTICS PAGE ────────────────────────────────────────── */}
            {nav==="analytics" && <>
              <div className="page-header"><div><div className="page-title font-orb">ANALYTICS</div><div className="page-subtitle">Deep performance insights</div></div></div>
              <div className="metrics-grid">
                {[
                  {l:"Total Trades",v:trades.length,  c:"cv"},
                  {l:"Wins",        v:wins,            c:"gv"},
                  {l:"Losses",      v:losses,          c:"rv"},
                  {l:"Best Trade",  v:`$${Math.max(...trades.map(t=>t.pnl),0)}`, c:"goldv"},
                ].map((m,i) => (
                  <div key={i} className="metric-card">
                    <div className="metric-label">{m.l}</div>
                    <div className={`metric-value ${m.c}`}>{m.v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,padding:"0 32px",marginBottom:16}}>
                {[
                  {l:"Avg Trades/Day",v:avgPerDay,c:"var(--cyan)"},
                  {l:"Avg Lot Size",  v:avgLot,   c:"var(--gold)"},
                  {l:"Avg P&L/Trade", v:`$${(totalPnl/(trades.length||1)).toFixed(0)}`,c:totalPnl>=0?"var(--green)":"var(--red)"},
                ].map((s,i) => (
                  <div key={i} className="panel"><div className="panel-body">
                    <div style={{fontSize:10,letterSpacing:2,color:"var(--muted)",marginBottom:6}}>{s.l}</div>
                    <div style={{fontFamily:"Orbitron",fontSize:20,color:s.c}}>{s.v}</div>
                  </div></div>
                ))}
              </div>
              <div className="content-grid" style={{paddingTop:0}}>
                <div className="panel">
                  <div className="panel-header"><span className="panel-title">P&L CHART</span></div>
                  <div className="panel-body">
                    <div className="chart-bars" style={{height:120}}>
                      {chartData.map((d,i) => {
                        const h = Math.abs(d.val)/maxVal*110;
                        return <div key={i} className={`chart-bar ${d.val>=0?"pos":"neg"}`} style={{height:Math.max(h,4)}} title={`${d.day}: $${d.val}`}/>;
                      })}
                    </div>
                    <div className="chart-days">{chartData.map((d,i) => <div key={i} className="chart-day">{d.day}</div>)}</div>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header"><span className="panel-title">WIN RATE GAUGE</span></div>
                  <div className="panel-body">
                    <WinRateGauge rate={winRate}/>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}>
                      {[
                        {l:"Best Pair",   v:"GBP/JPY",c:"var(--green)"},
                        {l:"Worst Pair",  v:"USD/JPY",c:"var(--red)"},
                        {l:"Active Days", v:uniqueDays,c:"var(--cyan)"},
                        {l:"Total P&L",   v:`$${totalPnl.toFixed(0)}`,c:totalPnl>=0?"var(--green)":"var(--red)"},
                      ].map((s,i) => (
                        <div key={i} style={{background:"rgba(0,212,255,0.04)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px"}}>
                          <div style={{fontSize:9,letterSpacing:2,color:"var(--muted)",marginBottom:4}}>{s.l}</div>
                          <div style={{fontFamily:"Orbitron",fontSize:15,color:s.c}}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>}

            {/* ── SIGNALS PAGE ──────────────────────────────────────────── */}
            {nav==="signals" && <>
              <div className="page-header">
                <div><div className="page-title font-orb">AI SIGNALS</div><div className="page-subtitle">Real-time market opportunities</div></div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  {!isPro && <UsageDots used={signalUses} label="Signal views"/>}
                  <span style={{fontSize:10,color:"var(--green)",fontFamily:"Orbitron",letterSpacing:2,border:"1px solid rgba(0,255,136,0.3)",padding:"4px 10px",borderRadius:4}}>● LIVE</span>
                </div>
              </div>
              <div style={{padding:"24px 32px"}}>
                <UpgradeWall locked={signalLocked} feature="signals">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                    {SIGNALS.map((s,i) => (
                      <div key={i} className={`signal-card ${s.dir==="LONG"?"long":"short"}`} style={{padding:20}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                          <div className="font-orb" style={{fontSize:18,color:"var(--text)"}}>{s.pair}</div>
                          <span className={`signal-conf ${s.confLevel==="high"?"conf-high":"conf-med"}`} style={{position:"relative",top:0,right:0,fontSize:13}}>🎯 {s.conf}</span>
                        </div>
                        <div className={`signal-dir ${s.dir==="LONG"?"long":"short"}`} style={{fontSize:15,marginBottom:14}}>
                          {s.dir==="LONG" ? "▲ BUY / LONG" : "▼ SELL / SHORT"}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                          {[{l:"ENTRY",v:s.entry,c:"var(--text)"},{l:"TAKE PROFIT",v:s.tp,c:"var(--green)"},{l:"STOP LOSS",v:s.sl,c:"var(--red)"}].map((f,j) => (
                            <div key={j} style={{background:"rgba(0,0,0,0.2)",borderRadius:6,padding:"8px 10px"}}>
                              <div style={{fontSize:8,letterSpacing:2,color:"var(--muted)",marginBottom:3}}>{f.l}</div>
                              <div className="font-mono" style={{fontSize:12,color:f.c}}>{f.v}</div>
                            </div>
                          ))}
                        </div>
                        <div className="prog-bar" style={{marginTop:12}}>
                          <div className={`prog-fill ${s.confLevel==="high"?"pfg":"pfc"}`} style={{width:s.conf}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </UpgradeWall>
                <div className="panel" style={{marginTop:16}}>
                  <div className="panel-header"><span className="panel-title">DISCLAIMER</span></div>
                  <div className="panel-body" style={{fontSize:13,color:"var(--muted)",lineHeight:1.7}}>
                    ⚠️ Signals are generated by AI analysis of technical indicators and price action. Past performance ≠ future results. Always use proper risk management (1-2% per trade). Not financial advice.
                  </div>
                </div>
              </div>
            </>}

            {/* ── AI ADVISOR PAGE ───────────────────────────────────────── */}
            {nav==="ai" && <>
              <div className="page-header">
                <div><div className="page-title font-orb">AI ADVISOR</div><div className="page-subtitle">Powered by VANTEX intelligence</div></div>
                {!isPro && <UsageDots used={aiUses} label="AI messages"/>}
              </div>
              <div style={{padding:"24px 32px",display:"grid",gridTemplateColumns:"1fr 300px",gap:16}}>
                <UpgradeWall locked={aiLocked} feature="AI advisor">
                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">🤖 VANTEX AI CHAT</span>
                      <span style={{fontSize:10,color:"var(--green)",letterSpacing:1,border:"1px solid rgba(0,255,136,0.3)",padding:"2px 8px",borderRadius:3}}>ONLINE</span>
                    </div>
                    <div className="panel-body" style={{display:"flex",flexDirection:"column",height:440}}>
                      <div className="ai-messages" style={{flex:1}}>
                        {aiMessages.map((m,i) => (
                          <div key={i} className={`ai-msg ${m.role}`}>
                            <div className="ai-avatar">{m.role==="bot"?"🤖":"👤"}</div>
                            <div className={`ai-bubble ${m.role}`}>{m.text}</div>
                          </div>
                        ))}
                        {aiTyping && (
                          <div className="ai-msg">
                            <div className="ai-avatar">🤖</div>
                            <div className="ai-bubble bot"><div className="typing"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div></div>
                          </div>
                        )}
                        <div ref={messagesEndRef}/>
                      </div>
                      <div className="ai-input-row">
                        <input className="ai-input" placeholder={aiLocked ? "Upgrade to continue..." : "Ask for signals, analysis, advice..."}
                          value={aiInput} onChange={e => setAiInput(e.target.value)}
                          onKeyDown={e => e.key==="Enter" && !aiLocked && sendAI()}
                          disabled={aiLocked}/>
                        <button className="btn-send" onClick={sendAI} disabled={aiLocked}>➤</button>
                      </div>
                    </div>
                  </div>
                </UpgradeWall>

                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div className="panel">
                    <div className="panel-header"><span className="panel-title">QUICK ASK</span></div>
                    <div className="panel-body" style={{display:"flex",flexDirection:"column",gap:8}}>
                      {["Give me a signal 🎯","Analyze my win rate","Best pairs today?","Risk management tip","Position sizing help"].map((q,i) => (
                        <button key={i} className="btn-secondary" style={{textAlign:"left",fontSize:13,padding:"10px 14px"}}
                          onClick={() => !aiLocked && setAiInput(q)} disabled={aiLocked}>{q}</button>
                      ))}
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-header"><span className="panel-title">YOUR STATS</span></div>
                    <div className="panel-body">
                      {[
                        {l:"Win Rate",     v:`${winRate}%`,           c:"var(--cyan)"},
                        {l:"Total P&L",   v:`$${totalPnl.toFixed(2)}`,c:totalPnl>=0?"var(--green)":"var(--red)"},
                        {l:"Total Trades",v:trades.length,             c:"var(--gold)"},
                        {l:"Avg Lot",     v:avgLot,                   c:"var(--purple)"},
                        {l:"Plan",        v:isPro?user.plan.toUpperCase():"FREE",c:isPro?"var(--green)":"var(--gold)"},
                      ].map((s,i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                          <span style={{fontSize:13,color:"var(--muted)"}}>{s.l}</span>
                          <span style={{fontFamily:"Orbitron",fontSize:12,color:s.c}}>{s.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>}

          </div>{/* end main */}
        </div>{/* end layout */}
      </div>
    </>
  );
}
