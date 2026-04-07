import Link from 'next/link';

export default function Privacy() {
  const S = {
    page: {minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif",padding:"48px 24px 80px",overflowY:"auto"},
    inner: {maxWidth:640,margin:"0 auto"},
    h1: {fontSize:32,fontWeight:700,letterSpacing:"-1px",fontStyle:"italic",marginBottom:6},
    h2: {fontSize:18,fontWeight:700,letterSpacing:"-0.3px",margin:"32px 0 10px",color:"#e8c547"},
    p: {fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",margin:"0 0 12px"},
    li: {fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",marginBottom:6},
    back: {display:"inline-flex",alignItems:"center",gap:6,color:"#555",fontSize:13,fontFamily:"sans-serif",textDecoration:"none",marginBottom:36},
    hr: {border:"none",borderTop:"1px solid #1a1d30",margin:"28px 0"},
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Link href="/" style={S.back}>← Back to Recommend Nation</Link>

        <div style={{fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#e8c547",marginBottom:12,fontFamily:"sans-serif",fontWeight:700}}>✦ Recommend Nation</div>
        <h1 style={S.h1}>Privacy Policy</h1>
        <p style={{...S.p,color:"#555",marginBottom:32}}>Last updated: April 2026</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Who we are</h2>
        <p style={S.p}>Recommend Nation is a private social app for sharing recommendations with trusted friends and family. The app is operated by David Robertson, based in Ireland.</p>
        <p style={S.p}>If you have any questions about this policy or your data, contact us at: <a href="mailto:recommendnation@yahoo.com" style={{color:"#e8c547"}}>recommendnation@yahoo.com</a></p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>What data we collect and why</h2>
        <p style={S.p}>When you create an account we collect:</p>
        <ul style={{paddingLeft:20,marginBottom:12}}>
          <li style={S.li}><strong style={{color:"#f0eee8"}}>Your name</strong> — shown to members of your Nations</li>
          <li style={S.li}><strong style={{color:"#f0eee8"}}>Your email address</strong> — used to log in and reset your password</li>
        </ul>
        <p style={S.p}>When you use the app we store:</p>
        <ul style={{paddingLeft:20,marginBottom:12}}>
          <li style={S.li}>Recommendations, comments and Top 5 lists you post</li>
          <li style={S.li}>Which Nations you belong to</li>
          <li style={S.li}>Recommendations you have saved</li>
        </ul>
        <p style={S.p}>We do not collect your location, phone number, payment details or any other personal information.</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>How your data is stored</h2>
        <p style={S.p}>Your data is stored securely using Google Firebase, operated by Google LLC. Firebase servers are located in the United States. By using Recommend Nation you consent to your data being stored there. Google's privacy policy is available at <a href="https://firebase.google.com" target="_blank" rel="noopener noreferrer" style={{color:"#e8c547"}}>firebase.google.com</a>.</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Who can see your data</h2>
        <ul style={{paddingLeft:20,marginBottom:12}}>
          <li style={S.li}>Your <strong style={{color:"#f0eee8"}}>name</strong> is visible to other members of Nations you belong to</li>
          <li style={S.li}>Your <strong style={{color:"#f0eee8"}}>email address</strong> is never visible to other users</li>
          <li style={S.li}>We do not sell, share or rent your data to any third parties</li>
        </ul>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Analytics</h2>
        <p style={S.p}>We use Google Analytics to understand how many people visit the app and how they use it. This collects anonymised usage data such as pages visited and approximate location. It does not identify you personally. You can opt out of Google Analytics using browser settings or extensions.</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Your rights under GDPR</h2>
        <p style={S.p}>You have the right to:</p>
        <ul style={{paddingLeft:20,marginBottom:12}}>
          <li style={S.li}><strong style={{color:"#f0eee8"}}>Access</strong> the data we hold about you</li>
          <li style={S.li}><strong style={{color:"#f0eee8"}}>Correct</strong> inaccurate data</li>
          <li style={S.li}><strong style={{color:"#f0eee8"}}>Delete</strong> your account and all associated data</li>
          <li style={S.li}><strong style={{color:"#f0eee8"}}>Object</strong> to how we process your data</li>
        </ul>
        <p style={S.p}>To exercise any of these rights, contact us at <a href="mailto:recommendnation@yahoo.com" style={{color:"#e8c547"}}>recommendnation@yahoo.com</a> or use the Delete Account option in the app settings.</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Data retention</h2>
        <p style={S.p}>We keep your data for as long as your account is active. If you delete your account, all your personal data and content will be permanently removed within 30 days.</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Children</h2>
        <p style={S.p}>Recommend Nation is not intended for children under 13. We do not knowingly collect data from children under 13.</p>

        <hr style={S.hr}/>

        <h2 style={S.h2}>Changes to this policy</h2>
        <p style={S.p}>We may update this policy occasionally. We'll notify you of significant changes by email.</p>

        <hr style={S.hr}/>

        <p style={{...S.p,color:"#444",fontSize:12}}>© 2026 Recommend Nation · David Robertson · Ireland · <a href="mailto:recommendnation@yahoo.com" style={{color:"#444"}}>recommendnation@yahoo.com</a></p>
      </div>
    </div>
  );
}
