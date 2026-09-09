/**
 * ESFIM Speaking Assessment — Phoneme Engine & G2P Mapping
 * Derived from reference Speaking Assessment implementation.
 */
const ESFIMPhoneme = (() => {

  const PHONEME_FEATURES = {
    // Vowels
    'iː': { type: 'vowel', height: 'high', backness: 'front', length: 'long', rounded: false },
    'ɪ':  { type: 'vowel', height: 'near-high', backness: 'front', length: 'short', rounded: false },
    'e':  { type: 'vowel', height: 'mid', backness: 'front', length: 'short', rounded: false },
    'ɛ':  { type: 'vowel', height: 'mid', backness: 'front', length: 'short', rounded: false },
    'æ':  { type: 'vowel', height: 'near-low', backness: 'front', length: 'short', rounded: false },
    'ʌ':  { type: 'vowel', height: 'mid', backness: 'central', length: 'short', rounded: false },
    'ɑː': { type: 'vowel', height: 'low', backness: 'back', length: 'long', rounded: false },
    'ɒ':  { type: 'vowel', height: 'low', backness: 'back', length: 'short', rounded: false },
    'ɔː': { type: 'vowel', height: 'mid-low', backness: 'back', length: 'long', rounded: true },
    'ʊ':  { type: 'vowel', height: 'near-high', backness: 'back', length: 'short', rounded: true },
    'uː': { type: 'vowel', height: 'high', backness: 'back', length: 'long', rounded: true },
    'ə':  { type: 'vowel', height: 'mid', backness: 'central', length: 'short', rounded: false },
    'ɜː': { type: 'vowel', height: 'mid', backness: 'central', length: 'long', rounded: false },
    'eɪ': { type: 'vowel', height: 'mid', backness: 'front', length: 'diphthong', rounded: false },
    'aɪ': { type: 'vowel', height: 'low', backness: 'front', length: 'diphthong', rounded: false },
    'ɔɪ': { type: 'vowel', height: 'mid', backness: 'back', length: 'diphthong', rounded: true },
    'aʊ': { type: 'vowel', height: 'low', backness: 'back', length: 'diphthong', rounded: false },
    'oʊ': { type: 'vowel', height: 'mid', backness: 'back', length: 'diphthong', rounded: true },
    'ɪə': { type: 'vowel', height: 'high', backness: 'front', length: 'diphthong', rounded: false },
    'ɛə': { type: 'vowel', height: 'mid', backness: 'front', length: 'diphthong', rounded: false },
    'ʊə': { type: 'vowel', height: 'high', backness: 'back', length: 'diphthong', rounded: true },
    // Consonants
    'p': { type: 'consonant', place: 'bilabial', manner: 'stop', voiced: false },
    'b': { type: 'consonant', place: 'bilabial', manner: 'stop', voiced: true },
    't': { type: 'consonant', place: 'alveolar', manner: 'stop', voiced: false },
    'd': { type: 'consonant', place: 'alveolar', manner: 'stop', voiced: true },
    'k': { type: 'consonant', place: 'velar', manner: 'stop', voiced: false },
    'g': { type: 'consonant', place: 'velar', manner: 'stop', voiced: true },
    'm': { type: 'consonant', place: 'bilabial', manner: 'nasal', voiced: true },
    'n': { type: 'consonant', place: 'alveolar', manner: 'nasal', voiced: true },
    'ŋ': { type: 'consonant', place: 'velar', manner: 'nasal', voiced: true },
    'f': { type: 'consonant', place: 'labiodental', manner: 'fricative', voiced: false },
    'v': { type: 'consonant', place: 'labiodental', manner: 'fricative', voiced: true },
    'θ': { type: 'consonant', place: 'dental', manner: 'fricative', voiced: false },
    'ð': { type: 'consonant', place: 'dental', manner: 'fricative', voiced: true },
    's': { type: 'consonant', place: 'alveolar', manner: 'fricative', voiced: false },
    'z': { type: 'consonant', place: 'alveolar', manner: 'fricative', voiced: true },
    'ʃ': { type: 'consonant', place: 'postalveolar', manner: 'fricative', voiced: false },
    'ʒ': { type: 'consonant', place: 'postalveolar', manner: 'fricative', voiced: true },
    'h': { type: 'consonant', place: 'glottal', manner: 'fricative', voiced: false },
    'tʃ': { type: 'consonant', place: 'postalveolar', manner: 'affricate', voiced: false },
    'dʒ': { type: 'consonant', place: 'postalveolar', manner: 'affricate', voiced: true },
    'l': { type: 'consonant', place: 'alveolar', manner: 'liquid', voiced: true },
    'r': { type: 'consonant', place: 'alveolar', manner: 'liquid', voiced: true },
    'w': { type: 'consonant', place: 'labiovelar', manner: 'approximant', voiced: true },
    'j': { type: 'consonant', place: 'palatal', manner: 'approximant', voiced: true }
  };

  /**
   * Grapheme → phoneme heuristic mapping
   */
  function graphemeToPhonemes(word, accent) {
    const w = word.toLowerCase().replace(/[^a-z']/g, '');
    if (!w) return [];

    let phonemes = [];
    let i = 0;

    const multi = {
      'th': 'θ', 'ch': 'tʃ', 'sh': 'ʃ', 'ph': 'f', 'wh': 'w',
      'wr': 'r', 'kn': 'n', 'gn': 'n', 'mb': 'm', 'ck': 'k',
      'qu': 'kw', 'tion': 'ʃən', 'sion': 'ʒən', 'ture': 'tʃər',
      'sure': 'ʒər', 'ough': 'ʌf', 'augh': 'ɔːf', 'eigh': 'eɪ',
      'igh': 'aɪ', 'ng': 'ŋ', 'nk': 'ŋk'
    };

    const single = {
      'a': 'æ', 'e': 'ɛ', 'i': 'ɪ', 'o': 'ɒ', 'u': 'ʌ',
      'y': 'j', 'c': 'k', 'g': 'g', 'j': 'dʒ', 'q': 'k',
      'x': 'ks', 'z': 'z', 'r': 'r', 'l': 'l', 'm': 'm',
      'n': 'n', 'p': 'p', 'b': 'b', 't': 't', 'd': 'd',
      'f': 'f', 'v': 'v', 's': 's', 'h': 'h', 'w': 'w'
    };

    while (i < w.length) {
      let matched = false;
      for (const [key, val] of Object.entries(multi)) {
        if (w.substr(i, key.length) === key) {
          for (const ph of val.split('')) {
            if (ph === 'k') phonemes.push('k');
            else if (ph === 'w') phonemes.push('w');
            else if (ph === 'ʃ') phonemes.push('ʃ');
            else if (ph === 'ə') phonemes.push('ə');
            else if (ph === 'n') phonemes.push('n');
            else if (ph === 'r') phonemes.push('r');
            else if (ph === 't') phonemes.push('t');
            else if (ph === 'd') phonemes.push('d');
            else if (ph === 'ʒ') phonemes.push('ʒ');
            else if (ph === 'f') phonemes.push('f');
            else if (ph === 'ɔ') phonemes.push('ɔː');
            else if (ph === 'e') phonemes.push('e');
            else if (ph === 'ɪ') phonemes.push('ɪ');
            else if (ph === 'a') phonemes.push('aɪ');
            else if (ph === 'o') phonemes.push('oʊ');
            else if (ph === 'u') phonemes.push('uː');
            else if (ph !== 'ː') phonemes.push(ph);
          }
          i += key.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      const char = w[i];
      if (char in single) {
        const val = single[char];
        for (const ph of val.split('')) {
          if (ph === 'k') phonemes.push('k');
          else if (ph === 's') phonemes.push('s');
          else if (ph === 'd') phonemes.push('d');
          else if (ph === 'ʒ') phonemes.push('ʒ');
          else if (ph === 'e') phonemes.push('e');
          else if (ph === 'ɪ') phonemes.push('ɪ');
          else if (ph === 'a') phonemes.push('aɪ');
          else if (ph === 'o') phonemes.push('oʊ');
          else if (ph === 'u') phonemes.push('uː');
          else phonemes.push(ph);
        }
        i++;
      } else {
        i++;
      }
    }
    return phonemes;
  }

  /**
   * Phoneme similarity score (0..1) based on features
   */
  function phonemeSimilarity(p1, p2) {
    if (p1 === p2) return 1.0;
    const f1 = PHONEME_FEATURES[p1];
    const f2 = PHONEME_FEATURES[p2];
    if (!f1 || !f2) return 0.3;
    if (f1.type !== f2.type) return 0.1;

    if (f1.type === 'vowel') {
      let score = 0.0;
      if (f1.height === f2.height) score += 0.3;
      if (f1.backness === f2.backness) score += 0.3;
      if (f1.length === f2.length) score += 0.2;
      if (f1.rounded === f2.rounded) score += 0.2;
      return Math.min(score, 1.0);
    } else {
      let score = 0.0;
      if (f1.place === f2.place) score += 0.35;
      else if ((f1.place === 'alveolar' && f2.place === 'postalveolar') || (f1.place === 'postalveolar' && f2.place === 'alveolar')) score += 0.15;
      else if ((f1.place === 'bilabial' && f2.place === 'labiodental') || (f1.place === 'labiodental' && f2.place === 'bilabial')) score += 0.1;

      if (f1.manner === f2.manner) score += 0.35;
      else if ((f1.manner === 'fricative' && f2.manner === 'affricate') || (f1.manner === 'affricate' && f2.manner === 'fricative')) score += 0.15;

      if (f1.voiced === f2.voiced) score += 0.3;
      return Math.min(score, 1.0);
    }
  }

  /**
   * Weighted Levenshtein distance on phoneme arrays
   */
  function weightedPhonemeDistance(targetPhonemes, heardPhonemes) {
    const m = targetPhonemes.length;
    const n = heardPhonemes.length;
    if (m === 0) return { distance: n, normalized: 1, similarity: 0, alignTarget: [], alignHeard: [] };
    if (n === 0) return { distance: m, normalized: 1, similarity: 0, alignTarget: targetPhonemes, alignHeard: [] };

    const deleteCost = 1.0;
    const insertCost = 1.0;
    const substituteFar = 1.4;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    const ops = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(null));

    for (let i = 0; i <= m; i++) { dp[i][0] = i * deleteCost; ops[i][0] = 'del'; }
    for (let j = 0; j <= n; j++) { dp[0][j] = j * insertCost; ops[0][j] = 'ins'; }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const sim = phonemeSimilarity(targetPhonemes[i - 1], heardPhonemes[j - 1]);
        const subCost = (1 - sim) * substituteFar;
        const sub = dp[i - 1][j - 1] + subCost;
        const del = dp[i - 1][j] + deleteCost;
        const ins = dp[i][j - 1] + insertCost;

        if (sub <= del && sub <= ins) {
          dp[i][j] = sub;
          ops[i][j] = 'sub';
        } else if (del <= ins) {
          dp[i][j] = del;
          ops[i][j] = 'del';
        } else {
          dp[i][j] = ins;
          ops[i][j] = 'ins';
        }
      }
    }

    // Backtrack alignment
    const alignTarget = [];
    const alignHeard = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      const op = ops[i][j];
      if (op === 'sub' || op === null) {
        alignTarget.push(targetPhonemes[i - 1] || '');
        alignHeard.push(heardPhonemes[j - 1] || '');
        i--; j--;
      } else if (op === 'del') {
        alignTarget.push(targetPhonemes[i - 1]);
        alignHeard.push('—');
        i--;
      } else if (op === 'ins') {
        alignTarget.push('—');
        alignHeard.push(heardPhonemes[j - 1]);
        j--;
      }
    }
    alignTarget.reverse();
    alignHeard.reverse();

    const distance = dp[m][n];
    const maxLen = Math.max(m, n, 1);
    const normalized = Math.min(1, distance / (maxLen * substituteFar));
    const similarity = Math.max(0, 1 - normalized);

    return {
      distance,
      normalized,
      similarity,
      alignTarget,
      alignHeard,
    };
  }

  return {
    PHONEME_FEATURES,
    graphemeToPhonemes,
    phonemeSimilarity,
    weightedPhonemeDistance,
  };
})();
