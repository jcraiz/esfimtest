/**
 * ESFIM Speaking Assessment — Adaptive Engine & Item Banks
 * Contains 160 items (10 per CEFR level per part across 4 parts).
 */
const ESFIMSpeakingAdaptive = (() => {

  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const LEVEL_COLOR = { A1: '#7FB8B0', A2: '#4F8A82', B1: '#6B5B7B', B2: '#43335A' };

  const PART_META = [
    { key: 'part1', title: 'Part 1 — Read Aloud', sub: 'Short phrases', memo: false, unit: 'phrase',
      desc: 'Two- to three-word phrases appear on screen. Read each one aloud as naturally as you can.' },
    { key: 'part2', title: 'Part 2 — Recall & Say', sub: 'Short phrases', memo: true, unit: 'phrase',
      desc: 'A short phrase flashes briefly, then disappears. Say it from memory once it is hidden.' },
    { key: 'part3', title: 'Part 3 — Read Aloud', sub: 'Full sentences', memo: false, unit: 'sentence',
      desc: 'Longer sentences (7–10 words) appear on screen. Read each one aloud at a natural pace.' },
    { key: 'part4', title: 'Part 4 — Recall & Say', sub: 'Full sentences', memo: true, unit: 'sentence',
      desc: 'A full sentence is shown for a few seconds, then hidden. Say it back from memory.' }
  ];

  function buildItem(text, level, partKey, difficulty, structure, focus) {
    const tokens = ESFIMSpeakingScoring.tokenize(text);
    return {
      text,
      level,
      wordCount: tokens.length,
      tokens,
      part: partKey,
      difficulty: difficulty || 0.5,
      structure: structure || 'phrase',
      focus: focus || [],
    };
  }

  function buildDefaultBanks() {
    const banks = { part1: {}, part2: {}, part3: {}, part4: {} };

    // Part 1: Read Aloud Phrases
    const p1data = {
      A1: ["good morning", "thank you", "my name", "see you", "how much", "good night", "excuse me", "no problem", "very good", "I am happy"],
      A2: ["nice to meet", "what time", "I don't know", "can you help", "see you later", "have a nice", "how are you", "let's go now", "I like it", "where is it"],
      B1: ["make a decision", "change my mind", "keep in touch", "take your time", "worth the effort", "quite complicated", "fairly confident", "reasonably priced", "highly unlikely", "particularly interesting"],
      B2: ["nevertheless it works", "albeit reluctantly", "notwithstanding the risk", "meticulously planned", "ostensibly agreed", "predominantly urban", "an ambiguous outcome", "a plausible explanation", "inherently flawed", "utterly convinced"]
    };
    for (const [level, items] of Object.entries(p1data)) {
      banks.part1[level] = items.map(t => buildItem(t, level, 'part1', 0.3, 'phrase', []));
    }

    // Part 2: Recall Phrases
    const p2data = {
      A1: ["good afternoon", "how old", "I love you", "see you soon", "good luck", "well done", "come here", "sit down", "stand up", "be careful"],
      A2: ["I agree", "not really", "of course", "by the way", "for example", "at least", "in fact", "as usual", "so far", "right now"],
      B1: ["come to terms", "get in touch", "look forward to", "put up with", "run out of", "fairly straightforward", "genuinely surprised", "increasingly popular", "widely accepted", "closely related"],
      B2: ["arguably the best", "seemingly endless", "presumably correct", "inadvertently caused", "a compelling argument", "an unprecedented decision", "a subtle distinction", "profoundly affected", "a controversial proposal", "deceptively simple"]
    };
    for (const [level, items] of Object.entries(p2data)) {
      banks.part2[level] = items.map(t => buildItem(t, level, 'part2', 0.35, 'phrase', ['recall']));
    }

    // Part 3: Read Aloud Sentences
    const p3data = {
      A1: [
        "I would like a cup of coffee.", "She goes to school every morning.", "We live in a small house.",
        "He is my best friend here.", "They are playing in the park.", "My mother cooks dinner every night.",
        "The cat is sleeping on the bed.", "I usually wake up at seven.", "This is a very nice day.", "Can you open the door please?"
      ],
      A2: [
        "I have been learning English for years.", "We are planning a trip next month.", "She usually arrives at the office early.",
        "He forgot to bring his umbrella today.", "They enjoy hiking in the mountains together.", "I need to finish this report by Friday.",
        "The weather has been quite cold lately.", "We should call him before it gets late.", "She is looking for a new apartment nearby.",
        "He always checks his email in the morning."
      ],
      B1: [
        "Although it was raining, we decided to go out.", "I've never seen such a beautiful sunset before.",
        "She apologized for arriving late to the meeting.", "We were surprised by how quickly things changed.",
        "He suggested that we postpone the trip until spring.", "I wonder whether they will accept our proposal.",
        "The company announced a new policy last week.", "She has been working on this project for months.",
        "They finally managed to solve the difficult problem.", "We should consider all the options before deciding."
      ],
      B2: [
        "Despite the setbacks, the team remained remarkably optimistic throughout.", "Had I known earlier, I would have acted differently.",
        "The negotiations were far more complicated than anyone anticipated.", "She articulated her concerns with impressive clarity and precision.",
        "The proposal was ultimately rejected due to budget constraints.", "Notwithstanding the criticism, he stood firmly by his decision.",
        "The findings suggest a correlation that warrants further investigation.", "It is imperative that we address this issue immediately.",
        "Their reluctance to compromise prolonged the entire negotiation process.", "The committee deliberated extensively before reaching a final verdict."
      ]
    };
    for (const [level, items] of Object.entries(p3data)) {
      banks.part3[level] = items.map(t => buildItem(t, level, 'part3', 0.4, 'sentence', []));
    }

    // Part 4: Recall Sentences
    const p4data = {
      A1: [
        "My father drives to work every day.", "I like to read books at night.", "The children are eating lunch now.",
        "She wears a red coat in winter.", "We visit our grandparents on Sundays.", "He plays football with his friends.",
        "I need to buy some milk today.", "The dog runs fast in the yard.", "They watch television after dinner.", "I clean my room every weekend."
      ],
      A2: [
        "I usually go for a run before breakfast.", "She has already finished her homework tonight.", "We are meeting some friends this weekend.",
        "He never forgets to lock the door.", "They moved to a new city last year.", "I try to save some money each month.",
        "She often travels for work these days.", "We were waiting for the bus for ages.", "He recently started a new job downtown.", "I always bring a book on long flights."
      ],
      B1: [
        "Even though he was tired, he kept working.", "I'm still trying to figure out the answer.",
        "She decided to change careers after graduation.", "We had to rearrange our entire schedule again.",
        "He rarely admits when he has made a mistake.", "They eventually reached an agreement after long discussions.",
        "I couldn't believe how fast the time passed.", "She managed to convince everyone to join the project.",
        "We were told the flight would be delayed.", "He apologized sincerely for the misunderstanding earlier."
      ],
      B2: [
        "Given the circumstances, we had little choice but to wait.", "She remained composed despite the mounting pressure around her.",
        "The evidence presented was insufficient to support the claim.", "He reluctantly conceded that the plan needed reconsideration.",
        "The proposal sparked considerable debate among the board members.", "Their persistence eventually paid off after months of effort.",
        "I can't help but wonder what might have happened otherwise.", "The revised strategy proved far more effective than expected.",
        "She hesitated before revealing the truth about the incident.", "The outcome exceeded even the most optimistic projections."
      ]
    };
    for (const [level, items] of Object.entries(p4data)) {
      banks.part4[level] = items.map(t => buildItem(t, level, 'part4', 0.45, 'sentence', ['recall']));
    }

    return banks;
  }

  function buildBanks(customPrompts = null) {
    if (customPrompts && Array.isArray(customPrompts) && customPrompts.length > 0) {
      const banks = {
        part1: { A1: [], A2: [], B1: [], B2: [] },
        part2: { A1: [], A2: [], B1: [], B2: [] },
        part3: { A1: [], A2: [], B1: [], B2: [] },
        part4: { A1: [], A2: [], B1: [], B2: [] }
      };

      customPrompts.forEach(p => {
        if (banks[p.part] && banks[p.part][p.level]) {
          const isMemo = p.mode === 'recall' || p.part === 'part2' || p.part === 'part4';
          banks[p.part][p.level].push(buildItem(p.text, p.level, p.part, 0.3, p.structure || 'phrase', isMemo ? ['recall'] : []));
        }
      });

      // Fill any empty level slots from defaults
      const defaults = buildDefaultBanks();
      ['part1', 'part2', 'part3', 'part4'].forEach(pk => {
        ['A1', 'A2', 'B1', 'B2'].forEach(lvl => {
          if (banks[pk][lvl].length === 0 && defaults[pk][lvl]) {
            banks[pk][lvl] = defaults[pk][lvl];
          }
        });
      });

      return banks;
    }
    return buildDefaultBanks();
  }

  const ITEM_BANKS = buildBanks();

  class AdaptiveEngine {
    constructor(partKey, customPrompts = null) {
      this.partKey = partKey;
      const bankSource = customPrompts ? buildBanks(customPrompts) : ITEM_BANKS;
      this.bank = bankSource[partKey] || ITEM_BANKS[partKey];
      this.levelIdx = 0;
      this.correctStreak = 0;
      this.incorrectStreak = 0;
      this.scoredCount = 0;
      this.totalCount = 0;
      this.used = { A1: new Set(), A2: new Set(), B1: new Set(), B2: new Set() };
      this.log = [];
      this.done = false;
      this.resultLevel = null;
      this.resultPlus = false;
      this.levelHistory = [];
      this.scoredAtCurrentLevel = 0;
      this.retries = 0;
      this.uncertainCount = 0;
      this.reason = '';
    }

    get currentLevel() { return LEVELS[this.levelIdx]; }

    pickQuestion() {
      const lvl = this.currentLevel;
      const pool = this.bank[lvl];
      if (!pool || pool.length === 0) {
        return { level: 'A1', text: 'Hello world', item: null };
      }
      const used = this.used[lvl];
      if (used.size >= pool.length) used.clear();

      let attempts = 0;
      let idx;
      let item;
      do {
        idx = Math.floor(Math.random() * pool.length);
        item = pool[idx];
        attempts++;
      } while (used.has(idx) && attempts < 100);

      used.add(idx);
      this.totalCount++;
      return { level: lvl, text: item.text, item, idx };
    }

    answer(correct, meta) {
      const lvl = this.currentLevel;
      const isScored = meta.state === 'scored';
      const isUncertain = meta.state === 'uncertain';

      this.log.push({
        n: this.totalCount,
        level: lvl,
        target: meta.target || '',
        heard: meta.heard || '',
        score: meta.score || 0,
        wordScore: meta.wordScore || 0,
        phonemeScore: meta.phonemeScore || 0,
        completeness: meta.completeness || 0,
        confidence: meta.confidence || null,
        state: meta.state || 'scored',
        part: this.partKey,
        isRecall: meta.isRecall || false,
        reason: meta.reason || ''
      });

      if (isScored) {
        this.scoredCount++;
        this.scoredAtCurrentLevel++;

        if (correct) {
          this.correctStreak++;
          this.incorrectStreak = 0;
          if (this.correctStreak >= 2 && this.scoredAtCurrentLevel >= 2) {
            if (this.levelIdx < LEVELS.length - 1) {
              this.levelIdx++;
              this.reason = `Advanced to ${this.currentLevel}`;
              this.levelHistory.push({ from: lvl, to: this.currentLevel, reason: this.reason });
              this.correctStreak = 0;
              this.scoredAtCurrentLevel = 0;
            } else if (this.scoredCount >= 4) {
              this.finish(this.levelIdx, true);
              return;
            }
          }
        } else {
          this.incorrectStreak++;
          this.correctStreak = 0;
          if (this.incorrectStreak >= 2 && this.scoredAtCurrentLevel >= 2) {
            if (this.scoredCount >= 4) {
              const prev = Math.max(this.levelIdx - 1, 0);
              this.finish(prev, false);
              return;
            } else {
              this.levelIdx = Math.max(0, this.levelIdx - 1);
              this.reason = `Dropped to ${this.currentLevel}`;
              this.levelHistory.push({ from: lvl, to: this.currentLevel, reason: this.reason });
              this.incorrectStreak = 0;
              this.scoredAtCurrentLevel = 0;
            }
          }
        }
      } else if (isUncertain) {
        this.uncertainCount++;
      } else {
        this.retries++;
      }

      if (this.scoredCount >= 10) {
        this.finish(this.levelIdx, this.correctStreak > 0);
      }
    }

    finish(levelIdx, plus) {
      this.done = true;
      const correctCount = this.log.filter(e => e.score && e.score >= 0.5).length;
      if (correctCount === 0 && this.scoredCount === 0) {
        this.resultLevel = 'A0';
        this.resultPlus = false;
        this.reason = 'No speaking items were answered.';
      } else if (correctCount === 0) {
        this.resultLevel = 'A0';
        this.resultPlus = false;
        this.reason = `0 items recognized successfully after ${this.scoredCount} attempts.`;
      } else {
        this.resultLevel = LEVELS[levelIdx] || 'A1';
        this.resultPlus = plus;
        this.reason = `Settled at ${this.resultLevel}${plus ? '+' : ''} after ${this.scoredCount} items.`;
      }
    }

    getResults() {
      let finalLvl = this.resultLevel;
      let finalPlus = this.resultPlus;

      if (!finalLvl) {
        const correctCount = this.log.filter(e => e.score && e.score >= 0.5).length;
        if (correctCount === 0) {
          finalLvl = 'A0';
          finalPlus = false;
        } else {
          finalLvl = LEVELS[this.levelIdx] || 'A1';
          finalPlus = this.correctStreak > 0;
        }
      }

      return {
        level: finalLvl + (finalPlus ? '+' : ''),
        rawLevel: finalLvl,
        plus: finalPlus,
        count: this.scoredCount,
        total: this.totalCount,
        retries: this.retries,
        uncertain: this.uncertainCount,
        log: this.log,
        levelHistory: this.levelHistory,
        reason: this.reason || `Calculated ${finalLvl}`
      };
    }
  }

  return {
    LEVELS,
    LEVEL_COLOR,
    PART_META,
    ITEM_BANKS,
    AdaptiveEngine,
  };
})();
