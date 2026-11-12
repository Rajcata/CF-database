/* CF simulator logic. No page code here, so the same file is tested outside the
   browser (verification/sim_check.py). Needs trainer_data.js, trainer_core.js and
   sim_data.js; every table in those files is exported from the verified model.

   State = array of 30, state[slot] = sticker now in that slot (as in skewb.py). */
"use strict";
var CFS = (function(){
  var T = CF_TRAINER, D = CF_SIM, ROT = T.rots;
  var SCR = ["U","U'","L","L'","R","R'","B","B'"];

  function solved(){ var s = []; for (var i = 0; i < 30; i++) s.push(i); return s; }
  function turn(s, src){ var t = new Array(30); for (var i = 0; i < 30; i++) t[i] = s[src[i]]; return t; }
  function key(s){ return String.fromCharCode.apply(null, s); }
  function rehold(s, g){ var t = new Array(30); for (var i = 0; i < 30; i++) t[g[i]] = g[s[i]]; return t; }
  function rotateOnly(s, g){ var t = new Array(30); for (var i = 0; i < 30; i++) t[g[i]] = s[i]; return t; }
  function applyWord(s, toks){ for (var i = 0; i < toks.length; i++) s = turn(s, D.moves[toks[i]]); return s; }
  function split(text){ return text ? text.split(" ") : []; }

  // a solved cube in any of the 24 holdings
  var SOLVED_ANY = new Set(ROT.map(function(g){ return key(rotateOnly(solved(), g)); }));

  // ---------- scrambles ----------
  function parseScramble(text){
    var toks = text.replace(/[’‘`´]/g, "'").trim().split(/\s+/), s = solved();
    if (toks.length === 1 && toks[0] === "") return null;
    for (var i = 0; i < toks.length; i++){
      if (SCR.indexOf(toks[i]) < 0) return null;
      s = turn(s, T.moves[toks[i]]);
    }
    return {state: s, text: toks.join(" ")};
  }
  // uniformly random state: every reachable state is exactly one choice of
  // (even centre arrangement, one of 36 corner arrangements, 2 + 3 free twists)
  function randomState(rnd){
    var c = [0,1,2,3,4,5], i, j, t, inv = 0;
    for (i = 5; i > 0; i--){ j = Math.floor(rnd() * (i + 1)); t = c[i]; c[i] = c[j]; c[j] = t; }
    for (i = 0; i < 6; i++) for (j = 0; j < i; j++) if (c[j] > c[i]) inv++;
    if (inv & 1){ t = c[0]; c[0] = c[1]; c[1] = t; }
    var pick = D.corners[Math.floor(rnd() * D.corners.length)], perm = pick[0], o = [0,0,0,0,0,0,0,0];
    function twists(set, total){
      var sum = 0;
      for (var k = 0; k < set.length - 1; k++){ o[set[k]] = Math.floor(rnd() * 3); sum += o[set[k]]; }
      o[set[set.length - 1]] = ((total - sum) % 3 + 3) % 3;
    }
    twists(D.t1, pick[1]); twists(D.t2, pick[2]);
    var s = new Array(30);
    for (var p = 0; p < 8; p++) for (var k = 0; k < 3; k++) s[3 * p + (o[p] + k) % 3] = 3 * perm[p] + k;
    for (i = 0; i < 6; i++) s[24 + i] = 24 + c[i];
    return s;
  }
  // states solvable in 6 scramble turns or fewer (TNoodle rejects these)
  var near = null;
  function isNear(s){
    if (!near){
      near = new Set([key(solved())]);
      var frontier = [solved()];
      for (var d = 0; d < 6; d++){
        var next = [];
        for (var i = 0; i < frontier.length; i++) for (var m = 0; m < 8; m++){
          var t = turn(frontier[i], T.moves[SCR[m]]), k = key(t);
          if (!near.has(k)){ near.add(k); next.push(t); }
        }
        frontier = next;
      }
    }
    return near.has(key(s));
  }
  // TNoodle's method: random state, at least 7 turns from solved, written in exactly 11 turns
  function randomScramble(rnd){
    rnd = rnd || Math.random;
    for (;;){
      var s = randomState(rnd);
      if (isNear(s)) continue;
      var all = CFT.allScrambles(s);
      if (!all.length) continue;
      return {state: s, text: CFT.text(all[Math.floor(rnd() * all.length)])};
    }
  }

  // ---------- CF layer ----------
  // turn the scrambled cube to the holding of the CF layers pictures:
  // white centre on D and green on FL (or green on U and blue on FL)
  function pictureHolding(x){
    for (var p = 0; p < 24; p++){
      var y = rotateOnly(x, ROT[p]), col = "";
      for (var k = 0; k < 6; k++) col += D.colours[y[24 + k] - 24];
      if (col[5] === "W" && (col[1] === "G" || (col[0] === "G" && col[1] === "B"))) return {state: y, pic: col, rot: p};
    }
    throw new Error("no picture holding");
  }
  var caseMap = null;
  function code(s){
    var out = "";
    for (var p = 0; p < 8; p++){
      var o = s[3 * p] % 3 === 0 ? 0 : s[3 * p + 1] % 3 === 0 ? 1 : 2;
      out += String.fromCharCode(48 + 3 * Math.floor(s[3 * p] / 3) + o);
    }
    return out;
  }
  function findCase(K){
    if (!caseMap){
      caseMap = new Map();
      for (var l in T.cases) for (var n = 728; n >= 0; n--) caseMap.set(T.cases[l].substr(8 * n, 8), [l, n]);
    }
    for (var r = 0; r < 24; r++){
      var Tc = rehold(K, ROT[r]), hit = caseMap.get(code(Tc));
      if (hit) return {letter: hit[0], n: hit[1], state: Tc};
    }
    throw new Error("case not found");
  }

  // Scrambled state -> the layer picture and, per sheet algorithm, its variants:
  //   split = number of layer turns done BEFORE the database algorithm
  //   (all of them = normal CF; 0 = ABL, algorithm before layer; in between =
  //   move-algorithm-move, offered when ABL is on).
  // A CF algorithm only changes corners, so it can be done at any point of the layer.
  // Which case it has to solve there follows from one requirement: algorithm plus
  // the remaining layer turns must solve the cube (it is generally a different case
  // from the one seen after the whole layer). For each of the 24 starting holdings h (counted from the
  // picture's holding) a variant stores the layer turns before and after the
  // algorithm, that case as held at that moment, and the angle numbers of the case's
  // database column whose algorithms can be used there without a rotation.
  // The angle number of a finished solution counts from the holding in which the
  // scramble was done (white on top, green front-left before scrambling; the scramble
  // turns never rotate the cube), not from the picture's holding.
  var KEY_SOLVED = key(solved()), KEY_Z2 = key(D.z2solved);
  // angle number, counted from the holding the scramble ends in, of starting holding h
  // (h is counted from the picture's holding, which is rotation `rot` away from it)
  var ROTKEY = new Map(ROT.map(function(g, i){ return [g.join(","), i]; }));
  function scrambleAngles(rot){
    var out = [];
    for (var h = 0; h < 24; h++){
      var both = ROT[rot].map(function(x){ return ROT[h][x]; });
      out.push(D.angle[ROTKEY.get(both.join(","))]);
    }
    return out;
  }
  function variant(P0, a, j, size, ang){
    var start = [], pre = [], suf = [], held = [], h;
    for (h = 0; h < 24; h++){
      var w = split(a.words ? a.words[h] : ""), s = rehold(P0, ROT[h]);
      var P = w.slice(0, j), S = w.slice(j), p = applyWord(s, P), WS = applyWord(solved(), S), c = null;
      for (var r = 0; r < 24 && !c; r++){
        var g = ROT[r], t = new Array(30), ok = true, i;
        for (i = 24; i < 30; i++) if (WS[g[p[i]]] !== i){ ok = false; break; }
        if (ok){ for (i = 0; i < 30; i++) t[i] = WS[g[p[i]]]; c = t; }
      }
      if (!c) throw new Error("layer algorithm does not solve the centres");
      start.push(s); pre.push(P); suf.push(S); held.push(c);
    }
    var cs = findCase(held[0]), byKey = new Map();
    for (var q = 0; q < 24; q++){
      var k = key(rehold(cs.state, ROT[q]));
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(D.angle[q]);
    }
    return {layer: a.text, split: j, size: size, letter: cs.letter, n: cs.n, done: cs.letter === "O" && cs.n === 0,
            start: start, pre: pre, suf: suf, held: held, ang: ang,
            angles: held.map(function(K){ return byKey.get(key(K)) || []; })};
  }
  function prepare(x){
    var ph = pictureHolding(x), layer = null;
    for (var i = 0; i < D.layers.length; i++) if (D.layers[i].pic === ph.pic) layer = D.layers[i];
    if (!layer) throw new Error("layer picture not in the sheet: " + ph.pic);
    var algs = layer.algs.length ? layer.algs : [{text: "", words: null}];
    var ang = scrambleAngles(ph.rot);
    var options = algs.map(function(a){
      var size = a.words ? split(a.words[0]).length : 0, splits = [size], j;
      if (size > 0) splits.push(0);
      for (j = 1; j < size; j++) splits.push(j);
      return {layer: a.text, variants: splits.map(function(j){ return variant(ph.state, a, j, size, ang); })};
    });
    return {pic: ph.pic, options: options};
  }

  // joins algorithms; a corner turned twice in a row is merged or cancelled
  function merge(a, b){
    var out = [];
    a.concat(b).forEach(function(t){
      var top = out[out.length - 1];
      if (top && top[0] === t[0]){
        out.pop();
        if ((top.length + t.length) % 3 !== 0) out.push(top.length + t.length === 2 ? t[0] + "'" : t[0]);
      } else out.push(t);
    });
    return out;
  }
  function z2(toks){ return toks.map(function(t){ return D.z2[t[0]] + t.slice(1); }); }
  // v = one variant; column = its case's database list [{score, moves, angle, alg}], best
  // rated first; limit = how many of its first algorithms may be used (1, 10, Infinity).
  // Returns the shortest merged solution (ties: the better rated algorithm).
  function finish(v, column, limit){
    var best = null, h, i;
    if (v.done){
      // no algorithm needed: just the layer, from the sheet's own angle
      h = D.angle.indexOf(v.layer ? +v.layer.split(" ")[0] : 3);
      best = {h: h, word: v.pre[h].concat(v.suf[h]), rank: 0, entry: null, cut: 0};
    } else {
      var n = Math.min(limit, column.length);
      for (h = 0; h < 24; h++){
        var A = v.angles[h];
        if (!A.length) continue;
        for (i = 0; i < n; i++){
          var e = column[i], ok = e.angle.split("/").some(function(a){ return A.indexOf(+a) >= 0; });
          if (!ok) continue;
          var alg = e.alg.split(" "), tail = v.suf[h];
          if (tail.length){
            // an algorithm that ends in the z2-rotated solved position leaves the cube
            // turned by z2, so the remaining layer turns are renamed by z2
            var end = key(applyWord(v.held[h], alg));
            if (end === KEY_Z2) tail = z2(tail);
            else if (end !== KEY_SOLVED) throw new Error("database algorithm does not solve its case");
          }
          var w = merge(merge(v.pre[h], alg), tail);
          if (!best || w.length < best.word.length || (w.length === best.word.length && i < best.rank - 1))
            best = {h: h, word: w, rank: i + 1, entry: e, cut: v.pre[h].length + alg.length + tail.length - w.length};
        }
      }
    }
    if (!best) return null;
    if (!SOLVED_ANY.has(key(applyWord(v.start[best.h], best.word)))) throw new Error("solution does not solve the cube");
    return {angle: v.ang[best.h], text: best.word.join(" "), moves: best.word.length, layer: v.layer, split: v.split,
            before: v.pre[best.h].join(" "), after: v.suf[best.h].join(" "), letter: v.letter, n: v.n,
            rank: best.rank, entry: best.entry, cancelled: best.cut};
  }
  return {parseScramble: parseScramble, randomScramble: randomScramble, randomState: randomState, isNear: isNear,
          prepare: prepare, finish: finish, merge: merge};
})();
