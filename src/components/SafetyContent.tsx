const TIPS = [
  ["Keep it on Kinara at first", "Scammers push to move to WhatsApp or Telegram quickly. Take your time; we screen messages here."],
  ["Never send money", "No genuine match needs a loan, a gift card, help with customs or a crypto tip. Report anyone who asks."],
  ["Meet in public, tell a friend", "Pick a busy café or restaurant, share your plans and the person's profile with someone you trust, and arrange your own travel."],
  ["Video call before meeting", "A short call helps confirm the person is who their profile says."],
  ["Trust your instincts", "You can unmatch, block or report at any time. They won't be told it was you."],
];

const HELPLINES = [
  ["India", "112 (emergency) · 1091 (women's helpline) · 1930 (cyber fraud)"],
  ["United States", "911 · 1-800-799-7233 (domestic violence)"],
  ["United Kingdom", "999 · 0808 2000 247 (domestic abuse)"],
  ["UAE", "999 (police) · 998 (ambulance)"],
  ["Singapore", "999 · 1800-777-0000 (family violence)"],
  ["Australia", "000 · 1800 737 732 (1800RESPECT)"],
];

export function SafetyContent() {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="text-2xl font-bold">Dating safely</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {TIPS.map(([t, b]) => (
            <li key={t} className="panel p-5">
              <h3 className="text-lg font-bold">{t}</h3>
              <p className="mt-1 text-ink-soft">{b}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-bold">How we protect you</h2>
        <ul className="mt-4 space-y-2 text-ink-soft">
          <li>Only mutual matches can message each other, and messages that go unanswered are capped.</li>
          <li>Messages mentioning money, investments, links or other apps are flagged and show you a warning.</li>
          <li>Reporting someone blocks them instantly. Several independent reports pause an account until our team reviews it.</li>
          <li>Other people see your city and a rounded distance — never your exact location, phone or email.</li>
          <li>The date planner steers first meetings to public places.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-bold">Emergency numbers</h2>
        <p className="mt-1 text-ink-soft">If you are in danger, contact local emergency services first.</p>
        <dl className="mt-4 divide-y divide-mist rounded-card border border-mist bg-paper-raised">
          {HELPLINES.map(([c, n]) => (
            <div key={c} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="font-semibold">{c}</dt><dd className="text-ink-soft">{n}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-faint">Verify numbers locally before launch; services change.</p>
      </section>
    </div>
  );
}
