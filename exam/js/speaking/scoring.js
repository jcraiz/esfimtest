/**
 * ESFIM Speaking Assessment — Response Scoring Engine
 * Evaluates spoken responses using weighted phonemes (55%), word alignment (25%), and completeness (20%).
 */
const ESFIMSpeakingScoring = (() => {

  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/['''`´]/g, "'")
      .replace(/[""]/g, '"')
      .replace(/\b(\d+)\b/g, (m, num) => {
        const n = parseInt(num, 10);
        const map = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
        return map[n] || num;
      })
      .replace(/[.,!?;:()"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean);
  }

  /**
   * Align target word tokens against heard word tokens
   */
  function alignWords(targetTokens, heardTokens) {
    const m = targetTokens.length;
    const n = heardTokens.length;
    if (m === 0) return { align: [], target: targetTokens, heard: heardTokens };
    if (n === 0) return { align: targetTokens.map(t => ({ target: t, heard: null, status: 'missing' })), target: targetTokens, heard: [] };

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = targetTokens[i - 1] === heardTokens[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + cost,
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1
        );
      }
    }

    // Backtrack
    let i = m, j = n;
    const align = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && (dp[i][j] === dp[i - 1][j - 1] + (targetTokens[i - 1] === heardTokens[j - 1] ? 0 : 1))) {
        const match = targetTokens[i - 1] === heardTokens[j - 1];
        align.push({
          target: targetTokens[i - 1],
          heard: heardTokens[j - 1],
          status: match ? 'match' : 'substitution'
        });
        i--; j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        align.push({ target: targetTokens[i - 1], heard: null, status: 'missing' });
        i--;
      } else {
        align.push({ target: null, heard: heardTokens[j - 1], status: 'extra' });
        j--;
      }
    }
    align.reverse();
    return { align, target: targetTokens, heard: heardTokens };
  }

  /**
   * Score spoken response against target item
   */
  function scoreResponse(targetText, alternatives, accent = 'US', partMeta) {
    if (!alternatives || alternatives.length === 0) {
      return {
        heard: '(no speech detected)',
        score: 0,
        state: 'retry',
        correct: false,
        wordScore: 0,
        phoneticScore: 0,
        completeness: 0,
        confidence: null,
        details: { reason: 'No speech detected' }
      };
    }

    const bestAlt = alternatives[0];
    const heardText = bestAlt.transcript;
    const confidence = bestAlt.confidence;

    const targetTokens = tokenize(targetText);
    const heardTokens = tokenize(heardText);

    // 1. Phonetic similarity (0.55 weight)
    let targetPhonemes = [];
    let heardPhonemes = [];
    targetTokens.forEach(t => targetPhonemes.push(...ESFIMPhoneme.graphemeToPhonemes(t, accent)));
    heardTokens.forEach(t => heardPhonemes.push(...ESFIMPhoneme.graphemeToPhonemes(t, accent)));

    const phonemeRes = ESFIMPhoneme.weightedPhonemeDistance(targetPhonemes, heardPhonemes);
    const phoneticScore = phonemeRes.similarity;

    // 2. Word alignment similarity (0.25 weight)
    const wordAlign = alignWords(targetTokens, heardTokens);
    const matchCount = wordAlign.align.filter(a => a.status === 'match').length;
    const wordScore = targetTokens.length > 0 ? matchCount / Math.max(targetTokens.length, heardTokens.length) : 0;

    // 3. Completeness (0.20 weight)
    const completeness = targetTokens.length > 0 ? matchCount / targetTokens.length : 0;

    // Combined score
    let combined = 0.55 * phoneticScore + 0.25 * wordScore + 0.20 * completeness;

    // Confidence adjustment if present
    if (confidence !== null && confidence !== undefined && confidence > 0) {
      combined = combined * (0.75 + 0.25 * confidence);
    }

    const finalScore = Math.min(1.0, Math.max(0, combined));

    // Thresholds
    const isRecall = partMeta ? partMeta.memo : false;
    const thresholds = isRecall
      ? { strong: 0.85, accept: 0.75, uncertain: 0.62 }
      : { strong: 0.88, accept: 0.78, uncertain: 0.65 };

    let state = 'scored';
    let correct = false;

    if (finalScore >= thresholds.accept) {
      correct = true;
      state = 'scored';
    } else if (finalScore >= thresholds.uncertain) {
      state = 'uncertain';
      correct = false;
    } else {
      state = 'retry';
      correct = false;
    }

    return {
      heard: heardText,
      score: finalScore,
      state,
      correct,
      wordScore,
      phoneticScore,
      completeness,
      confidence,
      isRecall,
      details: {
        wordAlign,
        phonemeRes,
        targetPhonemes: targetPhonemes.join(' '),
        heardPhonemes: heardPhonemes.join(' '),
      }
    };
  }

  return {
    normalizeText,
    tokenize,
    alignWords,
    scoreResponse,
  };
})();
