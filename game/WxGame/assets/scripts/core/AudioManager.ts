import { eventBus, GameEvents } from './EventBus';
import { GameConfig } from './GameConfig';
import { DEFAULT_SAVE } from './SaveData';
import { GameSettings } from './types';

export type SfxId =
    | 'ui'
    | 'hit'
    | 'kill'
    | 'coin'
    | 'heart'
    | 'clear'
    | 'portal'
    | 'die'
    | 'clear_run'
    | 'intro';

export type BgmMode = 'lobby' | 'combat' | 'boss';

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number };

/**
 * AudioManager —— 合成 SFX / 像素风 BGM（H3→H4）
 * Web Audio 程序音：无资源包体积压力。正式 wav/mp3 后可替换 play* 实现。
 */
export class AudioManager {
    private static _wired = false;
    private static _ctx: AudioContext | null = null;
    private static _bgmGain: GainNode | null = null;
    private static _bgmMode: BgmMode = 'lobby';
    private static _bgmStep = 0;
    private static _bgmPump: ReturnType<typeof setTimeout> | null = null;
    private static _sfxVol = DEFAULT_SAVE.settings.sfxVolume;
    private static _bgmVol = DEFAULT_SAVE.settings.bgmVolume;
    private static _lastUiAt = 0;
    private static _lastCombatAt = 0;
    private static _lastVoiceAt = 0;

    static ensure(settings?: Readonly<GameSettings>) {
        if (settings) AudioManager.applySettings(settings);
        if (AudioManager._wired) return;
        AudioManager._wired = true;

        eventBus.on(GameEvents.AUDIO_SETTINGS_CHANGED, AudioManager._onSettings, AudioManager);
        eventBus.on(GameEvents.ENEMY_KILLED, AudioManager._onKill, AudioManager);
        eventBus.on(GameEvents.ITEM_PICKED, AudioManager._onItem, AudioManager);
        eventBus.on(GameEvents.ROOM_CLEARED, () => AudioManager.playSfx('clear'), AudioManager);
        eventBus.on(GameEvents.ROOM_ENTERED, () => AudioManager.playSfx('portal'), AudioManager);
        eventBus.on(GameEvents.FLOOR_STARTED, AudioManager._onFloor, AudioManager);
        eventBus.on(GameEvents.PLAYER_DIED, () => {
            AudioManager.stopBgm();
            AudioManager.playSfx('die');
        }, AudioManager);
        eventBus.on(GameEvents.GAME_CLEARED, () => {
            AudioManager.stopBgm();
            AudioManager.playSfx('clear_run');
        }, AudioManager);
    }

    static applySettings(s: Readonly<GameSettings>) {
        AudioManager._sfxVol = s.sfxVolume ?? 0;
        AudioManager._bgmVol = s.bgmVolume ?? 0;
        if (AudioManager._bgmVol <= 0.001) AudioManager.stopBgm();
        else if (AudioManager._bgmGain && AudioManager._ctx) {
            const level = AudioManager._bgmLevel();
            AudioManager._bgmGain.gain.setTargetAtTime(level, AudioManager._ctx.currentTime, 0.05);
            if (!AudioManager._bgmPump) AudioManager._pumpBgm();
        }
    }

    static playSfx(id: SfxId) {
        if (!AudioManager._gated('ui')) return;
        AudioManager._playTones(AudioManager._tones(id), 1);
    }

    static playUi() {
        AudioManager.playSfx('ui');
    }

    /** 角色专属短台词（合成动机，非真人语音） */
    static playVoice(characterId: string) {
        if (!AudioManager._gated('voice')) return;
        AudioManager._playTones(AudioManager._voiceTones(characterId), 1.05);
    }

    /** 角色受击短吟（同动机降半音） */
    static playHurt(characterId: string) {
        if (!AudioManager._gated('voice')) return;
        const tones = AudioManager._voiceTones(characterId).map(t => ({
            ...t,
            freq: Math.max(60, t.freq * 0.72),
            dur: Math.min(0.09, t.dur * 0.85),
            gain: (t.gain ?? 1) * 0.85,
        }));
        AudioManager._playTones(tones.slice(0, 2), 0.9);
    }

    /** 道具使用 / 投掷 */
    static playItem(kind: 'throw' | 'bomb' | 'heal' | 'buff') {
        if (!AudioManager._gated('combat')) return;
        AudioManager._playTones(AudioManager._itemTones(kind), 1);
    }

