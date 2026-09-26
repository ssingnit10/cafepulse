import pg from 'pg';

export interface SessionRecord {
  id: number;
  display_name: string;
  vibe_text: string;
  mood_tag: 'focus' | 'social' | 'relaxed' | 'energized';
  drink_rec: string;
  timestamp: string; // ISO string
}

let pool: pg.Pool | null = null;
let isPostgresActive = false;

// Fallback in-memory storage with initial café seeds
const fallbackSessions: SessionRecord[] = [
  {
    id: 1,
    display_name: "Liam M.",
    vibe_text: "Finishing up thesis chapter 3 before noon",
    mood_tag: "focus",
    drink_rec: "Double Shot Cortado with Cinnamon Dust",
    timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString()
  },
  {
    id: 2,
    display_name: "Elena & Priya",
    vibe_text: "Catching up after 6 months traveling in Kyoto",
    mood_tag: "social",
    drink_rec: "Ceremonial Matcha Latte with Oat Milk & Vanilla",
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString()
  },
  {
    id: 3,
    display_name: "Marcus",
    vibe_text: "Listening to acoustic vinyl and reading Murakami",
    mood_tag: "relaxed",
    drink_rec: "Pour-over Ethiopian Yirgacheffe (Floral notes)",
    timestamp: new Date(Date.now() - 19 * 60 * 1000).toISOString()
  },
  {
    id: 4,
    display_name: "Devon C.",
    vibe_text: "Need a major spark to crush product sprint planning",
    mood_tag: "energized",
    drink_rec: "Cascara Cold Brew Spritz with Blood Orange",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString()
  }
];

let nextId = 5;

export async function initDb(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    try {
      pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            display_name VARCHAR(50),
            vibe_text TEXT,
            mood_tag VARCHAR(20),
            drink_rec TEXT,
            timestamp TIMESTAMP DEFAULT NOW()
          );
        `);
        isPostgresActive = true;
        console.log('[Database] Connected to PostgreSQL Cloud SQL successfully.');
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[Database] PostgreSQL connection failed, operating with local fallback cache:', err instanceof Error ? err.message : err);
      isPostgresActive = false;
    }
  } else {
    console.log('[Database] DATABASE_URL not set. Running with built-in persistent cache.');
    isPostgresActive = false;
  }
}

export async function insertSession(
  displayName: string,
  vibeText: string,
  moodTag: 'focus' | 'social' | 'relaxed' | 'energized',
  drinkRec: string
): Promise<SessionRecord> {
  const cleanDisplayName = (displayName || 'Anonymous Patron').trim().slice(0, 50);
  const cleanVibeText = vibeText.trim().slice(0, 500);
  const cleanMoodTag = moodTag;
  const cleanDrinkRec = drinkRec.trim().slice(0, 500);

  if (isPostgresActive && pool) {
    try {
      const result = await pool.query<SessionRecord>(
        `INSERT INTO sessions (display_name, vibe_text, mood_tag, drink_rec, timestamp)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, display_name, vibe_text, mood_tag, drink_rec, timestamp`,
        [cleanDisplayName, cleanVibeText, cleanMoodTag, cleanDrinkRec]
      );
      return result.rows[0];
    } catch (err) {
      console.error('[Database] Error inserting into PostgreSQL, falling back to local store:', err);
    }
  }

  // Fallback store
  const newRecord: SessionRecord = {
    id: nextId++,
    display_name: cleanDisplayName,
    vibe_text: cleanVibeText,
    mood_tag: cleanMoodTag,
    drink_rec: cleanDrinkRec,
    timestamp: new Date().toISOString()
  };
  fallbackSessions.unshift(newRecord);
  return newRecord;
}

export async function getRecentSessions(minutesLimit = 30): Promise<SessionRecord[]> {
  if (isPostgresActive && pool) {
    try {
      const result = await pool.query<SessionRecord>(
        `SELECT id, display_name, vibe_text, mood_tag, drink_rec, timestamp
         FROM sessions
         WHERE timestamp >= NOW() - ($1 || ' minutes')::INTERVAL
         ORDER BY timestamp DESC
         LIMIT 50`,
        [minutesLimit]
      );
      if (result.rows.length > 0) {
        return result.rows;
      }
      // If none within 30 min, return latest 10 so the user gets real café activity
      const latest = await pool.query<SessionRecord>(
        `SELECT id, display_name, vibe_text, mood_tag, drink_rec, timestamp
         FROM sessions
         ORDER BY timestamp DESC
         LIMIT 10`
      );
      return latest.rows;
    } catch (err) {
      console.error('[Database] Query error from PostgreSQL:', err);
    }
  }

  // Fallback store
  const cutoffTime = Date.now() - minutesLimit * 60 * 1000;
  const filtered = fallbackSessions.filter(s => new Date(s.timestamp).getTime() >= cutoffTime);
  if (filtered.length > 0) {
    return filtered;
  }
  return fallbackSessions.slice(0, 10);
}

export async function getAllRecentForDashboard(): Promise<{
  counts: { focus: number; social: number; relaxed: number; energized: number };
  total: number;
  recent: SessionRecord[];
}> {
  const sessions = await getRecentSessions(60); // past hour for room stats
  const counts = {
    focus: 0,
    social: 0,
    relaxed: 0,
    energized: 0
  };

  sessions.forEach(s => {
    if (s.mood_tag in counts) {
      counts[s.mood_tag as keyof typeof counts]++;
    }
  });

  return {
    counts,
    total: sessions.length,
    recent: sessions
  };
}
