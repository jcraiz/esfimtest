/**
 * ESFIM Speaking Assessment — Web Speech API Wrapper
 * Interfacing with SpeechRecognition / webkitSpeechRecognition
 * Includes automatic silence timeout if no audio is detected within prudential time.
 */
class SpeechHandler {
  constructor(accent = 'US') {
    this.accent = accent;
    this.recognition = null;
    this.isListening = false;
    this.silenceTimer = null;
    this.onResult = null;
    this.onError = null;
    this.onEnd = null;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 3;
      this.recognition.lang = accent === 'US' ? 'en-US' : 'en-GB';

      this.recognition.onresult = (event) => {
        this.clearSilenceTimer();
        this.isListening = false;
        const alternatives = [];
        for (let i = 0; i < event.results[0].length; i++) {
          alternatives.push({
            transcript: event.results[0][i].transcript,
            confidence: event.results[0][i].confidence || null,
          });
        }
        if (this.onResult) this.onResult(alternatives);
      };

      this.recognition.onerror = (event) => {
        this.clearSilenceTimer();
        this.isListening = false;
        let msg = 'Error de reconocimiento: ' + event.error;
        if (event.error === 'no-speech') msg = 'No se detectó audio en el tiempo límite. Intente hablar más cerca del micrófono.';
        if (event.error === 'audio-capture') msg = 'Micrófono no disponible o desconectado.';
        if (event.error === 'not-allowed') msg = 'Permiso de micrófono denegado.';
        if (this.onError) this.onError(event.error, msg);
      };

      this.recognition.onend = () => {
        this.clearSilenceTimer();
        this.isListening = false;
        if (this.onEnd) this.onEnd();
      };
    }
  }

  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Start listening with prudential silence timeout (default 7 seconds)
   */
  start(silenceTimeoutMs = 7000) {
    if (!this.recognition) {
      if (this.onError) this.onError('not-supported', 'Reconocimiento de voz no soportado en este navegador.');
      return;
    }
    try {
      this.isListening = true;
      this.clearSilenceTimer();

      // Prudential silence timer: automatically stops and notifies if no audio detected
      this.silenceTimer = setTimeout(() => {
        if (this.isListening) {
          console.warn(`SpeechHandler: prudential silence timeout triggered after ${silenceTimeoutMs}ms`);
          this.stop();
          if (this.onError) {
            this.onError('no-speech', 'Tiempo agotado sin detectar audio. Por favor hable más fuerte o acerque su micrófono.');
          }
        }
      }, silenceTimeoutMs);

      this.recognition.start();
    } catch (e) {
      this.isListening = false;
      this.clearSilenceTimer();
      if (this.onError) this.onError('already-started', 'El micrófono ya está activo.');
    }
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  stop() {
    this.clearSilenceTimer();
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
    }
  }
}
