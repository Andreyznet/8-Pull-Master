/**
 * Android Haptic Vibration Manager (Supports Native Standalone APK Bridge + Web Vibration API)
 */
interface AndroidBridgeInterface {
  vibrate?: (ms: number) => void;
}

class HapticsManager {
  private enabled: boolean = true;
  private lastTickTime: number = 0;

  private getNativeBridge(): AndroidBridgeInterface | undefined {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { AndroidBridge?: AndroidBridgeInterface }).AndroidBridge;
  }

  public isSupported(): boolean {
    if (this.getNativeBridge()?.vibrate) return true;
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.vibrate(12);
    }
    return this.enabled;
  }

  public vibrate(pattern: number | number[]) {
    if (!this.enabled) return;
    try {
      const bridge = this.getNativeBridge();
      if (bridge?.vibrate) {
        const ms = Array.isArray(pattern) ? pattern[0] || 12 : pattern;
        bridge.vibrate(ms);
        return;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore if blocked by browser policy
    }
  }

  /**
   * Subtle 5ms micrometer tick throttled to at most once every 35ms
   */
  public tick() {
    const now = performance.now();
    if (now - this.lastTickTime < 35) return;
    this.lastTickTime = now;
    this.vibrate(5);
  }

  /**
   * Crisp cue strike vibration proportional to shot power
   */
  public strike(power: number) {
    const ms = Math.round(10 + Math.min(1, Math.max(0, power)) * 26);
    this.vibrate(ms);
  }

  /**
   * Ball-in-hand placement confirmation pulse
   */
  public confirmPlacement() {
    this.vibrate([10, 30, 14]);
  }
}

export const haptics = new HapticsManager();
