import Link from "next/link";

const steps = [
  ["01", "Connect your wallet", "Bring your Freighter wallet and choose the Stellar account funding the payout."],
  ["02", "Add recipients", "Enter your payroll and vendor list with amounts and local off-ramp references."],
  ["03", "Settle in USDC", "Review the network fee, sign once, and send a whole batch on-chain in minutes."],
  ["04", "Cash out in NGN", "Your local payout partner completes the final handoff within 24 hours."],
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">Cross-border payments, made practical</p>
          <h1>Fast, cheap cross-border payouts to Nigeria.</h1>
          <p className="hero-lede">Settle salaries and vendor invoices on-chain. Cash out in NGN through local partners.</p>
          <div className="hero-actions">
            <Link className="hero-cta" href="/dashboard">Get started <span aria-hidden="true">↗</span></Link>
            <a className="hero-secondary" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-proof"><span className="proof-dot" /> Built on Stellar/Soroban <span className="proof-divider" /> Transparent USDC settlement</div>
        </div>
        <div className="hero-visual" aria-label="Illustration of a cross-border payout moving from the diaspora to Nigeria">
          <div className="visual-glow" /><div className="route-line route-line-one" /><div className="route-line route-line-two" />
          <div className="route-point route-point-source"><span>◎</span><small>USD</small></div>
          <div className="route-point route-point-destination"><span>₦</span><small>NGN</small></div>
          <div className="settlement-card"><span className="settlement-icon">✓</span><div><strong>Settlement complete</strong><small>2,400 USDC → ₦3,840,000</small></div><span className="settlement-time">02:14</span></div>
          <div className="visual-label visual-label-source">Diaspora</div><div className="visual-label visual-label-destination">Nigeria</div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Platform highlights">
        <div><strong>Minutes</strong><span>on-chain settlement</span></div><div><strong>24 hrs</strong><span>NGN off-ramp window</span></div><div><strong>1 batch</strong><span>for your whole payroll</span></div><div><strong>100%</strong><span>fee visibility</span></div>
      </section>

      <section className="landing-section problem-section">
        <div className="section-intro"><p className="eyebrow">Why StellarRemit</p><h2>Money should move at the speed of your business.</h2><p>Traditional rails were built for a different era. StellarRemit gives modern teams a clearer path from foreign currency to local cash.</p></div>
        <div className="comparison-grid"><article className="comparison-card comparison-card-muted"><span className="card-index">01 / THE OLD WAY</span><div className="comparison-icon">↘</div><h3>Remittances that lose time and value.</h3><p>Traditional remittances charge 5–15% fees and can take 3–7 days to arrive.</p><div className="metric-bad">5–15% <span>typical fees</span></div></article><article className="comparison-card comparison-card-accent"><span className="card-index">02 / THE STELLARREMIT WAY</span><div className="comparison-icon">↗</div><h3>Settlement you can see and trust.</h3><p>On-chain settlement in minutes. Off-ramp to NGN within 24 hours. Transparent fees from send to payout.</p><div className="metric-good">Minutes <span>to settle on-chain</span></div></article></div>
      </section>

      <section className="landing-section workflow-section" id="how-it-works"><div className="section-intro section-intro-centered"><p className="eyebrow">A simpler payout run</p><h2>From wallet to local cash, in four steps.</h2></div><div className="steps-grid">{steps.map(([number, title, text]) => <article className="step" key={number}><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section className="landing-section audience-section"><div className="audience-copy"><p className="eyebrow">Built for the people doing the work</p><h2>One reliable rail for every kind of payout.</h2><p>Whether you are supporting family, running payroll, or moving money for customers, StellarRemit keeps the important details in one place.</p><Link className="text-link" href="/dashboard">Open the payout dashboard <span aria-hidden="true">↗</span></Link></div><div className="audience-list"><div><span className="audience-number">01</span><strong>Diaspora Nigerians</strong><p>Send support home with clear rates and a payout you can track.</p></div><div><span className="audience-number">02</span><strong>Payroll managers</strong><p>Pay distributed teams in one batch without stitching together providers.</p></div><div><span className="audience-number">03</span><strong>Remittance services</strong><p>Build a dependable settlement layer into your customer experience.</p></div></div></section>

      <section className="landing-section readiness-section"><div className="section-intro"><p className="eyebrow">Built for responsible scale</p><h2>From working prototype to public utility.</h2><p>The next phase is focused on the work that makes payment infrastructure dependable: partner integration, independent security review, observability, and a controlled pilot.</p><a className="text-link" href="https://github.com/alamuoyeemmanuel7-create/stellar-remit/blob/main/FUNDING.md" target="_blank" rel="noreferrer">Read the funding brief <span aria-hidden="true">↗</span></a></div><div className="readiness-grid"><div><strong>01</strong><h3>Partner-ready</h3><p>Sandbox off-ramp integration and a clear reconciliation trail.</p></div><div><strong>02</strong><h3>Security-led</h3><p>Independent review, least-privilege roles, and key rotation runbooks.</p></div><div><strong>03</strong><h3>Measurable</h3><p>Public pilot metrics for speed, cost, reliability, and repeat usage.</p></div></div></section>

      <section className="closing-cta"><p className="eyebrow">Ready when you are</p><h2>Put your next payout on-chain.</h2><p>Connect a wallet and start with a transparent batch payout workflow.</p><Link className="hero-cta" href="/dashboard">Get started <span aria-hidden="true">↗</span></Link></section>
    </div>
  );
}
