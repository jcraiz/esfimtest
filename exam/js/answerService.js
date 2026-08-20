/**
 * ESFIM Exam Generator — Secure Answer Service (Shared)
 */
const ESFIMAnswerService = (() => {

  let _mode = 'local'; // 'local' | 'external'
  let _config = {};
  let _exam = null;
  let _answerCache = {}; // { [questionId]: { correct, pairs, type } }
  let _isReady = false;
  let _lastError = null;

  async function initialize(mode = 'local', config = {}, exam = null) {
    _mode = mode === 'external' ? 'external' : 'local';
    _config = config || {};
    _exam = exam || (typeof window !== 'undefined' ? window.__ESFIM_EXAM__ : null);
    _answerCache = {};
    _isReady = false;
    _lastError = null;

    if (_mode === 'local') {
      _loadLocalAnswers();
      _isReady = true;
      console.log('[AnswerService] Initialized in Mode A (Local). Answers loaded from exam structure.');
      return { success: true, mode: 'local', count: Object.keys(_answerCache).length };
    } else {
      console.log('[AnswerService] Initializing in Mode B (External - Secure). Fetching answers from remote endpoint...');
      try {
        const res = await fetchExternalAnswers();
        _isReady = true;
        return { success: true, mode: 'external', count: Object.keys(_answerCache).length };
      } catch (err) {
        _lastError = err.message || 'Failed to fetch external answer key';
        console.warn('[AnswerService] External answer fetch failed:', err);
        if (_config.fallbackToLocal && _exam) {
          console.warn('[AnswerService] Fallback to local mode triggered.');
          _mode = 'local';
          _loadLocalAnswers();
          _isReady = true;
          return { success: true, mode: 'local_fallback', count: Object.keys(_answerCache).length, warning: _lastError };
        }
        return { success: false, mode: 'external', error: _lastError };
      }
    }
  }

  function _loadLocalAnswers() {
    if (!_exam) return;
    _answerCache = {};

    if (_exam.vocabulary && Array.isArray(_exam.vocabulary.questions)) {
      _exam.vocabulary.questions.forEach(q => _storeLocalQ(q, 'Vocabulary'));
    }
    if (_exam.grammar && Array.isArray(_exam.grammar.questions)) {
      _exam.grammar.questions.forEach(q => _storeLocalQ(q, 'Grammar'));
    }
    if (Array.isArray(_exam.readingBanks)) {
      _exam.readingBanks.forEach((bank, bIdx) => {
        (bank.items || []).forEach(item => {
          (item.questions || []).forEach(q => _storeLocalQ(q, `Reading Bank ${bank.bankNumber || (bIdx + 1)}`));
        });
      });
    }
    if (Array.isArray(_exam.listeningBanks)) {
      _exam.listeningBanks.forEach((bank, bIdx) => {
        (bank.items || []).forEach(item => {
          (item.questions || []).forEach(q => _storeLocalQ(q, `Listening Bank ${bank.bankNumber || (bIdx + 1)}`));
        });
      });
    }
  }

  function _storeLocalQ(q, sectionName) {
    if (!q || !q.id) return;
    _answerCache[q.id] = {
      id: q.id,
      section: sectionName,
      type: q.type,
      correct: q.correct !== undefined ? q.correct : null,
      pairs: q.pairs ? JSON.parse(JSON.stringify(q.pairs)) : null,
      text: q.text || '',
    };
  }

  async function fetchExternalAnswers() {
    const endpoint = (_config.apiEndpoint && _config.apiEndpoint.trim()) ||
                     (_config.webhookUrl && _config.webhookUrl.trim()) ||
                     (_exam && _exam.externalAnswerConfig && _exam.externalAnswerConfig.apiEndpoint) ||
                     (_exam && _exam.webhookUrl && _exam.webhookUrl.trim());

    if (!endpoint) {
      throw new Error('No external API endpoint or Webhook URL configured for Answer Service.');
    }

    const payload = {
      action: 'get_answers',
      examId: _exam ? _exam.id : '',
      sheetId: _config.sheetId || (_exam && _exam.externalAnswerConfig ? _exam.externalAnswerConfig.sheetId : ''),
      sheetName: _config.sheetName || (_exam && _exam.externalAnswerConfig ? _exam.externalAnswerConfig.sheetName : 'Answers'),
      range: _config.range || (_exam && _exam.externalAnswerConfig ? _exam.externalAnswerConfig.range : 'Answers!A2:H')
    };

    const data = await _fetchWithJsonpFallback(endpoint, payload);

    if (!data || data.status === 'error') {
      throw new Error(data && data.message ? data.message : 'Server returned invalid answer payload.');
    }

    _answerCache = {};
    const rawList = Array.isArray(data.answers) ? data.answers :
                    (Array.isArray(data.value) ? data.value :
                    (Array.isArray(data) ? data : null));

    if (rawList) {
      rawList.forEach(item => {
        const id = item.questionId || item.id || item.QuestionId || item.QuestionID || item.ID || item.Id || item.q_id;
        if (id) {
          const cleanId = String(id).trim();
          let rawCorrect = item.correct !== undefined ? item.correct : 
                           (item.CorrectAnswer !== undefined ? item.CorrectAnswer : 
                           (item.answer !== undefined ? item.answer : 
                           (item.Respuesta !== undefined ? item.Respuesta : '')));
          let correct = String(rawCorrect !== null && rawCorrect !== undefined ? rawCorrect : '').trim();
          let pairs = item.pairs || null;

          if (correct.startsWith('[') || correct.startsWith('{')) {
            try {
              const parsed = JSON.parse(correct);
              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].left) {
                pairs = parsed;
              }
            } catch (_) {}
          } else if (correct.indexOf('->') !== -1 && (correct.indexOf('|') !== -1 || correct.indexOf('\n') !== -1)) {
            const sep = correct.indexOf('|') !== -1 ? '|' : '\n';
            pairs = correct.split(sep).map(part => {
              const segs = part.split('->');
              return { left: (segs[0] || '').trim(), right: (segs[1] || '').trim() };
            }).filter(p => p.left && p.right);
          }

          _answerCache[cleanId] = {
            id: cleanId,
            section: item.section || item.Section || '',
            type: item.type || item.Type || 'mc',
            correct,
            pairs,
            text: item.text || item.Text || item.QuestionText || '',
          };
        }
      });
    } else if (data.answers && typeof data.answers === 'object') {
      Object.entries(data.answers).forEach(([id, val]) => {
        const cleanId = String(id).trim();
        if (typeof val === 'object' && val !== null) {
          let correct = val.correct !== undefined ? String(val.correct).trim() : '';
          _answerCache[cleanId] = { id: cleanId, ...val, correct };
        } else {
          _answerCache[cleanId] = { id: cleanId, correct: String(val !== undefined && val !== null ? val : '').trim() };
        }
      });
    }

    console.log(`[AnswerService] Successfully fetched ${Object.keys(_answerCache).length} answer entries from external source.`);
    return _answerCache;
  }

  function _fetchWithJsonpFallback(url, payload) {
    return new Promise((resolve, reject) => {
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
        console.warn('[AnswerService] Fetch POST failed (attempting JSONP fallback):', fetchErr);
        try {
          const cbName = '__esfim_ans_' + Math.random().toString(36).substring(2, 9);
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
            reject(new Error('Connection error fetching remote answer key'));
          };

          const sep = url.indexOf('?') === -1 ? '?' : '&';
          script.src = `${url}${sep}action=get_answers&examId=${encodeURIComponent(payload.examId || '')}&sheetId=${encodeURIComponent(payload.sheetId || '')}&sheetName=${encodeURIComponent(payload.sheetName || 'Answers')}&range=${encodeURIComponent(payload.range || 'Answers!A2:H')}&callback=${cbName}`;

          timer = setTimeout(() => {
            if (script.parentNode) script.parentNode.removeChild(script);
            try { delete window[cbName]; } catch (_) {}
            reject(new Error('Answer key retrieval timeout (15s)'));
          }, 15000);

          document.head.appendChild(script);
        } catch (jsonpErr) {
          reject(jsonpErr);
        }
      });
    });
  }

  function getAnswer(questionId, qObj = null) {
    if (!questionId && !qObj) return null;
    const cleanId = String(questionId || '').trim();
    if (cleanId && _answerCache[cleanId]) return _answerCache[cleanId];
    
    // 1. Case-insensitive key lookup fallback
    if (cleanId) {
      const lowerId = cleanId.toLowerCase();
      for (const key of Object.keys(_answerCache)) {
        if (key.toLowerCase() === lowerId) {
          return _answerCache[key];
        }
      }
    }

    // 2. Question text similarity matching fallback
    if (qObj && qObj.text) {
      const targetText = String(qObj.text).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (targetText.length >= 6) {
        for (const entry of Object.values(_answerCache)) {
          if (entry && entry.text) {
            const entryText = String(entry.text).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (entryText && (entryText === targetText || entryText.includes(targetText) || targetText.includes(entryText))) {
              return entry;
            }
          }
        }
      }
    }
    return null;
  }

  function getAllAnswers() {
    return { ..._answerCache };
  }

  function scoreQuestion(q, studentAnswer) {
    if (studentAnswer === null || studentAnswer === undefined || studentAnswer === '') return false;
    
    const entry = getAnswer(q.id, q);
    const correctVal = entry && entry.correct !== undefined ? entry.correct : q.correct;
    const pairsVal = entry && entry.pairs ? entry.pairs : q.pairs;
    const qType = q.type || (entry ? entry.type : 'mc');

    if (correctVal === undefined && !pairsVal) return false;

    switch (qType) {
      case 'mc':
      case 'tf':
        return String(studentAnswer).trim().toLowerCase() === String(correctVal).trim().toLowerCase();

      case 'fb': {
        const a = String(studentAnswer).trim().toLowerCase();
        let accepted = [];
        if (Array.isArray(correctVal)) {
          accepted = correctVal;
        } else if (typeof correctVal === 'string') {
          accepted = correctVal.split(',').map(s => s.trim());
        } else {
          accepted = [correctVal];
        }
        return accepted.some(c => String(c).trim().toLowerCase() === a);
      }

      case 'mr': {
        if (!Array.isArray(studentAnswer)) return false;
        let expected = [];
        if (Array.isArray(correctVal)) {
          expected = correctVal;
        } else if (typeof correctVal === 'string') {
          expected = correctVal.split(',').map(s => s.trim());
        }
        const given = studentAnswer.map(s => String(s).trim().toLowerCase()).sort();
        const expSorted = expected.map(s => String(s).trim().toLowerCase()).sort();
        return given.length === expSorted.length && given.every((v, i) => v === expSorted[i]);
      }

      case 'matching': {
        if (!studentAnswer || typeof studentAnswer !== 'object') return false;
        if (!Array.isArray(pairsVal) || pairsVal.length === 0) return false;
        return pairsVal.every(p => String(studentAnswer[p.left] || '').trim().toLowerCase() === String(p.right || '').trim().toLowerCase());
      }

      default:
        return false;
    }
  }

  function scoreSection(questions, answersMap) {
    if (!questions || questions.length === 0) return { correct: 0, total: 0, pct: 0 };
    let correct = 0;
    for (const q of questions) {
      if (scoreQuestion(q, answersMap[q.id])) correct++;
    }
    const total = questions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, total, pct };
  }

  function computeAllScores(attempt) {
    const vocab = scoreSection(attempt.vocabQuestions, attempt.vocabAnswers || {});
    const grammar = scoreSection(attempt.grammarQuestions, attempt.grammarAnswers || {});
    const reading = scoreSection(attempt.readingQuestions, attempt.readingAnswers || {});
    const listening = scoreSection(attempt.listeningQuestions, attempt.listeningAnswers || {});
    
    const writingScore = Math.round((vocab.pct + grammar.pct) / 2);
    const totalCorrect = vocab.correct + grammar.correct + reading.correct + listening.correct;
    const totalQ = vocab.total + grammar.total + reading.total + listening.total;
    const overall = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
    const passingScore = attempt.passingScore || 70;

    const scoringHelper = (typeof ESFIMScoring !== 'undefined') ? ESFIMScoring : null;
    const cefrForPct = scoringHelper ? scoringHelper.cefrForPct : (pct => ({ key: 'A1', label: 'A1' }));

    return {
      vocab,
      grammar,
      reading,
      listening,
      writingScore,
      writingCefr: cefrForPct(writingScore),
      readingCefr: cefrForPct(reading.pct),
      listeningCefr: cefrForPct(listening.pct),
      overallCefr: cefrForPct(overall),
      overall,
      passed: overall >= passingScore,
    };
  }

  function extractAnswerKeyRows(exam) {
    const targetExam = exam || _exam;
    if (!targetExam) return [];

    const rows = [];

    function formatCorrect(q) {
      if (q.type === 'matching' && Array.isArray(q.pairs)) {
        return q.pairs.map(p => `${p.left} -> ${p.right}`).join(' | ');
      }
      if (Array.isArray(q.correct)) {
        return q.correct.join(', ');
      }
      return q.correct !== undefined && q.correct !== null ? String(q.correct) : '';
    }

    function formatOptions(q) {
      if (q.type === 'matching' && Array.isArray(q.pairs)) {
        return q.pairs.map(p => p.left).join(' | ');
      }
      if (Array.isArray(q.options)) {
        return q.options.join(' | ');
      }
      return '';
    }

    if (targetExam.vocabulary && Array.isArray(targetExam.vocabulary.questions)) {
      targetExam.vocabulary.questions.forEach((q, idx) => {
        rows.push({
          questionId: q.id || `vocab_${idx + 1}`,
          section: 'Vocabulary',
          bankItem: 'Vocabulary Bank',
          questionNumber: idx + 1,
          type: q.type || 'mc',
          text: q.text || '',
          options: formatOptions(q),
          correctAnswer: formatCorrect(q),
        });
      });
    }

    if (targetExam.grammar && Array.isArray(targetExam.grammar.questions)) {
      targetExam.grammar.questions.forEach((q, idx) => {
        rows.push({
          questionId: q.id || `grammar_${idx + 1}`,
          section: 'Grammar',
          bankItem: 'Grammar Bank',
          questionNumber: idx + 1,
          type: q.type || 'mc',
          text: q.text || '',
          options: formatOptions(q),
          correctAnswer: formatCorrect(q),
        });
      });
    }

    if (Array.isArray(targetExam.readingBanks)) {
      targetExam.readingBanks.forEach((bank, bIdx) => {
        const bankTitle = bank.name || `Reading Bank ${bank.bankNumber || (bIdx + 1)}`;
        (bank.items || []).forEach((item, iIdx) => {
          const itemTitle = item.title || `Passage ${iIdx + 1}`;
          (item.questions || []).forEach((q, qIdx) => {
            rows.push({
              questionId: q.id || `reading_${bIdx + 1}_${iIdx + 1}_${qIdx + 1}`,
              section: 'Reading',
              bankItem: `${bankTitle} — ${itemTitle}`,
              questionNumber: qIdx + 1,
              type: q.type || 'mc',
              text: q.text || '',
              options: formatOptions(q),
              correctAnswer: formatCorrect(q),
            });
          });
        });
      });
    }

    if (Array.isArray(targetExam.listeningBanks)) {
      targetExam.listeningBanks.forEach((bank, bIdx) => {
        const bankTitle = bank.name || `Listening Bank ${bank.bankNumber || (bIdx + 1)}`;
        (bank.items || []).forEach((item, iIdx) => {
          const itemTitle = item.audioFilename || `Audio ${iIdx + 1}`;
          (item.questions || []).forEach((q, qIdx) => {
            rows.push({
              questionId: q.id || `listening_${bIdx + 1}_${iIdx + 1}_${qIdx + 1}`,
              section: 'Listening',
              bankItem: `${bankTitle} — ${itemTitle}`,
              questionNumber: qIdx + 1,
              type: q.type || 'mc',
              text: q.text || '',
              options: formatOptions(q),
              correctAnswer: formatCorrect(q),
            });
          });
        });
      });
    }

    return rows;
  }

  function downloadAnswerKey(exam, format = 'csv') {
    const targetExam = exam || _exam;
    if (!targetExam) {
      alert('No exam loaded to export answer key.');
      return;
    }

    const rows = extractAnswerKeyRows(targetExam);
    if (rows.length === 0) {
      alert('No questions found in exam to export.');
      return;
    }

    const testId = (targetExam.id || 'exam').replace(/[^a-z0-9]/gi, '_').substring(0, 16);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    if (format === 'csv') {
      const headers = ['Question ID', 'Section', 'Bank / Passage', 'Q#', 'Type', 'Question Text', 'Options / Distractors', 'Correct Answer'];
      const csvLines = [
        headers.join(','),
        ...rows.map(r => [
          `"${String(r.questionId).replace(/"/g, '""')}"`,
          `"${String(r.section).replace(/"/g, '""')}"`,
          `"${String(r.bankItem).replace(/"/g, '""')}"`,
          r.questionNumber,
          `"${String(r.type).replace(/"/g, '""')}"`,
          `"${String(r.text).replace(/"/g, '""')}"`,
          `"${String(r.options).replace(/"/g, '""')}"`,
          `"${String(r.correctAnswer).replace(/"/g, '""')}"`,
        ].join(','))
      ];

      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const filename = `answer_key_${testId}_${timestamp}.csv`;

      if (typeof saveAs !== 'undefined') {
        saveAs(blob, filename);
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } else {
      const xml = _buildExcelXml(rows, targetExam);
      const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const filename = `answer_key_${testId}_${timestamp}.xls`;

      if (typeof saveAs !== 'undefined') {
        saveAs(blob, filename);
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  }

  function _buildExcelXml(rows, exam) {
    const title = exam.title || 'ESFIM Exam Answer Key';
    const escapeXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    let tableXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B0C0D4"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1B4F8A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Color="#1B4F8A" ss:Bold="1"/>
  </Style>
  <Style ss:ID="CorrectStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#064E3B" ss:Bold="1"/>
   <Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Answers">
  <Table ss:DefaultRowHeight="20">
   <Column ss:Width="160"/>
   <Column ss:Width="90"/>
   <Column ss:Width="150"/>
   <Column ss:Width="40"/>
   <Column ss:Width="60"/>
   <Column ss:Width="260"/>
   <Column ss:Width="180"/>
   <Column ss:Width="180"/>
   <Row ss:Height="26">
    <Cell ss:MergeAcross="7" ss:StyleID="TitleStyle"><Data ss:Type="String">${escapeXml(title)} — Secure Answer Key</Data></Cell>
   </Row>
   <Row ss:Height="24">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Question ID</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Section</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Bank / Passage</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Q#</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Type</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Question Text</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Options / Distractors</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Correct Answer</Data></Cell>
   </Row>`;

    rows.forEach(r => {
      tableXml += `
   <Row>
    <Cell><Data ss:Type="String">${escapeXml(r.questionId)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.section)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.bankItem)}</Data></Cell>
    <Cell><Data ss:Type="Number">${r.questionNumber}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.type)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.text)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(r.options)}</Data></Cell>
    <Cell ss:StyleID="CorrectStyle"><Data ss:Type="String">${escapeXml(r.correctAnswer)}</Data></Cell>
   </Row>`;
    });

    tableXml += `
  </Table>
 </Worksheet>
