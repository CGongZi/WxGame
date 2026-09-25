import type { SaveData } from './SaveData';
import { SaveStore } from './SaveStore';
import { WechatService } from '../wechat/WechatService';
import type { RedeemReward } from './RedeemCodes';

/**
 * CloudSync — optional player cloud (feat/player-cloud-admin).
 * BASE_URL empty → fully offline (default / 提审).
 * Auth: wx.login code → POST /api/player/auth (mock openid).
 * Fail-soft: never block lobby; local SaveStore remains device SSOT.
 */
export class CloudSync {
    /** e.g. `http://127.0.0.1:8787` — no trailing slash. Empty disables. */
    static BASE_URL = '';
    static TIMEOUT_MS = 5000;
    static LOCK = false;

    private static _token = '';
    private static _playerId = '';
    private static _openid = '';
    private static _pushTimer: ReturnType<typeof setTimeout> | null = null;
    private static _bootstrapped = false;

    static get enabled(): boolean {
        if (CloudSync.LOCK) return false;
        return CloudSync.BASE_URL.trim().length > 0;
    }

    static get playerId(): string { return CloudSync._playerId; }
    static get openid(): string { return CloudSync._openid; }
    static get ready(): boolean { return CloudSync.enabled && !!CloudSync._token; }

    static configure(opts: { url?: string; lock?: boolean }) {
        if (opts.url !== undefined) CloudSync.BASE_URL = opts.url.replace(/\/$/, '');
        if (opts.lock !== undefined) CloudSync.LOCK = opts.lock;
    }

    /** Call after local save load (BootLoading). Never throws. */
    static async bootstrap(localSave?: SaveData): Promise<'skipped' | 'ok' | 'failed'> {
        if (!CloudSync.enabled) return 'skipped';
        if (CloudSync._bootstrapped && CloudSync._token) return 'ok';
        try {
            const auth = await CloudSync._auth();
            if (!auth) return 'failed';
            CloudSync._bootstrapped = true;
            const me = await CloudSync._request('GET', '/api/player/me') as {
                save?: SaveData | null;
            } | null;
            if (me?.save && localSave) {
                const cloudFloor = me.save.progress?.highestFloor ?? 0;
                const localFloor = localSave.progress?.highestFloor ?? 0;
                const cloudSoul = me.save.currency?.soul ?? 0;
                const localSoul = localSave.currency?.soul ?? 0;
                if (cloudFloor > localFloor || (cloudFloor === localFloor && cloudSoul > localSoul)) {
                    SaveStore.save(me.save);
                    console.log('[CloudSync] pulled cloud save');
                } else {
                    await CloudSync.pushSave(localSave, true);
                }
            } else if (localSave) {
                await CloudSync.pushSave(localSave, true);
            }
            return 'ok';
        } catch (e) {
            console.warn('[CloudSync] bootstrap failed', e);
            return 'failed';
        }
    }

    /** Debounced upload after local persist. */
    static schedulePush(save: SaveData) {
        if (!CloudSync.enabled) return;
        if (CloudSync._pushTimer) clearTimeout(CloudSync._pushTimer);
        CloudSync._pushTimer = setTimeout(() => {
            CloudSync._pushTimer = null;
            void CloudSync.pushSave(save, false);
        }, 800);
    }

    static async pushSave(save: SaveData, immediate = false): Promise<boolean> {
        if (!CloudSync.enabled) return false;
        if (!immediate && CloudSync._pushTimer) {
            clearTimeout(CloudSync._pushTimer);
            CloudSync._pushTimer = null;
        }
        try {
            if (!CloudSync._token) {
                const ok = await CloudSync._auth();
                if (!ok) return false;
            }
            const res = await CloudSync._request('POST', '/api/player/sync', {
                save,
                nickName: WechatService.nickName || '',
            }) as { ok?: boolean } | null;
            return !!res?.ok;
        } catch (e) {
            console.warn('[CloudSync] push failed', e);
            return false;
        }
    }

    static async redeem(code: string): Promise<{
        ok: boolean;
        reason?: string;
        title?: string;
        rewards?: RedeemReward[];
        message?: string;
        save?: SaveData;
    }> {
        if (!CloudSync.enabled) {
            return { ok: false, reason: 'cloud off' };
        }
        try {
            if (!CloudSync._token) {
                const ok = await CloudSync._auth();
                if (!ok) return { ok: false, reason: '登录云端失败' };
            }
            const res = await CloudSync._request('POST', '/api/player/redeem', { code }) as {
                ok?: boolean;
                error?: string;
                title?: string;
                rewards?: RedeemReward[];
                message?: string;
                save?: SaveData;
            } | null;
            if (!res) return { ok: false, reason: '网络错误' };
            if (!res.ok) return { ok: false, reason: res.error || '兑换失败' };
            return {
                ok: true,
                title: res.title,
                rewards: res.rewards,
                message: res.message,
                save: res.save,
            };
        } catch (e: any) {
            const status = e?.status;
            if (status === 409) return { ok: false, reason: '该兑换码已使用' };
            if (status === 404) return { ok: false, reason: '兑换码无效' };
            const msg = e?.body?.error || e?.message || '兑换失败';
            return { ok: false, reason: String(msg) };
        }
    }

    static async uploadEvents(events: Array<{ type: string; at?: string; payload?: Record<string, unknown> }>) {
        if (!CloudSync.enabled || !events?.length) return false;
        try {
            if (!CloudSync._token) {
                const ok = await CloudSync._auth();
                if (!ok) return false;
            }
            await CloudSync._request('POST', '/api/player/events', { events });
            return true;
        } catch (e) {
            console.warn('[CloudSync] events failed', e);
            return false;
        }
    }

    private static async _auth(): Promise<boolean> {
        try {
            let code = WechatService.loginCode || WechatService.openid;
            if (!code) {
                try {
                    code = await WechatService.login();
                } catch {
                    code = `editor_${Date.now().toString(36)}`;
                    WechatService.setMockLoginCode(code);
                }
            }
            if (!code) {
                code = `editor_dev_${Date.now().toString(36)}`;
                WechatService.setMockLoginCode(code);
            }
            const res = await CloudSync._request('POST', '/api/player/auth', { code }, false) as {
                token?: string;
                playerId?: string;
                openid?: string;
            } | null;
            if (!res?.token || !res.playerId) return false;
            CloudSync._token = res.token;
            CloudSync._playerId = res.playerId;
            CloudSync._openid = res.openid || '';
            if (CloudSync._openid) WechatService.setOpenid(CloudSync._openid);
            return true;
        } catch (e) {
            console.warn('[CloudSync] auth failed', e);
            return false;
        }
    }

    private static _request(
        method: string,
        path: string,
        body?: unknown,
        withAuth = true,
    ): Promise<unknown> {
        const base = CloudSync.BASE_URL.trim().replace(/\/$/, '');
        const url = `${base}${path}`;
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.timeout = CloudSync.TIMEOUT_MS;
            xhr.responseType = 'text';
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (withAuth && CloudSync._token) {
                xhr.setRequestHeader('Authorization', `Bearer ${CloudSync._token}`);
            }
            xhr.onload = () => {
                let data: any = null;
                try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; }
                catch { /* ignore */ }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                    return;
                }
                const err: any = new Error(data?.error || `HTTP ${xhr.status}`);
                err.status = xhr.status;
                err.body = data;
                reject(err);
            };
            xhr.onerror = () => reject(new Error('network error'));
            xhr.ontimeout = () => reject(new Error('timeout'));
            xhr.send(body === undefined ? null : JSON.stringify(body));
        });
    }
}
