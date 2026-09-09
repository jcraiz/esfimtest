/**
 * ESFIM Exam Delivery — Attempt Persistence Store
 * Manages attempt creation, bank item locking, answer state, and reload recovery.
 */
const ESFIMAttemptStore = (() => {

  const ATTEMPT_KEY_PREFIX = 'esfim_attempt_';

  /**
   * Fisher-Yates array shuffle helper
   */
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Initialize or resume an attempt for a given exam
   * @param {object} exam - loaded exam object
   * @param {object} studentInfo - { name, id, email }
   * @returns {object} attempt record
   */
  function initAttempt(exam, studentInfo) {
    const storageKey = ATTEMPT_KEY_PREFIX + exam.id;
    let existing = null;

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) existing = JSON.parse(raw);
    } catch (e) {
      console.warn('Could not read attempt from storage:', e);
    }

    // If active attempt exists and matches student, resume it
    if (existing && existing.status === 'in_progress' && existing.studentId === studentInfo.id) {
      const activeRank = studentInfo.rank || studentInfo.userRank || studentInfo.studentRank || existing.userRank || existing.studentRank || 'N/A';
      existing.userRank = activeRank;
      existing.studentRank = activeRank;
      existing.rank = activeRank;
      return existing;
    }

    const assignedRank = studentInfo.rank || studentInfo.userRank || studentInfo.studentRank || 'N/A';

    // Otherwise, create a brand new attempt and lock item selections
    const attempt = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      examId: exam.id,
      examVersion: exam.version || 1,
      studentName: studentInfo.name,
      studentFirstName: studentInfo.firstName || studentInfo.name || '',
      studentLastName: studentInfo.lastName || '',
      studentRank: assignedRank,
      userRank: assignedRank,
      rank: assignedRank,
      studentId: studentInfo.id,
      studentEmail: studentInfo.email,
      startedAt: new Date().toISOString(),
      submittedAt: null,
      status: 'in_progress',
      terminationReason: null,
      timeRemainingSeconds: (exam.timerMinutes || 90) * 60,
      currentSectionIdx: 0,

      // Locked Vocab & Grammar question selections
      vocabQuestions: selectQuestions(exam.vocabulary.questions, exam.vocabulary.displayCount, exam.vocabulary.shuffleOptions),
      grammarQuestions: selectQuestions(exam.grammar.questions, exam.grammar.displayCount, exam.grammar.shuffleOptions),

      // Locked Reading bank item selections (1 item per bank)
      selectedReadingItems: exam.readingBanks.map((bank, i) => selectBankItem(bank, `reading_${i}`)),

      // Locked Listening bank item selections (1 item per bank)
      selectedListeningItems: exam.listeningBanks.map((bank, i) => selectBankItem(bank, `listening_${i}`)),

      // Student answers
      vocabAnswers: {},
      grammarAnswers: {},
      readingAnswers: {},
      listeningAnswers: {},

      // Audio playback tracking: { itemKey: playCount }
      audioPlayCounts: {},

      // Flagged questions: { "sectionKey-questionId": true }
      flaggedQuestions: {},

      // Speaking results
      speakingResults: null,

      // Passing score threshold (from exam configuration, default 70%)
      passingScore: exam.passingScore || 70,

      // Violations log
      violations: [],

      // Computed scores on submit
      scores: null,
    };

    saveAttempt(attempt);
    return attempt;
  }

  /**
   * Select questions from bank with optional shuffle
   */
  function selectQuestions(bankQuestions, count, shuffleOptions) {
    if (!bankQuestions || bankQuestions.length === 0) return [];
    let selected = shuffleArray(bankQuestions).slice(0, count || bankQuestions.length);
    selected = selected.map((q, idx) => {
      const copy = { ...q, id: q.id || ('q_vocab_gram_' + idx + '_' + Math.random().toString(36).substr(2, 6)) };

      // Shuffle MC/MR option order when requested
      if (shuffleOptions && (copy.type === 'mc' || copy.type === 'mr') && copy.options) {
        copy.options = shuffleArray(copy.options);
      }

      // Matching: ALWAYS shuffle right-side choices (unshuffled = trivially reveals the answer order)
      if (copy.type === 'matching' && Array.isArray(copy.pairs) && copy.pairs.length > 0) {
        if (shuffleOptions) {
          copy.pairs = shuffleArray(copy.pairs); // also shuffle left-side order if requested
        }

        const shuffledList = shuffleMatchingChoices(copy);
        copy.shuffledRight = shuffledList;
        copy.shuffledRightChoices = shuffledList;
        copy.rightChoices = shuffledList;
      }

      return copy;
    });
    return selected;
  }

  /**
   * Helper to extract and shuffle matching options ensuring non-trivial order
   */
  function shuffleMatchingChoices(q) {
    let rightItems = [];
    if (Array.isArray(q.shuffledRight) && q.shuffledRight.some(s => String(s || '').trim().length > 0)) {
      rightItems = q.shuffledRight.filter(s => String(s || '').trim().length > 0);
    } else if (Array.isArray(q.shuffledRightChoices) && q.shuffledRightChoices.some(s => String(s || '').trim().length > 0)) {
      rightItems = q.shuffledRightChoices.filter(s => String(s || '').trim().length > 0);
    } else if (Array.isArray(q.rightChoices) && q.rightChoices.some(s => String(s || '').trim().length > 0)) {
      rightItems = q.rightChoices.filter(s => String(s || '').trim().length > 0);
    } else if (Array.isArray(q.pairs)) {
      rightItems = q.pairs.map(p => String(p.right || '').trim()).filter(s => s.length > 0);
    }

    if (rightItems.length <= 1) return rightItems;

    let shuffled = shuffleArray(rightItems);
    const hasDistinct = new Set(rightItems).size > 1;
    let attempts = 0;
    while (hasDistinct && attempts < 10 && shuffled.every((v, i) => v === rightItems[i])) {
      shuffled = shuffleArray(rightItems);
      attempts++;
    }
    if (hasDistinct && shuffled.every((v, i) => v === rightItems[i])) {
      shuffled = [...rightItems.slice(1), rightItems[0]];
    }
    return shuffled;
  }

  /**
   * Pick 1 published item from a bank deterministically at attempt start
   */
  function selectBankItem(bank, logTag) {
    const published = (bank?.items || []).filter(it => it.status === 'published');
    const itemsToPickFrom = published.length > 0 ? published : (bank?.items || []);
    if (itemsToPickFrom.length === 0) return null;
    const picked = itemsToPickFrom[Math.floor(Math.random() * itemsToPickFrom.length)];
    const clone = JSON.parse(JSON.stringify(picked));
    if (clone.questions) {
      clone.questions = clone.questions.map((q, idx) => {
        const copy = {
          ...q,
          id: q.id || (`q_${logTag}_${idx}_` + Math.random().toString(36).substr(2, 6))
        };

        // Matching: ALWAYS generate a freshly shuffled right-side choices list
        if (copy.type === 'matching' && Array.isArray(copy.pairs) && copy.pairs.length > 0) {
          const shuffledList = shuffleMatchingChoices(copy);
          copy.shuffledRight = shuffledList;
          copy.shuffledRightChoices = shuffledList;
          copy.rightChoices = shuffledList;
        }

        return copy;
      });
    }
    return clone;
  }

  /**
   * Save attempt state to localStorage
   */
  function saveAttempt(attempt) {
    try {
      const storageKey = ATTEMPT_KEY_PREFIX + attempt.examId;
      localStorage.setItem(storageKey, JSON.stringify(attempt));
    } catch (e) {
      console.error('Failed to save attempt to localStorage:', e);
    }
  }

  /**
   * Get active attempt if one exists
   */
  function loadAttempt(examId) {
    try {
      const raw = localStorage.getItem(ATTEMPT_KEY_PREFIX + examId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear attempt from localStorage
   */
  function clearAttempt(examId) {
    localStorage.removeItem(ATTEMPT_KEY_PREFIX + examId);
  }

  return {
    initAttempt,
    saveAttempt,
    loadAttempt,
    clearAttempt,
  };
})();

if (typeof window !== 'undefined') window.ESFIMAttemptStore = ESFIMAttemptStore;
if (typeof module !== 'undefined') module.exports = ESFIMAttemptStore;

