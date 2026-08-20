/**
 * ESFIM Speaking Assessment — Integrated UI Renderer
 * Adapted from reference Speaking Assessment single-file interface.
 */
const ESFIMSpeakingUI = (() => {

  let _state = {
    accent: 'US',
    partIndex: 0,
    engine: null,
    current: null,
    phase: 'idle', // idle | showing | ready | listening | evaluated
    lastFeedback: null,
    allPartResults: [],
    memoTimerId: null,
    speechHandler: null,
    micAvailable: false,
  };

  let _onSpeakingCompleteCb = null;

  /**
   * Initialize speaking section inside the exam shell
   */
  function init(containerId, accentDefault = 'US', onComplete, customPrompts = null, audioInstructionDataUrl = null, instructions = null) {
    _state.accent = accentDefault;
    _state.partIndex = 0;
    _state.allPartResults = [];
    _state.customPrompts = customPrompts;
    _state.audioInstructionDataUrl = audioInstructionDataUrl;
    _state.instructions = instructions;
    _state.engine = new ESFIMSpeakingAdaptive.AdaptiveEngine('part1', customPrompts);
    _onSpeakingCompleteCb = onComplete;

    renderCalibrationScreen(containerId);
  }

  /**
   * Screen 1: Mic Calibration
   */
  function renderCalibrationScreen(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const supported = SpeechHandler.isSupported();

    container.innerHTML = `
      <div class="speaking-console">
        <div class="card p-6">
          <div class="eyebrow mb-2">MICROPHONE CHECK & INSTRUCTIONS</div>
          <h2 style="font-size:24px;margin-bottom:8px">Speaking Assessment</h2>
          <p class="text-muted text-sm mb-4">
            ${_state.instructions ? escapeHtml(_state.instructions) : 'Speak the following test phrases to verify your microphone is working properly before starting.'}
          </p>

          ${_state.audioInstructionDataUrl ? `
            <div class="audio-instruction-card p-3 mb-4 flex items-center justify-between gap-3 flex-wrap" role="region" aria-label="Spoken instructions for oral evaluation">
              <div class="flex items-center gap-2">
                <span style="font-size:20px" aria-hidden="true">🔊</span>
                <div>
                  <div class="fw-700 text-xs">Spoken Instructions</div>
                  <div class="text-xs text-muted">Listen carefully to the oral test instructions</div>
                </div>
              </div>
              <audio controls src="${_state.audioInstructionDataUrl}" aria-label="Spoken instructions audio player" style="height:32px;max-width:240px"></audio>
            </div>
          ` : ''}

          ${!supported ? `
            <div class="alert alert-error mb-4" role="alert" style="background:rgba(239,68,68,0.1);border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px">
              <span class="alert-icon" style="font-size:20px;margin-right:8px">⚠️</span>
              <div>
                <strong>Speech recognition is not supported in this browser.</strong><br>
                Please use <strong>Google Chrome or Microsoft Edge</strong> on a desktop or laptop computer to complete the Speaking assessment.
              </div>
            </div>` : ''}

          <div class="grid-2 gap-4 mb-4">
            <div class="card p-4 text-center">
              <div class="label-sm mb-1">Phrase 1</div>
              <div style="font-size:18px;font-weight:600;margin:6px 0">"hello world"</div>
              <button type="button" class="btn btn-primary btn-sm mt-2" id="sp-cal-btn1" aria-label="Test Phrase 1 recording" ${!supported ? 'disabled' : ''}>
                🎤 Test Phrase 1
              </button>
              <div class="text-xs text-muted mt-2" id="sp-cal-status1" aria-live="polite">—</div>
            </div>

            <div class="card p-4 text-center">
              <div class="label-sm mb-1">Phrase 2</div>
              <div style="font-size:18px;font-weight:600;margin:6px 0">"the weather is nice today"</div>
              <button type="button" class="btn btn-primary btn-sm mt-2" id="sp-cal-btn2" aria-label="Test Phrase 2 recording" ${!supported ? 'disabled' : ''}>
                🎤 Test Phrase 2
              </button>
              <div class="text-xs text-muted mt-2" id="sp-cal-status2" aria-live="polite">—</div>
            </div>
          </div>

          <div class="flex gap-3">
            <button type="button" class="btn ${supported ? 'btn-primary' : 'btn-secondary'} btn-lg flex-1" id="sp-start-part-btn"
                    aria-label="Start Speaking Assessment" ${!supported ? 'disabled' : ''}>
              ${supported ? 'Start Speaking Assessment →' : 'Speech Recognition Not Supported – Please use Chrome/Edge'}
            </button>
          </div>
        </div>
      </div>`;

    document.getElementById('sp-cal-btn1')?.addEventListener('click', () => runCal('hello world', 'sp-cal-btn1', 'sp-cal-status1'));
    document.getElementById('sp-cal-btn2')?.addEventListener('click', () => runCal('the weather is nice today', 'sp-cal-btn2', 'sp-cal-status2'));
    document.getElementById('sp-start-part-btn')?.addEventListener('click', () => {
      if (!SpeechHandler.isSupported()) {
        alert('Speech recognition is not available in this browser. Please open the exam in Google Chrome or Microsoft Edge.');
        return;
      }
      startPartIntro(containerId);
    });
  }

  function runCal(text, btnId, statusId) {
    const btn = document.getElementById(btnId);
    const status = document.getElementById(statusId);
    if (!btn || !status) return;

    btn.disabled = true;
    status.textContent = '⏳ Listening... speak now';
    status.style.color = 'var(--clr-warning)';

    // Pause fullscreen enforcement before triggering the mic-permission dialog.
    // Chrome/Edge exit fullscreen when showing the permission prompt on first use.
    if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.pauseForMicPermission) {
      ESFIMSupervision.pauseForMicPermission(10000);
    }

    const handler = new SpeechHandler(_state.accent);
    handler.onResult = (alts) => {
      btn.disabled = false;
      if (alts && alts.length > 0) {
        status.textContent = `✅ Recognized: "${alts[0].transcript}"`;
        status.style.color = 'var(--clr-success)';
      } else {
        status.textContent = '❌ No response';
        status.style.color = 'var(--clr-error)';
      }
      // Resume enforcement once browser has granted/denied the permission
      if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
        ESFIMSupervision.resumeAfterMicPermission();
      }
    };
    handler.onError = (code, msg) => {
      btn.disabled = false;
      status.textContent = '❌ Error: ' + msg;
      status.style.color = 'var(--clr-error)';
      if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
        ESFIMSupervision.resumeAfterMicPermission();
      }
    };
    handler.onEnd = () => {
      if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
        ESFIMSupervision.resumeAfterMicPermission();
      }
    };
    handler.start();
  }

  /**
   * Screen 2: Part Intro
   */
  function startPartIntro(containerId) {
    const pMeta = ESFIMSpeakingAdaptive.PART_META[_state.partIndex];
    _state.engine = new ESFIMSpeakingAdaptive.AdaptiveEngine(pMeta.key, _state.customPrompts);

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="speaking-console">
        <div class="card p-6">
          <div class="eyebrow mb-1">Part ${_state.partIndex + 1} of 4</div>
          <h2 style="font-size:26px;margin-bottom:6px">${pMeta.title}</h2>
          <p class="text-muted text-sm mb-4">${pMeta.desc}</p>

          <div class="alert alert-info mb-6">
            <span class="alert-icon">💡</span>
            <div>Starts at level A1. Two consecutive correct answers advance your level. The test automatically adapts to your performance.</div>
          </div>

          <button type="button" class="btn btn-primary btn-lg btn-block" id="sp-go-exercise-btn">
            Start Part ${_state.partIndex + 1} →
          </button>
        </div>
      </div>`;

    document.getElementById('sp-go-exercise-btn')?.addEventListener('click', () => {
      nextExerciseItem(containerId);
    });
  }

  /**
   * Screen 3: Exercise Item Stage
   */
  function nextExerciseItem(containerId) {
    if (_state.engine.done) {
      finishPart(containerId);
      return;
    }

    const item = _state.engine.pickQuestion();
    _state.current = item;
    const pMeta = ESFIMSpeakingAdaptive.PART_META[_state.partIndex];

    _state.phase = pMeta.memo ? 'showing' : 'ready';
    _state.lastFeedback = null;

    renderExerciseStage(containerId);

    if (pMeta.memo) {
      startMemoTimer(containerId, pMeta.unit === 'sentence' ? 6500 : 3200);
    }
  }

  function renderExerciseStage(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pMeta = ESFIMSpeakingAdaptive.PART_META[_state.partIndex];
    const showingText = _state.phase === 'showing';
    const hiddenText = pMeta.memo && _state.phase !== 'showing' && _state.phase !== 'idle';
    const isListening = _state.phase === 'listening';

    container.innerHTML = `
      <div class="speaking-console">
        <!-- Header dial -->
        <div class="flex items-center justify-between mb-4">
          <span class="label-sm">${pMeta.title}</span>
          <span class="chip chip-primary font-mono">Current level: ${_state.engine.currentLevel}</span>
        </div>

        <div class="speaking-stage-card">
          <div class="stage-tag">
            ${pMeta.unit} · ${showingText ? 'memorize the phrase' : (hiddenText ? 'recall and speak' : 'read aloud')}
          </div>

          <div class="speaking-target-text ${hiddenText ? 'target-text hidden-text' : ''}">
            ${hiddenText ? '— hidden text — press the microphone and speak —' : escapeHtml(_state.current.text)}
          </div>

          ${showingText ? `
            <div class="memo-timer mt-4">
              <div class="memo-timer-fill" id="sp-memo-fill"></div>
            </div>` : ''}

          <div class="controls-row mt-6 flex items-center justify-center gap-3">
            <button type="button" class="speaking-mic-btn ${isListening ? 'listening' : ''}" id="sp-mic-btn"
                    aria-label="Record speech response"
                    title="Record response" ${isListening ? 'disabled' : ''}>
              🎤
            </button>
            <button type="button" class="btn btn-ghost btn-sm" id="sp-skip-item-btn"
                    style="border:1.5px solid var(--clr-border,#cbd5e1);border-radius:20px;padding:6px 16px;font-size:13px;color:var(--clr-text-muted,#64748b)"
                    title="Skip this exercise if your microphone is not responding or you wish to move to the next item">
              ⏭ Skip Question
            </button>
          </div>

          <div class="stage-caption mt-3" aria-live="polite">
            ${isListening ? 'Listening... speak clearly' : (showingText ? 'Memorize the phrase...' : 'Press the microphone to respond')}
          </div>

          ${_state.lastFeedback ? renderFeedbackCard(_state.lastFeedback) : ''}
        </div>

        ${_state.lastFeedback ? `
          <div class="flex justify-center mt-4">
            <button type="button" class="btn btn-primary btn-lg" id="sp-next-item-btn">
              Continue →
            </button>
          </div>` : ''}
      </div>`;

    document.getElementById('sp-mic-btn')?.addEventListener('click', () => onMicClick(containerId));
    document.getElementById('sp-skip-item-btn')?.addEventListener('click', () => skipExerciseItem(containerId));
    document.getElementById('sp-next-item-btn')?.addEventListener('click', () => nextExerciseItem(containerId));
  }

  function skipExerciseItem(containerId) {
    if (_state.activeHandler) {
      try { _state.activeHandler.stop(); } catch (_) {}
      _state.activeHandler = null;
    }
    if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
      ESFIMSupervision.resumeAfterMicPermission();
    }
    const result = {
      heard: '(skipped by candidate)',
      score: 0,
      state: 'scored',
      correct: false,
      wordScore: 0,
      phoneticScore: 0,
      completeness: 0,
      confidence: null,
      reason: 'Skipped by candidate'
    };
    _state.engine.answer(false, { target: _state.current?.text || '', ...result });
    _syncLiveSpeakingResults();
    nextExerciseItem(containerId);
  }

  function startMemoTimer(containerId, ms) {
    const fill = document.getElementById('sp-memo-fill');
    if (fill) {
      fill.style.transition = 'none';
      fill.style.width = '100%';
      requestAnimationFrame(() => {
        fill.style.transition = `width ${ms}ms linear`;
        fill.style.width = '0%';
      });
    }
    clearTimeout(_state.memoTimerId);
    _state.memoTimerId = setTimeout(() => {
      _state.phase = 'ready';
      renderExerciseStage(containerId);
    }, ms);
  }

  function onMicClick(containerId) {
    if (_state.phase === 'listening') return;

    _state.phase = 'listening';
    renderExerciseStage(containerId);

    // Pause fullscreen check before mic access — browser exits fullscreen during permission prompt
    if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.pauseForMicPermission) {
      ESFIMSupervision.pauseForMicPermission(12000);
    }

    const pMeta = ESFIMSpeakingAdaptive.PART_META[_state.partIndex];
    const handler = new SpeechHandler(_state.accent);
    _state.activeHandler = handler;

    handler.onResult = (alternatives) => {
      _state.activeHandler = null;
      if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
        ESFIMSupervision.resumeAfterMicPermission();
      }
      const result = ESFIMSpeakingScoring.scoreResponse(
        _state.current.text,
        alternatives,
        _state.accent,
        pMeta
      );
      _state.engine.answer(result.correct, {
        target: _state.current.text,
        ...result
      });
      _state.lastFeedback = result;
      _state.phase = 'evaluated';
      _syncLiveSpeakingResults();
      renderExerciseStage(containerId);
    };

    handler.onError = (code, msg) => {
      _state.activeHandler = null;
      if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
        ESFIMSupervision.resumeAfterMicPermission();
      }
      const result = {
        heard: `(error: ${msg})`,
        score: 0,
        state: 'retry',
        correct: false,
        wordScore: 0,
        phoneticScore: 0,
        completeness: 0,
        confidence: null,
      };
      _state.engine.answer(false, { target: _state.current.text, ...result });
      _state.lastFeedback = result;
      _state.phase = 'evaluated';
      _syncLiveSpeakingResults();
      renderExerciseStage(containerId);
    };

    handler.onEnd = () => {
      _state.activeHandler = null;
      if (typeof ESFIMSupervision !== 'undefined' && ESFIMSupervision.resumeAfterMicPermission) {
        ESFIMSupervision.resumeAfterMicPermission();
      }
    };

    handler.start();
  }

  function renderFeedbackCard(fb) {
    const isOk = fb.correct;
    const isUncertain = fb.state === 'uncertain';
    const cls = isOk ? 'ok' : (isUncertain ? 'warn' : 'err');

    return `
      <div class="feedback ${cls} mt-4">
        <strong>${isOk ? '✓ Recognized correctly' : (isUncertain ? '⚠️ Uncertain recognition' : '✗ Does not match')}</strong>
        <span class="heard">Heard: "${escapeHtml(fb.heard)}"</span>
        <span class="score">Phonetic similarity: ${Math.round((fb.score || 0) * 100)}%</span>
      </div>`;
  }

  function _syncLiveSpeakingResults() {
    const currentPartRes = _state.engine ? _state.engine.getResults() : null;
    const allParts = [..._state.allPartResults];
    if (currentPartRes && allParts.length === _state.partIndex) {
      allParts.push(currentPartRes);
    }
    const partLevels = ['A0', 'A0', 'A0', 'A0'];
    allParts.forEach((p, idx) => {
      if (idx < 4) partLevels[idx] = p.level || 'A0';
    });
    const overallLvl = computeOverallSpeakingLevel(allParts);
    const summary = {
      overallLevel: overallLvl,
      partLevels: partLevels,
      partResults: allParts,
    };
    if (_onSpeakingCompleteCb) _onSpeakingCompleteCb(summary);
    if (window.__CURRENT_ATTEMPT__) {
      window.__CURRENT_ATTEMPT__.speakingResults = summary;
    }
  }

  function finishPart(containerId) {
    const res = _state.engine.getResults();
    _state.allPartResults.push(res);
    _syncLiveSpeakingResults();

    if (_state.partIndex < 3) {
      _state.partIndex++;
      startPartIntro(containerId);
    } else {
      // Complete speaking section
      const overallLvl = computeOverallSpeakingLevel(_state.allPartResults);
      const summary = {
        overallLevel: overallLvl,
        partLevels: _state.allPartResults.map(r => r.level || 'A0'),
        partResults: _state.allPartResults,
      };
      if (_onSpeakingCompleteCb) _onSpeakingCompleteCb(summary);

      // Render speaking completion stage with prominent submission button
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = `
          <div class="speaking-console">
            <div class="speaking-stage-card text-center" style="padding:var(--sp-8)">
              <div style="font-size:48px;margin-bottom:12px">🎉</div>
              <h2 style="font-size:22px;font-weight:800;margin-bottom:8px">Speaking Section Completed!</h2>
              <p class="text-sm text-muted mb-4">You have completed all 4 parts of the adaptive speaking assessment.</p>
              <div class="mb-6">
                <span class="label-sm" style="color:rgba(255,255,255,0.7)">ESTIMATED SPEAKING LEVEL</span>
                <div class="mt-2">
                  <span class="chip chip-primary" style="font-size:1.2em;padding:6px 18px">${overallLvl}</span>
                </div>
              </div>
              <div class="flex justify-center gap-3 flex-wrap">
                <button type="button" class="btn btn-danger btn-lg" onclick="confirmSubmitExam()">
                  Submit Exam ✓
                </button>
              </div>
            </div>
          </div>`;
      }
    }
  }

  function computeOverallSpeakingLevel(partResults) {
    if (!partResults || partResults.length === 0) return 'A0';
    const levels = ['A0', 'A1', 'A2', 'B1', 'B2'];
    let totalPoints = 0;
    let totalCorrectCount = 0;

    partResults.forEach(r => {
      const rawLvl = (r.rawLevel || r.level || 'A0').replace('+', '');
      const idx = levels.indexOf(rawLvl);
      const lvlVal = idx > 0 ? idx : 0;
      totalPoints += lvlVal + (r.plus ? 0.5 : 0);
      if (Array.isArray(r.log)) {
        totalCorrectCount += r.log.filter(e => e.score && e.score >= 0.5).length;
      }
    });

    // If 0 items were answered correctly across all attempts, score is strictly A0
    if (totalCorrectCount === 0) {
      return 'A0';
    }

    const avg = totalPoints / 4;
    if (avg < 0.4) return 'A0';
    if (avg < 1.4) return avg >= 1.0 ? 'A1' : 'A1';
    if (avg < 2.4) return avg >= 2.0 ? 'A2' : 'A2';
    if (avg < 3.4) return avg >= 3.0 ? 'B1' : 'B1';
    return 'B2';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    init,
    renderCalibrationScreen,
  };
})();
