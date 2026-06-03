import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Nav from '../components/Nav';
import { Container } from '../components/atoms';

function FillQuestion({ q, idx, onAnswer, answered }) {
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
    <div className="border border-line/60 rounded-xl p-5 bg-paper">
      <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-navy/30 mb-3">Question {idx + 1} — Fill in the blank</p>
      <p className="font-display text-[17px] italic text-navy/85 leading-relaxed mb-4">
        {parts[0]}
        {submitted ? (
          <span className={`inline-block px-2 py-0.5 rounded font-semibold not-italic ${correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700 line-through'}`}>
            {val}
          </span>
        ) : (
          <input
            type="text"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
            placeholder={q.hint ? `(${q.hint})` : '...'}
            className="inline-block w-[120px] border-b-2 border-wine/40 bg-transparent text-navy text-center outline-none focus:border-wine px-1 font-display text-[17px] italic"
            autoComplete="off"
          />
        )}
        {parts[1]}
      </p>
      {submitted && !correct && (
        <p className="text-[12px] text-navy/50 mb-3">
          Correct answer: <span className="font-semibold text-navy">{q.answer}</span>
        </p>
      )}
      {!submitted && (
        <button
          type="button"
          onClick={check}
          disabled={!val.trim()}
          className="px-5 py-2 rounded-full bg-wine text-ivory text-[13px] font-display hover:bg-wine/85 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Check
        </button>
      )}
      {submitted && (
        <p className={`text-[12px] font-semibold ${correct ? 'text-green-600' : 'text-red-500'}`}>
          {correct ? '✓ Correct !' : '✗ Not quite'}
        </p>
      )}
    </div>
  );
}

