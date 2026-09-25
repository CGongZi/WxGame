/**
 * 微信 SDK 适配层
 * 所有 wx.* 调用必须经过这里，主游戏逻辑不直接调用 wx API
 * 方便未来测试和非微信平台适配
 */

// 编辑器环境下 wx 不存在，用空对象垫底避免报错
declare const wx: any;

export interface WxUserInfo {
    nickName: string;
    avatarUrl: string;
    openid: string;
}

export class WechatService {
    private static _openid: string = '';
    private static _loginCode: string = '';
    private static _nickName: string = '';
    private static _rewardedAd: any = null;  // wx.RewardedVideoAd

    static hasOpenDataRank(): boolean {
        // Phase I：开放数据域好友榜。未接前恒 false。
        return false;
    }

    // ════════════════════════════════
    //  登录
    // ════════════════════════════════

    static async login(): Promise<string> {
        if (typeof wx === 'undefined' || !wx.login) {
            if (!WechatService._loginCode) {
                WechatService._loginCode = `editor_${Date.now().toString(36)}`;
            }
            return WechatService._loginCode;
        }
        return new Promise((resolve, reject) => {
            wx.login({
                success: (res: { code?: string }) => {
                    // code 交给 CloudSync → /api/player/auth 换 openid（mock）
                    WechatService._loginCode = res.code || '';
                    WechatService._openid = WechatService._openid || WechatService._loginCode;
                    resolve(WechatService._loginCode);
                },
                fail: reject,
            });
        });
    }

    static get openid(): string { return WechatService._openid; }
    static get loginCode(): string { return WechatService._loginCode; }
    static get nickName(): string { return WechatService._nickName; }

    static setOpenid(id: string) { WechatService._openid = id || ''; }
    static setMockLoginCode(code: string) {
        WechatService._loginCode = code;
        if (!WechatService._openid) WechatService._openid = code;
    }
    static setNickName(name: string) { WechatService._nickName = name || ''; }

    // ════════════════════════════════
    //  存档
    // ════════════════════════════════

    static save(key: string, data: unknown): void {
        try {
            wx.setStorageSync(key, JSON.stringify(data));
        } catch (e) {
            console.warn('[WechatService] save failed', e);
        }
    }

    static load<T>(key: string, defaultVal: T): T {
        try {
            const raw = wx.getStorageSync(key);
            return raw ? JSON.parse(raw) as T : defaultVal;
        } catch {
            return defaultVal;
        }
    }

    // ════════════════════════════════
    //  激励视频广告（复活）
    // ════════════════════════════════

    static initRewardedAd(unitId: string) {
        if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return;
        WechatService._rewardedAd = wx.createRewardedVideoAd({ adUnitId: unitId });
        WechatService._rewardedAd.load();
    }

    static showRewardedAd(): Promise<boolean> {
        return new Promise((resolve) => {
            if (!WechatService._rewardedAd) {
                resolve(false);
                return;
            }
            WechatService._rewardedAd.onClose((res: { isEnded: boolean }) => {
                resolve(res?.isEnded === true);
            });
            WechatService._rewardedAd.show().catch(() => {
                // 广告未加载好，重新 load
                WechatService._rewardedAd.load();
                resolve(false);
            });
        });
    }

    // ════════════════════════════════
    //  分享
    // ════════════════════════════════

    static setupShare(score: number, floor: number) {
        wx.showShareMenu({ withShareTicket: false });
        wx.onShareAppMessage(() => ({
            title: `我在像素地牢第${floor}层获得了${score}分，你能超过我吗？`,
            imageUrl: '',  // TODO: 截图分享
        }));
    }

    // ════════════════════════════════
    //  排行榜（开放数据域）
    // ════════════════════════════════

    static postScore(score: number, floor: number) {
        try {
            const openDataContext = wx.getOpenDataContext();
            openDataContext.postMessage({
                event: 'UPDATE_SCORE',
                score,
                floor,
                openid: WechatService._openid,
            });
        } catch (e) {
            console.warn('[WechatService] postScore failed', e);
        }
    }

    // ════════════════════════════════
    //  震动反馈
    // ════════════════════════════════

    static vibrateShort() {
        try { wx.vibrateShort({ type: 'light' }); } catch {}
    }

    static vibrateLong() {
        try { wx.vibrateLong(); } catch {}
    }

    // ════════════════════════════════
    //  系统信息
    // ════════════════════════════════

    static getSafeAreaBottom(): number {
        try {
            const info = wx.getSystemInfoSync();
            const screenHeight = info.screenHeight;
            const safeAreaBottom = info.safeArea?.bottom ?? screenHeight;
            return screenHeight - safeAreaBottom;
        } catch {
            return 0;
        }
    }
}
