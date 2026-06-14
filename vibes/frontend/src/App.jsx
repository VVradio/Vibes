import { useState, useEffect, useRef } from "react";
import { api, setToken, clearToken, spotifyPresaveUrl } from "./api.js";

// ── Constants ────────────────────────────────────────────────────────────────
const AURA_FREE = [
  { name: "Sunset Fire", from: "#FF8C42", to: "#E67E22" },
  { name: "Ocean Drift", from: "#00A8E8", to: "#0066CC" },
  { name: "Deep Night",  from: "#0F1419", to: "#1A3A5C" },
];
const AURA_PRO = [
  { name: "Dawn Break",  from: "#FF8C42", to: "#00A8E8" },
  { name: "Blue Hour",   from: "#00A8E8", to: "#1E3A8A" },
  { name: "Ember Sky",   from: "#FFA500", to: "#0066CC" },
  { name: "Golden Wave", from: "#FFD166", to: "#FF8C42" },
  { name: "Arctic",      from: "#E0F7FA", to: "#0066CC" },
  { name: "Inferno",     from: "#FF4500", to: "#FF8C42" },
];
const ALL_AURAS = [...AURA_FREE, ...AURA_PRO];

const TIERS = {
  free:  { name:"Free",    price:0, maxLinks:5,    maxPhotos:2,  youtube:false, analytics:false, presave:false, badge:null },
  pro:   { name:"Pro",     price:5, maxLinks:null, maxPhotos:6,  youtube:true,  analytics:true,  presave:true,  badge:"✦ Pro" },
  merch: { name:"Creator", price:9, maxLinks:null, maxPhotos:12, youtube:true,  analytics:true,  presave:true,  badge:"🔥 Creator", merchCut:"2%" },
};

const LINK_ICONS = { music:"🎵",spotify:"🎵",soundcloud:"🎧",youtube:"▶️",
  instagram:"📸",twitter:"🐦",tiktok:"🎬",website:"🌐",
  twitch:"🟣",github:"💻",shop:"🛍️",merch:"👕" };

function detectIcon(l){
  const s=l.toLowerCase();
  for(const k of Object.keys(LINK_ICONS)) if(s.includes(k)) return LINK_ICONS[k];
  return "🔗";
}
function ytId(url){
  if(!url)return null;
  const m=url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&\n?#]+)/);
  return m?m[1]:null;
}

