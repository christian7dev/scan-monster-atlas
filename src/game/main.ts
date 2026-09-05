import * as Phaser from 'phaser';
import { AUTO, Events, Game as PhaserGame, Scale, Scene } from 'phaser';

// ---------------------------------------------------------------------------
// SCANQUEST — Phaser 4 engine: live radar map + real-time catch mini-game +
// reward reveal. One `Game` scene drives all canvas modes; React (App.tsx)
// owns the app state machine and all menu/HUD overlays.
// ---------------------------------------------------------------------------
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

export const COLORS = {
    BG_TOP: 0x1a1033,
    BG_BOTTOM: 0x0d0820,
    CYAN: 0x38BDF8,
    CYAN_HEX: '#38BDF8',
    GOLD: 0xF59E0B,
    GOLD_HEX: '#FBBF24',
    PURPLE: 0x8B5CF6,
    GREEN: 0x10B981,
    TEXT: '#ffffff',
} as const;

export const EventBus = new Events.EventEmitter();

// Event name constants (shared React <-> Phaser bridge contract)
export const EVT_PHASE_CHANGED = 'phase-changed';
export const EVT_REWARD_START = 'reward-start';
export const EVT_REWARD_COMPLETE = 'reward-complete';
export const EVT_START_CATCH = 'start-catch-game';
export const EVT_CATCH_SUCCESS = 'catch-success';
export const EVT_CATCH_ESCAPED = 'catch-escaped';
export const EVT_RADAR_PING = 'radar-ping';
export const EVT_MONSTER_ENGAGE = 'monster-engage';
export const EVT_ENERGY_CHANGED = 'energy-changed';
export const EVT_SET_MONSTER = 'set-monster';
export const EVT_MAP_BG = 'map-bg';
export const EVT_MODE_CHANGED = 'mode-changed';
export const EVT_CANCEL_CATCH = 'cancel-catch';

export interface CatchResultPayload {
    monster: MonsterInput;
    score: number;
    critical: boolean;
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface MonsterDef {
    id: string; name: string; rarity: Rarity; element: string;
    emoji: string; points: number; cp: number;
}

export interface MonsterInput {
    id: string; name: string; rarity: Rarity; element: string;
    emoji: string; points: number; cp: number; escapeRate: number;
}

export interface BusinessPin { id: string; name: string; x: number; y: number; mult: number }

export interface EngagePayload {
    monster: MonsterDef;
    escapeRate: number;
    source: 'map' | 'scan';
    bonus: number;
    lat: number;
    lng: number;
}

// ---------------------------------------------------------------------------
// Monster species catalog (shared with React via this module)
// ---------------------------------------------------------------------------
export const ALL_MONSTERS: MonsterDef[] = [
    { id: 'm1', name: 'Flamix', rarity: 'common', element: 'Fire', emoji: '🔥', points: 50, cp: 120 },
    { id: 'm2', name: 'Aquael', rarity: 'common', element: 'Water', emoji: '💧', points: 50, cp: 110 },
    { id: 'm3', name: 'Thornling', rarity: 'common', element: 'Nature', emoji: '🌿', points: 50, cp: 100 },
    { id: 'm4', name: 'Sparkbit', rarity: 'common', element: 'Electric', emoji: '⚡', points: 60, cp: 140 },
    { id: 'm5', name: 'Rockmaw', rarity: 'common', element: 'Earth', emoji: '🪨', points: 55, cp: 160 },
    { id: 'm6', name: 'Zephyr', rarity: 'common', element: 'Wind', emoji: '🌬️', points: 55, cp: 95 },
    { id: 'm7', name: 'Blazewyrm', rarity: 'rare', element: 'Fire', emoji: '🐉', points: 150, cp: 320 },
    { id: 'm8', name: 'Tidalfang', rarity: 'rare', element: 'Water', emoji: '🦈', points: 150, cp: 340 },
    { id: 'm9', name: 'Voltbeast', rarity: 'rare', element: 'Electric', emoji: '🦎', points: 160, cp: 300 },
    { id: 'm10', name: 'Cryonox', rarity: 'rare', element: 'Ice', emoji: '❄️', points: 155, cp: 330 },
    { id: 'm11', name: 'Shadowmaw', rarity: 'epic', element: 'Dark', emoji: '🌑', points: 400, cp: 640 },
    { id: 'm12', name: 'Luminara', rarity: 'epic', element: 'Light', emoji: '✨', points: 420, cp: 610 },
    { id: 'm13', name: 'Terraclaw', rarity: 'epic', element: 'Earth', emoji: '🦂', points: 380, cp: 700 },
    { id: 'm14', name: 'Anbesa Prime', rarity: 'legendary', element: 'Holy', emoji: '🦁', points: 1000, cp: 1200 },
    { id: 'm15', name: 'Cosmic Rex', rarity: 'legendary', element: 'Void', emoji: '🌌', points: 1200, cp: 1350 },
];

export const RARITY_COLORS: Record<Rarity, string> = {
    common: '#94A3B8', rare: '#38BDF8', epic: '#A855F7', legendary: '#F59E0B',
};

const RARITY_HEX: Record<Rarity, number> = {
    common: 0x94A3B8, rare: 0x38BDF8, epic: 0xA855F7, legendary: 0xF59E0B,
};

const RARITY_ESCAPE: Record<Rarity, number> = {
    common: 0.35, rare: 0.55, epic: 0.72, legendary: 0.85,
};

const ELEMENT_COLORS: Record<string, number> = {
    Fire: 0xF97316, Water: 0x38BDF8, Nature: 0x10B981, Electric: 0xFBBF24,
    Earth: 0xB45309, Wind: 0x94A3B8, Ice: 0x67E8F9, Dark: 0x6D28D9,
    Light: 0xFDE68A, Holy: 0xF59E0B, Void: 0x7C3AED,
};

const elementColor = (el: string) => ELEMENT_COLORS[el] ?? 0x8B5CF6;

const escapeRateFor = (rarity: Rarity) =>
    Math.min(0.95, Math.max(0.15, RARITY_ESCAPE[rarity] + (Math.random() * 0.1 - 0.05)));

// ---------------------------------------------------------------------------
// Business partner pins on the live radar map (normalized 0..1 coords)
// ---------------------------------------------------------------------------
export const BUSINESS_PINS: BusinessPin[] = [
    { id: 'b1', name: 'Buna Palace', x: 0.18, y: 0.22, mult: 1.5 },
    { id: 'b2', name: 'Yod Miskir', x: 0.74, y: 0.16, mult: 2.0 },
    { id: 'b3', name: 'Shiro Market', x: 0.86, y: 0.44, mult: 1.2 },
    { id: 'b4', name: 'Habesha Brew', x: 0.24, y: 0.66, mult: 1.8 },
    { id: 'b5', name: 'Injera House', x: 0.52, y: 0.34, mult: 1.4 },
    { id: 'b6', name: 'Tech Hub Addis', x: 0.80, y: 0.76, mult: 2.5 },
    { id: 'b7', name: 'Green Leaf Spa', x: 0.12, y: 0.46, mult: 1.3 },
    { id: 'b8', name: 'Book Corner', x: 0.44, y: 0.80, mult: 1.1 },
];

const MAP_X0 = 30, MAP_X1 = GAME_WIDTH - 30;
const MAP_Y0 = 150, MAP_Y1 = GAME_HEIGHT - 240;
const toMapX = (n: number) => MAP_X0 + n * (MAP_X1 - MAP_X0);
const toMapY = (n: number) => MAP_Y0 + n * (MAP_Y1 - MAP_Y0);
const fromMapX = (px: number) => Math.min(1, Math.max(0, (px - MAP_X0) / (MAP_X1 - MAP_X0)));
const fromMapY = (px: number) => Math.min(1, Math.max(0, (px - MAP_Y0) / (MAP_Y1 - MAP_Y0)));

// ---------------------------------------------------------------------------
// Procedural texture factory — flat-vector creature blobs with faces,
// generated once at scene create(). Emoji sprites are rendered separately
// via a real 2D canvas (textures.createCanvas) so emoji never render blank.
// ---------------------------------------------------------------------------
function makeBlobTexture(g: Phaser.GameObjects.Graphics, key: string, color: number, size = 100) {
    const c = size / 2;
    g.clear();
    // ears / spikes
    g.fillStyle(color, 1);
    g.fillTriangle(c - size * 0.32, c - size * 0.28, c - size * 0.18, c - size * 0.52, c - size * 0.06, c - size * 0.26);
    g.fillTriangle(c + size * 0.32, c - size * 0.28, c + size * 0.18, c - size * 0.52, c + size * 0.06, c - size * 0.26);
    // tail
    g.fillTriangle(c + size * 0.36, c + size * 0.1, c + size * 0.56, c + size * 0.34, c + size * 0.3, c + size * 0.3);
    // body
    g.fillCircle(c, c, size * 0.38);
    // belly highlight
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(c, c + size * 0.14, size * 0.42, size * 0.3);
    // eyes (side profile: one big eye + hint)
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c - size * 0.1, c - size * 0.08, size * 0.1);
    g.fillCircle(c + size * 0.14, c - size * 0.08, size * 0.08);
    g.fillStyle(0x0d0820, 1);
    g.fillCircle(c - size * 0.08, c - size * 0.06, size * 0.045);
    g.fillCircle(c + size * 0.16, c - size * 0.06, size * 0.036);
    // mouth
    g.lineStyle(3, 0x0d0820, 0.9);
    g.beginPath();
    g.arc(c + size * 0.02, c + size * 0.08, size * 0.12, 0.2, Math.PI - 0.2);
    g.strokePath();
    // feet
    g.fillStyle(color, 1);
    g.fillEllipse(c - size * 0.18, c + size * 0.4, size * 0.18, size * 0.1);
    g.fillEllipse(c + size * 0.14, c + size * 0.4, size * 0.18, size * 0.1);
    g.generateTexture(key, size, size);
}