    /** 武器专属攻击音 */
    static playWeapon(weaponId: string) {
        if (!AudioManager._gated('combat')) return;
        AudioManager._playTones(AudioManager._weaponTones(weaponId), 0.95);
    }

    /** 怪物专属攻击音 */
    static playEnemyAttack(kind: string) {
        if (!AudioManager._gated('combat')) return;
        AudioManager._playTones(AudioManager._enemyTones(kind), 0.9);
    }

    /** 怪物受击短音（攻击音压缩） */
    static playEnemyHurt(kind: string) {
        if (!AudioManager._gated('combat')) return;
        const tones = AudioManager._enemyTones(kind).map(t => ({
            ...t,
            freq: Math.max(50, t.freq * 0.65),
            dur: Math.min(0.06, t.dur * 0.7),
            gain: (t.gain ?? 1) * 0.7,
        }));
        AudioManager._playTones(tones.slice(0, 1), 0.8);
    }

    static startBgm(mode: BgmMode = 'combat') {
        if (!AudioManager._wired) AudioManager.ensure();
        if (AudioManager._bgmVol <= 0.001) {
            AudioManager.stopBgm();
            return;
        }
        const ctx = AudioManager._audio();
        if (!ctx) return;

        const same = AudioManager._bgmGain && AudioManager._bgmMode === mode && AudioManager._bgmPump;
        if (same) {
            AudioManager._bgmGain!.gain.setTargetAtTime(AudioManager._bgmLevel(), ctx.currentTime, 0.08);
            return;
        }

        AudioManager.stopBgm();
        AudioManager._bgmMode = mode;
        AudioManager._bgmStep = 0;

        const gain = ctx.createGain();
        gain.gain.value = AudioManager._bgmLevel();
        gain.connect(ctx.destination);
        AudioManager._bgmGain = gain;
        AudioManager._pumpBgm();
    }

    static stopBgm() {
        if (AudioManager._bgmPump != null) {
            clearTimeout(AudioManager._bgmPump);
            AudioManager._bgmPump = null;
        }
        try { AudioManager._bgmGain?.disconnect(); } catch { /* */ }
        AudioManager._bgmGain = null;
    }

    private static _bgmLevel() {
        const mul = AudioManager._bgmMode === 'lobby' ? 0.055
            : AudioManager._bgmMode === 'boss' ? 0.1
            : 0.078;
        return Math.max(0, Math.min(1, AudioManager._bgmVol * GameConfig.BGM_VOLUME * mul));
    }

    private static _onSettings(s: GameSettings) {
        AudioManager.applySettings(s);
        if (AudioManager._bgmVol > 0.001 && !AudioManager._bgmGain) {
            AudioManager.startBgm(AudioManager._bgmMode);
        }
    }

    private static _onKill(d: { enemyId?: string }) {
        AudioManager.playSfx(d?.enemyId === 'boss' ? 'clear' : 'kill');
    }

    private static _onItem(d: { kind?: string }) {
        if (d?.kind === 'heart') AudioManager.playSfx('heart');
        else AudioManager.playSfx('coin');
    }

    private static _onFloor() {
        AudioManager.startBgm('combat');
        AudioManager.playSfx('portal');
    }

    private static _gated(kind: 'ui' | 'combat' | 'voice'): boolean {
        if (!AudioManager._wired) AudioManager.ensure();
        if (AudioManager._sfxVol <= 0.001) return false;
        const now = Date.now();
        if (kind === 'ui') {
            if (now - AudioManager._lastUiAt < 30) return false;
            AudioManager._lastUiAt = now;
        } else if (kind === 'combat') {
            if (now - AudioManager._lastCombatAt < 42) return false;
            AudioManager._lastCombatAt = now;
        } else {
            if (now - AudioManager._lastVoiceAt < 220) return false;
            AudioManager._lastVoiceAt = now;
        }
        return true;
    }

    private static _playTones(tones: Tone[], volScale: number) {
        if (!tones.length) return;
        const ctx = AudioManager._audio();
        if (!ctx) return;
        const master = Math.max(0, Math.min(1, AudioManager._sfxVol * GameConfig.SFX_VOLUME * volScale));
        let t = ctx.currentTime;
        for (const tone of tones) {
            AudioManager._beep(ctx, tone.freq, tone.dur, master * (tone.gain ?? 1), tone.type ?? 'square', t);
            t += tone.dur * 0.52;
        }
    }

