import Link from 'next/link';

export default function Terms() {
  const S = {
    page: {minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif",padding:"48px 24px 80px",overflowY:"auto"},
    inner: {maxWidth:640,margin:"0 auto"},
    back: {display:"inline-flex",alignItems:"center",gap:6,color:"#555",fontSize:13,fontFamily:"sans-serif",textDecoration:"none",marginBottom:36},
    label: {fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#e8c547",marginBottom:12,fontFamily:"sans-serif",fontWeight:700},
    h1: {fontSize:32,fontWeight:700,letterSpacing:"-1px",fontStyle:"italic",margin:"0 0 6px"},
    h2: {fontSize:18,fontWeight:700,letterSpacing:"-0.3px",margin:"32px 0 10px",color:"#e8c547"},
    p: {fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",margin:"0 0 12px"},
    li: {fontSize:14,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",marginBottom:6},
    hr: {border:"none",borderTop:"1px solid #1a1d30",margin:"28px 0"},
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Link href="/" style={S.back}>← Back to Recommend Nation</Link>

        <div style={S.label}>✦ Recommend Nation</div>
        <h1 style={S.h1}>Terms of Service</h1>
        <p style={{...S.p,color:"#555",marginBottom:32}}>Last updated: April 2026</p>

        <div style={S.hr}/>

        <h2 style={S.h2}>Who we are</h2>
        <p style={S.p}>Recommend Nation is operated by David Robertson, based in Ireland. By creating an account you agree to these terms. If you don't agree, please don't use the app.</p>
        <p style={S.p}>Contact us at: <a href="mailto:recommendnation@yahoo.com" style={{color:"#e8c547"}}>recommendnation@yahoo.com</a></p>

        <div style={S.hr}/>

        <h2 style={S.h2}>Who can use Recommend Nation</h2>
        <p style={S.p}>You must be 16 or over to create an account. By signing up you confirm that you are at least 16 years old.</p>

        <div style={S.hr}/>

        <h2 style={S.h2}>What the app is for</h2>
        <p style={S.p}>Recommend Nation is a private social app for sharing recommendations with people you know and trust. It is not intended for commercial use, advertising or spam.</p>

        <div style={S.hr}/>

        <h2 style={S.h2}>Your content</h2>
        <p style={S.p}>You own the recommendations, comments and Top 5 lists you post. By posting them you give Recommend Nation permission to display them to members of your Nations.</p>
        <p style={S.p}>You are responsible for what you post. You agree not to post anything that is:</p>
        <ul style={{paddingLeft:20,marginBottom:12}}>
          <li style={S.li}>Illegal, abusive, threatening or harassing</li>
          <li style={S.li}>Spam or commercial advertising</li>
          <li style={S.li}>Someone else's private or confidential information</li>
        </ul>
        <p style={S.p}>We reserve the right to remove content or suspend accounts that violate these terms.</p>

        <div style={S.hr}/>

        <h2 style={S.h2}>Our responsibilities</h2>
        <p style={S.p}>Recommend Nation is provided as-is. We do our best to keep it running smoothly but we can't guarantee uninterrupted service. We are not liable for any loss or inconvenience caused by downtime or data loss.</p>

        <div style={S.hr}/>

        <h2 style={S.h2}>Changes to these terms</h2>
        <p style={S.p}>We may update these terms occasionally. We'll notify you of significant changes by email.</p>

        <div style={S.hr}/>

        <h2 style={S.h2}>Governing law</h2>
        <p style={S.p}>These terms are governed by the laws of Ireland.</p>

        <div style={S.hr}/>

        <p style={{...S.p,color:"#444",fontSize:12}}>
          © 2026 Recommend Nation · David Robertson · Ireland ·{" "}
          <a href="mailto:recommendnation@yahoo.com" style={{color:"#444"}}>recommendnation@yahoo.com</a>
          {" · "}
          <Link href="/privacy" style={{color:"#444"}}>Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
