import { Camera, find, tween, Tween } from 'cc';
import { WorldBridge } from '../dungeon/WorldBridge';

/**
 * ViewZoom —— 唯一允许改 orthoHeight 的入口
 *
 * 大厅略近（聚焦主角），开战随按钮滑出拉高看全图。
 * FloorRenderer 每帧钉死到 targetOrtho（非 tween 时），禁止别处乱改相机高度。
 */
export class ViewZoom {
    /** 大厅：更近，突出中央角色（局内仍用 PLAY_ORTHO） */
    static readonly LOBBY_ORTHO = 235;
    /** 开战：#166 真机 470 太远→人/底栏过小；收至 340 兼顾视野与可读 */
    static readonly PLAY_ORTHO = 340;

    static readonly DESIGN_W = 1334;
    static readonly DESIGN_H = 750;

    private static _target = ViewZoom.LOBBY_ORTHO;
    private static _tweening = false;
    private static _cam: Camera | null = null;
    private static _gen = 0;
    private static _proxy: { h: number } | null = null;

    static get targetOrtho() { return ViewZoom._target; }
    static get isTweening() { return ViewZoom._tweening; }

    static ensureCam(): Camera | null {
        if (ViewZoom._cam?.node?.isValid) return ViewZoom._cam;
        ViewZoom._cam = find('Canvas/Camera')?.getComponent(Camera) ?? null;
        return ViewZoom._cam;
    }

    /** 同步视野半宽到 WorldBridge，并立刻重算 cam 钳制 */
    static applyOrtho(h: number) {
        const ortho = Math.max(200, Math.min(600, h));
        ViewZoom._target = ortho;
        const cam = ViewZoom.ensureCam();
        if (cam) cam.orthoHeight = ortho;
        WorldBridge.setViewHalf(
            ortho * (ViewZoom.DESIGN_W / ViewZoom.DESIGN_H),
            ortho,
        );
    }

    /** 开战：与 Lobby 按钮滑出同时长拉高 */
    static toPlay(duration = 0.38) {
        ViewZoom._tweenTo(ViewZoom.PLAY_ORTHO, duration);
    }

    /** 回大厅：拉近 */
    static toLobby(duration = 0.35) {
        ViewZoom._tweenTo(ViewZoom.LOBBY_ORTHO, duration);
    }

    /** 立即落到大厅高度（冷启动 / reset） */
    static snapLobby() {
        ViewZoom._stopTween();
        ViewZoom.applyOrtho(ViewZoom.LOBBY_ORTHO);
    }

    /** 立即落到开战高度 */
    static snapPlay() {
        ViewZoom._stopTween();
        ViewZoom.applyOrtho(ViewZoom.PLAY_ORTHO);
    }

    private static _tweenTo(to: number, duration: number) {
        const cam = ViewZoom.ensureCam();
        if (!cam) {
            ViewZoom.applyOrtho(to);
            return;
        }
        ViewZoom._stopTween();
        const from = cam.orthoHeight;
        ViewZoom._target = to;
        if (Math.abs(from - to) < 0.5) {
            ViewZoom.applyOrtho(to);
            return;
        }
        const gen = ++ViewZoom._gen;
        ViewZoom._tweening = true;
        const state = { h: from };
        ViewZoom._proxy = state;
        tween(state)
            .to(duration, { h: to }, {
                easing: 'sineOut',
                onUpdate: () => {
                    if (gen !== ViewZoom._gen) return;
                    if (!cam.isValid) return;
                    cam.orthoHeight = state.h;
                    WorldBridge.setViewHalf(
                        state.h * (ViewZoom.DESIGN_W / ViewZoom.DESIGN_H),
                        state.h,
                    );
                },
            })
            .call(() => {
                if (gen !== ViewZoom._gen) return;
                ViewZoom._tweening = false;
                ViewZoom._proxy = null;
                ViewZoom.applyOrtho(to);
            })
            .start();
    }

    private static _stopTween() {
        ViewZoom._gen++;
        if (ViewZoom._proxy) {
            Tween.stopAllByTarget(ViewZoom._proxy);
            ViewZoom._proxy = null;
        }
        ViewZoom._tweening = false;
    }
}
