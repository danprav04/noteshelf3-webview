import { NotebookDarkModeStyle, NotebookThemeSettings } from '../types';

const THEME_SETTINGS_KEY = 'noteshelf_notebook_theme';

export const DEFAULT_THEME_SETTINGS: NotebookThemeSettings = {
  enabled: true,       // Default to dark mode for notebooks to match the app's dark aesthetic
  style: 'charcoal',   // Soft dark tone (gentle on eyes, preserves pen ink hues)
  invertCover: false,  // Preserve real notebook cover artwork by default
  smartInvert: true    // Automatically skip pages that already have native dark paper
};

/**
 * Retrieve saved notebook theme settings from localStorage
 */
export function getStoredNotebookTheme(): NotebookThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_THEME_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_THEME_SETTINGS.enabled,
      style: (['charcoal', 'oled', 'warm'] as NotebookDarkModeStyle[]).includes(parsed.style)
        ? parsed.style
        : DEFAULT_THEME_SETTINGS.style,
      invertCover: typeof parsed.invertCover === 'boolean' ? parsed.invertCover : DEFAULT_THEME_SETTINGS.invertCover,
      smartInvert: typeof parsed.smartInvert === 'boolean' ? parsed.smartInvert : DEFAULT_THEME_SETTINGS.smartInvert
    };
  } catch {
    return { ...DEFAULT_THEME_SETTINGS };
  }
}

/**
 * Update and persist notebook theme settings in localStorage
 */
export function setStoredNotebookTheme(settings: Partial<NotebookThemeSettings>): NotebookThemeSettings {
  const current = getStoredNotebookTheme();
  const updated: NotebookThemeSettings = { ...current, ...settings };
  try {
    localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota or access errors
  }
  return updated;
}

/**
 * Calculates perceived luminance of a hex color (sRGB / ITU-R BT.709)
 * Returns true if the background is considered dark (luminance < 0.4)
 */
export function isDarkColor(hex: string): boolean {
  if (!hex) return false;
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) return false;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return false;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.4;
}

/**
 * Computes the GPU-accelerated CSS filter string to apply to the notebook canvas
 */
export function getCanvasFilter(
  settings: NotebookThemeSettings,
  isCover = false,
  pageBgColor?: string
): string {
  if (!settings.enabled) return 'none';
  if (isCover && !settings.invertCover) return 'none';
  if (settings.smartInvert && pageBgColor && isDarkColor(pageBgColor)) return 'none';

  switch (settings.style) {
    case 'oled':
      // Pitch black background (#000000), white ink, preserved color hues
      return 'invert(1) hue-rotate(180deg)';
    case 'warm':
      // Warm amber/sepia dark background, soft amber ink, reduced blue light
      return 'invert(0.90) sepia(0.35) hue-rotate(160deg) contrast(0.95)';
    case 'charcoal':
    default:
      // Soft dark charcoal background (#141414), crisp soft white ink, preserved color hues
      return 'invert(0.92) hue-rotate(180deg) contrast(0.96)';
  }
}
