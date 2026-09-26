import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { initDb, insertSession, getRecentSessions, getAllRecentForDashboard } from './src/server/db.ts';
import { analyzeVibe, generateRoomInsight, findVibeMatch, VibeMatchResult, runOrchestratorAgent, StaffAlert } from './src/server/gemini.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 1. Top-Level Request Deserialization (Ordering Guarantee)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 2. Secure Transport & Protection Headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Zod validation schemas
const CheckinSchema = z.object({
  vibe_text: z.string().min(1).max(300),
  display_name: z.string().max(50).optional().default('Anonymous Patron'),
});

// Cache for room insight so dashboard doesn't re-query Gemini on every single 30s poll unless needed
let cachedRoomInsight = {
  insight: 'High focus and peaceful morning energy throughout the café. Consider keeping acoustic music warm and gentle.',
  lastUpdated: 0,
};

// Current active Staff Alert produced by the Café Orchestrator Agent
let currentStaffAlert: StaffAlert | null = null;

// ================= API ENDPOINTS =================

/**
 * POST /api/checkin
 * Input: { vibe_text: string, display_name?: string }
 * Output: { session: SessionRecord, recommendation: { mood_tag, drink_recommendation, reason }, vibe_match: VibeMatchResult | null, recent: SessionRecord[] }
 */
