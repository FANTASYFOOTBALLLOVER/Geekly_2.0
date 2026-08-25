import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Landing from './pages/Landing';
import SignUp from './pages/SignUp';
import Login from './pages/Login';
import UsernameSetup from './pages/UsernameSetup';
import Home from './pages/Home';
import MockDraft from './pages/MockDraft';
import DraftRoom from './pages/DraftRoom';
import ResetPassword from './pages/ResetPassword';

export default function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'signup' | 'login' | 'username-setup' | 'home' | 'mock-draft' | 'draft-room' | 'reset-password'
  const [profile, setProfile] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [draftLeagueContext, setDraftLeagueContext] = useState(null);

  async function fetchProfile(session) {
    if (!session) return null;
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('username, avatar_bg_color, avatar_style, crest_pattern, crest_color1, crest_color2')
      .eq('id', session.user.id)
      .single();
    return profileRow;
  }

  async function loadProfileAndRouteInitial(session) {
    if (!session) {
      setProfile(null);
      setView('landing');
      return;
    }

    const profileRow = await fetchProfile(session);
    setProfile(profileRow);

    if (!profileRow || !profileRow.username) {
      setView('username-setup');
    } else {
      setView('home');
    }
  }

  useEffect(() => {
    // Capture this immediately, before signup/login/OAuth can redirect to a
    // clean URL and drop the query param. Home.jsx picks this up from
    // localStorage later, however many redirects happen in between.
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (invite) {
      localStorage.setItem('pendingInviteCode', invite);
      params.delete('invite');
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      loadProfileAndRouteInitial(data.session).finally(() => setCheckingSession(false));
    });

    // Background auth events (token refreshes, tab focus changes, etc.) should
    // never yank the user to a different screen mid-session — only handle
    // an actual sign-out here, and otherwise just quietly refresh the profile.
    // The one exception is PASSWORD_RECOVERY: clicking a reset-password link
    // signs the person in and fires this event, and that always needs to
    // send them to the reset screen regardless of whatever view they were on.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') {
        setView('reset-password');
        return;
      }
      if (_event === 'SIGNED_OUT') {
        setProfile(null);
        setView('landing');
        return;
      }
      if (_event === 'SIGNED_IN' && session) {
        fetchProfile(session).then((profileRow) => {
          setProfile(profileRow);
          if (!profileRow || !profileRow.username) {
            setView('username-setup');
          } else {
            setView('home');
          }
        });
        return;
      }
      // Any other event (TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED, etc.)
      // is routine background upkeep, not a real sign-in — never change the
      // current view for these, so switching tabs or sitting idle for a
      // while never yanks someone out of wherever they currently are,
      // mid-draft included.
      if (session) {
        fetchProfile(session).then((profileRow) => setProfile(profileRow));
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setView('landing');
  }

  function handleNavigate(targetView, league) {
    setDraftLeagueContext(league);
    setView(targetView);
  }

  if (checkingSession) {
    return <div className="page">Loading...</div>;
  }

  if (view === 'landing') return <Landing onNavigate={setView} />;
  if (view === 'signup') return <SignUp onNavigate={setView} onSignedUp={() => setView('home')} />;
  if (view === 'login') return <Login onNavigate={setView} onLoggedIn={() => {}} />;
  if (view === 'username-setup') return <UsernameSetup onDone={() => setView('home')} />;
  if (view === 'reset-password') return <ResetPassword onDone={() => setView('home')} />;
  if (view === 'home') return <Home profile={profile} onLogout={handleLogout} onNavigate={handleNavigate} />;
  if (view === 'mock-draft') return <MockDraft key={draftLeagueContext?.league_id} league={draftLeagueContext} profile={profile} onBack={() => setView('home')} />;
  if (view === 'draft-room') return <DraftRoom key={draftLeagueContext?.league_id} league={draftLeagueContext} profile={profile} onBack={() => setView('home')} />;

  return <Landing onNavigate={setView} />;
}