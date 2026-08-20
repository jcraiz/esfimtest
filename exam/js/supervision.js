/**
 * ESFIM Exam Delivery — Anti-Cheating & Supervision Module (v6)
 * Enforces fullscreen mode, tab blur detection, camera verification, and random captures.
 * Provides robust webhook photo delivery with retries, CORS handling, and failure resilience.
 */
const ESFIMSupervision = (() => {

  let _exam = null;
  let _attempt = null;
  let _onViolationCb = null;
  let _onTerminateCb = null;
  let _stream = null;
  let _warningsCount = 0;
  let _lastViolationTime = 0;
  let _cameraCheckInterval = null;
  let _randomPhotoTimers = [];
  let _isActive = false;
  // When true, fullscreen-exit events and blur events are ignored
  // (used while browser shows the mic-permission dialog)
  let _suppressFullscreenCheck = false;
  let _suppressResumeTimer = null;

  /**
   * Helper: Retrieve configured webhook URL from _exam, config, or global object
   */
  function getWebhookUrl() {
    if (_exam && typeof _exam.webhookUrl === 'string' && _exam.webhookUrl.trim()) {
      return _exam.webhookUrl.trim();
    }
    if (_exam && _exam.config && typeof _exam.config.webhookUrl === 'string' && _exam.config.webhookUrl.trim()) {
      return _exam.config.webhookUrl.trim();
    }
    if (typeof window !== 'undefined' && window.__ESFIM_EXAM__) {
      if (typeof window.__ESFIM_EXAM__.webhookUrl === 'string' && window.__ESFIM_EXAM__.webhookUrl.trim()) {
        return window.__ESFIM_EXAM__.webhookUrl.trim();
      }
      if (window.__ESFIM_EXAM__.config && typeof window.__ESFIM_EXAM__.config.webhookUrl === 'string' && window.__ESFIM_EXAM__.config.webhookUrl.trim()) {
        return window.__ESFIM_EXAM__.config.webhookUrl.trim();
      }
    }
    return null;
  }

  /**
   * Initialize supervision for an attempt
   */
  function init(exam, attempt, onViolation, onTerminate) {
    _exam = exam;
    _attempt = attempt;
    _onViolationCb = onViolation;
    _onTerminateCb = onTerminate;
    _warningsCount = attempt.violations ? attempt.violations.length : 0;
    _isActive = true;

    // -------------------------------------------------------
    // RIGHT-CLICK SUPPRESSION (belt-and-suspenders over body attr)
    // -------------------------------------------------------
    document.addEventListener('contextmenu', _handleContextMenu, true);

    // -------------------------------------------------------
    // PAGE-LEAVE WARNING (fires when user tries to close tab/navigate away)
    // -------------------------------------------------------
    window.addEventListener('beforeunload', _handleBeforeUnload);

    // -------------------------------------------------------
    // FULLSCREEN MONITORING — applies to ALL exams always
    // -------------------------------------------------------
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Initial fullscreen check: if not in fullscreen, prompt immediately
    if (!isFullscreen()) {
      showFullscreenOverlay();
    }

    // -------------------------------------------------------
    // TAB / WINDOW FOCUS MONITORING — applies to ALL exams always
    // -------------------------------------------------------
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    // -------------------------------------------------------
    // CAMERA SUPERVISION (only if antiCheatingEnabled)
    // -------------------------------------------------------
    if (!exam.antiCheatingEnabled) return;

    // Clear previous photo timers
    _randomPhotoTimers.forEach(t => clearTimeout(t));
    _randomPhotoTimers = [];

    // Schedule random captures based on exam.cameraSnapshotCount (default: 2)
    const count = exam.cameraSnapshotCount !== undefined ? exam.cameraSnapshotCount : 2;
    const totalMs = (exam.timerMinutes || 90) * 60 * 1000;
    const intervalMs = totalMs / (count + 1);

    for (let i = 1; i <= count; i++) {
      // Add random jitter (±2 minutes) so exact capture times aren't predictable
      const jitterMs = (Math.random() * 4 - 2) * 60 * 1000;
      const targetTimeMs = Math.max(30 * 1000, Math.min(totalMs - 30 * 1000, (intervalMs * i) + jitterMs));

      const timerId = setTimeout(() => {
        capturePhoto(`random_${i}`);
      }, targetTimeMs);

      _randomPhotoTimers.push(timerId);
    }
  }

  /**
   * Check if currently in fullscreen mode
   */
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  /**
   * Request fullscreen mode
   */
  function requestFullscreen() {
    const elem = document.documentElement;
    try {
      if (!isFullscreen()) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(err => console.warn('Fullscreen request rejected:', err));
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      }
    } catch (e) {
      console.warn('Fullscreen request denied:', e);
    }
  }

  /**
   * Exit fullscreen mode
   */
  function exitFullscreen() {
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    } catch (e) {}
  }

  /**
   * Toggle fullscreen mode
   */
  function toggleFullscreen() {
    if (isFullscreen()) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  }

  /**
   * Request camera authorization and start stream preview
   */
  async function startCamera() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      attachVideoStream();

      // Monitor camera stream every 5s
      if (_cameraCheckInterval) clearInterval(_cameraCheckInterval);
      _cameraCheckInterval = setInterval(checkCameraStream, 5000);
      return true;
    } catch (err) {
      console.warn('Camera access error:', err);
      return false;
    }
  }

  /**
   * Attach active camera stream to video preview DOM element
   */
  function attachVideoStream() {
    if (!_stream) return;
    const video = document.getElementById('camera-video');
    if (video) {
      video.srcObject = _stream;
      video.play().catch(e => console.warn('Camera video play error:', e));
    }
  }

  /**
   * Check if camera stream is still active
   */
  function checkCameraStream() {
    if (!_exam || !_exam.antiCheatingEnabled) return;
    if (!_stream || !_stream.active || _stream.getVideoTracks().length === 0 || _stream.getVideoTracks()[0].readyState !== 'live') {
      triggerViolation('Camera stream interrupted or camera turned off.');
    }
  }

  /**
   * Upload snapshot payload to configured webhook (Google Apps Script / Power Automate)
   * Uses mode: 'no-cors' with text/plain payload for immediate transmission without browser CORS restrictions or redirect blocks.
   */
  async function uploadSnapshotToWebhook(url, payload) {
    const jsonBody = JSON.stringify(payload);
    const sizeKB = (jsonBody.length / 1024).toFixed(1);
    console.log(`[ESFIM Supervision] Uploading snapshot [${payload.type}] (${payload.fileName}, ${sizeKB} KB) to webhook: ${url}`);

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: jsonBody,
      });
      console.log(`[ESFIM Supervision] Photo snapshot [${payload.type}] sent successfully to webhook.`);
      return { success: true, mode: 'no-cors' };
    } catch (err) {
      console.warn(`[ESFIM Supervision] Snapshot delivery error for [${payload.type}]:`, err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Capture photo snapshot from camera
   */
  async function capturePhoto(type = 'initial') {
    if (!_stream) {
      console.warn('[ESFIM Supervision] No camera stream available for capturePhoto');
      return null;
    }

    try {
      attachVideoStream();

      let dataUrl = null;
      const track = _stream.getVideoTracks()[0];

      // Strategy 1: ImageCapture API (Chromium / Edge native, grabs raw camera frame)
      if (typeof ImageCapture !== 'undefined' && track && track.readyState === 'live') {
        try {
          const imageCapture = new ImageCapture(track);
          // Allow up to 3 attempts with small pause for camera sensor readiness
          for (let attempt = 0; attempt < 3 && !dataUrl; attempt++) {
            try {
              const bitmap = await imageCapture.grabFrame();
              if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0);
                dataUrl = canvas.toDataURL('image/jpeg', 0.85);
              }
            } catch (grabErr) {
              await new Promise(r => setTimeout(r, 150));
            }
          }
        } catch (icErr) {
          console.warn('[ESFIM Supervision] ImageCapture init failed:', icErr);
        }
      }

      // Strategy 2: HTMLVideoElement rendering fallback
      if (!dataUrl) {
        let video = document.getElementById('camera-video');
        let tempVideo = null;

        if (!video) {
          tempVideo = document.createElement('video');
          tempVideo.srcObject = _stream;
          tempVideo.muted = true;
          tempVideo.playsInline = true;
          await tempVideo.play().catch(() => {});
          video = tempVideo;
        } else {
          if (video.srcObject !== _stream) {
            video.srcObject = _stream;
          }
          if (video.paused) {
            await video.play().catch(() => {});
          }
        }

        // Wait up to 2000ms for video frame dimensions and readyState to be ready
        let retries = 20;
        while ((video.readyState < 2 || !video.videoWidth || video.videoWidth === 0) && retries > 0) {
          await new Promise(r => setTimeout(r, 100));
          retries--;
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth > 0 ? video.videoWidth : 640;
        canvas.height = video.videoHeight > 0 ? video.videoHeight : 480;
        const ctx = canvas.getContext('2d');
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        } catch (drawErr) {
          console.warn('[ESFIM Supervision] Video drawImage failed:', drawErr);
        }

        if (tempVideo) {
          tempVideo.pause();
          tempVideo.srcObject = null;
        }
      }

      if (!dataUrl) {
        console.warn('[ESFIM Supervision] Could not generate dataUrl from camera');
        return null;
      }

      const timestamp = Date.now();
      const isoTime = new Date().toISOString();
      const studentId = _attempt ? (_attempt.studentId || 'student') : 'student';
      const studentName = _attempt ? (_attempt.studentName || 'Unknown') : 'Unknown';
      const cleanName = studentName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${studentId}_${cleanName}_${type}_${timestamp}.jpg`;

      // 1. ALWAYS store snapshot in local attempt record first
      const imageRecord = {
        type,
        dataUrl,
        fileName,
        capturedAt: isoTime,
        uploadStatus: 'pending'
      };

      if (_attempt) {
        if (!_attempt.cameraImages) _attempt.cameraImages = [];
        _attempt.cameraImages.push(imageRecord);
        ESFIMAttemptStore.saveAttempt(_attempt);
      }

      // 2. Dispatch to Webhook (Google Drive / OneDrive / Power Automate) if configured
      const webhookUrl = getWebhookUrl();
      if (webhookUrl) {
        const payload = {
          action: 'save_image',
          imageData: dataUrl,
          fileName: fileName,
          studentId: studentId,
          studentName: studentName,
          type: type,
          examTitle: (_exam && _exam.title) || (window.__ESFIM_EXAM__ && window.__ESFIM_EXAM__.title) || 'ESFIM Exam',
          timestamp: timestamp,
          isoTime: isoTime,
        };

        // Execute upload asynchronously without blocking exam progression
        uploadSnapshotToWebhook(webhookUrl, payload)
          .then(res => {
            if (res.success) {
              imageRecord.uploadStatus = 'success';
              imageRecord.uploadedAt = new Date().toISOString();
            } else {
              imageRecord.uploadStatus = 'failed';
              imageRecord.uploadError = res.error || 'Upload failed';
            }
            if (_attempt) ESFIMAttemptStore.saveAttempt(_attempt);
          })
          .catch(err => {
            imageRecord.uploadStatus = 'failed';
            imageRecord.uploadError = err.message || String(err);
            if (_attempt) ESFIMAttemptStore.saveAttempt(_attempt);
          });
      } else {
        console.log('[ESFIM Supervision] No webhookUrl configured. Photo saved locally in attempt store.');
        imageRecord.uploadStatus = 'local_only';
        if (_attempt) ESFIMAttemptStore.saveAttempt(_attempt);
      }

      return dataUrl;
    } catch (e) {
      console.warn('[ESFIM Supervision] Photo capture failed:', e);
      return null;
    }
  }

  /**
   * Event Handler: Tab visibility change — fires for ALL exams (not just antiCheat)
   */
  function handleVisibilityChange() {
    if (document.hidden && _isActive) {
      triggerViolation('Tab switch or window minimized');
    }
  }

  /**
   * Event Handler: Window blur — fires for ALL exams (not just antiCheat)
   */
  function handleBlur() {
    if (_isActive && !_suppressFullscreenCheck) {
      // Debounce window blur to avoid false positives on dropdown selects
      const now = Date.now();
      if (now - _lastViolationTime > 2000) {
        triggerViolation('Loss of exam window focus');
      }
    }
  }

  /**
   * Show modal overlay requiring fullscreen activation
   */
  function showFullscreenOverlay() {
    if (!_isActive || isFullscreen()) return;
    let overlay = document.getElementById('fs-enforce-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fs-enforce-overlay';
      overlay.className = 'fs-enforce-overlay';
      overlay.innerHTML = `
        <div class="fs-enforce-card">
          <div style="font-size:48px;margin-bottom:12px">🖥️</div>
          <h2 style="font-size:20px;font-weight:800;margin-bottom:8px">Fullscreen Mode Required</h2>
          <p class="text-sm text-muted mb-4">This exam must be taken in fullscreen mode to ensure proctoring integrity and proper display of exam items.</p>
          <button type="button" class="btn btn-primary btn-lg w-full" id="btn-activate-fullscreen" onclick="ESFIMSupervision.requestFullscreen()">
            Enable Fullscreen →
          </button>
        </div>
      `;
      document.body.appendChild(overlay);
    }
  }

  /**
   * Hide fullscreen requirement overlay
   */
  function hideFullscreenOverlay() {
    const overlay = document.getElementById('fs-enforce-overlay');
    if (overlay) overlay.remove();
  }

  /**
   * Event Handler: Fullscreen change — triggers violation for ALL exams
   */
  function handleFullscreenChange() {
    const isFs = isFullscreen();
    const fsBtn = document.getElementById('btn-fullscreen-toggle');
    if (fsBtn) {
      fsBtn.innerHTML = isFs ? '⛶ Exit Fullscreen' : '🖥️ Fullscreen';
      fsBtn.classList.toggle('active', isFs);
    }

    if (isFs) {
      hideFullscreenOverlay();
    } else if (_isActive && !_suppressFullscreenCheck) {
      showFullscreenOverlay();
      // Always count fullscreen exit as a violation regardless of antiCheatingEnabled
      triggerViolation('Exited fullscreen mode.');
    }
  }

  /**
   * Register a security violation
   */
  function triggerViolation(reason) {
    if (!_isActive) return;
    const now = Date.now();
    if (now - _lastViolationTime < 2000) return; // Prevent duplicate rapid triggers
    _lastViolationTime = now;

    _warningsCount += 1;
    const violationRecord = { type: reason, at: new Date().toISOString(), count: _warningsCount };

    if (_attempt) {
      if (!_attempt.violations) _attempt.violations = [];
      _attempt.violations.push(violationRecord);
      ESFIMAttemptStore.saveAttempt(_attempt);
    }

    // Second violation terminates exam immediately
    if (_warningsCount >= 2) {
      terminateExam('Multiple proctoring violations: ' + reason);
    } else {
      if (_onViolationCb) _onViolationCb(_warningsCount, reason);
    }
  }

  /**
   * Terminate exam due to proctoring violation
   */
  function terminateExam(reason) {
    _isActive = false;
    _suppressFullscreenCheck = false;
    hideFullscreenOverlay();
    cleanup();
    if (_onTerminateCb) _onTerminateCb(reason);
  }

  /**
   * Temporarily suspend fullscreen-exit violations.
   * Call this BEFORE requesting microphone (or camera) access so that the
   * browser's permission dialog (which forces an exit from fullscreen on Chrome/Edge)
   * does not trigger a proctoring violation.
   * @param {number} [maxMs=8000] - Maximum grace period in ms before auto-resume
   */
  function pauseForMicPermission(maxMs = 8000) {
    _suppressFullscreenCheck = true;
    if (_suppressResumeTimer) clearTimeout(_suppressResumeTimer);
    _suppressResumeTimer = setTimeout(() => {
      _suppressFullscreenCheck = false;
      _suppressResumeTimer = null;
      // After grace period, if we are not in fullscreen, re-request it silently
      if (_isActive && !isFullscreen()) {
        requestFullscreen();
      }
    }, maxMs);
    console.log('[ESFIMSupervision] Fullscreen enforcement paused for mic permission dialog.');
  }

  /**
   * Resume fullscreen enforcement after the microphone permission dialog has closed.
   * Automatically re-requests fullscreen if needed.
   */
  function resumeAfterMicPermission() {
    if (_suppressResumeTimer) {
      clearTimeout(_suppressResumeTimer);
      _suppressResumeTimer = null;
    }
    if (_isActive && !isFullscreen()) {
      // Small delay so browser can settle after permission dialog closes
      setTimeout(() => { if (_isActive && !isFullscreen()) requestFullscreen(); }, 300);
    }
    // Grace period before re-arming violation triggers
    setTimeout(() => {
      _suppressFullscreenCheck = false;
    }, 1500);
    console.log('[ESFIMSupervision] Fullscreen enforcement resumed after mic permission.');
  }

  /**
   * Suppress context menu (right-click) during active supervision
   */
  function _handleContextMenu(e) {
    if (_isActive) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  /**
   * beforeunload handler — shows browser's native "Leave page?" dialog
   * and counts as a violation if _isActive
   */
  function _handleBeforeUnload(e) {
    if (!_isActive) return;
    // Count leaving as a violation
    triggerViolation('Attempted to leave or refresh the exam page');
    // Show native browser confirmation dialog
    e.preventDefault();
    e.returnValue = 'Leaving this page will terminate your exam. Are you sure?';
    return e.returnValue;
  }

  /**
   * Clean up timers and camera stream
   */
  function cleanup() {
    _isActive = false;
    document.removeEventListener('contextmenu', _handleContextMenu, true);
    window.removeEventListener('beforeunload', _handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleBlur);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    document.removeEventListener('MSFullscreenChange', handleFullscreenChange);

    if (_cameraCheckInterval) clearInterval(_cameraCheckInterval);
    _randomPhotoTimers.forEach(t => clearTimeout(t));
    _randomPhotoTimers = [];

    if (_stream) {
      _stream.getTracks().forEach(track => track.stop());
      _stream = null;
    }
  }

  return {
    init,
    isFullscreen,
    requestFullscreen,
    exitFullscreen,
    toggleFullscreen,
    startCamera,
    attachVideoStream,
    capturePhoto,
    triggerViolation,
    terminateExam,
    cleanup,
    pauseForMicPermission,
    resumeAfterMicPermission,
  };
})();
