/**
 * ESFIM Exam Delivery — Question Renderer & Answer Collector
 * Supports 5 question types: mc, tf, fb, mr, matching.
 */
const ESFIMQuestions = (() => {

  /**
   * Render a stack of question cards
   * @param {Array} questions - array of question objects
   * @param {object} answers - current answers object { [qId]: answer }
   * @param {object} flags - flagged questions object { [qId]: true }
   * @param {string} sectionKey - e.g. 'vocab', 'grammar', 'reading_0', 'listening_0'
   * @returns {string} HTML string
   */
  function renderQuestionStack(questions, answers, flags, sectionKey) {
    if (!questions || questions.length === 0) {
      return `<div class="p-6 text-center text-muted">No questions available in this section.</div>`;
    }

    return questions.map((q, idx) => {
      const qId = q.id;
      const currentAns = answers[qId];
      // Flag key is just qId — consistent with attempt.flaggedQuestions storage
      const isFlagged = !!(flags && flags[qId]);
      const isAnswered = currentAns !== undefined && currentAns !== null && currentAns !== '' &&
                         (!Array.isArray(currentAns) || currentAns.length > 0) &&
                         (typeof currentAns !== 'object' || Object.keys(currentAns).length > 0);

      let cardClasses = 'exam-q-card';
      if (isAnswered) cardClasses += ' answered';
      if (isFlagged) cardClasses += ' flagged';

      return `
        <div class="${cardClasses}" id="qcard-${qId}">
          <div class="q-card-top">
            <span class="q-number-chip">Question ${idx + 1}</span>
            <button type="button" class="flag-btn ${isFlagged ? 'active' : ''}"
                    id="flagbtn-${qId}"
                    onclick="ESFIMQuestions.toggleFlag('${qId}')"
                    aria-label="${isFlagged ? 'Unflag question' : 'Flag question for review'}"
                    aria-pressed="${isFlagged}"
                    title="${isFlagged ? 'Remove flag' : 'Flag for review'}">
              ${isFlagged ? '🚩 Flagged' : '🏳️ Flag'}
            </button>
          </div>

          <div class="q-text">${escapeHtml(q.text)}</div>

          <div class="q-options-container">
            ${renderQuestionInput(q, currentAns, sectionKey)}
          </div>
        </div>`;
    }).join('');
  }

  /**
   * Render input elements for specific question type
   */
  function renderQuestionInput(q, currentAns, sectionKey) {
    const qId = q.id;

    switch (q.type) {
      case 'mc': {
        const opts = q.options || [];
        return opts.map((opt, oi) => {
          const checked = String(currentAns) === String(opt);
          return `
            <label class="option-label">
              <input type="radio" name="q_${qId}" value="${escapeHtml(opt)}" ${checked ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleInput('${qId}', this.value)">
              <span>${escapeHtml(opt)}</span>
            </label>`;
        }).join('');
      }

      case 'tf': {
        const isTrue = String(currentAns) === 'true';
        const isFalse = String(currentAns) === 'false';
        return `
          <div class="flex gap-3">
            <label class="option-label" style="flex:1">
              <input type="radio" name="q_${qId}" value="true" ${isTrue ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleInput('${qId}', 'true')">
              <span>True</span>
            </label>
            <label class="option-label" style="flex:1">
              <input type="radio" name="q_${qId}" value="false" ${isFalse ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleInput('${qId}', 'false')">
              <span>False</span>
            </label>
          </div>`;
      }

      case 'fb': {
        const val = typeof currentAns === 'string' ? currentAns : '';
        return `
          <input type="text" class="fb-input" value="${escapeHtml(val)}" placeholder="Type your answer here..."
                 oninput="ESFIMQuestions.handleInput('${qId}', this.value)">`;
      }

      case 'mr': {
        const opts = q.options || [];
        const selectedArr = Array.isArray(currentAns) ? currentAns : [];
        return opts.map((opt, oi) => {
          const checked = selectedArr.includes(opt);
          return `
            <label class="option-label">
              <input type="checkbox" name="q_${qId}" value="${escapeHtml(opt)}" ${checked ? 'checked' : ''}
                     onchange="ESFIMQuestions.handleMRChange('${qId}')">
              <span>${escapeHtml(opt)}</span>
            </label>`;
        }).join('');
      }

      case 'matching': {
        const pairs = q.pairs || [];
        const currentMap = (currentAns && typeof currentAns === 'object') ? currentAns : {};
        const rightChoices = getOrShuffleMatchingChoices(q);

        return `
          <div class="matching-container">
            ${pairs.map((p, pi) => {
              const rawLeft = String(p.left || '');
              const selectedVal = currentMap[rawLeft] || '';
              // Store the raw (unescaped) left key in a data attribute so
              // handleMatchingChange can read it without HTML-decoding issues.
              return `
                <div class="matching-row" data-matching-left="${escapeHtml(rawLeft)}">
                  <div class="matching-left">${escapeHtml(rawLeft)}</div>
                  <span style="color:var(--clr-text-muted)">→</span>
                  <select class="matching-select"
                          onchange="ESFIMQuestions.handleMatchingChange('${qId}', this)">
                    <option value="">-- Select --</option>
                    ${rightChoices.map(rc => `
                      <option value="${escapeHtml(rc)}" ${String(selectedVal) === String(rc) ? 'selected' : ''}>
                        ${escapeHtml(rc)}
                      </option>`).join('')}
                  </select>
                </div>`;
            }).join('')}
          </div>`;
      }

      default:
        return `<div class="text-error">Unknown question type: ${q.type}</div>`;
    }
  }

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
   * Get or generate shuffled right-side choices for a matching question.
   * Guarantees that the options presented in dropdowns are shuffled and not in answer-key order.
   */
  function getOrShuffleMatchingChoices(q) {
    if (!q) return [];
    const pairs = Array.isArray(q.pairs) ? q.pairs : [];
    const originalRights = pairs.map(p => String(p.right || '').trim()).filter(s => s.length > 0);

    // 1. Check if valid pre-shuffled choices already exist on the question
    let candidate = null;
    if (Array.isArray(q.shuffledRight) && q.shuffledRight.some(s => String(s || '').trim().length > 0)) {
      candidate = q.shuffledRight;
    } else if (Array.isArray(q.shuffledRightChoices) && q.shuffledRightChoices.some(s => String(s || '').trim().length > 0)) {
      candidate = q.shuffledRightChoices;
    } else if (Array.isArray(q.rightChoices) && q.rightChoices.some(s => String(s || '').trim().length > 0)) {
      candidate = q.rightChoices;
    }

    if (candidate && candidate.length > 0) {
      const cleanCandidate = candidate.map(s => String(s || '').trim()).filter(s => s.length > 0);
      const isIdenticalToUnshuffled = originalRights.length > 1 &&
        cleanCandidate.length === originalRights.length &&
        cleanCandidate.every((val, idx) => val === originalRights[idx]) &&
        new Set(originalRights).size > 1;

      if (!isIdenticalToUnshuffled) {
        return cleanCandidate;
      }
    }

    // 2. Build and shuffle from available options pool
    let pool = (candidate && candidate.length > 0) ? candidate : originalRights;
    pool = pool.map(s => String(s || '').trim()).filter(s => s.length > 0);

    if (pool.length <= 1) {
      q.shuffledRight = pool;
      q.shuffledRightChoices = pool;
      q.rightChoices = pool;
      return pool;
    }

    let shuffled = shuffleArray(pool);
    const hasDistinct = new Set(pool).size > 1;
    let attempts = 0;
    while (hasDistinct && attempts < 10 && shuffled.every((v, i) => v === pool[i])) {
      shuffled = shuffleArray(pool);
      attempts++;
    }
    if (hasDistinct && shuffled.every((v, i) => v === pool[i])) {
      shuffled = [...pool.slice(1), pool[0]];
    }

    // Cache on question object for stable dropdown choices across re-renders
    q.shuffledRight = shuffled;
    q.shuffledRightChoices = shuffled;
    q.rightChoices = shuffled;
    return shuffled;
  }

  // Registry for callbacks
  let _onAnswerCb = null;
  let _onFlagCb = null;

  function registerCallbacks(onAnswer, onFlag) {
    _onAnswerCb = onAnswer;
    _onFlagCb = onFlag;
  }

  function handleInput(qId, val) {
    if (_onAnswerCb) _onAnswerCb(qId, val);
  }

  function handleMRChange(qId) {
    const card = document.getElementById(`qcard-${qId}`);
    if (!card) return;
    const checkedBoxes = card.querySelectorAll('input[type="checkbox"]:checked');
    const vals = Array.from(checkedBoxes).map(cb => cb.value);
    if (_onAnswerCb) _onAnswerCb(qId, vals);
  }

  // selectEl is the <select> DOM element that was changed
  function handleMatchingChange(qId, selectEl) {
    const card = document.getElementById(`qcard-${qId}`);
    if (!card) return;
    const rows = card.querySelectorAll('.matching-row');
    const mapping = {};
    rows.forEach(row => {
      // Read the raw unescaped left key from the data attribute set at render time
      const leftKey = row.getAttribute('data-matching-left');
      const sel = row.querySelector('.matching-select');
      if (leftKey && sel && sel.value) {
        mapping[leftKey] = sel.value;
      }
    });
    if (_onAnswerCb) _onAnswerCb(qId, mapping);
  }

  /**
   * Toggle flag on a question card.
   * Calls _onFlagCb(qId) — the app determines the new state and updates the DOM.
   */
  function toggleFlag(qId) {
    if (_onFlagCb) _onFlagCb(qId);
  }

  /**
   * Update flag button and card appearance in-place (called by exam-app after state update)
   */
  function updateFlagDisplay(qId, isFlagged) {
    const card = document.getElementById(`qcard-${qId}`);
    const btn = document.getElementById(`flagbtn-${qId}`);
    if (card) {
      card.classList.toggle('flagged', isFlagged);
    }
    if (btn) {
      btn.classList.toggle('active', isFlagged);
      btn.setAttribute('aria-pressed', String(isFlagged));
      btn.setAttribute('aria-label', isFlagged ? 'Unflag question' : 'Flag question for review');
      btn.setAttribute('title', isFlagged ? 'Remove flag' : 'Flag for review');
      btn.innerHTML = isFlagged ? '🚩 Flagged' : '🏳️ Flag';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    renderQuestionStack,
    registerCallbacks,
    handleInput,
    handleMRChange,
    handleMatchingChange,
    toggleFlag,
    updateFlagDisplay,
  };
})();

if (typeof window !== 'undefined') window.ESFIMQuestions = ESFIMQuestions;
if (typeof module !== 'undefined') module.exports = ESFIMQuestions;

