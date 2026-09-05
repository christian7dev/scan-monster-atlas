import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame, {
    EventBus,
    ALL_MONSTERS,
    RARITY_COLORS,
    BUSINESS_PINS,
    EVT_PHASE_CHANGED,
    EVT_MONSTER_ENGAGE,
    EVT_CATCH_SUCCESS,
    EVT_CATCH_ESCAPED,
    EVT_REWARD_COMPLETE,
    EVT_ENERGY_CHANGED,
    EVT_START_CATCH,
    EVT_SET_MONSTER,
    EVT_REWARD_START,
    EVT_RADAR_PING,
    EVT_MAP_BG,
    EVT_MODE_CHANGED,
    type EngagePayload,
    type CatchResultPayload,
    type MonsterDef,
    type MonsterInput,
} from './game/main';
import type { Game as GameScene } from './game/main';

/* ------------------------------------------------------------------ */
/* Types & persistence                                                 */
/* ------------------------------------------------------------------ */

type Screen =
    | 'menu' | 'onboarding' | 'home' | 'map' | 'scan' | 'catch'
    | 'reward' | 'collection' | 'quests' | 'leaderboard' | 'business';

interface PlayerState {
    name: string;
    points: number;
    level: number;
    xp: number;
    streak: number;
    caught: string[];
    badges: string[];
    scans: number;
    questsDone: string[];
}

const SAVE_KEY = 'scanque…e_v1';
const ENERGY_KEY = '***';
const ENERGY_MAX = 10;
const ENERGY_REGEN_MS = 12_000;

const defaultPlayer: PlayerState = {
    name: 'Ranger',
    points: 0,
    level: 1,
    xp: 0,
    streak: 0,
    caught: [],
    badges: [],
    scans: 0,
    questsDone: [],
};

function loadPlayer(): PlayerState {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) return { ...defaultPlayer, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...defaultPlayer };
}
function savePlayer(p: PlayerState) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

