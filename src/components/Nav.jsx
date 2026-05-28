import React from 'react';
import { motion } from 'framer-motion';
import { Logo, ButtonPrimary, Container } from './atoms';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'About', href: '#about' },
  { label: 'FAQ', href: '#faq' },
];

export default function Nav() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${
        scrolled ? 'bg-ivory/85 backdrop-blur border-b border-line' : 'bg-transparent'
      }`}
    >
      <Container className="flex items-center justify-between h-[72px]">
        <Logo />
        <div className="hidden md:flex items-center gap-9">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[14px] text-navy/80 hover:text-wine transition-colors duration-200 relative group"
            >
              {l.label}
              <span className="absolute -bottom-1.5 left-0 right-0 h-px bg-wine scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="#"
            className="hidden sm:inline text-[14px] text-navy/80 hover:text-wine transition-colors"
          >
            Log in
          </a>
          <ButtonPrimary>Try Transcriby</ButtonPrimary>
        </div>
      </Container>
    </motion.nav>
  );
}