function McqQuestion({ q, idx, onAnswer, answered }) {
  const [picked, setPicked] = React.useState(null);

  const pick = (opt) => {
    if (picked !== null) return;
    setPicked(opt);
    onAnswer(opt === q.answer);
  };

  return (
    <div className="border border-line/60 rounded-xl p-5 bg-paper">
      <p className="text-[10px] font-mono tracking-[0.15em] uppercase text-navy/30 mb-3">Question {idx + 1} — Multiple choice</p>
      <p className="font-display text-[16px] text-navy/85 mb-4">{q.question}</p>
      <div className="grid grid-cols-2 gap-2">
        {q.options.map((opt) => {
          const isCorrect = opt === q.answer;
          const isPicked = opt === picked;
          let style = 'border border-line/60 bg-ivory text-navy/75 hover:border-wine/40 hover:bg-wine/5';
          if (picked !== null) {
            if (isCorrect) style = 'border-2 border-green-500 bg-green-50 text-green-700 font-semibold';
            else if (isPicked) style = 'border-2 border-red-400 bg-red-50 text-red-600 line-through';
            else style = 'border border-line/30 bg-ivory/50 text-navy/30';
          }
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(opt)}
              className={`rounded-lg px-4 py-3 text-[14px] font-display text-left transition-colors ${style} ${picked === null ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className={`mt-3 text-[12px] font-semibold ${picked === q.answer ? 'text-green-600' : 'text-red-500'}`}>
          {picked === q.answer ? '✓ Correct !' : `✗ Answer: ${q.answer}`}
        </p>
      )}
    </div>
  );
}

export default function ReadingExercise() {
  const [searchParams] = useSearchParams();
  const topic = searchParams.get('topic') || '';

  const [phase, setPhase] = React.useState('loading'); // loading | read | questions | done
  const [passage, setPassage] = React.useState('');
  const [source, setSource] = React.useState(null);
  const [questions, setQuestions] = React.useState([]);
  const [answers, setAnswers] = React.useState({});
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!topic) { setError('No topic specified.'); setPhase('done'); return; }
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
      .catch(() => { setError('Failed to load exercise.'); setPhase('done'); });
  }, [topic]);

  const answered = Object.keys(answers).length;
  const total = questions.length;
  const score = Object.values(answers).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-paper">
      <Nav />
      <main className="pt-[96px] pb-24">
        <Container className="max-w-[680px]">
          <Link to="/targets"
            className="inline-flex items-center gap-1 text-[10.5px] font-mono tracking-widest uppercase text-navy/30 hover:text-wine transition-colors mb-8">
            <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 1L3 5l4 4"/>
            </svg>
            Back
          </Link>

          {/* Tape label */}
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 bg-navy text-ivory rounded-sm">
            <span className="text-[9px] font-mono tracking-[0.2em] uppercase opacity-60">Reading</span>
            <span className="text-[9px] font-mono opacity-30">—</span>
            <span className="text-[10px] font-mono tracking-wide opacity-90 max-w-[300px] truncate">{topic}</span>
          </div>

          {/* Loading */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-20">
              <div className="w-6 h-6 rounded-full border-2 border-wine/20 border-t-wine animate-spin" />
              <p className="text-[13px] text-navy/40 font-display italic">Preparing your reading…</p>
            </div>
          )}

          {/* Phase 1: Read the passage */}
          <AnimatePresence mode="wait">
            {phase === 'read' && (
              <motion.div
                key="read"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                <div className="rounded-2xl border border-line/60 bg-ivory px-8 py-8 mb-8 shadow-sm">
                  <p className="font-display text-[19px] sm:text-[21px] italic leading-[1.7] text-navy/85 whitespace-pre-wrap">
                    {passage}
                  </p>
                  {source && (
                    <p className="mt-5 pt-4 border-t border-line/40 text-[10px] font-mono tracking-[0.14em] uppercase text-navy/30">
                      Source — {source}
                    </p>
                  )}
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setPhase('questions')}
                    className="px-8 py-3 rounded-full bg-wine text-ivory font-display text-[15px] hover:bg-wine/85 transition-colors shadow-md"
                  >
                    I've read it — show questions →
                  </button>
                </div>
              </motion.div>
            )}

            {/* Phase 2: Questions */}
            {phase === 'questions' && (
              <motion.div
                key="questions"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col gap-4"
              >
                {/* Passage collapsed */}
                <details className="group rounded-xl border border-line/40 bg-ivory/60 overflow-hidden mb-2">
                  <summary className="cursor-pointer px-5 py-3 text-[11px] font-mono tracking-[0.15em] uppercase text-navy/35 hover:text-navy/60 transition-colors list-none flex items-center gap-2">
                    <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5 group-open:rotate-90 transition-transform" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 1l4 4-4 4"/>
                    </svg>
                    Re-read the passage
                  </summary>
                  <div className="px-6 pb-5 pt-2">
                    <p className="font-display text-[15px] italic leading-[1.7] text-navy/70 whitespace-pre-wrap">{passage}</p>
                  </div>
                </details>

                {questions.map((q, i) =>
                  q.type === 'fill' ? (
                    <FillQuestion
                      key={i}
                      q={q}
                      idx={i}
                      answered={answers[i] !== undefined}
                      onAnswer={(correct) => setAnswers((prev) => ({ ...prev, [i]: correct }))}
                    />
                  ) : (
                    <McqQuestion
                      key={i}
                      q={q}
                      idx={i}
                      answered={answers[i] !== undefined}
                      onAnswer={(correct) => setAnswers((prev) => ({ ...prev, [i]: correct }))}
                    />
                  )
                )}

                {answered === total && total > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-wine/20 bg-wine/5 px-6 py-5 text-center mt-2"
                  >
                    <p className="font-display text-[22px] italic text-navy mb-1">
                      {score}/{total} correct
                    </p>
                    <p className="text-[12px] text-navy/40 mb-4">
                      {score === total ? 'Perfect ! Très bien.' : score >= total / 2 ? 'Pas mal — keep going.' : 'On va travailler ça.'}
                    </p>
                    <Link
                      to="/targets"
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-wine/30 text-wine text-[13px] font-display hover:bg-wine/5 transition-colors"
                    >
                      Back to targets
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {error && <p className="text-[13px] text-wine/70 text-center mt-8">{error}</p>}
        </Container>
      </main>
    </div>
  );
}
