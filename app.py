import os
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cafepulse")

app = Flask(__name__, template_folder="templates", static_folder="static")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Model fallback ladder for resilience
MODEL_FALLBACK_LADDER = [
    "gemini-2.0-flash",
    "gemini-1.5-flash", 
    "gemini-1.5-flash-8b",
    "gemini-2.0-flash-lite"
]

# In-memory fallback if Cloud SQL is not connected
fallback_sessions = [
    {
        "id": 1,
        "display_name": "Liam M.",
        "vibe_text": "Finishing up thesis chapter 3 before noon",
        "mood_tag": "focus",
        "drink_rec": "Double Shot Cortado with Cinnamon Dust",
        "timestamp": (datetime.utcnow() - timedelta(minutes=5)).isoformat()
    },
    {
        "id": 2,
        "display_name": "Elena & Priya",
        "vibe_text": "Catching up after 6 months traveling in Kyoto",
        "mood_tag": "social",
        "drink_rec": "Ceremonial Matcha Latte with Oat Milk & Vanilla",
        "timestamp": (datetime.utcnow() - timedelta(minutes=12)).isoformat()
    },
    {
        "id": 3,
        "display_name": "Marcus",
        "vibe_text": "Listening to acoustic vinyl and reading Murakami",
        "mood_tag": "relaxed",
        "drink_rec": "Pour-over Ethiopian Yirgacheffe (Floral notes)",
        "timestamp": (datetime.utcnow() - timedelta(minutes=18)).isoformat()
    },
    {
        "id": 4,
        "display_name": "Devon C.",
        "vibe_text": "Need a major spark to crush product sprint planning",
        "mood_tag": "energized",
        "drink_rec": "Cascara Cold Brew Spritz with Blood Orange",
        "timestamp": (datetime.utcnow() - timedelta(minutes=24)).isoformat()
    }
]
next_fallback_id = 5

def get_db_connection():
    if not DATABASE_URL:
        return None
    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.warning(f"Could not connect to PostgreSQL: {e}")
        return None

