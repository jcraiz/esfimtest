/**
 * ESFIM Shared Scoring Utilities
 * Provides: CEFR level mapping, Writing Score, section scoring
 */
const ESFIMScoring = (() => {

  /* -------------------------------------------------------
     CEFR Level Scale
     User-defined thresholds (0-100 percentage)
  ------------------------------------------------------- */
  const CEFR_LEVELS = [
    { key: 'A0',  label: 'A0',  cssClass: 'chip-a0',  min:  0.00, max: 10.00 },
    { key: 'A1',  label: 'A1',  cssClass: 'chip-a1',  min: 10.01, max: 20.00 },
    { key: 'A1+', label: 'A1+', cssClass: 'chip-a1p', min: 20.01, max: 30.00 },
    { key: 'A2',  label: 'A2',  cssClass: 'chip-a2',  min: 30.01, max: 40.00 },
    { key: 'A2+', label: 'A2+', cssClass: 'chip-a2p', min: 40.01, max: 50.00 },
    { key: 'B1',  label: 'B1',  cssClass: 'chip-b1',  min: 50.01, max: 60.00 },
    { key: 'B1+', label: 'B1+', cssClass: 'chip-b1p', min: 60.01, max: 70.00 },
    { key: 'B2',  label: 'B2',  cssClass: 'chip-b2',  min: 70.01, max: 80.00 },
    { key: 'B2+', label: 'B2+', cssClass: 'chip-b2p', min: 80.01, max: 90.00 },
    { key: 'C1',  label: 'C1',  cssClass: 'chip-c1',  min: 90.01, max: 100.0 },
  ];

  /**
   * Get CEFR level info for a given percentage score (0-100)
   * @param {number} pct - percentage 0..100
   * @returns {{ key, label, cssClass, min, max }}
   */
  function cefrForPct(pct) {
    const p = Math.max(0, Math.min(100, pct));
    for (let i = CEFR_LEVELS.length - 1; i >= 0; i--) {
      if (p >= CEFR_LEVELS[i].min) return CEFR_LEVELS[i];
    }
    return CEFR_LEVELS[0];
  }

  /**
   * Get CEFR level index (0 = A0, 7 = B2)
   */
  function cefrIndex(pct) {
    const lvl = cefrForPct(pct);
    return CEFR_LEVELS.findIndex(l => l.key === lvl.key);
  }

  /**
   * Render a CEFR level chip element (returns HTML string)
   * @param {number} pct
   * @param {boolean} [large=false]
   */
  function cefrChipHtml(pct, large = false) {
    const lvl = cefrForPct(pct);
    const sz = large ? 'style="font-size:1.1em;padding:5px 14px"' : '';
    return `<span class="chip chip-cefr ${lvl.cssClass}" ${sz}>${lvl.label}</span>`;
  }

  /**
   * Render CEFR chip from a level key string (used by speaking results)
   * @param {string} key — e.g. 'B1', 'A2+'
   */
  function cefrChipFromKey(key, large = false) {
    const lvl = CEFR_LEVELS.find(l => l.key === key) || CEFR_LEVELS[0];
    const sz = large ? 'style="font-size:1.1em;padding:5px 14px"' : '';
    return `<span class="chip chip-cefr ${lvl.cssClass}" ${sz}>${lvl.label}</span>`;
  }

  /* -------------------------------------------------------
     Section Scoring
  ------------------------------------------------------- */

  /**
   * Score a single question answer
   * @param {object} q - question object
   * @param {*} answer - student's answer
   * @returns {boolean} correct
   */
  function scoreQuestion(q, answer) {
    if (answer === null || answer === undefined || answer === '') return false;

    // Delegate to ESFIMAnswerService if available (supports Mode B external answer lookup)
    if (typeof ESFIMAnswerService !== 'undefined' && ESFIMAnswerService.getAnswer && ESFIMAnswerService.getAnswer(q.id)) {
      return ESFIMAnswerService.scoreQuestion(q, answer);
    }

    switch (q.type) {
      case 'mc':
      case 'tf':
        return String(answer).trim() === String(q.correct).trim();
      case 'fb': {
        const a = String(answer).trim().toLowerCase();
        const accepted = Array.isArray(q.correct) ? q.correct : [q.correct];
        return accepted.some(c => String(c).trim().toLowerCase() === a);
      }
      case 'mr': {
        if (!Array.isArray(answer) || !Array.isArray(q.correct)) return false;
        const given = answer.map(s => String(s).trim()).sort();
        const expected = q.correct.map(s => String(s).trim()).sort();
        return given.length === expected.length && given.every((v, i) => v === expected[i]);
      }
      case 'matching': {
        // answer is { left: right } mapping
        if (!answer || typeof answer !== 'object') return false;
        if (!Array.isArray(q.pairs)) return false;
        return q.pairs.every(p => String(answer[p.left] || '').trim() === String(p.right).trim());
      }
      default: return false;
    }
  }

  /**
   * Score a full section
   * @param {Array} questions - question objects
   * @param {object} answers - { [questionId]: answer }
   * @returns {{ correct, total, pct }}
   */
  function scoreSection(questions, answers) {
    if (!questions || questions.length === 0) return { correct: 0, total: 0, pct: 0 };
    let correct = 0;
    for (const q of questions) {
      if (scoreQuestion(q, answers[q.id])) correct++;
    }
    const total = questions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, total, pct };
  }

  /**
   * Compute Writing Score = average of vocab% and grammar%
   * @param {number} vocabPct
   * @param {number} grammarPct
   * @returns {number} 0..100
   */
  function writingScore(vocabPct, grammarPct) {
    return Math.round((vocabPct + grammarPct) / 2);
  }

  /**
   * Compute overall score from all section scores
   * @param {number} vocabCorrect
   * @param {number} vocabTotal
   * @param {number} grammarCorrect
   * @param {number} grammarTotal
   * @param {number} readingCorrect
   * @param {number} readingTotal
   * @param {number} listeningCorrect
   * @param {number} listeningTotal
   * @returns {number} 0..100
   */
  function overallScore(vocabCorrect, vocabTotal, grammarCorrect, grammarTotal,
                        readingCorrect, readingTotal, listeningCorrect, listeningTotal) {
    const totalCorrect = vocabCorrect + grammarCorrect + readingCorrect + listeningCorrect;
    const totalQ = vocabTotal + grammarTotal + readingTotal + listeningTotal;
    return totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
  }

  /**
   * Build the full score report object for an attempt
   * @param {object} attempt - attempt record with answers and question arrays
   * @returns {object} scores
   */
  function computeAllScores(attempt) {
    const vocab    = scoreSection(attempt.vocabQuestions, attempt.vocabAnswers || {});
    const grammar  = scoreSection(attempt.grammarQuestions, attempt.grammarAnswers || {});
    const reading  = scoreSection(attempt.readingQuestions, attempt.readingAnswers || {});
    const listening = scoreSection(attempt.listeningQuestions, attempt.listeningAnswers || {});
    const writing  = writingScore(vocab.pct, grammar.pct);
    const overall  = overallScore(
      vocab.correct, vocab.total,
      grammar.correct, grammar.total,
      reading.correct, reading.total,
      listening.correct, listening.total
    );
    const passingScore = attempt.passingScore || 70;
    return {
      vocab,
      grammar,
      reading,
      listening,
      writingScore: writing,
      writingCefr: cefrForPct(writing),
      readingCefr: cefrForPct(reading.pct),
      listeningCefr: cefrForPct(listening.pct),
      overallCefr: cefrForPct(overall),
      overall,
      passed: overall >= passingScore,
    };
  }

  /* -------------------------------------------------------
     Timer Formatting
  ------------------------------------------------------- */
  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [
      h > 0 ? String(h).padStart(2, '0') : null,
      String(m).padStart(2, '0'),
      String(s).padStart(2, '0'),
    ].filter(Boolean).join(':');
  }

  /* -------------------------------------------------------
     CEFR Scale HTML (for results screen)
  ------------------------------------------------------- */
  function cefrScaleHtml(currentKey) {
    const segs = CEFR_LEVELS.map((lvl, i) => {
      const isActive = lvl.key === currentKey;
      const ranges = [
        '0–10%', '11–20%', '21–30%', '31–40%',
        '41–50%', '51–60%', '61–70%', '71–80%',
        '81–90%', '91–100%'
      ];
      return `
        <div class="cefr-scale-seg ${isActive ? 'active' : ''}" style="background:var(--cefr-${lvl.cssClass.replace('chip-','')})">
          <span class="cefr-scale-label">${lvl.label}</span>
          ${isActive ? '<div class="cefr-scale-needle">▼</div>' : ''}
          <span class="cefr-scale-range">${ranges[i]}</span>
        </div>`;
    }).join('');
    return `<div class="cefr-scale">${segs}</div>`;
  }

  /* -------------------------------------------------------
     Public API
  ------------------------------------------------------- */
  return {
    CEFR_LEVELS,
    cefrForPct,
    cefrIndex,
    cefrChipHtml,
    cefrChipFromKey,
    scoreQuestion,
    scoreSection,
    writingScore,
    overallScore,
    computeAllScores,
    formatTime,
    cefrScaleHtml,
  };
})();

if (typeof window !== 'undefined') window.ESFIMScoring = ESFIMScoring;
if (typeof module !== 'undefined') module.exports = ESFIMScoring;