    /** 大厅轻柔 / 探索紧张 / Boss 压迫 —— 小调像素琶音循环 */
    private static _pumpBgm() {
        const ctx = AudioManager._audio();
        const gain = AudioManager._bgmGain;
        if (!ctx || !gain || AudioManager._bgmVol <= 0.001) return;

        const patterns: Record<BgmMode, number[]> = {
            lobby: [196, 233, 262, 311, 262, 233, 196, 175],
            combat: [147, 175, 196, 220, 196, 175, 165, 147, 220, 196, 175, 147],
            boss: [110, 130, 147, 165, 147, 130, 123, 110, 165, 196, 147, 110],
        };
        const tempoMs = AudioManager._bgmMode === 'lobby' ? 280
            : AudioManager._bgmMode === 'boss' ? 160
            : 200;
        const notes = patterns[AudioManager._bgmMode];
        const batch = 4;
        let when = ctx.currentTime + 0.02;
        for (let i = 0; i < batch; i++) {
            const f = notes[(AudioManager._bgmStep + i) % notes.length];
            AudioManager._beepTo(
                ctx, gain, f, tempoMs / 1000 * 0.85,
                AudioManager._bgmMode === 'lobby' ? 0.22 : 0.28,
                AudioManager._bgmMode === 'boss' ? 'sawtooth' : 'triangle',
                when,
            );
            // 低音垫
            AudioManager._beepTo(
                ctx, gain, f * 0.5, tempoMs / 1000 * 0.9,
                0.12, 'sine', when,
            );
            when += tempoMs / 1000;
        }
        AudioManager._bgmStep = (AudioManager._bgmStep + batch) % notes.length;
        AudioManager._bgmPump = setTimeout(() => AudioManager._pumpBgm(), batch * tempoMs);
    }

    private static _tones(id: SfxId): Tone[] {
        switch (id) {
            case 'ui': return [{ freq: 720, dur: 0.035, type: 'sine', gain: 0.45 }];
            case 'hit': return [{ freq: 240, dur: 0.045, type: 'square', gain: 0.32 }];
            case 'kill': return [
                { freq: 400, dur: 0.045, type: 'square', gain: 0.38 },
                { freq: 540, dur: 0.055, type: 'square', gain: 0.32 },
            ];
            case 'coin': return [
                { freq: 880, dur: 0.035, type: 'sine', gain: 0.42 },
                { freq: 1175, dur: 0.055, type: 'sine', gain: 0.36 },
            ];
            case 'heart': return [
                { freq: 523, dur: 0.055, type: 'sine', gain: 0.38 },
                { freq: 784, dur: 0.07, type: 'sine', gain: 0.32 },
            ];
            case 'clear': return [
                { freq: 392, dur: 0.07, type: 'triangle', gain: 0.4 },
                { freq: 523, dur: 0.08, type: 'triangle', gain: 0.36 },
                { freq: 659, dur: 0.1, type: 'triangle', gain: 0.32 },
            ];
            case 'portal': return [
                { freq: 280, dur: 0.07, type: 'sine', gain: 0.32 },
                { freq: 420, dur: 0.09, type: 'sine', gain: 0.28 },
                { freq: 560, dur: 0.08, type: 'sine', gain: 0.22 },
            ];
            case 'die': return [
                { freq: 200, dur: 0.12, type: 'sawtooth', gain: 0.32 },
                { freq: 120, dur: 0.18, type: 'sawtooth', gain: 0.28 },
            ];
            case 'clear_run': return [
                { freq: 523, dur: 0.09, type: 'triangle', gain: 0.38 },
                { freq: 659, dur: 0.09, type: 'triangle', gain: 0.34 },
                { freq: 784, dur: 0.12, type: 'triangle', gain: 0.32 },
                { freq: 1046, dur: 0.16, type: 'triangle', gain: 0.28 },
            ];
            case 'intro': return [
                { freq: 196, dur: 0.12, type: 'triangle', gain: 0.26 },
                { freq: 247, dur: 0.12, type: 'triangle', gain: 0.24 },
                { freq: 294, dur: 0.14, type: 'triangle', gain: 0.22 },
                { freq: 392, dur: 0.2, type: 'sine', gain: 0.2 },
            ];
            default: return [];
        }
    }

