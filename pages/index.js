import { useState, useRef, useEffect } from "react";
import { db, auth, requestNotificationPermission } from "../lib/firebase";
import { ref, onValue, set, push, update, get, remove } from "firebase/database";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  deleteUser,
} from "firebase/auth";

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "movies",      label: "Movies",         emoji: "🎬", color: "#e8c87a", fields: ["Name", "Platform",  "Comments"] },
  { id: "tvseries",    label: "TV Series",       emoji: "📺", color: "#a78be8", fields: ["Name", "Platform",  "Comments"] },
  { id: "music",       label: "Music",           emoji: "🎵", color: "#7ab8e8", fields: ["Name", "Artist",    "Comments"] },
  { id: "books",       label: "Books",           emoji: "📖", color: "#7ae8a0", fields: ["Name", "Author",    "Comments"] },
  { id: "restaurants", label: "Restaurants",     emoji: "🍽️", color: "#e87a7a", fields: ["Name", "Location",  "Comments"] },
  { id: "stay",        label: "Places to Stay",  emoji: "🏨", color: "#e8b07a", fields: ["Name", "Location",  "Comments"] },
  { id: "visit",       label: "Places to Visit", emoji: "🗺️", color: "#7ae8d8", fields: ["Name", "Location",  "Comments"] },
  { id: "other",       label: "Other",           emoji: "✨", color: "#e87ab0", fields: ["Name", "Type",      "Comments"] },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const FILLER = new Set(["the","a","an","our","my","your","their","and","of","for"]);
function nationPillLabel(name) {
  const words = name.replace(/[^\w\s]/g,"").split(/\s+/);
  const w = words.filter(w => !FILLER.has(w.toLowerCase()))[0] || words[0] || name;
  return w.length > 10 ? w.slice(0,9)+"…" : w;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("");
}

// Firebase keys cannot contain . # $ [ ] /
function sanitiseKey(str) {
  return str.replace(/[.#$[\]/]/g, "_");
}

// ─── Deduplication helper ─────────────────────────────────────────────────────
// Groups recs posted to multiple Nations into a single entry with a _nations array.
// Key: poster + timestamp + normalised title — identical across all copies of the same rec.
function deduplicateRecs(recs) {
  const map = new Map();
  for (const rec of recs) {
    const key = `${rec.from}|${rec.ts}|${(rec.field1||"").trim().toLowerCase()}`;
    if (map.has(key)) {
      map.get(key)._nations.push({ nid: rec._nid, nname: rec._nname, fbid: rec._fbid });
    } else {
      map.set(key, { ...rec, _nations: [{ nid: rec._nid, nname: rec._nname, fbid: rec._fbid }] });
    }
  }
  return Array.from(map.values());
}

const PALETTE = ["#c8813a","#5a7ec8","#4caf50","#c83a7e","#7e3ac8","#3ac8c8","#c8a83a","#c84a4a","#4ac8a8","#a84ac8"];
const avatarColor = s => PALETTE[(s?.charCodeAt(0)||65) % PALETTE.length];

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff/60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h/24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
}

function friendlyAuthError(code) {
  switch(code) {
    case "auth/email-already-in-use":    return "An account with this email already exists.";
    case "auth/invalid-email":           return "Please enter a valid email address.";
    case "auth/weak-password":           return "Password should be at least 6 characters.";
    case "auth/user-not-found":          return "No account found with this email.";
    case "auth/wrong-password":          return "Incorrect password. Try again or reset it.";
    case "auth/invalid-credential":      return "Incorrect email or password.";
    case "auth/too-many-requests":       return "Too many attempts. Please try again later.";
    default:                             return "Something went wrong. Please try again.";
  }
}

const S = {
  input:  {background:"#1a1d30",border:"1px solid #272b42",borderRadius:10,padding:"12px 14px",fontSize:14,color:"#f0eee8",outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'Georgia',serif",transition:"border-color 0.2s"},
  btn:    {background:"#e8c547",color:"#0d0f1a",border:"none",borderRadius:12,padding:"14px 24px",fontSize:15,fontWeight:700,cursor:"pointer",width:"100%",fontFamily:"'Georgia',serif"},
  btnSec: {background:"transparent",color:"#666",border:"1px solid #272b42",borderRadius:12,padding:"13px 24px",fontSize:14,cursor:"pointer",width:"100%",fontFamily:"'Georgia',serif"},
};

// ─── Small reusable components ────────────────────────────────────────────────
function NationPill({label,active,onClick}) {
  return <button onClick={onClick} style={{background:active?"#e8c547":"#1a1d30",color:active?"#0d0f1a":"#555",border:"none",borderRadius:8,padding:"4px 10px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.05em",textTransform:"uppercase",transition:"all 0.15s",flexShrink:0}}>{label}</button>;
}
function CatPill({label,active,onClick,color}) {
  return <button onClick={onClick} style={{background:active?color:"#1a1d30",color:active?"#0d0f1a":"#555",border:"none",borderRadius:14,padding:"5px 11px",fontSize:11,fontFamily:"sans-serif",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.15s",flexShrink:0}}>{label}</button>;
}
function SectionHeading({children}) {
  return <div style={{fontSize:11,letterSpacing:"0.18em",textTransform:"uppercase",color:"#555",fontFamily:"sans-serif",fontWeight:700,marginBottom:12}}>{children}</div>;
}
function FullPage({children,onBack}) {
  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif"}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"36px 22px 80px"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",marginBottom:28,padding:0,display:"flex",alignItems:"center",gap:6}}>← Back</button>
        {children}
      </div>
    </div>
  );
}
function ModalSheet({children,onClose}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#13162a",borderRadius:"20px 20px 0 0",padding:"18px 22px 44px",width:"100%",maxWidth:600,border:"1px solid #1a1d30",borderBottom:"none",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>
          <button onClick={onClose} style={{background:"#1a1d30",border:"none",borderRadius:"50%",width:30,height:30,cursor:"pointer",color:"#555",fontSize:13}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Auth Screens ─────────────────────────────────────────────────────────────
function WelcomeScreen({onStart}) {
  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,fontFamily:"'Georgia',serif"}}>
      <div style={{animation:"fadeUp 0.7s ease",textAlign:"center",maxWidth:360}}>
        <div style={{fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#e8c547",marginBottom:16,fontFamily:"sans-serif",fontWeight:700}}>✦ Recommend Nation ✦</div>
        <h1 style={{fontSize:52,fontWeight:700,letterSpacing:"-2.5px",color:"#f0eee8",margin:"0 0 14px",lineHeight:1,fontStyle:"italic"}}>Trust your<br/>people.</h1>
        <p style={{color:"#444",fontSize:15,lineHeight:1.7,margin:"0 0 44px"}}>Movies, TV, music, books, restaurants, places to stay & visit — shared with the people whose taste you trust.</p>
        <button onClick={onStart} style={{...S.btn,width:"auto",padding:"14px 44px",fontSize:16,borderRadius:16}}>Get started</button>
      </div>
    </div>
  );
}

function AuthScreen({onAuth}) {
  const [mode,setMode]       = useState("login"); // login | signup | reset
  const [name,setName]       = useState("");
  const [email,setEmail]     = useState("");
  const [password,setPassword] = useState("");
  const [agreed,setAgreed]   = useState(false);
  const [error,setError]     = useState("");
  const [loading,setLoading] = useState(false);
  const [resetSent,setResetSent] = useState(false);

  async function handleSignup() {
    if (!name.trim())     { setError("Please enter your name."); return; }
    if (!email.trim())    { setError("Please enter your email."); return; }
    if (password.length < 6) { setError("Password should be at least 6 characters."); return; }
    if (!agreed)          { setError("Please agree to the Privacy Policy to continue."); return; }
    setLoading(true); setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, {displayName: sanitiseKey(name.trim())});
      await set(ref(db, `users/${cred.user.uid}`), {name: sanitiseKey(name.trim()), email: email.trim(), nationIds: [], agreedToPrivacyPolicy: true});
      onAuth(cred.user);
    } catch(e) { setError(friendlyAuthError(e.code)); }
    setLoading(false);
  }

  async function handleLogin() {
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      onAuth(cred.user);
    } catch(e) { setError(friendlyAuthError(e.code)); }
    setLoading(false);
  }

  async function handleReset() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch(e) { setError(friendlyAuthError(e.code)); }
    setLoading(false);
  }

  if(mode==="reset") return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,fontFamily:"'Georgia',serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <button onClick={()=>{setMode("login");setError("");setResetSent(false);}} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",marginBottom:28,padding:0}}>← Back to login</button>
        <h2 style={{fontSize:28,fontWeight:700,letterSpacing:"-1px",marginBottom:6,fontStyle:"italic",color:"#f0eee8"}}>Reset password</h2>
        <p style={{color:"#555",fontSize:13,fontFamily:"sans-serif",marginBottom:22}}>We'll send a reset link to your email.</p>
        {resetSent?(
          <div style={{background:"#1a2a1a",border:"1px solid #2a4a2a",borderRadius:10,padding:"14px 16px",fontSize:13,color:"#7ae8a0",fontFamily:"sans-serif"}}>
            ✓ Reset email sent! Check your inbox.
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <input placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} style={S.input} type="email"/>
            {error&&<p style={{color:"#e85454",fontSize:12,fontFamily:"sans-serif",margin:0}}>{error}</p>}
            <button onClick={handleReset} disabled={loading} style={{...S.btn,opacity:loading?0.6:1}}>{loading?"Sending…":"Send reset link →"}</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,fontFamily:"'Georgia',serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#e8c547",marginBottom:24,fontFamily:"sans-serif",fontWeight:700,textAlign:"center"}}>✦ Recommend Nation ✦</div>
        <h2 style={{fontSize:28,fontWeight:700,letterSpacing:"-1px",marginBottom:6,fontStyle:"italic",color:"#f0eee8"}}>
          {mode==="login"?"Welcome back":"Create account"}
        </h2>
        <p style={{color:"#555",fontSize:13,fontFamily:"sans-serif",marginBottom:22}}>
          {mode==="login"?"Sign in to your Nation.":"Join and start sharing recommendations."}
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="signup"&&(
            <input placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} style={S.input}/>
          )}
          <input placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} style={S.input} type="email"
            onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleSignup())}/>
          <input placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={S.input} type="password"
            onKeyDown={e=>e.key==="Enter"&&(mode==="login"?handleLogin():handleSignup())}/>
          {error&&<p style={{color:"#e85454",fontSize:12,fontFamily:"sans-serif",margin:0}}>{error}</p>}
          {mode==="login"&&(
            <button onClick={()=>{setMode("reset");setError("");}} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:12,fontFamily:"sans-serif",padding:0,textAlign:"left",marginTop:-4}}>Forgot password?</button>
          )}
          {mode==="signup"&&(
            <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
              <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}
                style={{marginTop:3,accentColor:"#e8c547",width:16,height:16,flexShrink:0,cursor:"pointer"}}/>
              <span style={{fontSize:12,color:"#555",fontFamily:"sans-serif",lineHeight:1.5}}>
                I agree to the{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer"
                  style={{color:"#e8c547",textDecoration:"underline"}}>Privacy Policy</a>
                {" "}and{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer"
                  style={{color:"#e8c547",textDecoration:"underline"}}>Terms of Service</a>
              </span>
            </label>
          )}
          <button onClick={mode==="login"?handleLogin:handleSignup} disabled={loading}
            style={{...S.btn,opacity:loading?0.6:1,marginTop:4}}>
            {loading?(mode==="login"?"Signing in…":"Creating account…"):(mode==="login"?"Sign in →":"Create account →")}
          </button>
          <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");setAgreed(false);}}
            style={{...S.btnSec,fontSize:13}}>
            {mode==="login"?"Don't have an account? Sign up":"Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Rec Modal ───────────────────────────────────────────────────────────
function EditRecModal({rec,onSubmit,onClose}) {
  const [form,setForm]=useState({category:rec.category,field1:rec.field1||"",field2:rec.field2||"",note:rec.note||""});
  const cat=CAT_MAP[form.category];
  return (
    <div>
      <h2 style={{margin:"0 0 14px",fontSize:22,fontStyle:"italic",letterSpacing:"-0.5px",color:"#f0eee8"}}>Edit rec</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
        {CATEGORIES.map(c=>(
          <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id}))}
            style={{background:form.category===c.id?c.color:"#1a1d30",color:form.category===c.id?"#0d0f1a":"#555",border:"none",borderRadius:10,padding:"8px 4px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
            <span style={{fontSize:18}}>{c.emoji}</span><span style={{lineHeight:1.2,textAlign:"center"}}>{c.label}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input placeholder={`${cat.fields[0]} *`} value={form.field1} onChange={e=>setForm(f=>({...f,field1:e.target.value}))} style={S.input}/>
        <input placeholder={cat.fields[1]} value={form.field2} onChange={e=>setForm(f=>({...f,field2:e.target.value}))} style={S.input}/>
        <textarea placeholder={`${cat.fields[2]} (optional)`} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={3} style={{...S.input,resize:"none",lineHeight:1.6}}/>
        <button onClick={()=>onSubmit(form)} style={{...S.btn,opacity:form.field1.trim()?1:0.4,marginTop:4}}>Save changes →</button>
        <button onClick={onClose} style={S.btnSec}>Cancel</button>
      </div>
    </div>
  );
}

function JoinModal({joinCode,setJoinCode,joinError,onJoin}) {
  return (
    <div>
      <h2 style={{margin:"0 0 6px",fontSize:22,fontStyle:"italic",color:"#f0eee8"}}>Join a Nation</h2>
      <p style={{margin:"0 0 16px",fontSize:13,color:"#555",fontFamily:"sans-serif"}}>Enter the 6-character code shared with you.</p>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input placeholder="Enter code" value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} maxLength={6}
          style={{...S.input,textAlign:"center",letterSpacing:"0.18em",fontSize:22,fontWeight:700}}/>
        {joinError&&<p style={{color:"#e85454",fontSize:12,fontFamily:"sans-serif",margin:0}}>{joinError}</p>}
        <button onClick={onJoin} style={{...S.btn,opacity:joinCode.length>=4?1:0.4}}>Join Nation →</button>
      </div>
    </div>
  );
}

function CreateModal({name,setName,onCreate}) {
  return (
    <div>
      <h2 style={{margin:"0 0 6px",fontSize:22,fontStyle:"italic",color:"#f0eee8"}}>Create a Nation</h2>
      <p style={{margin:"0 0 16px",fontSize:13,color:"#555",fontFamily:"sans-serif"}}>Name your group — you'll get a unique code to share.</p>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input placeholder="e.g. The Smith Family, Work Pals, Book Club…" value={name} onChange={e=>setName(e.target.value)} style={S.input}/>
        <button onClick={onCreate} style={{...S.btn,opacity:name.trim()?1:0.4}}>Create Nation →</button>
      </div>
    </div>
  );
}

function CreatedSuccess({code,name,onDone}) {
  const [copied,setCopied]=useState(false);
  return (
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:40,marginBottom:10}}>🎉</div>
      <h2 style={{margin:"0 0 6px",fontSize:22,fontStyle:"italic",color:"#f0eee8"}}>{name} is live!</h2>
      <p style={{color:"#555",fontSize:13,fontFamily:"sans-serif",marginBottom:20}}>Share this code so friends & family can join.</p>
      <div onClick={()=>{navigator.clipboard?.writeText(code).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);}}
        style={{background:"#1a1d30",border:"2px dashed #e8c547",borderRadius:16,padding:"20px",cursor:"pointer",marginBottom:16}}>
        <div style={{fontSize:32,fontWeight:700,letterSpacing:"0.35em",color:"#e8c547"}}>{code}</div>
        <div style={{fontSize:12,color:"#555",fontFamily:"sans-serif",marginTop:6}}>{copied?"✓ Copied!":"Tap to copy"}</div>
      </div>
      <button onClick={onDone} style={S.btn}>Go to my Nation →</button>
    </div>
  );
}

