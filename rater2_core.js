/* Rater 2: rates a Skewb algorithm by simulating how it is executed with both hands.
   Rules from the user (2026-11-13/14; see CLAUDE.md "New rater" and rater2/analysis.md).
   No page code here, and no algorithm is special-cased: everything follows from the
   grip rules and the costs below.

   Score = "effective move count" (lower is better). Costs are whole numbers in units
   of 1/60 move so that nothing depends on rounding. */
"use strict";
var RATER2 = (function(){
  // ---------- costs (1/60 move); every one can be overridden in rate(alg, costs) ----------
  // Stated set: every number the user stated is kept as stated; the numbers the user
  // did not give were tuned against the user's 56 grades and 9 main-alg choices.
  var STATED = {
    rR: 60,            // an r or R turn                                   (user: 1 move)
    bB: 75,            // a b or B turn                                    (user: "small difference")
    small: 40,         // small regrip, thumb to or from front             (user: 1.5 small regrips = 1 move)
    big: 60,           // big regrip, between up / back / bottom           (user: 1.5 x small)
    rotation: 0,       // a rotation that needs no regrip                  (user: free)
    secondRotation: 60,// a rotation directly after a rotation             (user: like a big regrip)
    sameKind: 15,      // b-move next to a B-move of the same kind         (user: quarter move)
    doubleTurn: 12,    // r as r2', or R r R2' away from the end           (user: fifth of a move)
    bonus: 15,         // starts with an insert / ends with an insert or b' B R'   (user: quarter move)
    backStart: 15,     // starting with the thumb in the back              (user: quarter move)
    rotRegrip: 0,      // extra when a rotation also needs a regrip        (tuned)
    rotAfterLeft: 0,   // rotation directly after a left-hand flick        (tuned)
    leftAfterRot: 0,   // left-hand flick directly after a rotation        (tuned)
    rotAgain: 0,       // second rotation the same way within 3 moves      (tuned)
    rotBack: 40,       // rotating back the other way within 4 moves       (tuned)
    sameKindEnd: 15,   // extra when a same-kind pair ends the algorithm   (tuned)
    lift: 0,           // left-hand move with the right thumb lifted       (tuned)
    ring: 10,          // b' with the left ring finger, thumb on the bottom (tuned)
    lateRegrip: 0,     // extra for a regrip inside the last 3 moves       (tuned)
    loneLast: 15,      // a rotation or regrip with exactly one move left  (tuned)
    rprp: 20           // r' straight after an R' that left the thumb in the back (uncomfortable)
  };
  // Fitted set, the DEFAULT (chosen by the user 2026-11-14): ALL numbers tuned against
  // the same grades and choices. It agrees better
  // with them, but changes several numbers the user stated (b/B dearer, small regrip
  // cheaper, bigger start/end bonus, no same-kind and no double-turn penalty).
  var COST = {rR: 60, bB: 95, small: 20, big: 60, rotation: 0, rotRegrip: 0, rotAfterLeft: 10, leftAfterRot: 20,
    rotAgain: 15, rotBack: 20, secondRotation: 60, sameKind: 0, sameKindEnd: 15, lift: 10, ring: 10, lateRegrip: 0,
    loneLast: 0, doubleTurn: 0, bonus: 30, backStart: 30,
    rprp: 20};         // r' straight after an R' that left the thumb in the back: uncomfortable (user, 2026-11-15); Claude's number
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
  // rotations: thumb before -> possible [thumb after, regrip size]
  var ROTATE = {
    "z":  {F: [["D", ""], ["F", "small"]], U: [["F", ""]],
           B: [["B", "small"], ["F", "big"]], D: [["D", "small"], ["F", "big"]]},
    "z'": {F: [["U", ""], ["F", "small"]], U: [["U", "small"], ["F", "big"]],
           B: [["B", "small"], ["F", "small"]], D: [["F", ""], ["D", "big"]]}
  };
  // letters after a z rotation (the user's Ztranspose); applied o times for orientation o
  var ZMAP = {r: "b", R: "r", B: "R", b: "B"};
  var START = ["", "z", "z2", "z'"];

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
        // R' by a left index flick while the right thumb is lifted (thumb front or up)
        if (m === "R'" && (t === "F" || t === "U")) special(t, C.rR + C.lift, "R'*");
      } else {
        var isLeft = !!LEFT_FLICK[m];
        if (t === "F") move(1, "F", C.bB, m, isLeft, isLeft);
        // B' by a left flick with the thumb lifted on top
        if (m === "B'" && t === "U") special("U", C.bB + C.lift, "B'*");
        // b' with the left ring finger while the thumb is on the bottom
        if (m === "b'" && t === "D") special("D", C.bB + C.ring, "b'*");
      }
    }
    if (e.length === 3){
      var three = e.join(" "), sum = mc(e[0]) + mc(e[1]) + mc(e[2]);
      var first = i === 0, last = i + 3 === n;
      (INSERT[three] || []).forEach(function(g){
        if (g[0] === t) move(3, g[1], sum - (first ? C.bonus : 0) - (last ? C.bonus : 0), three, false, false);
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
          var c = C.rotation;
          if (r[1]) c += C[r[1]] + C.rotRegrip + (left3 ? C.lateRegrip : 0);
          if (n - i === 1) c += C.loneLast;
          if (s.left && !justRotated) c += C.rotAfterLeft;
          if (justRotated) c += C.secondRotation;
          else if (s.dir === d && s.since <= 3) c += C.rotAgain;
          else if (s.dir && s.dir !== d && s.since <= 4) c += C.rotBack;
          out.push({i: i, t: r[0], o: (o + (d === 1 ? 1 : 3)) % 4, dir: d, since: 0, left: s.left, combo: false,
                    cost: c, acts: 1, text: z + (r[1] ? " " + CODE[r[0]] : "")});
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
    // with the letters of that angle. A star marks a move done by the left hand in an
    // unusual way (thumb lifted, or b' with the ring finger).
    return {score: done.cost / 60, units: done.cost, execution: parts.join(" "), moves: n,
            regrips: regrips, rotations: rotations, angle: START[angle],
            written: alg.map(function(t){ return rename(t, angle); }).join(" ")};
  }
  return {rate: rate, parse: parse, COST: COST, STATED: STATED};
})();
