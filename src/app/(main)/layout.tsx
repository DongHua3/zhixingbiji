import Sidebar from "@/components/layout/Sidebar";
import { getCachedAuthUser, getCachedUserProfile } from "@/lib/supabase/queries";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get logged-in user from request cache
  const {
    data: { user },
  } = await getCachedAuthUser();
  
  let fontStyle = {};
  let themeClass = '';

  if (user) {
    // Fetch preferences from request cache
    const { data: profile } = await getCachedUserProfile(user.id);

    if (profile && profile.preferences) {
      const prefs = profile.preferences as Record<string, string | undefined>;
      
      // Determine font-family
      if (prefs.font_family === 'heading') {
        fontStyle = { fontFamily: "var(--font-heading), 'Space Grotesk', sans-serif" };
      } else if (prefs.font_family === 'mono') {
        fontStyle = { fontFamily: "monospace, 'JetBrains Mono', Courier New" };
      } else {
        fontStyle = { fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" };
      }

      // Determine theme
      if (prefs.theme === 'dark') {
        themeClass = 'dark';
      }
    }
  }

  return (
    <div className={`app-container ${themeClass}`} style={fontStyle}>
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
