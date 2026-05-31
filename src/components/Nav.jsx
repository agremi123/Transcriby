import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo, ButtonPrimary, Container } from './atoms';
import ParisianCornerBadge from './ParisianCornerBadge';

const navLinkClass = 'hidden sm:inline text-[14px] text-navy/80 hover:text-wine transition-colors';

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
        <div />
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link to="/expressions" className={navLinkClass}>
            My expressions
          </Link>
          <Link to="/targets" className={navLinkClass}>
            My targets
          </Link>
          <a href="#" className={navLinkClass}>
            Log in
          </a>
          <ParisianCornerBadge inline />
          <ButtonPrimary>Judge my French</ButtonPrimary>
        </div>
      </Container>
    </motion.nav>
  );
}
