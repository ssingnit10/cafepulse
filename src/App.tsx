import React, { useState, useEffect, useTransition } from 'react';
import { 
  Coffee, 
  Sparkles, 
  Users, 
  Flame, 
  BookOpen, 
  Zap, 
  Clock, 
  RefreshCw, 
  ChevronRight, 
  Sliders, 
  Compass, 
  CheckCircle2, 
  AlertCircle,
  CupSoda,
  Volume2,
  Bot,
  Layers,
  Check,
  X,
  ArrowRight,
  Database,
  Radio,
  Eye,
  MessageSquare
} from 'lucide-react';

interface Recommendation {
  mood_tag: 'focus' | 'social' | 'relaxed' | 'energized';
  drink_recommendation: string;
  reason: string;
}

interface VibeMatch {
  matched_name: string;
  matched_vibe: string;
  conversation_starter: string;
}

interface SessionItem {
  id: number;
  display_name: string;
  vibe_text: string;
  mood_tag: 'focus' | 'social' | 'relaxed' | 'energized';
  drink_rec: string;
  timestamp: string;
}

interface DashboardData {
  counts: {
    focus: number;
    social: number;
    relaxed: number;
    energized: number;
  };
  total: number;
  recent: SessionItem[];
  room_insight: string;
  last_updated: string;
}

interface StaffAlert {
  id: string;
  title: string;
  action_text: string;
  priority: 'normal' | 'urgent' | 'subtle';
  category: 'music' | 'lighting' | 'service' | 'seating' | 'menu';
  created_at: string;
}

interface AgentStep {
  step_number: number;
  type: 'thought' | 'tool_call' | 'tool_result' | 'complete';
  tool?: string;
  title: string;
  detail: string;
  data?: any;
  timestamp: string;
}

const MOOD_CONFIG = {
  focus: {
    label: 'Deep Focus',
    icon: BookOpen,
    accent: '#3B6E8C', // Slate blue
    bgSoft: '#EDF4F8',
    border: '#C3DCE9',
    description: 'Quiet, analytical, deep flow work',
  },
  social: {
    label: 'Social Buzz',
    icon: Users,
    accent: '#B85D36', // Terracotta
    bgSoft: '#FDF1EC',
    border: '#F6D2C3',
    description: 'Catching up, meeting, vibrant banter',
  },
  relaxed: {
    label: 'Gentle Unwind',
    icon: Compass,
    accent: '#5B7C65', // Sage
    bgSoft: '#EEF5F1',
    border: '#C7E0D1',
    description: 'Reading, daydreaming, peaceful breath',
  },
  energized: {
    label: 'High Voltage',
    icon: Zap,
    accent: '#D97706', // Warm amber
    bgSoft: '#FFFBEB',
    border: '#FDE68A',
    description: 'Sprint kickoff, quick revival, brisk tempo',
  },
};

const QUICK_VIBES = [
  { text: "Finishing a project proposal before noon", name: "Deep Work" },
  { text: "Catching up with an old friend over stories", name: "Coffee Date" },
  { text: "Reading a paperback novel in the sun", name: "Slow Reading" },
  { text: "Need a sharp spark to conquer the afternoon", name: "Energy Boost" }
];

