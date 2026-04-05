import { useState, useRef, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import { ref, onValue, set, push, update, get } from "firebase/database";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
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
  const [error,setError]     = useState("");
  const [loading,setLoading] = useState(false);
  const [resetSent,setResetSent] = useState(false);

  async function handleSignup() {
    if (!name.trim())     { setError("Please enter your name."); return; }
    if (!email.trim())    { setError("Please enter your email."); return; }
    if (password.length < 6) { setError("Password should be at least 6 characters."); return; }
    setLoading(true); setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, {displayName: name.trim()});
      // Store user profile in database
      await set(ref(db, `users/${cred.user.uid}`), {name: name.trim(), email: email.trim(), nationIds: []});
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
          <button onClick={mode==="login"?handleLogin:handleSignup} disabled={loading}
            style={{...S.btn,opacity:loading?0.6:1,marginTop:4}}>
            {loading?(mode==="login"?"Signing in…":"Creating account…"):(mode==="login"?"Sign in →":"Create account →")}
          </button>
          <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}}
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

function AddRecModal({form,setForm,onSubmit,myNations,activeNId}) {
  const cat=CAT_MAP[form.category];
  return (
    <div>
      <h2 style={{margin:"0 0 14px",fontSize:22,fontStyle:"italic",letterSpacing:"-0.5px",color:"#f0eee8"}}>Rec something</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
        {CATEGORIES.map(c=>(
          <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id,field1:"",field2:"",note:""}))}
            style={{background:form.category===c.id?c.color:"#1a1d30",color:form.category===c.id?"#0d0f1a":"#555",border:"none",borderRadius:10,padding:"8px 4px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
            <span style={{fontSize:18}}>{c.emoji}</span><span style={{lineHeight:1.2,textAlign:"center"}}>{c.label}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input placeholder={`${cat.fields[0]} *`} value={form.field1} onChange={e=>setForm(f=>({...f,field1:e.target.value}))} style={S.input}/>
        <input placeholder={cat.fields[1]} value={form.field2} onChange={e=>setForm(f=>({...f,field2:e.target.value}))} style={S.input}/>
        <textarea placeholder={`${cat.fields[2]} (optional)`} value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={3} style={{...S.input,resize:"none",lineHeight:1.6}}/>
        {!activeNId&&myNations.length>0&&<p style={{fontSize:12,color:"#444",fontFamily:"sans-serif",margin:0}}>Posting to <strong style={{color:"#e8c547"}}>all your Nations</strong></p>}
        <button onClick={onSubmit} style={{...S.btn,opacity:form.field1.trim()?1:0.4,marginTop:4}}>Post Rec →</button>
      </div>
    </div>
  );
}

function AddTop5Modal({form,setForm,onSubmit}) {
  const cat=CAT_MAP[form.category];
  return (
    <div>
      <h2 style={{margin:"0 0 6px",fontSize:22,fontStyle:"italic",letterSpacing:"-0.5px",color:"#f0eee8"}}>Your Top 5</h2>
      <p style={{margin:"0 0 12px",fontSize:13,color:"#555",fontFamily:"sans-serif"}}>Pick a category and rank your all-time favourites.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:14}}>
        {CATEGORIES.map(c=>(
          <button key={c.id} onClick={()=>setForm(f=>({...f,category:c.id,items:Array(5).fill("")}))}
            style={{background:form.category===c.id?c.color:"#1a1d30",color:form.category===c.id?"#0d0f1a":"#555",border:"none",borderRadius:10,padding:"7px 4px",fontSize:10,fontFamily:"sans-serif",fontWeight:700,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}}>
            <span style={{fontSize:16}}>{c.emoji}</span><span style={{lineHeight:1.2,textAlign:"center"}}>{c.label}</span>
          </button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {form.items.map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16,fontWeight:700,fontStyle:"italic",color:i<3?cat.color:"#2e3450",minWidth:22,textAlign:"right"}}>{i+1}</span>
            <input placeholder={i===0?"Your all-time favourite…":`#${i+1}`} value={item}
              onChange={e=>setForm(f=>{const items=[...f.items];items[i]=e.target.value;return {...f,items};})}
              style={{...S.input,padding:"9px 12px",fontSize:13}}/>
          </div>
        ))}
        <button onClick={onSubmit} style={{...S.btn,marginTop:8,opacity:form.items[0].trim()?1:0.4}}>Save my Top 5 →</button>
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
  return (
    <div onClick={onOpen} style={{background:"#13162a",borderRadius:14,padding:"15px 17px",border:"1px solid #1a1d30",position:"relative",overflow:"hidden",cursor:"pointer",transition:"background 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.background="#1a1f35"}
      onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:cat.color,borderRadius:"14px 0 0 14px"}}/>
      <div style={{paddingLeft:9}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
          <div className="av-tap" onClick={e=>{e.stopPropagation();onProfileClick();}}
            style={{width:24,height:24,borderRadius:"50%",background:avatarColor(av),display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0}}>{av}</div>
          <span className="from-tap" onClick={e=>{e.stopPropagation();onProfileClick();}} style={{fontSize:12,color:"#666",fontFamily:"sans-serif",transition:"color 0.15s"}}>{rec.from}</span>
          {showNation&&<span style={{fontSize:10,color:"#3a4060",background:"#1a1d30",borderRadius:5,padding:"1px 6px",fontFamily:"sans-serif"}}>{showNation}</span>}
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
function RecDetailView({rec,cat,nationName,user,onBack,onLike,onSave,onComment,onEdit,onProfileClick}) {
  const [commentText,setCommentText]=useState("");
  const [editing,setEditing]=useState(false);
  const bottomRef=useRef(null);
  const inputRef=useRef(null);
  const liked=user&&(rec.likes||{})[user.name];
  const likeCount=Object.keys(rec.likes||{}).length;
  const comments=Object.values(rec.comments||{}).sort((a,b)=>a.ts-b.ts);
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
          <button onClick={()=>setEditing(true)} style={{background:"#1a1d30",border:"1px solid #272b42",borderRadius:8,padding:"5px 12px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,color:"#e8c547",cursor:"pointer",flexShrink:0}}>Edit</button>
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
                  return (
                    <div key={c.id||i} className="comment-bubble" style={{animationDelay:`${i*40}ms`,display:"flex",gap:10,marginBottom:16,flexDirection:isMe?"row-reverse":"row"}}>
                      <div onClick={()=>onProfileClick(c.from)} className="av-tap"
                        style={{width:30,height:30,borderRadius:"50%",background:avatarColor(cav),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,fontFamily:"sans-serif",flexShrink:0,marginTop:2}}>{cav}</div>
                      <div style={{maxWidth:"75%"}}>
                        <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginBottom:4,textAlign:isMe?"right":"left"}}>
                          <span onClick={()=>onProfileClick(c.from)} style={{cursor:"pointer"}}
                            onMouseEnter={e=>e.target.style.color="#e8c547"} onMouseLeave={e=>e.target.style.color="#555"}>
                            {isMe?"You":c.from}
                          </span>
                          <span style={{marginLeft:6,opacity:0.5}}>{timeAgo(c.ts)}</span>
                        </div>
                        <div style={{background:isMe?"#1e2a4a":"#1a1d30",borderRadius:isMe?"14px 4px 14px 14px":"4px 14px 14px 14px",padding:"10px 14px",fontSize:14,lineHeight:1.55,color:"#e8e6f0",border:`1px solid ${isMe?"#2a3a5a":"#272b42"}`}}>
                          {c.text}
                        </div>
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
  const{member,nationId,catId,items}=editingTop5;
  const cat=CAT_MAP[catId];
  const paddedItems=[...items,...Array(5).fill("")].slice(0,5);
  const [form,setForm]=useState({category:catId,items:paddedItems});
  return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif"}}>
      <div style={{maxWidth:520,margin:"0 auto",padding:"36px 22px 80px"}}>
        <button onClick={onCancel} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,fontFamily:"sans-serif",marginBottom:28,padding:0,display:"flex",alignItems:"center",gap:6}}>← Cancel</button>
        <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:cat.color,marginBottom:6,fontFamily:"sans-serif",fontWeight:700}}>{cat.emoji} {cat.label}</div>
        <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.8px",margin:"0 0 24px",fontStyle:"italic"}}>Edit your Top 5</h1>
        <AddTop5Modal form={form} setForm={setForm} onSubmit={()=>onSave(nationId,member,form.category,form.items)}/>
      </div>
    </div>
  );
}