interface EnergyState { value: number; ts: number; }
function loadEnergy(): number {
    try {
        const raw = localStorage.getItem(ENERGY_KEY);
        if (!raw) return ENERGY_MAX;
        const s = JSON.parse(raw) as EnergyState;
        const gained = Math.floor((Date.now() - s.ts) / ENERGY_REGEN_MS);
        return Math.min(ENERGY_MAX, s.value + gained);
    } catch { return ENERGY_MAX; }
}
function persistEnergy(v: number) {
    try { localStorage.setItem(ENERGY_KEY, JSON.stringify({ value: v, ts: Date.now() })); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Simulated live data                                                 */
/* ------------------------------------------------------------------ */

const TICKER_POOL = [
    '⚡ {name} caught a Sparkbit near {biz}!',
    '🏆 {name} caught a Legendary at {biz}!',
    '🔥 {name} completed the Daily Scan Quest',
    '🌿 Thornling spotted around the park',
    '🎁 Double XP active at {biz} for 5 min',
    '👀 {name} just joined ScanQuest',
    '💎 Shadowmaw emerged near {biz}',
    '📍 {name} checked in at {biz}',
];
const BOT_NAMES = ['Nova', 'Kai', 'Mira', 'Leo', 'Zara', 'Rex', 'Ivy', 'Ash', 'Juno', 'Echo'];

interface FeedItem { id: number; text: string; }
function makeFeedItem(id: number): FeedItem {
    const t = TICKER_POOL[Math.floor(Math.random() * TICKER_POOL.length)];
    const biz = BUSINESS_PINS[Math.floor(Math.random() * BUSINESS_PINS.length)].name;
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    return { id, text: t.replace('{biz}', biz).replace('{name}', name) };
}

interface LeaderEntry { name: string; points: number; you?: boolean; }
function simulatedLeaderboard(you: PlayerState): LeaderEntry[] {
    const bots: LeaderEntry[] = BOT_NAMES.map((n, i) => ({
        name: n,
        points: 1200 - i * 90 + ((i * 37) % 50),
    }));
    const all = [...bots, { name: you.name || 'You', points: you.points, you: true }];
    all.sort((a, b) => b.points - a.points);
    return all.slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Quests                                                              */
/* ------------------------------------------------------------------ */

interface Quest { id: string; title: string; desc: string; reward: number; done: (p: PlayerState) => boolean; }
const QUESTS: Quest[] = [
    { id: 'q_scan1', title: 'First Contact', desc: 'Complete 1 QR scan', reward: 50, done: (p) => p.scans >= 1 },
    { id: 'q_scan5', title: 'Scan Streak', desc: 'Complete 5 QR scans', reward: 150, done: (p) => p.scans >= 5 },
    { id: 'q_catch1', title: 'New Ranger', desc: 'Catch your first elemental', reward: 80, done: (p) => p.caught.length >= 1 },
    { id: 'q_catch5', title: 'Elemental Tamer', desc: 'Catch 5 different elementals', reward: 250, done: (p) => p.caught.length >= 5 },
    { id: 'q_legend', title: 'Legend Hunter', desc: 'Catch a Legendary', reward: 400, done: (p) => p.caught.some((id) => ALL_MONSTERS.find((m) => m.id === id)?.rarity === 'legendary') },
    { id: 'q_lvl3', title: 'Rising Star', desc: 'Reach level 3', reward: 200, done: (p) => p.level >= 3 },
];

const BIZ_META: Record<string, { emoji: string; perk: string }> = {
    b1: { emoji: '🏨', perk: 'Legendary spawn boost' },
    b2: { emoji: '🍲', perk: 'Double XP check-in' },
    b3: { emoji: '🛒', perk: 'Free sphere refill' },
    b4: { emoji: '☕', perk: 'Energy regen boost' },
    b5: { emoji: '🍽️', perk: 'Rare monster nest' },
    b6: { emoji: '💻', perk: 'Epic QR event' },
    b7: { emoji: '🌿', perk: 'Heal & refresh' },
    b8: { emoji: '📚', perk: 'Quest bonus cache' },
};

/* ------------------------------------------------------------------ */
/* QR canvas (procedural, seeded)                                      */
/* ------------------------------------------------------------------ */

function drawQr(canvas: HTMLCanvasElement | null, seed: number) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const n = 21, cell = Math.floor(canvas.width / n);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let s = (seed * 2654435761) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx.fillStyle = '#0d0820';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const inEye = (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
            if (!inEye && rnd() > 0.52) ctx.fillRect(c * cell, r * cell, cell, cell);
        }
    }
    const eye = (ox: number, oy: number) => {
        ctx.fillStyle = '#0d0820'; ctx.fillRect(ox * cell, oy * cell, cell * 7, cell * 7);
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, cell * 5, cell * 5);
        ctx.fillStyle = '#7C3AED'; ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, cell * 3, cell * 3);
    };
    eye(0, 0); eye(n - 7, 0); eye(0, n - 7);
}

/* ------------------------------------------------------------------ */
/* Icons (inline SVG)                                                  */
/* ------------------------------------------------------------------ */

