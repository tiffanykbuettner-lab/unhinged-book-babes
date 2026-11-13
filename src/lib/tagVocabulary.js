// The Book Cellar — the tag list the Sommelier uses.
// Shared by the app (to show tags) and the server (to tell the AI which tags it may use).
// To add or rename a tag, edit it here; the AI can only ever use tags on this list.

export const TAG_VOCABULARY = {
  genre: [
    'dark romance', 'romantasy', 'contemporary romance', 'romcom', 'sports romance', 'mafia romance',
    'paranormal romance', 'why choose / reverse harem', 'monster romance', 'romance', 'thriller / mystery',
    'horror', 'fantasy',
  ],
  trope: [
    'enemies to lovers', 'friends to lovers', 'second chance', 'forced proximity', 'fake dating',
    'grumpy / sunshine', 'hockey', 'sports', 'morally gray hero', 'villain gets the girl', 'touch her and die',
    'obsessed / possessive', 'stalker', 'captor / captive', 'bully', 'age gap', 'forbidden',
    "brother's best friend", 'bodyguard', 'billionaire', 'single parent', 'small town', 'found family',
    'slow burn', 'insta-love', 'fated mates', 'shifters', 'vampires', 'fae', 'dragons', 'academy / college',
    'holiday romance', 'taboo', 'holiday', 'christmas', 'spooky season', 'fall / autumn',
  ],
  mood: ['dark', 'angsty', 'cozy', 'funny / banter', 'swoony', 'twisty', 'action-packed'],
  season: ['spooky season', 'fall', 'christmas / winter', 'summer / beach'],
  // Shown as trigger warnings. Never used to hide a book.
  content_warning: [
    'cheating', 'sexual violence on page', 'dubious consent', 'graphic violence', 'abuse', 'self-harm',
    'child or animal death', 'cliffhanger ending', 'unfinished series',
  ],
}

export const SPICE_LABELS = {
  0: 'Closed door',
  1: 'Kissing',
  2: 'Mild',
  3: 'Open door',
  4: 'Spicy',
  5: 'Very explicit "smut"',
}

// Fixed tag sources (created by the 2a database update)
export const AI_TAG_SOURCE_ID = '5e1ec7ed-0000-4000-8000-00000000a1a1'
export const MY_TAG_SOURCE_ID = '5e1ec7ed-0000-4000-8000-00000000b2b2'
