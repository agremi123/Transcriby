import { ButtonGhost, ButtonPrimary, Container, Logo, Reveal } from './atoms';

export function CTABanner() {
  return (
    <section className="relative py-10">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden border border-line bg-ivory2">
            <img
              src="/assets/paris-skyline.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-bottom select-none"
              style={{ opacity: 0.7, mixBlendMode: 'multiply' }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(246,241,232,0.95) 0%, rgba(246,241,232,0.75) 45%, rgba(246,241,232,0.2) 100%)',
              }}
            />
            <div className="relative px-8 md:px-14 py-16 md:py-24 grid md:grid-cols-[1.2fr,1fr] gap-8 items-center">
              <div>
                <h3 className="font-display text-[40px] md:text-[56px] leading-[1.02] text-navy">
                  Ready to speak French
                  <br />
                  <span className="italic text-wine">naturally?</span>
                </h3>
                <p className="mt-5 max-w-[480px] text-[15px] leading-[1.7] text-navy/70">
                  Join thousands of learners and improve your French today.
                  14-day trial. No card required.
                </p>
              </div>
              <div className="flex md:justify-end gap-3 flex-wrap">
                <ButtonPrimary>Start for free</ButtonPrimary>
                <ButtonGhost>Book a demo</ButtonGhost>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

export function Footer() {
  const cols = [
    { title: 'Product', links: ['Features', 'Pricing', 'Mobile app', "What's new"] },
    { title: 'Resources', links: ['Blog', 'Testimonials', 'Help center'] },
    { title: 'Company', links: ['About', 'Manifesto', 'Careers', 'Press'] },
    { title: 'Legal', links: ['Privacy', 'Terms', 'Cookies', 'GDPR'] },
  ];

  return (
    <footer id="about" className="relative bg-paper border-t border-line">
      <Container className="py-20">
        <div className="grid lg:grid-cols-[1.4fr,2fr] gap-12 mb-14">
          <div>
            <Logo />
            <p className="mt-5 max-w-[340px] text-[14px] leading-[1.7] text-navy/65">
              A French learning experience designed in Paris, built for the world.
            </p>
            <div className="flex items-center gap-3 mt-6">
              {[
                { l: 'in', v: 'LinkedIn' },
                { l: '𝕏', v: 'Twitter' },
                { l: 'ig', v: 'Instagram' },
                { l: 'yt', v: 'YouTube' },
              ].map((s) => (
                <a
                  key={s.v}
                  href="#"
                  aria-label={s.v}
                  className="w-9 h-9 border border-line text-navy/70 hover:text-wine hover:border-wine transition-colors inline-flex items-center justify-center text-[12px]"
                >
                  {s.l}
                </a>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {cols.map((c) => (
              <div key={c.title}>
                <div className="eyebrow text-navy/55 mb-4">{c.title}</div>
                <ul className="space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-[14px] text-navy/80 hover:text-wine transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line pt-10 overflow-hidden">
          <div className="font-display text-[clamp(80px,18vw,260px)] leading-[0.85] text-navy/90 tracking-[-0.02em] select-none">
            Parisl<span className="text-wine italic">y.</span>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4 mt-10 text-[12.5px] text-navy/55">
          <span>© 2026 Parisly SAS — Made with ❦ in Paris</span>
          <span className="font-mono">
            v 2.0 · status:{' '}
            <span className="text-navy/80">all systems operational</span>
          </span>
        </div>
      </Container>
    </footer>
  );
}
