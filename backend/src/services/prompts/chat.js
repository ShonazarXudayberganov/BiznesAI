/**
 * Chat intent prompt'lari (Faza 1'da minimal — chat o'z xulqida ishlaydi).
 */

function freeform({ language = 'uz' } = {}) {
  // Chat uchun base persona (aiAgent.js'dagi buildSystemPrompt) yetarli.
  // systemExtra'da hech narsa qo'shmaymiz — agent o'zining default xulqida ishlaydi.
  return { systemExtra: '', user: null }; // user null = brain runtime'dan oladi
}

module.exports = { freeform };