export default function App() {
  // Navigation state syncing with URL path
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname.startsWith('/dashboard') ? '/dashboard' : '/';
  });

  // Customer Page State
  const [vibeText, setVibeText] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [vibeMatch, setVibeMatch] = useState<VibeMatch | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<SessionItem[]>([]);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [orderedNotice, setOrderedNotice] = useState(false);

  // Dashboard Page State
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [activeMoodFilter, setActiveMoodFilter] = useState<string>('all');

  // Café Orchestrator Agent State
  const [isRunningAgent, setIsRunningAgent] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [activeStaffAlert, setActiveStaffAlert] = useState<StaffAlert | null>(null);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Handle URL history state
  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname.startsWith('/dashboard') ? '/dashboard' : '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch initial recent check-ins for customer view
  const fetchRecentCheckins = async () => {
    try {
      const res = await fetch('/api/recent-checkins');
      if (res.ok) {
        const data = await res.json();
        setRecentCheckins(data.checkins || []);
      }
    } catch (err) {
      console.error('Failed to load recent checkins:', err);
    }
  };

  // Fetch Dashboard Stats
  const fetchDashboardStats = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setIsRefreshing(true);
    try {
      const res = await fetch('/api/dashboard-stats');
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
        setCountdown(30);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      if (showLoadingSpinner) setIsRefreshing(false);
    }
  };

  // Trigger Gemini Room Insight regeneration
  const refreshRoomInsight = async () => {
    setIsGeneratingInsight(true);
    try {
      const res = await fetch('/api/room-insight', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (dashboardData) {
          setDashboardData({
            ...dashboardData,
            room_insight: data.room_insight
          });
        }
      }
    } catch (err) {
      console.error('Failed to regenerate room insight:', err);
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  // Fetch active staff alert
  const fetchActiveAlert = async () => {
    try {
      const res = await fetch('/api/orchestrator/alert');
      if (res.ok) {
        const data = await res.json();
        if (data.alert) {
          setActiveStaffAlert(data.alert);
        }
      }
    } catch (err) {
      console.error('Failed to load active alert:', err);
    }
  };

  // Run Café Orchestrator Agent
  const handleRunOrchestrator = async () => {
    setIsRunningAgent(true);
    setAgentError(null);
    setShowAgentModal(true);
    setAgentSteps([
      {
        step_number: 1,
        type: 'thought',
        title: 'Spinning Up Café Orchestrator',
        detail: 'Connecting to Gemini model and registering 3 tools: get_room_mood, get_recent_vibes, create_staff_alert...',
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch('/api/orchestrator/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.alert) {
        setAgentSteps(data.steps || []);
        setActiveStaffAlert(data.alert);
      } else {
        throw new Error(data.error || 'Failed to complete orchestration workflow');
      }
    } catch (err: any) {
      console.error('Orchestrator execution error:', err);
      setAgentError(err.message || 'Error executing agent');
    } finally {
      setIsRunningAgent(false);
    }
  };

  // Dismiss Staff Alert
  const handleDismissAlert = async () => {
    try {
      await fetch('/api/orchestrator/alert', { method: 'DELETE' });
      setActiveStaffAlert(null);
    } catch (e) {
      console.error('Failed to dismiss alert:', e);
      setActiveStaffAlert(null);
    }
  };

  // Initial load
  useEffect(() => {
    fetchRecentCheckins();
    fetchDashboardStats();
    fetchActiveAlert();
  }, []);

  // Dashboard 30-second Auto Refresh Timer
  useEffect(() => {
    if (currentPath !== '/dashboard') return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchDashboardStats();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPath]);

  // Handle Customer Form Submit
  const handleVibeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vibeText.trim()) return;

    setIsSubmitting(true);
    setCustomerError(null);
    setOrderedNotice(false);
    setVibeMatch(null);

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vibe_text: vibeText.trim(),
          display_name: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze vibe.');
      }

      setRecommendation(data.recommendation);
      setVibeMatch(data.vibe_match || null);
      if (data.recent) {
        setRecentCheckins(data.recent);
      }
    } catch (err) {
      setCustomerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format relative time helper
  const formatTimeAgo = (isoString: string) => {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
    if (diffSeconds < 60) return 'Just now';
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#2C241E] flex flex-col font-sans">
      {/* Top Café Header */}
      <header className="border-b border-[#EAE3D9] bg-[#FAF7F2]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('/')}>
            <div className="w-10 h-10 rounded-xl bg-[#5B3314] flex items-center justify-center text-[#F4EFE6] shadow-sm">
              <Coffee className="w-5 h-5 text-[#E29D52]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#2C241E]">CaféPulse</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" title="Room live" />
              </div>
              <p className="text-xs text-[#7A6B5F]">Smart Café Atmosphere & Barista Sommelier</p>
            </div>
          </div>

          {/* Navigation Switcher */}
          <nav className="flex items-center gap-1.5 bg-[#EFE9DF] p-1 rounded-xl text-sm font-medium">
            <button
              onClick={() => navigateTo('/')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs sm:text-sm ${
                currentPath === '/'
                  ? 'bg-white text-[#2C241E] shadow-sm font-semibold'
                  : 'text-[#6C5D52] hover:text-[#2C241E]'
              }`}
            >
              <CupSoda className="w-4 h-4 text-[#D97706]" />
              <span>Customer View</span>
            </button>
            <button
              onClick={() => {
                navigateTo('/dashboard');
                fetchDashboardStats(true);
              }}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs sm:text-sm ${
                currentPath === '/dashboard'
                  ? 'bg-white text-[#2C241E] shadow-sm font-semibold'
                  : 'text-[#6C5D52] hover:text-[#2C241E]'
              }`}
            >
              <Sliders className="w-4 h-4 text-[#3B6E8C]" />
              <span>Staff Dashboard</span>
              {currentPath === '/dashboard' && (
                <span className="text-[10px] text-[#8C7A6D] hidden md:inline">({countdown}s)</span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {currentPath === '/' ? (
          /* ================= PAGE 1: CUSTOMER VIEW ================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Vibe Input & Drink Recommendation (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Introduction Banner */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#9C6D38]">
                  <span>Artisanal Atmosphere Engine</span>
                  <span aria-hidden="true">·</span>
                  <span>Powered by Gemini</span>
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl text-[#2C241E] font-bold leading-tight">
                  What’s your vibe today?
                </h1>
                <p className="text-[#6C5D52] text-sm sm:text-base leading-relaxed">
                  Tell our barista sommelier how you’re feeling or what you’re working on in a single sentence. We’ll tune your beverage to match your energy.
                </p>
              </div>

              {/* Vibe Submission Form */}
              <form onSubmit={handleVibeSubmit} className="bg-white rounded-2xl p-6 sm:p-7 border border-[#E8DFD3] shadow-sm space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="vibe-input" className="block text-xs font-semibold uppercase tracking-wider text-[#6C5D52]">
                    Your Current Vibe
                  </label>
                  <textarea
                    id="vibe-input"
                    value={vibeText}
                    onChange={(e) => setVibeText(e.target.value)}
                    placeholder="e.g., Grinding through design sprints and need steady laser focus without jitters..."
                    rows={3}
                    maxLength={300}
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF7F2] border border-[#E2D8CC] text-[#2C241E] placeholder-[#A09387] focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 focus:border-[#D97706] text-base transition-all resize-none"
                    required
                  />
                  <div className="flex justify-between items-center text-xs text-[#8C7A6D]">
                    <span>Single sentence recommended</span>
                    <span>{vibeText.length}/300</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="name-input" className="block text-xs font-semibold uppercase tracking-wider text-[#6C5D52]">
                    Display Name or Table <span className="font-normal text-[#9C8B7F]">(Optional)</span>
                  </label>
                  <input
                    id="name-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Maya, Table 4"
                    maxLength={50}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E2D8CC] text-[#2C241E] placeholder-[#A09387] focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 focus:border-[#D97706] text-sm transition-all"
                  />
                </div>

                {/* Quick Inspiration Clickers */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs text-[#8C7A6D] block">Or try one of these common café rhythms:</span>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_VIBES.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setVibeText(item.text)}
                        className="px-3 py-1.5 text-xs bg-[#F4EFE6] hover:bg-[#EAE2D5] text-[#5B3314] rounded-lg transition-colors border border-[#E2D8CC] text-left"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error Banner */}
                {customerError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{customerError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || !vibeText.trim()}
                  className="w-full py-3.5 px-6 rounded-xl bg-[#5B3314] hover:bg-[#47270F] active:scale-[0.99] text-[#FAF7F2] font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#E29D52]" />
                      <span>Brewing your recommendation...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#E29D52]" />
                      <span>Tune My Vibe & Drink</span>
                    </>
                  )}
                </button>
              </form>

              {/* Recommendation Card */}
              {recommendation && (
                <div className="bg-white rounded-2xl border-2 border-[#E29D52]/40 p-6 sm:p-7 shadow-lg space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between pb-3 border-b border-[#EFE8DD]">
                    <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#8C7A6D]">
                      <span>Barista Match Found</span>
                      <span aria-hidden="true">·</span>
                      <span>Ready to sip</span>
                    </div>

                    {/* Mood tag badge without pill slop */}
                    {(() => {
                      const cfg = MOOD_CONFIG[recommendation.mood_tag] || MOOD_CONFIG.relaxed;
                      const Icon = cfg.icon;
                      return (
                        <div 
                          className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider"
                          style={{ backgroundColor: cfg.bgSoft, color: cfg.accent }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{cfg.label}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Drink Recommendation Title */}
                  <div className="space-y-1">
                    <span className="text-xs uppercase tracking-wider font-semibold text-[#B85D36]">Recommended Pour</span>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#2C241E] flex items-center gap-2">
                      <Coffee className="w-6 h-6 text-[#D97706] shrink-0" />
                      <span>{recommendation.drink_recommendation}</span>
                    </h2>
                  </div>

                  {/* Sommelier Reason */}
                  <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#EAE3D9] text-[#55463B] text-sm sm:text-base leading-relaxed italic">
                    "{recommendation.reason}"
                  </div>

                  {/* Action Bar */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                      onClick={() => setOrderedNotice(true)}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Order This at the Counter</span>
                    </button>
                    <span className="text-xs text-[#8C7A6D]">
                      Your vibe has been anonymously added to the café pulse.
                    </span>
                  </div>

                  {orderedNotice && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Order placed in mind! Show this card to the barista at the counter.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Vibe Match Card: Only shown if other check-ins exist and a compatible match is found */}
              {vibeMatch && vibeMatch.matched_name && (
                <div className="bg-white rounded-2xl border border-amber-300/80 p-6 sm:p-7 shadow-md space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between pb-2 border-b border-amber-100/80">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                      <span className="text-base leading-none">✨</span>
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Vibe Match</span>
                    </div>
                    {vibeMatch.matched_vibe && (
                      <span className="text-[11px] font-semibold text-amber-800 bg-amber-100/70 px-2.5 py-0.5 rounded uppercase tracking-wider">
                        {vibeMatch.matched_vibe}
                      </span>
                    )}
                  </div>

                  <p className="text-sm sm:text-base text-[#2C241E] leading-relaxed">
                    <span className="font-bold text-[#1F1712]">{vibeMatch.matched_name}</span> is also here — {vibeMatch.conversation_starter}
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Others in the Café Right Now (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-2xl p-6 border border-[#E8DFD3] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#EFE8DD] pb-3">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-[#2C241E]">Others in the café right now</h2>
                    <p className="text-xs text-[#7A6B5F]">Recent check-ins from the last 30 minutes</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[#FAF7F2] border border-[#E2D8CC] flex items-center justify-center text-[#5B3314]">
                    <Users className="w-4 h-4" />
                  </div>
                </div>

                {/* List of recent check-ins */}
                <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                  {recentCheckins.length === 0 ? (
                    <div className="text-center py-8 text-[#8C7A6D] text-sm">
                      <Coffee className="w-8 h-8 mx-auto mb-2 text-[#C2B5A5] stroke-1" />
                      <span>The room is peaceful. Be the first to set the vibe!</span>
                    </div>
                  ) : (
                    recentCheckins.map((session) => {
                      const cfg = MOOD_CONFIG[session.mood_tag] || MOOD_CONFIG.relaxed;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={session.id}
                          className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#EAE3D9] hover:border-[#D5C7B5] transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm text-[#2C241E]">
                              {session.display_name || 'Anonymous Patron'}
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                                style={{ backgroundColor: cfg.bgSoft, color: cfg.accent }}
                              >
                                <Icon className="w-3 h-3" />
                                {session.mood_tag}
                              </span>
                              <span className="text-xs text-[#8C7A6D]">
                                {formatTimeAgo(session.timestamp)}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-[#55463B] leading-snug italic">
                            "{session.vibe_text}"
                          </p>

                          <div className="flex items-center gap-1.5 text-xs text-[#7A6B5F] pt-1 border-t border-[#EAE3D9]/60">
                            <Coffee className="w-3 h-3 text-[#D97706] shrink-0" />
                            <span className="truncate">Sipping: <strong className="font-medium text-[#2C241E]">{session.drink_rec}</strong></span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 text-center border-t border-[#EFE8DD]">
                  <button
                    onClick={() => navigateTo('/dashboard')}
                    className="text-xs font-semibold text-[#B85D36] hover:text-[#8C3E1E] flex items-center justify-center gap-1 mx-auto transition-colors"
                  >
                    <span>View Live Atmospheric Staff Dashboard</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ================= PAGE 2: STAFF DASHBOARD ================= */
          <div className="space-y-8">
            {/* Dashboard Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE3D9] pb-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-[#3B6E8C]">
                  <span>Room Operations Console</span>
                  <span aria-hidden="true">·</span>
                  <span>Auto-syncs every 30s</span>
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl text-[#2C241E] font-bold">
                  Staff Atmospheric Dashboard
                </h1>
                <p className="text-sm text-[#6C5D52]">
                  Real-time mood telemetry, room vibe gauge, and Gemini-generated acoustic & operational insights.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-[#FAF7F2] rounded-xl border border-[#E2D8CC] text-xs text-[#6C5D52]">
                  <Clock className="w-3.5 h-3.5 text-[#D97706]" />
                  <span>Refreshing in <strong className="text-[#2C241E]">{countdown}s</strong></span>
                </div>
                <button
                  onClick={() => fetchDashboardStats(true)}
                  disabled={isRefreshing}
                  className="px-3.5 py-2 bg-white hover:bg-[#FAF7F2] text-[#2C241E] border border-[#E2D8CC] rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#D97706]' : ''}`} />
                  <span>Refresh Now</span>
                </button>
                <button
                  onClick={handleRunOrchestrator}
                  disabled={isRunningAgent}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 via-amber-700 to-[#5B3314] hover:from-amber-700 hover:to-[#43230A] text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs hover:shadow transition-all disabled:opacity-60 cursor-pointer"
                >
                  <Bot className={`w-4 h-4 text-amber-200 ${isRunningAgent ? 'animate-bounce' : ''}`} />
                  <span>{isRunningAgent ? 'Running Agent...' : 'Café Orchestrator Agent'}</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </button>
              </div>
            </div>

            {/* Orchestrator Action Card with Amber Border */}
            {activeStaffAlert ? (
              <div className="bg-gradient-to-br from-amber-50/90 via-[#FAF7F2] to-amber-100/40 rounded-2xl p-6 sm:p-7 border-2 border-amber-500 shadow-sm space-y-4 relative overflow-hidden transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                      <Sparkles className="w-5 h-5 text-amber-100" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-200/80 text-amber-950 border border-amber-300">
                          Active Action Card
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white text-[#5B3314] border border-[#E2D8CC]">
                          Category: {activeStaffAlert.category}
                        </span>
                        {activeStaffAlert.priority === 'urgent' && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                            Urgent Priority
                          </span>
                        )}
                      </div>
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-[#2C241E] mt-1">
                        {activeStaffAlert.title}
                      </h2>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                    <button
                      onClick={() => setShowAgentModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] border border-amber-300 text-xs font-semibold text-[#5B3314] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reasoning Steps ({agentSteps.length})</span>
                    </button>
                    <button
                      onClick={handleRunOrchestrator}
                      disabled={isRunningAgent}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAF7F2] border border-amber-300 text-xs font-semibold text-[#5B3314] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRunningAgent ? 'animate-spin text-amber-600' : ''}`} />
                      <span>Re-run</span>
                    </button>
                    <button
                      onClick={handleDismissAlert}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Done</span>
                    </button>
                  </div>
                </div>

                {/* 2-Sentence Action Directive */}
                <div className="bg-white/95 rounded-xl p-5 border border-amber-200/90 shadow-2xs">
                  <p className="text-base sm:text-lg text-[#2C241E] font-serif leading-relaxed">
                    "{activeStaffAlert.action_text}"
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-[#7A6B5F] pt-0.5">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-amber-600" />
                    <span>Orchestrated by Gemini Agent using tool <code className="bg-white px-1.5 py-0.5 rounded text-[11px] text-amber-800 border border-amber-200 font-mono">create_staff_alert</code></span>
                  </div>
                  <span>Issued: {new Date(activeStaffAlert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              </div>
            ) : (
              <div className="bg-[#FAF7F2] rounded-2xl p-5 border border-[#EAE3D9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100/90 text-amber-800 border border-amber-300/70 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[#2C241E]">Café Orchestrator Agent Standing By</h3>
                    <p className="text-xs text-[#7A6B5F]">
                      Autonomous multi-tool agent assesses room mood telemetry, reads individual patron vibes, and generates high-impact operational directives.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRunOrchestrator}
                  disabled={isRunningAgent}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 to-[#5B3314] hover:from-amber-700 hover:to-[#43230A] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all shrink-0 cursor-pointer"
                >
                  <Bot className={`w-3.5 h-3.5 text-amber-200 ${isRunningAgent ? 'animate-bounce' : ''}`} />
                  <span>Run Orchestrator Agent</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </button>
              </div>
            )}

            {/* Section 1: Live Room Stats (Count by mood_tag) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(['focus', 'social', 'relaxed', 'energized'] as const).map((moodKey) => {
                const cfg = MOOD_CONFIG[moodKey];
                const Icon = cfg.icon;
                const count = dashboardData?.counts?.[moodKey] ?? 0;
                const total = dashboardData?.total || 1;
                const pct = Math.round((count / (total > 0 ? total : 1)) * 100);

                return (
                  <div
                    key={moodKey}
                    className="bg-white rounded-2xl p-5 border border-[#E8DFD3] shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: cfg.bgSoft, color: cfg.accent }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-[#8C7A6D]">{pct}% of room</span>
                    </div>

                    <div>
                      <div className="text-3xl font-serif font-bold text-[#2C241E]">{count}</div>
                      <div className="font-semibold text-sm text-[#2C241E]">{cfg.label}</div>
                      <p className="text-xs text-[#7A6B5F] mt-0.5 line-clamp-1">{cfg.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Section 2: Visual Vibe Gauge (Meter) */}
            <div className="bg-white rounded-2xl p-6 border border-[#E8DFD3] shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#2C241E]">Atmospheric Room Gauge</h2>
                  <p className="text-xs text-[#7A6B5F]">Live mood composition based on current patron check-ins</p>
                </div>
                <div className="text-xs font-semibold text-[#5B3314]">
                  Total Patrons Checked In: <strong className="text-base font-bold">{dashboardData?.total || 0}</strong>
                </div>
              </div>

              {/* Segmented Progress Gauge */}
              <div className="space-y-2">
                <div className="w-full h-5 rounded-full bg-[#EAE3D9] overflow-hidden flex shadow-inner">
                  {(['focus', 'social', 'relaxed', 'energized'] as const).map((mKey) => {
                    const count = dashboardData?.counts?.[mKey] || 0;
                    const total = dashboardData?.total || 1;
                    const widthPct = (count / (total > 0 ? total : 1)) * 100;
                    const cfg = MOOD_CONFIG[mKey];

                    if (widthPct === 0) return null;

                    return (
                      <div
                        key={mKey}
                        style={{ width: `${widthPct}%`, backgroundColor: cfg.accent }}
                        className="h-full transition-all duration-500 hover:opacity-90 relative group"
                        title={`${cfg.label}: ${count} (${Math.round(widthPct)}%)`}
                      />
                    );
                  })}
                </div>

                {/* Gauge Legend */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                  {(['focus', 'social', 'relaxed', 'energized'] as const).map((mKey) => {
                    const cfg = MOOD_CONFIG[mKey];
                    const count = dashboardData?.counts?.[mKey] || 0;
                    return (
                      <div key={mKey} className="flex items-center gap-2 text-[#55463B]">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cfg.accent }} />
                        <span className="font-medium">{cfg.label}:</span>
                        <strong className="text-[#2C241E]">{count}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Section 3: Gemini Room Insight (2-Sentence AI Staff Recommendation) */}
            <div className="bg-[#FAF7F2] rounded-2xl p-6 sm:p-7 border-2 border-[#D97706]/30 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#5B3314] text-[#E29D52] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-serif text-lg sm:text-xl font-bold text-[#2C241E]">
                      Gemini Room Atmosphere Insight
                    </h2>
                    <span className="text-xs text-[#7A6B5F]">2-Sentence Real-time Barista & Room Directive</span>
                  </div>
                </div>

                <button
                  onClick={refreshRoomInsight}
                  disabled={isGeneratingInsight}
                  className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#F4EFE6] border border-[#E2D8CC] text-xs font-semibold text-[#5B3314] flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingInsight ? 'animate-spin' : ''}`} />
                  <span>Regenerate Insight</span>
                </button>
              </div>

              <div className="bg-white p-5 rounded-xl border border-[#EAE3D9] text-[#2C241E] text-base sm:text-lg leading-relaxed font-serif shadow-sm">
                "{dashboardData?.room_insight || 'High focus energy today. Consider keeping music low and maintaining steady pour-over flow.'}"
              </div>

              <div className="flex items-center gap-2 text-xs text-[#8C7A6D]">
                <Volume2 className="w-3.5 h-3.5 text-[#D97706]" />
                <span>Barista Tip: Tune background audio volume, ambient lighting, and counter recommendations according to the insight above.</span>
              </div>
            </div>

            {/* Section 4: Recent Check-Ins Table */}
            <div className="bg-white rounded-2xl p-6 border border-[#E8DFD3] shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EFE8DD] pb-4">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#2C241E]">Recent Check-Ins Table</h2>
                  <p className="text-xs text-[#7A6B5F]">Every patron check-in stored in the Cloud SQL database</p>
                </div>

                {/* Mood Tag Filter */}
                <div className="flex items-center gap-1 bg-[#FAF7F2] p-1 rounded-xl border border-[#E2D8CC] text-xs">
                  <button
                    onClick={() => setActiveMoodFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      activeMoodFilter === 'all' ? 'bg-white shadow-xs font-bold text-[#2C241E]' : 'text-[#6C5D52] hover:text-[#2C241E]'
                    }`}
                  >
                    All ({dashboardData?.recent.length || 0})
                  </button>
                  {(['focus', 'social', 'relaxed', 'energized'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setActiveMoodFilter(m)}
                      className={`px-2.5 py-1 rounded-lg font-medium capitalize transition-colors ${
                        activeMoodFilter === m ? 'bg-white shadow-xs font-bold text-[#2C241E]' : 'text-[#6C5D52] hover:text-[#2C241E]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#EAE3D9] text-xs uppercase tracking-wider text-[#7A6B5F] bg-[#FAF7F2]/60">
                      <th className="py-3 px-4 font-semibold">Time</th>
                      <th className="py-3 px-4 font-semibold">Patron</th>
                      <th className="py-3 px-4 font-semibold">Mood Tag</th>
                      <th className="py-3 px-4 font-semibold">What's their vibe?</th>
                      <th className="py-3 px-4 font-semibold">Recommended Drink</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE8DD]">
                    {(() => {
                      const list = (dashboardData?.recent || []).filter((item) => {
                        if (activeMoodFilter === 'all') return true;
                        return item.mood_tag === activeMoodFilter;
                      });

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-[#8C7A6D] text-sm">
                              No check-ins found for this filter.
                            </td>
                          </tr>
                        );
                      }

                      return list.map((session) => {
                        const cfg = MOOD_CONFIG[session.mood_tag] || MOOD_CONFIG.relaxed;
                        const Icon = cfg.icon;
                        return (
                          <tr key={session.id} className="hover:bg-[#FAF7F2]/80 transition-colors">
                            <td className="py-3.5 px-4 whitespace-nowrap text-xs text-[#8C7A6D]">
                              {formatTimeAgo(session.timestamp)}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-[#2C241E] whitespace-nowrap">
                              {session.display_name || 'Anonymous Patron'}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded"
                                style={{ backgroundColor: cfg.bgSoft, color: cfg.accent }}
                              >
                                <Icon className="w-3 h-3" />
                                {session.mood_tag}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-[#55463B] max-w-xs truncate" title={session.vibe_text}>
                              "{session.vibe_text}"
                            </td>
                            <td className="py-3.5 px-4 text-[#2C241E] font-medium whitespace-nowrap">
                              {session.drink_rec}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EAE3D9] bg-[#FAF7F2] py-6 text-xs text-[#8C7A6D]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Coffee className="w-4 h-4 text-[#D97706]" />
            <span className="font-serif font-bold text-[#2C241E]">CaféPulse</span>
            <span>·</span>
            <span>Smart Café Companion</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Powered by Gemini & PostgreSQL Cloud SQL</span>
            <span>·</span>
            <button
              onClick={() => navigateTo(currentPath === '/' ? '/dashboard' : '/')}
              className="hover:text-[#2C241E] underline font-medium"
            >
              Switch to {currentPath === '/' ? 'Staff Dashboard' : 'Customer View'}
            </button>
          </div>
        </div>
      </footer>

      {/* Café Orchestrator Agent Reasoning Steps Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 bg-[#2C241E]/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-[#E8DFD3] overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-[#FAF7F2] to-amber-50/70 border-b border-[#EAE3D9] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-[#5B3314] text-white flex items-center justify-center shadow-xs">
                  <Bot className="w-5 h-5 text-amber-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-bold text-[#2C241E]">
                      Café Orchestrator Agent
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                      Gemini 3 Tools
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B5F] mt-0.5">
                    Multi-turn loop: <code className="font-mono text-amber-800">get_room_mood</code> → <code className="font-mono text-amber-800">get_recent_vibes</code> → <code className="font-mono text-amber-800">create_staff_alert</code>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAgentModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/80 border border-transparent hover:border-[#E2D8CC] flex items-center justify-center text-[#7A6B5F] hover:text-[#2C241E] transition-all cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Progress Bar when running */}
            {isRunningAgent && (
              <div className="bg-amber-50 px-5 py-3 border-b border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
                  <span className="font-semibold">Agent reasoning & tool calls in progress...</span>
                </div>
                <span className="text-[11px] text-amber-700">Evaluating physical floor acoustics</span>
              </div>
            )}

            {/* Error Banner if any */}
            {agentError && (
              <div className="bg-rose-50 px-5 py-3 border-b border-rose-200 flex items-center gap-2 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{agentError}</span>
              </div>
            )}

            {/* Steps Timeline Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 bg-[#FAF7F2]/40">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#7A6B5F] mb-1">
                Agent Execution Trace ({agentSteps.length} steps recorded)
              </div>

              {agentSteps.length === 0 ? (
                <div className="text-center py-10 text-[#8C7A6D] text-xs">
                  <Bot className="w-8 h-8 mx-auto mb-2 text-[#C2B5A5]" />
                  <span>No execution trace yet. Click "Run Agent" to start.</span>
                </div>
              ) : (
                agentSteps.map((step) => {
                  const isTool = step.type === 'tool_call';
                  const isResult = step.type === 'tool_result';
                  const isThought = step.type === 'thought';
                  const isComplete = step.type === 'complete';

                  return (
                    <div
                      key={step.step_number}
                      className="p-4 rounded-xl bg-white border border-[#EAE3D9] shadow-2xs space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-[#EAE3D9] text-[#55463B] text-[11px] font-bold flex items-center justify-center">
                            {step.step_number}
                          </span>

                          {isTool && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              <Radio className="w-2.5 h-2.5" />
                              Tool Call: {step.tool}
                            </span>
                          )}

                          {isResult && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Tool Result: {step.tool}
                            </span>
                          )}

                          {isThought && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                              Gemini Reasoning
                            </span>
                          )}

                          {isComplete && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-300">
                              <Check className="w-2.5 h-2.5" />
                              Completed
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-[#8C7A6D]">
                          {new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <h4 className="font-semibold text-sm text-[#2C241E]">
                        {step.title}
                      </h4>

                      <p className="text-xs text-[#55463B] leading-relaxed">
                        {step.detail}
                      </p>

                      {/* Optional Data Snapshot */}
                      {step.data && (
                        <div className="mt-2 p-2.5 rounded-lg bg-[#FAF7F2] border border-[#E8DFD3] text-[11px] font-mono text-[#5B3314] overflow-x-auto max-h-32">
                          <pre className="whitespace-pre-wrap">{typeof step.data === 'string' ? step.data : JSON.stringify(step.data, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-white border-t border-[#EAE3D9] flex items-center justify-between gap-3">
              <button
                onClick={handleRunOrchestrator}
                disabled={isRunningAgent}
                className="px-4 py-2 bg-white hover:bg-[#FAF7F2] border border-[#E2D8CC] rounded-xl text-xs font-semibold text-[#5B3314] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningAgent ? 'animate-spin' : ''}`} />
                <span>Re-run Agent</span>
              </button>

              <button
                onClick={() => setShowAgentModal(false)}
                className="px-5 py-2 bg-[#5B3314] hover:bg-[#43230A] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <span>Close & View Action Card</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
