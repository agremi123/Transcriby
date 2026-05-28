import { motion } from 'framer-motion';
import { Container, Eyebrow, Reveal, Waveform } from './atoms';

export default function Comparison() {
  return (
    <section className="relative bg-navy text-ivory py-24 md:py-28 overflow-hidden grain">
      <img
        src="/assets/paris-skyline.png"
        alt=""
        className="absolute right-0 bottom-0 w-[900px] max-w-[60%] object-contain object-bottom-right select-none pointer-events-none"
        style={{ opacity: 0.18, mixBlendMode: 'screen' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(70% 60% at 20% 30%, rgba(139,30,45,0.10), transparent 60%), linear-gradient(90deg, rgba(26,35,64,1) 0%, rgba(26,35,64,0.85) 50%, rgba(26,35,64,0.6) 100%)',
        }}
      />

      <Container className="relative">
        <div className="grid lg:grid-cols-[1fr,1.2fr] gap-12 lg:gap-16 items-center">
          <div>
            <Reveal>
              <Eyebrow color="ivory">See the difference</Eyebrow>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="font-display text-[44px] md:text-[54px] leading-[1.02] mt-5 text-ivory">
                Instant correction.
                <br />
                More <span className="italic text-rose">natural</span> French.
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mt-6 max-w-[420px] text-[15px] leading-[1.7] text-ivory/70">
                Our advanced AI understands context, grammar and nuance to deliver
                the best real-time corrections as you speak.
              </p>
            </Reveal>
            <Reveal delay={0.3}>
              <a
                href="#"
                className="group inline-flex items-center gap-2 mt-7 text-rose hover:text-ivory text-[14px] font-medium transition-colors"
              >
                See how it works
                <svg
                  className="transition-transform duration-300 group-hover:translate-x-1"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M1 7h12m0 0L8 2m5 5l-5 5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </a>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <div
              className="relative border border-ivory/15 p-5 md:p-7"
              style={{ background: 'rgba(15,23,51,0.55)' }}
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-ivory/15 p-5">
                  <div className="text-[11px] tracking-wide text-ivory/55 mb-2">You say</div>
                  <p className="font-display text-[22px] md:text-[26px] leading-tight text-ivory/85">
                    Je suis très{' '}
                    <span className="text-rose/80 underline decoration-rose/40 decoration-wavy underline-offset-4">
                      intéressant
                    </span>{' '}
                    par…
                  </p>
                  <div className="mt-5">
                    <Waveform bars={42} color="rgba(246,241,232,0.55)" height={26} />
                  </div>
                </div>
                <div className="border border-ivory/15 p-5">
                  <div className="text-[11px] tracking-wide text-ivory/55 mb-2">
                    Transcriby corrects
                  </div>
                  <p className="font-display text-[22px] md:text-[26px] leading-tight text-ivory">
                    Je m&apos;intéresse beaucoup à…
                  </p>
                  <div className="mt-5">
                    <span className="inline-block bg-wine text-ivory text-[10px] tracking-widest font-semibold uppercase px-2 py-1">
                      Tip
                    </span>
                    <p className="text-[13px] leading-[1.6] text-ivory/70 mt-2.5">
                      « S&apos;intéresser à » is more natural and used by native French speakers.
                    </p>
                  </div>
                </div>
              </div>

              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-wine flex items-center justify-center"
                style={{ boxShadow: '0 14px 40px -8px rgba(139,30,45,0.5)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 3l1.8 5L19 9.5l-5.2 1.7L12 16l-1.8-4.8L5 9.5 10.2 8 12 3z"
                    fill="#F6F1E8"
                  />
                  <path
                    d="M18 16l.7 1.8L20.5 18l-1.8.5L18 20l-.5-1.5L15.5 18l1.5-.5L18 16z"
                    fill="#F6F1E8"
                  />
                </svg>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