    private static _voiceTones(id: string): Tone[] {
        switch (id) {
            case 'ranger':
                return [
                    { freq: 520, dur: 0.06, type: 'sine', gain: 0.4 },
                    { freq: 660, dur: 0.07, type: 'sine', gain: 0.36 },
                    { freq: 780, dur: 0.09, type: 'triangle', gain: 0.3 },
                ];
            case 'mage':
                return [
                    { freq: 340, dur: 0.08, type: 'triangle', gain: 0.36 },
                    { freq: 510, dur: 0.1, type: 'sine', gain: 0.34 },
                    { freq: 680, dur: 0.12, type: 'sine', gain: 0.28 },
                ];
            case 'paladin':
                return [
                    { freq: 280, dur: 0.07, type: 'square', gain: 0.32 },
                    { freq: 420, dur: 0.08, type: 'triangle', gain: 0.34 },
                    { freq: 560, dur: 0.1, type: 'triangle', gain: 0.3 },
                    { freq: 700, dur: 0.1, type: 'sine', gain: 0.26 },
                ];
            case 'assassin':
                return [
                    { freq: 720, dur: 0.04, type: 'square', gain: 0.28 },
                    { freq: 480, dur: 0.05, type: 'square', gain: 0.26 },
                    { freq: 900, dur: 0.06, type: 'sine', gain: 0.24 },
                ];
            case 'dragonkin':
                return [
                    { freq: 160, dur: 0.1, type: 'sawtooth', gain: 0.3 },
                    { freq: 220, dur: 0.1, type: 'sawtooth', gain: 0.28 },
                    { freq: 330, dur: 0.12, type: 'triangle', gain: 0.26 },
                ];
            case 'berserker':
                return [
                    { freq: 180, dur: 0.07, type: 'sawtooth', gain: 0.32 },
                    { freq: 120, dur: 0.08, type: 'square', gain: 0.28 },
                    { freq: 260, dur: 0.06, type: 'triangle', gain: 0.24 },
                ];
            case 'geomancer':
                return [
                    { freq: 140, dur: 0.08, type: 'triangle', gain: 0.3 },
                    { freq: 200, dur: 0.09, type: 'sine', gain: 0.28 },
                    { freq: 90, dur: 0.1, type: 'square', gain: 0.22 },
                ];
            case 'stormcaller':
                return [
                    { freq: 520, dur: 0.04, type: 'square', gain: 0.28 },
                    { freq: 780, dur: 0.05, type: 'sine', gain: 0.26 },
                    { freq: 1100, dur: 0.06, type: 'triangle', gain: 0.22 },
                ];
            case 'cryomancer':
                return [
                    { freq: 300, dur: 0.07, type: 'sine', gain: 0.34 },
                    { freq: 450, dur: 0.09, type: 'triangle', gain: 0.3 },
                    { freq: 600, dur: 0.1, type: 'sine', gain: 0.26 },
                ];
            case 'warden':
                return [
                    { freq: 260, dur: 0.06, type: 'square', gain: 0.32 },
                    { freq: 390, dur: 0.07, type: 'triangle', gain: 0.3 },
                    { freq: 520, dur: 0.09, type: 'triangle', gain: 0.26 },
                ];
            case 'plague':
                return [
                    { freq: 400, dur: 0.05, type: 'sawtooth', gain: 0.26 },
                    { freq: 560, dur: 0.06, type: 'triangle', gain: 0.28 },
                    { freq: 320, dur: 0.07, type: 'sine', gain: 0.24 },
                ];
            case 'voidwalker':
                return [
                    { freq: 180, dur: 0.05, type: 'sawtooth', gain: 0.28 },
                    { freq: 90, dur: 0.08, type: 'square', gain: 0.24 },
                    { freq: 260, dur: 0.06, type: 'triangle', gain: 0.26 },
                ];
            case 'sunpriest':
                return [
                    { freq: 360, dur: 0.06, type: 'sine', gain: 0.32 },
                    { freq: 540, dur: 0.07, type: 'triangle', gain: 0.3 },
                    { freq: 720, dur: 0.09, type: 'sine', gain: 0.26 },
                ];
            case 'knight':
            default:
                return [
                    { freq: 300, dur: 0.06, type: 'square', gain: 0.34 },
                    { freq: 380, dur: 0.07, type: 'triangle', gain: 0.32 },
                    { freq: 450, dur: 0.09, type: 'triangle', gain: 0.28 },
                ];
        }
    }

