/**
 * 商品取图规则匹配引擎 v1.5
 *
 * 独立的纯逻辑模块，不依赖 DOM / 浏览器环境
 * - 浏览器：<script src="goods_pic_matcher.js"></script>  → 挂载到 window.GoodsPicMatcher
 * - Node.js：const { matchPictures } = require('./goods_pic_matcher.js');
 *
 * 前端页面 goods_pic_matcher.html 引入此文件进行可视化验证，
 * 修改匹配规则时只需改这一个文件。
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GoodsPicMatcher = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  var VERSION = 'v1.5';

  var MODEL_PATTERN = /[A-Z]{2,}\d+([A-Z]*\d+)*[A-Z]*-[A-Z\d]+/gi;

  function extractModels(text) {
    var matches = text.match(MODEL_PATTERN);
    if (!matches) return [];
    return Array.from(new Set(matches));
  }

  function normalizeModels(models) {
    return models.map(function (m) { return m.toUpperCase(); }).sort();
  }

  function keywordMatch(text, keywords) {
    if (!keywords || !keywords.trim()) return 0;
    var kwList = keywords.split(/[,，、\s]+/).filter(function (k) { return k.trim(); });
    var score = 0;
    for (var i = 0; i < kwList.length; i++) {
      if (text.toLowerCase().indexOf(kwList[i].toLowerCase()) !== -1) {
        score++;
      }
    }
    return score;
  }

  /**
   * @param {Object} params  取图参数 JSON
   * @param {string[]} imageNames  图片名称列表
   * @returns {{ result: string, steps: Array }}
   */
  function matchPictures(params, imageNames) {
    var steps = [];
    var candidates = imageNames.slice();
    var totalImages = candidates.length;

    // Step 1: 图片类型校验
    var picType = (params['图片类型'] || '').trim();
    if (picType) {
      steps.push({
        step: '第1步：图片类型过滤',
        detail: '要求图片类型 = "' + picType + '"',
        beforeCount: candidates.length,
        note: '当前规则版本中，图片类型仅作记录，不直接用于图片名称过滤（图片类型通常不在图片名称中体现）。如需基于图片类型的过滤逻辑，请在规则优化中补充。'
      });
    } else {
      steps.push({
        step: '第1步：图片类型过滤',
        detail: '未指定图片类型，跳过此步骤',
        beforeCount: candidates.length,
        note: ''
      });
    }

    // Step 2: 型号完全对应过滤
    var inputModel = (params['型号'] || '').trim();
    var inputModels = [];
    if (inputModel) {
      var parts = inputModel.split(/[,，、\s]+/);
      for (var i = 0; i < parts.length; i++) {
        var m = parts[i].trim();
        if (m) inputModels.push(m);
      }
    }
    var inputModelsNorm = normalizeModels(inputModels);

    var modelResults = [];
    if (inputModelsNorm.length > 0) {
      for (var j = 0; j < candidates.length; j++) {
        var name = candidates[j];
        var imgModels = extractModels(name);
        var imgModelsNorm = normalizeModels(imgModels);

        var missingModels = inputModelsNorm.filter(function (m) { return imgModelsNorm.indexOf(m) === -1; });
        var extraModels = imgModelsNorm.filter(function (m) { return inputModelsNorm.indexOf(m) === -1; });
        var isExactMatch = missingModels.length === 0 && extraModels.length === 0;

        modelResults.push({
          name: name,
          imgModels: imgModelsNorm,
          missingModels: missingModels,
          extraModels: extraModels,
          isMatch: isExactMatch
        });
      }

      var matchedByModel = modelResults.filter(function (r) { return r.isMatch; }).map(function (r) { return r.name; });
      candidates = matchedByModel;

      steps.push({
        step: '第2步：型号完全对应过滤',
        detail: '入参型号：' + (inputModelsNorm.length > 0 ? inputModelsNorm.join('、') : '无') +
          '<br>完全对应规则：图片名称中的型号必须与入参型号完全一致（不多不少）',
        beforeCount: totalImages,
        afterCount: candidates.length,
        modelResults: modelResults
      });
    } else {
      steps.push({
        step: '第2步：型号完全对应过滤',
        detail: '未指定型号，跳过此步骤',
        beforeCount: candidates.length,
        modelResults: []
      });
    }

    // Step 3: 关键词匹配打分
    var color = (params['颜色'] || '').trim();
    var func = (params['功能'] || '').trim();
    var spec = (params['规格'] || '').trim();

    var finalImage = null;
    var scoringResults = [];

    if (candidates.length > 0 && (color || func || spec)) {
      var maxScore = -1;
      for (var k = 0; k < candidates.length; k++) {
        var cName = candidates[k];
        var score = 0;
        var matchedKeywords = [];
        if (color) {
          var s = keywordMatch(cName, color);
          if (s > 0) matchedKeywords.push('颜色:' + color + '(' + s + '分)');
          score += s;
        }
        if (func) {
          var s2 = keywordMatch(cName, func);
          if (s2 > 0) matchedKeywords.push('功能:' + func + '(' + s2 + '分)');
          score += s2;
        }
        if (spec) {
          var s3 = keywordMatch(cName, spec);
          if (s3 > 0) matchedKeywords.push('规格:' + spec + '(' + s3 + '分)');
          score += s3;
        }
        scoringResults.push({ name: cName, score: score, matchedKeywords: matchedKeywords });
        if (score > maxScore) {
          maxScore = score;
          finalImage = cName;
        }
      }

      var dl = [];
      if (color) dl.push('颜色关键词：' + color);
      if (func) dl.push('功能关键词：' + func);
      if (spec) dl.push('规格关键词：' + spec);
      dl.push('计分规则：每匹配中1个关键词得1分，取最高分图片');

      steps.push({
        step: '第3步：颜色/功能/规格关键词匹配打分',
        detail: dl.join('<br>'),
        beforeCount: candidates.length,
        scoringResults: scoringResults,
        maxScore: maxScore
      });
    } else if (candidates.length === 0) {
      steps.push({
        step: '第3步：颜色/功能/规格关键词匹配打分',
        detail: '无候选图片进入此步骤',
        beforeCount: 0,
        scoringResults: []
      });
      finalImage = null;
    } else if (candidates.length === 1) {
      finalImage = candidates[0];
      steps.push({
        step: '第3步：颜色/功能/规格关键词匹配打分',
        detail: '仅剩1张候选图片，无需打分，直接返回',
        beforeCount: 1,
        scoringResults: [{ name: candidates[0], score: '-', matchedKeywords: ['唯一候选'] }]
      });
    } else {
      finalImage = candidates[candidates.length - 1];
      steps.push({
        step: '第3步：颜色/功能/规格关键词匹配打分',
        detail: '未指定颜色/功能/规格关键词，返回最后一张候选图片',
        beforeCount: candidates.length,
        scoringResults: candidates.map(function (n) { return { name: n, score: '-', matchedKeywords: ['未打分'] }; })
      });
    }

    // Step 4: 结果判定
    if (!finalImage) {
      finalImage = '无';
    }

    steps.push({
      step: '第4步：最终结果',
      detail: finalImage === '无' ? '未匹配到符合规则的图片，返回"无"' : '匹配成功，返回最佳图片名称',
      finalImage: finalImage
    });

    return { result: finalImage, steps: steps };
  }

  return {
    VERSION: VERSION,
    extractModels: extractModels,
    normalizeModels: normalizeModels,
    keywordMatch: keywordMatch,
    matchPictures: matchPictures
  };

}));
