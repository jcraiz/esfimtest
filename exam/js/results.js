/**
 * ESFIM Exam Delivery — Results Screen & Report Generator
 * Renders the results dashboard, CEFR scale, PDF exporter, webhook reporter, and legal disclaimer.
 */
const ESFIMResults = (() => {

  /**
   * Render full results screen HTML into target container
   * @param {object} exam - exam configuration
   * @param {object} attempt - submitted attempt record with computed scores
   * @param {string} containerId - target DOM container ID
   */
  function render(exam, attempt, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const scores = attempt.scores || ESFIMScoring.computeAllScores(attempt);
    attempt.scores = scores;

    const overallLvl = ESFIMScoring.cefrForPct(scores.overall);
    const writingLvl = ESFIMScoring.cefrForPct(scores.writingScore);
    const readingLvl = ESFIMScoring.cefrForPct(scores.reading.pct);
    const listeningLvl = ESFIMScoring.cefrForPct(scores.listening.pct);
    const speakingEnabled = exam.speaking && exam.speaking.enabled !== false;
    const speakingLvlKey = speakingEnabled ? (attempt.speakingResults?.overallLevel || 'A0') : 'N/A';

    container.innerHTML = `
      <div class="results-container" style="max-width:920px;margin:0 auto;padding:var(--sp-6) var(--sp-4)">

        <!-- Header Subtitle -->
        <div class="text-center mb-6">
          <div class="label-sm text-primary">English Proficiency Assessment</div>
          <h1 style="font-size:28px;font-weight:800;margin:4px 0">Exam Results</h1>
          <p class="text-muted text-sm">
            ${escapeHtml(attempt.studentName)} · ID: ${escapeHtml(attempt.studentId)} · ${new Date(attempt.submittedAt || Date.now()).toLocaleDateString()}
          </p>
        </div>

        <!-- 1. OVERALL SCORE BANNER -->
        <div class="card p-6 mb-6" style="background:linear-gradient(135deg, #1B4F8A 0%, #3A7CA5 100%);color:#fff;position:relative">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div>
              <span class="label-sm" style="color:rgba(255,255,255,0.8)">OVERALL SCORE</span>
              <div style="font-family:var(--font-mono);font-size:64px;font-weight:800;line-height:1;margin:6px 0">
                ${scores.overall}%
              </div>
              <div class="text-sm" style="color:rgba(255,255,255,0.9)">
                Total correct: ${scores.vocab.correct + scores.grammar.correct + scores.reading.correct + scores.listening.correct} of ${scores.vocab.total + scores.grammar.total + scores.reading.total + scores.listening.total} questions
              </div>
            </div>

            <div class="text-right">
              <span class="label-sm" style="color:rgba(255,255,255,0.8)">ESTIMATED CEFR LEVEL</span>
              <div class="mt-2 mb-2">
                ${ESFIMScoring.cefrChipHtml(scores.overall, true)}
              </div>
              <span class="chip ${scores.passed ? 'chip-success' : 'chip-error'}" style="font-size:14px;padding:6px 16px">
                ${scores.passed ? 'PASSED ✓' : 'NOT PASSED ✗'}
              </span>
            </div>
          </div>
        </div>

        <!-- 2. FOUR SCORE CARDS (2x2 Grid) -->
        <div class="grid-2 mb-6">

          <!-- Card 1: WRITING SCORE (Vocab + Grammar) -->
          <div class="card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 style="font-size:16px">Overall Writing Score</h3>
              ${ESFIMScoring.cefrChipHtml(scores.writingScore)}
            </div>

            <div class="mb-3">
              <div class="flex justify-between text-xs text-muted mb-1">
                <span>Vocabulary</span>
                <span class="font-mono fw-600">${scores.vocab.pct}% (${scores.vocab.correct}/${scores.vocab.total})</span>
              </div>
              <div class="progress-bar mb-2">
                <div class="progress-fill" style="width:${scores.vocab.pct}%"></div>
              </div>

              <div class="flex justify-between text-xs text-muted mb-1">
                <span>Grammar</span>
                <span class="font-mono fw-600">${scores.grammar.pct}% (${scores.grammar.correct}/${scores.grammar.total})</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width:${scores.grammar.pct}%"></div>
              </div>
            </div>

            <div class="divider"></div>
            <div class="flex items-center justify-between">
              <span class="text-sm fw-600 text-secondary">Average Writing Score:</span>
              <span class="font-mono fw-800 text-primary" style="font-size:20px">${scores.writingScore}%</span>
            </div>
          </div>

          <!-- Card 2: READING -->
          <div class="card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 style="font-size:16px">Reading</h3>
              ${ESFIMScoring.cefrChipHtml(scores.reading.pct)}
            </div>

            <div style="font-family:var(--font-mono);font-size:36px;font-weight:800;color:var(--clr-primary);margin-bottom:8px">
              ${scores.reading.pct}%
            </div>
            <div class="progress-bar mb-3">
              <div class="progress-fill" style="width:${scores.reading.pct}%"></div>
            </div>
            <div class="text-sm text-muted">
              ${scores.reading.correct} of ${scores.reading.total} correct questions across the 3 reading passages.
            </div>
          </div>

          <!-- Card 3: LISTENING -->
          <div class="card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 style="font-size:16px">Listening</h3>
              ${ESFIMScoring.cefrChipHtml(scores.listening.pct)}
            </div>

            <div style="font-family:var(--font-mono);font-size:36px;font-weight:800;color:var(--clr-primary);margin-bottom:8px">
              ${scores.listening.pct}%
            </div>
            <div class="progress-bar mb-3">
              <div class="progress-fill" style="width:${scores.listening.pct}%"></div>
            </div>
            <div class="text-sm text-muted">
              ${scores.listening.correct} of ${scores.listening.total} correct questions across the 3 audio tracks.
            </div>
          </div>

          <!-- Card 4: SPEAKING -->
          <div class="card p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 style="font-size:16px">Speaking</h3>
              ${speakingEnabled ? ESFIMScoring.cefrChipFromKey(speakingLvlKey) : '<span class="chip chip-neutral">N/A</span>'}
            </div>

            ${speakingEnabled ? `
              <div class="text-xs text-muted mb-2">Adaptive Phonetic Assessment:</div>
              <div class="grid-2 gap-2 text-xs font-mono">
                <div>Part 1: <strong>${attempt.speakingResults?.partLevels?.[0] || 'A0'}</strong></div>
                <div>Part 2: <strong>${attempt.speakingResults?.partLevels?.[1] || 'A0'}</strong></div>
                <div>Part 3: <strong>${attempt.speakingResults?.partLevels?.[2] || 'A0'}</strong></div>
                <div>Part 4: <strong>${attempt.speakingResults?.partLevels?.[3] || 'A0'}</strong></div>
              </div>
            ` : `
              <div class="text-sm text-muted">The Speaking component was disabled for this examination.</div>
            `}
          </div>

        </div>

        <!-- 3. CEFR SCALE REFERENCE -->
        <div class="card p-6 mb-6">
          <h3 class="mb-2" style="font-size:16px">CEFR Classification Scale (Common European Framework of Reference)</h3>
          <p class="text-xs text-muted mb-4">Visual scale based on percentage scores obtained:</p>
          ${ESFIMScoring.cefrScaleHtml(overallLvl.key)}
        </div>

        <!-- 4. MANDATORY LEGAL DISCLAIMER -->
        <div class="alert alert-warning mb-6" style="background:#FFFBEB;border:1.5px solid #FCD34D;color:#78350F;padding:16px">
          <div class="flex gap-3">
            <span style="font-size:20px">⚖️</span>
            <div style="font-size:13px;line-height:1.6">
              <strong>DISCLAIMER:</strong> This report is for internal institutional evaluation purposes only and does not replace official standardized examinations approved by the Ministry of Education.
            </div>
          </div>
        </div>

        <!-- 5. ACTIONS & FOOTER -->
        <div class="flex justify-center gap-3 mb-6 btn-print-hide">
          <button type="button" class="btn btn-primary btn-lg" onclick="ESFIMResults.downloadPDF()">
            📄 Download PDF Report
          </button>
          <button type="button" class="btn btn-ghost btn-lg" onclick="window.close() || alert('Exam completed. You may close this tab.')">
            Close Exam
          </button>
        </div>

        <div class="text-center text-xs text-muted">
          ✓ The results of this exam have been recorded in the institutional system.
        </div>

      </div>`;

    // Trigger webhook submission in background if configured
    if (exam.webhookUrl && !attempt.webhookSent) {
      dispatchWebhook(exam, attempt);
    }
  }

  /**
   * PDF Export / Print Helper
   */
  function downloadPDF() {
    window.print();
  }

  /**
   * Send JSON payload to configured Google Sheets or Power Automate Webhook
   */
  async function dispatchWebhook(exam, attempt) {
    if (!exam.webhookUrl) return;
    try {
      const scores = attempt.scores || (typeof ESFIMScoring !== 'undefined' ? ESFIMScoring.computeAllScores(attempt) : {}) || {};
      const cefrLabel = (scores.overallCefr && typeof scores.overallCefr === 'object' && scores.overallCefr.label)
        ? scores.overallCefr.label
        : (typeof scores.overallCefr === 'string' ? scores.overallCefr : 'A0');

      const speakingEnabled = exam.speaking && exam.speaking.enabled !== false;
      const speakingLevel = speakingEnabled ? (attempt.speakingResults?.overallLevel || 'A0') : 'N/A';
      const speakingPart1 = speakingEnabled ? (attempt.speakingResults?.partLevels?.[0] || 'A0') : 'N/A';
      const speakingPart2 = speakingEnabled ? (attempt.speakingResults?.partLevels?.[1] || 'A0') : 'N/A';
      const speakingPart3 = speakingEnabled ? (attempt.speakingResults?.partLevels?.[2] || 'A0') : 'N/A';
      const speakingPart4 = speakingEnabled ? (attempt.speakingResults?.partLevels?.[3] || 'A0') : 'N/A';

      const rankVal = String(attempt.userRank || attempt.studentRank || attempt.rank || (attempt.studentInfo && attempt.studentInfo.rank) || 'N/A').trim() || 'N/A';

      const payload = {
        action: 'submit_results',
        studentName: attempt.studentName || '',
        studentFirstName: attempt.studentFirstName || attempt.studentName || '',
        studentLastName: attempt.studentLastName || '',
        userRank: rankVal,
        studentRank: rankVal,
        rank: rankVal,
        grado: rankVal,
        studentId: attempt.studentId || '',
        studentEmail: attempt.studentEmail || '',
        examTitle: exam.title || '',
        overallScore: typeof scores.overall === 'number' ? scores.overall : 0,
        overallCefr: cefrLabel,
        writingScore: typeof scores.writingScore === 'number' ? scores.writingScore : 0,
        vocabPct: (scores.vocab && typeof scores.vocab.pct === 'number') ? scores.vocab.pct : 0,
        grammarPct: (scores.grammar && typeof scores.grammar.pct === 'number') ? scores.grammar.pct : 0,
        readingPct: (scores.reading && typeof scores.reading.pct === 'number') ? scores.reading.pct : 0,
        listeningPct: (scores.listening && typeof scores.listening.pct === 'number') ? scores.listening.pct : 0,
        speakingLevel: speakingLevel,
        speakingPart1: speakingPart1,
        speakingPart2: speakingPart2,
        speakingPart3: speakingPart3,
        speakingPart4: speakingPart4,
        passed: Boolean(scores.passed),
        submittedAt: attempt.submittedAt || new Date().toISOString(),
      };

      console.log('[ESFIM Results] Dispatching score webhook payload to:', exam.webhookUrl, payload);

      // CORS workaround for Apps Script / Power Automate using text/plain content type
      await fetch(exam.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      attempt.webhookSent = true;
      ESFIMAttemptStore.saveAttempt(attempt);
      console.log('[ESFIM Results] Score webhook sent successfully.');
    } catch (e) {
      console.warn('[ESFIM Results] Webhook dispatch error:', e);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    render,
    downloadPDF,
    dispatchWebhook,
  };
})();