    private static _itemTones(kind: 'throw' | 'bomb' | 'heal' | 'buff'): Tone[] {
        switch (kind) {
            case 'throw':
                return [
                    { freq: 420, dur: 0.04, type: 'triangle', gain: 0.3 },
                    { freq: 280, dur: 0.05, type: 'sine', gain: 0.26 },
                ];
            case 'bomb':
                return [
                    { freq: 90, dur: 0.08, type: 'sawtooth', gain: 0.36 },
                    { freq: 160, dur: 0.07, type: 'square', gain: 0.3 },
                    { freq: 60, dur: 0.12, type: 'sawtooth', gain: 0.28 },
                ];
            case 'heal':
                return [
                    { freq: 523, dur: 0.06, type: 'sine', gain: 0.36 },
                    { freq: 659, dur: 0.07, type: 'sine', gain: 0.32 },
                    { freq: 784, dur: 0.09, type: 'triangle', gain: 0.28 },
                ];
            case 'buff':
                return [
                    { freq: 440, dur: 0.05, type: 'triangle', gain: 0.32 },
                    { freq: 660, dur: 0.06, type: 'sine', gain: 0.3 },
                    { freq: 880, dur: 0.08, type: 'sine', gain: 0.26 },
                ];
            default:
                return [];
        }
    }

    private static _weaponTones(id: string): Tone[] {
        switch (id) {
            case 'bow':
            case 'crossbow':
            case 'venom_bow':
                return [
                    { freq: 640, dur: 0.03, type: 'triangle', gain: 0.28 },
                    { freq: 900, dur: 0.03, type: 'sine', gain: 0.28 },
                    { freq: 420, dur: 0.06, type: 'triangle', gain: 0.3 },
                ];
            case 'wand':
            case 'frost':
            case 'earth_staff':
            case 'glacier_orb':
                return [
                    { freq: 480, dur: 0.05, type: 'sine', gain: 0.3 },
                    { freq: 720, dur: 0.08, type: 'sine', gain: 0.28 },
                    { freq: 960, dur: 0.06, type: 'triangle', gain: 0.2 },
                ];
            case 'storm_rod':
            case 'venom_vials':
                return [
                    { freq: 620, dur: 0.03, type: 'square', gain: 0.28 },
                    { freq: 980, dur: 0.04, type: 'sine', gain: 0.26 },
                    { freq: 1400, dur: 0.05, type: 'triangle', gain: 0.2 },
                ];
            case 'dagger':
            case 'shuriken':
            case 'shadow_daggers':
                return [
                    { freq: 1100, dur: 0.025, type: 'square', gain: 0.26 },
                    { freq: 700, dur: 0.04, type: 'triangle', gain: 0.24 },
                ];
            case 'axe':
            case 'hammer':
            case 'blood_cleaver':
                return [
                    { freq: 140, dur: 0.07, type: 'sawtooth', gain: 0.34 },
                    { freq: 90, dur: 0.08, type: 'square', gain: 0.26 },
                ];
            case 'spear':
            case 'ward_glaive':
                return [
                    { freq: 500, dur: 0.04, type: 'triangle', gain: 0.3 },
                    { freq: 320, dur: 0.06, type: 'square', gain: 0.28 },
                ];
            case 'holy_blade':
            case 'sunblade':
                return [
                    { freq: 360, dur: 0.05, type: 'triangle', gain: 0.32 },
                    { freq: 540, dur: 0.06, type: 'sine', gain: 0.3 },
                    { freq: 810, dur: 0.07, type: 'sine', gain: 0.24 },
                ];
            case 'dragon_fang':
                return [
                    { freq: 200, dur: 0.05, type: 'sawtooth', gain: 0.3 },
                    { freq: 360, dur: 0.06, type: 'square', gain: 0.28 },
                    { freq: 520, dur: 0.07, type: 'triangle', gain: 0.24 },
                ];
            case 'sword':
            default:
                return [
                    { freq: 280, dur: 0.04, type: 'square', gain: 0.3 },
                    { freq: 190, dur: 0.06, type: 'sawtooth', gain: 0.26 },
                ];
        }
    }

