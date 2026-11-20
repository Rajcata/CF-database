/* Modified Scrambles: builds a scramble that leads to a chosen CF case after a chosen
   layer solution. No page code here, so the same file is tested outside the browser
   (verification/mod_check.py). Needs trainer_data.js, trainer_core.js and mod_data.js.

   A state is an array of 30: state[slot] = sticker now in that slot, as in skewb.py. */
"use strict";
var CFM = (function(){
  var D = CF_MOD, ROTS = CF_TRAINER.rots;

  function solved(){ var s = []; for (var i = 0; i < 30; i++) s.push(i); return s; }
  function turn(s, src){ var t = new Array(30); for (var i = 0; i < 30; i++) t[i] = s[src[i]]; return t; }
  function applyWord(s, word){ for (var i = 0; i < word.length; i++) s = turn(s, D.turns[word[i]]); return s; }
  function inverse(word){
    return word.slice().reverse().map(function(m){ return m.length > 1 ? m[0] : m + "'"; });
  }
  // same cube picked up after the rotation g, colours renamed to the new holding
  function rehold(s, g){ var t = new Array(30); for (var i = 0; i < 30; i++) t[g[i]] = g[s[i]]; return t; }
  // whole-cube rotation, colours kept
  function rotateOnly(s, g){ var t = new Array(30); for (var i = 0; i < 30; i++) t[g[i]] = s[i]; return t; }

  /* The cube before the layer, in the layer picture's holding and in real colours:
     doing the solution `si` of layer `li` leaves the case (letter, n), seen from the
     angle `angle` (0..23, how the case sits relative to the layer). */
  function beforeLayer(letter, n, li, si, angle){
    var L = D.layers[li], word = L.sols[si].word;
    var K = rehold(CFT.caseState(letter, n), ROTS[angle]);       // the case, centres home
    var s = solved(), i, g;
    for (i = 0; i < 6; i++) s[24 + i] = L.centres[i];
    var end = applyWord(s, word);                                // where the centres are after the solution
    for (g = 0; g < 24; g++){
      var r = ROTS[g], ok = true;
      for (i = 24; i < 30 && ok; i++) if (end[r[i]] !== i) ok = false;
      if (ok) return applyWord(rotateOnly(K, r), inverse(word));
    }
    throw new Error("layer " + li + " solution " + si + " does not solve the centres");
  }

  // the scramble turns never move the UF corner: turn the cube so that piece is home
  function scrambleFrame(x){
    for (var g = 0; g < 24; g++){
      var y = rotateOnly(x, ROTS[g]);
      if (y[0] === 0 && y[1] === 1 && y[2] === 2) return y;
    }
    throw new Error("no scramble frame");
  }

  /* A scramble (11 turns, U L R B, from white on top and green front-left) after which
     the cube shows layer `li`; doing its solution `si` then leaves the case (letter, n).
     rnd: function returning a number in [0, 1). */
  function make(letter, n, li, si, rnd){
    rnd = rnd || Math.random;
    for (var tries = 0; tries < 24; tries++){
      var angle = Math.floor(rnd() * 24);
      var all = CFT.allScrambles(scrambleFrame(beforeLayer(letter, n, li, si, angle)));
      if (all.length) return {scramble: CFT.text(all[Math.floor(rnd() * all.length)]), angle: angle};
    }
    return null;
  }

  /* Permutation recognition after the layer, in the holding the layer solution was done
     in (the picture's holding turned by the solution's angle number; for the solved layer
     the picture's holding): the pattern name of the patterns tab (corners 1-4 = DL UL UF
     DF) and every sticker location that can be brought to location 4 to see the subset's
     picture. */
  function recog(letter, n, li, si, angle){
    var sol = D.layers[li].sols[si], y = beforeLayer(letter, n, li, si, angle), i, g, k;
    if (sol.text){
      var parts = sol.text.split(" "), num = +parts[0];
      for (g = 0; g < 24; g++) if (D.loc[ROTS[g].indexOf(0)] === num) break;     // brings location num to location 3
      y = applyWord(rotateOnly(y, ROTS[g]), parts.slice(1));
    }
    // rename the stickers so that the centres count as home in this holding
    var h = null;
    for (g = 0; g < 24 && !h; g++){
      var ok = true;
      for (i = 24; i < 30 && ok; i++) if (ROTS[g][y[i]] !== i) ok = false;
      if (ok) h = ROTS[g];
    }
    var K = y.map(function(x){ return h[x]; });
    var name = D.pattern.corners.map(function(c){ return D.pattern.letters[c][Math.floor(K[3 * c] / 3)]; });
    var want = CFT.caseState(letter, 0), locs = [];
    for (g = 0; g < 24; g++){
      var t = rehold(K, ROTS[g]), same = true;
      for (k = 0; k < 8 && same; k++) if (Math.floor(t[3 * k] / 3) !== Math.floor(want[3 * k] / 3)) same = false;
      if (same) locs.push(D.loc[ROTS[g].indexOf(6)]);                           // the spot that comes to location 4
    }
    locs.sort(function(a, b){ return a - b; });
    return {pattern: name[0] + "-" + name[1] + " / " + name[2] + "-" + name[3], locs: locs};
  }

  return {make: make, recog: recog, beforeLayer: beforeLayer, scrambleFrame: scrambleFrame, layers: D.layers};
})();
