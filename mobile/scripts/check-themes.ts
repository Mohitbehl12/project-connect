// Checks every colour theme in both modes for readable text (WCAG AA). Run: npx tsx scripts/check-themes.ts
import { contrast, THEMES } from "../src/theme/themes";

const AA = 4.5, LARGE = 3;
let bad = 0;
for (const t of THEMES) {
  for (const mode of ["light", "dark"] as const) {
    const p = t[mode];
    const pairs: [string, string, string, number][] = [
      ["text on bg", p.text, p.bg, AA], ["text on surface", p.text, p.surface, AA], ["text on raised", p.text, p.raised, AA],
      ["muted on bg", p.muted, p.bg, AA], ["muted on surface", p.muted, p.surface, AA],
      ["faint on surface", p.faint, p.surface, LARGE],
      ["button text", p.brandText, p.brand, AA], ["brand link on surface", p.brand, p.surface, AA], ["brand on wash", p.brand, p.brandWash, AA],
      ["accent chip text", p.accentText, p.accent, AA], ["text on accent wash", p.text, p.accentWash, AA],
      ["trust on surface", p.trust, p.surface, AA], ["alert on surface", p.alert, p.surface, AA],
    ];
    if (mode === "light") pairs.push(["text on night", t.g.onNight, t.g.night, AA], ["white on premium", "#FFFFFF", t.g.dusk[1], AA]);
    for (const [name, fg, bg, min] of pairs) {
      const r = contrast(fg, bg);
      if (r < min) { bad++; console.log(`✗ ${t.name} (${mode}) ${name}: ${r.toFixed(2)} < ${min}  ${fg} on ${bg}`); }
    }
  }
}
console.log(bad ? `${bad} contrast problems` : `✓ all ${THEMES.length} themes pass in light and dark`);
process.exit(bad ? 1 : 0);
