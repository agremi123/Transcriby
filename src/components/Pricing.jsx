import { Container, Reveal, SectionLabel } from './atoms';

function PriceTier({ name, price, sub, desc, cta, features, popular, delay }) {
  return (
    <Reveal delay={delay}>
      <div
        className={`relative h-full flex flex-col bg-paper border ${
          popular ? 'border-wine' : 'border-line'
        } p-7 transition-all duration-300 hover:-translate-y-1`}
        style={
          popular ? { boxShadow: '0 30px 60px -30px rgba(139,30,45,0.35)' } : undefined
        }
      >
        {popular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-wine text-ivory text-[10px] tracking-[0.18em] font-semibold uppercase px-3 py-1.5">
            Most popular
          </div>
        )}
        <div className="mb-6">
          <h3 className="font-display text-[30px] text-navy leading-none">{name}</h3>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="font-display text-[48px] text-navy leading-none">{price}</span>
            {sub && <span className="text-navy/55 text-[13px]">{sub}</span>}
          </div>
          <p className="mt-4 text-[13.5px] leading-[1.6] text-navy/65 min-h-[42px]">{desc}</p>
        </div>

        <button
          type="button"
          className={`w-full py-3 text-[14px] font-medium transition-colors ${
            popular
              ? 'bg-wine text-ivory hover:bg-wine2'
              : 'border border-navy/25 text-navy hover:bg-navy hover:text-ivory hover:border-navy'
          }`}
        >
          {cta}
        </button>

        <ul className="mt-7 space-y-3.5 text-[13.5px] text-navy/80">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <svg
                className="mt-1 text-wine flex-none"
                width="13"
                height="13"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 7l3.5 3.5L12 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="relative py-24 md:py-28 overflow-hidden">
      <Container>
        <div className="grid lg:grid-cols-[1fr,2fr] gap-12 lg:gap-16 items-start">
          <div className="lg:sticky lg:top-32">
            <SectionLabel>Find the plan that fits you</SectionLabel>
            <h2 className="font-display text-[44px] md:text-[54px] leading-[1.02] text-navy">
              Simple, flexible,
              <br />
              <span className="italic text-wine">transparent.</span>
            </h2>
            <p className="mt-6 text-[15px] leading-[1.7] text-navy/65 max-w-[340px]">
              Start for free. Upgrade when you're ready to grow faster.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <PriceTier
              name="Free"
              price="€0"
              sub=""
              desc="Start your journey with Parisly at no cost."
              cta="Get started"
              features={[
                '10 minutes / day',
                'Grammar correction',
                'Live transcription',
                '1 interface language',
              ]}
              delay={0.05}
            />
            <PriceTier
              name="Pro"
              price="€12"
              sub="/mo"
              desc="For serious learners who want to progress fast."
              cta="Choose Pro"
              features={[
                'Unlimited minutes',
                'Advanced native suggestions',
                'Detailed progress tracking',
                'Priority support',
              ]}
              popular
              delay={0.15}
            />
            <PriceTier
              name="Premium"
              price="€20"
              sub="/mo"
              desc="The full experience with advanced coaching."
              cta="Choose Premium"
              features={[
                'Everything in Pro',
                'Personalised AI coach',
                'Interview simulations',
                'Early access to new features',
                'Monthly live sessions',
              ]}
              delay={0.25}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