function AddRecModal({form,setForm,onSubmit,onSubmitReq,myNations,activeNId}) {
  const [mode,setMode] = useState("rec"); // "rec" | "req"
  const cat=CAT_MAP[form.category];
  const [selectedNations,setSelectedNations]=useState(()=>new Set(myNations.map(n=>n.id)));
  const [reqCategory,setReqCategory]=useState("movies");
  const [reqText,setReqText]=useState("");
  const showPicker=!activeNId&&myNations.length>1;

  function toggleNation(id){
    setSelectedNations(prev=>{
      const next=new Set(prev);
      if(next.has(id)&&next.size>1) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmitRec(){
    onSubmit(activeNId?null:[...selectedNations]);
  }

  function handleSubmitReq(){
    if(!reqText.trim()) return;
    onSubmitReq({category:reqCategory, text:reqText, selectedNations:activeNId?null:[...selectedNations]});
    setReqText("");
  }

  const tabStyle = (active) => ({
    flex:1, background:"none", border:"none", cursor:"pointer",
    padding:"8px 0", fontSize:13, fontFamily:"sans-serif", fontWeight:700,
    color: active?"#e8c547":"#444",
    borderBottom: active?"2px solid #e8c547":"2px solid transparent",
    transition:"all 0.15s", marginBottom:-1,
  });

  return (
    <div>
      {/* Mode switcher */}
      <div style={{display:"flex",borderBottom:"1px solid #1a1d30",marginBottom:16}}>
        <button style={{...tabStyle(mode==="rec"),fontSize:16,letterSpacing:"-0.3px",fontFamily:"'Georgia',serif",fontStyle:"italic"}} onClick={()=>setMode("rec")}>✦ Add a rec</button>
        <button style={{...tabStyle(mode==="req"),fontSize:16,letterSpacing:"-0.3px",fontFamily:"'Georgia',serif",fontStyle:"italic"}} onClick={()=>setMode("req")}>❓ Request a rec</button>
      </div>

      {mode==="rec"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
            {CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id}))}
                style={{background:form.category===c.id?c.color:"#1a1d30",color:form.category===c.id?"#0d0f1a":"#555",border:"none",borderRadius:10,padding:"8px 4px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
                <span style={{fontSize:18}}>{c.emoji}</span><span style={{lineHeight:1.2,textAlign:"center"}}>{c.label}</span>
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <input placeholder={`${cat.fields[0]} *`} value={form.field1} onChange={e=>setForm(f=>({...f,field1:e.target.value}))} style={S.input}/>
            <input placeholder={cat.fields[1]} value={form.field2} onChange={e=>setForm(f=>({...f,field2:e.target.value}))} style={S.input}/>
            <textarea placeholder={`${cat.fields[2]} (optional)`} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={3} style={{...S.input,resize:"none",lineHeight:1.6}}/>
            {showPicker&&(
              <div>
                <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:700}}>Post to</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {myNations.map(n=>{
                    const on=selectedNations.has(n.id);
                    return (
                      <button key={n.id} onClick={()=>toggleNation(n.id)}
                        style={{background:on?"#e8c547":"#1a1d30",color:on?"#0d0f1a":"#555",border:`1px solid ${on?"#e8c547":"#272b42"}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:5}}>
                        {on&&<span style={{fontSize:10}}>✓</span>}
                        {nationPillLabel(n.name)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button onClick={handleSubmitRec} style={{...S.btn,opacity:form.field1.trim()?1:0.4,marginTop:4}}>Post Rec →</button>
          </div>
        </div>
      )}

      {mode==="req"&&(
        <div>
          <p style={{fontSize:13,color:"#555",fontFamily:"sans-serif",marginBottom:12}}>Ask your Nation for a recommendation.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
            {CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setReqCategory(c.id)}
                style={{background:reqCategory===c.id?c.color:"#1a1d30",color:reqCategory===c.id?"#0d0f1a":"#555",border:"none",borderRadius:10,padding:"8px 4px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
                <span style={{fontSize:18}}>{c.emoji}</span><span style={{lineHeight:1.2,textAlign:"center"}}>{c.label}</span>
              </button>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <textarea placeholder='e.g. "Good family restaurant in Edinburgh?" or "Thriller series for dark evenings?"'
              value={reqText} onChange={e=>setReqText(e.target.value)}
              rows={7} style={{...S.input,resize:"none",lineHeight:1.6}}/>
            {showPicker&&(
              <div>
                <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:700}}>Post to</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {myNations.map(n=>{
                    const on=selectedNations.has(n.id);
                    return (
                      <button key={n.id} onClick={()=>toggleNation(n.id)}
                        style={{background:on?"#e8c547":"#1a1d30",color:on?"#0d0f1a":"#555",border:`1px solid ${on?"#e8c547":"#272b42"}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:5}}>
                        {on&&<span style={{fontSize:10}}>✓</span>}
                        {nationPillLabel(n.name)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button onClick={handleSubmitReq} style={{...S.btn,opacity:reqText.trim()?1:0.4,marginTop:4}}>Post Req →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddTop5Modal({form,setForm,onSubmit,myNations,activeNId}) {
  const cat=CAT_MAP[form.category];
  const [selectedNations,setSelectedNations]=useState(()=>new Set(myNations.map(n=>n.id)));
  const showPicker=!activeNId&&myNations.length>1;

  function toggleNation(id){
    setSelectedNations(prev=>{
      const next=new Set(prev);
      if(next.has(id)&&next.size>1) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h2 style={{margin:"0 0 6px",fontSize:22,fontStyle:"italic",letterSpacing:"-0.5px",color:"#f0eee8"}}>Your Top 5</h2>
      <p style={{margin:"0 0 12px",fontSize:13,color:"#555",fontFamily:"sans-serif"}}>Pick a category, give it a title (optional), then rank your favourites.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:14}}>
        {CATEGORIES.map(c=>(
          <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id,items:Array(5).fill("")}))}
            style={{background:form.category===c.id?c.color:"#1a1d30",color:form.category===c.id?"#0d0f1a":"#555",border:"none",borderRadius:10,padding:"7px 4px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
            <span style={{fontSize:16}}>{c.emoji}</span><span style={{lineHeight:1.2,textAlign:"center"}}>{c.label}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <input
          placeholder={`Title (optional) — e.g. "Best ${cat.label} of 2026"`}
          value={form.title||""}
          onChange={e=>setForm(f=>({...f,title:e.target.value}))}
          style={{...S.input,padding:"9px 12px",fontSize:13,marginBottom:4}}/>
        {form.items.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16,fontWeight:700,fontStyle:"italic",color:i<3?cat.color:"#2e3450",minWidth:22,textAlign:"right"}}>{i+1}</span>
            <input placeholder={i===0?"Your favourite…":`#${i+1}`} value={item}
              onChange={e=>setForm(f=>{const items=[...f.items];items[i]=e.target.value;return {...f,items};})}
              style={{...S.input,padding:"9px 12px",fontSize:13}}/>
          </div>
        ))}
        {showPicker&&(
          <div style={{marginTop:4}}>
            <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:700}}>Post to</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {myNations.map(n=>{
                const on=selectedNations.has(n.id);
                return (
                  <button key={n.id} onClick={()=>toggleNation(n.id)}
                    style={{background:on?"#e8c547":"#1a1d30",color:on?"#0d0f1a":"#555",border:`1px solid ${on?"#e8c547":"#272b42"}`,borderRadius:20,padding:"5px 12px",fontSize:12,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:5}}>
                    {on&&<span style={{fontSize:10}}>✓</span>}
                    {nationPillLabel(n.name)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={()=>onSubmit(activeNId?null:[...selectedNations])} style={{...S.btn,marginTop:8,opacity:form.items[0].trim()?1:0.4}}>Save my Top 5 →</button>
      </div>
    </div>
  );
}

// ─── Nation Picker Modal ──────────────────────────────────────────────────────
// Shown when a user taps a rec that was posted to multiple Nations.
// Likes and comments are stored per-Nation, so the user must pick which
// Nation's version of the rec they want to open.
function NationPickerModal({nations,onPick,onClose}) {
  return (
    <div>
      <h2 style={{margin:"0 0 6px",fontSize:22,fontStyle:"italic",color:"#f0eee8"}}>Open in which Nation?</h2>
      <p style={{margin:"0 0 18px",fontSize:13,color:"#555",fontFamily:"sans-serif"}}>
        This rec was posted to multiple Nations. Likes and comments are separate in each.
      </p>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {nations.map(n=>(
          <button key={n.nid} onClick={()=>onPick(n)}
            style={{background:"#1a1d30",border:"1px solid #272b42",borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"background 0.15s",fontFamily:"'Georgia',serif",width:"100%"}}
            onMouseEnter={e=>e.currentTarget.style.background="#1e2540"}
            onMouseLeave={e=>e.currentTarget.style.background="#1a1d30"}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#e8c547",flexShrink:0}}/>
              <span style={{fontSize:15,fontWeight:700,color:"#f0eee8"}}>{n.nname}</span>
            </div>
            <span style={{color:"#e8c547",fontSize:14}}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Rec Card ─────────────────────────────────────────────────────────────────
function RecCard({rec,user,onLike,onSave,showNation,onProfileClick,onOpen}) {
  const cat=CAT_MAP[rec.category]||CATEGORIES[0];
  const liked=user&&(rec.likes||{})[user.name];
  const likeCount=Object.keys(rec.likes||{}).length;
  const commentCount=Object.keys(rec.comments||{}).length;
  const av=rec.from?.[0]?.toUpperCase()||"?";
  const isReq=rec.isRequest;
  const isTop5=rec.isTop5;
  const isMultiple=showNation==="__multiple__";

  // Top 5 card — dark card, gold left stripe, badge top right
  if(isTop5){
    return (
      <div onClick={onOpen}
        style={{background:"#13162a",borderRadius:14,padding:"15px 17px",border:"1px solid #1a1d30",position:"relative",overflow:"hidden",cursor:"pointer",transition:"background 0.15s"}}
        onMouseEnter={e=>e.currentTarget.style.background="#1a1f35"}
        onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
        <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:"#e8c547",borderRadius:"14px 0 0 14px"}}/>
        <div style={{paddingLeft:9}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
            <div className="av-tap" onClick={e=>{e.stopPropagation();onProfileClick();}}
              style={{width:24,height:24,borderRadius:"50%",background:avatarColor(av),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>{av}</div>
            <span className="from-tap" onClick={e=>{e.stopPropagation();onProfileClick();}} style={{fontSize:12,color:"#666",fontFamily:"sans-serif"}}>{rec.from}</span>
            {showNation&&(
              isMultiple
                ? <span style={{fontSize:10,color:"#e8c547",background:"#1a2030",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif",fontWeight:700,border:"1px solid #2a3550"}}>Multiple</span>
                : <span style={{fontSize:10,color:"#3a4060",background:"#1a1d30",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif"}}>{showNation}</span>
            )}
            <span style={{marginLeft:"auto",fontSize:11,color:"#e8c547",fontFamily:"sans-serif",fontWeight:700,whiteSpace:"nowrap"}}>🏆 Top 5</span>
          </div>
          <h3 style={{margin:"0 0 2px",fontSize:16,fontWeight:700,letterSpacing:"-0.4px",lineHeight:1.2,color:"#f0eee8"}}>{rec.field1}</h3>
          {rec.field2&&<p style={{margin:"4px 0 0",fontSize:12,color:"#555",fontFamily:"sans-serif"}}>{rec.field2}</p>}
          <div style={{display:"flex",alignItems:"center",gap:14,marginTop:11}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();onLike();}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:0,opacity:liked?1:0.35,transition:"opacity 0.15s"}}>
              <span style={{fontSize:14}}>{liked?"❤️":"🤍"}</span>
              {likeCount>0&&<span style={{fontSize:12,fontFamily:"sans-serif",color:liked?"#e87a7a":"#555",fontWeight:600}}>{likeCount}</span>}
            </button>
            <button onClick={e=>{e.stopPropagation();onSave();}} style={{background:"none",border:"none",cursor:"pointer",padding:0,opacity:rec.saved?1:0.3,fontSize:14,transition:"opacity 0.15s"}}>🔖</button>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,opacity:0.5}}>
              <span style={{fontSize:13}}>💬</span>
              <span style={{fontSize:12,fontFamily:"sans-serif",color:"#666"}}>{commentCount>0?commentCount:"Comment"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Request card — dark card, full amber border, badge top right only
  if(isReq){
    return (
      <div onClick={onOpen}
        style={{background:"#13162a",borderRadius:14,padding:"15px 17px",border:"2px solid #e8c547",position:"relative",overflow:"hidden",cursor:"pointer",transition:"background 0.15s"}}
        onMouseEnter={e=>e.currentTarget.style.background="#1a1f35"}
        onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
        <div style={{paddingLeft:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
            <div className="av-tap" onClick={e=>{e.stopPropagation();onProfileClick();}}
              style={{width:24,height:24,borderRadius:"50%",background:avatarColor(av),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>{av}</div>
            <span className="from-tap" onClick={e=>{e.stopPropagation();onProfileClick();}} style={{fontSize:12,color:"#666",fontFamily:"sans-serif"}}>{rec.from}</span>
            {showNation&&(
              isMultiple
                ? <span style={{fontSize:10,color:"#e8c547",background:"#1a2030",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif",fontWeight:700,border:"1px solid #2a3550"}}>Multiple</span>
                : <span style={{fontSize:10,color:"#3a4060",background:"#1a1d30",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif"}}>{showNation}</span>
            )}
            <span style={{marginLeft:"auto",fontSize:11,color:"#e8c547",fontFamily:"sans-serif",fontWeight:700,whiteSpace:"nowrap"}}>❓ Request</span>
          </div>
          <h3 style={{margin:"0 0 2px",fontSize:16,fontWeight:700,letterSpacing:"-0.4px",lineHeight:1.2,color:"#f0eee8"}}>{rec.field1}</h3>
          <p style={{margin:"6px 0 0",fontSize:12,color:"#555",fontFamily:"sans-serif"}}>{cat.emoji} {cat.label}</p>
          <div style={{display:"flex",alignItems:"center",gap:14,marginTop:11}} onClick={e=>e.stopPropagation()}>
            <button onClick={e=>{e.stopPropagation();onLike();}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:0,opacity:liked?1:0.35,transition:"opacity 0.15s"}}>
              <span style={{fontSize:14}}>{liked?"❤️":"🤍"}</span>
              {likeCount>0&&<span style={{fontSize:12,fontFamily:"sans-serif",color:liked?"#e87a7a":"#555",fontWeight:600}}>{likeCount}</span>}
            </button>
            <button onClick={e=>{e.stopPropagation();onSave();}} style={{background:"none",border:"none",cursor:"pointer",padding:0,opacity:rec.saved?1:0.3,fontSize:14,transition:"opacity 0.15s"}}>🔖</button>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:13}}>💬</span>
              <span style={{fontSize:12,fontFamily:"sans-serif",color:"#e8c547",fontWeight:600}}>{commentCount>0?commentCount:"Respond"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onOpen}
      style={{background:"#13162a",borderRadius:14,padding:"15px 17px",border:"1px solid #1a1d30",position:"relative",overflow:"hidden",cursor:"pointer",transition:"background 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.background="#1a1f35"}
      onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:cat.color,borderRadius:"14px 0 0 14px"}}/>
      <div style={{paddingLeft:9}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
          <div className="av-tap" onClick={e=>{e.stopPropagation();onProfileClick();}}
            style={{width:24,height:24,borderRadius:"50%",background:avatarColor(av),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>{av}</div>
          <span className="from-tap" onClick={e=>{e.stopPropagation();onProfileClick();}} style={{fontSize:12,color:"#666",fontFamily:"sans-serif",transition:"color 0.15s"}}>{rec.from}</span>
          {showNation&&(
            isMultiple
              ? <span style={{fontSize:10,color:"#e8c547",background:"#1a2030",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif",fontWeight:700,border:"1px solid #2a3550"}}>Multiple</span>
              : <span style={{fontSize:10,color:"#3a4060",background:"#1a1d30",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif"}}>{showNation}</span>
          )}
          <span style={{marginLeft:"auto",fontSize:13}}>{cat.emoji}</span>
        </div>
        <h3 style={{margin:"0 0 2px",fontSize:16,fontWeight:700,letterSpacing:"-0.4px",lineHeight:1.2,color:"#f0eee8"}}>{rec.field1}</h3>
        {rec.field2&&<p style={{margin:0,fontSize:12,color:"#555",fontFamily:"sans-serif"}}>{rec.field2}</p>}
        {rec.note&&<p style={{margin:"8px 0 0",fontSize:13,color:"#7a7a9a",lineHeight:1.55,fontStyle:"italic",borderTop:"1px solid #1a1d30",paddingTop:8}}>"{rec.note}"</p>}
        <div style={{display:"flex",alignItems:"center",gap:14,marginTop:11}} onClick={e=>e.stopPropagation()}>
          <button onClick={e=>{e.stopPropagation();onLike();}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:0,opacity:liked?1:0.35,transition:"opacity 0.15s"}}>
            <span style={{fontSize:14}}>{liked?"❤️":"🤍"}</span>
            {likeCount>0&&<span style={{fontSize:12,fontFamily:"sans-serif",color:liked?"#e87a7a":"#555",fontWeight:600}}>{likeCount}</span>}
          </button>
          <button onClick={e=>{e.stopPropagation();onSave();}} style={{background:"none",border:"none",cursor:"pointer",padding:0,opacity:rec.saved?1:0.3,fontSize:14,transition:"opacity 0.15s"}}>🔖</button>
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,opacity:0.5}}>
            <span style={{fontSize:13}}>💬</span>
            <span style={{fontSize:12,fontFamily:"sans-serif",color:"#666"}}>{commentCount>0?commentCount:"Comment"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Rec Detail View ──────────────────────────────────────────────────────────
function RecDetailView({rec,cat,nationName,user,onBack,onLike,onSave,onComment,onEdit,onDelete,onDeleteComment,onEditComment,onProfileClick}) {
  const [commentText,setCommentText]=useState("");
  const [editing,setEditing]=useState(false);
  const [editingCommentId,setEditingCommentId]=useState(null);
  const [editingCommentText,setEditingCommentText]=useState("");
  const [confirmDelete,setConfirmDelete]=useState(false);
  const bottomRef=useRef(null);
  const inputRef=useRef(null);
  const liked=user&&(rec.likes||{})[user.name];
  const likeCount=Object.keys(rec.likes||{}).length;
  const comments=Object.entries(rec.comments||{}).map(([id,c])=>({...c,_cid:id})).sort((a,b)=>a.ts-b.ts);
  const av=rec.from?.[0]?.toUpperCase()||"?";
  const isOwner=user?.name===rec.from;

  function handleSubmit() {
    if (!commentText.trim()) return;
    onComment(commentText);
    setCommentText("");
    setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),50);
  }

  if(editing) {
    return (
      <div style={{minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif",padding:"24px 18px"}}>
        <button onClick={()=>setEditing(false)} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",marginBottom:24,padding:0,display:"flex",alignItems:"center",gap:6}}>← Cancel</button>
        <EditRecModal rec={rec} onClose={()=>setEditing(false)} onSubmit={async(form)=>{await onEdit(form);setEditing(false);}}/>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#0d0f1acc",backdropFilter:"blur(14px)",borderBottom:"1px solid #1a1d30",padding:"14px 18px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#888",cursor:"pointer",fontSize:18,padding:0,lineHeight:1,flexShrink:0}}>←</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{rec.field1}</div>
          <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif"}}>{cat.emoji} {cat.label}{nationName?` · ${nationName}`:""}</div>
        </div>
        {isOwner&&(
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setEditing(true)} style={{background:"#1a1d30",border:"1px solid #272b42",borderRadius:8,padding:"5px 12px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,color:"#e8c547",cursor:"pointer"}}>Edit</button>
            <button onClick={()=>setConfirmDelete(true)} style={{background:"#1a1d30",border:"1px solid #272b42",borderRadius:8,padding:"5px 12px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,color:"#e87a7a",cursor:"pointer"}}>Delete</button>
          </div>
        )}
        {confirmDelete&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:24}}>
            <div style={{background:"#13162a",borderRadius:16,padding:24,maxWidth:320,width:"100%",border:"1px solid #1a1d30"}}>
              <h3 style={{margin:"0 0 8px",fontSize:18,fontWeight:700}}>Delete this rec?</h3>
              <p style={{margin:"0 0 20px",fontSize:13,color:"#666",fontFamily:"sans-serif"}}>This can't be undone.</p>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setConfirmDelete(false)} style={{...S.btnSec,flex:1,padding:"10px"}}>Cancel</button>
                <button onClick={onDelete} style={{flex:1,background:"#e87a7a",color:"#0d0f1a",border:"none",borderRadius:12,padding:"10px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"0 0 120px"}}>
        <div style={{margin:"16px 18px",background:"#13162a",borderRadius:16,padding:"18px 20px",border:"1px solid #1a1d30",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:4,background:cat.color,borderRadius:"16px 0 0 16px"}}/>
          <div style={{paddingLeft:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div className="av-tap" onClick={()=>onProfileClick(rec.from)}
                style={{width:28,height:28,borderRadius:"50%",background:avatarColor(av),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>{av}</div>
              <span onClick={()=>onProfileClick(rec.from)} style={{fontSize:13,color:"#888",fontFamily:"sans-serif",cursor:"pointer"}}
                onMouseEnter={e=>e.target.style.color="#e8c547"} onMouseLeave={e=>e.target.style.color="#888"}>{rec.from}</span>
            </div>
            <h2 style={{margin:"0 0 3px",fontSize:20,fontWeight:700,letterSpacing:"-0.5px",lineHeight:1.2}}>{rec.field1}</h2>
            {rec.field2&&<p style={{margin:"0",fontSize:13,color:"#666",fontFamily:"sans-serif"}}>{rec.field2}</p>}
            {rec.note&&<p style={{margin:"12px 0 0",fontSize:14,color:"#8a8aaa",lineHeight:1.65,fontStyle:"italic",borderTop:"1px solid #1a1d30",paddingTop:12}}>"{rec.note}"</p>}
            <div style={{display:"flex",alignItems:"center",gap:16,marginTop:14,paddingTop:12,borderTop:"1px solid #1a1d30"}}>
              <button onClick={onLike} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:0,opacity:liked?1:0.4,transition:"opacity 0.15s"}}>
                <span style={{fontSize:17}}>{liked?"❤️":"🤍"}</span>
                {likeCount>0&&<span style={{fontSize:13,fontFamily:"sans-serif",color:liked?"#e87a7a":"#666",fontWeight:600}}>{likeCount}</span>}
              </button>
              <button onClick={onSave} style={{background:"none",border:"none",cursor:"pointer",padding:0,opacity:rec.saved?1:0.3,fontSize:17,transition:"opacity 0.15s"}}>🔖</button>
              <button onClick={()=>inputRef.current?.focus()} style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:5,opacity:0.5,marginLeft:"auto"}}
                onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"}>
                <span style={{fontSize:15}}>💬</span>
                <span style={{fontSize:12,fontFamily:"sans-serif",color:"#666"}}>Add comment</span>
              </button>
            </div>
          </div>
        </div>
        <div style={{padding:"0 18px"}}>
          {comments.length>0?(
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,letterSpacing:"0.15em",textTransform:"uppercase",color:"#444",fontFamily:"sans-serif",fontWeight:700,marginBottom:14}}>
                {comments.length} comment{comments.length!==1?"s":""}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                {comments.map((c,i)=>{
                  const isMe=user?.name===c.from;
                  const cav=c.from?.[0]?.toUpperCase()||"?";
                  const isEditingThis=editingCommentId===c._cid;
                  return (
                    <div key={c._cid||i} className="comment-bubble" style={{animationDelay:`${i*40}ms`,display:"flex",gap:10,marginBottom:16,flexDirection:isMe?"row-reverse":"row"}}>
                      <div onClick={()=>onProfileClick(c.from)} className="av-tap"
                        style={{width:30,height:30,borderRadius:"50%",background:avatarColor(cav),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0,marginTop:2}}>{cav}</div>
                      <div style={{maxWidth:"75%"}}>
                        <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginBottom:4,textAlign:isMe?"right":"left",display:"flex",alignItems:"center",gap:8,flexDirection:isMe?"row-reverse":"row"}}>
                          <span onClick={()=>onProfileClick(c.from)} style={{cursor:"pointer"}}
                            onMouseEnter={e=>e.target.style.color="#e8c547"} onMouseLeave={e=>e.target.style.color="#555"}>
                            {isMe?"You":c.from}
                          </span>
                          <span style={{opacity:0.5}}>{timeAgo(c.ts)}{c.edited?" · edited":""}</span>
                          {isMe&&!isEditingThis&&(
                            <span style={{display:"flex",gap:6}}>
                              <button onClick={()=>{setEditingCommentId(c._cid);setEditingCommentText(c.text);}} style={{background:"none",border:"none",cursor:"pointer",color:"#555",fontSize:10,fontFamily:"sans-serif",padding:0}}>Edit</button>
                              <button onClick={()=>onDeleteComment(c._cid)} style={{background:"none",border:"none",cursor:"pointer",color:"#e87a7a",fontSize:10,fontFamily:"sans-serif",padding:0}}>Delete</button>
                            </span>
                          )}
                        </div>
                        {isEditingThis?(
                          <div style={{display:"flex",gap:6}}>
                            <textarea value={editingCommentText} onChange={e=>setEditingCommentText(e.target.value)}
                              style={{...S.input,resize:"none",fontSize:13,padding:"8px 12px",borderRadius:12,flex:1}}
                              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();onEditComment(c._cid,editingCommentText);setEditingCommentId(null);}}}
                              rows={2}/>
                            <div style={{display:"flex",flexDirection:"column",gap:4}}>
                              <button onClick={()=>{onEditComment(c._cid,editingCommentText);setEditingCommentId(null);}} style={{background:"#e8c547",color:"#0d0f1a",border:"none",borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Save</button>
                              <button onClick={()=>setEditingCommentId(null)} style={{background:"#1a1d30",color:"#666",border:"none",borderRadius:8,padding:"6px 10px",fontSize:11,cursor:"pointer"}}>Cancel</button>
                            </div>
                          </div>
                        ):(
                          <div style={{background:isMe?"#1e2a4a":"#1a1d30",borderRadius:isMe?"14px 4px 14px 14px":"4px 14px 14px 14px",padding:"10px 14px",fontSize:14,lineHeight:1.55,color:"#e8e6f0",border:`1px solid ${isMe?"#2a3a5a":"#272b42"}`}}>
                            {c.text}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={bottomRef}/>
            </div>
          ):(
            <div style={{textAlign:"center",padding:"32px 0 16px",color:"#333"}}>
              <div style={{fontSize:28,marginBottom:8}}>💬</div>
              <div style={{fontFamily:"sans-serif",fontSize:13}}>No comments yet — start the conversation.</div>
            </div>
          )}
        </div>
      </div>
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#0d0f1a",borderTop:"1px solid #1a1d30",padding:"12px 18px 24px",zIndex:20}}>
        <div style={{maxWidth:600,margin:"0 auto",display:"flex",gap:10,alignItems:"flex-end"}}>
          {user&&(
            <div style={{width:32,height:32,borderRadius:"50%",background:avatarColor(user.name[0]),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>
              {user.name[0].toUpperCase()}
            </div>
          )}
          <textarea ref={inputRef} placeholder="Add a comment…" value={commentText}
            onChange={e=>setCommentText(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSubmit();}}}
            rows={1} style={{...S.input,resize:"none",lineHeight:1.5,padding:"10px 14px",fontSize:14,flex:1,borderRadius:20,maxHeight:100,overflowY:"auto"}}/>
          <button onClick={handleSubmit} disabled={!commentText.trim()}
            style={{background:commentText.trim()?"#e8c547":"#1a1d30",color:commentText.trim()?"#0d0f1a":"#444",border:"none",borderRadius:"50%",width:38,height:38,cursor:commentText.trim()?"pointer":"default",fontSize:16,flexShrink:0,transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center"}}>↑</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Top 5 Screen ────────────────────────────────────────────────────────
function EditTop5Screen({editingTop5,onCancel,onSave}) {
  const{member,nationId,listId,catId,items,title}=editingTop5;
  const cat=CAT_MAP[catId];
  const paddedItems=[...items,...Array(5).fill("")].slice(0,5);
  const [form,setForm]=useState({category:catId,title:title||"",items:paddedItems});
  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif"}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"36px 22px 80px"}}>
        <button onClick={onCancel} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",marginBottom:28,padding:0,display:"flex",alignItems:"center",gap:6}}>← Cancel</button>
        <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:cat.color,marginBottom:6,fontFamily:"sans-serif",fontWeight:700}}>{cat.emoji} {cat.label}</div>
        <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.8px",margin:"0 0 24px",fontStyle:"italic"}}>Edit your Top 5</h1>
        <AddTop5Modal form={form} setForm={setForm} onSubmit={()=>onSave(nationId,member,listId,form.category,form.title,form.items)} myNations={[]} activeNId={nationId}/>
      </div>
    </div>
  );
}

// ─── Top 5 Tab ────────────────────────────────────────────────────────────────
function Top5Tab({myNations,activeNId,nations,onView,onAdd,onEdit,user,onProfile}) {
  const displayNations=activeNId?[nations[activeNId]]:myNations;

  // Collect all lists across displayed nations, sorted newest first
  const entries=[];
  displayNations.forEach(n=>{
    if(!n?.topFives)return;
    Object.entries(n.topFives).forEach(([member,lists])=>{
      // lists is now { listId: { title, category, items, ts } }
      Object.entries(lists).forEach(([listId,list])=>{
        if(list?.items?.length){
          entries.push({member,nationId:n.id,nationName:n.name,listId,catId:list.category,title:list.title||"",items:list.items,ts:list.ts||0});
        }
      });
    });
  });
  // Sort: grouped by category (in CATEGORIES order), newest first within each group
  const catOrder = CATEGORIES.map(c=>c.id);
  entries.sort((a,b)=>{
    const catDiff = catOrder.indexOf(a.catId) - catOrder.indexOf(b.catId);
    if(catDiff!==0) return catDiff;
    return b.ts - a.ts;
  });
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h2 style={{margin:0,fontSize:20,fontStyle:"italic",letterSpacing:"-0.5px"}}>Top 5 Lists</h2>
        <button onClick={onAdd} style={{background:"#e8c547",color:"#0d0f1a",border:"none",borderRadius:16,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif"}}>+ Add yours</button>
      </div>
      {entries.length===0?(
        <div style={{textAlign:"center",padding:"60px 0",color:"#333"}}>
          <div style={{fontSize:36,marginBottom:12}}>🏆</div>
          <div style={{fontFamily:"sans-serif",fontSize:14,marginBottom:20}}>No Top 5 lists yet.</div>
          <button onClick={onAdd} style={{background:"#e8c547",color:"#0d0f1a",border:"none",borderRadius:12,padding:"11px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Georgia',serif"}}>Create your first list</button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {entries.map((e,i)=>{
            const cat=CAT_MAP[e.catId];
            const displayTitle=e.title||`${cat.label} Top 5`;
            const isOwn=user?.name===e.member;
            return (
              <div key={`${e.nationId}-${e.listId}`} onClick={()=>onView(e.member,e.nationId,e.listId)}
                style={{background:"#13162a",borderRadius:14,padding:"14px 18px",border:"1px solid #1a1d30",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"background 0.15s"}}
                onMouseEnter={ev=>ev.currentTarget.style.background="#1a1d30"}
                onMouseLeave={ev=>ev.currentTarget.style.background="#13162a"}>
                <div style={{width:38,height:38,borderRadius:9,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    <span onClick={ev=>{ev.stopPropagation();onProfile(e.member,e.nationId);}} style={{color:"#e8c547",cursor:"pointer"}}>{e.member}</span>'s {displayTitle}
                  </div>
                  <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginTop:2}}>{e.items[0]}{e.items[1]?`, ${e.items[1]}`:""}{e.items.length>2?` +${e.items.length-2} more`:""}</div>
                  {!activeNId&&<div style={{fontSize:10,color:"#3a4060",fontFamily:"sans-serif",marginTop:2}}>{e.nationName}</div>}
                </div>
                {isOwn?(
                  <button onClick={ev=>{ev.stopPropagation();onEdit({member:e.member,nationId:e.nationId,listId:e.listId,catId:e.catId,title:e.title,items:e.items});}}
                    style={{background:"#1a1d30",border:"1px solid #272b42",borderRadius:8,padding:"4px 10px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,color:"#e8c547",cursor:"pointer",flexShrink:0}}>Edit</button>
                ):(
                  <span style={{color:"#e8c547",fontSize:14}}>→</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Help Tab ────────────────────────────────────────────────────────────────
function HelpTab() {
  const HL = {color:"#e8c547",fontWeight:700};
  const sectionTitle = {fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"#e8c547",fontFamily:"sans-serif",fontWeight:700,marginBottom:16,marginTop:8};
  const itemWrap = {marginBottom:20,paddingLeft:12,borderLeft:"2px solid #1a1d30"};
  const itemTitle = {fontSize:15,fontWeight:700,letterSpacing:"-0.3px",margin:"0 0 5px",color:"#f0eee8"};
  const itemBody = {fontSize:13,lineHeight:1.75,color:"#888",fontFamily:"sans-serif",margin:0};
  const hr = {border:"none",borderTop:"1px solid #1a1d30",margin:"24px 0"};

  const Item = ({title,children}) => (
    <div style={itemWrap}>
      <div style={itemTitle}>{title}</div>
      <div style={itemBody}>{children}</div>
    </div>
  );

  return (
    <div style={{paddingBottom:40}}>
      {/* Welcome */}
      <div style={{background:"#13162a",borderRadius:14,padding:"20px 18px",border:"1px solid #1a1d30",marginBottom:24}}>
        <div style={{fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#e8c547",marginBottom:10,fontFamily:"sans-serif",fontWeight:700}}>✦ Welcome</div>
        <p style={{fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",margin:"0 0 10px"}}>The best recommendations come from people you actually know and trust.</p>
        <p style={{fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",margin:"0 0 10px"}}>Watched something brilliant? Discovered an amazing restaurant? Read a book you can't stop thinking about? Take 30 seconds to share it with the people who matter.</p>
        <p style={{fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",margin:"0 0 10px"}}>Create a Nation for each group in your life — family, friends, colleagues — and start sharing. Keep it simple. No need for links or photos. If someone's curious about your rec, they can find it in seconds online. Your job is just to point them in the right direction.</p>
        <p style={{fontSize:14,lineHeight:1.8,color:"#e8c547",fontFamily:"'Georgia',serif",fontStyle:"italic",margin:0}}>Life's too short for bad movies and mediocre restaurants. Trust your people.</p>
      </div>

      {/* Getting Started */}
      <div style={sectionTitle}>Getting Started</div>
      <Item title="Create a Nation">Tap the <span style={HL}>Nations</span> icon in the bottom bar. Tap <span style={HL}>Create a new Nation</span>, give it a name and tap Create. You'll get a unique 6-character code to share with anyone you want to invite.</Item>
      <Item title="Join a Nation">Tap <span style={HL}>Nations</span> in the bottom bar, then <span style={HL}>Join with a code</span>. Enter the 6-character code and tap Join.</Item>
      <Item title="Invite others">Share your Nation's 6-character code by text, WhatsApp or email. You can find it on the Nations screen or at the top of your Nation's feed.</Item>

      <div style={hr}/>

      {/* Making Recs */}
      <div style={sectionTitle}>Making Recommendations</div>
      <Item title="Post to all of your Nations">Start from the <span style={HL}>All feed</span> — tap <span style={HL}>+ Rec</span> and post as normal. It goes to all your Nations by default.</Item>
      <Item title="Post to a specific Nation only">Navigate to that Nation's feed using the pills at the top, then tap <span style={HL}>+ Rec</span>. It will post only to that Nation.</Item>
      <Item title="Post to some of your Nations">Start from the <span style={HL}>All feed</span>, tap <span style={HL}>+ Rec</span>, then use the Nation toggles at the bottom of the form to deselect any Nations you don't want to post to.</Item>
      <Item title="Edit or delete your own rec">Tap any rec you posted to open it. You'll see <span style={HL}>Edit</span> and <span style={HL}>Delete</span> buttons in the top right corner.</Item>
      <Item title="Add a req (request a recommendation)">Tap <span style={HL}>+ Rec</span> then switch to the <span style={HL}>❓ Add a req</span> tab. Choose a category, describe what you're looking for and post. Your Nation members can reply in the comments.</Item>

      <div style={hr}/>

      {/* Interacting */}
      <div style={sectionTitle}>Interacting with Recommendations</div>
      <Item title="Comment">Tap any rec to open it, type in the comment box at the bottom and tap the arrow. You can edit or delete your own comments.</Item>
      <Item title="Like">Tap the ❤️ on any rec card or inside the rec detail view.</Item>
      <Item title="Save">Tap the 🔖 on any rec. Find saved recs under the <span style={HL}>Saved</span> tab.</Item>

      <div style={hr}/>

      {/* Top 5s */}
      <div style={sectionTitle}>Top 5s</div>
      <Item title="Post a Top 5">Tap the <span style={HL}>Top 5s</span> tab, then tap <span style={HL}>+ Add yours</span>. Choose a category, add an optional title (e.g. "Best Movies of 2026"), then rank up to 5 items. When you save, a card appears in your Nation's feed so everyone knows to look. If you're posting from the <span style={HL}>All feed</span>, you can choose which Nations to post to using the toggles at the bottom of the form — just like a regular rec. You can edit your Top 5 at any time by tapping <span style={HL}>Edit</span> next to your list.</Item>

      <div style={hr}/>

      {/* Filtering */}
      <div style={sectionTitle}>Filtering</div>
      <Item title="Search">Tap the <span style={HL}>🔍</span> magnifying glass in the top right of the feed to search for a specific rec. Type any word — a city, a name, a keyword — and matching recs appear instantly. Search respects whichever Nation you currently have selected. Tap <span style={HL}>✕</span> to close and return to the normal feed.</Item>
      <Item title="Filter by Nation">Tap any Nation pill at the top of the screen. Tap <span style={HL}>All</span> to see everything.</Item>
      <Item title="Filter by category">In the Feed tab, tap any category pill (🎬 Movies, 📺 TV Series etc.).</Item>

      <div style={hr}/>

      {/* Account */}
      <div style={sectionTitle}>Your Account</div>
      <Item title="Leave a Nation">Go to Nations in the bottom bar. Tap <span style={HL}>Leave</span> on any Nation. You can rejoin later with the code.</Item>
      <Item title="Sign out">Tap your <span style={HL}>avatar</span> top right → <span style={HL}>Sign out</span>.</Item>
      <Item title="Delete your account">Tap your <span style={HL}>avatar</span> top right → <span style={HL}>Delete account</span>. Permanently removes all your data.</Item>
      <Item title="Enable push notifications">Tap <span style={HL}>Alerts Off</span> in the tab row at the top of the feed to switch on push notifications. The first time you do this, your browser will ask for permission — tap Allow. After that it toggles instantly. On iPhone, add the app to your home screen first (Safari → Share → Add to Home Screen) before enabling alerts.</Item>
      <Item title="Privacy Policy & Terms">Tap your <span style={HL}>avatar</span> top right → scroll to the links above your recommendations.</Item>
    </div>
  );
}

// ─── Notification Button ─────────────────────────────────────────────────────
// Only shown on profile page now — purely to surface the "blocked" warning if needed.
// The enable/disable toggle lives in the feed tab row.
function NotificationButton({status}) {
  if(typeof window !== "undefined" && !("Notification" in window)) return null;
  const isDenied = status==="denied" || (typeof window !== "undefined" && Notification.permission==="denied");
  if(!isDenied) return null;
  return (
    <div style={{marginBottom:8}}>
      <span style={{fontSize:12,fontFamily:"sans-serif",color:"#e87a7a"}}>🔕 Notifications blocked — please enable in your device settings</span>
    </div>
  );
}

// ─── Delete Account Button ───────────────────────────────────────────────────
function DeleteAccountButton({onDelete}) {
  const [confirming,setConfirming] = useState(false);
  if(!confirming) return (
    <button onClick={()=>setConfirming(true)} style={{background:"transparent",color:"#e87a7a",border:"1px solid #e87a7a",borderRadius:10,padding:"8px 16px",fontSize:12,fontFamily:"sans-serif",cursor:"pointer"}}>
      Delete account
    </button>
  );
  return (
    <div style={{background:"#1a1d30",borderRadius:12,padding:14,border:"1px solid #272b42",width:"100%"}}>
      <p style={{margin:"0 0 10px",fontSize:13,fontFamily:"sans-serif",color:"#f0eee8"}}>
        This will permanently delete your account and all your data. This cannot be undone.
      </p>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>setConfirming(false)} style={{flex:1,background:"transparent",color:"#666",border:"1px solid #272b42",borderRadius:10,padding:"8px",fontSize:12,cursor:"pointer"}}>Cancel</button>
        <button onClick={onDelete} style={{flex:1,background:"#e87a7a",color:"#0d0f1a",border:"none",borderRadius:10,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Yes, delete everything</button>
      </div>
    </div>
  );
}

// ─── Nation Card (proper component so hooks work in list) ────────────────────
function NationCard({n,user,onEnter,onLeave,onViewProfile}) {
  const [expanded,setExpanded] = useState(false);
  const [confirmLeave,setConfirmLeave] = useState(false);
  const members = Object.keys(n.members||{});
  return (
    <div style={{background:"#13162a",borderRadius:14,border:"1px solid #1a1d30",overflow:"hidden"}}>
      <div onClick={onEnter}
        style={{padding:"16px 18px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.15s"}}
        onMouseEnter={e=>e.currentTarget.style.background="#1a1d30"}
        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
        <div>
          <div style={{fontSize:16,fontWeight:700,letterSpacing:"-0.3px"}}>{n.name}</div>
          <div style={{fontSize:11,color:"#444",fontFamily:"sans-serif",marginTop:3}}>
            {members.length} members · <span style={{color:"#e8c547",letterSpacing:"0.1em",fontWeight:700}}>{n.code}</span> · {Object.keys(n.recs||{}).length} recs
          </div>
        </div>
        <span style={{color:"#e8c547"}}>→</span>
      </div>
      <div style={{padding:"0 18px 12px",display:"flex",gap:8,alignItems:"center"}}>
        <button onClick={e=>{e.stopPropagation();setExpanded(!expanded);}}
          style={{background:"#1a1d30",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontFamily:"sans-serif",color:"#666",cursor:"pointer"}}>
          {expanded?"Hide members":"See members"}
        </button>
        <button onClick={e=>{e.stopPropagation();setConfirmLeave(true);}}
          style={{background:"#1a1d30",border:"none",borderRadius:8,padding:"5px 10px",fontSize:11,fontFamily:"sans-serif",color:"#e87a7a",cursor:"pointer"}}>
          Leave
        </button>
      </div>
      {expanded&&(
        <div style={{padding:"0 18px 14px",display:"flex",flexWrap:"wrap",gap:8}}>
          {members.map(m=>(
            <div key={m} onClick={()=>onViewProfile(m)}
              style={{display:"flex",alignItems:"center",gap:6,background:"#0d0f1a",borderRadius:20,padding:"5px 10px",cursor:"pointer"}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:avatarColor(m[0]),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:700,fontFamily:"sans-serif"}}>{m[0]}</div>
              <span style={{fontSize:12,fontFamily:"sans-serif",color:"#aaa"}}>{m}</span>
            </div>
          ))}
        </div>
      )}
      {confirmLeave&&(
        <div style={{padding:"0 18px 16px"}}>
          <div style={{background:"#0d0f1a",borderRadius:10,padding:14,border:"1px solid #272b42"}}>
            <p style={{margin:"0 0 10px",fontSize:13,fontFamily:"sans-serif",color:"#f0eee8"}}>Leave <strong>{n.name}</strong>? You can rejoin with the code.</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmLeave(false)} style={{background:"transparent",color:"#666",border:"1px solid #272b42",borderRadius:10,padding:"8px",fontSize:12,cursor:"pointer",flex:1}}>Cancel</button>
              <button onClick={onLeave} style={{flex:1,background:"#e87a7a",color:"#0d0f1a",border:"none",borderRadius:10,padding:"8px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top 5 Detail View (proper component so hooks work in conditional) ────────
function Top5DetailView({member,nationId,listId,nations,user,onBack,onDelete}) {
  const [confirmDelete,setConfirmDelete] = useState(false);
  const list = nations[nationId]?.topFives?.[member]?.[listId]||{};
  const items = list.items||[];
  const catId = list.category||"movies";
  const cat = CAT_MAP[catId];
  const displayTitle = list.title||`${cat.label} Top 5`;
  const isOwn = user?.name===member;
  return (
    <FullPage onBack={onBack}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:cat.color,fontFamily:"sans-serif",fontWeight:700}}>{cat.emoji} {cat.label}</div>
        {isOwn&&(
          <button onClick={()=>setConfirmDelete(true)} style={{background:"none",border:"none",cursor:"pointer",color:"#e87a7a",fontSize:12,fontFamily:"sans-serif"}}>Delete</button>
        )}
      </div>
      <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-1px",margin:"0 0 4px",fontStyle:"italic"}}>{member}'s {displayTitle}</h1>
      <p style={{color:"#444",fontSize:13,fontFamily:"sans-serif",marginBottom:28}}>{nations[nationId]?.name}</p>
      {confirmDelete&&(
        <div style={{background:"#1a1d30",borderRadius:12,padding:16,marginBottom:20,border:"1px solid #272b42"}}>
          <p style={{margin:"0 0 12px",fontSize:13,fontFamily:"sans-serif",color:"#f0eee8"}}>Delete this Top 5 list? This can't be undone.</p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setConfirmDelete(false)} style={{background:"transparent",color:"#666",border:"1px solid #272b42",borderRadius:10,padding:"8px",fontSize:12,cursor:"pointer",flex:1}}>Cancel</button>
            <button onClick={()=>onDelete(nationId,member,listId)} style={{flex:1,background:"#e87a7a",color:"#0d0f1a",border:"none",borderRadius:10,padding:"8px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Delete</button>
          </div>
        </div>
      )}
      <ol style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:9}}>
        {items.map((item,i)=>(
          <li key={i} style={{display:"flex",alignItems:"center",gap:16,background:"#13162a",borderRadius:12,padding:"14px 18px",border:"1px solid #1a1d30"}}>
            <span style={{fontSize:20,fontWeight:700,color:i<3?cat.color:"#2e3450",minWidth:26,textAlign:"right",fontStyle:"italic"}}>{i+1}</span>
            <span style={{fontSize:15}}>{item}</span>
          </li>
        ))}
      </ol>
    </FullPage>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser,setAuthUser]  = useState(undefined); // undefined = loading, null = not logged in
  const [screen,setScreen]      = useState("welcome");
  const [user,setUser]          = useState(null);
  const [nations,setNations]    = useState({});
  const [myNationIds,setMyNIds] = useState([]);
  const [activeNId,setActiveNId]= useState(null);
  const [activeCat,setActiveCat]= useState("all");
  const [activeTab,setActiveTab]= useState("feed");
  const [modal,setModal]        = useState(null);
  const [joinCode,setJoinCode]          = useState("");
  const [joinError,setJoinError]        = useState("");
  const [newNationName,setNewNationName]= useState("");
  const [createdCode,setCreatedCode]    = useState(null);
  const [recForm,setRecForm]    = useState({category:"movies",field1:"",field2:"",note:""});
  const [top5Form,setTop5Form]  = useState({category:"movies",title:"",items:Array(5).fill("")});
  const [viewingTop5,setViewingTop5]       = useState(null);
  const [viewingProfile,setViewingProfile] = useState(null);
  const [viewingRec,setViewingRec]         = useState(null);
  const [savedRecs,setSavedRecs]           = useState({});
  const [editingTop5,setEditingTop5]       = useState(null);
  const [notifStatus,setNotifStatus]       = useState("idle");
  const [searchOpen,setSearchOpen]         = useState(false);
  const [searchQuery,setSearchQuery]       = useState("");
  const [nationPicker,setNationPicker]     = useState(null);  // { nations:[{nid,nname,fbid}], rec }

  // ── Listen to Firebase Auth state ──
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      if(firebaseUser) {
        setAuthUser(firebaseUser);
        const snap = await get(ref(db, `users/${firebaseUser.uid}`));
        if(snap.exists()) {
          const profile = snap.val();
          const name = profile.name || firebaseUser.displayName || firebaseUser.email.split("@")[0];
          setUser({name, uid: firebaseUser.uid});
          const ids = profile.nationIds ? Object.keys(profile.nationIds) : [];
          setMyNIds(ids);
          const savedSnap = await get(ref(db, `users/${firebaseUser.uid}/savedRecs`));
          if(savedSnap.exists()) setSavedRecs(savedSnap.val()||{});
        } else {
          const rawName = firebaseUser.displayName || firebaseUser.email.split("@")[0];
          const name = sanitiseKey(rawName);
          await set(ref(db, `users/${firebaseUser.uid}`), {
            name, email: firebaseUser.email, nationIds: {}
          });
          setUser({name, uid: firebaseUser.uid});
          setMyNIds([]);
        }
        setScreen("nations");
      } else {
        setAuthUser(null);
        setUser(null);
        setMyNIds([]);
        setScreen("welcome");
      }
    });
    return ()=>unsub();
  },[]);

  // ── Check notification status on load ──
  useEffect(()=>{
    if(!authUser) return;
    get(ref(db, `users/${authUser.uid}/fcmTokens`)).then(snap=>{
      if(snap.exists() && Object.keys(snap.val()||{}).length > 0){
        setNotifStatus("granted");
      }
    });
  },[authUser]);

  // ── Subscribe to nations from Firebase ──
  useEffect(()=>{
    if(!myNationIds.length) return;
    const unsubs=[];
    myNationIds.forEach(id=>{
      const unsub=onValue(ref(db,`nations/${id}`),snap=>{
        if(snap.exists()) setNations(prev=>({...prev,[id]:snap.val()}));
      });
      unsubs.push(unsub);
    });
    return ()=>unsubs.forEach(u=>u());
  },[myNationIds]);

  const myNations    = myNationIds.map(id=>nations[id]).filter(Boolean);
  const activeNation = activeNId ? nations[activeNId] : null;

  // ── Build feed recs, deduplicating when in the All view ──
  const allRecsRaw = activeNId
    ? Object.entries(nations[activeNId]?.recs||{}).map(([id,r])=>({...r,_fbid:id,_nid:activeNId,_nname:nations[activeNId]?.name}))
    : myNationIds.flatMap(nid=>Object.entries(nations[nid]?.recs||{}).map(([id,r])=>({...r,_fbid:id,_nid:nid,_nname:nations[nid]?.name})));

  // Deduplicate only in the All feed — Nation-specific feeds show all recs as-is
  const allRecs = activeNId ? allRecsRaw : deduplicateRecs(allRecsRaw);

  const filteredRecs=[...allRecs].sort((a,b)=>(b.ts||0)-(a.ts||0)).filter(r=>{
    if(activeTab==="saved") return r._nations
      ? r._nations.some(n=>savedRecs[n.fbid])
      : savedRecs[r._fbid];
    if(activeCat==="requests") return r.isRequest;
    if(activeCat!=="all") return r.category===activeCat;
    return true;
  }).filter(r=>{
    if(!searchQuery.trim()) return true;
    const q=searchQuery.trim().toLowerCase();
    return (r.field1||"").toLowerCase().includes(q)
        || (r.field2||"").toLowerCase().includes(q)
        || (r.note||"").toLowerCase().includes(q);
  });

  const liveRec = viewingRec ? (()=>{
    const r=viewingRec.rec;
    const live=nations[r._nid]?.recs?.[r._fbid];
    if(!live) return r;
    return {...live,_fbid:r._fbid,_nid:r._nid,_nname:r._nname};
  })() : null;

  function closeModal(){setModal(null);setJoinCode("");setJoinError("");setCreatedCode(null);}

  async function handleJoin(){
    setJoinError("");
    const code=joinCode.trim().toUpperCase();
    if(!code){setJoinError("Please enter a code.");return;}
    try {
      const snap=await get(ref(db,`nations/${code}`));
      if(snap.exists()){
        if(myNationIds.includes(code)){setJoinError("You're already in this Nation!");return;}
        const userName = sanitiseKey(user?.name || auth.currentUser?.displayName || "Member");
        const uid = authUser?.uid || auth.currentUser?.uid;
        // Add member to nation
        await update(ref(db,`nations/${code}/members`),{[userName]:true});
        // Update user profile with new nation
        if(uid) {
          const existingIds = Object.fromEntries(myNationIds.map(id=>[id,true]));
          await set(ref(db,`users/${uid}`),{
            name: userName,
            email: auth.currentUser?.email || "",
            nationIds: {...existingIds,[code]:true}
          });
        }
        const newIds=[...myNationIds,code];
        setMyNIds(newIds);
        setJoinCode("");
        setJoinError("");
        closeModal();
        setActiveNId(code);
        setScreen("feed");
      }else{
        setJoinError("No Nation found with that code.");
      }
    } catch(e) {
      setJoinError("Something went wrong: " + (e.message||"please try again"));
    }
  }

  async function handleCreateNation(){
    if(!newNationName.trim()||!authUser||!user)return;
    const code=generateCode();
    await set(ref(db,`nations/${code}`),{id:code,name:newNationName.trim(),code,members:{[user.name]:true},recs:{},topFives:{}});
    // Ensure user profile exists before writing nationIds
    await update(ref(db,`users/${authUser.uid}`),{
      name: user.name,
      email: authUser.email,
    });
    await update(ref(db,`users/${authUser.uid}/nationIds`),{[code]:true});
    const newIds=[...myNationIds,code];
    setMyNIds(newIds);
    setCreatedCode(code);setNewNationName("");
  }

  async function handleAddRec(selectedIds){
    if(!recForm.field1.trim())return;
    // selectedIds is null when posting to a specific activeNId, or an array of chosen nation ids
    const targetIds = activeNId ? [activeNId] : (selectedIds || myNationIds);
    const ts = Date.now(); // capture once so all Nation copies share the same timestamp for deduplication
    for(const tid of targetIds){
      await push(ref(db,`nations/${tid}/recs`),{category:recForm.category,field1:recForm.field1,field2:recForm.field2,note:recForm.note,from:user.name,ts,likes:{},comments:{}});
    }
    setRecForm({category:"movies",field1:"",field2:"",note:""});
    closeModal();
  }

  async function handleAddReq({category, text, selectedNations}){
    if(!text.trim()) return;
    const targetIds = activeNId ? [activeNId] : (selectedNations || myNationIds);
    const ts = Date.now(); // capture once so all Nation copies share the same timestamp for deduplication
    for(const tid of targetIds){
      await push(ref(db,`nations/${tid}/recs`),{
        category,
        field1: text.trim(),
        field2: "",
        note: "",
        from: user.name,
        ts,
        likes: {},
        comments: {},
        isRequest: true,
      });
    }
    closeModal();
  }

  async function handleEditRec(rec,form){
    await update(ref(db,`nations/${rec._nid}/recs/${rec._fbid}`),{
      category:form.category,field1:form.field1,field2:form.field2,note:form.note
    });
  }

  async function handleSaveTop5(selectedIds){
    if(!top5Form.items[0].trim()||!user) return;
    const targetIds = activeNId ? [activeNId] : (selectedIds || myNationIds);
    const ts = Date.now();
    const cat = CAT_MAP[top5Form.category];
    const displayTitle = top5Form.title.trim() || `${cat.label} Top 5`;
    const filteredItems = top5Form.items.filter(i=>i.trim());

    for(const tid of targetIds){
      // Save the Top 5 list itself
      const listRef = await push(ref(db,`nations/${tid}/topFives/${user.name}`),{
        title: top5Form.title.trim(),
        category: top5Form.category,
        items: filteredItems,
        ts,
      });
      const listId = listRef.key;

      // Push an announcement card to the feed so the Nation sees it
      await push(ref(db,`nations/${tid}/recs`),{
        isTop5: true,
        listId,
        category: top5Form.category,
        field1: `${user.name}'s ${displayTitle}`,
        field2: filteredItems.slice(0,2).join(", ") + (filteredItems.length>2?` +${filteredItems.length-2} more`:""),
        note: "",
        from: user.name,
        ts,
        likes: {},
        comments: {},
      });
    }

    setTop5Form({category:"movies",title:"",items:Array(5).fill("")});
    closeModal();
  }

  async function handleEditTop5(nationId,member,listId,category,title,items){
    await set(ref(db,`nations/${nationId}/topFives/${member}/${listId}`),{
      title: title.trim(),
      category,
      items: items.filter(i=>i.trim()),
      ts: Date.now(),
    });
    setEditingTop5(null);
  }

  async function toggleLike(rec){
    const likeRef=ref(db,`nations/${rec._nid}/recs/${rec._fbid}/likes/${user.name}`);
    const snap=await get(likeRef);
    if(snap.exists()) await set(likeRef,null);
    else await set(likeRef,true);
  }

  async function toggleSave(rec){
    const saveRef=ref(db,`users/${authUser.uid}/savedRecs/${rec._fbid}`);
    const snap=await get(saveRef);
    if(snap.exists()){
      await set(saveRef,null);
      setSavedRecs(prev=>{const n={...prev};delete n[rec._fbid];return n;});
    } else {
      await set(saveRef,true);
      setSavedRecs(prev=>({...prev,[rec._fbid]:true}));
    }
  }

  async function addComment(rec,text){
    if(!text.trim()||!user)return;
    await push(ref(db,`nations/${rec._nid}/recs/${rec._fbid}/comments`),{from:user.name,text:text.trim(),ts:Date.now()});
  }

  async function handleSignOut(){
    await signOut(auth);
    setNations({});
    setMyNIds([]);
    setActiveNId(null);
    setSavedRecs({});
  }

  async function handleDeleteAccount(){
    if(!authUser||!user) return;
    try {
      // Remove user from all nation member lists
      for(const nid of myNationIds){
        await remove(ref(db,`nations/${nid}/members/${user.name}`));
      }
      // Delete user profile from database
      await remove(ref(db,`users/${authUser.uid}`));
      // Delete Firebase auth account
      await deleteUser(authUser);
      // State cleanup
      setNations({});
      setMyNIds([]);
      setActiveNId(null);
      setSavedRecs({});
    } catch(e) {
      alert("Could not delete account. Please sign out and sign back in, then try again.");
    }
  }

  async function handleEnableNotifications(){
    if(!authUser||!user) return;
    setNotifStatus("requesting");
    const granted = await requestNotificationPermission(authUser.uid, user.name);
    setNotifStatus(granted ? "granted" : "denied");
  }

  async function handleDisableNotifications(){
    if(!authUser) return;
    try {
      await remove(ref(db, `users/${authUser.uid}/fcmTokens`));
      setNotifStatus("disabled");
    } catch(e) {
      console.error("Error disabling notifications:", e);
    }
  }

  async function handleLeaveNation(nationId){
    if(!authUser||!user) return;
    // Remove user from nation members
    await remove(ref(db,`nations/${nationId}/members/${user.name}`));
    // Remove nation from user profile
    await remove(ref(db,`users/${authUser.uid}/nationIds/${nationId}`));
    const newIds = myNationIds.filter(id=>id!==nationId);
    setMyNIds(newIds);
    setNations(prev=>{ const n={...prev}; delete n[nationId]; return n; });
    if(activeNId===nationId){ setActiveNId(null); setScreen("feed"); }
  }

  async function handleDeleteRec(rec){
    await remove(ref(db,`nations/${rec._nid}/recs/${rec._fbid}`));
    setViewingRec(null);
  }

  async function handleDeleteTop5(nationId, member, listId){
    await remove(ref(db,`nations/${nationId}/topFives/${member}/${listId}`));
    setEditingTop5(null);
    setViewingTop5(null);
  }

  async function handleDeleteComment(rec, commentId){
    await remove(ref(db,`nations/${rec._nid}/recs/${rec._fbid}/comments/${commentId}`));
  }

  async function handleEditComment(rec, commentId, newText){
    await update(ref(db,`nations/${rec._nid}/recs/${rec._fbid}/comments/${commentId}`),{text:newText,edited:true});
  }

  // ── Edit Top 5 ──
  if(editingTop5) return (
    <EditTop5Screen editingTop5={editingTop5} onCancel={()=>setEditingTop5(null)} onSave={handleEditTop5}/>
  );

  // ── Profile view ──
  if(viewingProfile){
    const{member,nationId}=viewingProfile;
    const sourceNations=nationId?[nations[nationId]].filter(Boolean):myNations;
    const memberRecsRaw=sourceNations.flatMap(n=>Object.entries(n?.recs||{}).filter(([,r])=>r.from===member).map(([fbid,r])=>({...r,_fbid:fbid,_nname:n.name,_nid:n.id})));
    // Deduplicate recs on profile page when viewing across multiple Nations
    const memberRecs = sourceNations.length > 1 ? deduplicateRecs(memberRecsRaw) : memberRecsRaw;
    const memberTop5s=[];
    sourceNations.forEach(n=>{
      const lists=n?.topFives?.[member]||{};
      Object.entries(lists).forEach(([listId,list])=>{
        if(list?.items?.length) memberTop5s.push({listId,catId:list.category||"movies",title:list.title||"",items:list.items,ts:list.ts||0,nationId:n.id,nationName:n.name});
      });
    });
    memberTop5s.sort((a,b)=>b.ts-a.ts);
    const isMe=user?.name===member;
    return (
      <FullPage onBack={()=>setViewingProfile(null)}>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:avatarColor(member[0]),display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>{member[0].toUpperCase()}</div>
          <div>
            <h1 style={{margin:0,fontSize:24,fontWeight:700,letterSpacing:"-0.8px",fontStyle:"italic"}}>{member}{isMe&&<span style={{fontSize:13,color:"#e8c547",fontStyle:"normal",fontWeight:400,fontFamily:"sans-serif"}}> (you)</span>}</h1>
            <div style={{fontSize:12,color:"#555",fontFamily:"sans-serif",marginTop:3}}>{memberRecs.length} recs · {memberTop5s.length} Top 5 lists</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:24}}>
          {sourceNations.filter(n=>n?.members?.[member]).map(n=>(
            <span key={n.id} style={{background:"#1a1d30",borderRadius:8,padding:"4px 10px",fontSize:11,fontFamily:"sans-serif",color:"#666"}}>{n.name}</span>
          ))}
        </div>
        {isMe&&(
          <div style={{marginBottom:24}}>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <button onClick={handleSignOut} style={{...S.btnSec,fontSize:12,width:"auto",padding:"8px 16px"}}>Sign out</button>
              <DeleteAccountButton onDelete={handleDeleteAccount}/>
            </div>
            <NotificationButton status={notifStatus}/>
            <div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap"}}>
              <a href="/privacy" target="_blank" rel="noopener noreferrer"
                style={{fontSize:11,color:"#444",fontFamily:"sans-serif",textDecoration:"underline"}}>Privacy Policy</a>
              <a href="/terms" target="_blank" rel="noopener noreferrer"
                style={{fontSize:11,color:"#444",fontFamily:"sans-serif",textDecoration:"underline"}}>Terms of Service</a>
            </div>
          </div>
        )}
        {memberTop5s.length>0&&(
          <div style={{marginBottom:24}}>
            <SectionHeading>Top 5 Lists</SectionHeading>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {memberTop5s.map((t,i)=>{
                const cat=CAT_MAP[t.catId];
                const displayTitle=t.title||`${cat.label} Top 5`;
                return (
                  <div key={i} onClick={()=>{setViewingProfile(null);setViewingTop5({member,nationId:t.nationId,listId:t.listId});}}
                    style={{background:"#13162a",borderRadius:12,padding:"13px 16px",border:"1px solid #1a1d30",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1a1d30"}
                    onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
                    <div style={{width:36,height:36,borderRadius:9,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayTitle}</div>
                      <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginTop:1}}>{t.items[0]}{t.items[1]?`, ${t.items[1]}`:""}{t.items.length>2?` +${t.items.length-2} more`:""}</div>
                    </div>
                    <span style={{color:"#e8c547",fontSize:14}}>→</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {memberRecs.length>0&&(
          <div>
            <SectionHeading>Recommendations</SectionHeading>
            {CATEGORIES.map(cat=>{
              const catRecs=memberRecs.filter(r=>r.category===cat.id);
              if(!catRecs.length)return null;
              return (
                <div key={cat.id} style={{marginBottom:20}}>
                  <div style={{fontSize:12,fontFamily:"sans-serif",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:cat.color,marginBottom:8}}>{cat.emoji} {cat.label}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {catRecs.map(rec=>(
                      <div key={rec._fbid} onClick={()=>{
                          setViewingProfile(null);
                          if(rec._nations && rec._nations.length > 1) {
                            setNationPicker({nations: rec._nations, rec});
                            setModal("nationPicker");
                          } else {
                            setViewingRec({rec});
                          }
                        }}
                        style={{background:"#13162a",borderRadius:12,padding:"12px 15px",border:"1px solid #1a1d30",position:"relative",overflow:"hidden",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#1e2140"}
                        onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
                        <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:cat.color,borderRadius:"12px 0 0 12px"}}/>
                        <div style={{paddingLeft:8}}>
                          <div style={{fontSize:15,fontWeight:700}}>{rec.field1}</div>
                          {rec.field2&&<div style={{fontSize:12,color:"#555",fontFamily:"sans-serif",marginTop:1}}>{rec.field2}</div>}
                          {rec.note&&<div style={{fontSize:12,color:"#7a7a9a",fontStyle:"italic",marginTop:7}}>"{rec.note}"</div>}
                          {rec._nations&&rec._nations.length>1&&(
                            <div style={{marginTop:6}}>
                              <span style={{fontSize:10,color:"#e8c547",background:"#1a2030",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif",fontWeight:700,border:"1px solid #2a3550"}}>Multiple Nations</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {memberRecs.length===0&&memberTop5s.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:"#333",fontFamily:"sans-serif",fontSize:14}}>No recs or lists yet.</div>
        )}
        {/* Nation picker modal rendered inside profile view */}
        {modal==="nationPicker"&&nationPicker&&(
          <ModalSheet onClose={()=>{setNationPicker(null);closeModal();}}>
            <NationPickerModal
              nations={nationPicker.nations}
              onPick={(n)=>{
                const pickedRec={...nationPicker.rec,_fbid:n.fbid,_nid:n.nid,_nname:n.nname};
                setNationPicker(null);
                closeModal();
                setViewingRec({rec:pickedRec});
              }}
              onClose={()=>{setNationPicker(null);closeModal();}}
            />
          </ModalSheet>
        )}
      </FullPage>
    );
  }

  // ── Top 5 detail ──
  if(viewingTop5){
    return (
      <Top5DetailView
        member={viewingTop5.member}
        nationId={viewingTop5.nationId}
        listId={viewingTop5.listId}
        nations={nations}
        user={user}
        onBack={()=>setViewingTop5(null)}
        onDelete={(nId,m,lId)=>handleDeleteTop5(nId,m,lId)}
      />
    );
  }

  // ── Rec detail ──
  if(viewingRec&&liveRec){
    const cat=CAT_MAP[liveRec.category]||CATEGORIES[0];
    return (
      <RecDetailView
        rec={{...liveRec,saved:savedRecs[liveRec._fbid]}}
        cat={cat}
        nationName={nations[liveRec._nid]?.name}
        user={user}
        onBack={()=>setViewingRec(null)}
        onLike={()=>toggleLike(liveRec)}
        onSave={()=>toggleSave(liveRec)}
        onComment={text=>addComment(liveRec,text)}
        onEdit={form=>handleEditRec(liveRec,form)}
        onDelete={()=>handleDeleteRec(liveRec)}
        onDeleteComment={cid=>handleDeleteComment(liveRec,cid)}
        onEditComment={(cid,text)=>handleEditComment(liveRec,cid,text)}
        onProfileClick={member=>setViewingProfile({member,nationId:liveRec._nid})}
      />
    );
  }

  // ── Auth screens — don't show until Firebase has checked auth state ──
  if(authUser===undefined) return <div style={{minHeight:"100vh",background:"#0d0f1a"}}/>;
  // If Firebase says we're logged in, never show auth screens even if screen state hasn't caught up
  if(authUser && (screen==="welcome" || screen==="auth")) return <div style={{minHeight:"100vh",background:"#0d0f1a"}}/>;
  if(screen==="welcome") return <WelcomeScreen onStart={()=>setScreen("auth")}/>;
  if(screen==="auth")    return <AuthScreen onAuth={()=>setScreen("nations")}/>;

  // ── Nations screen ──
  if(screen==="nations") return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",fontFamily:"'Georgia',serif",color:"#f0eee8"}}>
      <div style={{maxWidth:480,margin:"0 auto",padding:"40px 22px 100px"}}>
        <div style={{marginBottom:28}}>
          <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"#e8c547",marginBottom:8,fontFamily:"sans-serif",fontWeight:700}}>✦ Recommend Nation</div>
          <h1 style={{fontSize:30,fontWeight:700,letterSpacing:"-1.2px",margin:0,fontStyle:"italic"}}>Your Nations{user?`, ${user.name.split(" ")[0]}`:""}</h1>
          <p style={{color:"#444",fontSize:13,fontFamily:"sans-serif",marginTop:6}}>Private groups of friends & family.</p>
        </div>
        {myNations.length===0&&(
          <div style={{background:"#13162a",borderRadius:14,padding:24,marginBottom:16,textAlign:"center",border:"1px dashed #1a1d30"}}>
            <div style={{fontSize:32,marginBottom:8}}>🌍</div>
            <div style={{fontSize:14,color:"#444",fontFamily:"sans-serif"}}>You haven't joined any Nations yet.</div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {myNations.map(n=>(
            <NationCard key={n.id} n={n} user={user}
              onEnter={()=>{setActiveNId(n.id);setScreen("feed");}}
              onLeave={()=>handleLeaveNation(n.id)}
              onViewProfile={(m)=>setViewingProfile({member:m,nationId:n.id})}
            />
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          <button onClick={()=>setModal("createNation")} style={S.btn}>✦ Create a new Nation</button>
          <button onClick={()=>setModal("joinNation")} style={S.btnSec}>Join with a code</button>
          {myNationIds.length>0&&<button onClick={()=>{setActiveNId(null);setScreen("feed");}} style={{...S.btnSec,color:"#333",borderColor:"#13162a"}}>← Back to feed</button>}
        </div>
      </div>
      {modal&&(
        <ModalSheet onClose={closeModal}>
          {modal==="joinNation"&&<JoinModal joinCode={joinCode} setJoinCode={setJoinCode} joinError={joinError} onJoin={handleJoin}/>}
          {modal==="createNation"&&!createdCode&&<CreateModal name={newNationName} setName={setNewNationName} onCreate={handleCreateNation}/>}
          {modal==="createNation"&&createdCode&&<CreatedSuccess code={createdCode} name={nations[createdCode]?.name} onDone={()=>{closeModal();setActiveNId(createdCode);setScreen("feed");}}/>}
        </ModalSheet>
      )}
    </div>
  );

  // ── Main feed ──
  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif"}}>
      <header style={{background:"#0d0f1acc",backdropFilter:"blur(14px)",position:"sticky",top:0,zIndex:50,borderBottom:"1px solid #1a1d30"}}>
        <div style={{maxWidth:600,margin:"0 auto",padding:"12px 18px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden",flex:1,minWidth:0}}>
              {!searchOpen&&(
                <>
                  <button onClick={()=>setScreen("nations")} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>
                    <span style={{fontSize:19,fontStyle:"italic",fontWeight:700,letterSpacing:"-1px",color:"#e8c547"}}>RN</span>
                  </button>
                  <div style={{display:"flex",gap:5,overflowX:"auto"}}>
                    <NationPill label="All" active={activeNId===null} onClick={()=>{setActiveNId(null);setActiveCat("all");}}/>
                    {myNations.map(n=><NationPill key={n.id} label={nationPillLabel(n.name)} active={activeNId===n.id} onClick={()=>{setActiveNId(n.id);setActiveCat("all");}}/>)}
                  </div>
                </>
              )}
              {searchOpen&&(
                <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                  <span style={{fontSize:16,color:"#555",flexShrink:0}}>🔍</span>
                  <input
                    autoFocus
                    placeholder={activeNId?"Search this Nation…":"Search all Nations…"}
                    value={searchQuery}
                    onChange={e=>setSearchQuery(e.target.value)}
                    style={{...S.input,padding:"7px 12px",fontSize:14,flex:1,borderRadius:10,height:34}}
                  />
                  <button onClick={()=>{setSearchOpen(false);setSearchQuery("");}} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",flexShrink:0,padding:0}}>✕</button>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,marginLeft:8}}>
              {!searchOpen&&(
                <button onClick={()=>{setSearchOpen(true);setActiveTab("feed");}} style={{background:"none",border:"none",cursor:"pointer",padding:"0 2px",fontSize:17,color:"#555",lineHeight:1,transition:"color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.color="#e8c547"}
                  onMouseLeave={e=>e.currentTarget.style.color="#555"}>🔍</button>
              )}
              {user&&myNationIds.length>0&&(
                <div className="av-tap" onClick={()=>setViewingProfile({member:user.name,nationId:activeNId||null})}
                  style={{width:28,height:28,borderRadius:"50%",background:avatarColor(user.name[0]),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,fontFamily:"sans-serif",transition:"opacity 0.15s"}}>
                  {user.name[0].toUpperCase()}
                </div>
              )}
              <button onClick={()=>setModal("addRec")} style={{background:"#e8c547",color:"#0d0f1a",border:"none",borderRadius:18,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"sans-serif",whiteSpace:"nowrap"}}>+ Rec</button>
            </div>
          </div>
          <div style={{display:"flex",borderBottom:"1px solid #1a1d30"}}>
            {["feed","saved","top5s","help"].map(tab=>(
              <button key={tab} onClick={()=>{setActiveTab(tab);if(tab!=="feed"){setSearchOpen(false);setSearchQuery("");}}} style={{background:"none",border:"none",cursor:"pointer",padding:"6px 13px 9px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:activeTab===tab?"#e8c547":"#444",borderBottom:activeTab===tab?"2px solid #e8c547":"2px solid transparent",marginBottom:-1,transition:"color 0.15s"}}>
                {tab==="top5s"?"Top 5s":tab.charAt(0).toUpperCase()+tab.slice(1)}
              </button>
            ))}
            {typeof window!=="undefined"&&"Notification" in window&&(()=>{
              const isOn = notifStatus==="granted"||(notifStatus!=="disabled"&&notifStatus!=="idle"&&notifStatus!=="requesting"&&notifStatus!=="denied"&&Notification.permission==="granted");
              const isDenied = notifStatus==="denied"||(Notification.permission==="denied");
              const isRequesting = notifStatus==="requesting";
              function handleToggle(){
                if(isRequesting||isDenied) return;
                if(isOn) handleDisableNotifications();
                else handleEnableNotifications();
              }
              return (
                <button onClick={handleToggle} title={isDenied?"Blocked — enable in device settings":undefined}
                  style={{background:"none",border:"none",cursor:isDenied?"default":"pointer",padding:"6px 13px 9px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:isOn?"#e8c547":isDenied?"#2a2d40":"#444",borderBottom:"2px solid transparent",marginBottom:-1,transition:"color 0.15s",whiteSpace:"nowrap",marginLeft:"auto"}}>
                  {isRequesting?"…":isOn?"Alerts On":"Alerts Off"}
                </button>
              );
            })()}
          </div>
          {activeTab==="feed"&&(
            <div style={{display:"flex",gap:5,padding:"8px 0 10px",overflowX:"auto"}}>
              <CatPill label="All ✦" active={activeCat==="all"} onClick={()=>setActiveCat("all")} color="#e8c547"/>
              <CatPill label="❓ Requests" active={activeCat==="requests"} onClick={()=>setActiveCat("requests")} color="#e8a030"/>
              {CATEGORIES.map(c=><CatPill key={c.id} label={`${c.emoji} ${c.label}`} active={activeCat===c.id} onClick={()=>setActiveCat(c.id)} color={c.color}/>)}
            </div>
          )}
        </div>
      </header>

      <main style={{maxWidth:600,margin:"0 auto",padding:"18px 18px 100px"}}>
        {searchQuery.trim()&&activeTab==="feed"&&(
          <div style={{fontSize:12,fontFamily:"sans-serif",color:"#555",marginBottom:12}}>
            {filteredRecs.length===0
              ? `No results for "${searchQuery}"`
              : `${filteredRecs.length} result${filteredRecs.length!==1?"s":""} for "${searchQuery}"`}
          </div>
        )}
        {activeNation&&(
          <div style={{marginBottom:14,padding:"12px 16px",background:"#13162a",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #1a1d30"}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px"}}>{activeNation.name}</div>
              <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginTop:2}}>
                {Object.keys(activeNation.members||{}).length} members · code: <span style={{color:"#e8c547",letterSpacing:"0.12em",fontWeight:700}}>{activeNation.code}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab==="top5s"&&(
          <Top5Tab myNations={myNations} activeNId={activeNId} nations={nations}
            onView={(member,nId,listId)=>setViewingTop5({member,nationId:nId,listId})}
            onAdd={()=>setModal("addTop5")} user={user}
            onEdit={({member,nationId,listId,catId,title,items})=>setEditingTop5({member,nationId,listId,catId,title,items})}
            onProfile={(member,nId)=>setViewingProfile({member,nationId:nId})}/>
        )}
        {activeTab==="help"&&<HelpTab/>}

        {(activeTab==="feed"||activeTab==="saved")&&(
          filteredRecs.length===0?(
            <div style={{textAlign:"center",padding:"80px 0",color:"#333"}}>
              <div style={{fontSize:38,marginBottom:12}}>{activeTab==="saved"?"🔖":"✦"}</div>
              <div style={{fontFamily:"sans-serif",fontSize:14}}>{activeTab==="saved"?"Nothing saved yet.":"No recs here yet."}</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filteredRecs.map((rec,i)=>{
                const isMulti = !activeNId && rec._nations && rec._nations.length > 1;
                return (
                  <div key={rec._fbid} className="rc" style={{animationDelay:`${i*30}ms`}}>
                    <RecCard
                      rec={{...rec, saved: rec._nations
                        ? rec._nations.some(n=>savedRecs[n.fbid])
                        : savedRecs[rec._fbid]}}
                      user={user}
                      onLike={()=>toggleLike(rec)}
                      onSave={()=>toggleSave(rec)}
                      showNation={!activeNId ? (isMulti ? "__multiple__" : rec._nname) : null}
                      onProfileClick={()=>setViewingProfile({member:rec.from,nationId:rec._nid||activeNId})}
                      onOpen={()=>{
                        if(rec.isTop5) {
                          setViewingTop5({member:rec.from,nationId:rec._nid,listId:rec.listId});
                        } else if(isMulti) {
                          setNationPicker({nations: rec._nations, rec});
                          setModal("nationPicker");
                        } else {
                          setViewingRec({rec});
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )
        )}
      </main>

      <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"#0d0f1acc",backdropFilter:"blur(16px)",borderTop:"1px solid #1a1d30",display:"flex",justifyContent:"space-around",padding:"10px 0 18px",zIndex:50}}>
        {[
          {icon:"⌂",label:"Feed",fn:()=>{setActiveTab("feed");setActiveCat("all");}},
          {icon:"🔖",label:"Saved",fn:()=>setActiveTab("saved")},
          {icon:"🏆",label:"Top 5s",fn:()=>setActiveTab("top5s")},
          {icon:"✦",label:"Nations",fn:()=>setScreen("nations")},
          {icon:"＋",label:"Rec",fn:()=>setModal("addRec")},
        ].map(item=>(
          <button key={item.label} onClick={item.fn} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"0 6px"}}
            onMouseEnter={e=>{e.currentTarget.querySelectorAll("span").forEach(s=>s.style.color="#e8c547");}}
            onMouseLeave={e=>{e.currentTarget.querySelector("span:first-child").style.color="#555";e.currentTarget.querySelector("span:last-child").style.color="#444";}}>
            <span style={{fontSize:17,color:"#555",transition:"color 0.15s"}}>{item.icon}</span>
            <span style={{fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:700,color:"#444",fontFamily:"sans-serif",transition:"color 0.15s"}}>{item.label}</span>
          </button>
        ))}
      </nav>

      {modal&&(
        <ModalSheet onClose={()=>{
          if(modal==="nationPicker") setNationPicker(null);
          closeModal();
        }}>
          {modal==="addRec"&&<AddRecModal form={recForm} setForm={setRecForm} onSubmit={(ids)=>handleAddRec(ids)} onSubmitReq={handleAddReq} myNations={myNations} activeNId={activeNId}/>}
          {modal==="joinNation"&&<JoinModal joinCode={joinCode} setJoinCode={setJoinCode} joinError={joinError} onJoin={handleJoin}/>}
          {modal==="createNation"&&!createdCode&&<CreateModal name={newNationName} setName={setNewNationName} onCreate={handleCreateNation}/>}
          {modal==="createNation"&&createdCode&&<CreatedSuccess code={createdCode} name={nations[createdCode]?.name} onDone={()=>{closeModal();setActiveNId(createdCode);setScreen("feed");}}/>}
          {modal==="addTop5"&&<AddTop5Modal form={top5Form} setForm={setTop5Form} onSubmit={(ids)=>handleSaveTop5(ids)} myNations={myNations} activeNId={activeNId}/>}
          {modal==="nationPicker"&&nationPicker&&(
            <NationPickerModal
              nations={nationPicker.nations}
              onPick={(n)=>{
                const pickedRec={...nationPicker.rec,_fbid:n.fbid,_nid:n.nid,_nname:n.nname};
                setNationPicker(null);
                closeModal();
                setViewingRec({rec:pickedRec});
              }}
              onClose={()=>{setNationPicker(null);closeModal();}}
            />
          )}
        </ModalSheet>
      )}
    </div>
  );
}