</Workbook>`;
    return tableXml;
  }

  function sanitizeExamForClient(exam) {
    if (!exam) return exam;
    const sanitized = JSON.parse(JSON.stringify(exam));

    function sanitizeQuestion(q) {
      if (!q) return;
      delete q.correct;
      if (q.type === 'matching' && Array.isArray(q.pairs)) {
        const pairsClone = JSON.parse(JSON.stringify(q.pairs));
        const rightChoices = pairsClone.map(p => String(p.right || '').trim()).filter(Boolean);
        let shuffled = rightChoices.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const hasDistinct = new Set(rightChoices).size > 1;
        let attempts = 0;
        while (hasDistinct && attempts < 10 && shuffled.every((v, i) => v === rightChoices[i])) {
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          attempts++;
        }
        if (hasDistinct && shuffled.every((v, i) => v === rightChoices[i])) {
          shuffled = [...rightChoices.slice(1), rightChoices[0]];
        }
        q.shuffledRightChoices = shuffled;
        q.shuffledRight = shuffled;
        q.rightChoices = shuffled;
        q.pairs = pairsClone.map(p => ({ left: p.left, right: '' }));
      }
    }

    if (sanitized.vocabulary && Array.isArray(sanitized.vocabulary.questions)) {
      sanitized.vocabulary.questions.forEach(sanitizeQuestion);
    }
    if (sanitized.grammar && Array.isArray(sanitized.grammar.questions)) {
      sanitized.grammar.questions.forEach(sanitizeQuestion);
    }
    if (Array.isArray(sanitized.readingBanks)) {
      sanitized.readingBanks.forEach(bank => {
        (bank.items || []).forEach(item => {
          (item.questions || []).forEach(sanitizeQuestion);
        });
      });
    }
    if (Array.isArray(sanitized.listeningBanks)) {
      sanitized.listeningBanks.forEach(bank => {
        (bank.items || []).forEach(item => {
          (item.questions || []).forEach(sanitizeQuestion);
        });
      });
    }

    return sanitized;
  }

  async function publishAnswerKey(exam, endpoint, sheetName = 'Answers') {
    const targetExam = exam || _exam;
    if (!targetExam) return { success: false, error: 'No exam provided' };
    const url = endpoint || (targetExam.externalAnswerConfig && targetExam.externalAnswerConfig.apiEndpoint) || targetExam.webhookUrl;
    if (!url) return { success: false, error: 'No Webhook URL or API Endpoint configured' };

    const rows = extractAnswerKeyRows(targetExam);
    if (rows.length === 0) return { success: false, error: 'No questions found in exam to publish' };

    const answersPayload = rows.map(r => ({
      id: r.questionId,
      section: r.section,
      bank: r.bankItem,
      qNum: r.questionNumber,
      type: r.type,
      text: r.text,
      options: r.options,
      correctAnswer: r.correctAnswer
    }));

    const payload = {
      action: 'publish_answers',
      sheetName: sheetName || 'Answers',
      examId: targetExam.id || '',
      examTitle: targetExam.title || '',
      answers: answersPayload
    };

    try {
      // First attempt: standard CORS POST (works when served over HTTP/HTTPS)
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        return { success: true, count: rows.length, data };
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (fetchErr) {
      console.warn('[AnswerService] Standard POST failed, attempting no-cors fallback:', fetchErr);

      // ⚠️ JSONP (GET) cannot carry the answers array payload — do NOT use it for publish.
      // Instead, attempt a no-cors POST (fire-and-forget). GAS accepts cross-origin POSTs
      // but the browser won't expose the response body in no-cors mode.
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        // no-cors response is always opaque — we assume success if no network error thrown
        console.log('[AnswerService] no-cors POST dispatched. Response is opaque (GAS should have received the payload).');
        return {
          success: true,
          count: rows.length,
          warning: 'Response not readable (no-cors mode). Verify the Answers tab in your Google Sheet to confirm data was received.',
          data: { status: 'dispatched_no_cors' }
        };
      } catch (noCorsErr) {
        console.error('[AnswerService] no-cors POST also failed:', noCorsErr);
        return {
          success: false,
          error: 'Could not reach the Google Apps Script endpoint. ' +
                 'Make sure the Web App is deployed with "Anyone" access and the URL is correct. ' +
                 'Note: publishing requires the exam to be served over HTTP/HTTPS (not file://). ' +
                 'Original error: ' + fetchErr.message
        };
      }
    }
  }

  return {
    initialize,
    fetchExternalAnswers,
    getAnswer,
    getAllAnswers,
    scoreQuestion,
    scoreSection,
    computeAllScores,
    extractAnswerKeyRows,
    downloadAnswerKey,
    publishAnswerKey,
    sanitizeExamForClient,
    getMode: () => _mode,
    isReady: () => _isReady,
    getLastError: () => _lastError,
  };

})();

if (typeof window !== 'undefined') window.ESFIMAnswerService = ESFIMAnswerService;
if (typeof module !== 'undefined') module.exports = ESFIMAnswerService;

