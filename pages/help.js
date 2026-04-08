import Link from 'next/link';

export default function Help() {
  const S = {
    page: {minHeight:"100vh",background:"#0d0f1a",color:"#f0eee8",fontFamily:"'Georgia',serif",padding:"48px 24px 80px",overflowY:"auto"},
    inner: {maxWidth:640,margin:"0 auto"},
    back: {display:"inline-flex",alignItems:"center",gap:6,color:"#555",fontSize:13,fontFamily:"sans-serif",textDecoration:"none",marginBottom:36},
    label: {fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#e8c547",marginBottom:12,fontFamily:"sans-serif",fontWeight:700},
    h1: {fontSize:32,fontWeight:700,letterSpacing:"-1px",fontStyle:"italic",margin:"0 0 24px",lineHeight:1.2},
    welcome: {fontSize:15,lineHeight:1.8,color:"#aaa",fontFamily:"sans-serif",marginBottom:12},
    hr: {border:"none",borderTop:"1px solid #1a1d30",margin:"36px 0"},
    sectionTitle: {fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"#e8c547",fontFamily:"sans-serif",fontWeight:700,marginBottom:20},
    itemTitle: {fontSize:16,fontWeight:700,letterSpacing:"-0.3px",margin:"0 0 6px",color:"#f0eee8"},
    itemBody: {fontSize:13,lineHeight:1.75,color:"#aaa",fontFamily:"sans-serif",margin:"0 0 20px"},
    highlight: {color:"#e8c547",fontWeight:700},
  };

  const Item = ({title, children}) => (
    <div style={{marginBottom:22,paddingLeft:14,borderLeft:"2px solid #1a1d30"}}>
      <div style={S.itemTitle}>{title}</div>
      <div style={S.itemBody}>{children}</div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Link href="/" style={S.back}>← Back to Recommend Nation</Link>

        {/* Welcome */}
        <div style={S.label}>✦ Recommend Nation</div>
        <h1 style={S.h1}>Welcome</h1>
        <p style={S.welcome}>The best recommendations come from people you actually know and trust.</p>
        <p style={S.welcome}>Watched something brilliant? Discovered an amazing restaurant? Read a book you can't stop thinking about? Take 30 seconds to share it with the people who matter.</p>
        <p style={S.welcome}>Create a Nation for each group in your life — family, friends, colleagues — and start sharing. Keep it simple. No need for links or photos. If someone's curious about your rec, they can find it in seconds online. Your job is just to point them in the right direction.</p>
        <p style={{...S.welcome,color:"#e8c547",fontStyle:"italic",fontFamily:"'Georgia',serif"}}>Life's too short for bad movies and mediocre restaurants. Trust your people.</p>

        <div style={S.hr}/>

        {/* Getting Started */}
        <div style={S.sectionTitle}>Getting Started</div>

        <Item title="Create a Nation">
          Tap the <span style={S.highlight}>Nations</span> icon in the bottom bar. Tap <span style={S.highlight}>Create a new Nation</span>, give it a name (e.g. "The Smith Family" or "Work Pals") and tap Create. You'll get a unique 6-character code — share it with anyone you want to invite.
        </Item>

        <Item title="Join a Nation">
          Tap the <span style={S.highlight}>Nations</span> icon in the bottom bar, then <span style={S.highlight}>Join with a code</span>. Enter the 6-character code shared with you and tap Join.
        </Item>

        <Item title="Invite others to join your Nation">
          Share your Nation's 6-character code with them directly — by text, WhatsApp, email, whatever works. They enter the code in the app to join. You can find your code on the Nations screen or at the top of your Nation's feed.
        </Item>

        <div style={S.hr}/>

        {/* Making Recommendations */}
        <div style={S.sectionTitle}>Making Recommendations</div>

        <Item title="Post to all of your Nations">
          Start from the <span style={S.highlight}>All feed</span> — tap <span style={S.highlight}>+ Rec</span> and post as normal. It will go to all your Nations by default.
        </Item>

        <Item title="Post to a specific Nation only">
          Navigate to that Nation's feed first using the pills at the top of the screen, then tap <span style={S.highlight}>+ Rec</span>. It will post only to that Nation.
        </Item>

        <Item title="Post to some of your Nations">
          Start from the <span style={S.highlight}>All feed</span>, tap <span style={S.highlight}>+ Rec</span>, then use the Nation toggles at the bottom of the form to deselect any Nations you don't want to post to before tapping Post.
        </Item>

        <Item title="Edit or delete your own rec">
          Tap any rec you posted to open it. You'll see <span style={S.highlight}>Edit</span> and <span style={S.highlight}>Delete</span> buttons in the top right corner.
        </Item>

        <div style={S.hr}/>

        {/* Interacting */}
        <div style={S.sectionTitle}>Interacting with Recommendations</div>

        <Item title="Comment on a recommendation">
          Tap any rec to open it, then type in the comment box at the bottom and tap the arrow to send. You can edit or delete your own comments by tapping <span style={S.highlight}>Edit</span> or <span style={S.highlight}>Delete</span> next to them.
        </Item>

        <Item title="Like a recommendation">
          Tap the ❤️ on any rec card or inside the rec detail view.
        </Item>

        <Item title="Save a recommendation">
          Tap the 🔖 on any rec to save it. Find all your saved recs under the <span style={S.highlight}>Saved</span> tab.
        </Item>

        <div style={S.hr}/>

        {/* Top 5s */}
        <div style={S.sectionTitle}>Top 5s</div>

        <Item title="Post a Top 5">
          Tap the <span style={S.highlight}>Top 5s</span> tab at the top of the feed or the <span style={S.highlight}>🏆 Top 5s</span> icon in the bottom bar, then tap <span style={S.highlight}>+ Add yours</span>. Choose a category and rank your five favourites. You can edit your Top 5 at any time by tapping <span style={S.highlight}>Edit</span> next to your list.
        </Item>

        <div style={S.hr}/>

        {/* Filtering */}
        <div style={S.sectionTitle}>Filtering</div>

        <Item title="Filter by Nation">
          Tap any Nation pill at the top of the screen to see only that Nation's recs. Tap <span style={S.highlight}>All</span> to see everything.
        </Item>

        <Item title="Filter by category">
          While in the Feed tab, tap any category pill (🎬 Movies, 📺 TV Series etc.) to filter by that category.
        </Item>

        <div style={S.hr}/>

        {/* Your Account */}
        <div style={S.sectionTitle}>Your Account</div>

        <Item title="Leave a Nation">
          Go to the Nations screen via the bottom bar. Tap <span style={S.highlight}>Leave</span> on any Nation. You can always rejoin later with the code.
        </Item>

        <Item title="Sign out">
          Tap your <span style={S.highlight}>avatar</span> in the top right corner to open your profile, then tap <span style={S.highlight}>Sign out</span>.
        </Item>

        <Item title="Delete your account">
          Tap your <span style={S.highlight}>avatar</span> in the top right corner to open your profile, then tap <span style={S.highlight}>Delete account</span>. This permanently removes all your data and cannot be undone.
        </Item>

        <Item title="Enable push notifications">
          Tap your <span style={S.highlight}>avatar</span> in the top right corner to open your profile, then tap <span style={S.highlight}>Enable notifications</span>. Your browser will ask for permission — tap Allow. On iPhone you must add the app to your home screen first (Safari → Share → Add to Home Screen) before notifications will work.
        </Item>

        <Item title="View the Privacy Policy">
          Tap your <span style={S.highlight}>avatar</span> in the top right corner to open your profile. The Privacy Policy link is just above your recommendations.
        </Item>

        <Item title="View the Terms of Service">
          Tap your <span style={S.highlight}>avatar</span> in the top right corner to open your profile. The Terms of Service link is just above your recommendations.
        </Item>

        <div style={S.hr}/>

        <p style={{fontSize:12,color:"#444",fontFamily:"sans-serif"}}>
          © 2026 Recommend Nation ·{" "}
          <Link href="/privacy" style={{color:"#444"}}>Privacy Policy</Link>
          {" · "}
          <Link href="/terms" style={{color:"#444"}}>Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
