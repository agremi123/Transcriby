import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Nav from '../components/Nav';
import { Container } from '../components/atoms';

function FillQuestion({ q, idx, onAnswer }) {
  const [val, setVal] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const [correct, setCorrect] = React.useState(null);

  const check = () => {
    if (!val.trim()) return;
    const isCorrect = val.trim().toLowerCase() === q.answer.toLowerCase();
    setCorrect(isCorrect);
    setSubmitted(true);
    onAnswer(isCorrect);
  };

  const parts = q.sentence.split('___');

  return (
    <div className="border-b border-line/40 pb-4 mb-4 last:border-0 last:mb-0 last:pb-0">
      <p className="text-[9px] font-mono tracking-[0.15em] uppercase text-navy/30 mb-2">Fill in the blank</p>
      <p className="font-display text-[15px] italic text-navy/80 leading-relaxed mb-3">
        {parts[0]}
        {submitted ? (
          <span className={`inline-block px-1.5 py-0.5 rounded text-[14px] not-italic font-semibold ${correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600 line-through'}`}>
            {val}
          </span>
        ) : (
          <input
            type="text"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
            placeholder={q.hint ? `(${q.hint})` : '…'}
            className="inline-block w-[110px] border-b-2 border-wine/40 bg-transparent text-navy text-center outline-none focus:border-wine px-1 font-display text-[15px] italic"
            autoComplete="off"
          />
        )}
        {parts[1]}
      </p>
      {submitted && !correct && (
        <p className="text-[11px] text-navy/40 mb-2">→ <span className="font-semibold text-navy/70">{q.answer}</span></p>
      )}
      {!submitted ? (
        <button
          type="button"
          onClick={check}
          disabled={!val.trim()}
          className="px-4 py-1.5 rounded-full bg-wine text-ivory text-[11px] font-display hover:bg-wine/85 transition-colors disabled:opacity-30"
        >
          Check
        </button>
      ) : (
        <p className={`text-[11px] font-semibold ${correct ? 'text-green-600' : 'text-red-500'}`}>
          {correct ? '✓ Correct' : '✗ Not quite'}
        </p>
      )}
    </div>
  );
}