app.post('/api/checkin', async (req: Request, res: Response) => {
  try {
    const rawBody = (req.body && typeof req.body === 'object') ? req.body : {};
    const parseResult = CheckinSchema.safeParse(rawBody);

    if (!parseResult.success) {
      console.warn('[Validation] Invalid check-in request:', parseResult.error.issues);
      return res.status(400).json({ error: 'Please share your vibe in a sentence (under 300 characters).' });
    }

    const { vibe_text, display_name } = parseResult.data;

    // 1. Analyze vibe with Gemini Resilient Fallback Ladder
    const vibeAnalysis = await analyzeVibe(vibe_text);

    // 2. Persist to Cloud SQL / Database
    const savedSession = await insertSession(
      display_name || 'Anonymous Patron',
      vibe_text,
      vibeAnalysis.mood_tag,
      vibeAnalysis.drink_recommendation
    );

    // Invalidate cached room insight so the dashboard reflects the new entry
    cachedRoomInsight.lastUpdated = 0;

    // 3. Get recent patrons from last 30 minutes
    const recentCheckins = await getRecentSessions(30);

    // 4. Vibe Match: find single most compatible person from recent check-ins excluding the current user
    const otherRecent = recentCheckins.filter(s => s.id !== savedSession.id);
    let vibeMatch: VibeMatchResult | null = null;
    if (otherRecent.length > 0) {
      try {
        vibeMatch = await findVibeMatch(vibe_text, vibeAnalysis.mood_tag, otherRecent);
      } catch (matchErr) {
        console.warn('[VibeMatch] Error finding vibe match:', matchErr);
        vibeMatch = null;
      }
    }

    return res.status(200).json({
      success: true,
      recommendation: {
        mood_tag: vibeAnalysis.mood_tag,
        drink_recommendation: vibeAnalysis.drink_recommendation,
        reason: vibeAnalysis.reason,
      },
      vibe_match: vibeMatch,
      session: savedSession,
      recent: recentCheckins,
    });
  } catch (err) {
    console.error(JSON.stringify({
      route: '/api/checkin',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Failed to process your vibe check-in. Please try again.' });
  }
});

/**
 * POST /api/vibe-match
 * Allows finding or refreshing a vibe match for a given vibe and mood
 */
app.post('/api/vibe-match', async (req: Request, res: Response) => {
  try {
    const rawBody = (req.body && typeof req.body === 'object') ? req.body : {};
    const vibe_text = typeof rawBody.vibe_text === 'string' ? rawBody.vibe_text.slice(0, 300) : '';
    const mood_tag = typeof rawBody.mood_tag === 'string' ? rawBody.mood_tag.slice(0, 30) : 'relaxed';
    const exclude_id = typeof rawBody.exclude_id === 'number' ? rawBody.exclude_id : undefined;

    if (!vibe_text) {
      return res.status(400).json({ error: 'vibe_text is required' });
    }

    const recentCheckins = await getRecentSessions(30);
    const others = recentCheckins.filter(s => s.id !== exclude_id);

    if (others.length === 0) {
      return res.json({ vibe_match: null });
    }

    const vibeMatch = await findVibeMatch(vibe_text, mood_tag, others);
    return res.json({ vibe_match: vibeMatch });
  } catch (err) {
    console.error('[API] /api/vibe-match error:', err);
    return res.status(500).json({ error: 'Failed to find vibe match.' });
  }
});

/**
 * GET /api/recent-checkins
 * Output: { checkins: SessionRecord[] }
 */
app.get('/api/recent-checkins', async (_req: Request, res: Response) => {
  try {
    const checkins = await getRecentSessions(30);
    return res.json({ checkins });
  } catch (err) {
    console.error('[API] /api/recent-checkins error:', err);
    return res.status(500).json({ error: 'An error occurred fetching recent check-ins.' });
  }
});

/**
 * GET /api/dashboard-stats
 * Output: Live room stats, mood counts, vibe gauge, recent check-ins table, and Gemini 2-sentence room insight
 */
app.get('/api/dashboard-stats', async (_req: Request, res: Response) => {
  try {
    const { counts, total, recent } = await getAllRecentForDashboard();

    // Check if we need to regenerate the Gemini 2-sentence room insight
    const now = Date.now();
    const shouldRefreshInsight = (now - cachedRoomInsight.lastUpdated > 45000) || cachedRoomInsight.lastUpdated === 0;

    if (shouldRefreshInsight && recent.length > 0) {
      try {
        const insight = await generateRoomInsight(recent);
        cachedRoomInsight = {
          insight,
          lastUpdated: now,
        };
      } catch (geminiErr) {
        console.error('[Dashboard] Error generating room insight:', geminiErr);
      }
    }

    return res.json({
      counts,
      total,
      recent,
      room_insight: cachedRoomInsight.insight,
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API] /api/dashboard-stats error:', err);
    return res.status(500).json({ error: 'An error occurred fetching dashboard statistics.' });
  }
});

/**
 * POST /api/room-insight
 * Manually force regeneration of Gemini 2-sentence room insight
 */
app.post('/api/room-insight', async (_req: Request, res: Response) => {
  try {
    const { recent } = await getAllRecentForDashboard();
    const insight = await generateRoomInsight(recent);
    cachedRoomInsight = {
      insight,
      lastUpdated: Date.now(),
    };
    return res.json({ room_insight: insight });
  } catch (err) {
    console.error('[API] /api/room-insight error:', err);
    return res.status(500).json({ error: 'Failed to generate room insight.' });
  }
});

/**
 * POST /api/orchestrator/run
 * Runs the Café Orchestrator Agent with 3 tools:
 * 1. get_room_mood
 * 2. get_recent_vibes
 * 3. create_staff_alert
 */
app.post('/api/orchestrator/run', async (_req: Request, res: Response) => {
  try {
    const result = await runOrchestratorAgent(
      // Tool 1: get_room_mood implementation
      async () => {
        const stats = await getAllRecentForDashboard();
        return {
          ...stats.counts,
          total: stats.total,
        };
      },
      // Tool 2: get_recent_vibes implementation
      async (limit: number) => {
        const checkins = await getRecentSessions(limit || 10);
        return checkins.map(c => ({
          id: c.id,
          display_name: c.display_name,
          mood_tag: c.mood_tag,
          vibe_text: c.vibe_text,
          timestamp: c.timestamp,
        }));
      }
    );

    // Save active alert
    if (result.alert) {
      currentStaffAlert = result.alert;
    }

    return res.json({
      success: true,
      steps: result.steps,
      alert: result.alert,
      summary: result.summary,
    });
  } catch (err) {
    console.error(JSON.stringify({
      route: '/api/orchestrator/run',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    return res.status(500).json({ error: 'Orchestrator Agent execution encountered an error.' });
  }
});

/**
 * GET /api/orchestrator/alert
 * Returns the currently active staff alert card
 */
app.get('/api/orchestrator/alert', (_req: Request, res: Response) => {
  return res.json({ alert: currentStaffAlert });
});

/**
 * DELETE /api/orchestrator/alert
 * Dismisses or marks the current active staff alert as completed
 */
app.delete('/api/orchestrator/alert', (_req: Request, res: Response) => {
  currentStaffAlert = null;
  return res.json({ success: true });
});

// ================= FRONTEND MOUNTING =================


async function startServer() {
  await initDb();

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Vite Dev Server Middleware mounting
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CaféPulse] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[CaféPulse] Fatal server startup error:', err);
  process.exit(1);
});