function makeOrbTexture(g: Phaser.GameObjects.Graphics) {
    const s = 64, c = s / 2;
    g.clear();
    g.fillStyle(0x0d0820, 1); g.fillCircle(c, c, 28);
    g.fillStyle(0xE2E8F0, 1); g.fillCircle(c, c, 26);
    g.fillStyle(0x0d0820, 1); g.fillRect(c - 26, c - 3, 52, 6);
    g.fillStyle(0x38BDF8, 1); g.fillCircle(c, c, 8);
    g.fillStyle(0xffffff, 0.9); g.fillCircle(c - 10, c - 12, 5);
    g.generateTexture('orb', s, s);
}

function makeRingTexture(g: Phaser.GameObjects.Graphics) {
    const s = 260, c = s / 2;
    g.clear();
    g.lineStyle(6, 0x38BDF8, 1); g.strokeCircle(c, c, c - 6);
    g.lineStyle(2, 0x38BDF8, 0.4); g.strokeCircle(c, c, c - 16);
    g.generateTexture('ring', s, s);
}

function makeStorePinTexture(g: Phaser.GameObjects.Graphics) {
    const s = 56;
    g.clear();
    g.fillStyle(0xF59E0B, 1);
    g.fillRoundedRect(6, 6, s - 12, s - 22, 8);
    g.fillStyle(0x0d0820, 1);
    g.fillTriangle(s / 2 - 8, s - 16, s / 2 + 8, s - 16, s / 2, s - 4);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(12, 14, s - 24, 6);
    g.generateTexture('store_pin', s, s);
}

function makePlayerMarker(g: Phaser.GameObjects.Graphics) {
    const s = 64, c = s / 2;
    g.clear();
    g.fillStyle(0x38BDF8, 0.25); g.fillCircle(c, c, 26);
    g.fillStyle(0x38BDF8, 1); g.fillCircle(c, c, 12);
    g.fillStyle(0xffffff, 1); g.fillCircle(c, c, 5);
    g.generateTexture('player_marker', s, s);
}

