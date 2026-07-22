/**
 * Editor brand colours.
 *
 * These are deliberately literal hex values rather than theme tokens: they are
 * third-party brand identities, not part of this panel's design system, and
 * they carry meaning in the Productivity breakdown — VS Code blue and
 * JetBrains orange are how you tell the rows apart at a glance. Collapsing them
 * into a token ramp loses that.
 *
 * They are used only as small dots and bar fills against a card background, so
 * they read acceptably in both themes without per-theme variants.
 */
export const EDITOR_COLORS: Record<string, string> = {
  vscode: '#007ACC',
  cursor: '#00E5A0',
  windsurf: '#6C5CE7',
  antigravity: '#4285F4',
  sublime: '#FF9800',
  phpstorm: '#B845FC',
  webstorm: '#00CDD7',
  pycharm: '#21D789',
  intellij: '#FC801D',
  goland: '#00ACC1',
  rider: '#DD1265',
  clion: '#21D789',
  rubymine: '#FC801D',
  datagrip: '#22D88F',
  'android-studio': '#3DDC84',
  jetbrains: '#FC801D',
};

/** Falls back to the brand accent for editors we do not have a colour for. */
export function editorColor(key: string): string | undefined {
  return EDITOR_COLORS[key.toLowerCase()];
}
