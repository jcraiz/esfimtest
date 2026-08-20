/**
 * ESFIM Exam Delivery — Main Student Controller
 * Orchestrates start screen, 9-section navigation, timer countdown, question map, supervision, and submission.
 */
(() => {

  let exam = null;
  let attempt = null;
  let timerInterval = null;
  let currentTabIdx = 0;

  // 9 Section Tabs definition
  const SECTION_TABS = [
    { key: 'vocab', label: 'Vocabulary', type: 'vocab' },
    { key: 'grammar', label: 'Grammar', type: 'grammar' },
    { key: 'reading_0', label: 'Reading 1', type: 'reading', bankIdx: 0 },
    { key: 'reading_1', label: 'Reading 2', type: 'reading', bankIdx: 1 },
    { key: 'reading_2', label: 'Reading 3', type: 'reading', bankIdx: 2 },
    { key: 'listening_0', label: 'Listening 1', type: 'listening', bankIdx: 0 },
    { key: 'listening_1', label: 'Listening 2', type: 'listening', bankIdx: 1 },
    { key: 'listening_2', label: 'Listening 3', type: 'listening', bankIdx: 2 },
    { key: 'speaking', label: 'Speaking', type: 'speaking' },
  ];

  /* -------------------------------------------------------
     Boot
  ------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    exam = loadExamData();
    if (!exam) {
      document.body.innerHTML = `<div class="p-8 text-center text-error">Error: No exam data found. Please run this exam from a published ESFIM generator package or Author Studio.</div>`;
      return;
    }

    if (exam.colorScheme) {
      document.body.setAttribute('data-theme', exam.colorScheme);
    }

    renderStartScreen();
  });

  function loadExamData() {
    // 1. Check window.__ESFIM_EXAM__ (embedded in generated packages)
    if (window.__ESFIM_EXAM__) return window.__ESFIM_EXAM__;
    // 2. Check localStorage from Author Studio
    try {
      const raw = localStorage.getItem('esfim_exam_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  /* -------------------------------------------------------
     1. Start Screen & Identification Form
  ------------------------------------------------------- */
  function renderStartScreen() {
    const appEl = document.getElementById('esfim-exam-app');
    if (!appEl) return;

    appEl.innerHTML = `
      <div class="exam-screen-view active" style="align-items:center;padding:var(--sp-6) var(--sp-4);min-height:100%;overflow-y:auto">
        <div class="start-screen-card">
          <div class="start-card-header">
            ${exam.logoDataUrl
              ? `<img src="${exam.logoDataUrl}" style="max-height:60px;margin-bottom:12px">`
              : `<div class="start-crest">🏛️</div>`}
            <h1 style="font-size:26px;font-weight:800;color:var(--clr-text)">${escapeHtml(exam.title || 'Evaluación de Suficiencia en Inglés')}</h1>
            <p class="text-muted text-sm mt-1">${escapeHtml(exam.course || 'Academia de Idiomas')} · Nivel ${exam.level || 'B1-B2'}</p>

            <div class="start-cefr-strip">
              <span class="chip chip-a1">A1</span>
              <span class="chip chip-a2">A2</span>
              <span class="chip chip-b1">B1</span>
              <span class="chip chip-b2">B2</span>
            </div>

            ${exam.answerSource === 'external' ? `
              <div class="mt-3 text-center">
                <span class="chip chip-success" style="font-size:11px;padding:3px 10px">
                  🔒 Secured by External Answer Source (Google Sheets)
                </span>
              </div>` : ''}
          </div>

          <div class="p-6">
            ${exam.instructions ? `
              <div class="alert alert-info mb-4">
                <span class="alert-icon">ℹ️</span>
                <div>${escapeHtml(exam.instructions)}</div>
              </div>` : ''}

            <form id="student-form" onsubmit="handleStartExam(event)">
              ${exam.requireRank ? `
                <div class="form-field mb-3">
                  <label>Military Rank / Grado *</label>
                  <input type="text" id="st-rank" required placeholder="e.g. IM, CADETE, GRUMETE, ST, TN, TF, CC, CF, CN, BG, ALM">
                </div>` : ''}

              <div class="form-row">
                <div class="form-field">
                  <label>Student's Name *</label>
                  <input type="text" id="st-name" required placeholder="e.g. Maria">
                </div>
                <div class="form-field">
                  <label>Student's Last Name *</label>
                  <input type="text" id="st-lastname" required placeholder="e.g. Rodriguez">
                </div>
              </div>

              <div class="form-row">
                <div class="form-field">
                  <label>Student ID / Code *</label>
                  <input type="text" id="st-id" required placeholder="e.g. 20240315">
                </div>
                <div class="form-field">
                  <label>Institutional Email *</label>
                  <input type="email" id="st-email" required placeholder="e.g. student@university.edu">
                </div>
              </div>

              ${isAccessCodeRequired(exam) ? `
                <div class="form-field">
                  <label>Access Code *</label>
                  <input type="text" id="st-access-code" required placeholder="Enter the access code provided by your instructor" class="font-mono" autocomplete="off">
                </div>` : ''}

              ${exam.antiCheatingEnabled ? `
                <div class="alert alert-warning mb-4">
                  <span class="alert-icon">📷</span>
                  <div>
                    <strong>Camera Supervision Enabled:</strong>
                    Camera access will be requested for identity verification and random snapshots during the exam.
                  </div>
                </div>` : ''}

              <button type="submit" class="btn btn-primary btn-lg btn-block mt-2">
                Start Exam →
              </button>
            </form>

            <p class="text-xs text-muted text-center mt-4">
              By clicking Start Exam, you agree that your answers and results report will be recorded in the institutional system.
            </p>
          </div>
        </div>
      </div>`;
  }

  function isAccessCodeRequired(examObj) {
    if (!examObj) return false;
    if (examObj.accessCodeEnabled === false) return false;
    if (examObj.accessCodeEnabled === true) {
      if (examObj.accessCodeType === 'url') {
        return !!(examObj.accessCodeUrl && String(examObj.accessCodeUrl).trim());
      }
      return !!(examObj.accessCodeValue && String(examObj.accessCodeValue).trim());
    }
    if (examObj.accessCodeType === 'static' && examObj.accessCodeValue && String(examObj.accessCodeValue).trim()) return true;
    if (examObj.accessCodeType === 'url' && examObj.accessCodeUrl && String(examObj.accessCodeUrl).trim()) return true;
    return false;
  }

  /**
   * Remote Access Code Verification Helper
   * Attempts Fetch POST first, and falls back to JSONP for zero-CORS restriction on file:// URLs.
   */
  function verifyRemoteCode(url, payload) {
    return new Promise((resolve, reject) => {
      // 1. Try modern Fetch POST
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      })
      .then(resp => {
        if (resp.ok) return resp.json();
        throw new Error('HTTP ' + resp.status);
      })
      .then(data => resolve(data))
      .catch(fetchErr => {
        console.warn('[ESFIM] Fetch POST failed (likely CORS on file:// origin), attempting JSONP fallback:', fetchErr);

        // 2. Fallback to JSONP (works seamlessly on file:/// and offline web packages)
        try {
          const cbName = '__esfim_ac_' + Math.random().toString(36).substring(2, 9);
          const script = document.createElement('script');
          let timer = null;

          window[cbName] = function(data) {
            clearTimeout(timer);
            if (script.parentNode) script.parentNode.removeChild(script);
            try { delete window[cbName]; } catch (_) {}
            resolve(data);
          };

          script.onerror = function() {
            clearTimeout(timer);
            if (script.parentNode) script.parentNode.removeChild(script);
            try { delete window[cbName]; } catch (_) {}
            reject(new Error('Connection error during remote code verification'));
          };

          const sep = url.indexOf('?') === -1 ? '?' : '&';
          script.src = `${url}${sep}action=verify_code&code=${encodeURIComponent(payload.code)}&studentId=${encodeURIComponent(payload.studentId || '')}&studentEmail=${encodeURIComponent(payload.studentEmail || '')}&callback=${cbName}`;

          timer = setTimeout(() => {
            if (script.parentNode) script.parentNode.removeChild(script);
            try { delete window[cbName]; } catch (_) {}
            reject(new Error('Verification timeout'));
          }, 12000);

          document.head.appendChild(script);
        } catch (jsonpErr) {
          reject(jsonpErr);
        }
      });
    });
  }

  window.handleStartExam = async function(e) {
    e.preventDefault();

    // Trigger fullscreen synchronously inside user gesture loop
    ESFIMSupervision.requestFullscreen();

    const rankEl = document.getElementById('st-rank');
    const rank = rankEl ? rankEl.value.trim() : (exam.requireRank ? 'IM' : 'N/A');
    const name = document.getElementById('st-name').value.trim();
    const lastName = document.getElementById('st-lastname') ? document.getElementById('st-lastname').value.trim() : '';
    const id = document.getElementById('st-id').value.trim();
    const email = document.getElementById('st-email').value.trim();
    const fullName = lastName ? `${name} ${lastName}` : name;

    if (!name || !lastName || !id || !email || (exam.requireRank && !rank)) {
      alert('Please fill in all identification fields.');
      return;
    }

    // Verify Access Code if required
    if (isAccessCodeRequired(exam)) {
      const codeInput = document.getElementById('st-access-code');
      const inputCode = codeInput ? codeInput.value.trim() : '';
      if (!inputCode) {
        alert('Please enter the access code provided by your instructor.');
        return;
      }

      // Mode 1: Static Direct Password Verification (Offline)
      if (exam.accessCodeType === 'static' || (!exam.accessCodeType && exam.accessCodeValue)) {
        const validCodes = (exam.accessCodeValue || '')
          .split(',')
          .map(c => c.trim().toUpperCase())
          .filter(Boolean);

        if (validCodes.length > 0 && !validCodes.includes(inputCode.toUpperCase())) {
          alert('Incorrect access code. Please check the code provided by your instructor.');
          return;
        }
      }
      // Mode 2: Remote Webhook Verification (Google Sheets / Power Automate)
      else {
        const remoteUrl = (exam.accessCodeUrl && exam.accessCodeUrl.trim()) || (exam.webhookUrl && exam.webhookUrl.trim());
        if (remoteUrl) {
          try {
            const res = await verifyRemoteCode(remoteUrl, {
              action: 'verify_code',
              code: inputCode,
              studentId: id,
              studentEmail: email,
              studentName: fullName,
              studentFirstName: name,
              studentLastName: lastName,
              userRank: rank
            });
            if (!res || res.valid !== true) {
              alert(res && res.message ? res.message : 'Incorrect or unauthorized access code.');
              return;
            }
          } catch (err) {
            console.warn('Access code verification error:', err);
            alert('Could not verify the access code with the server. Check your internet connection or the code entered.');
            return;
          }
        }
      }
    }

    const studentInfo = { name: fullName, firstName: name, lastName: lastName, id, email, rank, userRank: rank, studentRank: rank };

    // Answer Service Initialization (Mode A: Local vs Mode B: External)
    if (typeof ESFIMAnswerService !== 'undefined') {
      const ansMode = exam.answerSource || 'local';
      const ansConfig = exam.externalAnswerConfig || { apiEndpoint: exam.webhookUrl };
      const ansRes = await ESFIMAnswerService.initialize(ansMode, ansConfig, exam);
      if (!ansRes.success && ansMode === 'external' && !ansConfig.fallbackToLocal) {
        alert('⚠️ External Answer Key Connection Error:\n' + (ansRes.error || 'Could not reach server.') + '\n\nPlease check your internet connection or contact your instructor.');
        return;
      }
    }

    // Anti-cheating setup
    if (exam.antiCheatingEnabled === true || exam.antiCheatingEnabled === 'true') {
      const camOk = await ESFIMSupervision.startCamera();
      if (!camOk) {
        alert('Camera access is required to take this proctored exam.');
        return;
      }
    }

    // Initialize or resume attempt
    attempt = ESFIMAttemptStore.initAttempt(exam, studentInfo);
    attempt.userRank = rank;
    attempt.studentRank = rank;
    attempt.rank = rank;
    window.__CURRENT_ATTEMPT__ = attempt;
    ESFIMAttemptStore.saveAttempt(attempt);

    // Launch main exam shell first so DOM (including #camera-video) is rendered
    renderExamShell();

    // Initialize supervision BEFORE capturing photos so _exam is set (needed for webhookUrl)
    ESFIMSupervision.init(exam, attempt, handleViolation, handleTermination);

    // Attach stream to #camera-video and take initial photo snapshot (after init, _exam is now set)
    if (exam.antiCheatingEnabled === true || exam.antiCheatingEnabled === 'true') {
      ESFIMSupervision.attachVideoStream();
      await ESFIMSupervision.capturePhoto('initial');
    }
  };

  /* -------------------------------------------------------
     2. Main Exam Shell (Header, Tabs, Section View, Timer)
  ------------------------------------------------------- */
  function renderExamShell() {
    const appEl = document.getElementById('esfim-exam-app');
    if (!appEl) return;

    appEl.innerHTML = `
      <!-- Fixed Header Navbar -->
      <header class="exam-header">
        <div class="exam-brand">
          ${exam.logoDataUrl ? `<img src="${exam.logoDataUrl}" class="exam-brand-logo">` : ''}
          <span class="exam-brand-title">${escapeHtml(exam.title || 'ESFIM Exam')}</span>
        </div>

        <!-- 9 Section Tabs -->
        <nav class="exam-nav-tabs" id="exam-tab-bar">
          ${SECTION_TABS.map((tab, idx) => `
            <button type="button" class="tab-pill ${idx === currentTabIdx ? 'active' : ''}"
                    id="tab-btn-${idx}" onclick="switchSection(${idx})">
              ${tab.label}
            </button>`).join('')}
        </nav>

        <!-- Timer & Controls -->
        <div class="exam-header-actions">
          <div class="timer-badge" id="exam-timer-badge">
            ⏱ <span id="timer-display">${ESFIMScoring.formatTime(attempt.timeRemainingSeconds)}</span>
          </div>


          <button type="button" class="qmap-toggle-btn" onclick="toggleQuestionMap()" title="Question Map">
            📊 Map
          </button>

          <button type="button" class="btn btn-danger btn-sm" onclick="confirmSubmitExam()">
            Submit Answers
          </button>
        </div>
      </header>

      <!-- Main Content View Area -->
      <div class="exam-main-container" id="exam-main-content">
        <!-- Rendered dynamically -->
      </div>

      <!-- Slide-in Question Map Panel -->
      <div class="qmap-panel" id="qmap-panel">
        <div class="qmap-header">
          <span class="fw-700 text-sm">Question Map</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="toggleQuestionMap()">✕</button>
        </div>
        <div class="qmap-grid" id="qmap-grid-dots"></div>
        <div class="qmap-legend">
          <span>⚪ Unanswered</span>
          <span style="color:var(--clr-primary)">🔵 Answered</span>
          <span style="color:var(--clr-warning)">🚩 Flagged</span>
        </div>
      </div>

      <!-- Camera Preview Widget -->
      ${exam.antiCheatingEnabled ? `
        <div id="camera-preview-container">
          <video id="camera-video" autoplay playsinline muted></video>
        </div>` : ''}

      <!-- Violation Overlay -->
      <div class="violation-overlay" id="violation-overlay" role="alertdialog" aria-modal="true" aria-labelledby="violation-title">
        <div class="violation-box">
          <h2 id="violation-title" style="font-size:24px;color:#FCA5A5;margin-bottom:8px">⚠️ Security Warning</h2>
          <p id="violation-reason-text" class="mb-4">A security violation has been detected.</p>
          <p class="text-sm text-muted mb-6">
            This exam must remain in fullscreen at all times. A second violation will <strong style="color:#FCA5A5">automatically terminate your exam and submit your current answers</strong>.
          </p>
          <button type="button" class="btn btn-danger btn-block" onclick="dismissViolationOverlay()" aria-label="Understood — continue exam">
            Understood — Return to Exam (Enable Fullscreen)
          </button>
        </div>
      </div>

      <!-- Accessible Submission Confirmation Modal -->
      <div class="modal-overlay" id="submission-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="modal-submit-title">
        <div class="modal p-6 text-center" style="max-width:480px">
          <div style="font-size:44px;margin-bottom:12px">📤</div>
          <h2 id="modal-submit-title" style="font-size:22px;font-weight:800;margin-bottom:8px">Submit Your Exam?</h2>
          <p id="modal-submit-desc" class="text-muted text-sm mb-4">
            Once submitted, your scores will be calculated and you will not be able to modify your answers.
          </p>
          <div id="modal-unanswered-alert" class="alert alert-warning mb-6 text-left" style="display:none">
            <span class="alert-icon">⚠️</span>
            <div>
              <strong id="modal-unanswered-count">You have unanswered questions.</strong>
              <div class="text-xs mt-1">We recommend reviewing the question map before submitting.</div>
            </div>
          </div>
          <div id="modal-answered-alert" class="alert alert-success mb-6 text-left" style="display:none">
            <span class="alert-icon">✓</span>
            <div>
              <strong>All questions have been answered!</strong>
              <div class="text-xs mt-1">You are ready to submit your results.</div>
            </div>
          </div>
          <div class="flex gap-3 justify-center">
            <button type="button" class="btn btn-ghost" onclick="closeSubmitModal()" aria-label="Review questions and cancel submission">
              Review Questions
            </button>
            <button type="button" class="btn btn-primary" onclick="proceedSubmitExam()" aria-label="Confirm and submit exam">
              Yes, Submit Exam ✓
            </button>
          </div>
        </div>
      </div>`;

    // Bind question callbacks
    ESFIMQuestions.registerCallbacks(handleQuestionAnswer, handleQuestionFlag);
    ESFIMAudio.setPlayCountCallback(handleAudioPlayCount);

    // Start countdown timer
    startTimer();

    // Render active section
    switchSection(attempt.currentSectionIdx || 0);
  }

  /* -------------------------------------------------------
     Section Switcher & Renderer
  ------------------------------------------------------- */
  window.switchSection = function(tabIdx) {
    currentTabIdx = tabIdx;
    attempt.currentSectionIdx = tabIdx;
    ESFIMAttemptStore.saveAttempt(attempt);

    // Update tab bar pills
    SECTION_TABS.forEach((t, idx) => {
      const btn = document.getElementById(`tab-btn-${idx}`);
      if (btn) btn.classList.toggle('active', idx === tabIdx);
    });

    const mainContainer = document.getElementById('exam-main-content');
    if (!mainContainer) return;

    const tab = SECTION_TABS[tabIdx];

    switch (tab.type) {
      case 'vocab':
        renderSingleColSection(mainContainer, 'vocab', 'Vocabulary', attempt.vocabQuestions, attempt.vocabAnswers);
        break;
      case 'grammar':
        renderSingleColSection(mainContainer, 'grammar', 'Grammar', attempt.grammarQuestions, attempt.grammarAnswers);
        break;
      case 'reading': {
        const item = attempt.selectedReadingItems[tab.bankIdx];
        renderSplitPaneSection(mainContainer, `reading_${tab.bankIdx}`, tab.label, item, attempt.readingAnswers);
        break;
      }
      case 'listening': {
        const item = attempt.selectedListeningItems[tab.bankIdx];
        renderListeningSection(mainContainer, `listening_${tab.bankIdx}`, tab.label, item, attempt.listeningAnswers);
        break;
      }
      case 'speaking':
        renderSpeakingSection(mainContainer);
        break;
    }

    updateQuestionMapGrid();
  };

  /* Single Column Sections (Vocab & Grammar) */
  function renderSingleColSection(container, key, title, questions, answers) {
    const secData = key === 'vocab' ? exam.vocabulary : exam.grammar;
    const showAudio = exam.audibleInstructionsEnabled !== false && secData?.audioInstructionEnabled !== false && secData?.audioInstructionDataUrl;

    container.innerHTML = `
      <div class="single-col-pane">
        <div class="flex items-center justify-between mb-4">
          <h2>${title}</h2>
          <span class="chip chip-neutral">${questions.length} questions</span>
        </div>

        ${(secData?.instructions || showAudio) ? `
          <div class="audio-instruction-card p-4 mb-4 flex items-center justify-between gap-4 flex-wrap" role="region" aria-label="Section instructions">
            <div class="flex items-center gap-3">
              <span style="font-size:22px" aria-hidden="true">🔊</span>
              <div>
                <div class="fw-700 text-sm">Section Instructions</div>
                <div class="text-xs text-muted">${escapeHtml(secData?.instructions || 'Select or type the correct answer.')}</div>
              </div>
            </div>
            ${showAudio ? `
              <audio controls src="${secData.audioInstructionDataUrl}" aria-label="Section instructions audio player" style="height:34px;max-width:260px"></audio>
            ` : ''}
          </div>
        ` : ''}

        <div id="qstack-${key}">
          ${ESFIMQuestions.renderQuestionStack(questions, answers, attempt.flaggedQuestions, key)}
        </div>

        ${renderNavFooter()}
      </div>`;
  }

  /* Split Pane Section (Reading) */
  function renderSplitPaneSection(container, key, title, item, answers) {
    if (!item) {
      container.innerHTML = `<div class="p-8 text-center text-muted">No item configured for ${title}.</div>`;
      return;
    }

    const showReadingAudio = exam.audibleInstructionsEnabled !== false && exam.readingAudioInstructionEnabled !== false && exam.readingAudioInstructionDataUrl;

    container.innerHTML = `
      <div class="split-pane">
        <!-- Left Pane: Passage -->
        <div class="split-left-pane">
          ${(exam.readingGeneralInstructions || showReadingAudio) ? `
            <div class="audio-instruction-card p-3 mb-3 flex items-center justify-between gap-3 flex-wrap" role="region" aria-label="General reading instructions">
              <div class="flex items-center gap-2">
                <span style="font-size:20px" aria-hidden="true">🔊</span>
                <div>
                  <div class="fw-700 text-xs">General Reading Instructions</div>
                  <div class="text-xs text-muted">${escapeHtml(exam.readingGeneralInstructions || 'Read the passages carefully and answer the questions.')}</div>
                </div>
              </div>
              ${showReadingAudio ? `
                <audio controls src="${exam.readingAudioInstructionDataUrl}" aria-label="General reading instructions audio player" style="height:32px;max-width:220px"></audio>
              ` : ''}
            </div>
          ` : ''}

          <div class="label-sm text-primary">Reading Passage</div>
          <div class="passage-title">${escapeHtml(item.title || title)}</div>
          ${item.instructions ? `<p class="text-xs text-muted mb-2">${escapeHtml(item.instructions)}</p>` : ''}

          ${item.mode === 'image' && item.passageImageDataUrl
            ? `<img src="${item.passageImageDataUrl}" alt="Reading passage image" style="max-width:100%;border-radius:var(--radius);border:1px solid var(--clr-border)">`
            : `<div class="passage-body">${item.passageHtml || '<p>No text provided.</p>'}</div>`}

          ${item.vocabSupport ? `
            <div class="card p-3 mt-4" style="background:#FFF">
              <span class="label-sm mb-1">Vocabulary Support / Glossary</span>
              <div class="text-xs text-muted">${escapeHtml(item.vocabSupport)}</div>
            </div>` : ''}
        </div>

        <!-- Right Pane: Questions -->
        <div class="split-right-pane">
          <div class="flex items-center justify-between mb-4">
            <h3 style="font-size:18px">${title} — Questions</h3>
            <span class="chip chip-neutral">${item.questions.length} questions</span>
          </div>

          <div id="qstack-${key}">
            ${ESFIMQuestions.renderQuestionStack(item.questions, answers, attempt.flaggedQuestions, key)}
          </div>

          ${renderNavFooter()}
        </div>
      </div>`;
  }

  /* Listening Section (Audio Widget + Questions) */
  function renderListeningSection(container, key, title, item, answers) {
    if (!item) {
      container.innerHTML = `<div class="p-8 text-center text-muted">No item configured for ${title}.</div>`;
      return;
    }

    const currentPlays = attempt.audioPlayCounts[key] || 0;
    const showListeningAudio = exam.audibleInstructionsEnabled !== false && exam.listeningAudioInstructionEnabled !== false && exam.listeningAudioInstructionDataUrl;

    container.innerHTML = `
      <div class="split-pane">
        <!-- Left Pane: Audio Widget -->
        <div class="split-left-pane">
          ${(exam.listeningGeneralInstructions || showListeningAudio) ? `
            <div class="audio-instruction-card p-3 mb-3 flex items-center justify-between gap-3 flex-wrap" role="region" aria-label="General listening instructions">
              <div class="flex items-center gap-2">
                <span style="font-size:20px" aria-hidden="true">🔊</span>
                <div>
                  <div class="fw-700 text-xs">General Listening Instructions</div>
                  <div class="text-xs text-muted">${escapeHtml(exam.listeningGeneralInstructions || 'Listen carefully and answer the questions.')}</div>
                </div>
              </div>
              ${showListeningAudio ? `
                <audio controls src="${exam.listeningAudioInstructionDataUrl}" aria-label="General listening instructions audio player" style="height:32px;max-width:220px"></audio>
              ` : ''}
            </div>
          ` : ''}

          <div class="label-sm text-primary">Listening Audio</div>
          ${ESFIMAudio.renderPlayerWidget(item, currentPlays, key)}
        </div>

        <!-- Right Pane: Questions -->
        <div class="split-right-pane">
          <div class="flex items-center justify-between mb-4">
            <h3 style="font-size:18px">${title} — Questions</h3>
            <span class="chip chip-neutral">${item.questions.length} questions</span>
          </div>

          <div id="qstack-${key}">
            ${ESFIMQuestions.renderQuestionStack(item.questions, answers, attempt.flaggedQuestions, key)}
          </div>

          ${renderNavFooter()}
        </div>
      </div>`;
  }

  /* Speaking Section */
  function renderSpeakingSection(container) {
    container.innerHTML = `
      <div class="single-col-pane" style="max-width:840px">
        <div id="speaking-container" class="w-full"></div>
        ${renderNavFooter()}
      </div>`;
    const showSpeakingAudio = exam.audibleInstructionsEnabled !== false && exam.speaking?.audioInstructionEnabled !== false && exam.speaking?.audioInstructionDataUrl;

    ESFIMSpeakingUI.init(
      'speaking-container',
      exam.speaking?.accentDefault || 'US',
      (speakingSummary) => {
        attempt.speakingResults = speakingSummary;
        ESFIMAttemptStore.saveAttempt(attempt);
        updateTabPillStatus(currentTabIdx);
      },
      exam.speaking?.prompts || null,
      showSpeakingAudio ? exam.speaking.audioInstructionDataUrl : null,
      exam.speaking?.instructions || null
    );
  }

  /* Navigation Footer Arrows */
  function renderNavFooter() {
    const prevTab = currentTabIdx > 0 ? SECTION_TABS[currentTabIdx - 1] : null;
    const nextTab = currentTabIdx < SECTION_TABS.length - 1 ? SECTION_TABS[currentTabIdx + 1] : null;

    return `
      <div class="flex justify-between items-center mt-6 pt-4" style="border-top:1px solid var(--clr-border)">
        ${prevTab ? `
          <button type="button" class="btn btn-ghost" onclick="switchSection(${currentTabIdx - 1})">
            ← ${prevTab.label}
          </button>` : '<div></div>'}

        ${nextTab ? `
          <button type="button" class="btn btn-primary" onclick="switchSection(${currentTabIdx + 1})">
            ${nextTab.label} →
          </button>` : `
          <button type="button" class="btn btn-danger" onclick="confirmSubmitExam()">
            Submit Answers ✓
          </button>`}
      </div>`;
  }

  /* -------------------------------------------------------
     Answer & Flag Handlers
  ------------------------------------------------------- */
  function handleQuestionAnswer(qId, answerVal) {
    const tab = SECTION_TABS[currentTabIdx];

    switch (tab.type) {
      case 'vocab': attempt.vocabAnswers[qId] = answerVal; break;
      case 'grammar': attempt.grammarAnswers[qId] = answerVal; break;
      case 'reading': attempt.readingAnswers[qId] = answerVal; break;
      case 'listening': attempt.listeningAnswers[qId] = answerVal; break;
    }

    ESFIMAttemptStore.saveAttempt(attempt);

    // Update card styling
    const card = document.getElementById(`qcard-${qId}`);
    if (card) {
      const isAnswered = answerVal !== undefined && answerVal !== null && answerVal !== '' &&
                         (!Array.isArray(answerVal) || answerVal.length > 0) &&
                         (typeof answerVal !== 'object' || Object.keys(answerVal).length > 0);
      card.classList.toggle('answered', isAnswered);
    }

    updateQuestionMapGrid();
    updateTabPillStatus(currentTabIdx);
  }

  function handleQuestionFlag(qId) {
    if (!attempt.flaggedQuestions) attempt.flaggedQuestions = {};

    // Toggle: if already flagged, remove; otherwise add
    const isFlagged = !attempt.flaggedQuestions[qId];
    if (isFlagged) {
      attempt.flaggedQuestions[qId] = true;
    } else {
      delete attempt.flaggedQuestions[qId];
    }
    ESFIMAttemptStore.saveAttempt(attempt);

    // Update flag button and card border in-place (no full re-render)
    ESFIMQuestions.updateFlagDisplay(qId, isFlagged);

    updateQuestionMapGrid();
    updateTabPillStatus(currentTabIdx);
  }

  function handleAudioPlayCount(audioKey, count) {
    if (!attempt.audioPlayCounts) attempt.audioPlayCounts = {};
    attempt.audioPlayCounts[audioKey] = count;
    ESFIMAttemptStore.saveAttempt(attempt);
  }

  /* -------------------------------------------------------
     Supervision Event Handlers
  ------------------------------------------------------- */
  function handleViolation(count, reason) {
    const overlay = document.getElementById('violation-overlay');
    const reasonEl = document.getElementById('violation-reason-text');
    if (reasonEl) reasonEl.textContent = `Security violation detected: ${reason}. This is warning ${count} of 2.`;
    if (overlay) overlay.classList.add('show');
    // Re-assert fullscreen immediately on first warning
    if (!ESFIMSupervision.isFullscreen()) {
      ESFIMSupervision.requestFullscreen();
    }
  }

  window.dismissViolationOverlay = function() {
    const overlay = document.getElementById('violation-overlay');
    if (overlay) overlay.classList.remove('show');
    if (!ESFIMSupervision.isFullscreen()) {
      ESFIMSupervision.requestFullscreen();
    }
  };

  function handleTermination(reason) {
    const vOverlay = document.getElementById('violation-overlay');
    if (vOverlay) vOverlay.classList.remove('show');
    const fsOverlay = document.getElementById('fs-enforce-overlay');
    if (fsOverlay) fsOverlay.remove();
    const submitModal = document.getElementById('submission-confirm-modal');
    if (submitModal) submitModal.classList.remove('show');

    submitExam(`Terminated by proctoring: ${reason}`);
  }

  /* -------------------------------------------------------
     Timer Management
  ------------------------------------------------------- */
  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (attempt.timeRemainingSeconds <= 0) {
        clearInterval(timerInterval);
        submitExam('Time expired');
        return;
      }
      attempt.timeRemainingSeconds--;
      ESFIMAttemptStore.saveAttempt(attempt);
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    const badge = document.getElementById('exam-timer-badge');
    if (!badge) return;
    const s = attempt.timeRemainingSeconds;
    badge.innerHTML = `⏱ ${ESFIMScoring.formatTime(s)}`;
    badge.classList.toggle('urgent', s <= 300); // Red pulse under 5m
  }

  /* -------------------------------------------------------
     Question Map Slide-in Panel
  ------------------------------------------------------- */
  window.toggleQuestionMap = function() {
    const panel = document.getElementById('qmap-panel');
    if (panel) panel.classList.toggle('open');
  };

  function updateQuestionMapGrid() {
    const grid = document.getElementById('qmap-grid-dots');
    if (!grid) return;

    let html = '';
    SECTION_TABS.forEach((tab, sIdx) => {
      let questions = [];
      let answers = {};

      if (tab.type === 'vocab') {
        questions = attempt.vocabQuestions || [];
        answers = attempt.vocabAnswers || {};
      } else if (tab.type === 'grammar') {
        questions = attempt.grammarQuestions || [];
        answers = attempt.grammarAnswers || {};
      } else if (tab.type === 'reading') {
        const item = attempt.selectedReadingItems?.[tab.bankIdx];
        questions = item ? item.questions : [];
        answers = attempt.readingAnswers || {};
      } else if (tab.type === 'listening') {
        const item = attempt.selectedListeningItems?.[tab.bankIdx];
        questions = item ? item.questions : [];
        answers = attempt.listeningAnswers || {};
      } else if (tab.type === 'speaking') {
        questions = [{ id: 'sp_tab', text: 'Speaking' }];
      }

      if (questions.length > 0) {
        html += `
          <div class="mb-3">
            <div class="text-xs fw-600 text-muted mb-2 flex items-center justify-between">
              <span>${tab.label}</span>
              <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px" onclick="switchSection(${sIdx})">Go →</button>
            </div>
            <div class="grid-4" style="gap:6px">
              ${questions.map((q, qIdx) => {
                const val = answers[q.id];
                const isAnswered = tab.type === 'speaking' ? !!attempt.speakingResults :
                                   (val !== undefined && val !== null && val !== '' &&
                                   (!Array.isArray(val) || val.length > 0) &&
                                   (typeof val !== 'object' || Object.keys(val).length > 0));
                const isFlagged = !!attempt.flaggedQuestions?.[q.id];
                let cls = 'qmap-dot';
                if (isFlagged) cls += ' flagged';
                else if (isAnswered) cls += ' answered';
                if (sIdx === currentTabIdx) cls += ' current';

                return `
                  <button type="button" class="${cls}" onclick="navigateToQuestion(${sIdx}, '${q.id}')" title="Question ${qIdx + 1}">
                    ${qIdx + 1}
                  </button>`;
              }).join('')}
            </div>
          </div>`;
      }
    });

    grid.innerHTML = html;
  }

  function updateTabPillStatus(tabIdx) {
    const pill = document.getElementById(`tab-btn-${tabIdx}`);
    if (!pill) return;
    const tab = SECTION_TABS[tabIdx];

    let questions = [];
    let answers = {};
    if (tab.type === 'vocab') {
      questions = attempt.vocabQuestions || [];
      answers = attempt.vocabAnswers || {};
    } else if (tab.type === 'grammar') {
      questions = attempt.grammarQuestions || [];
      answers = attempt.grammarAnswers || {};
    } else if (tab.type === 'reading') {
      const item = attempt.selectedReadingItems?.[tab.bankIdx];
      questions = item ? item.questions : [];
      answers = attempt.readingAnswers || {};
    } else if (tab.type === 'listening') {
      const item = attempt.selectedListeningItems?.[tab.bankIdx];
      questions = item ? item.questions : [];
      answers = attempt.listeningAnswers || {};
    } else if (tab.type === 'speaking') {
      pill.classList.toggle('completed', !!attempt.speakingResults);
      return;
    }

    const allAnswered = questions.length > 0 && questions.every(q => {
      const v = answers[q.id];
      return v !== undefined && v !== null && v !== '' &&
             (!Array.isArray(v) || v.length > 0) &&
             (typeof v !== 'object' || Object.keys(v).length > 0);
    });

    const hasFlag = questions.some(q => attempt.flaggedQuestions?.[q.id]);

    pill.classList.toggle('completed', allAnswered);
    pill.classList.toggle('has-flag', hasFlag);
  }

  window.navigateToQuestion = function(tabIdx, qId) {
    toggleQuestionMap();
    switchSection(tabIdx);
    setTimeout(() => {
      const el = document.getElementById(`qcard-${qId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  window.scrollToQuestion = window.navigateToQuestion;

  /* -------------------------------------------------------
     Submission Logic
  ------------------------------------------------------- */
  window.confirmSubmitExam = function() {
    // Count unanswered questions
    let totalUnanswered = 0;
    const checkAns = (qArr, ansObj) => {
      (qArr || []).forEach(q => {
        const val = ansObj?.[q.id];
        const isAnswered = val !== undefined && val !== null && val !== '' &&
                           (!Array.isArray(val) || val.length > 0) &&
                           (typeof val !== 'object' || Object.keys(val).length > 0);
        if (!isAnswered) totalUnanswered++;
      });
    };

    checkAns(attempt.vocabQuestions, attempt.vocabAnswers);
    checkAns(attempt.grammarQuestions, attempt.grammarAnswers);
    (attempt.selectedReadingItems || []).forEach(item => { if (item) checkAns(item.questions, attempt.readingAnswers); });
    (attempt.selectedListeningItems || []).forEach(item => { if (item) checkAns(item.questions, attempt.listeningAnswers); });

    const modal = document.getElementById('submission-confirm-modal');
    const alertWarn = document.getElementById('modal-unanswered-alert');
    const alertOk = document.getElementById('modal-answered-alert');
    const countEl = document.getElementById('modal-unanswered-count');

    if (modal) {
      if (totalUnanswered > 0) {
        if (countEl) countEl.textContent = `You have ${totalUnanswered} unanswered question(s).`;
        if (alertWarn) alertWarn.style.display = 'flex';
        if (alertOk) alertOk.style.display = 'none';
      } else {
        if (alertWarn) alertWarn.style.display = 'none';
        if (alertOk) alertOk.style.display = 'flex';
      }
      modal.classList.add('show');
    } else {
      // Fallback
      if (confirm(totalUnanswered > 0 ? `You have ${totalUnanswered} unanswered question(s).\n\nDo you want to submit anyway?` : 'Are you ready to submit your answers?')) {
        submitExam('User submitted');
      }
    }
  };

  window.closeSubmitModal = function() {
    const modal = document.getElementById('submission-confirm-modal');
    if (modal) modal.classList.remove('show');
  };

  window.proceedSubmitExam = async function() {
    closeSubmitModal();
    await submitExam('User submitted');
  };

  async function submitExam(reason = 'Completed') {
    if (timerInterval) clearInterval(timerInterval);

    attempt.status = 'submitted';
    attempt.submittedAt = new Date().toISOString();
    attempt.terminationReason = reason;

    // Collect all reading and listening questions arrays for scoring computation
    attempt.readingQuestions = (attempt.selectedReadingItems || []).flatMap(it => it ? it.questions : []);
    attempt.listeningQuestions = (attempt.selectedListeningItems || []).flatMap(it => it ? it.questions : []);

    // Compute scores using AnswerService (with ESFIMScoring fallback)
    if (typeof ESFIMAnswerService !== 'undefined') {
      if (exam.answerSource === 'external' && Object.keys(ESFIMAnswerService.getAllAnswers()).length === 0) {
        console.warn('[Exam] Answer cache empty on submit. Attempting emergency re-fetch...');
        try {
          await ESFIMAnswerService.initialize('external', exam.externalAnswerConfig || { apiEndpoint: exam.webhookUrl }, exam);
        } catch (e) {
          console.error('[Exam] Emergency answer re-fetch failed:', e);
        }
      }
      attempt.scores = ESFIMAnswerService.computeAllScores(attempt);
    } else {
      attempt.scores = ESFIMScoring.computeAllScores(attempt);
    }
    ESFIMAttemptStore.saveAttempt(attempt);

    // NOTE: Webhook dispatch is handled exclusively inside ESFIMResults.render()
    // via the !attempt.webhookSent guard. Do NOT call dispatchWebhook here —
    // doing so fires the request before render() runs, and then render() fires
    // it again (webhookSent is still false at that point) = duplicate sheet rows.

    // Render results view BEFORE cleanup so the fullscreen-change handler
    // triggered by exitFullscreen does not show the 'requires fullscreen' overlay
    const appEl = document.getElementById('esfim-exam-app');
    if (appEl) {
      // Allow the results container to scroll freely
      appEl.style.overflow = 'auto';
      appEl.innerHTML = `<div id="results-view" style="padding:24px;max-width:960px;margin:0 auto"></div>`;
      ESFIMResults.render(exam, attempt, 'results-view');
    }

    // Cleanup supervision AFTER rendering results (prevents fullscreen overlay from re-appearing)
    ESFIMSupervision.cleanup();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