function McqQuestion({ q, idx, onAnswer }) {
  const [picked, setPicked] = React.useState(null);

  const pick = (opt) => {
    if (picked !== null) return;
    setPicked(opt);
    onAnswer(opt === q.answer);
  };

  return (
    <div className="border-b border-line/40 pb-4 mb-4 last:border-0 last:mb-0 last:pb-0">
      <p className="text-[9px] font-mono tracking-[0.15em] uppercase text-navy/30 mb-2">Multiple choice</p>
      <p className="font-display text-[15px] text-navy/80 mb-3">{q.question}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {q.options.map((opt) => {
          const isCorrect = opt === q.answer;
          const isPicked = opt === picked;
          let cls = 'border border-line/50 bg-ivory/60 text-navy/65 hover:border-wine/40 hover:bg-wine/5';
          if (picked !== null) {
            if (isCorrect) cls = 'border-2 border-green-500 bg-green-50 text-green-700 font-semibold';
            else if (isPicked) cls = 'border-2 border-red-400 bg-red-50 text-red-500 line-through';
            else cls = 'border border-line/20 bg-ivory/30 text-navy/25';
          }
          return (
            <button key={opt} type="button" onClick={() => pick(opt)}
              className={`rounded-lg px-3 py-2 text-[12px] font-display text-left transition-colors ${cls} ${picked === null ? 'cursor-pointer' : 'cursor-default'}`}>
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className={`mt-2 text-[11px] font-semibold ${picked === q.answer ? 'text-green-600' : 'text-red-500'}`}>
          {picked === q.answer ? '✓ Correct' : `✗ → ${q.answer}`}
        </p>
      )}
    </div>
  );
}

export default function ReadingExercise() {
  const [searchParams] = useSearchParams();
  const topic = searchParams.get('topic') || '';

  const [phase, setPhase] = React.useState('loading');
  const [passage, setPassage] = React.useState('');
  const [source, setSource] = React.useState(null);
  const [questions, setQuestions] = React.useState([]);
  const [answers, setAnswers] = React.useState({});
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!topic) { setError('No topic.'); setPhase('error'); return; }
    fetch('/api/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    })
      .then((r) => r.json())
      .then((data) => {
        setPassage(data.passage || '');
        setSource(data.source || null);
        setQuestions(data.questions || []);
        setPhase('read');
      })
      .catch(() => { setError('Failed to load exercise.'); setPhase('error'); });
  }, [topic]);

  const answered = Object.keys(answers).length;
  const total = questions.length;
  const score = Object.values(answers).filter(Boolean).length;

  return (
    <div className="min-h-screen overflow-hidden" style={{ background: 'radial-gradient(60% 80% at 80% 30%, rgba(217,196,162,0.30), transparent 60%), linear-gradient(180deg, #F6F1E8 0%, #F2EBDA 100%)' }}>
      <Nav />

      <main className="pt-[72px] min-h-screen flex flex-col">
        <Container className="max-w-[1160px] flex-1 flex flex-col">

          <div className="pt-8 pb-4">
            <Link to="/targets"
              className="inline-flex items-center gap-1 text-[10.5px] font-mono tracking-widest uppercase text-navy/30 hover:text-wine transition-colors">
              <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 1L3 5l4 4"/>
              </svg>
              Back to targets
            </Link>
          </div>

          {/* Two-column layout */}
          <div className="flex-1 grid lg:grid-cols-[1fr_420px] gap-8 xl:gap-12 pb-16 items-start">

            {/* LEFT — article text */}
            <div className="flex flex-col justify-start pt-4">
              {/* Tape label */}
              <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 bg-navy text-ivory rounded-sm self-start">
                <span className="text-[9px] font-mono tracking-[0.2em] uppercase opacity-60">Reading</span>
                <span className="text-[9px] font-mono opacity-30">—</span>
                <span className="text-[10px] font-mono tracking-wide opacity-90 max-w-[260px] truncate">{topic}</span>
              </div>

              {phase === 'loading' && (
                <div className="flex items-center gap-3 py-10">
                  <div className="w-5 h-5 rounded-full border-2 border-wine/20 border-t-wine animate-spin shrink-0" />
                  <p className="text-[14px] text-navy/40 font-display italic">Searching for an article…</p>
                </div>
              )}

              <AnimatePresence>
                {(phase === 'read' || phase === 'questions') && passage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <p className="font-display text-[22px] sm:text-[26px] leading-[1.65] text-navy/85 italic whitespace-pre-wrap mb-6">
                      {passage}
                    </p>
                    {source && (
                      <p className="text-[10px] font-mono tracking-[0.16em] uppercase text-navy/30 border-t border-line/40 pt-3">
                        Source — {source}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* RIGHT — white card */}
            <div className="lg:sticky lg:top-[96px]">
              <AnimatePresence mode="wait">

                {/* Phase 1: CTA to start questions */}
                {phase === 'read' && (
                  <motion.div
                    key="cta"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="bg-paper rounded-2xl border border-line/60 shadow-[0_8px_40px_rgba(26,35,64,0.08)] p-7 flex flex-col items-center gap-4 text-center"
                  >
                    <p className="font-display text-[20px] italic text-navy/80 leading-snug">
                      Lis le texte,<br/>puis réponds aux questions.
                    </p>
                    <p className="text-[12px] text-navy/35 font-display">4 questions — fill in the blank & multiple choice</p>
                    <button
                      type="button"
                      onClick={() => setPhase('questions')}
                      className="mt-2 px-7 py-3 rounded-full bg-wine text-ivory font-display text-[14px] hover:bg-wine/85 transition-colors shadow-md"
                    >
                      I've read it →
                    </button>
                  </motion.div>
                )}

                {/* Phase 2: Questions */}
                {phase === 'questions' && (
                  <motion.div
                    key="questions"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="bg-paper rounded-2xl border border-line/60 shadow-[0_8px_40px_rgba(26,35,64,0.08)] p-7"
                  >
                    {questions.map((q, i) =>
                      q.type === 'fill' ? (
                        <FillQuestion key={i} q={q} idx={i}
                          onAnswer={(ok) => setAnswers((p) => ({ ...p, [i]: ok }))} />
                      ) : (
                        <McqQuestion key={i} q={q} idx={i}
                          onAnswer={(ok) => setAnswers((p) => ({ ...p, [i]: ok }))} />
                      )
                    )}

                    {answered === total && total > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-5 pt-5 border-t border-line/40 text-center"
                      >
                        <p className="font-display text-[24px] italic text-navy mb-1">{score}/{total}</p>
                        <p className="text-[12px] text-navy/40 mb-4">
                          {score === total ? 'Parfait !' : score >= total / 2 ? 'Pas mal !' : 'On continue…'}
                        </p>
                        <Link to="/targets"
                          className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-wine/30 text-wine text-[12px] font-display hover:bg-wine/5 transition-colors">
                          Back to targets
                        </Link>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {phase === 'loading' && (
                  <div className="bg-paper rounded-2xl border border-line/60 shadow-[0_8px_40px_rgba(26,35,64,0.08)] p-7 flex items-center justify-center min-h-[200px]">
                    <div className="w-6 h-6 rounded-full border-2 border-wine/20 border-t-wine animate-spin" />
                  </div>
                )}

              </AnimatePresence>
            </div>

          </div>
        </Container>
      </main>
    </div>
  );
}