// ── CSV export ────────────────────────────────────────────────────────────────
function csvCell(val){
  const s=String(val??"");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function csvRow(cells){ return cells.map(csvCell).join(","); }

function buildAnalyticsCSV(analytics, username){
  const lines=[];
  lines.push(csvRow(["Vibes Analytics Export"]));
  lines.push(csvRow(["Profile",`@${username}`]));
  lines.push(csvRow(["Exported",new Date().toISOString()]));
  lines.push("");

  lines.push(csvRow(["SUMMARY"]));
  lines.push(csvRow(["Metric","Value"]));
  lines.push(csvRow(["Total Page Views",analytics.totalViews]));
  lines.push(csvRow(["Views Last 7 Days",analytics.views7d]));
  lines.push(csvRow(["Views Prior 7 Days",analytics.viewsPrev7d]));
  lines.push(csvRow(["7-Day Trend (%)",analytics.trendPct]));
  lines.push(csvRow(["Total Link Clicks",analytics.totalClicks]));
  lines.push(csvRow(["Click-Through Rate (%)",analytics.ctr]));
  lines.push("");

  lines.push(csvRow(["PAGE VIEWS — LAST 30 DAYS"]));
  lines.push(csvRow(["Date","Views"]));
  (analytics.viewsByDay||[]).forEach(d=>lines.push(csvRow([d.date,d.views])));
  lines.push("");

  lines.push(csvRow(["TOP LINKS"]));
  lines.push(csvRow(["Label","URL","Clicks"]));
  (analytics.topLinks||[]).forEach(l=>lines.push(csvRow([l.label,l.url,l.clicks])));
  lines.push("");

  lines.push(csvRow(["TOP TRAFFIC SOURCES — LAST 30 DAYS"]));
  lines.push(csvRow(["Source","Views"]));
  (analytics.topSources||[]).forEach(s=>lines.push(csvRow([s.source,s.count])));

  if(analytics.presave){
    lines.push("");
    lines.push(csvRow(["PRESAVE CAMPAIGN"]));
    lines.push(csvRow(["Title",analytics.presave.title||""]));
    lines.push(csvRow(["Active",analytics.presave.active]));
    lines.push(csvRow(["Release Date",analytics.presave.releaseDate||""]));
    lines.push(csvRow(["Total Presaves",analytics.presave.total]));
    lines.push(csvRow(["Spotify Presaves",analytics.presave.spotify]));
    lines.push(csvRow(["Apple Music Presaves",analytics.presave.apple]));
    lines.push(csvRow(["Conversion Rate (%)",analytics.presave.conversionRate]));
    lines.push("");
    lines.push(csvRow(["PRESAVES — LAST 30 DAYS"]));
    lines.push(csvRow(["Date","Presaves"]));
    (analytics.presave.byDay||[]).forEach(d=>lines.push(csvRow([d.date,d.count])));
  }

  return lines.join("\n");
}

function downloadCSV(content, filename){
  const blob=new Blob([content],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#0F1419;color:#F8F9FA}
.app{min-height:100vh}
.nav{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 2rem;
  border-bottom:1px solid #2D3748;position:sticky;top:0;
  background:rgba(15,20,25,0.92);backdrop-filter:blur(12px);z-index:100}
.logo{font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:700;letter-spacing:-0.03em}
.logo span{color:#FF8C42}
.nav-btns{display:flex;gap:.75rem}
.btn{padding:.55rem 1.25rem;border-radius:999px;border:none;cursor:pointer;
  font-family:'Inter',sans-serif;font-weight:500;font-size:.875rem;transition:all .15s}
.btn-ghost{background:transparent;color:#00A8E8;border:1px solid #2D3748}
.btn-ghost:hover{border-color:#00A8E8}
.btn-primary{background:#FF8C42;color:#fff}
.btn-primary:hover{background:#e67a32;transform:translateY(-1px);box-shadow:0 4px 20px rgba(255,140,66,.4)}
.btn-blue{background:#0066CC;color:#fff}
.btn-blue:hover{background:#0055aa;transform:translateY(-1px)}
.btn-lg{padding:.85rem 2rem;font-size:1rem}
.btn-outline{background:transparent;color:#F8F9FA;border:1px solid rgba(255,255,255,.3)}
.btn-outline:hover{background:rgba(255,255,255,.08)}
.btn-sm{padding:.4rem .9rem;font-size:.78rem}
.btn-danger{background:transparent;color:#FF4500;border:1px solid #FF4500}
.btn-danger:hover{background:rgba(255,69,0,.1)}

/* LANDING */
.landing{min-height:100vh;display:flex;flex-direction:column}
.hero{flex:1;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;padding:4rem 2rem;gap:2rem}
.hero-eyebrow{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:#FF8C42}
.hero-title{font-family:'Space Grotesk',sans-serif;font-size:clamp(2.5rem,6vw,5rem);
  font-weight:700;letter-spacing:-.03em;line-height:1.05}
.hero-title em{font-style:normal;background:linear-gradient(135deg,#FF8C42,#00A8E8);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hero-sub{color:#5A6C7D;font-size:1.05rem;max-width:460px;line-height:1.6}
.hero-actions{display:flex;gap:1rem;flex-wrap:wrap;justify-content:center}

/* PRICING */
.pricing-section{padding:5rem 2rem;text-align:center}
.pricing-eyebrow{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:#FF8C42;margin-bottom:.75rem}
.pricing-title{font-family:'Space Grotesk',sans-serif;font-size:2.25rem;font-weight:700;margin-bottom:.5rem}
.pricing-sub{color:#5A6C7D;margin-bottom:3rem}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.25rem;max-width:900px;margin:0 auto}
.pricing-card{background:#1A1F2E;border:1px solid #2D3748;border-radius:20px;padding:2rem;text-align:left;position:relative;transition:transform .15s}
.pricing-card:hover{transform:translateY(-4px)}
.pricing-card.featured{border-color:#FF8C42;box-shadow:0 0 40px rgba(255,140,66,.15)}
.pricing-card.featured-blue{border-color:#00A8E8;box-shadow:0 0 40px rgba(0,168,232,.15)}
.feat-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  background:#FF8C42;color:#fff;font-size:.7rem;font-weight:600;
  padding:.25rem .75rem;border-radius:999px;letter-spacing:.06em;white-space:nowrap}
.tier-name{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:#5A6C7D;margin-bottom:.5rem}
.tier-price{font-family:'Space Grotesk',sans-serif;font-size:2.5rem;font-weight:700;margin-bottom:.25rem}
.tier-price span{font-size:1rem;font-weight:400;color:#5A6C7D}
.tier-desc{font-size:.8rem;color:#5A6C7D;margin-bottom:1.5rem}
.tier-features{list-style:none;display:flex;flex-direction:column;gap:.6rem;margin-bottom:1.75rem}
.tier-features li{font-size:.875rem;display:flex;align-items:center;gap:.5rem;color:#c8d6e0}
.tier-features li.dim{color:#3D4557}
.chk{color:#FF8C42;flex-shrink:0}.chk-b{color:#00A8E8;flex-shrink:0}.crs{color:#3D4557;flex-shrink:0}

/* PROFILE */
.profile-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:2rem 1rem 4rem}
.aura-bg{position:fixed;inset:0;z-index:0}
.profile-content{position:relative;z-index:1;width:100%;max-width:480px;display:flex;flex-direction:column;align-items:center;gap:1.25rem}
.profile-avatar-wrap{position:relative;width:96px;height:96px}
.profile-avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.15);position:relative;z-index:1}
.profile-avatar-ring{position:absolute;inset:-4px;border-radius:50%;animation:spin-ring 6s linear infinite;z-index:0}
@keyframes spin-ring{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.profile-name{font-family:'Space Grotesk',sans-serif;font-size:1.75rem;font-weight:700;text-align:center}
.profile-bio{color:rgba(248,249,250,.6);text-align:center;font-size:.875rem;line-height:1.55;max-width:320px}
.tier-badge-pub{font-size:.7rem;background:rgba(255,140,66,.15);color:#FF8C42;border:1px solid rgba(255,140,66,.3);padding:.2rem .65rem;border-radius:999px}
.profile-links{width:100%;display:flex;flex-direction:column;gap:.75rem}
.link-btn{display:flex;align-items:center;gap:.75rem;width:100%;padding:1rem 1.25rem;border-radius:14px;
  border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);backdrop-filter:blur(12px);
  color:#F8F9FA;text-decoration:none;font-size:.95rem;font-weight:500;transition:all .18s;cursor:pointer}
.link-btn:hover{background:rgba(255,255,255,.12);transform:translateY(-2px);
  box-shadow:0 8px 24px rgba(0,0,0,.3);border-color:rgba(255,140,66,.3)}
.link-icon{font-size:1.25rem;flex-shrink:0}
.link-label{flex:1;text-align:left}
.link-arrow{opacity:.35}
.yt-embed{width:100%;border-radius:14px;overflow:hidden;aspect-ratio:16/9}
.yt-embed iframe{width:100%;height:100%;border:none}
.photos-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;width:100%}
.photo-thumb{aspect-ratio:1;object-fit:cover;border-radius:10px;width:100%;display:block}
.powered{margin-top:1rem;font-size:.68rem;color:rgba(248,249,250,.25);letter-spacing:.08em}
.powered span{color:#FF8C42}

/* PRESAVE CARD */
.presave-card{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);
  border-radius:18px;padding:1.5rem;display:flex;flex-direction:column;align-items:center;
  gap:.85rem;backdrop-filter:blur(12px)}
.presave-cover{width:120px;height:120px;border-radius:12px;object-fit:cover;
  box-shadow:0 8px 30px rgba(0,0,0,.35)}
.presave-eyebrow{font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;
  color:#FF8C42;font-weight:600}
.presave-eyebrow.out{color:#10B981}
.presave-title{font-family:'Space Grotesk',sans-serif;font-size:1.2rem;font-weight:700;text-align:center}
.presave-artist{font-size:.8rem;color:rgba(248,249,250,.6)}
.presave-countdown{display:flex;gap:.6rem}
.cd-unit{display:flex;flex-direction:column;align-items:center;min-width:46px}
.cd-num{font-family:'Space Grotesk',sans-serif;font-size:1.4rem;font-weight:700;
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
  border-radius:8px;padding:.4rem .3rem;width:100%;text-align:center}
.cd-label{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#5A6C7D;margin-top:.3rem}
.presave-buttons{display:flex;flex-direction:column;gap:.6rem;width:100%}
.presave-btn{display:flex;align-items:center;justify-content:center;gap:.5rem;width:100%;
  padding:.85rem 1rem;border-radius:12px;border:none;cursor:pointer;font-weight:600;
  font-size:.9rem;font-family:'Inter',sans-serif;transition:all .15s;text-decoration:none}
.presave-spotify{background:#1DB954;color:#0F1419}
.presave-spotify:hover{background:#1ed760;transform:translateY(-1px)}
.presave-apple{background:linear-gradient(135deg,#FA57C1,#FA233B);color:#fff}
.presave-apple:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(250,35,59,.35)}
.presave-count{font-size:.75rem;color:rgba(248,249,250,.5)}

/* PRESAVE EDITOR */
.presave-toggle{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
.toggle-switch{position:relative;width:44px;height:24px;background:#2D3748;border-radius:999px;
  cursor:pointer;transition:background .15s;border:none;flex-shrink:0}
.toggle-switch.on{background:#FF8C42}
.toggle-switch::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;
  background:#F8F9FA;border-radius:50%;transition:transform .15s}
.toggle-switch.on::after{transform:translateX(20px)}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.presave-note{font-size:.75rem;color:#3D4557;margin-top:.5rem;line-height:1.5}
.presave-note a{color:#00A8E8;text-decoration:underline}
.presave-status{font-size:.78rem;border-radius:10px;padding:.6rem .85rem;margin-bottom:1rem}
.presave-status.success{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:#10B981}
.presave-status.error{background:rgba(255,69,0,.1);border:1px solid rgba(255,69,0,.3);color:#FF4500}

/* AUTH */
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem}
.auth-card{background:#1A1F2E;border:1px solid #2D3748;border-radius:20px;padding:2.5rem;width:100%;max-width:420px}
.auth-title{font-family:'Space Grotesk',sans-serif;font-size:1.75rem;font-weight:700;margin-bottom:.5rem}
.auth-sub{color:#5A6C7D;font-size:.875rem;margin-bottom:2rem}
.field{display:flex;flex-direction:column;gap:.375rem;margin-bottom:1rem}
.field label{font-size:.75rem;color:#00A8E8;font-weight:600;letter-spacing:.06em}
.field input,.field textarea,.field select{background:#0F1419;border:1px solid #2D3748;border-radius:10px;
  padding:.75rem 1rem;color:#F8F9FA;font-family:'Inter',sans-serif;font-size:.9rem;outline:none;transition:border-color .15s;width:100%}
.field input:focus,.field textarea:focus,.field select:focus{border-color:#FF8C42}
.field textarea{resize:vertical;min-height:80px}
.field select option{background:#1A1F2E}
.auth-switch{margin-top:1.25rem;text-align:center;font-size:.8rem;color:#5A6C7D}
.auth-switch button{background:none;border:none;color:#FF8C42;cursor:pointer;font-size:.8rem;text-decoration:underline}
.err{color:#FF4500;font-size:.8rem;margin-top:.25rem}
.info{color:#00A8E8;font-size:.8rem;margin-top:.25rem}

/* DASH */
.dash{display:flex;min-height:100vh}
.sidebar{width:260px;flex-shrink:0;background:#1A1F2E;border-right:1px solid #2D3748;
  padding:1.5rem;display:flex;flex-direction:column;gap:1.5rem}
.sidebar-logo{font-family:'Space Grotesk',sans-serif;font-size:1.2rem;font-weight:700}
.sidebar-logo span{color:#FF8C42}
.sidebar-user{display:flex;align-items:center;gap:.75rem;padding:.75rem;
  background:#0F1419;border-radius:12px;border:1px solid #2D3748}
.sidebar-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover}
.sidebar-username{font-size:.85rem;font-weight:500}
.sidebar-handle{font-size:.72rem;color:#5A6C7D}
.user-tier-pill{font-size:.65rem;background:rgba(255,140,66,.15);color:#FF8C42;
  border:1px solid rgba(255,140,66,.25);padding:.1rem .5rem;border-radius:999px;margin-top:.2rem;display:inline-block}
.sidebar-nav{display:flex;flex-direction:column;gap:.25rem}
.snav-btn{background:none;border:none;color:#5A6C7D;cursor:pointer;padding:.6rem .75rem;border-radius:8px;
  text-align:left;font-family:'Inter',sans-serif;font-size:.875rem;font-weight:500;
  transition:all .12s;display:flex;align-items:center;gap:.6rem;width:100%}
.snav-btn:hover,.snav-btn.active{background:#252B3B;color:#F8F9FA}
.sidebar-footer{margin-top:auto}
.main{flex:1;padding:2rem;overflow-y:auto}
.main-title{font-family:'Space Grotesk',sans-serif;font-size:1.5rem;font-weight:700;margin-bottom:1.5rem}
.editor-grid{display:grid;grid-template-columns:1fr 340px;gap:2rem}
@media(max-width:900px){.editor-grid{grid-template-columns:1fr}.sidebar{display:none}}
.editor-section{background:#1A1F2E;border:1px solid #2D3748;border-radius:16px;padding:1.5rem;margin-bottom:1.25rem}
.section-title{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#00A8E8;margin-bottom:1rem;font-weight:600}
.aura-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}
.aura-swatch{border:2px solid transparent;border-radius:10px;padding:.5rem;cursor:pointer;
  text-align:center;font-size:.68rem;color:rgba(248,249,250,.6);transition:all .15s}
.aura-swatch:hover,.aura-swatch.sel{border-color:#FF8C42;color:#F8F9FA}
.aura-swatch.locked{opacity:.35;cursor:not-allowed}
.aura-preview{height:34px;border-radius:6px;margin-bottom:.3rem}
.links-list{display:flex;flex-direction:column;gap:.5rem}
.link-row{display:flex;align-items:center;gap:.5rem;background:#0F1419;border:1px solid #2D3748;border-radius:10px;padding:.6rem .75rem}
.link-row input{flex:1;background:transparent;border:none;color:#F8F9FA;font-family:'Inter',sans-serif;font-size:.85rem;outline:none;min-width:0}
.link-row input::placeholder{color:#3D4557}
.del-btn{background:none;border:none;color:#3D4557;cursor:pointer;font-size:1rem;flex-shrink:0;transition:color .12s}
.del-btn:hover{color:#FF4500}
.add-btn{background:none;border:1px dashed #2D3748;color:#5A6C7D;cursor:pointer;width:100%;
  padding:.65rem;border-radius:10px;font-family:'Inter',sans-serif;font-size:.85rem;transition:all .12s}
.add-btn:hover{border-color:#FF8C42;color:#FF8C42}
.limit-note{font-size:.72rem;color:#3D4557;margin-top:.5rem}
.photos-upload{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}
.photo-slot{aspect-ratio:1;border-radius:10px;border:2px dashed #2D3748;display:flex;align-items:center;
  justify-content:center;cursor:pointer;font-size:1.25rem;color:#3D4557;overflow:hidden;
  transition:border-color .15s;position:relative}
.photo-slot:hover{border-color:#FF8C42}
.photo-slot img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.photo-input{display:none}
.photo-del{position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;
  color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:.7rem;z-index:2}
.preview-phone{background:#1A1F2E;border:1px solid #2D3748;border-radius:24px;padding:1.25rem 1rem;
  display:flex;flex-direction:column;align-items:center;gap:.75rem;
  position:sticky;top:2rem;max-height:calc(100vh - 4rem);overflow-y:auto}
.preview-label{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#3D4557}
.share-bar{background:#1A1F2E;border:1px solid #2D3748;border-radius:12px;
  padding:.875rem 1.25rem;display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap}
.share-url{flex:1;font-size:.8rem;color:#00A8E8;font-family:monospace;background:#0F1419;
  padding:.45rem .75rem;border-radius:8px;border:1px solid #2D3748;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.copy-btn{background:#252B3B;border:1px solid #2D3748;color:#00A8E8;border-radius:8px;
  padding:.45rem .85rem;cursor:pointer;font-size:.78rem;font-family:'Inter',sans-serif;transition:all .15s;white-space:nowrap}
.copy-btn:hover{background:#2D3748}
.upgrade-banner{background:linear-gradient(135deg,rgba(255,140,66,.1),rgba(0,102,204,.1));
  border:1px solid rgba(255,140,66,.3);border-radius:14px;padding:1.25rem;
  margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.upgrade-text{font-size:.875rem;color:#c8d6e0}
.upgrade-text strong{color:#FF8C42}
.plans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
.plan-card{background:#1A1F2E;border:1px solid #2D3748;border-radius:16px;padding:1.5rem;position:relative}
.plan-card.current{border-color:#FF8C42}
.current-badge{position:absolute;top:-10px;right:16px;background:#FF8C42;color:#fff;font-size:.65rem;padding:.2rem .6rem;border-radius:999px;font-weight:600}
.analytics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem}
.stat-card{background:#1A1F2E;border:1px solid #2D3748;border-radius:14px;padding:1.25rem}
.stat-val{font-family:'Space Grotesk',sans-serif;font-size:2rem;font-weight:700;color:#FF8C42;display:flex;align-items:baseline;gap:.4rem}
.stat-label{font-size:.75rem;color:#5A6C7D;margin-top:.25rem}
.stat-trend{font-size:.75rem;font-weight:600;font-family:'Inter',sans-serif}
.trend-up{color:#10B981}
.trend-down{color:#FF4500}
.trend-flat{color:#5A6C7D}
.chart-wrap{width:100%}
.chart-range{display:flex;justify-content:space-between;font-size:.7rem;color:#3D4557;margin-top:.5rem}
.bar-row{display:flex;align-items:center;gap:.75rem;padding:.6rem 0}
.bar-row+.bar-row{border-top:1px solid #2D3748}
.bar-icon{font-size:1rem;flex-shrink:0;width:1.25rem;text-align:center}
.bar-info{flex:1;min-width:0}
.bar-label{font-size:.85rem;margin-bottom:.35rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{height:6px;border-radius:999px;background:#0F1419;border:1px solid #2D3748;overflow:hidden}
.bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#FF8C42,#00A8E8)}
.bar-count{flex-shrink:0;color:#FF8C42;font-weight:600;font-family:'Space Grotesk',sans-serif;font-size:.85rem;min-width:64px;text-align:right}
.empty-note{font-size:.8rem;color:#3D4557;padding:.5rem 0}
.save-toast{position:fixed;bottom:2rem;right:2rem;background:#0066CC;color:#fff;
  padding:.75rem 1.25rem;border-radius:12px;font-size:.875rem;font-weight:500;z-index:999;
  animation:slide-in .25s ease}
@keyframes slide-in{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
.divider{height:1px;background:#2D3748;margin:.5rem 0}
.loading{display:flex;align-items:center;justify-content:center;min-height:100vh;color:#5A6C7D}
`;

// ── Profile Card ──────────────────────────────────────────────────────────────
// ── Views Chart (lightweight inline SVG, no chart library needed) ────────────
function ViewsChart({ data, valueKey = "views", color = "#FF8C42", unit = "view" }) {
  if (!data || data.length === 0) return <div className="empty-note">No data yet.</div>;

  const W = 700, H = 160, PAD = 8;
  const max = Math.max(1, ...data.map(d => d[valueKey]));
  const n = data.length;
  const barW = (W - PAD * 2) / n;

  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "160px", display: "block" }} preserveAspectRatio="none">
        {/* baseline */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#2D3748" strokeWidth="1" />
        {data.map((d, i) => {
          const val = d[valueKey];
          const barH = (val / max) * (H - PAD * 2 - 4);
          const x = PAD + i * barW;
          const y = H - PAD - barH;
          return (
            <rect key={d.date}
              x={x + Math.max(barW * 0.12, 0.5)}
              y={val === 0 ? y - 1 : y}
              width={Math.max(barW * 0.76, 1)}
              height={val === 0 ? 2 : Math.max(barH, 2)}
              rx="2"
              fill={color}
              opacity={val === 0 ? 0.18 : 0.9}>
              <title>{`${fmtDate(d.date)}: ${val} ${unit}${val === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="chart-range">
        <span>{fmtDate(data[0].date)}</span>
        <span>{fmtDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

// ── Presave card ──────────────────────────────────────────────────────────────
function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  const diff = target ? Math.max(0, new Date(target).getTime() - now) : 0;
  return {
    days:  Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    mins:  Math.floor((diff % 3600000) / 60000),
    secs:  Math.floor((diff % 60000) / 1000),
    isPast: target ? new Date(target).getTime() <= now : false,
  };
}

function PresaveCard({ campaign, username }) {
  const { days, hours, mins, secs, isPast } = useCountdown(campaign?.releaseDate);
  if (!campaign || !campaign.active) return null;
  if (!campaign.spotifyId && !campaign.appleMusicUrl) return null;

  const released = !campaign.releaseDate || isPast;

  function spotifyClick(e) {
    if (released) {
      // Past release — just link straight to the track/album
      return; // <a> href handles it
    }
    e.preventDefault();
    window.location.href = spotifyPresaveUrl(username);
  }

  function appleClick(e) {
    if (!released) api.appleClick(username).catch(() => {});
  }

  return (
    <div className="presave-card">
      {campaign.coverUrl && <img src={campaign.coverUrl} className="presave-cover" alt="" />}
      <div className={`presave-eyebrow${released ? " out" : ""}`}>{released ? "Out now" : "Pre-save"}</div>
      {campaign.title && <div className="presave-title">{campaign.title}</div>}
      {campaign.artistName && <div className="presave-artist">{campaign.artistName}</div>}

      {!released && campaign.releaseDate && (
        <div className="presave-countdown">
          <div className="cd-unit"><div className="cd-num">{days}</div><div className="cd-label">days</div></div>
          <div className="cd-unit"><div className="cd-num">{hours}</div><div className="cd-label">hrs</div></div>
          <div className="cd-unit"><div className="cd-num">{mins}</div><div className="cd-label">min</div></div>
          <div className="cd-unit"><div className="cd-num">{secs}</div><div className="cd-label">sec</div></div>
        </div>
      )}

      <div className="presave-buttons">
        {campaign.spotifyId && (
          <a className="presave-btn presave-spotify"
            href={released ? `https://open.spotify.com/${campaign.spotifyType || "track"}/${campaign.spotifyId}` : "#"}
            target="_blank" rel="noopener noreferrer" onClick={spotifyClick}>
            🎵 {released ? "Listen on Spotify" : "Pre-save on Spotify"}
          </a>
        )}
        {campaign.appleMusicUrl && (
          <a className="presave-btn presave-apple" href={campaign.appleMusicUrl}
            target="_blank" rel="noopener noreferrer" onClick={appleClick}>
            {released ? "Listen on Apple Music" : "Pre-add on Apple Music"}
          </a>
        )}
      </div>

      {campaign.presaveCount > 0 && (
        <div className="presave-count">
          {campaign.presaveCount.toLocaleString()} fan{campaign.presaveCount === 1 ? "" : "s"} already saved this
        </div>
      )}
    </div>
  );
}

function ProfileView({ profile, mini }) {
  const aura = profile.aura || AURA_FREE[0];
  const tierCfg = TIERS[profile.tier] || TIERS.free;
  const vid = ytId(profile.youtubeUrl);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"1rem",width:"100%"}}>
      <div className="profile-avatar-wrap">
        <div className="profile-avatar-ring" style={{background:`conic-gradient(${aura.from},${aura.to},${aura.from})`}} />
        <img src={profile.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${profile.username}&backgroundColor=FF8C42`}
          className="profile-avatar" alt="" />
      </div>
      <div style={{textAlign:"center"}}>
        <div className="profile-name">{profile.displayName || profile.username}</div>
        {tierCfg.badge && <div className="tier-badge-pub">{tierCfg.badge}</div>}
      </div>
      {profile.bio && <div className="profile-bio">{profile.bio}</div>}
      {tierCfg.presave && profile.presave && (
        <PresaveCard campaign={profile.presave} username={profile.username} />
      )}
      <div className="profile-links">
        {(profile.links||[]).filter(l=>l.label).map(link=>(
          <a key={link.id} href={link.url||"#"} className="link-btn"
            onClick={e=>{
              if(!link.url||link.url==="#") e.preventDefault();
              else api.clickLink(link.id).catch(()=>{});
            }} target="_blank" rel="noopener noreferrer">
            <span className="link-icon">{link.icon||"🔗"}</span>
            <span className="link-label">{link.label}</span>
            <span className="link-arrow">→</span>
          </a>
        ))}
      </div>
      {tierCfg.youtube && vid && (
        <div className="yt-embed">
          <iframe src={`https://www.youtube.com/embed/${vid}`}
            allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
            allowFullScreen title="YouTube" />
        </div>
      )}
      {(profile.photos||[]).filter(Boolean).length>0 && (
        <div className="photos-grid">
          {profile.photos.filter(Boolean).map((src,i)=>
            <img key={i} src={src} className="photo-thumb" alt="" />
          )}
        </div>
      )}
      {!mini && <div className="powered">made with <span>vibes✦</span></div>}
    </div>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
const DEMO = {
  username:"solara", displayName:"Solara ✦", bio:"producer · singer · dreamer · LA",
  avatarUrl:"https://api.dicebear.com/7.x/shapes/svg?seed=solara&backgroundColor=FF8C42",
  aura:AURA_FREE[0], tier:"pro",
  presave:{
    active:true,
    title:"Midnight Drive",
    artistName:"Solara",
    coverUrl:"https://picsum.photos/seed/cover1/300/300",
    releaseDate:new Date(Date.now()+1000*60*60*24*6).toISOString(),
    spotifyId:"4uLU6hMCjMI75M1A2tKUQC",
    spotifyType:"track",
    appleMusicUrl:"#",
    presaveCount:482,
  },
  links:[
    {id:1,label:"New Single — 'Midnight Drive'",url:"#",icon:"🎵"},
    {id:2,label:"Spotify",url:"#",icon:"🎵"},
    {id:3,label:"YouTube",url:"#",icon:"▶️"},
    {id:4,label:"Instagram",url:"#",icon:"📸"},
    {id:5,label:"Merch Drop 🔥",url:"#",icon:"👕"},
  ],
  photos:["https://picsum.photos/seed/a1/300/300","https://picsum.photos/seed/a2/300/300","https://picsum.photos/seed/a3/300/300"],
};

const FEAT = {
  free:[
    {t:"Up to 5 links",ok:true},{t:"2 photos",ok:true},{t:"3 aura colors",ok:true},
    {t:"YouTube embed",ok:false},{t:"Presave campaigns",ok:false},{t:"Analytics",ok:false},{t:"Custom domain",ok:false},
  ],
  pro:[
    {t:"Unlimited links",ok:true},{t:"6 photos",ok:true},{t:"9 aura colors",ok:true},
    {t:"YouTube embed",ok:true},{t:"Presave campaigns",ok:true},{t:"Analytics",ok:true},{t:"Custom domain",ok:false},
  ],
  merch:[
    {t:"Unlimited links",ok:true},{t:"12 photos",ok:true},{t:"All aura colors",ok:true},
    {t:"YouTube embed",ok:true},{t:"Presave campaigns",ok:true},{t:"Analytics",ok:true},{t:"Custom domain",ok:true},{t:"Merch store (2% fee)",ok:true},
  ],
};

function PricingCard({tier,featured,featuredBlue,onSignup}){
  const t=TIERS[tier];
  return (
    <div className={`pricing-card${featured?" featured":""}${featuredBlue?" featured-blue":""}`}>
      {featured && <div className="feat-badge">Most Popular</div>}
      {featuredBlue && <div className="feat-badge" style={{background:"#0066CC"}}>For Creators</div>}
      <div className="tier-name">{t.name}</div>
      <div className="tier-price">{t.price===0?"Free":`$${t.price}`}{t.price>0&&<span>/mo</span>}</div>
      <div className="tier-desc">{tier==="free"?"Get started, no card needed.":tier==="pro"?"Unlock everything for your audience.":"Sell merch and grow your brand."}</div>
      <ul className="tier-features">
        {FEAT[tier].map((f,i)=>(
          <li key={i} className={!f.ok?"dim":""}>
            <span className={f.ok?(featuredBlue?"chk-b":"chk"):"crs"}>{f.ok?"✓":"✕"}</span>{f.t}
          </li>
        ))}
      </ul>
      <button className={`btn ${featured?"btn-primary":featuredBlue?"btn-blue":"btn-outline"}`}
        style={{width:"100%",padding:".75rem"}} onClick={onSignup}>
        {t.price===0?"Get started free":`Start ${t.name} — $${t.price}/mo`}
      </button>
    </div>
  );
}

function Landing({onSignup,onLogin}){
  return (
    <div className="landing">
      <nav className="nav">
        <div className="logo">vibes<span>✦</span></div>
        <div className="nav-btns">
          <button className="btn btn-ghost" onClick={onLogin}>Log in</button>
          <button className="btn btn-primary" onClick={onSignup}>Get started free</button>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-eyebrow">Your world. One link.</div>
        <h1 className="hero-title">Everything you are,<br/><em>one beautiful page.</em></h1>
        <p className="hero-sub">Music, photos, YouTube, socials, merch — all in one place. Share it everywhere with a single link.</p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onSignup}>Create your page free</button>
          <button className="btn btn-outline btn-lg" onClick={()=>document.getElementById("pricing")?.scrollIntoView({behavior:"smooth"})}>See pricing ↓</button>
        </div>
      </section>
      <section style={{padding:"0 1rem 3rem",display:"flex",flexDirection:"column",alignItems:"center",gap:"1rem"}}>
        <div style={{fontSize:".7rem",letterSpacing:".14em",textTransform:"uppercase",color:"#5A6C7D"}}>Example profile</div>
        <div style={{position:"relative",width:"100%",maxWidth:380,background:"#1A1F2E",border:"1px solid #2D3748",borderRadius:24,padding:"2rem 1.5rem",display:"flex",flexDirection:"column",alignItems:"center",gap:"1rem"}}>
          <div style={{position:"absolute",inset:"-24px",background:"radial-gradient(ellipse,rgba(255,140,66,.2) 0%,transparent 70%)",borderRadius:"50%",filter:"blur(20px)",zIndex:-1}}/>
          <ProfileView profile={DEMO} mini/>
        </div>
        <button className="btn btn-primary" onClick={onSignup}>Build yours free →</button>
      </section>
      <section className="pricing-section" id="pricing">
        <div className="pricing-eyebrow">Simple pricing</div>
        <h2 className="pricing-title">Start free. Grow when ready.</h2>
        <p className="pricing-sub">No credit card required to get started.</p>
        <div className="pricing-grid">
          <PricingCard tier="free" onSignup={onSignup}/>
          <PricingCard tier="pro" featured onSignup={onSignup}/>
          <PricingCard tier="merch" featuredBlue onSignup={onSignup}/>
        </div>
      </section>
    </div>
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function Auth({mode,onAuth,onSwitch}){
  const [form,setForm]=useState({username:"",password:"",displayName:"",tier:"free"});
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  async function handle(){
    setErr(""); setLoading(true);
    try {
      const data = mode==="signup"
        ? await api.register({username:form.username,password:form.password,displayName:form.displayName,tier:form.tier})
        : await api.login({username:form.username,password:form.password});
      setToken(data.token);
      onAuth(data.user);
    } catch(e){ setErr(e.message); }
    setLoading(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo" style={{marginBottom:"1.5rem"}}>vibes<span style={{color:"#FF8C42"}}>✦</span></div>
        <div className="auth-title">{mode==="signup"?"Create your page":"Welcome back"}</div>
        <div className="auth-sub">{mode==="signup"?"Free forever. Upgrade anytime.":"Log in to edit your profile."}</div>
        {mode==="signup"&&<>
          <div className="field"><label>DISPLAY NAME</label>
            <input placeholder="Your name or artist name" value={form.displayName} onChange={e=>setForm(f=>({...f,displayName:e.target.value}))}/>
          </div>
          <div className="field"><label>PLAN</label>
            <select value={form.tier} onChange={e=>setForm(f=>({...f,tier:e.target.value}))}>
              <option value="free">Free — $0/mo</option>
              <option value="pro">Pro — $5/mo</option>
              <option value="merch">Creator — $9/mo</option>
            </select>
          </div>
        </>}
        <div className="field"><label>USERNAME</label>
          <input placeholder="yourname" value={form.username}
            onChange={e=>setForm(f=>({...f,username:e.target.value}))}
            onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>
        <div className="field"><label>PASSWORD</label>
          <input type="password" placeholder="••••••••" value={form.password}
            onChange={e=>setForm(f=>({...f,password:e.target.value}))}
            onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </div>
        {err&&<div className="err">{err}</div>}
        <button className="btn btn-primary" style={{width:"100%",marginTop:".5rem",padding:".85rem"}}
          onClick={handle} disabled={loading}>
          {loading?"...":(mode==="signup"?"Create account →":"Log in →")}
        </button>
        <div className="auth-switch">
          {mode==="signup"?"Already have an account? ":"No account yet? "}
          <button onClick={onSwitch}>{mode==="signup"?"Log in":"Sign up free"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({user,onLogout}){
  const [profile,setProfile]=useState(null);
  const [links,setLinks]=useState([]);
  const [photos,setPhotos]=useState([]);
  const [analytics,setAnalytics]=useState(null);
  const [presave,setPresave]=useState(null);
  const [presaveSaving,setPresaveSaving]=useState(false);
  const [spotifyUrl,setSpotifyUrl]=useState("");
  const [lookupLoading,setLookupLoading]=useState(false);
  const [lookupErr,setLookupErr]=useState("");
  const [settings,setSettings]=useState(null);
  const [settingsSaving,setSettingsSaving]=useState(false);
  const [tab,setTab]=useState("editor");
  const [copied,setCopied]=useState(false);
  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");
  const photoInputs=useRef([]);

  useEffect(()=>{
    (async()=>{
      try {
        const [prof,lnks,phts]=await Promise.all([
          api.getProfile(user.username),
          api.getLinks(),
          api.getPhotos(),
        ]);
        setProfile(prof);
        setLinks(lnks);
        setPhotos(phts.map(p=>p.url));
        if(user.tier!=="free"){
          api.getAnalytics().then(setAnalytics).catch(()=>{});
          api.getPresave().then(p=>setPresave(p||{
            title:"",artistName:profile?.displayName||user.username,coverUrl:"",
            releaseDate:"",spotifyId:"",spotifyType:"track",appleMusicUrl:"",active:true,
          })).catch(()=>{});
        }
        api.getSettings().then(setSettings).catch(()=>setSettings({email:"",notifyMilestones:true}));
      } catch(e){ setErr(e.message); }
    })();
  },[user]);

  async function saveSettings(){
    setSettingsSaving(true); setErr("");
    try {
      const updated=await api.updateSettings({email:settings.email, notifyMilestones:settings.notifyMilestones});
      setSettings(updated);
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch(e){ setErr(e.message); }
    setSettingsSaving(false);
  }

  async function savePresave(){
    setPresaveSaving(true);
    try {
      const updated=await api.updatePresave({
        title:presave.title,
        artistName:presave.artistName,
        coverUrl:presave.coverUrl,
        releaseDate:presave.releaseDate||null,
        spotifyId:presave.spotifyId,
        spotifyType:presave.spotifyType,
        appleMusicUrl:presave.appleMusicUrl,
        active:presave.active,
      });
      setPresave(updated);
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch(e){ setErr(e.message); }
    setPresaveSaving(false);
  }

  async function lookupSpotify(){
    if(!spotifyUrl.trim()) return;
    setLookupLoading(true); setLookupErr("");
    try {
      const data=await api.spotifyLookup(spotifyUrl.trim());
      setPresave(p=>({
        ...p,
        spotifyId: data.spotifyId,
        spotifyType: data.spotifyType,
        title: p.title || data.title,
        coverUrl: p.coverUrl || data.coverUrl,
      }));
    } catch(e){ setLookupErr(e.message); }
    setLookupLoading(false);
  }

  async function saveAll(){
    setSaving(true); setErr("");
    try {
      await api.updateProfile({
        displayName:profile.displayName,
        bio:profile.bio,
        avatarUrl:profile.avatarUrl,
        youtubeUrl:profile.youtubeUrl,
        aura:profile.aura,
      });
      // Sync links: delete removed, add new, update changed
      const orig=await api.getLinks();
      const origIds=new Set(orig.map(l=>l.id));
      const curIds=new Set(links.filter(l=>l._saved).map(l=>l.id));
      // Delete removed
      for(const ol of orig) if(!links.find(l=>l.id===ol.id)) await api.deleteLink(ol.id).catch(()=>{});
      // Add/update
      const freshLinks=[];
      for(let i=0;i<links.length;i++){
        const l=links[i];
        if(!l.label) continue;
        if(l._new){
          const created=await api.addLink({label:l.label,url:l.url,icon:l.icon,position:i});
          freshLinks.push({...created,_saved:true});
        } else {
          await api.updateLink(l.id,{label:l.label,url:l.url,icon:l.icon,position:i});
          freshLinks.push({...l,_saved:true});
        }
      }
      setLinks(freshLinks);
      setSaved(true); setTimeout(()=>setSaved(false),2000);
    } catch(e){ setErr(e.message); }
    setSaving(false);
  }

  async function handlePhoto(idx,e){
    const file=e.target.files[0]; if(!file) return;
    try {
      const result=await api.uploadPhoto(file);
      const newPhotos=[...photos];
      while(newPhotos.length<=idx) newPhotos.push(null);
      newPhotos[idx]=result.url;
      setPhotos(newPhotos);
    } catch(ex){ setErr("Photo upload failed: "+ex.message); }
  }

  async function deletePhotoAt(idx){
    const url=photos[idx]; if(!url) return;
    const allPhotos=await api.getPhotos();
    const match=allPhotos.find(p=>p.url===url);
    if(match) await api.deletePhoto(match.id).catch(()=>{});
    const np=[...photos]; np[idx]=null; setPhotos(np);
  }

  async function upgradeTier(tier){
    try {
      const data=await api.upgradeTier(tier);
      setToken(data.token);
      window.location.reload();
    } catch(e){ setErr(e.message); }
  }

  function addLink(){
    const tc=TIERS[user.tier]||TIERS.free;
    if(tc.maxLinks&&links.length>=tc.maxLinks) return;
    setLinks(l=>[...l,{id:Date.now(),label:"",url:"",icon:"🔗",_new:true}]);
  }
  function updLink(id,field,val){
    setLinks(ls=>ls.map(l=>{
      if(l.id!==id) return l;
      const u={...l,[field]:val};
      if(field==="label") u.icon=detectIcon(val);
      return u;
    }));
  }
  function removeLink(id){ setLinks(ls=>ls.filter(l=>l.id!==id)); }

  if(!profile) return <div className="loading">{err||"Loading..."}</div>;

  const tc=TIERS[user.tier]||TIERS.free;
  const maxPhotos=tc.maxPhotos;
  const shareUrl=`${window.location.origin}/@${user.username}`;
  const previewProfile={...profile,links,photos:photos.filter(Boolean),tier:user.tier,presave};

  function toLocalDatetimeInput(iso){
    if(!iso) return "";
    const d=new Date(iso);
    const pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <div className="dash">
      <aside className="sidebar">
        <div className="sidebar-logo">vibes<span>✦</span></div>
        <div className="sidebar-user">
          <img src={profile.avatarUrl||`https://api.dicebear.com/7.x/shapes/svg?seed=${user.username}&backgroundColor=FF8C42`}
            className="sidebar-avatar" alt=""/>
          <div>
            <div className="sidebar-username">{profile.displayName||user.username}</div>
            <div className="sidebar-handle">@{user.username}</div>
            <div className="user-tier-pill">{tc.badge||"Free"}</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {[["✏️","editor","Edit page"],["👁","preview","Preview"],["📊","analytics","Analytics"],["💎","plans","Plans"],["⚙️","settings","Settings"]].map(([icon,id,label])=>(
            <button key={id} className={`snav-btn${tab===id?" active":""}`} onClick={()=>setTab(id)}>
              {icon} {label}
              {id==="analytics"&&user.tier==="free"&&<span style={{fontSize:".65rem",color:"#3D4557",marginLeft:"auto"}}>Pro</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="divider"/>
          <button className="snav-btn" onClick={onLogout}>🚪 Log out</button>
        </div>
      </aside>

      <main className="main">
        {tab==="preview"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"1rem"}}>
            <div style={{fontSize:".7rem",color:"#5A6C7D",marginBottom:"1rem",letterSpacing:".1em",textTransform:"uppercase"}}>Your public page</div>
            <div style={{width:"100%",maxWidth:400,background:"#1A1F2E",border:"1px solid #2D3748",borderRadius:28,padding:"2rem 1.5rem",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:`linear-gradient(135deg,${(profile.aura||AURA_FREE[0]).from}18,${(profile.aura||AURA_FREE[0]).to}18)`,zIndex:0}}/>
              <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"1rem"}}>
                <ProfileView profile={previewProfile} mini/>
              </div>
            </div>
            <button className="btn btn-ghost" style={{marginTop:"1.25rem"}} onClick={()=>setTab("editor")}>← Back to editor</button>
          </div>
        )}

        {tab==="analytics"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:".75rem"}}>
              <div className="main-title" style={{marginBottom:0}}>Analytics</div>
              {user.tier!=="free"&&analytics&&(
                <button className="btn btn-ghost btn-sm" onClick={()=>downloadCSV(buildAnalyticsCSV(analytics,user.username), `vibes-analytics-${user.username}-${new Date().toISOString().slice(0,10)}.csv`)}>
                  ⬇ Export CSV
                </button>
              )}
            </div>
            {user.tier==="free"?(
              <div className="upgrade-banner">
                <div className="upgrade-text"><strong>Analytics are available on Pro & Creator plans.</strong><br/>See how many people visit your page and which links get clicked.</div>
                <button className="btn btn-primary btn-sm" onClick={()=>setTab("plans")}>Upgrade →</button>
              </div>
            ):analytics?(
              <>
                <div className="analytics-grid">
                  <div className="stat-card">
                    <div className="stat-val">{analytics.totalViews.toLocaleString()}</div>
                    <div className="stat-label">Total page views</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val">
                      {analytics.views7d.toLocaleString()}
                      {analytics.trendPct !== 0 && (
                        <span className={`stat-trend ${analytics.trendPct>0?"trend-up":"trend-down"}`}>
                          {analytics.trendPct>0?"▲":"▼"} {Math.abs(analytics.trendPct)}%
                        </span>
                      )}
                    </div>
                    <div className="stat-label">Views last 7 days{analytics.viewsPrev7d>0?` (vs ${analytics.viewsPrev7d.toLocaleString()} prior week)`:""}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val">{analytics.totalClicks.toLocaleString()}</div>
                    <div className="stat-label">Total link clicks</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val">{analytics.ctr}%</div>
                    <div className="stat-label">Click-through rate</div>
                  </div>
                </div>

                <div className="editor-section">
                  <div className="section-title">Page Views — Last 30 Days</div>
                  <ViewsChart data={analytics.viewsByDay}/>
                </div>

                <div className="editor-section">
                  <div className="section-title">Top Links</div>
                  {analytics.topLinks.length===0
                    ? <div className="empty-note">Add some links to start tracking clicks.</div>
                    : (() => {
                        const maxClicks = Math.max(1, ...analytics.topLinks.map(l=>parseInt(l.clicks)));
                        return analytics.topLinks.map((l,i)=>(
                          <div key={l.id||i} className="bar-row">
                            <span className="bar-icon">{l.icon}</span>
                            <div className="bar-info">
                              <div className="bar-label">{l.label}</div>
                              <div className="bar-track">
                                <div className="bar-fill" style={{width:`${(parseInt(l.clicks)/maxClicks)*100}%`}}/>
                              </div>
                            </div>
                            <div className="bar-count">{l.clicks} click{l.clicks==="1"?"":"s"}</div>
                          </div>
                        ));
                      })()
                  }
                </div>

                <div className="editor-section">
                  <div className="section-title">Top Traffic Sources (30 days)</div>
                  {!analytics.topSources || analytics.topSources.length===0
                    ? <div className="empty-note">No traffic yet — share your page link!</div>
                    : (() => {
                        const maxCount = Math.max(1, ...analytics.topSources.map(s=>s.count));
                        return analytics.topSources.map((s,i)=>(
                          <div key={i} className="bar-row">
                            <span className="bar-icon">🌐</span>
                            <div className="bar-info">
                              <div className="bar-label">{s.source}</div>
                              <div className="bar-track">
                                <div className="bar-fill" style={{width:`${(s.count/maxCount)*100}%`}}/>
                              </div>
                            </div>
                            <div className="bar-count">{s.count} view{s.count===1?"":"s"}</div>
                          </div>
                        ));
                      })()
                  }
                </div>

                {analytics.presave && (
                  <div className="editor-section">
                    <div className="section-title">
                      Presave Campaign{analytics.presave.title ? `: ${analytics.presave.title}` : ""}
                      {!analytics.presave.active && <span style={{color:"#3D4557",fontWeight:400,marginLeft:".5rem"}}>(inactive)</span>}
                    </div>
                    <div className="analytics-grid" style={{marginBottom:"1.25rem"}}>
                      <div className="stat-card">
                        <div className="stat-val">{analytics.presave.total.toLocaleString()}</div>
                        <div className="stat-label">Total presaves</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-val" style={{color:"#1DB954"}}>{analytics.presave.spotify.toLocaleString()}</div>
                        <div className="stat-label">via Spotify</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-val" style={{color:"#FA233B"}}>{analytics.presave.apple.toLocaleString()}</div>
                        <div className="stat-label">via Apple Music</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-val">{analytics.presave.conversionRate}%</div>
                        <div className="stat-label">of page views convert</div>
                      </div>
                    </div>
                    <div className="section-title">Presaves — Last 30 Days</div>
                    <ViewsChart data={analytics.presave.byDay} valueKey="count" color="#1DB954" unit="presave"/>
                  </div>
                )}
              </>
            ):<div style={{color:"#5A6C7D"}}>Loading analytics...</div>}
          </div>
        )}

        {tab==="plans"&&(
          <div>
            <div className="main-title">Plans & Billing</div>
            <div style={{color:"#5A6C7D",marginBottom:"1.5rem",fontSize:".875rem"}}>
              You're on the <strong style={{color:"#FF8C42"}}>{tc.name}</strong> plan.
            </div>
            <div className="plans-grid">
              {Object.entries(TIERS).map(([key,t])=>(
                <div key={key} className={`plan-card${user.tier===key?" current":""}`}>
                  {user.tier===key&&<div className="current-badge">Current plan</div>}
                  <div className="tier-name">{t.name}</div>
                  <div className="tier-price">{t.price===0?"Free":`$${t.price}`}{t.price>0&&<span style={{fontSize:".9rem",color:"#5A6C7D"}}>/mo</span>}</div>
                  <ul className="tier-features" style={{margin:"1rem 0"}}>
                    <li><span className="chk">✓</span>{t.maxLinks?`${t.maxLinks} links`:"Unlimited links"}</li>
                    <li><span className="chk">✓</span>{t.maxPhotos} photos</li>
                    <li><span className={t.youtube?"chk":"crs"}>{t.youtube?"✓":"✕"}</span>YouTube embed</li>
                    <li><span className={t.analytics?"chk":"crs"}>{t.analytics?"✓":"✕"}</span>Analytics</li>
                    <li><span className={t.customDomain?"chk-b":"crs"}>{t.customDomain?"✓":"✕"}</span>Custom domain</li>
                  </ul>
                  {user.tier!==key&&(
                    <button className={`btn ${key==="pro"?"btn-primary":key==="merch"?"btn-blue":"btn-outline"} btn-sm`}
                      style={{width:"100%"}} onClick={()=>upgradeTier(key)}>
                      {t.price===0?"Downgrade":`Switch to ${t.name}`}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{marginTop:"1.5rem",fontSize:".78rem",color:"#3D4557"}}>
              * Billing handled via Stripe (wire up your Stripe keys in production).
            </div>
          </div>
        )}

        {tab==="settings"&&(
          <div>
            <div className="main-title">Settings</div>
            {!settings ? (
              <div style={{color:"#5A6C7D"}}>Loading...</div>
            ) : (
              <div className="editor-section" style={{maxWidth:480}}>
                <div className="section-title">Notifications</div>
                <div className="field">
                  <label>NOTIFICATION EMAIL</label>
                  <input type="email" value={settings.email||""} placeholder="you@example.com"
                    onChange={e=>setSettings(s=>({...s,email:e.target.value}))}/>
                </div>
                <div className="presave-toggle">
                  <div style={{fontSize:".875rem"}}>
                    Email me at presave milestones
                    <div style={{fontSize:".72rem",color:"#5A6C7D",marginTop:".15rem"}}>10, 25, 50, 100, 250... presaves on your campaigns</div>
                  </div>
                  <button className={`toggle-switch${settings.notifyMilestones?" on":""}`}
                    onClick={()=>setSettings(s=>({...s,notifyMilestones:!s.notifyMilestones}))} aria-label="Toggle milestone emails"/>
                </div>
                <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={settingsSaving}>
                  {settingsSaving?"Saving...":"Save settings"}
                </button>
                <div className="presave-note">
                  Milestone emails are sent for active presave campaigns only, and require the server's SMTP settings to be configured.
                </div>
              </div>
            )}
          </div>
        )}

        {tab==="editor"&&(
          <>
            <div className="main-title">Edit your page</div>
            {user.tier==="free"&&(
              <div className="upgrade-banner">
                <div className="upgrade-text"><strong>Unlock YouTube, more photos & analytics</strong> — upgrade to Pro for $5/mo</div>
                <button className="btn btn-primary btn-sm" onClick={()=>setTab("plans")}>Upgrade →</button>
              </div>
            )}
            {err&&<div className="err" style={{marginBottom:"1rem"}}>{err}</div>}
            <div className="share-bar">
              <div className="share-url">{shareUrl}</div>
              <button className="copy-btn" onClick={()=>{navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>
                {copied?"Copied!":"Copy link"}
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveAll} disabled={saving}>
                {saving?"Saving...":"Save"}
              </button>
            </div>

            <div className="editor-grid">
              <div>
                {/* Profile */}
                <div className="editor-section">
                  <div className="section-title">Profile</div>
                  <div className="field"><label>DISPLAY NAME</label>
                    <input value={profile.displayName||""} onChange={e=>setProfile(p=>({...p,displayName:e.target.value}))} placeholder="Your name or artist name"/>
                  </div>
                  <div className="field"><label>BIO</label>
                    <textarea value={profile.bio||""} onChange={e=>setProfile(p=>({...p,bio:e.target.value}))} placeholder="A short line about you..."/>
                  </div>
                  <div className="field"><label>AVATAR URL</label>
                    <input value={profile.avatarUrl||""} onChange={e=>setProfile(p=>({...p,avatarUrl:e.target.value}))} placeholder="https://..."/>
                  </div>
                </div>

                {/* Aura */}
                <div className="editor-section">
                  <div className="section-title">Aura Color</div>
                  <div className="aura-grid">
                    {AURA_FREE.map(a=>(
                      <div key={a.name} className={`aura-swatch${(profile.aura||AURA_FREE[0]).name===a.name?" sel":""}`}
                        onClick={()=>setProfile(p=>({...p,aura:a}))}>
                        <div className="aura-preview" style={{background:`linear-gradient(135deg,${a.from},${a.to})`}}/>
                        {a.name}
                      </div>
                    ))}
                    {AURA_PRO.map(a=>{
                      const locked=user.tier==="free";
                      return (
                        <div key={a.name} className={`aura-swatch${locked?" locked":""}${!locked&&(profile.aura||{}).name===a.name?" sel":""}`}
                          onClick={()=>!locked&&setProfile(p=>({...p,aura:a}))} title={locked?"Upgrade to Pro":""}> 
                          <div className="aura-preview" style={{background:`linear-gradient(135deg,${a.from},${a.to})`}}/>
                          {a.name}{locked&&" 🔒"}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Links */}
                <div className="editor-section">
                  <div className="section-title">Links ({links.length}{tc.maxLinks?`/${tc.maxLinks}`:""})</div>
                  <div className="links-list">
                    {links.map(link=>(
                      <div key={link.id} className="link-row">
                        <span>{link.icon||"🔗"}</span>
                        <input placeholder="Label (Spotify, New Drop...)" value={link.label} onChange={e=>updLink(link.id,"label",e.target.value)}/>
                        <input placeholder="https://..." value={link.url} style={{maxWidth:140}} onChange={e=>updLink(link.id,"url",e.target.value)}/>
                        <button className="del-btn" onClick={()=>removeLink(link.id)}>✕</button>
                      </div>
                    ))}
                    {(!tc.maxLinks||links.length<tc.maxLinks)
                      ?<button className="add-btn" onClick={addLink}>+ Add link</button>
                      :<div className="limit-note">Limit reached. <button style={{background:"none",border:"none",color:"#FF8C42",cursor:"pointer",fontSize:".72rem"}} onClick={()=>setTab("plans")}>Upgrade →</button></div>
                    }
                  </div>
                </div>

                {/* YouTube */}
                <div className="editor-section">
                  <div className="section-title">YouTube Video {!tc.youtube&&"🔒 Pro"}</div>
                  {tc.youtube?(
                    <div className="field">
                      <label>YOUTUBE URL</label>
                      <input value={profile.youtubeUrl||""} onChange={e=>setProfile(p=>({...p,youtubeUrl:e.target.value}))} placeholder="https://youtube.com/watch?v=..."/>
                      {ytId(profile.youtubeUrl)&&(
                        <div style={{marginTop:".75rem",borderRadius:10,overflow:"hidden",aspectRatio:"16/9"}}>
                          <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId(profile.youtubeUrl)}`} title="Preview" frameBorder="0" allowFullScreen/>
                        </div>
                      )}
                    </div>
                  ):(
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontSize:".875rem",color:"#5A6C7D"}}>Embed a YouTube video on your profile.</div>
                      <button className="btn btn-primary btn-sm" onClick={()=>setTab("plans")}>Upgrade</button>
                    </div>
                  )}
                </div>

                {/* Presave Campaign */}
                <div className="editor-section">
                  <div className="section-title">Presave Campaign {!tc.presave&&"🔒 Pro"}</div>
                  {!tc.presave ? (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontSize:".875rem",color:"#5A6C7D"}}>Run a pre-save campaign for your next release on Spotify & Apple Music.</div>
                      <button className="btn btn-primary btn-sm" onClick={()=>setTab("plans")}>Upgrade</button>
                    </div>
                  ) : !presave ? (
                    <div style={{color:"#5A6C7D",fontSize:".875rem"}}>Loading...</div>
                  ) : (
                    <>
                      <div className="presave-toggle">
                        <div style={{fontSize:".875rem"}}>Show presave card on your page</div>
                        <button className={`toggle-switch${presave.active?" on":""}`}
                          onClick={()=>setPresave(p=>({...p,active:!p.active}))} aria-label="Toggle presave card"/>
                      </div>
                      <div className="field">
                        <label>PASTE SPOTIFY LINK TO AUTO-FILL</label>
                        <div style={{display:"flex",gap:".5rem"}}>
                          <input value={spotifyUrl} onChange={e=>setSpotifyUrl(e.target.value)}
                            onKeyDown={e=>e.key==="Enter"&&lookupSpotify()}
                            placeholder="https://open.spotify.com/track/..." style={{flex:1}}/>
                          <button className="btn btn-blue btn-sm" onClick={lookupSpotify} disabled={lookupLoading}>
                            {lookupLoading?"...":"Fetch"}
                          </button>
                        </div>
                        {lookupErr&&<div className="err">{lookupErr}</div>}
                        <div className="presave-note" style={{marginTop:".4rem"}}>
                          Pulls the track/album ID and cover art automatically. Fills in empty title & cover fields only.
                        </div>
                      </div>
                      <div className="field-row">
                        <div className="field"><label>RELEASE TITLE</label>
                          <input value={presave.title||""} onChange={e=>setPresave(p=>({...p,title:e.target.value}))} placeholder="Midnight Drive"/>
                        </div>
                        <div className="field"><label>ARTIST NAME</label>
                          <input value={presave.artistName||""} onChange={e=>setPresave(p=>({...p,artistName:e.target.value}))} placeholder={profile.displayName||user.username}/>
                        </div>
                      </div>
                      <div className="field"><label>COVER ART URL</label>
                        <input value={presave.coverUrl||""} onChange={e=>setPresave(p=>({...p,coverUrl:e.target.value}))} placeholder="https://..."/>
                      </div>
                      <div className="field"><label>RELEASE DATE & TIME</label>
                        <input type="datetime-local" value={toLocalDatetimeInput(presave.releaseDate)}
                          onChange={e=>setPresave(p=>({...p,releaseDate:e.target.value?new Date(e.target.value).toISOString():""}))}/>
                      </div>
                      <div className="field-row">
                        <div className="field"><label>SPOTIFY TRACK/ALBUM ID</label>
                          <input value={presave.spotifyId||""} onChange={e=>setPresave(p=>({...p,spotifyId:e.target.value}))} placeholder="e.g. 4uLU6hMCjMI75M1A2tKUQC"/>
                        </div>
                        <div className="field"><label>TYPE</label>
                          <select value={presave.spotifyType||"track"} onChange={e=>setPresave(p=>({...p,spotifyType:e.target.value}))}>
                            <option value="track">Track</option>
                            <option value="album">Album</option>
                          </select>
                        </div>
                      </div>
                      <div className="field"><label>APPLE MUSIC URL</label>
                        <input value={presave.appleMusicUrl||""} onChange={e=>setPresave(p=>({...p,appleMusicUrl:e.target.value}))} placeholder="https://music.apple.com/..."/>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={savePresave} disabled={presaveSaving}>
                        {presaveSaving?"Saving...":"Save campaign"}
                      </button>
                      {presave.presaveCount>0 && (
                        <div className="presave-status success" style={{marginTop:"1rem"}}>
                          🎉 {presave.presaveCount.toLocaleString()} fan{presave.presaveCount===1?"":"s"} have pre-saved this release so far.
                        </div>
                      )}
                      <div className="presave-note">
                        Find the Spotify ID in the share link — open.spotify.com/track/<strong>THIS_PART</strong>.
                        Spotify pre-save requires a <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer app</a> configured with your redirect URI (see backend .env).
                        Apple Music doesn't support automatic library pre-adds — fans tap through to the album/track page instead.
                      </div>
                    </>
                  )}
                </div>

                {/* Photos */}
                <div className="editor-section">
                  <div className="section-title">Photos ({photos.filter(Boolean).length}/{maxPhotos})</div>
                  <div className="photos-upload" style={{gridTemplateColumns:`repeat(${Math.min(maxPhotos,3)},1fr)`}}>
                    {Array.from({length:maxPhotos}).map((_,i)=>(
                      <div key={i} className="photo-slot" onClick={()=>photoInputs.current[i]?.click()}>
                        {photos[i]
                          ?<><img src={photos[i]} alt=""/><button className="photo-del" onClick={e=>{e.stopPropagation();deletePhotoAt(i);}}>✕</button></>
                          :"＋"
                        }
                        <input type="file" accept="image/*" className="photo-input"
                          ref={el=>photoInputs.current[i]=el} onChange={e=>handlePhoto(i,e)}/>
                      </div>
                    ))}
                  </div>
                  <div className="limit-note" style={{marginTop:".5rem"}}>Click a slot to upload · {maxPhotos} photos on {tc.name} plan</div>
                </div>
              </div>

              {/* Live preview */}
              <div>
                <div className="preview-phone">
                  <div className="preview-label">Live preview</div>
                  <div style={{width:"100%",borderRadius:16,overflow:"hidden",
                    background:`linear-gradient(160deg,${(profile.aura||AURA_FREE[0]).from}20,${(profile.aura||AURA_FREE[0]).to}20)`,padding:"1.25rem 1rem"}}>
                    <ProfileView profile={previewProfile} mini/>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      {saved&&<div className="save-toast">✓ Saved!</div>}
    </div>
  );
}

// ── Public Profile ────────────────────────────────────────────────────────────
function PublicProfile({username,onBack}){
  const [profile,setProfile]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=>{
    Promise.all([
      api.getProfile(username),
      api.getPublicPresave(username).catch(()=>null),
    ]).then(([prof,presave])=>{
      setProfile({...prof, presave});
    }).catch(e=>setErr(e.message));
  },[username]);

  if(err) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"1rem"}}>
      <div style={{fontSize:"3rem"}}>✦</div>
      <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:"1.25rem"}}>Profile not found</div>
      <button className="btn btn-ghost" onClick={onBack}>← Go home</button>
    </div>
  );
  if(!profile) return <div className="loading">Loading...</div>;

  const aura=profile.aura||AURA_FREE[0];
  const presaveStatus=new URLSearchParams(window.location.search).get("presave");
  const PRESAVE_MSGS={
    success:{cls:"success",text:"✓ Saved! This will land in your library on release day."},
    cancelled:{cls:"error",text:"Pre-save cancelled — you can try again anytime."},
    error:{cls:"error",text:"Something went wrong saving this. Please try again."},
    unavailable:{cls:"error",text:"Spotify pre-save isn't configured for this page yet."},
  };
  return (
    <div className="profile-page">
      <div className="aura-bg" style={{background:`radial-gradient(ellipse at 50% 0%,${aura.from}38 0%,transparent 55%),radial-gradient(ellipse at 50% 100%,${aura.to}28 0%,transparent 55%),#0F1419`}}/>
      <div className="profile-content">
        {presaveStatus&&PRESAVE_MSGS[presaveStatus]&&(
          <div className={`presave-status ${PRESAVE_MSGS[presaveStatus].cls}`} style={{width:"100%"}}>
            {PRESAVE_MSGS[presaveStatus].text}
          </div>
        )}
        <ProfileView profile={profile}/>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App(){
  const [page,setPage]=useState("loading");
  const [authMode,setAuthMode]=useState("signup");
  const [user,setUser]=useState(null);
  const [viewUsername,setViewUsername]=useState(null);

  useEffect(()=>{
    // Handle /@username routes
    const path=window.location.pathname;
    const m=path.match(/^\/@([a-zA-Z0-9_]+)$/);
    if(m){ setViewUsername(m[1]); setPage("public"); return; }

    // Check saved token
    const token=localStorage.getItem("vibes_token");
    if(token){
      api.me().then(data=>{ setUser(data.user); setPage("dash"); })
        .catch(()=>{ clearToken(); setPage("landing"); });
    } else {
      setPage("landing");
    }
  },[]);

  function handleAuth(u){ setUser(u); setPage("dash"); }
  function handleLogout(){ clearToken(); setUser(null); setPage("landing"); }

  if(page==="loading") return <div className="loading">Loading...</div>;

  return (
    <div className="app">
      <style>{css}</style>
      {page==="landing"&&<Landing onSignup={()=>{setAuthMode("signup");setPage("auth");}} onLogin={()=>{setAuthMode("login");setPage("auth");}}/>}
      {page==="auth"&&<Auth mode={authMode} onAuth={handleAuth} onSwitch={()=>setAuthMode(m=>m==="signup"?"login":"signup")}/>}
      {page==="dash"&&user&&<Dashboard user={user} onLogout={handleLogout}/>}
      {page==="public"&&<PublicProfile username={viewUsername} onBack={()=>{window.location.href="/";}}/>}
    </div>
  );
}
