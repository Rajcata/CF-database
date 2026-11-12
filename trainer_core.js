/* CF trainer: scramble generator. No page code here, so the same file is tested
   outside the browser (verification/trainer_check.py).

   A state is an array of 30: state[slot] = sticker now in that slot (8 corners x 3
   slots, then 6 centres), exactly as in skewb.py. All tables come from
   trainer_data.js, which is exported from the verified model. */
"use strict";
var CFT = (function(){
  var D = CF_TRAINER;
  var NAMES = ["U","U'","L","L'","R","R'","B","B'"];   // move m turns corner m >> 1
  var SRC = NAMES.map(function(n){ return D.moves[n]; });
  var LEN = 11, HEAD = 5, TAIL = LEN - HEAD;

  function apply(s, m){ var src = SRC[m], t = new Array(30); for (var i = 0; i < 30; i++) t[i] = s[src[i]]; return t; }
  function key(s){ return String.fromCharCode.apply(null, s); }
  function solved(){ var s = []; for (var i = 0; i < 30; i++) s.push(i); return s; }

  // state of a case as held for recognition (subset letter, column 0..728)
  function caseState(letter, n){
    var txt = D.cases[letter], t = solved();
    for (var k = 0; k < 8; k++){
      var v = txt.charCodeAt(8 * n + k) - 48, q = Math.floor(v / 3), o = v % 3;
      for (var j = 0; j < 3; j++) t[3 * k + (o + j) % 3] = 3 * q + j;
    }
    return t;
  }
  // The scramble turns never move the UF corner. The same case, seen after the
  // whole-cube rotation h, is written with UF as the fixed piece: colours are renamed
  // by the one rotation g that makes the UF slots hold their own stickers.
  // h = 0 (identity): the scrambled cube shows the case exactly as pictured.
  function target(letter, n, h){
    var T = caseState(letter, n), H = D.rots[h];
    for (var gi = 0; gi < 24; gi++){
      var g = D.rots[gi], x = new Array(30);
      for (var i = 0; i < 30; i++) x[H[i]] = g[T[i]];
      if (x[0] === 0 && x[1] === 1 && x[2] === 2) return x;
    }
    throw new Error("no frame for case " + letter + n);
  }

  // all 5-move starts from solved: state -> list of words
  var heads = null;
  function buildHeads(){
    heads = new Map();
    (function walk(s, word){
      if (word.length === HEAD){
        var k = key(s), list = heads.get(k);
        if (!list) heads.set(k, list = []);
        list.push(word.slice());
        return;
      }
      for (var m = 0; m < 8; m++){
        if (word.length && (word[word.length - 1] >> 1) === (m >> 1)) continue;
        word.push(m); walk(apply(s, m), word); word.pop();
      }
    })(solved(), []);
  }

  // every scramble of exactly 11 turns (no corner twice in a row) that turns the
  // solved cube into state x
  function allScrambles(x){
    if (!heads) buildHeads();
    var found = [];
    (function back(s, tail){          // tail = last turns of the scramble, in order
      if (tail.length === TAIL){
        var list = heads.get(key(s));
        if (list) for (var i = 0; i < list.length; i++)
          if ((list[i][HEAD - 1] >> 1) !== (tail[0] >> 1)) found.push(list[i].concat(tail));
        return;
      }
      for (var m = 0; m < 8; m++){
        if (tail.length && (tail[0] >> 1) === (m >> 1)) continue;
        back(apply(s, m ^ 1), [m].concat(tail));     // undo turn m
      }
    })(x, []);
    return found;
  }
  function text(word){ return word.map(function(m){ return NAMES[m]; }).join(" "); }
  function scramble(letter, n, h){
    var all = allScrambles(target(letter, n, h));
    if (!all.length) return null;
    return text(all[Math.floor(Math.random() * all.length)]);
  }
  return {scramble: scramble, allScrambles: allScrambles, target: target, caseState: caseState, text: text, LEN: LEN};
})();