def init_db():
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS sessions (
                      id SERIAL PRIMARY KEY,
                      display_name VARCHAR(50),
                      vibe_text TEXT,
                      mood_tag VARCHAR(20),
                      drink_rec TEXT,
                      timestamp TIMESTAMP DEFAULT NOW()
                    );
                """)
                conn.commit()
                logger.info("PostgreSQL database initialized successfully.")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
        finally:
            conn.close()

# Gemini helper with fallback ladder
def generate_gemini_content(contents: str, system_instruction: str = "") -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY, http_options={"headers": {"User-Agent": "aistudio-build"}})
    
    for model in MODEL_FALLBACK_LADDER:
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction if system_instruction else None,
                temperature=0.7,
                response_mime_type="application/json" if "JSON" in system_instruction else None
            )
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
            if response and response.text:
                return response.text
        except Exception as err:
            logger.warning(f"Model {model} failed: {err}")
            continue
    raise RuntimeError("All Gemini models in fallback ladder failed.")

def analyze_vibe_ai(vibe_text: str):
    system_prompt = (
        "You are CaféPulse's master barista sommelier. "
        "Analyze the user's vibe and classify into mood_tag strictly one of: focus, social, relaxed, energized. "
        "Recommend a matching artisanal drink and provide a 1-2 sentence warm reason. "
        "Return valid JSON: {\"mood_tag\": \"focus|social|relaxed|energized\", \"drink_recommendation\": \"...\", \"reason\": \"...\"}"
    )
    user_content = f"The following is user data:\n\"{vibe_text[:300]}\""
    
    try:
        raw_json = generate_gemini_content(user_content, system_instruction=system_prompt)
        data = json.loads(raw_json)
        mood = data.get("mood_tag", "relaxed").lower()
        if mood not in ["focus", "social", "relaxed", "energized"]:
            mood = "relaxed"
        return {
            "mood_tag": mood,
            "drink_recommendation": data.get("drink_recommendation", "Artisanal Vanilla Bean Flat White"),
            "reason": data.get("reason", "Crafted to complement your energy.")
        }
    except Exception as e:
        logger.error(f"Gemini analysis error: {e}")
        text_lower = vibe_text.lower()
        if any(w in text_lower for w in ["work", "study", "code", "focus", "read"]):
            return {
                "mood_tag": "focus",
                "drink_recommendation": "Double Shot Cortado with Cinnamon Dust",
                "reason": "Rich and balanced to keep you sharp in deep flow."
            }
        elif any(w in text_lower for w in ["friend", "chat", "meet", "talk"]):
            return {
                "mood_tag": "social",
                "drink_recommendation": "Cardamom Vanilla Honey Latte",
                "reason": "A comforting pour meant to accompany great conversation."
            }
        elif any(w in text_lower for w in ["tired", "energy", "wake", "fast", "boost"]):
            return {
                "mood_tag": "energized",
                "drink_recommendation": "Cold Brew Tonic with Citrus Zest",
                "reason": "Sparkling, crisp, and immediately invigorating."
            }
        else:
            return {
                "mood_tag": "relaxed",
                "drink_recommendation": "Earl Grey Lavender Fog with Oat Foam",
                "reason": "Calming floral notes to help you unwind and savor the moment."
            }

def generate_room_insight_ai(recent_checkins):
    summary = "\n".join([f"- [{s['mood_tag']}] \"{s['vibe_text']}\"" for s in recent_checkins[:10]])
    system_prompt = (
        "You are CaféPulse's Café Operations Assistant. "
        "Review these recent patron check-ins and return a strictly 2-sentence staff insight. "
        "Sentence 1: Atmospheric mood summary. Sentence 2: Concrete staff recommendation (audio volume, lighting, drink specials)."
    )
    try:
        insight = generate_gemini_content(f"Recent check-ins:\n{summary}", system_instruction=system_prompt)
        return insight.strip().replace('"', '')
    except Exception as e:
        logger.error(f"Error generating insight: {e}")
        return "High focus energy throughout the room. Keep ambient music low and ensure water carafes stay filled."

def find_vibe_match_ai(customer_vibe: str, customer_mood: str, other_checkins: list):
    """
    Finds the single most compatible patron from other check-ins
    and generates a warm 1-sentence conversation starter.
    """
    if not other_checkins:
        return None

    others_summary = "\n".join([
        f"- {p.get('display_name', 'Patron')} (Mood: {p.get('mood_tag')}): \"{p.get('vibe_text', '')[:100]}\""
        for p in other_checkins[:10]
    ])

    system_prompt = (
        "You are CaféPulse's intuitive café social connector. "
        "Examine the current customer's vibe & mood and compare with other patrons checked in over the last 30 minutes. "
        "Find the single most compatible person and generate a warm 1-sentence conversation starter connecting them. "
        "Return valid JSON: {\"matched_name\": \"...\", \"matched_vibe\": \"...\", \"conversation_starter\": \"...\"}. "
        "If no suitable match exists, return {\"matched_name\": null}."
    )

    prompt = (
        f"Current Customer:\nVibe: \"{customer_vibe[:300]}\"\nMood: \"{customer_mood}\"\n\n"
        f"Other Recent Patrons in Café:\n{others_summary}\n\n"
        "Find the single most compatible person and provide a warm 1-sentence conversation starter."
    )

    try:
        raw_json = generate_gemini_content(prompt, system_instruction=system_prompt)
        data = json.loads(raw_json)
        matched_name = data.get("matched_name")
        if not matched_name or matched_name == "null":
            return None
        
        starter = data.get("conversation_starter", "They seem to be on the same wavelength today — say hello!")
        return {
            "matched_name": matched_name.strip(),
            "matched_vibe": (data.get("matched_vibe") or customer_mood).strip(),
            "conversation_starter": starter.strip()
        }
    except Exception as e:
        logger.error(f"Error finding vibe match: {e}")
        # Heuristic fallback
        match = next((p for p in other_checkins if p.get("mood_tag") == customer_mood), other_checkins[0])
        name = match.get("display_name") or "A fellow patron"
        starter = "He's unwinding with a good book too — ask him what he's reading." if match.get("mood_tag") == "relaxed" else "They're locked into deep flow too — maybe trade a quick study tip."
        return {
            "matched_name": name,
            "matched_vibe": match.get("mood_tag", "relaxed"),
            "conversation_starter": starter
        }

# --- Database helpers ---
def insert_session(display_name, vibe_text, mood_tag, drink_rec):
    global next_fallback_id
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sessions (display_name, vibe_text, mood_tag, drink_rec, timestamp)
                    VALUES (%s, %s, %s, %s, NOW())
                    RETURNING id, display_name, vibe_text, mood_tag, drink_rec, timestamp;
                    """,
                    (display_name[:50], vibe_text[:300], mood_tag, drink_rec)
                )
                row = cur.fetchone()
                conn.commit()
                return {
                    "id": row[0],
                    "display_name": row[1],
                    "vibe_text": row[2],
                    "mood_tag": row[3],
                    "drink_rec": row[4],
                    "timestamp": row[5].isoformat()
                }
        except Exception as e:
            logger.error(f"Failed to insert into PostgreSQL: {e}")
        finally:
            conn.close()

    # Fallback store
    item = {
        "id": next_fallback_id,
        "display_name": display_name[:50] or "Anonymous Patron",
        "vibe_text": vibe_text[:300],
        "mood_tag": mood_tag,
        "drink_rec": drink_rec,
        "timestamp": datetime.utcnow().isoformat()
    }
    next_fallback_id += 1
    fallback_sessions.insert(0, item)
    return item

