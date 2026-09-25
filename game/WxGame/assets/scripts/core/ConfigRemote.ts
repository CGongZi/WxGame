import { ConfigStore } from './ConfigStore';

export type ConfigRemoteResult = 'skipped' | 'unchanged' | 'applied' | 'failed';

/**
 * ConfigRemote — optional CMS pack fetch (K7 + K13).
 * PACK_URL empty → no network (review / offline default).
 * LOCK_REMOTE → 提审锁定：即使填了 URL 也不拉远程。
 * 远程 version ≤ 当前包 → unchanged（不降级）。
 * Fail → keep active pack; never throw into BootLoading as hard error.
 */
export class ConfigRemote {
    /** CDN or `http://127.0.0.1:8787/api/pack/latest`. Empty disables remote. */
    static PACK_URL = '';
    /** 提审包打 true：强制只用内置包。 */
    static LOCK_REMOTE = false;
    static TIMEOUT_MS = 4000;

    static get enabled(): boolean {
        if (ConfigRemote.LOCK_REMOTE) return false;
        return ConfigRemote.PACK_URL.trim().length > 0;
    }

    /** Local / staging helper. Does not persist. */
    static configure(opts: { url?: string; lockRemote?: boolean }) {
        if (opts.url !== undefined) ConfigRemote.PACK_URL = opts.url;
        if (opts.lockRemote !== undefined) ConfigRemote.LOCK_REMOTE = opts.lockRemote;
    }

    /**
     * Fetch + tryApply. Call only after loadBuiltin.
     * Does not throw for network / validate failures.
     */
    static async tryFetchAndApply(): Promise<ConfigRemoteResult> {
        if (ConfigRemote.LOCK_REMOTE) return 'skipped';
        if (!ConfigRemote.enabled) return 'skipped';
        try {
            const raw = await ConfigRemote._fetchJson(ConfigRemote.PACK_URL.trim());
            if (!raw || typeof raw !== 'object') {
                console.warn('[ConfigRemote] invalid JSON root');
                return 'failed';
            }
            const remoteVer = Number((raw as { version?: unknown }).version);
            if (!Number.isFinite(remoteVer) || remoteVer < 1) {
                console.warn('[ConfigRemote] remote version invalid');
                return 'failed';
            }
            const current = ConfigStore.version;
            if (remoteVer <= current) {
                return 'unchanged';
            }
            if (!ConfigStore.tryApply(raw)) {
                console.warn('[ConfigRemote] validate failed:', ConfigStore.lastError);
                return 'failed';
            }
            return 'applied';
        } catch (e) {
            console.warn('[ConfigRemote] fetch failed', e);
            return 'failed';
        }
    }

    private static _fetchJson(url: string): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.timeout = ConfigRemote.TIMEOUT_MS;
            xhr.responseType = 'text';
            xhr.onload = () => {
                if (xhr.status < 200 || xhr.status >= 300) {
                    reject(new Error(`HTTP ${xhr.status}`));
                    return;
                }
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    reject(e);
                }
            };
            xhr.onerror = () => reject(new Error('network error'));
            xhr.ontimeout = () => reject(new Error('timeout'));
            xhr.send();
        });
    }
}