    private static _enemyTones(kind: string): Tone[] {
        switch (kind) {
            case 'archer':
            case 'bat':
                return [
                    { freq: 760, dur: 0.03, type: 'sine', gain: 0.26 },
                    { freq: 380, dur: 0.05, type: 'triangle', gain: 0.24 },
                ];
            case 'mage':
                return [
                    { freq: 260, dur: 0.07, type: 'sine', gain: 0.28 },
                    { freq: 390, dur: 0.09, type: 'triangle', gain: 0.26 },
                ];
            case 'wisp':
            case 'moth':
            case 'mosquito':
            case 'specter':
                return [
                    { freq: 880, dur: 0.04, type: 'sine', gain: 0.22 },
                    { freq: 1100, dur: 0.05, type: 'sine', gain: 0.2 },
                ];
            case 'raven':
                return [
                    { freq: 180, dur: 0.06, type: 'sawtooth', gain: 0.28 },
                    { freq: 120, dur: 0.08, type: 'triangle', gain: 0.24 },
                ];
            case 'bone':
            case 'imp':
                return [
                    { freq: 160, dur: 0.05, type: 'square', gain: 0.28 },
                    { freq: 100, dur: 0.08, type: 'triangle', gain: 0.24 },
                ];
            case 'spider':
            case 'snake':
                return [
                    { freq: 220, dur: 0.05, type: 'sawtooth', gain: 0.26 },
                    { freq: 140, dur: 0.07, type: 'triangle', gain: 0.22 },
                ];
            case 'shroom':
                return [
                    { freq: 140, dur: 0.07, type: 'sine', gain: 0.26 },
                    { freq: 90, dur: 0.09, type: 'triangle', gain: 0.22 },
                ];
            case 'jelly':
                return [
                    { freq: 640, dur: 0.05, type: 'sine', gain: 0.22 },
                    { freq: 420, dur: 0.07, type: 'sine', gain: 0.2 },
                ];
            case 'dragon':
                return [
                    { freq: 120, dur: 0.09, type: 'sawtooth', gain: 0.32 },
                    { freq: 180, dur: 0.1, type: 'sawtooth', gain: 0.28 },
                    { freq: 90, dur: 0.12, type: 'square', gain: 0.22 },
                ];
            case 'boss':
                return [
                    { freq: 100, dur: 0.1, type: 'sawtooth', gain: 0.34 },
                    { freq: 150, dur: 0.1, type: 'square', gain: 0.28 },
                ];
            case 'toad':
                return [
                    { freq: 180, dur: 0.06, type: 'square', gain: 0.28 },
                    { freq: 140, dur: 0.08, type: 'triangle', gain: 0.24 },
                ];
            case 'beetle':
            case 'crystal':
            case 'golem':
            case 'tank':
                return [
                    { freq: 110, dur: 0.07, type: 'square', gain: 0.3 },
                    { freq: 80, dur: 0.08, type: 'sawtooth', gain: 0.24 },
                ];
            case 'fast':
                return [
                    { freq: 520, dur: 0.03, type: 'square', gain: 0.26 },
                    { freq: 360, dur: 0.04, type: 'triangle', gain: 0.22 },
                ];
            case 'slime':
            default:
                return [
                    { freq: 200, dur: 0.05, type: 'sine', gain: 0.28 },
                    { freq: 160, dur: 0.06, type: 'triangle', gain: 0.24 },
                ];
        }
    }

    private static _audio(): AudioContext | null {
        try {
            const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
            if (!AC) return null;
            if (!AudioManager._ctx) AudioManager._ctx = new AC();
            const ctx = AudioManager._ctx!;
            if (ctx.state === 'suspended') {
                void ctx.resume().catch(() => { /* autoplay policy */ });
            }
            return ctx;
        } catch {
            return null;
        }
    }

    private static _beep(
        ctx: AudioContext,
        freq: number,
        dur: number,
        vol: number,
        type: OscillatorType,
        when: number,
    ) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), when + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.02, dur));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(when);
        osc.stop(when + dur + 0.02);
    }

    private static _beepTo(
        ctx: AudioContext,
        dest: AudioNode,
        freq: number,
        dur: number,
        vol: number,
        type: OscillatorType,
        when: number,
    ) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), when + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.03, dur));
        osc.connect(gain);
        gain.connect(dest);
        osc.start(when);
        osc.stop(when + dur + 0.03);
    }
}