function makeGlowDot(g: Phaser.GameObjects.Graphics, key: string, color: number, size: number) {
    const c = size / 2;
    g.clear();
    g.fillStyle(color, 0.9); g.fillCircle(c, c, size * 0.3);
    g.fillStyle(color, 0.35); g.fillCircle(c, c, size * 0.48);
    g.generateTexture(key, size, size);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function makeEmojiTexture(scene: Scene, key: string, emoji: string, fontPx = 96): boolean {
    if (scene.textures.exists(key)) return true;
    const size = 128;
    const ct = scene.textures.createCanvas(key, size, size);
    if (!ct) return false;
    const ctx = ct.context;
    ctx.clearRect(0, 0, size, size);
    ctx.font = `${fontPx}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + 6);
    ct.refresh();
    return true;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function makeQrTexture(scene: Scene, key: string, seed: number): boolean {
    if (scene.textures.exists(key)) return true;
    const size = 256, n = 13, cell = Math.floor(size / (n + 2)), off = Math.floor((size - cell * n) / 2);
    const ct = scene.textures.createCanvas(key, size, size);
    if (!ct) return false;
    const ctx = ct.context;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    ctx.fillStyle = '#0d0820';
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const inFinder = (i < 4 && j < 4) || (i < 4 && j >= n - 4) || (i >= n - 4 && j < 4);
            if (!inFinder && rnd() > 0.52) {
                ctx.fillRect(off + i * cell, off + j * cell, cell - 1, cell - 1);
            }
        }
    }
    const finder = (ox: number, oy: number) => {
        ctx.fillStyle = '#0d0820';
        ctx.fillRect(ox, oy, cell * 3, cell * 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + cell * 0.8, oy + cell * 0.8, cell * 1.4, cell * 1.4);
        ctx.fillStyle = '#0d0820';
        ctx.fillRect(ox + cell * 1.2, oy + cell * 1.2, cell * 0.6, cell * 0.6);
    };
    finder(off, off);
    finder(off + cell * (n - 3), off);
    finder(off, off + cell * (n - 3));
    ct.refresh();
    return true;
}

// ---------------------------------------------------------------------------
// Phaser bootstrap
// ---------------------------------------------------------------------------
const StartGame = (parent: string) => {
    const config: Phaser.Types.Core.GameConfig = {
        type: AUTO,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        parent,
        backgroundColor: '#0d0820',
        scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        scene: [Game],
    };
    const game = new PhaserGame({ ...config, parent });
    if (typeof window !== 'undefined') {
        (window as any).__PHASER_GAME__ = game;
        (window as any).__PHASER_EVENT_BUS__ = EventBus;
    }
    return game;
};

// ---------------------------------------------------------------------------
// THE GAME SCENE — modes: 'map' | 'catch' | 'reward'
// ---------------------------------------------------------------------------
interface MapMonster {
    sprite: Phaser.GameObjects.Image;
    emoji: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
    def: MonsterDef;
    tx: number; ty: number;
    retargetAt: number;
}

interface ThrowResult { label: string; mult: number; quality: number }

type Mode = 'map' | 'catch' | 'reward';

export class Game extends Scene {
    private mode: Mode = 'map';

    // ---- map mode ----
    private mapLayer!: Phaser.GameObjects.Container;
    private playerMarker!: Phaser.GameObjects.Image;
    private playerPulse!: Phaser.GameObjects.Image;
    private gpsLabel!: Phaser.GameObjects.Text;
    private proximityLabel!: Phaser.GameObjects.Text;
    private monsters: MapMonster[] = [];
    private monsterTimer!: Phaser.Time.TimerEvent;
    private wanderTimer!: Phaser.Time.TimerEvent;
    private sweepLine!: Phaser.GameObjects.Rectangle;
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private playerPos = { x: toMapX(0.5), y: toMapY(0.5) };

    // ---- catch mode ----
    private catchLayer!: Phaser.GameObjects.Container;
    private catchMonster!: Phaser.GameObjects.Image;
    private catchEmoji!: Phaser.GameObjects.Text;
    private catchRing!: Phaser.GameObjects.Image;
    private catchOrb!: Phaser.GameObjects.Image;
    private orbTrail!: Phaser.GameObjects.Particles.ParticleEmitter;
    private orbFlying = false;
    private orbHome = { x: GAME_WIDTH / 2, y: 830 };
    private ringR = 0;
    private ringActive = false;
    private ringT = 0;
    private throwsLeft = 5;
    private shakes = 0;
    private monsterInput: MonsterInput | null = null;
    private catchResult: 'pending' | 'success' | 'escaped' = 'pending';
    private throwsTotal = 0;
    private throwsNice = 0;
    private throwsGreat = 0;
    private throwsExcellent = 0;
    private catchStartAt = 0;
    private throwLabel!: Phaser.GameObjects.Text;
    private catchInfo!: Phaser.GameObjects.Text;
    private dragStart: { x: number; y: number; t: number } | null = null;

    // ---- reward mode ----
    private rewardLayer!: Phaser.GameObjects.Container;
    private starBurst!: Phaser.GameObjects.Particles.ParticleEmitter;
    private glowBurst!: Phaser.GameObjects.Particles.ParticleEmitter;
    private smokeBurst!: Phaser.GameObjects.Particles.ParticleEmitter;
    private revealing = false;

    constructor() { super('Game'); }

    preload() {
        this.load.image('fx_star', 'assets/fx/star.png');
        this.load.image('fx_glow', 'assets/fx/glow.png');
        this.load.image('fx_smoke', 'assets/fx/smoke.png');
        this.load.audio('sfx_button', 'assets/audio/sfx_button.mp3');
        this.load.audio('sfx_jump', 'assets/audio/sfx_jump.mp3');
        this.load.audio('sfx_collect', 'assets/audio/sfx_collect.mp3');
        this.load.audio('sfx_powerup', 'assets/audio/sfx_powerup.mp3');
        this.load.audio('sfx_win', 'assets/audio/sfx_win.mp3');
        this.load.audio('sfx_explosion', 'assets/audio/sfx_explosion.mp3');
        this.load.audio('sfx_hit', 'assets/audio/sfx_hit.mp3');
        this.load.audio('bgm_action', 'assets/audio/bgm_action.mp3');
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.BG_BOTTOM);

        // ---- procedural textures ----
        const g = this.add.graphics();
        for (const m of ALL_MONSTERS) makeBlobTexture(g, `blob_${m.id}`, elementColor(m.element));
        makeOrbTexture(g);
        makeRingTexture(g);
        makeStorePinTexture(g);
        makePlayerMarker(g);
        makeGlowDot(g, 'blip', 0x38BDF8, 24);
        g.destroy();

        // background gradient (always visible)
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x1a1033, 0x1a1033, 0x0d0820, 0x0d0820, 1);
        bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        bg.setDepth(-20);
        // subtle stars
        const stars = this.add.graphics();
        stars.setDepth(-19);
        for (let i = 0; i < 60; i++) {
            stars.fillStyle(0xffffff, 0.05 + Math.random() * 0.25);
            stars.fillCircle(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT, Math.random() * 1.8 + 0.4);
        }

        this.buildMapLayer();
        this.buildCatchLayer();
        this.buildRewardLayer();

        // ---- input ----
        this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,ESC,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.keyboard!.on('keydown-ESC', () => {
            if (this.mode === 'catch') {
                this.applyMode('map');
                EventBus.emit(EVT_PHASE_CHANGED, { phase: 'MAP' });
            }
        });
        EventBus.on(EVT_CANCEL_CATCH, this.cancelCatch, this);

        // ---- EventBus commands from React ----
        EventBus.on(EVT_START_CATCH, this.startCatch, this);
        EventBus.on(EVT_REWARD_START, this.runReward, this);
        EventBus.on(EVT_SET_MONSTER, this.setMapMonster, this);
        EventBus.on(EVT_MAP_BG, this.setMapBg, this);
        EventBus.on(EVT_RADAR_PING, this.radarPing, this);

        this.events.once('shutdown', () => {
            EventBus.off(EVT_CANCEL_CATCH, this.cancelCatch, this);
            EventBus.off(EVT_START_CATCH, this.startCatch, this);
            EventBus.off(EVT_REWARD_START, this.runReward, this);
            EventBus.off(EVT_SET_MONSTER, this.setMapMonster, this);
            EventBus.off(EVT_MAP_BG, this.setMapBg, this);
            EventBus.off(EVT_RADAR_PING, this.radarPing, this);
            this.monsterTimer?.remove();
            this.wanderTimer?.remove();
            this.sound.stopAll();
        });

        this.applyMode('map');
        EventBus.emit('current-scene-ready', this);
    }

    // =========================================================================
    // MAP MODE — live radar & GPS
    // =========================================================================
    private buildMapLayer() {
        this.mapLayer = this.add.container(0, 0).setDepth(1);

        // radar arena
        const arena = this.add.graphics();
        arena.fillStyle(0x140d2b, 1);
        arena.fillRoundedRect(24, 140, GAME_WIDTH - 48, GAME_HEIGHT - 380, 22);
        arena.lineStyle(2, 0x38BDF8, 0.5);
        arena.strokeRoundedRect(24, 140, GAME_WIDTH - 48, GAME_HEIGHT - 380, 22);
        this.mapLayer.add(arena);

        // grid
        const grid = this.add.graphics();
        grid.lineStyle(1, 0x38BDF8, 0.08);
        for (let x = 60; x < GAME_WIDTH - 30; x += 48) grid.lineBetween(x, 150, x, GAME_HEIGHT - 250);
        for (let y = 170; y < GAME_HEIGHT - 240; y += 48) grid.lineBetween(30, y, GAME_WIDTH - 30, y);
        this.mapLayer.add(grid);

        // radar rings
        const rings = this.add.graphics();
        rings.lineStyle(1, 0x38BDF8, 0.25);
        for (let r = 60; r <= 240; r += 60) rings.strokeCircle(GAME_WIDTH / 2, 470, r);
        this.mapLayer.add(rings);

        // sweeping radar line
        this.sweepLine = this.add.rectangle(GAME_WIDTH / 2, 470, 240, 3, 0x38BDF8, 0.28);
        this.sweepLine.setOrigin(0, 0.5);
        this.mapLayer.add(this.sweepLine);

        // streets (decorative)
        const streets = this.add.graphics();
        streets.lineStyle(6, 0x2d1b69, 0.7);
        streets.lineBetween(30, 330, GAME_WIDTH - 30, 300);
        streets.lineBetween(150, 150, 190, GAME_HEIGHT - 250);
        streets.lineBetween(30, 620, GAME_WIDTH - 30, 660);
        this.mapLayer.add(streets);

        // business pins
        for (const b of BUSINESS_PINS) {
            const pin = this.add.image(toMapX(b.x), toMapY(b.y), 'store_pin').setScale(0.8);
            const name = this.add.text(toMapX(b.x), toMapY(b.y) + 30, `${b.name} ×${b.mult}`, {
                fontFamily: 'Arial', fontSize: '10px', color: '#FBBF24',
                backgroundColor: 'rgba(13,8,32,0.7)', padding: { x: 4, y: 2 },
            }).setOrigin(0.5, 0);
            this.mapLayer.add([pin, name]);
        }

        // player marker + GPS pulse
        this.playerPulse = this.add.image(this.playerPos.x, this.playerPos.y, 'blip').setTint(0x38BDF8).setDepth(2);
        this.tweens.add({ targets: this.playerPulse, scale: { from: 0.6, to: 2.4 }, alpha: { from: 0.8, to: 0 }, duration: 1600, repeat: -1 });
        this.playerMarker = this.add.image(this.playerPos.x, this.playerPos.y, 'player_marker').setDepth(3);
        this.mapLayer.add([this.playerPulse, this.playerMarker]);

        this.gpsLabel = this.add.text(this.playerPos.x, this.playerPos.y - 42, '9.0222 N, 38.7468 E', {
            fontFamily: 'monospace', fontSize: '11px', color: '#38BDF8',
            backgroundColor: 'rgba(13,8,32,0.8)', padding: { x: 6, y: 3 },
        }).setOrigin(0.5).setDepth(4);
        this.mapLayer.add(this.gpsLabel);

        this.proximityLabel = this.add.text(GAME_WIDTH / 2, 128, ' ', {
            fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#10B981',
            backgroundColor: 'rgba(13,8,32,0.85)', padding: { x: 10, y: 5 },
        }).setOrigin(0.5).setDepth(6);
        this.mapLayer.add(this.proximityLabel);

        const hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 222, 'TAP A WILD MONSTER TO ENGAGE  •  WASD / ARROWS TO MOVE', {
            fontFamily: 'Arial', fontSize: '10px', color: '#a0a0c0',
        }).setOrigin(0.5).setDepth(4);
        this.mapLayer.add(hint);
    }

    private spawnMapMonster() {
        if (this.monsters.length >= 5) return;
        const roll = Math.random() * 100;
        const rarity: Rarity = roll < 55 ? 'common' : roll < 80 ? 'rare' : roll < 94 ? 'epic' : 'legendary';
        const pool = ALL_MONSTERS.filter(m => m.rarity === rarity);
        const def = pool[Math.floor(Math.random() * pool.length)] ?? ALL_MONSTERS[0];
        if (this.monsters.some(m => m.def.id === def.id)) return;

        const x = toMapX(0.08 + Math.random() * 0.84);
        const y = toMapY(0.08 + Math.random() * 0.84);
        const sprite = this.add.image(x, y, `blob_${def.id}`).setScale(0.55).setInteractive({ useHandCursor: true });
        const emoji = this.add.text(x, y - 6, def.emoji, { fontSize: '22px' }).setOrigin(0.5).setDepth(2);
        const label = this.add.text(x, y + 34, `${def.name}  ${Math.round(Math.hypot(x - this.playerPos.x, y - this.playerPos.y) / 14)}m`, {
            fontFamily: 'Arial', fontSize: '10px', fontStyle: 'bold', color: RARITY_COLORS[def.rarity],
            backgroundColor: 'rgba(13,8,32,0.8)', padding: { x: 5, y: 2 },
        }).setOrigin(0.5, 0).setDepth(2);
        this.mapLayer.add([sprite, emoji, label]);

        sprite.on('pointerdown', () => {
            if (this.mode !== 'map') return;
            const dist = Math.hypot(x - this.playerPos.x, y - this.playerPos.y);
            const lat = 9.0222 + (0.5 - fromMapY(y)) * 0.012;
            const lng = 38.7468 + (fromMapX(x) - 0.5) * 0.016;
            EventBus.emit(EVT_MONSTER_ENGAGE, {
                monster: def, escapeRate: escapeRateFor(def.rarity),
                source: 'map', bonus: 0, lat, lng,
            } as EngagePayload);
            this.safePlay('sfx_button');
        });

        this.tweens.add({ targets: sprite, scaleY: 0.62, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        this.monsters.push({
            sprite, emoji, label, def,
            tx: x, ty: y, retargetAt: 0,
        });
    }

    private removeMapMonster(index: number) {
        const m = this.monsters[index];
        if (!m) return;
        this.tweens.add({
            targets: [m.sprite, m.emoji, m.label], alpha: 0, duration: 400,
            onComplete: () => { m.sprite.destroy(); m.emoji.destroy(); m.label.destroy(); },
        });
        this.monsters.splice(index, 1);
    }

    private setMapMonster(id: string | null) {
        if (this.mode !== 'map') return;
        if (!id) return;
        const idx = this.monsters.findIndex(m => m.def.id === id);
        if (idx >= 0) this.removeMapMonster(idx);
    }

    private setMapBg(legendaryActive: boolean) {
        if (this.mode !== 'map') return;
        this.cameras.main.setBackgroundColor(legendaryActive ? '#241033' : '#0d0820');
    }

    private radarPing(data: { x: number; y: number }) {
        if (this.mode !== 'map' || !data) return;
        const px = toMapX(data.x), py = toMapY(data.y);
        const ping = this.add.image(px, py, 'blip').setTint(0xF59E0B).setDepth(5);
        this.tweens.add({
            targets: ping, scale: { from: 0.4, to: 3 }, alpha: { from: 0.9, to: 0 },
            duration: 900, onComplete: () => ping.destroy(),
        });
        this.safePlay('sfx_collect', 0.25);
    }

    // =========================================================================
    // CATCH MODE — flick & throw physics mini-game
    // =========================================================================
    private buildCatchLayer() {
        this.catchLayer = this.add.container(0, 0).setDepth(2).setVisible(false);

        const vignette = this.add.graphics();
        vignette.fillStyle(0x0d0820, 0.55);
        vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.catchLayer.add(vignette);

        // ground shadow
        const shadow = this.add.ellipse(GAME_WIDTH / 2, 560, 220, 34, 0x000000, 0.35);
        this.catchLayer.add(shadow);

        this.catchRing = this.add.image(GAME_WIDTH / 2, 400, 'ring').setDepth(3).setVisible(false);

        this.catchMonster = this.add.image(GAME_WIDTH / 2, 400, 'blob_m1').setScale(1.9).setDepth(4);
        this.catchEmoji = this.add.text(GAME_WIDTH / 2, 384, '🔥', { fontSize: '72px' }).setOrigin(0.5).setDepth(5);
        this.catchLayer.add([this.catchMonster, this.catchEmoji]);

        this.throwLabel = this.add.text(GAME_WIDTH / 2, 250, ' ', {
            fontFamily: 'Arial', fontSize: '34px', fontStyle: 'bold', color: '#FBBF24',
            stroke: '#0d0820', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(10).setAlpha(0);
        this.catchLayer.add(this.throwLabel);

        this.catchInfo = this.add.text(GAME_WIDTH / 2, 640, ' ', {
            fontFamily: 'Arial', fontSize: '14px', color: '#a0a0c0', align: 'center',
        }).setOrigin(0.5).setDepth(6);
        this.catchLayer.add(this.catchInfo);

        const throwHint = this.add.text(GAME_WIDTH / 2, 900, 'FLICK UPWARD TO THROW  •  HIT THE SHRINKING RING FOR BONUS', {
            fontFamily: 'Arial', fontSize: '11px', color: '#38BDF8',
            backgroundColor: 'rgba(13,8,32,0.8)', padding: { x: 10, y: 6 },
        }).setOrigin(0.5).setDepth(6);
        this.catchLayer.add(throwHint);

        this.orbTrail = this.add.particles(0, 0, 'fx_glow', {
            speed: 20, scale: { start: 0.5, end: 0 }, lifespan: 350, alpha: { start: 0.7, end: 0 },
            emitting: false,
        });
        this.orbTrail.setDepth(8);
        this.catchLayer.add(this.orbTrail);

        this.catchOrb = this.add.image(this.orbHome.x, this.orbHome.y, 'orb').setScale(0.9).setDepth(9);
        this.catchLayer.add(this.catchOrb);
        this.tweens.add({ targets: this.catchOrb, y: this.orbHome.y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    private cancelCatch() {
        if (this.mode === 'catch' || this.mode === 'reward') this.applyMode('map');
    }

    private startCatch(data: { monster: MonsterInput }) {
        const m = data?.monster;
        if (!m) return;
        this.catchMonster.setAlpha(1);
        this.catchOrb.setAlpha(1);
        this.monsterInput = m;
        this.throwsLeft = m.rarity === 'legendary' ? 7 : m.rarity === 'epic' ? 6 : 5;
        this.shakes = 0;
        this.catchResult = 'pending';
        this.throwsTotal = 0;
        this.throwsNice = 0; this.throwsGreat = 0; this.throwsExcellent = 0;
        this.catchStartAt = this.time.now;
        this.ringActive = false;

        makeEmojiTexture(this, `emoji_${m.id}`, m.emoji);
        this.catchMonster.setTexture(`blob_${m.id}`);
        this.catchEmoji.setText(m.emoji).setVisible(true);
        this.catchMonster.setPosition(GAME_WIDTH / 2, 400).setScale(1.9).setAngle(0).setTint(0xffffff).setDepth(4);
        this.catchEmoji.setPosition(GAME_WIDTH / 2, 384);
        this.catchInfo.setText(`${m.name.toUpperCase()}  •  CP ${m.cp}  •  ${m.element}  •  ${m.rarity.toUpperCase()}`);
        this.throwLabel.setAlpha(0);
        this.resetOrb();

        this.tweens.add({ targets: this.catchMonster, y: 388, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        this.applyMode('catch');
        this.armRing();
    }

    private armRing() {
        if (this.catchResult !== 'pending') return;
        this.ringActive = true;
        this.ringT = 0;
        this.ringR = 150;
        this.catchRing.setVisible(true).setPosition(GAME_WIDTH / 2, 400).setScale(1).setTint(0x38BDF8);
    }

    private resetOrb() {
        this.orbFlying = false;
        this.catchOrb.setVisible(true).setPosition(this.orbHome.x, this.orbHome.y).setScale(0.9).setAngle(0);
        this.orbTrail.stopFollow();
    }

    private onPointerDown(pointer: Phaser.Input.Pointer) {
        if (this.mode !== 'catch' || this.orbFlying || this.catchResult !== 'pending') return;
        if (pointer.y < 500) return; // only grab the orb from the lower zone
        this.dragStart = { x: pointer.x, y: pointer.y, t: this.time.now };
        this.catchOrb.setPosition(pointer.x, pointer.y);
    }

    private onPointerMove(pointer: Phaser.Input.Pointer) {
        if (this.mode !== 'catch' || !this.dragStart || this.orbFlying) return;
        this.catchOrb.setPosition(
            Phaser.Math.Clamp(pointer.x, 30, GAME_WIDTH - 30),
            Phaser.Math.Clamp(pointer.y, 120, GAME_HEIGHT - 60),
        );
    }

    private onPointerUp(pointer: Phaser.Input.Pointer) {
        if (this.mode !== 'catch' || !this.dragStart || this.orbFlying) { this.dragStart = null; return; }
        const ds = this.dragStart;
        this.dragStart = null;
        const dt = Math.max(16, this.time.now - ds.t);
        const vy = (pointer.y - ds.y) / dt * 1000;
        const vx = (pointer.x - ds.x) / dt * 1000;
        // require an upward flick
        if (vy < -250) {
            this.launchOrb(Phaser.Math.Clamp(vx, -900, 900), Math.max(-1500, vy));
        } else {
            this.resetOrb();
        }
    }

    private launchOrb(vx: number, vy: number) {
        this.orbFlying = true;
        this.ringActive = false;
        this.catchRing.setVisible(false);
        this.throwsTotal++;
        this.safePlay('sfx_jump', 0.5);
        const speed = Math.hypot(vx, vy);
        const dur = Phaser.Math.Clamp((this.catchOrb.y - 380) / Math.max(300, speed) * 900, 320, 700);
        this.tweens.add({
            targets: this.catchOrb,
            x: GAME_WIDTH / 2 + vx * 0.18,
            y: 380,
            angle: 720,
            duration: dur,
            ease: 'Cubic.easeOut',
            onComplete: () => this.resolveThrow(),
        });
        this.orbTrail.startFollow(this.catchOrb);
        this.orbTrail.explode(10);
    }

    private qualityFromRing(): ThrowResult {
        const r = this.ringR;
        if (r <= 45) return { label: 'EXCELLENT!', mult: 2.0, quality: 3 };
        if (r <= 80) return { label: 'GREAT!', mult: 1.5, quality: 2 };
        if (r <= 120) return { label: 'NICE!', mult: 1.2, quality: 1 };
        return { label: 'OK', mult: 1.0, quality: 0 };
    }

    private resolveThrow() {
        if (this.mode !== 'catch' || !this.monsterInput || this.catchResult !== 'pending') return;
        this.orbTrail.stopFollow();
        const res = this.qualityFromRing();
        if (res.quality === 3) this.throwsExcellent++;
        else if (res.quality === 2) this.throwsGreat++;
        else if (res.quality === 1) this.throwsNice++;

        // dodge chance for rare+ monsters on fast throws
        const dodgeChance = this.monsterInput.rarity === 'common' ? 0 : this.monsterInput.rarity === 'rare' ? 0.12 : 0.2;
        const dodged = Math.random() < dodgeChance && res.quality < 2;

        this.throwLabel.setText(res.label).setColor(res.quality >= 2 ? '#FBBF24' : '#38BDF8').setAlpha(1).setScale(1.3);
        this.tweens.add({ targets: this.throwLabel, alpha: 0, scale: 1, duration: 700 });

        if (dodged) {
            this.safePlay('sfx_hit', 0.5);
            this.tweens.add({ targets: this.catchMonster, x: GAME_WIDTH / 2 + 60, duration: 120, yoyo: true, repeat: 1 });
            this.endThrow(false, 1);
            return;
        }

        this.safePlay('sfx_collect', 0.6);
        this.cameras.main.shake(120, 0.004);
        this.tweens.add({
            targets: this.catchMonster, tint: RARITY_HEX[this.monsterInput.rarity] ?? 0xffffff,
            duration: 120, yoyo: true, repeat: 1,
        });
        this.endThrow(true, res.mult);
    }

    private endThrow(hit: boolean, mult: number) {
        if (!this.monsterInput) return;
        this.resetOrb();
        if (hit) {
            this.shakes++;
            const escape = Math.min(0.95, this.monsterInput.escapeRate / Math.pow(1.45, mult - 1) / Math.pow(1.25, this.shakes - 1));
            const caught = Math.random() > escape;
            this.catchInfo.setText(`SHAKES ${this.shakes}  •  CATCH CHANCE ${Math.round((1 - escape) * 100)}%`);
            if (caught) {
                this.finishCatch(true);
                return;
            }
            // shake animation
            this.tweens.add({
                targets: this.catchMonster, angle: { from: -14, to: 14 }, duration: 110, repeat: 5, yoyo: true,
                onComplete: () => { this.catchMonster.setAngle(0); this.armRing(); },
            });
            this.tweens.add({ targets: this.catchEmoji, angle: { from: -14, to: 14 }, duration: 110, repeat: 5, yoyo: true, onComplete: () => this.catchEmoji.setAngle(0) });
            return;
        }
        this.catchInfo.setText(`MISS!  ${this.throwsLeft > 0 ? 'TRY AGAIN' : ''}`);
        if (this.throwsLeft > 0) this.armRing();
        else this.finishCatch(false);
    }

    private finishCatch(success: boolean) {
        if (!this.monsterInput || this.catchResult !== 'pending') return;
        this.catchResult = success ? 'success' : 'escaped';
        this.ringActive = false;
        this.catchRing.setVisible(false);
        this.tweens.chain({
            targets: this.catchOrb,
            tweens: [
                { y: this.catchMonster.y - 40, duration: 220, ease: 'Cubic.easeIn' },
                { y: this.catchMonster.y, duration: 120 },
            ],
        });
        this.catchMonster.setDepth(2);
        this.catchEmoji.setVisible(false);

        if (success) {
            this.safePlay('sfx_win', 0.7);
            this.starBurst.setPosition(GAME_WIDTH / 2, 400);
            this.glowBurst.setPosition(GAME_WIDTH / 2, 400);
            this.time.delayedCall(260, () => {
                this.starBurst.explode(30);
                this.glowBurst.explode(14);
                this.tweens.add({ targets: [this.catchMonster, this.catchOrb], alpha: 0, scale: 0.2, duration: 350 });
            });
            const elapsed = (this.time.now - this.catchStartAt) / 1000;
            const score = Math.round(this.monsterInput.points * (1 + this.throwsExcellent * 0.3 + this.throwsGreat * 0.2 + this.throwsNice * 0.1) + Math.max(0, 30 - elapsed) * 2);
            this.time.delayedCall(1100, () => {
                EventBus.emit(EVT_CATCH_SUCCESS, { monster: this.monsterInput, score, critical: this.throwsExcellent > 0 });
            });
        } else {
            this.safePlay('sfx_explosion', 0.6);
            this.smokeBurst.setPosition(GAME_WIDTH / 2, 400);
            this.smokeBurst.explode(16);
            this.tweens.add({
                targets: this.catchMonster, alpha: 0, x: GAME_WIDTH + 80, angle: 40, duration: 600,
                onComplete: () => this.catchEmoji.setVisible(false),
            });
            this.time.delayedCall(900, () => {
                EventBus.emit(EVT_CATCH_ESCAPED, { monster: this.monsterInput });
            });
        }
    }

    // =========================================================================
    // REWARD MODE — celebratory card reveal
    // =========================================================================
    private buildRewardLayer() {
        this.rewardLayer = this.add.container(0, 0).setDepth(3).setVisible(false);

        this.starBurst = this.add.particles(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'fx_star', {
            speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 }, lifespan: 1400, gravityY: 180,
            emitting: false, quantity: 35,
        }).setDepth(20);
        this.glowBurst = this.add.particles(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'fx_glow', {
            speed: { min: 60, max: 200 }, angle: { min: 0, max: 360 },
            scale: { start: 0.7, end: 0 }, lifespan: 1800, alpha: { start: 0.7, end: 0 },
            emitting: false, quantity: 18,
        }).setDepth(19);
        this.smokeBurst = this.add.particles(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'fx_smoke', {
            speed: { min: 30, max: 120 }, angle: { min: 200, max: 340 },
            scale: { start: 0.8, end: 0 }, lifespan: 1200, alpha: { start: 0.6, end: 0 },
            emitting: false, quantity: 14,
        }).setDepth(18);
        this.rewardLayer.add([this.starBurst, this.glowBurst, this.smokeBurst]);
    }

    private runReward(data: MonsterInput) {
        if (!data || this.revealing) return;
        this.revealing = true;
        this.applyMode('reward');

        const g = this.add.graphics();
        const rc = RARITY_HEX[data.rarity] ?? 0x94A3B8;
        g.fillStyle(0x1e1e3f, 1).fillRoundedRect(-80, -115, 160, 230, 14);
        g.lineStyle(4, rc, 1).strokeRoundedRect(-80, -115, 160, 230, 14);
        g.fillStyle(rc, 0.25).fillRoundedRect(-68, -103, 136, 120, 10);
        g.fillStyle(rc, 1).fillRoundedRect(-50, 30, 100, 22, 8);
        g.generateTexture(`card_${data.id}`, 160, 230);
        g.destroy();

        const card = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, `card_${data.id}`)
            .setScale(0).setAngle(-180).setDepth(15);
        makeEmojiTexture(this, `emoji_${data.id}`, data.emoji);
        const emoji = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, `emoji_${data.id}`)
            .setScale(0).setDepth(16);
        const name = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 42, data.name, {
            fontFamily: 'Arial', fontSize: '24px', fontStyle: 'bold', color: RARITY_COLORS[data.rarity],
        }).setOrigin(0.5).setDepth(16).setAlpha(0);
        const rarityTag = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 76, `${data.rarity.toUpperCase()}  •  +${data.points} PTS`, {
            fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#FBBF24',
        }).setOrigin(0.5).setDepth(16).setAlpha(0);

        this.rewardLayer.add([card, emoji, name, rarityTag]);
        this.safePlay('sfx_powerup', 0.7);

        this.tweens.add({
            targets: card, scale: 1.15, angle: 0, duration: 700, ease: 'Back.easeOut',
            onComplete: () => {
                this.tweens.add({ targets: card, scale: 1, duration: 300 });
                this.tweens.add({ targets: emoji, scale: 1.4, duration: 400, ease: 'Back.easeOut', delay: 150 });
                this.tweens.add({ targets: [name, rarityTag], alpha: 1, duration: 400, delay: 350 });
                this.starBurst.explode(35);
                this.glowBurst.explode(18);
                this.safePlay('sfx_win', 0.6);
                this.time.delayedCall(2000, () => {
                    card.destroy(); emoji.destroy(); name.destroy(); rarityTag.destroy();
                    this.revealing = false;
                    this.applyMode('map');
                    EventBus.emit(EVT_REWARD_COMPLETE, data);
                });
            },
        });
    }

    // =========================================================================
    // MODE SWITCHING + PER-FRAME
    // =========================================================================
    private applyMode(mode: Mode) {
        if (this.mode === mode && mode !== 'map') return;
        this.mode = mode;
        this.mapLayer.setVisible(mode === 'map');
        this.catchLayer.setVisible(mode === 'catch');
        this.rewardLayer.setVisible(mode === 'reward');

        if (mode === 'map') {
            if (!this.monsterTimer) {
                this.spawnMapMonster(); this.spawnMapMonster(); this.spawnMapMonster();
                this.monsterTimer = this.time.addEvent({ delay: 4200, loop: true, callback: () => this.spawnMapMonster() });
                this.wanderTimer = this.time.addEvent({
                    delay: 2600, loop: true, callback: () => {
                        for (const m of this.monsters) {
                            m.tx = toMapX(0.08 + Math.random() * 0.84);
                            m.ty = toMapY(0.08 + Math.random() * 0.84);
                        }
                    },
                });
            }
        } else {
            this.monsterTimer?.remove(); this.monsterTimer = undefined as unknown as Phaser.Time.TimerEvent;
            this.wanderTimer?.remove(); this.wanderTimer = undefined as unknown as Phaser.Time.TimerEvent;
            if (mode === 'catch') {
                this.playerPos.x = toMapX(0.5); this.playerPos.y = toMapY(0.5);
            }
        }
        EventBus.emit(EVT_MODE_CHANGED, mode);
    }

    update(_time: number, delta: number) {
        const dt = Math.min(0.05, delta / 1000);

        if (this.mode === 'map') {
            // keyboard movement
            const speed = 170;
            let mx = 0, my = 0;
            if (this.keys.A?.isDown || this.keys.LEFT?.isDown) mx -= 1;
            if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) mx += 1;
            if (this.keys.W?.isDown || this.keys.UP?.isDown) my -= 1;
            if (this.keys.S?.isDown || this.keys.DOWN?.isDown) my += 1;
            if (mx !== 0 || my !== 0) {
                const len = Math.hypot(mx, my);
                this.movePlayer(this.playerPos.x + (mx / len) * speed * dt, this.playerPos.y + (my / len) * speed * dt);
            }

            // radar sweep
            this.sweepLine.rotation += dt * 0.8;

            // wander monsters toward targets
            for (const m of this.monsters) {
                const dx = m.tx - m.sprite.x, dy = m.ty - m.sprite.y;
                const d = Math.hypot(dx, dy);
                if (d > 4) {
                    m.sprite.x += (dx / d) * 26 * dt;
                    m.sprite.y += (dy / d) * 26 * dt;
                    m.emoji.x = m.sprite.x; m.emoji.y = m.sprite.y - 6;
                }
                const dist = Math.hypot(m.sprite.x - this.playerPos.x, m.sprite.y - this.playerPos.y);
                m.label.x = m.sprite.x; m.label.y = m.sprite.y + 34;
                m.label.setText(`${m.def.name}  ${Math.round(dist / 14)}m`);
                m.sprite.setTint(dist < 90 ? 0xffffff : 0xbfbfbf);
            }

            // proximity alert
            let nearest: MapMonster | null = null; let nd = Infinity;
            for (const m of this.monsters) {
                const d = Math.hypot(m.sprite.x - this.playerPos.x, m.sprite.y - this.playerPos.y);
                if (d < nd) { nd = d; nearest = m; }
            }
            if (nearest && nd < 90) {
                this.proximityLabel.setText(`⚠ ${nearest.def.name.toUpperCase()} NEARBY — TAP TO ENGAGE`).setColor('#EF4444').setVisible(true);
            } else if (nearest) {
                this.proximityLabel.setText(`RADAR LOCK: ${nearest.def.name} • ${Math.round(nd / 14)}m`).setColor('#10B981').setVisible(true);
            } else {
                this.proximityLabel.setText('SCANNING FOR SIGNATURES...').setColor('#38BDF8').setVisible(true);
            }
        }

        if (this.mode === 'catch' && this.ringActive) {
            this.ringT += dt;
            this.ringR = 150 - (this.ringT / 1.5) * 118;
            if (this.ringR <= 30) {
                // timed out — auto-throw at worst quality
                this.ringActive = false;
                this.catchRing.setVisible(false);
                this.throwsLeft = Math.max(0, this.throwsLeft - 1);
                this.throwLabel.setText('TOO SLOW').setColor('#EF4444').setAlpha(1);
                this.tweens.add({ targets: this.throwLabel, alpha: 0, duration: 600 });
                if (this.throwsLeft <= 0) this.finishCatch(false);
                else this.endThrow(false, 1);
                return;
            }
            const q = this.ringR <= 45 ? 0xFBBF24 : this.ringR <= 80 ? 0x10B981 : 0x38BDF8;
            this.catchRing.setScale(this.ringR / 124).setTint(q);
        }
    }

    private movePlayer(x: number, y: number) {
        this.playerPos.x = Phaser.Math.Clamp(x, MAP_X0, MAP_X1);
        this.playerPos.y = Phaser.Math.Clamp(y, MAP_Y0, MAP_Y1);
        this.playerMarker.setPosition(this.playerPos.x, this.playerPos.y);
        this.playerPulse.setPosition(this.playerPos.x, this.playerPos.y);
        const lat = 9.0222 + (0.5 - fromMapY(this.playerPos.y)) * 0.012;
        const lng = 38.7468 + (fromMapX(this.playerPos.x) - 0.5) * 0.016;
        this.gpsLabel.setPosition(this.playerPos.x, this.playerPos.y - 42);
        this.gpsLabel.setText(`${lat.toFixed(4)} N, ${lng.toFixed(4)} E`);
    }

    /** Exposed for React: move the GPS avatar to a normalized map position. */
    public setPlayerPosition(nx: number, ny: number) {
        if (this.mode !== 'map') return;
        this.movePlayer(toMapX(nx), toMapY(ny));
    }

    private safePlay(key: string, volume = 0.6) {
        if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
    }
}

export default StartGame;