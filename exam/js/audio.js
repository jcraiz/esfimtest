/**
 * ESFIM Exam Delivery — Listening Audio Player Controller
 * Enforces per-item play limits and handles basic/advanced controls.
 */
const ESFIMAudio = (() => {

  /**
   * Render listening item audio player widget
   * @param {object} item - listening bank item
   * @param {number} currentPlays - number of plays used so far
   * @param {string} itemKey - unique key for item e.g. 'listening_0'
   * @returns {string} HTML string
   */
  function renderPlayerWidget(item, currentPlays, itemKey) {
    const playLimit = item.playLimit || 0;
    const limitReached = playLimit > 0 && currentPlays >= playLimit;

    let limitText = playLimit > 0 ? `${currentPlays} of ${playLimit} plays used` : `Played ${currentPlays} times (unlimited)`;
    if (limitReached) limitText = `⚠️ Play limit reached (${playLimit}/${playLimit})`;

    if (item.playerType === 'advanced') {
      return `
        <div class="audio-widget-card" id="audio-widget-${itemKey}" role="region" aria-label="Listening audio player">
          <div class="flex items-center justify-between mb-3">
            <span class="label-sm">Listening Audio</span>
            <span class="play-count-badge" id="audio-badge-${itemKey}">${limitText}</span>
          </div>

          ${item.visualAidDataUrl ? `
            <div class="mb-3">
              <img src="${item.visualAidDataUrl}" alt="Listening visual aid" style="max-width:100%;max-height:220px;object-fit:contain;border-radius:var(--radius);border:1px solid var(--clr-border)">
            </div>` : ''}

          <audio id="audio-elem-${itemKey}" src="${item.audioDataUrl || item.audioFilename || ''}" aria-label="Listening audio track" style="display:none"></audio>

          <div class="audio-controls-row">
            <button type="button" class="audio-play-btn" id="audio-play-${itemKey}"
                    onclick="ESFIMAudio.togglePlay('${itemKey}', ${playLimit})"
                    aria-label="Play assessment audio" ${limitReached ? 'disabled' : ''}>
              ▶
            </button>

            <div class="flex-1 flex-col gap-1">
              <input type="range" id="audio-seek-${itemKey}" min="0" max="100" value="0" style="width:100%"
                     oninput="ESFIMAudio.handleSeek('${itemKey}')"
                     aria-label="Playback position" ${limitReached ? 'disabled' : ''}>
              <div class="flex justify-between text-xs text-muted font-mono">
                <span id="audio-time-${itemKey}">00:00</span>
                <span id="audio-dur-${itemKey}">--:--</span>
              </div>
            </div>

            <button type="button" class="btn btn-ghost btn-sm" onclick="ESFIMAudio.stopAudio('${itemKey}')"
                    aria-label="Stop audio" ${limitReached ? 'disabled' : ''}>
              ⏹ Stop
            </button>
          </div>
        </div>`;
    }

    // Default: Basic player (Play / Stop only)
    return `
      <div class="audio-widget-card" id="audio-widget-${itemKey}" role="region" aria-label="Listening audio player">
        <div class="flex items-center justify-between mb-3">
          <span class="label-sm">Listening Audio</span>
          <span class="play-count-badge" id="audio-badge-${itemKey}">${limitText}</span>
        </div>

        ${item.visualAidDataUrl ? `
          <div class="mb-3">
            <img src="${item.visualAidDataUrl}" alt="Listening visual aid" style="max-width:100%;max-height:220px;object-fit:contain;border-radius:var(--radius);border:1px solid var(--clr-border)">
          </div>` : ''}

        <audio id="audio-elem-${itemKey}" src="${item.audioDataUrl || item.audioFilename || ''}" aria-label="Listening audio track" style="display:none"></audio>

        <div class="audio-controls-row">
          <button type="button" class="btn btn-primary btn-lg" id="audio-play-${itemKey}"
                  onclick="ESFIMAudio.togglePlay('${itemKey}', ${playLimit})"
                  aria-label="Play assessment audio" ${limitReached ? 'disabled' : ''}>
            ▶ Play Audio
          </button>
          <button type="button" class="btn btn-ghost btn-lg" onclick="ESFIMAudio.stopAudio('${itemKey}')"
                  aria-label="Stop audio" ${limitReached ? 'disabled' : ''}>
            ⏹ Stop
          </button>
        </div>
      </div>`;
  }

  // Registry for tracking active audio instances
  const _activeAudio = {};
  let _onPlayCountIncrementCb = null;

  function setPlayCountCallback(cb) {
    _onPlayCountIncrementCb = cb;
  }

  function togglePlay(itemKey, playLimit) {
    const audio = document.getElementById(`audio-elem-${itemKey}`);
    const playBtn = document.getElementById(`audio-play-${itemKey}`);
    if (!audio) return;

    // Check play limit against latest recorded count before playing
    const currentPlays = _activeAudio[itemKey]?.plays || 0;
    if (playLimit > 0 && currentPlays >= playLimit) {
      disableWidget(itemKey, playLimit);
      return;
    }

    if (audio.paused) {
      // Stop any other currently playing audio
      stopAllAudio();

      audio.play().then(() => {
        if (!_activeAudio[itemKey]) {
          _activeAudio[itemKey] = { plays: currentPlays, isCounting: false };
        }

        // Increment count when started
        if (!_activeAudio[itemKey].isCounting) {
          _activeAudio[itemKey].plays += 1;
          _activeAudio[itemKey].isCounting = true;
          if (_onPlayCountIncrementCb) _onPlayCountIncrementCb(itemKey, _activeAudio[itemKey].plays);
          updateBadge(itemKey, _activeAudio[itemKey].plays, playLimit);

          // If this play reaches the maximum limit, disable widget controls
          if (playLimit > 0 && _activeAudio[itemKey].plays >= playLimit) {
            disableWidget(itemKey, playLimit);
          }
        }

        if (playBtn) playBtn.innerHTML = '⏸';
      }).catch(err => {
        console.error('Audio playback failed:', err);
      });

      // Bind timeupdate for seekbar
      audio.ontimeupdate = () => {
        const seek = document.getElementById(`audio-seek-${itemKey}`);
        const timeEl = document.getElementById(`audio-time-${itemKey}`);
        const durEl = document.getElementById(`audio-dur-${itemKey}`);
        if (seek && audio.duration) {
          seek.value = (audio.currentTime / audio.duration) * 100;
        }
        if (timeEl) timeEl.textContent = formatSecs(audio.currentTime);
        if (durEl && audio.duration) durEl.textContent = formatSecs(audio.duration);
      };

      audio.onended = () => {
        if (playBtn) playBtn.innerHTML = itemKey.includes('basic') ? '▶ Play Audio' : '▶';
        if (_activeAudio[itemKey]) _activeAudio[itemKey].isCounting = false;
        // Check if limit reached after this play
        const playsCount = _activeAudio[itemKey]?.plays || 0;
        if (playLimit > 0 && playsCount >= playLimit) {
          disableWidget(itemKey, playLimit);
        }
      };
    } else {
      audio.pause();
      if (playBtn) playBtn.innerHTML = '▶';
      if (_activeAudio[itemKey]) _activeAudio[itemKey].isCounting = false;
      const playsCount = _activeAudio[itemKey]?.plays || 0;
      if (playLimit > 0 && playsCount >= playLimit) {
        disableWidget(itemKey, playLimit);
      }
    }
  }

  function handleSeek(itemKey) {
    const audio = document.getElementById(`audio-elem-${itemKey}`);
    const seek = document.getElementById(`audio-seek-${itemKey}`);
    if (audio && seek && audio.duration) {
      audio.currentTime = (seek.value / 100) * audio.duration;
    }
  }

  function stopAudio(itemKey) {
    const audio = document.getElementById(`audio-elem-${itemKey}`);
    const playBtn = document.getElementById(`audio-play-${itemKey}`);
    const seek = document.getElementById(`audio-seek-${itemKey}`);
    const timeEl = document.getElementById(`audio-time-${itemKey}`);

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (playBtn) playBtn.innerHTML = '▶';
    if (seek) seek.value = 0;
    if (timeEl) timeEl.textContent = '00:00';
    if (_activeAudio[itemKey]) _activeAudio[itemKey].isCounting = false;
  }

  function stopAllAudio() {
    document.querySelectorAll('audio').forEach(a => {
      a.pause();
      a.currentTime = 0;
    });
    document.querySelectorAll('.audio-play-btn').forEach(btn => {
      btn.innerHTML = '▶';
    });
  }

  function updateBadge(itemKey, plays, limit) {
    const badge = document.getElementById(`audio-badge-${itemKey}`);
    if (!badge) return;
    if (limit > 0) {
      if (plays >= limit) {
        badge.textContent = `⚠️ Play limit reached (${limit}/${limit})`;
        badge.style.color = 'var(--clr-error)';
      } else {
        badge.textContent = `${plays} of ${limit} plays used`;
      }
    } else {
      badge.textContent = `Played ${plays} times (unlimited)`;
    }
  }

  function disableWidget(itemKey, limit) {
    const playBtn = document.getElementById(`audio-play-${itemKey}`);
    const seek = document.getElementById(`audio-seek-${itemKey}`);
    if (playBtn) playBtn.disabled = true;
    if (seek) seek.disabled = true;
    updateBadge(itemKey, limit, limit);
  }

  function formatSecs(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return {
    renderPlayerWidget,
    setPlayCountCallback,
    togglePlay,
    handleSeek,
    stopAudio,
    stopAllAudio,
  };
})();
