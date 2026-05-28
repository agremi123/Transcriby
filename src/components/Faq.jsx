import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Container, Reveal, SectionLabel } from './atoms';

const QUESTIONS = [
  {
    q: 'Does Transcriby work offline?',
    a: 'Transcriby works primarily online to take full advantage of our real-time AI. A limited offline mode is available on Premium for reviewing previously downloaded lessons.',
  },
  {
    q: 'What languages are supported?',
    a: 'Transcriby specialises in French correction. The interface is available in English, French, Spanish and Arabic to make learning as accessible as possible.',
  },
  {
    q: 'Is my voice data private?',
    a: 'Absolutely. Your recordings are end-to-end encrypted, never shared, and automatically deleted after analysis. You stay in full control at all times.',
  },
  {
    q: 'Can I prepare for the TCF or TEF with Transcriby?',
    a: 'Yes. Pro and Premium plans include full simulations with detailed scoring aligned with the official TCF and TEF Canada marking schemes.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'At any time from your account settings. No hidden fees, no lock-in period. You keep access until the end of your current billing cycle.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'Yes, Transcriby is available on iOS and Android. Your progress syncs automatically across all your devices.',
  },
];

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-6 py-5 text-left group"
        aria-expanded={isOpen}
      >
        <span className="font-display text-[22px] md:text-[24px] text-navy group-hover:text-wine transition-colors">
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-9 h-9 flex-none border border-navy/20 flex items-center justify-center text-navy group-hover:border-wine group-hover:text-wine transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M6 1v10M1 6h10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-6 pr-12 text-[15px] leading-[1.7] text-navy/70 max-w-[640px]">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Faq() {
  const [open, setOpen] = React.useState(0);

  return (
    <section id="faq" className="relative py-24 md:py-28">
      <Container>
        <div className="grid lg:grid-cols-[1fr,2fr] gap-12 lg:gap-16 items-start">
          <div className="lg:sticky lg:top-32">
            <SectionLabel>Frequently asked</SectionLabel>
            <h2 className="font-display text-[44px] md:text-[54px] leading-[1.02] text-navy">
              Everything you
              <br />
              need to <span className="italic text-wine">know.</span>
            </h2>
            <p className="mt-6 text-[15px] leading-[1.7] text-navy/65 max-w-[340px]">
              Have a question we haven&apos;t answered? Our team typically responds within 24 hours.
            </p>
            <a
              href="#"
              className="group inline-flex items-center gap-2 mt-7 text-wine text-[14px] font-medium"
            >
              Contact support
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
          </div>

          <div className="border-t border-line">
            {QUESTIONS.map((item, i) => (
              <FaqItem
                key={item.q}
                item={item}
                isOpen={open === i}
                onToggle={() => setOpen(open === i ? -1 : i)}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
