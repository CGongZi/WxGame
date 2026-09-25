import { SAVE_KEY, SaveData, DEFAULT_SAVE, migrateSave } from './SaveData';

declare const wx: any;

/**
 * SaveStore —— 读写封装（wx / localStorage）
 */
export class SaveStore {
    static load(): SaveData {
        try {
            let raw: string | null = null;
            if (typeof wx !== 'undefined') {
                raw = wx.getStorageSync(SAVE_KEY) || wx.getStorageSync('playerProgress') || null;
            } else if (typeof localStorage !== 'undefined') {
                raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('playerProgress');
            }
            if (!raw) return structuredClone(DEFAULT_SAVE);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return migrateSave(parsed);
        } catch (e) {
            console.warn('[SaveStore] load failed', e);
            return structuredClone(DEFAULT_SAVE);
        }
    }

    static save(data: SaveData) {
        try {
            const json = JSON.stringify(data);
            if (typeof wx !== 'undefined') {
                wx.setStorageSync(SAVE_KEY, json);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.setItem(SAVE_KEY, json);
            }
        } catch (e) {
            console.warn('[SaveStore] save failed', e);
        }
    }

    static clear() {
        try {
            if (typeof wx !== 'undefined') {
                wx.removeStorageSync(SAVE_KEY);
                wx.removeStorageSync('playerProgress');
            } else if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(SAVE_KEY);
                localStorage.removeItem('playerProgress');
            }
        } catch {}
    }
}

function structuredClone<T>(o: T): T {
    return JSON.parse(JSON.stringify(o));
}
