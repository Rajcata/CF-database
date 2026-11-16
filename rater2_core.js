/* Rater 2: rates a Skewb algorithm by simulating how it is executed with both hands.
   Grip rules: the user's statements (2026-11-13/14) plus what the user's 272 main algs for
   EG2 and NS show (2026-11-16, rater3/rules.md): thumb-up r turns, B' from the bottom grip,
   thumb B', and rotations during which the thumb rides along. No algorithm is special-cased.

   Score = "effective move count" (lower is better). Costs are whole numbers in units
   of 1/60 move so that nothing depends on rounding. */
"use strict";
var RATER2 = (function(){
  // ---------- costs (1/60 move); every one can be overridden in rate(alg, costs) ----------
  // Tuned so that the user's EG2/NS main algs come first among the solutions of their
  // cases, together with the user's CF grades and CF main-alg choices.
  var COST = {
    rR: 60,            // an r or R turn
    bB: 85,            // a b or B turn
    small: 10,         // small regrip (thumb to or from front)
    big: 60,           // big regrip (between up, back, bottom)
    rotation: 20,       // any rotation
    rideRare: 0,      // a rotation where the thumb rides along the less usual way
    rotRegrip: 15,      // extra when a rotation also needs a regrip
    rotAfterLeft: 20,  // rotation directly after a left-hand flick (b, B')
    leftAfterRot: 20,  // left-hand flick directly after a rotation
    rotAgain: 15,      // second rotation in the same direction within 3 moves
    rotBack: 0,       // rotating back the other way within 4 moves
    secondRotation: 60,// a rotation directly after a rotation
    opposite: 30,       // a turn on the corner diagonally opposite the previous one (r next to B, R next to b)
    sameKind: 0,       // b-move next to a B-move, both primed or both unprimed
    sameKindEnd: 15,   // ... extra when that pair ends the algorithm
    dot: 20,            // r or r' done with the thumb up (.r, .r')
    lift: 20,          // a move done by the left hand while the right thumb is lifted (§)
    ring: 40,          // b' with the left ring finger (.b'), or B' from the bottom grip (.B')
    thumbB: 0,        // B' done with the thumb, from the back grip (tB')
    lateRegrip: 0,     // extra for a regrip inside the last 3 moves
    loneLast: 0,       // a rotation or regrip with exactly one move left
    doubleTurn: 10,     // r done as r2', or R r R2' away from the end
    rprp: 20,          // r' straight after an R' that left the thumb in the back
    insert: 40,         // bonus for every insert (r' R r, r' R' r, R r R', R r' R')
    bonus: 30,         // extra bonus when an insert starts or ends the algorithm (or b' B R' ends it)
    backStart: 30      // starting with the thumb in the back
  };
  // ---------- grip model ----------
  // right thumb: F front (homegrip), U up, B back, D down (bottom)
  var THUMBS = ["F", "U", "B", "D"], CODE = {F: "ft", U: "ut", B: "bt", D: "dt"};
  // single moves by the right wrist: [thumb before, thumb after]
  var WRIST = {
    "r":  [["D", "F"], ["F", "B"]],
    "r'": [["B", "F"], ["F", "D"]],
    "R":  [["F", "U"], ["U", "B"], ["B", "F"], ["D", "D"]],
    "R'": [["U", "F"], ["F", "B"], ["D", "D"]]
  };
  // finger flicks from homegrip: B and b' by the right hand, B' and b by the left hand
  var LEFT_FLICK = {"b": true, "B'": true};
  // three-move triggers: extra ways to do the moves without a regrip
  var INSERT = {
    "r' R r":  [["F", "F"], ["B", "U"]],
    "r' R' r": [["F", "F"]],
    "R r R'":  [["F", "F"], ["D", "B"]],
    "R r' R'": [["F", "F"], ["B", "D"]]
  };
  var RB = {
    "r B r'":  [["D", "D"]],
    "r B' r'": [["D", "D"]],
    "r' B' r": [["F", "F"]],
    "r' B r":  [["F", "F"]]
  };
  // rotations: thumb before -> possible [thumb after, what it costs]
  //   "" = the thumb rides along (the usual ones: front+z, up+z, back+z', bottom+z'),
  //   "rideRare" = it rides along the less usual way, "small" / "big" = a regrip
  var ROTATE = {
    "z":  {F: [["D", ""], ["F", "small"]], U: [["F", ""]],
           B: [["U", "rideRare"], ["B", "small"], ["F", "big"]], D: [["D", "small"], ["F", "big"]]},
    "z'": {F: [["U", "rideRare"], ["F", "small"]], U: [["B", "rideRare"], ["U", "small"], ["F", "big"]],
           B: [["D", ""], ["B", "small"], ["F", "small"]], D: [["F", ""], ["D", "big"]]}
  };
  // letters after a z rotation (the user's Ztranspose); applied o times for orientation o
  var ZMAP = {r: "b", R: "r", B: "R", b: "B"};
  var START = ["", "z", "z2", "z'"];
  var OPPOSITE = {r: "B", B: "r", R: "b", b: "R"};

  function rename(tok, o){ var l = tok[0]; for (var k = 0; k < o; k++) l = ZMAP[l]; return l + tok.slice(1); }
  function isB(tok){ return tok[0] === "b" || tok[0] === "B"; }
  function sameKind(a, b){ return isB(a) && isB(b) && a[0] !== b[0] && a.length === b.length; }

  // "Rp" is accepted for "R'"; an angle number in front and rotations at either end are dropped
  function parse(text){
    var toks = text.replace(/[’‘`´]/g, "'").replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(Boolean);
    while (toks.length && /^[\d\/]+$/.test(toks[0])) toks.shift();
    toks = toks.map(function(t){ return t.replace(/^([rRbBz])p$/, "$1'"); });
    while (toks.length && /^z/.test(toks[0])) toks.shift();
    while (toks.length && /^z/.test(toks[toks.length - 1])) toks.pop();
    for (var i = 0; i < toks.length; i++) if (!/^[rRbB]'?$/.test(toks[i])) return null;
    return toks.length ? toks : null;
  }

  /* State: i moves done, thumb t, orientation o, dir = direction of the last rotation
     (0 none, 1 z, 2 z'), since = moves done after it (0..4, 0 = it was the last action),
     left = the last move was done by the left hand, combo = the last step ended with
     an R' that left the thumb in the back (the single turn R' from front, or the insert
     R r R' from the bottom): an r' straight after that is uncomfortable. */
  function steps(alg, s, C){
    var n = alg.length, i = s.i, t = s.t, o = s.o, out = [], e = [], k;
    for (k = i; k < n && k < i + 3; k++) e.push(rename(alg[k], o));
    var justRotated = s.dir && s.since === 0;
    var prev = i > 0 && !justRotated ? rename(alg[i - 1], o) : null;
    var left3 = n - i <= 3;                       // inside the last three moves
    function mc(tok){ return tok[0] === "r" || tok[0] === "R" ? C.rR : C.bB; }
    function move(len, to, cost, text, leftHand, firstLeft){
      var c = cost, q;
      if (s.combo && len === 1 && text === "r'" && t === "B") c += C.rprp;
      if (prev && len === 1 && OPPOSITE[prev[0]] === e[0][0]) c += C.opposite;
      if (prev && sameKind(prev, e[0])) c += C.sameKind + (i + 1 === n ? C.sameKindEnd : 0);
      for (q = 0; q + 1 < len; q++) if (sameKind(e[q], e[q + 1])) c += C.sameKind + (i + q + 2 === n ? C.sameKindEnd : 0);
      if (justRotated && firstLeft) c += C.leftAfterRot;
      out.push({i: i + len, t: to, o: o, dir: s.dir, since: s.dir ? Math.min(4, s.since + len) : 0,
                left: leftHand, combo: to === "B" && /R2?'$/.test(text), cost: c, acts: 0, text: text});
    }
    // a left-hand move done in a special way; on equal cost the ordinary way is preferred
    function special(to, cost, text){ var before = out.length; move(1, to, cost, text, true, true); if (out.length > before) out[out.length - 1].acts = 1; }
    if (i < n){
      var m = e[0];
      if (WRIST[m]){
        WRIST[m].forEach(function(g){ if (g[0] === t) move(1, g[1], C.rR, m, false, false); });
        if (m === "r" && t === "B") move(1, "D", C.rR + C.doubleTurn, "r2'", false, false);
        // r and r' with the thumb up: right middle and ring finger, the thumb stays up
        if ((m === "r" || m === "r'") && t === "U") move(1, "U", C.rR + C.dot, "." + m, false, false);
        // R' by a left index flick while the right thumb is lifted (thumb front or up)
        if (m === "R'" && (t === "F" || t === "U")) special(t, C.rR + C.lift, "§R'");
      } else {
        var isLeft = !!LEFT_FLICK[m];
        if (t === "F") move(1, "F", C.bB, m, isLeft, isLeft);
        // B' by a left flick with the thumb lifted on top
        if (m === "B'" && t === "U") special("U", C.bB + C.lift, "§B'");
        // b' with the left ring finger while the thumb is on the bottom or up
        if (m === "b'" && (t === "D" || t === "U")) special(t, C.bB + C.ring, ".b'");
        // B' from the bottom grip (right ring finger), and B' with the thumb from the back grip
        if (m === "B'" && t === "D") move(1, "D", C.bB + C.ring, ".B'", false, false);
        if (m === "B'" && t === "B") move(1, "B", C.bB + C.thumbB, "tB'", false, false);
      }
    }
    if (e.length === 3){
      var three = e.join(" "), sum = mc(e[0]) + mc(e[1]) + mc(e[2]);
      var first = i === 0, last = i + 3 === n;
      (INSERT[three] || []).forEach(function(g){
        if (g[0] === t) move(3, g[1], sum - C.insert - (first ? C.bonus : 0) - (last ? C.bonus : 0), three, false, false);
      });
      (RB[three] || []).forEach(function(g){ if (g[0] === t) move(3, g[1], sum, three, false, false); });
      if (three === "R r R" && t === "F") move(3, "B", sum + (last ? -C.bonus : C.doubleTurn), "R r R2'", false, false);
      if (three === "b' B R'" && t === "F" && last) move(3, "B", sum - C.bonus, three, false, false);
    }
    if (i < n){
      var late = (left3 ? C.lateRegrip : 0) + (n - i === 1 ? C.loneLast : 0);
      if (i > 0) THUMBS.forEach(function(to){
        if (to === t) return;
        out.push({i: i, t: to, o: o, dir: s.dir, since: s.since, left: s.left, combo: false,
                  cost: (t === "F" || to === "F" ? C.small : C.big) + late, acts: 1, text: CODE[to]});
      });
      if (i > 0) [1, 2].forEach(function(d){
        var z = d === 1 ? "z" : "z'";
        ROTATE[z][t].forEach(function(r){
          var c = C.rotation, regrip = r[1] === "small" || r[1] === "big";
          if (r[1]) c += C[r[1]];
          if (regrip) c += C.rotRegrip + (left3 ? C.lateRegrip : 0);
          if (n - i === 1) c += C.loneLast;
          if (s.left && !justRotated) c += C.rotAfterLeft;
          if (justRotated) c += C.secondRotation;
          else if (s.dir === d && s.since <= 3) c += C.rotAgain;
          else if (s.dir && s.dir !== d && s.since <= 4) c += C.rotBack;
          out.push({i: i, t: r[0], o: (o + (d === 1 ? 1 : 3)) % 4, dir: d, since: 0, left: s.left, combo: false,
                    cost: c, acts: 1, text: z + (regrip ? " " + CODE[r[0]] : "")});
        });
      });
    }
    return out;
  }

  // small binary heap on (cost, acts)
  function Heap(){ this.a = []; }
  Heap.prototype.push = function(x){
    var a = this.a, i = a.length; a.push(x);
    while (i > 0){ var p = (i - 1) >> 1; if (!less(a[i], a[p])) break; var t = a[i]; a[i] = a[p]; a[p] = t; i = p; }
  };
  Heap.prototype.pop = function(){
    var a = this.a, top = a[0], last = a.pop();
    if (a.length){
      a[0] = last; var i = 0;
      for (;;){
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        var t = a[i]; a[i] = a[m]; a[m] = t; i = m;
      }
    }
    return top;
  };
  function less(a, b){ return a.cost < b.cost || (a.cost === b.cost && a.acts < b.acts); }

  // best execution of an algorithm (array of moves); ties: fewer regrips and rotations
  function rate(alg, costs){
    var C = COST;
    if (costs){ C = {}; for (var k in COST) C[k] = k in costs ? costs[k] : COST[k]; }
    var n = alg.length, best = new Map(), heap = new Heap();
    function id(s){ return s.i * 4000 + THUMBS.indexOf(s.t) * 1000 + s.o * 250 + s.dir * 80 + s.since * 10 + (s.left ? 1 : 0) + (s.combo ? 2 : 0); }
    function push(s){
      var key = id(s), old = best.get(key);
      if (!old || less(s, old)){ best.set(key, s); heap.push(s); }
    }
    for (var o = 0; o < 4; o++) THUMBS.forEach(function(t){
      push({i: 0, t: t, o: o, dir: 0, since: 0, left: false, combo: false, cost: t === "B" ? C.backStart : 0, acts: 0,
            prev: null, text: CODE[t], start: o});
    });
    var done = null;
    while (heap.a.length){
      var s = heap.pop();
      if (best.get(id(s)) !== s) continue;
      if (s.i === n){ done = s; break; }
      steps(alg, s, C).forEach(function(st){
        st.cost += s.cost; st.acts += s.acts; st.prev = s; push(st);
      });
    }
    var parts = [], regrips = 0, rotations = 0, angle = 0;
    for (var p = done; p; p = p.prev){
      parts.unshift(p.text);
      if (!p.prev) angle = p.start;
      else { if (/^z/.test(p.text)) rotations++; if (/t$/.test(p.text)) regrips++; }
    }
    // The starting angle is free and is not written as a rotation: the execution begins
    // with the letters of that angle. Special fingerings are written as the user writes
    // them: .r .r' (thumb up), .B' (bottom grip), .b' (left ring), tB' (thumb), §X (thumb lifted).
    return {score: done.cost / 60, units: done.cost, execution: parts.join(" "), moves: n,
            regrips: regrips, rotations: rotations, angle: START[angle],
            written: alg.map(function(t){ return rename(t, angle); }).join(" ")};
  }
  return {rate: rate, parse: parse, COST: COST, STATED: COST};
})();
