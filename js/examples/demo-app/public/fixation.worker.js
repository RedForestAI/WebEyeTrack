"use strict";
(() => {
  // node_modules/simple-statistics/dist/simple-statistics.mjs
  function sum(x) {
    if (x.length === 0) {
      return 0;
    }
    var sum2 = x[0];
    var correction = 0;
    var transition;
    if (typeof sum2 !== "number") {
      return Number.NaN;
    }
    for (var i = 1; i < x.length; i++) {
      if (typeof x[i] !== "number") {
        return Number.NaN;
      }
      transition = sum2 + x[i];
      if (Math.abs(sum2) >= Math.abs(x[i])) {
        correction += sum2 - transition + x[i];
      } else {
        correction += x[i] - transition + sum2;
      }
      sum2 = transition;
    }
    return sum2 + correction;
  }
  function mean(x) {
    if (x.length === 0) {
      throw new Error("mean requires at least one data point");
    }
    return sum(x) / x.length;
  }
  function quantileSorted(x, p) {
    var idx = x.length * p;
    if (x.length === 0) {
      throw new Error("quantile requires at least one data point.");
    } else if (p < 0 || p > 1) {
      throw new Error("quantiles must be between 0 and 1");
    } else if (p === 1) {
      return x[x.length - 1];
    } else if (p === 0) {
      return x[0];
    } else if (idx % 1 !== 0) {
      return x[Math.ceil(idx) - 1];
    } else if (x.length % 2 === 0) {
      return (x[idx - 1] + x[idx]) / 2;
    } else {
      return x[idx];
    }
  }
  function quickselect(arr, k, left, right) {
    left = left || 0;
    right = right || arr.length - 1;
    while (right > left) {
      if (right - left > 600) {
        var n = right - left + 1;
        var m = k - left + 1;
        var z = Math.log(n);
        var s = 0.5 * Math.exp(2 * z / 3);
        var sd = 0.5 * Math.sqrt(z * s * (n - s) / n);
        if (m - n / 2 < 0) {
          sd *= -1;
        }
        var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
        var newRight = Math.min(
          right,
          Math.floor(k + (n - m) * s / n + sd)
        );
        quickselect(arr, k, newLeft, newRight);
      }
      var t = arr[k];
      var i = left;
      var j = right;
      swap(arr, left, k);
      if (arr[right] > t) {
        swap(arr, left, right);
      }
      while (i < j) {
        swap(arr, i, j);
        i++;
        j--;
        while (arr[i] < t) {
          i++;
        }
        while (arr[j] > t) {
          j--;
        }
      }
      if (arr[left] === t) {
        swap(arr, left, j);
      } else {
        j++;
        swap(arr, j, right);
      }
      if (j <= k) {
        left = j + 1;
      }
      if (k <= j) {
        right = j - 1;
      }
    }
  }
  function swap(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  function quantile(x, p) {
    var copy = x.slice();
    if (Array.isArray(p)) {
      multiQuantileSelect(copy, p);
      var results = [];
      for (var i = 0; i < p.length; i++) {
        results[i] = quantileSorted(copy, p[i]);
      }
      return results;
    } else {
      var idx = quantileIndex(copy.length, p);
      quantileSelect(copy, idx, 0, copy.length - 1);
      return quantileSorted(copy, p);
    }
  }
  function quantileSelect(arr, k, left, right) {
    if (k % 1 === 0) {
      quickselect(arr, k, left, right);
    } else {
      k = Math.floor(k);
      quickselect(arr, k, left, right);
      quickselect(arr, k + 1, k + 1, right);
    }
  }
  function multiQuantileSelect(arr, p) {
    var indices = [0];
    for (var i = 0; i < p.length; i++) {
      indices.push(quantileIndex(arr.length, p[i]));
    }
    indices.push(arr.length - 1);
    indices.sort(compare);
    var stack = [0, indices.length - 1];
    while (stack.length) {
      var r = Math.ceil(stack.pop());
      var l = Math.floor(stack.pop());
      if (r - l <= 1) {
        continue;
      }
      var m = Math.floor((l + r) / 2);
      quantileSelect(
        arr,
        indices[m],
        Math.floor(indices[l]),
        Math.ceil(indices[r])
      );
      stack.push(l, m, m, r);
    }
  }
  function compare(a, b) {
    return a - b;
  }
  function quantileIndex(len, p) {
    var idx = len * p;
    if (p === 1) {
      return len - 1;
    } else if (p === 0) {
      return 0;
    } else if (idx % 1 !== 0) {
      return Math.ceil(idx) - 1;
    } else if (len % 2 === 0) {
      return idx - 0.5;
    } else {
      return idx;
    }
  }
  function median(x) {
    return +quantile(x, 0.5);
  }
  var BayesianClassifier = function BayesianClassifier2() {
    this.totalCount = 0;
    this.data = {};
  };
  BayesianClassifier.prototype.train = function train(item, category) {
    if (!this.data[category]) {
      this.data[category] = {};
    }
    for (var k in item) {
      var v = item[k];
      if (this.data[category][k] === void 0) {
        this.data[category][k] = {};
      }
      if (this.data[category][k][v] === void 0) {
        this.data[category][k][v] = 0;
      }
      this.data[category][k][v]++;
    }
    this.totalCount++;
  };
  BayesianClassifier.prototype.score = function score(item) {
    var odds = {};
    var category;
    for (var k in item) {
      var v = item[k];
      for (category in this.data) {
        odds[category] = {};
        if (this.data[category][k]) {
          odds[category][k + "_" + v] = (this.data[category][k][v] || 0) / this.totalCount;
        } else {
          odds[category][k + "_" + v] = 0;
        }
      }
    }
    var oddsSums = {};
    for (category in odds) {
      oddsSums[category] = 0;
      for (var combination in odds[category]) {
        oddsSums[category] += odds[category][combination];
      }
    }
    return oddsSums;
  };
  var PerceptronModel = function PerceptronModel2() {
    this.weights = [];
    this.bias = 0;
  };
  PerceptronModel.prototype.predict = function predict(features) {
    if (features.length !== this.weights.length) {
      return null;
    }
    var score2 = 0;
    for (var i = 0; i < this.weights.length; i++) {
      score2 += this.weights[i] * features[i];
    }
    score2 += this.bias;
    if (score2 > 0) {
      return 1;
    } else {
      return 0;
    }
  };
  PerceptronModel.prototype.train = function train2(features, label) {
    if (label !== 0 && label !== 1) {
      return null;
    }
    if (features.length !== this.weights.length) {
      this.weights = features;
      this.bias = 1;
    }
    var prediction = this.predict(features);
    if (typeof prediction === "number" && prediction !== label) {
      var gradient = label - prediction;
      for (var i = 0; i < this.weights.length; i++) {
        this.weights[i] += gradient * features[i];
      }
      this.bias += gradient;
    }
    return this;
  };
  var g = 607 / 128;
  var LOGSQRT2PI = Math.log(Math.sqrt(2 * Math.PI));
  var SQRT_2PI$1 = Math.sqrt(2 * Math.PI);
  var SQRT_2PI = Math.sqrt(2 * Math.PI);
  function cumulativeDistribution(z) {
    var sum2 = z;
    var tmp = z;
    for (var i = 1; i < 15; i++) {
      tmp *= z * z / (2 * i + 1);
      sum2 += tmp;
    }
    return Math.round((0.5 + sum2 / SQRT_2PI * Math.exp(-z * z / 2)) * 1e4) / 1e4;
  }
  var standardNormalTable = [];
  for (z = 0; z <= 3.09; z += 0.01) {
    standardNormalTable.push(cumulativeDistribution(z));
  }
  var z;

  // node_modules/ml-xsadd/lib-es6/xsadd.js
  var FLOAT_MUL = 1 / 16777216;

  // node_modules/kollar-ts/dist/index.mjs
  function euclideanDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function mean2(values, naRm = false) {
    const filtered = naRm ? filterNA(values) : values;
    if (filtered.length === 0) return NaN;
    return mean(filtered);
  }
  function median2(values, naRm = false) {
    const filtered = naRm ? filterNA(values) : values;
    if (filtered.length === 0) return NaN;
    return median(filtered);
  }
  function mad(values, naRm = false) {
    const filtered = naRm ? filterNA(values) : values;
    if (filtered.length === 0) return NaN;
    const med = median(filtered);
    const deviations = filtered.map((v) => Math.abs(v - med));
    return median(deviations);
  }
  function filterNA(values) {
    return values.filter(
      (v) => v !== null && v !== void 0 && !Number.isNaN(v)
    );
  }
  function isNA(value) {
    return value === null || value === void 0 || Number.isNaN(value);
  }
  function rle(data) {
    if (data.length === 0) {
      return { lengths: [], values: [] };
    }
    const lengths = [];
    const values = [];
    let currentValue = data[0];
    let currentLength = 1;
    for (let i = 1; i < data.length; i++) {
      const value = data[i];
      const isEqual = value === currentValue || Number.isNaN(value) && Number.isNaN(currentValue);
      if (isEqual) {
        currentLength++;
      } else {
        lengths.push(currentLength);
        values.push(currentValue);
        currentValue = value;
        currentLength = 1;
      }
    }
    lengths.push(currentLength);
    values.push(currentValue);
    return { lengths, values };
  }
  function rollapply(data, k, fn, options = {}) {
    const { align = "center", naPad = false, partial = true } = options;
    if (k < 1) {
      throw new Error("Window size k must be >= 1");
    }
    if (k > data.length) {
      if (naPad) {
        return new Array(data.length).fill(null);
      }
      throw new Error("Window size k cannot exceed data length");
    }
    const result = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      let start, end;
      switch (align) {
        case "left":
          start = i;
          end = i + k - 1;
          break;
        case "right":
          start = i - k + 1;
          end = i;
          break;
        case "center":
        default:
          const halfWindow = Math.floor(k / 2);
          start = i - halfWindow;
          end = i + halfWindow;
          if (k % 2 === 0) {
            end = start + k - 1;
          }
          break;
      }
      const outOfBounds = start < 0 || end >= data.length;
      if (outOfBounds) {
        if (naPad) {
          result[i] = null;
          continue;
        } else if (partial) {
          start = Math.max(0, start);
          end = Math.min(data.length - 1, end);
        } else {
          result[i] = null;
          continue;
        }
      }
      const window = [];
      for (let j = start; j <= end; j++) {
        const value = data[j];
        if (value !== null && value !== void 0 && !Number.isNaN(value)) {
          window.push(value);
        }
      }
      if (window.length === 0) {
        result[i] = null;
      } else {
        result[i] = fn(window);
      }
    }
    return result;
  }
  function rollmedian(data, k, align = "center", naPad = true, partial = false) {
    return rollapply(data, k, median2, { align, naPad, partial });
  }
  function movmeanFilter(data, k = 3) {
    return rollapply(data, k, mean2, {
      align: "center",
      naPad: false,
      partial: true
    });
  }
  function validateOneDegree(gazeData, oneDegree, xcol = "x") {
    const xValues = gazeData.map((d) => d[xcol]).filter((x) => x != null && !Number.isNaN(x));
    if (xValues.length === 0) {
      console.warn("No valid x coordinates found in gaze data");
      return;
    }
    const maxX = Math.max(...xValues);
    if (maxX < oneDegree) {
      console.warn(
        `Warning: oneDegree (${oneDegree}) is larger than max x coordinate (${maxX}). Make sure gaze coordinates are in the same scale as oneDegree parameter!`
      );
    }
  }
  function interpolateWithMargin(data, margin, maxGap) {
    const result = data.map((v) => v === void 0 ? null : v);
    const gaps = findGaps(data, maxGap);
    for (const gap of gaps) {
      const { start, stop } = gap;
      const hasMarginBefore = start - margin >= 0;
      const hasMarginAfter = stop + margin < data.length;
      if (!hasMarginBefore || !hasMarginAfter) {
        continue;
      }
      const beforeSamples = [];
      for (let i = start - margin; i < start; i++) {
        const value = data[i];
        if (value != null && !Number.isNaN(value)) {
          beforeSamples.push(value);
        }
      }
      const afterSamples = [];
      for (let i = stop + 1; i <= stop + margin; i++) {
        const value = data[i];
        if (value != null && !Number.isNaN(value)) {
          afterSamples.push(value);
        }
      }
      if (beforeSamples.length === 0 || afterSamples.length === 0) {
        continue;
      }
      const interpolBefore = median2(beforeSamples, false);
      const interpolAfter = median2(afterSamples, false);
      if (Number.isNaN(interpolBefore) || Number.isNaN(interpolAfter)) {
        continue;
      }
      const fillValue = (interpolBefore + interpolAfter) / 2;
      for (let i = start; i <= stop; i++) {
        result[i] = fillValue;
      }
    }
    return result;
  }
  function findGaps(data, maxGap) {
    const isNA2 = data.map(
      (v) => v === null || v === void 0 || Number.isNaN(v)
    );
    const encoded = rle(isNA2);
    const gaps = [];
    let currentIndex = 0;
    for (let i = 0; i < encoded.lengths.length; i++) {
      const length = encoded.lengths[i];
      const value = encoded.values[i];
      if (value && length <= maxGap) {
        gaps.push({
          start: currentIndex,
          stop: currentIndex + length - 1,
          length
        });
      }
      currentIndex += length;
    }
    return gaps;
  }
  var DEFAULT_PREPROCESS_PARAMS = {
    maxGapMs: 75,
    marginMs: 5,
    filterMs: 15,
    xcol: "x",
    ycol: "y",
    naIgnore: true
  };
  function preprocessGaze(gazeRaw, params = {}) {
    const {
      maxGapMs,
      marginMs,
      filterMs,
      xcol,
      ycol,
      naIgnore
    } = { ...DEFAULT_PREPROCESS_PARAMS, ...params };
    if (gazeRaw.length === 0) {
      throw new Error("Gaze data cannot be empty");
    }
    const timestamps = gazeRaw.map((d) => d.timestamp);
    let oneSample;
    if (gazeRaw.length > 500) {
      const firstIntervals = [];
      for (let i = 1; i < Math.min(500, timestamps.length); i++) {
        firstIntervals.push(timestamps[i] - timestamps[i - 1]);
      }
      oneSample = mean2(firstIntervals, true);
    } else {
      const intervals = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }
      oneSample = mean2(intervals, true);
    }
    if (timestamps.some((t) => t < 0)) {
      console.warn("Warning: timestamp column contains negative values. Check data file.");
    }
    if (oneSample < 0.02 || oneSample > 100) {
      console.warn(
        "Unlikely sample-to-sample difference in timestamps. Are timestamps in milliseconds?"
      );
    }
    const maxGap = Math.round(maxGapMs / oneSample);
    const margin = Math.round(marginMs / oneSample);
    const filterWindow = Math.round(filterMs / oneSample);
    const xData = gazeRaw.map((d) => d[xcol] ?? null);
    const yData = gazeRaw.map((d) => d[ycol] ?? null);
    const xInterpolated = interpolateWithMargin(xData, margin, maxGap);
    const yInterpolated = interpolateWithMargin(yData, margin, maxGap);
    let xSmoothed;
    let ySmoothed;
    if (naIgnore) {
      xSmoothed = movmeanFilter(xInterpolated, filterWindow);
      ySmoothed = movmeanFilter(yInterpolated, filterWindow);
    } else {
      xSmoothed = movmeanFilter(xInterpolated, filterWindow);
      ySmoothed = movmeanFilter(yInterpolated, filterWindow);
    }
    const processed = gazeRaw.map((d, i) => {
      const timestampTheoretical = i * oneSample;
      return {
        timestamp: d.timestamp,
        x: xSmoothed[i] ?? NaN,
        y: ySmoothed[i] ?? NaN,
        xUnprocessed: xData[i] ?? NaN,
        yUnprocessed: yData[i] ?? NaN,
        timestampTheoretical,
        sample: i
      };
    });
    return processed;
  }
  function summarizeFixationMetrics(startIndex, endIndex, x, y, timestamps, oneDegree = 40) {
    const xSamples = [];
    const ySamples = [];
    let missingCount = 0;
    for (let i = startIndex; i <= endIndex; i++) {
      const xVal = x[i];
      const yVal = y[i];
      if (isNA(xVal) || isNA(yVal)) {
        missingCount++;
      } else {
        xSamples.push(xVal);
        ySamples.push(yVal);
      }
    }
    const fixationX = mean2(xSamples, false);
    const fixationY = mean2(ySamples, false);
    const distancesFromCenter = [];
    for (let i = 0; i < xSamples.length; i++) {
      const dx = xSamples[i] - fixationX;
      const dy = ySamples[i] - fixationY;
      distancesFromCenter.push(Math.sqrt(dx * dx + dy * dy));
    }
    const rmsFromCenter = distancesFromCenter.length > 0 ? Math.sqrt(
      distancesFromCenter.reduce((sum2, d) => sum2 + d * d, 0) / distancesFromCenter.length
    ) / oneDegree : NaN;
    const sampleToSampleDistances = [];
    for (let i = 1; i < xSamples.length; i++) {
      const dx = xSamples[i] - xSamples[i - 1];
      const dy = ySamples[i] - ySamples[i - 1];
      sampleToSampleDistances.push(Math.sqrt(dx * dx + dy * dy));
    }
    const rmsd = sampleToSampleDistances.length > 0 ? Math.sqrt(
      sampleToSampleDistances.reduce((sum2, d) => sum2 + d * d, 0) / sampleToSampleDistances.length
    ) / oneDegree : NaN;
    const onset = timestamps[startIndex];
    const offset = timestamps[endIndex];
    const duration = offset - onset;
    const totalSamples = endIndex - startIndex + 1;
    const missingSamples = missingCount / totalSamples;
    return {
      x: fixationX,
      y: fixationY,
      onset,
      offset,
      duration,
      rmsd: Number.isNaN(rmsd) ? 0 : rmsd,
      rmsFromCenter: Number.isNaN(rmsFromCenter) ? 0 : rmsFromCenter,
      missingSamples,
      firstLine: startIndex,
      lastLine: endIndex
    };
  }
  function mergeAdjacentFixations(fixations, gazeData, distanceThreshold = 0.5, msThreshold = 75, oneDegree = 40, xcol = "xRaw", ycol = "yRaw") {
    if (fixations.length <= 1) {
      return fixations;
    }
    const result = [...fixations];
    console.log("Merging adjacent fixations");
    let i = 0;
    while (i < result.length - 1) {
      const current = result[i];
      const next = result[i + 1];
      const distance = euclideanDistance(current.x, current.y, next.x, next.y) / oneDegree;
      const timeElapsed = next.onset - current.offset;
      if (distance < distanceThreshold && timeElapsed < msThreshold) {
        const startIndex = current.firstLine;
        const endIndex = next.lastLine;
        const xData = gazeData.map((d) => d[xcol] ?? null);
        const yData = gazeData.map((d) => d[ycol] ?? null);
        const timestamps = gazeData.map((d) => d.timestamp);
        const mergedFixation = summarizeFixationMetrics(
          startIndex,
          endIndex,
          xData,
          yData,
          timestamps,
          oneDegree
        );
        if (current.algorithm) {
          mergedFixation.algorithm = current.algorithm;
        }
        if (current.threshold) {
          mergedFixation.threshold = current.threshold;
        }
        result[i] = mergedFixation;
        result.splice(i + 1, 1);
      } else {
        i++;
      }
    }
    return result;
  }
  function adjustFixationTiming(startIndex, endIndex, x, y, threshold) {
    const xSamples = [];
    const ySamples = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const xVal = x[i];
      const yVal = y[i];
      if (!isNA(xVal) && !isNA(yVal)) {
        xSamples.push(xVal);
        ySamples.push(yVal);
      }
    }
    if (xSamples.length === 0) {
      return { firstLine: startIndex, lastLine: endIndex };
    }
    const fixationX = mean2(xSamples, false);
    const fixationY = mean2(ySamples, false);
    const distancesFromCenter = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const xVal = x[i];
      const yVal = y[i];
      if (isNA(xVal) || isNA(yVal)) {
        distancesFromCenter.push(null);
      } else {
        const dx = xVal - fixationX;
        const dy = yVal - fixationY;
        const dist = (Math.sqrt(dx * dx) + Math.sqrt(dy * dy)) / 2;
        distancesFromCenter.push(dist);
      }
    }
    let newStart = startIndex;
    let newEnd = endIndex;
    if (threshold !== void 0 && !Number.isNaN(threshold)) {
      const validDistances = distancesFromCenter.filter(
        (d) => d !== null
      );
      if (validDistances.length > 0) {
        const medianDist = median2(validDistances, false);
        const madDist = mad(validDistances, false);
        const limitValue = medianDist + threshold * madDist;
        let foundStart = false;
        for (let i = 0; i < distancesFromCenter.length && !foundStart; i++) {
          const dist = distancesFromCenter[i];
          const actualIndex = startIndex + i;
          if (dist !== null && dist <= limitValue) {
            newStart = actualIndex;
            foundStart = true;
          } else if (actualIndex >= endIndex) {
            foundStart = true;
          }
        }
        let foundEnd = false;
        for (let i = distancesFromCenter.length - 1; i >= 0 && !foundEnd; i--) {
          const dist = distancesFromCenter[i];
          const actualIndex = startIndex + i;
          if (dist !== null && dist <= limitValue) {
            newEnd = actualIndex;
            foundEnd = true;
          } else if (actualIndex <= newStart) {
            foundEnd = true;
          }
        }
      }
    } else {
      for (let i = startIndex; i <= endIndex; i++) {
        if (!isNA(x[i]) && !isNA(y[i])) {
          newStart = i;
          break;
        }
      }
      for (let i = endIndex; i >= startIndex; i--) {
        if (!isNA(x[i]) && !isNA(y[i])) {
          newEnd = i;
          break;
        }
      }
    }
    return { firstLine: newStart, lastLine: newEnd };
  }
  function trimFixations(fixations, gazeData, xcol = "xRaw", ycol = "yRaw", threshold = 3, oneDegree = 40) {
    const xData = gazeData.map((d) => d[xcol] ?? null);
    const yData = gazeData.map((d) => d[ycol] ?? null);
    const timestamps = gazeData.map((d) => d.timestamp);
    if (xData.length === 0 || yData.length === 0) {
      console.warn(
        "Warning! No X and/or Y coordinates found in sample level data. Did you misspecify the variable names in xcol and/or ycol?"
      );
      return fixations;
    }
    const trimmedFixations = [];
    for (const fixation of fixations) {
      const adjusted = adjustFixationTiming(
        fixation.firstLine,
        fixation.lastLine,
        xData,
        yData,
        threshold
      );
      const trimmedFixation = summarizeFixationMetrics(
        adjusted.firstLine,
        adjusted.lastLine,
        xData,
        yData,
        timestamps,
        oneDegree
      );
      trimmedFixation.algorithm = fixation.algorithm ?? "unknown";
      trimmedFixation.threshold = fixation.threshold ?? "unknown";
      trimmedFixations.push(trimmedFixation);
    }
    return trimmedFixations;
  }
  var DEFAULT_IDT_PARAMS = {
    dispersionThreshold: 1,
    // degrees
    minDuration: 50,
    // ms
    oneDegree: 40,
    // pixels or screen proportion
    xcol: "x",
    ycol: "y",
    distanceThreshold: 0.7,
    // degrees
    mergeMsThreshold: 75,
    // ms
    missingSamplesThreshold: 0.5
    // proportion [0-1]
  };
  function algorithmIDT(gazeData, params = {}) {
    const {
      dispersionThreshold,
      minDuration,
      oneDegree,
      xcol,
      ycol,
      distanceThreshold,
      mergeMsThreshold,
      missingSamplesThreshold
    } = { ...DEFAULT_IDT_PARAMS, ...params };
    if (gazeData.length < 2) {
      return {
        fixations: [],
        filteredGaze: []
      };
    }
    validateOneDegree(gazeData, oneDegree, xcol);
    const xData = gazeData.map((d) => d[xcol]);
    const yData = gazeData.map((d) => d[ycol]);
    const timestamps = gazeData.map((d) => d.timestamp);
    const fixations = [];
    const filteredGaze = gazeData.map((d) => ({
      timestamp: d.timestamp,
      xRaw: d[xcol],
      yRaw: d[ycol],
      x: null,
      y: null
    }));
    let sampleIndex = 1;
    let fixationCandidate = false;
    let fixationCandidateStart = 0;
    let fixationCandidateX = 0;
    let fixationCandidateY = 0;
    while (sampleIndex < gazeData.length) {
      if (!fixationCandidate) {
        const x1 = xData[sampleIndex - 1];
        const y1 = yData[sampleIndex - 1];
        const x2 = xData[sampleIndex];
        const y2 = yData[sampleIndex];
        if (x1 != null && y1 != null && x2 != null && y2 != null && !Number.isNaN(x1) && !Number.isNaN(y1) && !Number.isNaN(x2) && !Number.isNaN(y2)) {
          const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          if (distance <= dispersionThreshold * oneDegree) {
            fixationCandidate = true;
            fixationCandidateStart = sampleIndex - 1;
            fixationCandidateX = (x1 + x2) / 2;
            fixationCandidateY = (y1 + y2) / 2;
          }
        }
      } else {
        const xCurr = xData[sampleIndex];
        const yCurr = yData[sampleIndex];
        if (xCurr != null && yCurr != null && !Number.isNaN(xCurr) && !Number.isNaN(yCurr)) {
          const distanceFromCenter = Math.sqrt(
            (xCurr - fixationCandidateX) ** 2 + (yCurr - fixationCandidateY) ** 2
          );
          if (distanceFromCenter <= dispersionThreshold * oneDegree) {
            let sumX = 0;
            let sumY = 0;
            let count = 0;
            for (let i = fixationCandidateStart; i <= sampleIndex; i++) {
              const x = xData[i];
              const y = yData[i];
              if (x != null && y != null && !Number.isNaN(x) && !Number.isNaN(y)) {
                sumX += x;
                sumY += y;
                count++;
              }
            }
            if (count > 0) {
              fixationCandidateX = sumX / count;
              fixationCandidateY = sumY / count;
            }
          } else {
            const thisFixation = summarizeFixationMetrics(
              fixationCandidateStart,
              sampleIndex - 1,
              // Don't include current sample
              xData,
              yData,
              timestamps,
              oneDegree
            );
            fixations.push(thisFixation);
            fixationCandidate = false;
            fixationCandidateStart = 0;
            fixationCandidateX = 0;
            fixationCandidateY = 0;
          }
        } else {
          if (fixationCandidateStart < sampleIndex - 1) {
            const thisFixation = summarizeFixationMetrics(
              fixationCandidateStart,
              sampleIndex - 1,
              xData,
              yData,
              timestamps,
              oneDegree
            );
            fixations.push(thisFixation);
          }
          fixationCandidate = false;
          fixationCandidateStart = 0;
          fixationCandidateX = 0;
          fixationCandidateY = 0;
        }
      }
      sampleIndex++;
    }
    if (fixationCandidate && fixationCandidateStart < gazeData.length - 1) {
      const thisFixation = summarizeFixationMetrics(
        fixationCandidateStart,
        gazeData.length - 1,
        xData,
        yData,
        timestamps,
        oneDegree
      );
      fixations.push(thisFixation);
    }
    let mergedFixations = fixations;
    if (distanceThreshold > 0) {
      mergedFixations = mergeAdjacentFixations(
        fixations,
        filteredGaze,
        distanceThreshold,
        mergeMsThreshold,
        oneDegree,
        "xRaw",
        "yRaw"
      );
    }
    const filteredFixations = mergedFixations.filter(
      (f) => f.duration > minDuration && f.missingSamples < missingSamplesThreshold
    );
    const finalFixations = filteredFixations.map((f) => ({
      ...f,
      algorithm: "idt",
      threshold: `${Math.round(dispersionThreshold)} deg.`
    }));
    for (const fixation of finalFixations) {
      for (let i = fixation.firstLine; i <= fixation.lastLine; i++) {
        filteredGaze[i].x = fixation.x;
        filteredGaze[i].y = fixation.y;
      }
    }
    return {
      fixations: finalFixations,
      filteredGaze
    };
  }
  var DEFAULT_IVT_PARAMS = {
    velocityThreshold: 35,
    // degrees/second
    velocityFilterMs: 20,
    // ms
    minSaccadeDuration: 10,
    // ms
    minSaccadeAmplitude: 1,
    // degrees
    minFixationDuration: 40,
    // ms
    oneDegree: 40,
    // pixels
    xcol: "x",
    ycol: "y",
    distanceThreshold: 0.7,
    // degrees
    mergeMsThreshold: 75,
    // ms
    missingSamplesThreshold: 0.5,
    // [0-1]
    trimFixations: false,
    trimDispersionThreshold: void 0,
    saveVelocityProfiles: false
  };
  function algorithmIVT(gazeData, params = {}) {
    const {
      velocityThreshold,
      velocityFilterMs,
      minSaccadeDuration,
      minSaccadeAmplitude,
      minFixationDuration,
      oneDegree,
      xcol,
      ycol,
      distanceThreshold,
      mergeMsThreshold,
      missingSamplesThreshold,
      trimFixations: shouldTrimFixations,
      trimDispersionThreshold,
      saveVelocityProfiles
    } = { ...DEFAULT_IVT_PARAMS, ...params };
    if (gazeData.length < 2) {
      return {
        fixations: [],
        filteredGaze: [],
        saccades: [],
        velocity: []
      };
    }
    validateOneDegree(gazeData, oneDegree, xcol);
    const xData = gazeData.map((d) => d[xcol]);
    const yData = gazeData.map((d) => d[ycol]);
    const timestamps = gazeData.map((d) => d.timestamp);
    const intervals = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const oneSample = mean2(intervals, true);
    if (oneSample < 0.02) {
      console.warn(
        "Unlikely small sample-to-sample difference in timestamps. Are timestamps in milliseconds?"
      );
    }
    console.log("Calculating saccades");
    const velocity = [NaN];
    for (let i = 1; i < gazeData.length; i++) {
      const x1 = xData[i - 1];
      const y1 = yData[i - 1];
      const x2 = xData[i];
      const y2 = yData[i];
      if (x1 == null || y1 == null || x2 == null || y2 == null || Number.isNaN(x1) || Number.isNaN(y1) || Number.isNaN(x2) || Number.isNaN(y2)) {
        velocity.push(NaN);
        continue;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distDeg = dist / oneDegree;
      const vel = distDeg / oneSample * 1e3;
      velocity.push(vel);
    }
    const velocitySmoothWindow = Math.round(velocityFilterMs / oneSample);
    const smoothedVelocity = rollmedian(
      velocity,
      velocitySmoothWindow,
      "center",
      true,
      false
    );
    const aboveThreshold = smoothedVelocity.map(
      (v) => v !== null && !Number.isNaN(v) ? v > velocityThreshold : false
    );
    const encoded = rle(aboveThreshold);
    const saccadeStarts = [];
    const saccadeEnds = [];
    let currentIndex = 0;
    for (let i = 0; i < encoded.lengths.length; i++) {
      const length = encoded.lengths[i];
      const value = encoded.values[i];
      if (value === true) {
        saccadeStarts.push(currentIndex);
        saccadeEnds.push(currentIndex + length - 1);
      }
      currentIndex += length;
    }
    const saccades = [];
    const velocityProfiles = [];
    for (let i = 0; i < saccadeStarts.length; i++) {
      const start = saccadeStarts[i];
      const end = saccadeEnds[i];
      const xOnset = xData[start];
      const yOnset = yData[start];
      const xOffset = xData[end];
      const yOffset = yData[end];
      if (xOnset == null || yOnset == null || xOffset == null || yOffset == null || Number.isNaN(xOnset) || Number.isNaN(yOnset) || Number.isNaN(xOffset) || Number.isNaN(yOffset)) {
        continue;
      }
      const amplitude = Math.sqrt((xOffset - xOnset) ** 2 + (yOffset - yOnset) ** 2) / oneDegree;
      const saccadeVelocities = smoothedVelocity.slice(start, end + 1).filter((v) => v !== null && !Number.isNaN(v));
      const peakVelocity = saccadeVelocities.length > 0 ? Math.max(...saccadeVelocities) : NaN;
      const saccadeX = xData.slice(start, end + 1);
      const missingCount = saccadeX.filter((x) => x == null || Number.isNaN(x)).length;
      const missingSamples = missingCount / saccadeX.length;
      const saccade = {
        onset: timestamps[start],
        xOnset,
        yOnset,
        offset: timestamps[end],
        xOffset,
        yOffset,
        duration: timestamps[end] - timestamps[start],
        amplitude,
        peakVelocity,
        missingSamples
      };
      saccades.push(saccade);
      if (saveVelocityProfiles) {
        velocityProfiles.push(saccadeVelocities);
      }
    }
    const filteredSaccades = saccades.filter(
      (s) => s.duration >= minSaccadeDuration && s.amplitude >= minSaccadeAmplitude
    );
    if (saveVelocityProfiles) {
      filteredSaccades.forEach((s, i) => {
        s.velocityProfile = velocityProfiles[i];
      });
    }
    console.log("Calculating fixations");
    const fixations = [];
    const fixationStarts = saccadeEnds;
    let saccadeStartsAdjusted = saccadeStarts;
    if (fixationStarts.length >= saccadeStarts.length) {
      saccadeStartsAdjusted = [...saccadeStarts, gazeData.length - 1];
    }
    for (let i = 0; i < fixationStarts.length; i++) {
      const fixStart = fixationStarts[i];
      const fixEnd = saccadeStartsAdjusted[i + 1] - 1;
      if (fixEnd <= fixStart) continue;
      const thisFixation = summarizeFixationMetrics(
        fixStart,
        fixEnd,
        xData,
        yData,
        timestamps,
        oneDegree
      );
      fixations.push(thisFixation);
    }
    const filteredGaze = gazeData.map((d) => ({
      timestamp: d.timestamp,
      xRaw: d[xcol],
      yRaw: d[ycol],
      x: null,
      y: null
    }));
    let processedFixations = fixations;
    if (shouldTrimFixations) {
      processedFixations = trimFixations(
        fixations,
        filteredGaze,
        "xRaw",
        "yRaw",
        trimDispersionThreshold,
        oneDegree
      );
    }
    if (distanceThreshold > 0) {
      processedFixations = mergeAdjacentFixations(
        processedFixations,
        filteredGaze,
        distanceThreshold,
        mergeMsThreshold,
        oneDegree,
        "xRaw",
        "yRaw"
      );
    }
    const finalFixations = processedFixations.filter(
      (f) => f.duration >= minFixationDuration && f.missingSamples < missingSamplesThreshold
    ).map((f) => ({
      ...f,
      algorithm: "ivt",
      threshold: `${Math.round(velocityThreshold)} deg.`
    }));
    for (const fixation of finalFixations) {
      for (let i = fixation.firstLine; i <= fixation.lastLine; i++) {
        filteredGaze[i].x = fixation.x;
        filteredGaze[i].y = fixation.y;
      }
    }
    const velocityOutput = timestamps.map((t, i) => ({
      timestamp: t,
      velocity: smoothedVelocity[i] ?? NaN
    }));
    return {
      fixations: finalFixations,
      saccades: filteredSaccades,
      filteredGaze,
      velocity: velocityOutput
    };
  }

  // src/workers/FixationWorker.ts
  var MIN_SAMPLES_FOR_DETECTION = 60;
  function processIVT(buffer, oneDegree) {
    try {
      const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
      const samplingRate = buffer.length / (bufferDuration / 1e3);
      const filterMs = samplingRate > 50 ? 15 : Math.max(5, Math.floor(1e3 / samplingRate));
      const processed = preprocessGaze(buffer, {
        maxGapMs: 75,
        marginMs: 5,
        filterMs
        // Adaptive smoothing window
      });
      const result = algorithmIVT(processed, {
        velocityThreshold: 30,
        // degrees/second
        minFixationDuration: 100,
        // ms
        minSaccadeDuration: 20,
        minSaccadeAmplitude: 0.5,
        oneDegree,
        saveVelocityProfiles: false
      });
      if (result.fixations.length > 0) {
        const latestFixation = result.fixations[result.fixations.length - 1];
        const fixationEndTime = latestFixation.onset + latestFixation.duration;
        const currentTime = buffer[buffer.length - 1].timestamp;
        if (fixationEndTime >= currentTime - 100) {
          return {
            algorithm: "ivt",
            x: latestFixation.x,
            y: latestFixation.y,
            duration: latestFixation.duration,
            timestamp: latestFixation.onset
          };
        }
      }
      return null;
    } catch (error) {
      console.warn("I-VT processing error in worker:", error);
      return null;
    }
  }
  function processIDT(buffer, oneDegree) {
    try {
      const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
      const samplingRate = buffer.length / (bufferDuration / 1e3);
      const filterMs = samplingRate > 50 ? 15 : Math.max(5, Math.floor(1e3 / samplingRate));
      const processed = preprocessGaze(buffer, {
        maxGapMs: 75,
        marginMs: 5,
        filterMs
        // Adaptive smoothing window
      });
      const result = algorithmIDT(processed, {
        dispersionThreshold: 1,
        // degrees
        minDuration: 100,
        // ms
        oneDegree
      });
      if (result.fixations.length > 0) {
        const latestFixation = result.fixations[result.fixations.length - 1];
        const fixationEndTime = latestFixation.onset + latestFixation.duration;
        const currentTime = buffer[buffer.length - 1].timestamp;
        if (fixationEndTime >= currentTime - 100) {
          return {
            algorithm: "idt",
            x: latestFixation.x,
            y: latestFixation.y,
            duration: latestFixation.duration,
            timestamp: latestFixation.onset
          };
        }
      }
      return null;
    } catch (error) {
      console.warn("I-DT processing error in worker:", error);
      return null;
    }
  }
  self.onmessage = (event) => {
    const { type, buffer, enableIVT, enableIDT, oneDegree } = event.data;
    try {
      switch (type) {
        case "process": {
          if (!buffer || buffer.length < MIN_SAMPLES_FOR_DETECTION) {
            const response2 = {
              type: "result",
              fixationIVT: null,
              fixationIDT: null
            };
            self.postMessage(response2);
            return;
          }
          const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
          if (bufferDuration < 100) {
            const response2 = {
              type: "result",
              fixationIVT: null,
              fixationIDT: null
            };
            self.postMessage(response2);
            return;
          }
          const fixationIVT = enableIVT ? processIVT(buffer, oneDegree || 40) : null;
          const fixationIDT = enableIDT ? processIDT(buffer, oneDegree || 40) : null;
          const response = {
            type: "result",
            fixationIVT,
            fixationIDT
          };
          self.postMessage(response);
          break;
        }
        case "reset": {
          const response = {
            type: "ready"
          };
          self.postMessage(response);
          break;
        }
        default:
          console.warn("Unknown message type:", type);
      }
    } catch (error) {
      const response = {
        type: "error",
        error: error instanceof Error ? error.message : String(error)
      };
      self.postMessage(response);
    }
  };
  var readyMessage = {
    type: "ready"
  };
  self.postMessage(readyMessage);
})();
/*! Bundled license information:

kollar-ts/dist/index.mjs:
  (**
   * kollar-ts: TypeScript port of kollaR eye tracking analysis library
   *
   * @module kollar-ts
   *
   * @see Original R package: https://github.com/drjohanlk/kollaR
   * @see Research paper: https://osf.io/preprints/psyarxiv/ypsb9
   *
   * @license GPL-3.0
   * @author Koray Uykan (TypeScript port)
   * @author Johan Lundin Kleberg (Original R package)
   *)
*/
//# sourceMappingURL=fixation.worker.js.map