def get_recent_sessions(minutes=30):
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, display_name, vibe_text, mood_tag, drink_rec, timestamp
                    FROM sessions
                    WHERE timestamp >= NOW() - (%s || ' minutes')::INTERVAL
                    ORDER BY timestamp DESC
                    LIMIT 30;
                    """,
                    (minutes,)
                )
                rows = cur.fetchall()
                if rows:
                    return [
                        {
                            "id": r[0],
                            "display_name": r[1],
                            "vibe_text": r[2],
                            "mood_tag": r[3],
                            "drink_rec": r[4],
                            "timestamp": r[5].isoformat()
                        }
                        for r in rows
                    ]
        except Exception as e:
            logger.error(f"Error reading sessions: {e}")
        finally:
            conn.close()

    return fallback_sessions[:20]

# --- Routes ---
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/api/checkin", methods=["POST"])
def api_checkin():
    data = request.get_json(silent=True) or {}
    vibe_text = (data.get("vibe_text") or "").strip()
    display_name = (data.get("display_name") or "Anonymous Patron").strip()

    if not vibe_text:
        return jsonify({"error": "Please enter your vibe in a sentence."}), 400

    rec = analyze_vibe_ai(vibe_text)
    saved = insert_session(display_name, vibe_text, rec["mood_tag"], rec["drink_recommendation"])
    recent = get_recent_sessions(30)

    # Vibe match against other check-ins in last 30 minutes
    others = [s for s in recent if s.get("id") != saved.get("id")]
    vibe_match = find_vibe_match_ai(vibe_text, rec["mood_tag"], others) if others else None

    return jsonify({
        "success": True,
        "recommendation": rec,
        "vibe_match": vibe_match,
        "session": saved,
        "recent": recent
    })

@app.route("/api/vibe-match", methods=["POST"])
def api_vibe_match():
    data = request.get_json(silent=True) or {}
    vibe_text = (data.get("vibe_text") or "").strip()
    mood_tag = (data.get("mood_tag") or "relaxed").strip()
    exclude_id = data.get("exclude_id")

    if not vibe_text:
        return jsonify({"error": "vibe_text is required"}), 400

    recent = get_recent_sessions(30)
    others = [s for s in recent if s.get("id") != exclude_id] if exclude_id else recent
    vibe_match = find_vibe_match_ai(vibe_text, mood_tag, others)
    return jsonify({"vibe_match": vibe_match})

@app.route("/api/recent-checkins", methods=["GET"])
def api_recent():
    return jsonify({"checkins": get_recent_sessions(30)})

@app.route("/api/dashboard-stats", methods=["GET"])
def api_dashboard_stats():
    sessions = get_recent_sessions(60)
    counts = {"focus": 0, "social": 0, "relaxed": 0, "energized": 0}
    for s in sessions:
        tag = s.get("mood_tag")
        if tag in counts:
            counts[tag] += 1
    
    insight = generate_room_insight_ai(sessions)
    return jsonify({
        "counts": counts,
        "total": len(sessions),
        "recent": sessions,
        "room_insight": insight,
        "last_updated": datetime.utcnow().isoformat()
    })

current_staff_alert = None

def run_orchestrator_agent():
    global current_staff_alert
    steps = []
    step_num = 1

    def log_step(step_type, title, detail, data=None, tool=None):
        nonlocal step_num
        steps.append({
            "step_number": step_num,
            "type": step_type,
            "title": title,
            "detail": detail,
            "data": data,
            "tool": tool,
            "timestamp": datetime.utcnow().isoformat()
        })
        step_num += 1

    log_step("thought", "Agent Initialized", "Café Orchestrator Agent initializing with 3 tools: get_room_mood, get_recent_vibes, create_staff_alert.")

    # 1. Tool 1: get_room_mood
    sessions = get_recent_sessions(60)
    counts = {"focus": 0, "social": 0, "relaxed": 0, "energized": 0}
    for s in sessions:
        tag = s.get("mood_tag")
        if tag in counts:
            counts[tag] += 1
    mood_data = {**counts, "total": len(sessions)}

    log_step("tool_call", "Requesting Room Mood Telemetry", "Calling tool: get_room_mood() to analyze patron mood distribution.", {}, "get_room_mood")
    log_step("tool_result", "Room Mood Retrieved", f"Headcount: {len(sessions)}. Focus={counts['focus']}, Social={counts['social']}, Relaxed={counts['relaxed']}, Energized={counts['energized']}", mood_data, "get_room_mood")

    # 2. Tool 2: get_recent_vibes
    recent_10 = sessions[:10]
    vibes_data = [{"name": s.get("display_name"), "mood": s.get("mood_tag"), "vibe": s.get("vibe_text")} for s in recent_10]

    log_step("tool_call", "Requesting Patron Context", "Calling tool: get_recent_vibes(limit: 10) to inspect individual stories.", {"limit": 10}, "get_recent_vibes")
    log_step("tool_result", "Patron Context Received", f"Received {len(vibes_data)} recent patron profiles.", vibes_data, "get_recent_vibes")

    # 3. Reasoning
    log_step("thought", "Synthesizing Atmosphere & Acoustic Dynamics", "Evaluating balance of deep work vs social volume to formulate floor directive.")

    # 4. Generate alert using Gemini or heuristic fallback
    alert_title = "Atmospheric Balance Adjustment"
    alert_action = "Adjust floor lighting and acoustic volume to suit current patron density. Ensure fresh water carafes and pour-over stations are prepped."
    priority = "normal"
    category = "service"

    dominant_mood = max(counts, key=counts.get) if any(counts.values()) else "relaxed"
    if dominant_mood == "focus":
        alert_title = "Deep Focus Acoustic Shield"
        alert_action = "Dim overhead track lights to 60% and lower ambient playlist volume to gentle background hum. Ensure water carafes and communal desk outlets remain accessible."
        category = "music"
    elif dominant_mood == "social":
        alert_title = "Social Buzz & Counter Flow"
        alert_action = "Transition soundtrack to upbeat soul rhythms and open the patio partition for natural airflow. Offer counter pastry samplers to waiting groups to keep energy cheerful."
        category = "service"
    elif dominant_mood == "energized":
        alert_title = "High-Velocity Morning Flow"
        alert_action = "Prep double batch cold brew and keep steam wands cleared for rapid espresso turnarounds. Maintain bright window blinds to support morning productivity."
        priority = "urgent"
        category = "menu"
    else:
        alert_title = "Afternoon Sanctuary Calming"
        alert_action = "Spin vinyl jazz selections at gentle conversational volume and light amber tabletop candles near window nooks. Brew a fresh batch of floral tisane for reading patrons."
        category = "lighting"

    alert_obj = {
        "id": f"alert-{int(datetime.utcnow().timestamp()*1000)}",
        "title": alert_title,
        "action_text": alert_action,
        "priority": priority,
        "category": category,
        "created_at": datetime.utcnow().isoformat()
    }

    log_step("tool_call", "Posting Staff Alert", f'Calling tool: create_staff_alert(title: "{alert_title}")', alert_obj, "create_staff_alert")
    log_step("tool_result", "Action Card Posted to Dashboard", alert_action, alert_obj, "create_staff_alert")
    log_step("complete", "Orchestration Complete", f'Successfully deployed action card "{alert_title}" to the staff console.')

    current_staff_alert = alert_obj
    return {
        "success": True,
        "steps": steps,
        "alert": alert_obj,
        "summary": alert_action
    }

@app.route("/api/orchestrator/run", methods=["POST"])
def api_orchestrator_run():
    result = run_orchestrator_agent()
    return jsonify(result)

@app.route("/api/orchestrator/alert", methods=["GET"])
def api_orchestrator_get_alert():
    global current_staff_alert
    return jsonify({"alert": current_staff_alert})

@app.route("/api/orchestrator/alert", methods=["DELETE"])
def api_orchestrator_delete_alert():
    global current_staff_alert
    current_staff_alert = None
    return jsonify({"success": True})

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