// ─── Top 5 Tab ────────────────────────────────────────────────────────────────
function Top5Tab({myNations,activeNId,nations,onView,onAdd,onEdit,user,onProfile}) {
  const displayNations=activeNId?[nations[activeNId]]:myNations;
  const entries=[];
  displayNations.forEach(n=>{
    if(!n?.topFives)return;
    Object.entries(n.topFives).forEach(([member,cats])=>{
      Object.keys(cats).forEach(catId=>{if(cats[catId]?.length)entries.push({member,nationId:n.id,nationName:n.name,catId});});
    });
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
            const items=nations[e.nationId]?.topFives?.[e.member]?.[e.catId]||[];
            const isOwn=user?.name===e.member;
            return (
              <div key={i} onClick={()=>onView(e.member,e.nationId,e.catId)}
                style={{background:"#13162a",borderRadius:14,padding:"14px 18px",border:"1px solid #1a1d30",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"background 0.15s"}}
                onMouseEnter={ev=>ev.currentTarget.style.background="#1a1d30"}
                onMouseLeave={ev=>ev.currentTarget.style.background="#13162a"}>
                <div style={{width:38,height:38,borderRadius:9,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700}}>
                    <span onClick={ev=>{ev.stopPropagation();onProfile(e.member,e.nationId);}} style={{color:"#e8c547",cursor:"pointer"}}>{e.member}</span>'s {cat.label} Top 5
                  </div>
                  <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginTop:2}}>{items[0]}{items[1]?`, ${items[1]}`:""}{items.length>2?` +${items.length-2} more`:""}</div>
                  {!activeNId&&<div style={{fontSize:10,color:"#3a4060",fontFamily:"sans-serif",marginTop:2}}>{e.nationName}</div>}
                </div>
                {isOwn?(
                  <button onClick={ev=>{ev.stopPropagation();onEdit({member:e.member,nationId:e.nationId,catId:e.catId,items});}}
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
  const [top5Form,setTop5Form]  = useState({category:"movies",items:Array(5).fill("")});
  const [viewingTop5,setViewingTop5]       = useState(null);
  const [viewingProfile,setViewingProfile] = useState(null);
  const [viewingRec,setViewingRec]         = useState(null);
  const [savedRecs,setSavedRecs]           = useState({});
  const [editingTop5,setEditingTop5]       = useState(null);

  // ── Listen to Firebase Auth state ──
  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      if(firebaseUser) {
        setAuthUser(firebaseUser);
        // Load user profile from database
        const snap = await get(ref(db, `users/${firebaseUser.uid}`));
        if(snap.exists()) {
          const profile = snap.val();
          setUser({name: profile.name, uid: firebaseUser.uid});
          const ids = profile.nationIds ? Object.keys(profile.nationIds) : [];
          setMyNIds(ids);
          // Load saved recs from database
          const savedSnap = await get(ref(db, `users/${firebaseUser.uid}/savedRecs`));
          if(savedSnap.exists()) setSavedRecs(savedSnap.val()||{});
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

  const allRecs = activeNId
    ? Object.entries(nations[activeNId]?.recs||{}).map(([id,r])=>({...r,_fbid:id,_nid:activeNId}))
    : myNationIds.flatMap(nid=>Object.entries(nations[nid]?.recs||{}).map(([id,r])=>({...r,_fbid:id,_nid:nid,_nname:nations[nid]?.name})));

  const filteredRecs=[...allRecs].sort((a,b)=>(b.ts||0)-(a.ts||0)).filter(r=>{
    if(activeTab==="saved") return savedRecs[r._fbid];
    if(activeCat!=="all")   return r.category===activeCat;
    return true;
  });

  const liveRec = viewingRec ? (()=>{
    const r=viewingRec.rec;
    const live=nations[r._nid]?.recs?.[r._fbid];
    if(!live) return r;
    return {...live,_fbid:r._fbid,_nid:r._nid,_nname:r._nname};
  })() : null;

  function closeModal(){setModal(null);setJoinCode("");setJoinError("");setCreatedCode(null);}

  async function handleJoin(){
    const code=joinCode.trim().toUpperCase();
    const snap=await get(ref(db,`nations/${code}`));
    if(snap.exists()){
      if(myNationIds.includes(code)){setJoinError("You're already in this Nation!");return;}
      await update(ref(db,`nations/${code}/members`),{[user.name]:true});
      await update(ref(db,`users/${authUser.uid}/nationIds`),{[code]:true});
      const newIds=[...myNationIds,code];
      setMyNIds(newIds);
      setJoinCode("");setJoinError("");closeModal();
      setActiveNId(code);setScreen("feed");
    }else{setJoinError("No Nation found with that code.");}
  }

  async function handleCreateNation(){
    if(!newNationName.trim())return;
    const code=generateCode();
    await set(ref(db,`nations/${code}`),{id:code,name:newNationName.trim(),code,members:{[user.name]:true},recs:{},topFives:{}});
    await update(ref(db,`users/${authUser.uid}/nationIds`),{[code]:true});
    const newIds=[...myNationIds,code];
    setMyNIds(newIds);
    setCreatedCode(code);setNewNationName("");
  }

  async function handleAddRec(){
    if(!recForm.field1.trim())return;
    const targetIds=activeNId?[activeNId]:myNationIds;
    for(const tid of targetIds){
      await push(ref(db,`nations/${tid}/recs`),{category:recForm.category,field1:recForm.field1,field2:recForm.field2,note:recForm.note,from:user.name,ts:Date.now(),likes:{},comments:{}});
    }
    setRecForm({category:"movies",field1:"",field2:"",note:""});
    closeModal();
  }

  async function handleEditRec(rec,form){
    await update(ref(db,`nations/${rec._nid}/recs/${rec._fbid}`),{
      category:form.category,field1:form.field1,field2:form.field2,note:form.note
    });
  }

  async function handleSaveTop5(){
    const tid=activeNId||myNationIds[0];
    if(!tid||!user)return;
    await set(ref(db,`nations/${tid}/topFives/${user.name}/${top5Form.category}`),top5Form.items.filter(i=>i.trim()));
    setTop5Form({category:"movies",items:Array(5).fill("")});
    closeModal();
  }

  async function handleEditTop5(nationId,member,catId,items){
    await set(ref(db,`nations/${nationId}/topFives/${member}/${catId}`),items.filter(i=>i.trim()));
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

  // ── Loading state ──
  if(authUser===undefined) return (
    <div style={{minHeight:"100vh",background:"#0d0f1a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#e8c547",fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",fontFamily:"sans-serif",fontWeight:700}}>✦ Loading…</div>
    </div>
  );

  // ── Edit Top 5 ──
  if(editingTop5) return (
    <EditTop5Screen editingTop5={editingTop5} onCancel={()=>setEditingTop5(null)} onSave={handleEditTop5}/>
  );

  // ── Profile view ──
  if(viewingProfile){
    const{member,nationId}=viewingProfile;
    const sourceNations=nationId?[nations[nationId]].filter(Boolean):myNations;
    const memberRecs=sourceNations.flatMap(n=>Object.entries(n?.recs||{}).filter(([,r])=>r.from===member).map(([fbid,r])=>({...r,_fbid:fbid,_nname:n.name,_nid:n.id})));
    const memberTop5s=[];
    sourceNations.forEach(n=>{
      const tf=n?.topFives?.[member]||{};
      Object.keys(tf).forEach(catId=>{if(tf[catId]?.length)memberTop5s.push({catId,items:tf[catId],nationId:n.id,nationName:n.name});});
    });
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
          <button onClick={handleSignOut} style={{...S.btnSec,fontSize:12,marginBottom:24,width:"auto",padding:"8px 16px"}}>Sign out</button>
        )}
        {memberTop5s.length>0&&(
          <div style={{marginBottom:24}}>
            <SectionHeading>Top 5 Lists</SectionHeading>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {memberTop5s.map((t,i)=>{
                const cat=CAT_MAP[t.catId];
                return (
                  <div key={i} onClick={()=>{setViewingProfile(null);setViewingTop5({member,nationId:t.nationId,category:t.catId});}}
                    style={{background:"#13162a",borderRadius:12,padding:"13px 16px",border:"1px solid #1a1d30",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}
                    onMouseEnter={e=>e.currentTarget.style.background="#1a1d30"}
                    onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
                    <div style={{width:36,height:36,borderRadius:9,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700}}>{cat.label} Top 5</div>
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
                      <div key={rec._fbid} onClick={()=>{setViewingProfile(null);setViewingRec({rec});}}
                        style={{background:"#13162a",borderRadius:12,padding:"12px 15px",border:"1px solid #1a1d30",position:"relative",overflow:"hidden",cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#1e2140"}
                        onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
                        <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:cat.color,borderRadius:"12px 0 0 12px"}}/>
                        <div style={{paddingLeft:8}}>
                          <div style={{fontSize:15,fontWeight:700}}>{rec.field1}</div>
                          {rec.field2&&<div style={{fontSize:12,color:"#555",fontFamily:"sans-serif",marginTop:1}}>{rec.field2}</div>}
                          {rec.note&&<div style={{fontSize:12,color:"#7a7a9a",fontStyle:"italic",marginTop:7}}>"{rec.note}"</div>}
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
      </FullPage>
    );
  }

  // ── Top 5 detail ──
  if(viewingTop5){
    const{member,nationId,category}=viewingTop5;
    const items=nations[nationId]?.topFives?.[member]?.[category]||[];
    const cat=CAT_MAP[category];
    return (
      <FullPage onBack={()=>setViewingTop5(null)}>
        <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:cat.color,marginBottom:6,fontFamily:"sans-serif",fontWeight:700}}>{cat.emoji} {cat.label}</div>
        <h1 style={{fontSize:28,fontWeight:700,letterSpacing:"-1px",margin:"0 0 4px",fontStyle:"italic"}}>{member}'s Top 5</h1>
        <p style={{color:"#444",fontSize:13,fontFamily:"sans-serif",marginBottom:28}}>{nations[nationId]?.name}</p>
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
        onProfileClick={member=>setViewingProfile({member,nationId:liveRec._nid})}
      />
    );
  }

  // ── Auth screens ──
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
            <div key={n.id} onClick={()=>{setActiveNId(n.id);setScreen("feed");}}
              style={{background:"#13162a",borderRadius:14,padding:"16px 18px",cursor:"pointer",border:"1px solid #1a1d30",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="#1a1d30"}
              onMouseLeave={e=>e.currentTarget.style.background="#13162a"}>
              <div>
                <div style={{fontSize:16,fontWeight:700,letterSpacing:"-0.3px"}}>{n.name}</div>
                <div style={{fontSize:11,color:"#444",fontFamily:"sans-serif",marginTop:3}}>
                  {Object.keys(n.members||{}).length} members · <span style={{color:"#e8c547",letterSpacing:"0.1em",fontWeight:700}}>{n.code}</span> · {Object.keys(n.recs||{}).length} recs
                </div>
              </div>
              <span style={{color:"#e8c547"}}>→</span>
            </div>
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
            <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden"}}>
              <button onClick={()=>setScreen("nations")} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>
                <span style={{fontSize:19,fontStyle:"italic",fontWeight:700,letterSpacing:"-1px",color:"#e8c547"}}>RN</span>
              </button>
              <div style={{display:"flex",gap:5,overflowX:"auto"}}>
                <NationPill label="All" active={activeNId===null} onClick={()=>{setActiveNId(null);setActiveCat("all");}}/>
                {myNations.map(n=><NationPill key={n.id} label={nationPillLabel(n.name)} active={activeNId===n.id} onClick={()=>{setActiveNId(n.id);setActiveCat("all");}}/>)}
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,marginLeft:8}}>
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
            {["feed","saved","top5s"].map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)} style={{background:"none",border:"none",cursor:"pointer",padding:"6px 13px 9px",fontSize:11,fontFamily:"sans-serif",fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:activeTab===tab?"#e8c547":"#444",borderBottom:activeTab===tab?"2px solid #e8c547":"2px solid transparent",marginBottom:-1,transition:"color 0.15s"}}>
                {tab==="top5s"?"Top 5s":tab}
              </button>
            ))}
          </div>
          {activeTab==="feed"&&(
            <div style={{display:"flex",gap:5,padding:"8px 0 10px",overflowX:"auto"}}>
              <CatPill label="All ✦" active={activeCat==="all"} onClick={()=>setActiveCat("all")} color="#e8c547"/>
              {CATEGORIES.map(c=><CatPill key={c.id} label={`${c.emoji} ${c.label}`} active={activeCat===c.id} onClick={()=>setActiveCat(c.id)} color={c.color}/>)}
            </div>
          )}
        </div>
      </header>

      <main style={{maxWidth:600,margin:"0 auto",padding:"18px 18px 100px"}}>
        {activeNation&&(
          <div style={{marginBottom:14,padding:"12px 16px",background:"#13162a",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #1a1d30"}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,letterSpacing:"-0.3px"}}>{activeNation.name}</div>
              <div style={{fontSize:11,color:"#555",fontFamily:"sans-serif",marginTop:2}}>
                {Object.keys(activeNation.members||{}).length} members · code: <span style={{color:"#e8c547",letterSpacing:"0.12em",fontWeight:700}}>{activeNation.code}</span>
              </div>
            </div>
            <div style={{display:"flex"}}>
              {Object.keys(activeNation.members||{}).slice(0,5).map((m,i)=>(
                <div key={i} className="av-tap" onClick={()=>setViewingProfile({member:m,nationId:activeNId})}
                  style={{width:28,height:28,borderRadius:"50%",background:avatarColor(m[0]),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,fontFamily:"sans-serif",border:"2px solid #0d0f1a",marginLeft:i>0?-8:0,transition:"opacity 0.15s",zIndex:5-i}}>
                  {m[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab==="top5s"&&(
          <Top5Tab myNations={myNations} activeNId={activeNId} nations={nations}
            onView={(member,nId,cat)=>setViewingTop5({member,nationId:nId,category:cat})}
            onAdd={()=>setModal("addTop5")} user={user}
            onEdit={({member,nationId,catId,items})=>setEditingTop5({member,nationId,catId,items})}
            onProfile={(member,nId)=>setViewingProfile({member,nationId:nId})}/>
        )}

        {(activeTab==="feed"||activeTab==="saved")&&(
          filteredRecs.length===0?(
            <div style={{textAlign:"center",padding:"80px 0",color:"#333"}}>
              <div style={{fontSize:38,marginBottom:12}}>{activeTab==="saved"?"🔖":"✦"}</div>
              <div style={{fontFamily:"sans-serif",fontSize:14}}>{activeTab==="saved"?"Nothing saved yet.":"No recs here yet."}</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filteredRecs.map((rec,i)=>(
                <div key={rec._fbid} className="rc" style={{animationDelay:`${i*30}ms`}}>
                  <RecCard
                    rec={{...rec,saved:savedRecs[rec._fbid]}}
                    user={user}
                    onLike={()=>toggleLike(rec)}
                    onSave={()=>toggleSave(rec)}
                    showNation={!activeNId&&rec._nname}
                    onProfileClick={()=>setViewingProfile({member:rec.from,nationId:rec._nid||activeNId})}
                    onOpen={()=>setViewingRec({rec})}
                  />
                </div>
              ))}
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
        <ModalSheet onClose={closeModal}>
          {modal==="addRec"&&<AddRecModal form={recForm} setForm={setRecForm} onSubmit={handleAddRec} myNations={myNations} activeNId={activeNId}/>}
          {modal==="joinNation"&&<JoinModal joinCode={joinCode} setJoinCode={setJoinCode} joinError={joinError} onJoin={handleJoin}/>}
          {modal==="createNation"&&!createdCode&&<CreateModal name={newNationName} setName={setNewNationName} onCreate={handleCreateNation}/>}
          {modal==="createNation"&&createdCode&&<CreatedSuccess code={createdCode} name={nations[createdCode]?.name} onDone={()=>{closeModal();setActiveNId(createdCode);setScreen("feed");}}/>}
          {modal==="addTop5"&&<AddTop5Modal form={top5Form} setForm={setTop5Form} onSubmit={handleSaveTop5}/>}
        </ModalSheet>
      )}
    </div>
  );
}