const Icon = {
    Radar: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" opacity=".35"/><circle cx="12" cy="12" r="5" opacity=".55"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 12 L18 6" strokeLinecap="round"/></svg>),
    Scan: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/></svg>),
    Book: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M9 3v14" opacity=".5"/></svg>),
    Trophy: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>),
    Store: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9l1.5-5h13L20 9M4 9h16M5 9v11h14V9M9 20v-6h6v6"/></svg>),
    Scroll: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h12v14a4 4 0 0 1-4 4H6M6 3a3 3 0 0 0-3 3v3h3M18 3a3 3 0 0 1 3 3v3h-3M9 8h6M9 12h6"/></svg>),
    Bolt: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>),
    Back: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 6l-6 6 6 6"/></svg>),
    Check: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg>),
};

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
    const gameRef = useRef<ReturnType<typeof StartGame> | null>(null);
    const sceneRef = useRef<GameScene | null>(null);
    const [screen, setScreen] = useState<Screen>('menu');
    const screenRef = useRef<Screen>('menu');
    screenRef.current = screen;

    const [player, setPlayer] = useState<PlayerState>(loadPlayer);
    const playerRef = useRef(player);
    playerRef.current = player;

    const [energy, setEnergy] = useState<number>(loadEnergy);
    const energyRef = useRef(energy);
    energyRef.current = energy;

    const [engage, setEngage] = useState<EngagePayload | null>(null);
    const [lastCatch, setLastCatch] = useState<{ def: MonsterDef; quality: string; points: number } | null>(null);
    const [escaped, setEscaped] = useState<MonsterDef | null>(null);
    const [feed, setFeed] = useState<FeedItem[]>(() => [1, 2, 3].map((i) => makeFeedItem(i)));
    const feedId = useRef(4);
    const [toast, setToast] = useState<string | null>(null);
    const [playerPos, setPlayerPos] = useState({ x: 0.5, y: 0.5 });
    const [scanResult, setScanResult] = useState<MonsterDef | null>(null);
    const [scanBusy, setScanBusy] = useState(false);
    const [legendHype, setLegendHype] = useState(false);
    const [nameInput, setNameInput] = useState('');

    const toastTimer = useRef<number | undefined>(undefined);
    const showToast = useCallback((msg: string) => {
        setToast(msg);
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 2600);
    }, []);

    /* ---- Phaser mount ---- */
    useLayoutEffect(() => {
        const game = StartGame('game-container');
        gameRef.current = game;
        return () => {
            if (game) game.destroy(true);
            gameRef.current = null;
            sceneRef.current = null;
        };
    }, []);

    /* scene ready */
    useEffect(() => {
        const onReady = (scene: GameScene) => {
            sceneRef.current = scene;
        };
        EventBus.on('current-scene-ready', onReady);
        return () => { EventBus.removeListener('current-scene-ready', onReady); };
    }, []);

    /* ---- navigation ---- */
    const nav = useCallback((s: Screen) => {
        setScreen(s);
        if (s !== 'catch' && s !== 'reward') {
            const sc = sceneRef.current;
            if (sc) {
                const apply = (sc as unknown as { applyMode?: (m: string) => void }).applyMode;
                if (typeof apply === 'function') apply.call(sc, 'map');
            }
        }
    }, []);

    /* ---- EventBus: scene → React ---- */
    useEffect(() => {
        const spendEnergy = () => {
            setEnergy((e) => { const v = Math.max(0, e - 1); persistEnergy(v); EventBus.emit(EVT_ENERGY_CHANGED, v); return v; });
        };
        const onEngage = (p: EngagePayload) => {
            if (screenRef.current !== 'map') return;
            setEngage(p);
            setScreen('catch');
        };
        const onSuccess = (p: CatchResultPayload) => {
            const def = p.monster;
            const quality = p.critical ? 'EXCELLENT' : 'GREAT';
            setLastCatch({ def, quality, points: p.score });
            spendEnergy();
            setPlayer((prev) => {
                const caught = prev.caught.includes(def.id) ? prev.caught : [...prev.caught, def.id];
                let xp = prev.xp + p.score;
                let level = prev.level;
                while (xp >= level * 300) { xp -= level * 300; level += 1; }
                const badges = [...prev.badges];
                if (def.rarity === 'legendary' && !badges.includes('legend-hunter')) badges.push('legend-hunter');
                if (caught.length >= 5 && !badges.includes('tamer')) badges.push('tamer');
                if (caught.length >= 10 && !badges.includes('master')) badges.push('master');
                const next: PlayerState = {
                    ...prev,
                    points: prev.points + p.score,
                    caught, xp, level, badges,
                    streak: prev.streak + 1,
                };
                savePlayer(next);
                return next;
            });
            setScreen('reward');
            EventBus.emit(EVT_SET_MONSTER, def.id);
            const input: MonsterInput = {
                id: def.id, name: def.name, rarity: def.rarity, element: def.element,
                emoji: def.emoji, points: def.points, cp: def.cp, escapeRate: p.monster.escapeRate,
            };
            EventBus.emit(EVT_REWARD_START, input);
        };
        const onEscaped = (p: { monster: MonsterInput }) => {
            setEscaped(p.monster);
            setEngage(null);
            spendEnergy();
            setPlayer((prev) => { const next = { ...prev, streak: 0 }; savePlayer(next); return next; });
            setScreen('map');
            const sc = sceneRef.current;
            const apply = (sc as unknown as { applyMode?: (m: string) => void } | null)?.applyMode;
            if (typeof apply === 'function') apply.call(sc, 'map');
            window.setTimeout(() => setEscaped(null), 3200);
        };
        const onRewardDone = () => {
            setLastCatch(null);
            setEngage(null);
            nav('map');
        };
        const onPhase = (p: { phase: string }) => {
            if (p && p.phase === 'MAP') nav('map');
        };
        const onMode = (m: string) => {
            if (m === 'map') setPlayerPos({ x: 0.5, y: 0.5 });
        };
        EventBus.on(EVT_MONSTER_ENGAGE, onEngage);
        EventBus.on(EVT_CATCH_SUCCESS, onSuccess);
        EventBus.on(EVT_CATCH_ESCAPED, onEscaped);
        EventBus.on(EVT_REWARD_COMPLETE, onRewardDone);
        EventBus.on(EVT_PHASE_CHANGED, onPhase);
        EventBus.on(EVT_MODE_CHANGED, onMode);
        return () => {
            EventBus.removeListener(EVT_MONSTER_ENGAGE, onEngage);
            EventBus.removeListener(EVT_CATCH_SUCCESS, onSuccess);
            EventBus.removeListener(EVT_CATCH_ESCAPED, onEscaped);
            EventBus.removeListener(EVT_REWARD_COMPLETE, onRewardDone);
            EventBus.removeListener(EVT_PHASE_CHANGED, onPhase);
            EventBus.removeListener(EVT_MODE_CHANGED, onMode);
        };
    }, [nav]);

    /* ---- live simulation loops ---- */
    useEffect(() => {
        const t = window.setInterval(() => {
            setFeed((prev) => {
                const next = [makeFeedItem(feedId.current++), ...prev];
                return next.slice(0, 14);
            });
        }, 4500);
        return () => window.clearInterval(t);
    }, []);

    useEffect(() => {
        const t = window.setInterval(() => {
            setEnergy((e) => {
                if (e >= ENERGY_MAX) return e;
                const v = Math.min(ENERGY_MAX, e + 1);
                persistEnergy(v);
                EventBus.emit(EVT_ENERGY_CHANGED, v);
                return v;
            });
        }, ENERGY_REGEN_MS);
        return () => window.clearInterval(t);
    }, []);

    /* legendary world event every ~75s while on map */
    useEffect(() => {
        const t = window.setInterval(() => {
            if (screenRef.current !== 'map') return;
            EventBus.emit(EVT_RADAR_PING, { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 });
            EventBus.emit(EVT_MAP_BG, true);
            setLegendHype(true);
            window.setTimeout(() => { setLegendHype(false); EventBus.emit(EVT_MAP_BG, false); }, 8000);
        }, 75_000);
        return () => window.clearInterval(t);
    }, []);

    /* ---- actions ---- */
    const startGame = () => nav('onboarding');
    const confirmStart = () => {
        const name = (nameInput.trim() || 'Ranger').slice(0, 12);
        setPlayer((prev) => { const next = { ...prev, name }; savePlayer(next); return next; });
        nav('map');
    };

    const throwSphere = () => {
        if (!engage) return;
        if (energyRef.current <= 0) { showToast('⚡ Out of energy! Wait for regen.'); return; }
        const input: MonsterInput = {
            ...engage.monster,
            escapeRate: engage.escapeRate,
        };
        setEngage(null);
        EventBus.emit(EVT_START_CATCH, { monster: input });
    };
    const fleeCatch = () => {
        setEngage(null);
        nav('map');
    };
    const continueReward = () => {
        const sc = sceneRef.current;
        const apply = (sc as unknown as { applyMode?: (m: string) => void } | null)?.applyMode;
        if (typeof apply === 'function') apply.call(sc, 'map');
        onRewardFinish();
    };
    const onRewardFinish = useCallback(() => {
        setLastCatch(null);
        nav('map');
    }, [nav]);

    const doScan = () => {
        if (scanBusy) return;
        if (energyRef.current <= 0) { showToast('⚡ Out of energy! Wait for regen.'); return; }
        setScanBusy(true);
        setScanResult(null);
        window.setTimeout(() => {
            setScanBusy(false);
            setEnergy((e) => { const v = Math.max(0, e - 1); persistEnergy(v); EventBus.emit(EVT_ENERGY_CHANGED, v); return v; });
            setPlayer((prev) => { const next = { ...prev, scans: prev.scans + 1, points: prev.points + 15 }; savePlayer(next); return next; });
            const roll = Math.random();
            const pool = roll < 0.08
                ? ALL_MONSTERS.filter((m) => m.rarity === 'legendary')
                : roll < 0.3
                    ? ALL_MONSTERS.filter((m) => m.rarity === 'epic')
                    : ALL_MONSTERS.filter((m) => m.rarity === 'common' || m.rarity === 'rare');
            const def = pool[Math.floor(Math.random() * pool.length)];
            setScanResult(def);
        }, 1400);
    };
    const scanEngage = () => {
        if (!scanResult) return;
        const escapeRate = scanResult.rarity === 'legendary' ? 0.85 : scanResult.rarity === 'epic' ? 0.72 : scanResult.rarity === 'rare' ? 0.55 : 0.35;
        setEngage({ monster: scanResult, escapeRate, source: 'scan', bonus: 0, lat: 9.0222, lng: 38.7468 });
        setScanResult(null);
        setScreen('catch');
    };

    const checkIn = (b: { id: string; name: string; mult: number }) => {
        const gained = Math.round(40 * b.mult);
        setPlayer((prev) => { const next = { ...prev, points: prev.points + gained }; savePlayer(next); return next; });
        EventBus.emit(EVT_RADAR_PING, { x: 0.5, y: 0.5 });
        showToast(`📍 Checked in at ${b.name}: +${gained} pts`);
    };

    const claimQuest = (q: Quest) => {
        if (!q.done(player) || player.questsDone.includes(q.id)) return;
        setPlayer((prev) => {
            const next = {
                ...prev,
                points: prev.points + q.reward,
                questsDone: [...prev.questsDone, q.id],
                badges: prev.badges.includes('quester') ? prev.badges : [...prev.badges, 'quester'],
            };
            savePlayer(next);
            return next;
        });
        showToast(`🎁 Quest reward claimed: +${q.reward} pts`);
    };

    /* ---- derived ---- */
    const xpNeed = player.level * 300;

    const showCanvas = screen === 'map' || screen === 'catch' || screen === 'reward' || screen === 'scan';
    const showNav = screen === 'home' || screen === 'map' || screen === 'collection' || screen === 'quests' || screen === 'leaderboard' || screen === 'business';

    /* ---------------------------------------------------------------- */
    /* Render                                                            */
    /* ---------------------------------------------------------------- */

    return (
        <main className="app-shell">
            {/* Phaser canvas host — NEVER remove */}
            <div id="game-container" className={showCanvas ? 'canvas-live' : 'canvas-idle'} />

            {/* Live top HUD (map/scan/catch screens) */}
            {(screen === 'map' || screen === 'scan' || screen === 'catch') && (
                <div id="hud">
                    <div className="hud-chip"><b>{player.name}</b> · Lv {player.level}</div>
                    <div className="hud-chip gold">★ {player.points.toLocaleString()}</div>
                    <div className="hud-chip energy"><Icon.Bolt /> {energy}/{ENERGY_MAX}</div>
                </div>
            )}

            {/* ================= MENU ================= */}
            {screen === 'menu' && (
                <section className="overlay screen menu-screen">
                    <div className="menu-orbit"><span>🔥</span><span>💧</span><span>🌿</span><span>⛰️</span><span>💎</span><span>🌙</span></div>
                    <p className="eyebrow">Real-time AR monster hunt</p>
                    <h1 className="menu-title">Scan<span className="grad">Quest</span></h1>
                    <p className="menu-sub">Hunt elemental monsters across a live city map. Scan QR codes, throw spheres in real-time catch battles, check in at partner businesses.</p>
                    <button className="btn-primary big" onClick={startGame}>▶ START HUNTING</button>
                    <div className="menu-stats">
                        <span>{ALL_MONSTERS.length} elementals</span><span>·</span><span>{BUSINESS_PINS.length} partner spots</span><span>·</span><span>live events</span>
                    </div>
                </section>
            )}

            {/* ================= ONBOARDING ================= */}
            {screen === 'onboarding' && (
                <section className="overlay screen">
                    <p className="eyebrow">Welcome, ranger</p>
                    <h2 className="h2">Set up your hunter profile</h2>
                    <div className="onboard-card">
                        <label className="field-label">Ranger name</label>
                        <input
                            className="text-input"
                            value={nameInput}
                            maxLength={12}
                            placeholder={player.name}
                            onChange={(e) => setNameInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmStart(); }}
                        />
                        <ul className="onboard-list">
                            <li>🛰️ Walk the <b>live radar map</b> — WASD/arrows or tap to move</li>
                            <li>👆 Tap a monster to engage, then <b>flick-throw</b> your sphere</li>
                            <li>⚡ Each catch costs 1 energy — it regenerates in real time</li>
                            <li>📷 <b>Scan QR codes</b> anywhere to reveal hidden elementals</li>
                            <li>🏪 Check in at <b>partner businesses</b> for bonus points</li>
                        </ul>
                        <button className="btn-primary" onClick={confirmStart}>ENTER THE GRID</button>
                        <button className="btn-ghost" onClick={() => nav('home')}>Skip intro</button>
                    </div>
                </section>
            )}

            {/* ================= HOME ================= */}
            {screen === 'home' && (
                <section className="overlay screen">
                    <p className="eyebrow">Ranger {player.name} · Lv {player.level}</p>
                    <h2 className="h2">Ready to hunt?</h2>
                    <div className="xp-bar"><i style={{ width: `${Math.min(100, (player.xp / xpNeed) * 100)}%` }} /></div>
                    <p className="muted small">{player.xp} / {xpNeed} XP to level {player.level + 1} · 🔥 streak {player.streak}</p>
                    <div className="home-grid">
                        <button className="home-tile primary" onClick={() => nav('map')}><Icon.Radar /><span>Live Map</span><small>Hunt elementals now</small></button>
                        <button className="home-tile" onClick={() => nav('scan')}><Icon.Scan /><span>QR Scan</span><small>Reveal surprises</small></button>
                        <button className="home-tile" onClick={() => nav('collection')}><Icon.Book /><span>Bestiary</span><small>{player.caught.length}/{ALL_MONSTERS.length}</small></button>
                        <button className="home-tile" onClick={() => nav('quests')}><Icon.Scroll /><span>Quests</span><small>Daily rewards</small></button>
                        <button className="home-tile" onClick={() => nav('leaderboard')}><Icon.Trophy /><span>Leaderboard</span><small>Live ranking</small></button>
                        <button className="home-tile" onClick={() => nav('business')}><Icon.Store /><span>Business Hub</span><small>Partner spots</small></button>
                    </div>
                </section>
            )}

            {/* ================= MAP (canvas shows through) ================= */}
            {screen === 'map' && (
                <>
                    {legendHype && (
                        <div className="legend-banner">🌟 LEGENDARY SURGE — a rare elemental just spawned on the radar! 🌟</div>
                    )}
                    <div className="map-side">
                        <div className="feed-card">
                            <p className="feed-title">● LIVE ACTIVITY</p>
                            {feed.map((f) => (<p key={f.id} className="feed-item">{f.text}</p>))}
                        </div>
                    </div>
                    <div className="map-actions">
                        <button className="btn-primary" onClick={() => nav('scan')}><Icon.Scan /> Scan QR</button>
                        <button className="btn-ghost" onClick={() => nav('home')}>Home</button>
                    </div>
                </>
            )}

            {/* ================= CATCH ENGAGE OVERLAY ================= */}
            {screen === 'catch' && engage && (
                <section className="overlay catch-overlay">
                    <div className="engage-card" style={{ borderColor: RARITY_COLORS[engage.monster.rarity] }}>
                        <span className="engage-glow" style={{ background: RARITY_COLORS[engage.monster.rarity] }} />
                        <p className="rarity-tag" style={{ color: RARITY_COLORS[engage.monster.rarity] }}>{engage.monster.rarity.toUpperCase()}</p>
                        <h2 className="engage-name">{engage.monster.emoji} {engage.monster.name}</h2>
                        <p className="muted">{engage.monster.element} type · CP {engage.monster.cp}</p>
                        <div className="engage-stats">
                            <div><b style={{ color: '#FBBF24' }}>+{engage.monster.points}</b><small>points</small></div>
                            <div><b>{Math.round((1 - engage.escapeRate) * 100)}%</b><small>base catch rate</small></div>
                            <div><b>{energy}</b><small>energy left</small></div>
                        </div>
                        <p className="throw-hint">Drag &amp; release upward to flick your sphere — hit the shrinking ring for EXCELLENT!</p>
                        <div className="engage-actions">
                            <button className="btn-primary big" onClick={throwSphere}>🔮 THROW SPHERE (−1 ⚡)</button>
                            <button className="btn-ghost" onClick={fleeCatch}>Flee back to map</button>
                        </div>
                    </div>
                </section>
            )}

            {escaped && screen === 'map' && (
                <div className="toast-warn">💨 The {escaped.name} escaped… it wandered off the radar.</div>
            )}

            {/* ================= SCAN ================= */}
            {screen === 'scan' && (
                <section className="overlay screen scan-screen">
                    <button className="back-btn" onClick={() => nav('map')}><Icon.Back /> Map</button>
                    <div className="scan-frame">
                        <canvas
                            ref={(c) => drawQr(c, Math.floor(player.scans * 7919 + 13))}
                            width={231} height={231}
                            className={scanBusy ? 'qr busy' : 'qr'}
                        />
                        <div className="scan-reticle" />
                    </div>
                    <p className="muted">{scanBusy ? 'Analyzing quantum signature…' : 'Point your camera at any ScanQuest QR plaque in the city.'}</p>
                    {!scanBusy && <button className="btn-primary big" onClick={doScan}>📷 SIMULATE SCAN (−1 ⚡)</button>}
                    {scanResult && (
                        <div className="scan-result" style={{ borderColor: RARITY_COLORS[scanResult.rarity] }}>
                            <p className="rarity-tag" style={{ color: RARITY_COLORS[scanResult.rarity] }}>{scanResult.rarity.toUpperCase()} REVEALED</p>
                            <h3>{scanResult.emoji} {scanResult.name}</h3>
                            <p className="muted small">+15 scan pts banked · engage it for {scanResult.points} more!</p>
                            <div className="engage-actions">
                                <button className="btn-primary" onClick={scanEngage}>⚔️ ENGAGE</button>
                                <button className="btn-ghost" onClick={() => setScanResult(null)}>Discard</button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* ================= REWARD ================= */}
            {screen === 'reward' && (
                <section className="overlay reward-overlay">
                    {lastCatch && (
                        <div className="reward-card">
                            <p className="rarity-tag" style={{ color: RARITY_COLORS[lastCatch.def.rarity] }}>{lastCatch.quality} · {lastCatch.def.rarity.toUpperCase()} CAUGHT</p>
                            <h2>{lastCatch.def.emoji} {lastCatch.def.name} joined your bestiary!</h2>
                            <p className="reward-pts">+{lastCatch.points} pts</p>
                            <button className="btn-primary big" onClick={continueReward}>CONTINUE</button>
                        </div>
                    )}
                </section>
            )}

            {/* ================= COLLECTION ================= */}
            {screen === 'collection' && (
                <section className="overlay screen">
                    <button className="back-btn" onClick={() => nav('home')}><Icon.Back /> Home</button>
                    <p className="eyebrow">Bestiary</p>
                    <h2 className="h2">{player.caught.length} / {ALL_MONSTERS.length} elementals caught</h2>
                    <div className="dex-grid">
                        {ALL_MONSTERS.map((m) => {
                            const owned = player.caught.includes(m.id);
                            return (
                                <div key={m.id} className={`dex-card ${owned ? 'owned' : 'locked'}`} style={owned ? { borderColor: RARITY_COLORS[m.rarity] } : undefined}>
                                    <span className="dex-emoji">{owned ? m.emoji : '❓'}</span>
                                    <b>{owned ? m.name : '???'}</b>
                                    <small style={{ color: RARITY_COLORS[m.rarity] }}>{m.rarity}</small>
                                </div>
                            );
                        })}
                    </div>
                    {player.badges.length > 0 && (
                        <div className="badges">
                            {player.badges.map((b) => <span key={b} className="badge">🏅 {b.replace('-', ' ')}</span>)}
                        </div>
                    )}
                </section>
            )}

            {/* ================= QUESTS ================= */}
            {screen === 'quests' && (
                <section className="overlay screen">
                    <button className="back-btn" onClick={() => nav('home')}><Icon.Back /> Home</button>
                    <p className="eyebrow">Quest board</p>
                    <h2 className="h2">Missions & rewards</h2>
                    <div className="quest-list">
                        {QUESTS.map((q) => {
                            const complete = q.done(player);
                            const claimed = player.questsDone.includes(q.id);
                            return (
                                <div key={q.id} className={`quest-row ${claimed ? 'claimed' : ''}`}>
                                    <div>
                                        <b>{q.title}</b>
                                        <p className="muted small">{q.desc} · reward +{q.reward} pts</p>
                                    </div>
                                    {claimed
                                        ? <span className="pill done"><Icon.Check /> Claimed</span>
                                        : complete
                                            ? <button className="pill claim" onClick={() => claimQuest(q)}>CLAIM</button>
                                            : <span className="pill">In progress</span>}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ================= LEADERBOARD ================= */}
            {screen === 'leaderboard' && (
                <section className="overlay screen">
                    <button className="back-btn" onClick={() => nav('home')}><Icon.Back /> Home</button>
                    <p className="eyebrow">● Live ranking · updates in real time</p>
                    <h2 className="h2">City Top 10</h2>
                    <div className="lb-list">
                        {simulatedLeaderboard(player).map((e, i) => (
                            <div key={e.name + i} className={`lb-row ${e.you ? 'you' : ''}`}>
                                <span className="lb-rank">{i + 1}</span>
                                <span className="lb-name">{e.you ? '🧭 ' : ''}{e.name}</span>
                                <span className="lb-pts">{e.points.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                    <p className="muted small">Catch more elementals to climb the live ranking!</p>
                </section>
            )}

            {/* ================= BUSINESS HUB ================= */}
            {screen === 'business' && (
                <section className="overlay screen">
                    <button className="back-btn" onClick={() => nav('home')}><Icon.Back /> Home</button>
                    <p className="eyebrow">Partner network</p>
                    <h2 className="h2">Business checkpoints</h2>
                    <p className="muted small">Walk to a glowing 🏪 pin on the live map to check in and earn bonus points & spawn waves.</p>
                    <div className="biz-list">
                        {BUSINESS_PINS.map((b) => {
                            const meta = BIZ_META[b.id] ?? { emoji: '🏪', perk: 'Bonus points' };
                            const d = Math.round(Math.hypot(playerPos.x - b.x, playerPos.y - b.y) * 1000);
                            const near = d < 120;
                            return (
                                <div key={b.id} className={`biz-row ${near ? 'near' : ''}`}>
                                    <span className="biz-emoji">{meta.emoji}</span>
                                    <div><b>{b.name}</b><p className="muted small">{meta.perk} · ×{b.mult} rewards</p></div>
                                    {near
                                        ? <button className="pill claim" onClick={() => checkIn(b)}>CHECK IN</button>
                                        : <span className="pill">{d} m away</span>}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ================= BOTTOM NAV ================= */}
            {showNav && (
                <nav className="bottom-nav">
                    <button className={screen === 'home' ? 'active' : ''} onClick={() => nav('home')}><Icon.Store /><span>Home</span></button>
                    <button className={screen === 'map' ? 'active' : ''} onClick={() => nav('map')}><Icon.Radar /><span>Map</span></button>
                    <button className="nav-scan" onClick={() => nav('scan')}><Icon.Scan /><span>Scan</span></button>
                    <button className={screen === 'quests' ? 'active' : ''} onClick={() => nav('quests')}><Icon.Scroll /><span>Quests</span></button>
                    <button className={screen === 'collection' ? 'active' : ''} onClick={() => nav('collection')}><Icon.Book /><span>Dex</span></button>
                </nav>
            )}

            {/* toast */}
            {toast && <div className="toast">{toast}</div>}
        </main>
    );
}
