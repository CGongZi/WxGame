import { GameManager } from './GameManager';
import { WechatService } from '../wechat/WechatService';

/**
 * 设置页「震动」开关的实机出口。桌面预览无 wx 时静默跳过。
 */
export class Haptic {
    static light() {
        try {
            if (!GameManager.instance?.getSettings()?.vibration) return;
            WechatService.vibrateShort();
        } catch { /* ignore */ }
    }

    static heavy() {
        try {
            if (!GameManager.instance?.getSettings()?.vibration) return;
            WechatService.vibrateLong();
        } catch { /* ignore */ }
    }
}
