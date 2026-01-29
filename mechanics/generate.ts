#!/usr/bin/env npx ts-node

// Mechanics generator script
// Parses _raw_mechanics.txt and generates categorized markdown files

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const MECHANICS_DIR = dirname(import.meta.url.replace('file://', ''));

interface MechanicDef {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  bggUrl: string;
}

// Category mappings based on mechanic name patterns
function categorize(name: string): string {
  const n = name.toLowerCase();

  // Auction variants
  if (n.startsWith('auction')) return 'auction';

  // Turn order variants
  if (n.startsWith('turn order')) return 'turn-order';

  // Worker placement variants
  if (n.startsWith('worker placement')) return 'worker-placement';

  // Action-related
  if (n.startsWith('action')) return 'action';

  // Movement mechanics
  if (n.includes('movement') || n.includes('move') || n === 'grid coverage' ||
      n === 'hexagon grid' || n === 'square grid' || n === 'line of sight' ||
      n === 'zone of control' || n === 'rondel') return 'movement';

  // Card mechanics
  if (n.includes('card') || n.includes('deck') || n.includes('hand') ||
      n.includes('drafting') || n === 'trick-taking' || n === 'ladder climbing' ||
      n === 'melding and splaying' || n === 'set collection') return 'cards';

  // Cooperative
  if (n.includes('cooperative') || n.includes('team') || n === 'traitor game' ||
      n === 'alliances' || n === 'semi-cooperative game') return 'cooperative';

  // Economic
  if (n.includes('market') || n.includes('stock') || n.includes('trading') ||
      n === 'income' || n === 'loans' || n === 'investment' || n === 'contracts' ||
      n === 'commodity speculation' || n === 'ownership' || n === 'bribery') return 'economic';

  // Conflict/combat
  if (n.includes('conflict') || n.includes('combat') || n.includes('attack') ||
      n === 'critical hits and failures' || n.includes('ratio') || n === 'area-impulse' ||
      n === 'chit-pull system' || n === 'command cards' || n === 'force commitment' ||
      n === 'secret unit deployment' || n === 'kill steal') return 'conflict';

  // Ending conditions
  if (n.includes('ending') || n === 'player elimination' || n === 'single loser game' ||
      n === 'race') return 'ending';

  // Victory conditions
  if (n.includes('victory') || n.includes('scoring') || n === 'end game bonuses' ||
      n === 'catch the leader' || n === 'king of the hill') return 'victory';

  // Physical/dexterity
  if (n === 'flicking' || n === 'stacking and balancing' || n === 'physical removal' ||
      n === 'singing' || n === 'speed matching' || n === 'real-time' ||
      n === 'cube tower' || n === 'measurement movement') return 'physical';

  // Dice/randomness
  if (n.includes('dice') || n.includes('roll') || n === 'push your luck' ||
      n === 're-rolling and locking') return 'dice';

  // Information/deduction
  if (n.includes('hidden') || n === 'deduction' || n === 'induction' ||
      n === 'memory' || n === 'pattern recognition' || n === 'targeted clues' ||
      n === 'questions and answers') return 'information';

  // Social/negotiation
  if (n === 'negotiation' || n === 'voting' || n === 'betting and bluffing' ||
      n === 'player judge' || n === 'i cut, you choose' || n === "prisoner's dilemma" ||
      n === 'communication limits' || n === 'acting' || n === 'storytelling' ||
      n === 'role playing') return 'social';

  // Building/construction
  if (n.includes('building') || n.includes('placement') || n === 'enclosure' ||
      n === 'connections' || n === 'network and route building' || n === 'tech trees / tech tracks' ||
      n === 'crayon rail system' || n === 'map addition') return 'building';

  return 'other';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\/\:,]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Comprehensive descriptions for all mechanics
const mechanicDescriptions: Record<string, { summary: string; description: string }> = {
  'acting': { summary: 'Players physically act out clues', description: 'Players physically act out clues for other players to guess. This often involves charades-like gameplay where verbal communication is restricted.' },
  'action-event': { summary: 'Cards trigger immediate or delayed effects', description: 'Cards or other game elements can trigger either immediate actions or events that occur at specific times during the game.' },
  'action-drafting': { summary: 'Players select actions from a shared pool', description: 'Players take turns selecting actions from a common pool, with each chosen action becoming unavailable to others until refreshed.' },
  'action-points': { summary: 'Spend points to perform various actions', description: 'A player receives a number of Action Points on their turn, which they may spend on a variety of actions. Different actions may cost different amounts of points.' },
  'action-queue': { summary: 'Actions are programmed in sequence', description: 'Players queue up a sequence of actions that will be executed in order. Planning ahead is crucial as actions resolve based on their position in the queue.' },
  'action-retrieval': { summary: 'Recover previously used actions', description: 'Players can retrieve or refresh actions that were previously used, allowing them to be used again.' },
  'action-timer': { summary: 'Actions limited by real-time constraints', description: 'Actions must be performed within a real-time limit, adding pressure and urgency to decision-making.' },
  'advantage-token': { summary: 'Tokens provide special advantages', description: 'Tokens that grant their holder special advantages or abilities during gameplay.' },
  'alliances': { summary: 'Form temporary partnerships', description: 'Players can form temporary alliances with other players for mutual benefit, though these partnerships may shift throughout the game.' },
  'area-majority-influence': { summary: 'Control areas through presence', description: 'Players compete to have the most pieces or influence in various areas of the board. The player with majority presence typically gains benefits or points.' },
  'area-movement': { summary: 'Move between defined areas', description: 'The board is divided into areas, and pieces move from one area to an adjacent area. Movement is not restricted to a grid pattern.' },
  'area-impulse': { summary: 'Activate areas in sequence', description: 'A wargame system where players activate areas in a specific sequence, with units in activated areas able to move and fight.' },
  'auction-bidding': { summary: 'Bid resources to win items', description: 'Players bid resources (money, cards, etc.) to acquire items, with the highest bidder winning the auction.' },
  'auction-compensation': { summary: 'Losing bidders receive compensation', description: 'In this auction variant, players who lose the auction receive some form of compensation for their participation.' },
  'auction-dexterity': { summary: 'Physical skill affects bidding', description: 'Auction outcomes are influenced by physical dexterity or skill rather than purely by bid amounts.' },
  'auction-dutch': { summary: 'Price decreases until someone buys', description: 'The price starts high and decreases until a player agrees to pay the current price, winning the auction.' },
  'auction-dutch-priority': { summary: 'Dutch auction with priority rules', description: 'A Dutch auction where certain players have priority in claiming items at specific price points.' },
  'auction-english': { summary: 'Open ascending bid auction', description: 'Players openly bid increasing amounts, with the highest bidder winning. Classic auction format with visible bids.' },
  'auction-fixed-placement': { summary: 'Bids placed on fixed positions', description: 'Players place bids on fixed positions or slots, with specific rules about placement and resolution.' },
  'auction-multiple-lot': { summary: 'Multiple items auctioned together', description: 'Multiple items are auctioned simultaneously, with players bidding on combinations or sets.' },
  'auction-once-around': { summary: 'Single bid per player per round', description: 'Each player gets exactly one opportunity to bid in sequence before the auction resolves.' },
  'auction-sealed-bid': { summary: 'Secret simultaneous bidding', description: 'All players submit bids secretly and simultaneously, with bids revealed together to determine the winner.' },
  'auction-turn-order-until-pass': { summary: 'Bid in turn order until passing', description: 'Players bid in turn order, with each player either raising the bid or passing. Passed players cannot re-enter.' },
  'automatic-resource-growth': { summary: 'Resources increase automatically', description: 'Resources grow or accumulate automatically without player action, often at the start of each turn or round.' },
  'betting-and-bluffing': { summary: 'Wager and deceive opponents', description: 'Players make bets and may bluff about their hand strength or intentions to manipulate opponents.' },
  'bias': { summary: 'Asymmetric starting conditions', description: 'Players begin with different starting conditions or advantages, creating asymmetric gameplay from the start.' },
  'bids-as-wagers': { summary: 'Bids represent risk stakes', description: 'Bids serve as wagers where players risk losing their bid if certain conditions are not met.' },
  'bingo': { summary: 'Mark matching items on a grid', description: 'Players mark items on a personal grid as they are called or revealed, trying to complete patterns.' },
  'bribery': { summary: 'Pay others for favors', description: 'Players can pay other players (in game resources) to influence their decisions or gain advantages.' },
  'campaign-battle-card-driven': { summary: 'Cards drive military campaigns', description: 'Military or campaign games where cards determine available actions, events, and combat outcomes.' },
  'card-play-conflict-resolution': { summary: 'Cards determine conflict outcomes', description: 'Conflicts between players are resolved by playing cards, with card values or types determining the winner.' },
  'catch-the-leader': { summary: 'Mechanics target leading player', description: 'Game mechanisms that specifically target or disadvantage the player who is currently winning.' },
  'chaining': { summary: 'Link actions in sequence', description: 'Actions can trigger additional actions in a chain, creating combos or extended turns.' },
  'chit-pull-system': { summary: 'Draw tokens to activate units', description: 'Tokens are drawn randomly to determine which units or factions can act, adding uncertainty to turn order.' },
  'closed-drafting': { summary: 'Draft from hidden selection', description: 'Players draft cards or items from a hand that is passed around, keeping selections hidden until revealed.' },
  'closed-economy-auction': { summary: 'Auction with fixed money supply', description: 'An auction system where money paid goes to other players rather than the bank, keeping total money constant.' },
  'command-cards': { summary: 'Cards issue orders to units', description: 'Special cards that allow players to give commands to their units, determining what actions they can take.' },
  'commodity-speculation': { summary: 'Trade goods for profit', description: 'Players buy and sell commodities, trying to profit from price changes and market fluctuations.' },
  'communication-limits': { summary: 'Restricted player communication', description: 'Rules limit how players can communicate, requiring creative or restricted information sharing.' },
  'connections': { summary: 'Build links between points', description: 'Players create connections or links between points on the board, often for scoring or network effects.' },
  'constrained-bidding': { summary: 'Bidding with restrictions', description: 'Auctions where bids are constrained by specific rules, such as bid increments or resource limitations.' },
  'contracts': { summary: 'Fulfill agreements for rewards', description: 'Players take on contracts that specify conditions for completion and rewards upon fulfillment.' },
  'cooperative-game': { summary: 'Players work together', description: 'All players work together against the game system rather than competing against each other. Either everyone wins or everyone loses.' },
  'crayon-rail-system': { summary: 'Draw routes on the board', description: 'Players literally draw on the board (usually with crayons) to create rail or route networks.' },
  'critical-hits-and-failures': { summary: 'Extreme results on dice rolls', description: 'Certain dice results produce dramatically better or worse outcomes than normal rolls.' },
  'cube-tower': { summary: 'Physical tower randomizes results', description: 'A physical tower where cubes are dropped in, with the output determining game results.' },
  'deck-construction': { summary: 'Build deck before playing', description: 'Players construct their deck before the game begins, selecting cards to include based on strategy.' },
  'deck-bag-and-pool-building': { summary: 'Improve personal card collection', description: 'Players add cards to their personal deck, bag, or pool during the game, improving their options over time.' },
  'deduction': { summary: 'Logic to uncover hidden info', description: 'Players use logic and reasoning to deduce hidden information, such as the identity of a culprit or location of items.' },
  'delayed-purchase': { summary: 'Buy now, pay later', description: 'Players can acquire items with payment deferred to a later time in the game.' },
  'dice-rolling': { summary: 'Roll dice for outcomes', description: 'Players roll dice to determine outcomes, introducing randomness into game decisions and actions.' },
  'die-icon-resolution': { summary: 'Dice symbols trigger effects', description: 'Dice faces show icons or symbols rather than numbers, with each symbol triggering specific effects.' },
  'different-dice-movement': { summary: 'Dice type affects movement', description: 'Different types or colors of dice affect movement in different ways.' },
  'drawing': { summary: 'Create pictures as gameplay', description: 'Players draw pictures as part of the game, often for others to guess or interpret.' },
  'elapsed-real-time-ending': { summary: 'Game ends after set time', description: 'The game ends after a predetermined amount of real time has elapsed.' },
  'enclosure': { summary: 'Surround areas to capture', description: 'Players surround or enclose areas to claim them, often for points or resources.' },
  'end-game-bonuses': { summary: 'Extra points at game end', description: 'Players receive bonus points at the end of the game based on achieving certain conditions.' },
  'events': { summary: 'Triggered occurrences affect play', description: 'Random or scripted events occur during the game that affect all or some players.' },
  'finale-ending': { summary: 'Special final round', description: 'The game ends with a special finale round that differs from normal gameplay.' },
  'flicking': { summary: 'Flick pieces for movement', description: 'Players physically flick game pieces to move them, requiring dexterity and aim.' },
  'follow': { summary: 'Copy another player action', description: 'Players can copy or follow the action of another player, often the active player.' },
  'force-commitment': { summary: 'Allocate forces before revealing', description: 'Players must commit their forces to actions before knowing opponent commitments.' },
  'grid-coverage': { summary: 'Cover grid spaces', description: 'Players attempt to cover or control spaces on a grid pattern board.' },
  'grid-movement': { summary: 'Move on grid squares', description: 'Pieces move on a grid of squares, with movement typically measured in squares.' },
  'hand-management': { summary: 'Optimize card play timing', description: 'Players manage a hand of cards, deciding when to play each card for maximum effect. Timing and card selection are crucial.' },
  'hexagon-grid': { summary: 'Hexagonal tile board', description: 'The game board uses hexagonal tiles or spaces instead of squares, allowing six directions of movement.' },
  'hidden-movement': { summary: 'Secret piece positions', description: 'One or more players move pieces secretly, with their positions unknown to other players.' },
  'hidden-roles': { summary: 'Secret player identities', description: 'Players have secret roles that determine their objectives and allegiances, unknown to other players.' },
  'hidden-victory-points': { summary: 'Secret scoring', description: 'Some or all victory points are hidden from other players until the end of the game.' },
  'highest-lowest-scoring': { summary: 'Extreme values score', description: 'Scoring is based on having the highest or lowest values in certain categories.' },
  'hot-potato': { summary: 'Avoid holding item at end', description: 'Players try to avoid being the one holding a particular item when a timer or round ends.' },
  'i-cut-you-choose': { summary: 'One divides, other chooses', description: 'One player divides resources into portions, and another player chooses which portion to take.' },
  'impulse-movement': { summary: 'Sequential unit activation', description: 'Units are activated in impulses, with each impulse allowing movement or action for a subset of units.' },
  'income': { summary: 'Regular resource generation', description: 'Players receive regular income of resources, typically at the start of each round or turn.' },
  'increase-value-of-unchosen-resources': { summary: 'Unpicked options gain value', description: 'Resources that are not chosen accumulate additional value, making them more attractive over time.' },
  'induction': { summary: 'Pattern recognition from examples', description: 'Players must identify patterns or rules from examples provided during gameplay.' },
  'interrupts': { summary: 'Act during others turns', description: 'Players can interrupt the normal flow of play to take actions during other players turns.' },
  'investment': { summary: 'Spend now for future returns', description: 'Players invest resources now to receive larger returns later in the game.' },
  'kill-steal': { summary: 'Claim others eliminations', description: 'Players can claim credit for eliminations or achievements initiated by other players.' },
  'king-of-the-hill': { summary: 'Control central position', description: 'Players compete to control a central position or area that provides ongoing benefits.' },
  'ladder-climbing': { summary: 'Play higher combinations', description: 'Players must play card combinations that beat the previous play, with the round ending when all pass.' },
  'layering': { summary: 'Stack elements vertically', description: 'Game elements can be stacked or layered on top of each other, creating three-dimensional play.' },
  'legacy-game': { summary: 'Permanent changes between games', description: 'The game permanently changes between sessions, with stickers, destroyed components, and evolving rules.' },
  'line-drawing': { summary: 'Draw lines on board', description: 'Players draw lines on the game board as part of gameplay, creating paths or boundaries.' },
  'line-of-sight': { summary: 'Vision affects targeting', description: 'Units can only target or affect what they can see, with obstacles blocking line of sight.' },
  'loans': { summary: 'Borrow resources with interest', description: 'Players can take loans of resources that must be repaid later, often with interest.' },
  'lose-a-turn': { summary: 'Skip turn as penalty', description: 'Players may be forced to skip their turn as a penalty or game effect.' },
  'mancala': { summary: 'Sow seeds around pits', description: 'Players pick up pieces from a pit and distribute them one at a time around a circuit of pits.' },
  'map-addition': { summary: 'Expand the play area', description: 'New map sections or tiles are added to the play area during the game.' },
  'map-deformation': { summary: 'Modify the map', description: 'The map or board can be physically altered during play, changing geography or connections.' },
  'map-reduction': { summary: 'Shrink the play area', description: 'The play area shrinks over time, forcing players into closer proximity.' },
  'market': { summary: 'Buy and sell with variable prices', description: 'A market system where prices fluctuate based on supply, demand, or other game factors.' },
  'matching': { summary: 'Find identical pairs', description: 'Players try to match identical or related items, often from a set of face-down options.' },
  'measurement-movement': { summary: 'Measure distance for movement', description: 'Movement is determined by physically measuring distance rather than counting spaces.' },
  'melding-and-splaying': { summary: 'Arrange cards in patterns', description: 'Cards are arranged in overlapping patterns (melds) that can be spread (splayed) to reveal information.' },
  'memory': { summary: 'Remember hidden information', description: 'Players must remember hidden information, such as the locations of face-down tiles.' },
  'minimap-resolution': { summary: 'Resolve on smaller map', description: 'Conflicts or actions are resolved on a separate smaller map or display.' },
  'modular-board': { summary: 'Customizable board layout', description: 'The game board is made of interchangeable pieces, creating a different layout each game.' },
  'move-through-deck': { summary: 'Progress through card deck', description: 'Players move through a deck of cards, with position in the deck determining game progress.' },
  'movement-points': { summary: 'Spend points to move', description: 'Movement uses a pool of points, with different terrain or actions costing different amounts.' },
  'movement-template': { summary: 'Physical template guides movement', description: 'Physical templates are used to determine movement paths and distances.' },
  'moving-multiple-units': { summary: 'Control several pieces at once', description: 'Players can move multiple units with a single action or command.' },
  'multi-use-cards': { summary: 'Cards have multiple functions', description: 'Cards can be used in multiple ways, forcing players to choose how to use each card.' },
  'multiple-maps': { summary: 'Play across several maps', description: 'The game uses multiple maps or boards that interact with each other.' },
  'narrative-choice-paragraph': { summary: 'Story-driven decisions', description: 'Players read paragraphs and make choices that determine the story direction.' },
  'negotiation': { summary: 'Discuss deals with players', description: 'Players can negotiate, make deals, and trade with each other through discussion.' },
  'neighbor-scope': { summary: 'Affect adjacent players only', description: 'Actions or effects only apply to players immediately adjacent in turn order or seating.' },
  'network-and-route-building': { summary: 'Create connected paths', description: 'Players build networks of connected routes, often for transportation or scoring.' },
  'once-per-game-abilities': { summary: 'Single-use special powers', description: 'Players have powerful abilities that can only be used once during the entire game.' },
  'open-drafting': { summary: 'Draft from visible options', description: 'Players draft cards or items from a face-up display visible to all players.' },
  'order-counters': { summary: 'Tokens determine action sequence', description: 'Counters or tokens are used to determine the order in which actions resolve.' },
  'ordering': { summary: 'Arrange items in sequence', description: 'Players must arrange items in a specific order or sequence as part of gameplay.' },
  'ownership': { summary: 'Control over game elements', description: 'Players can own or control various game elements, affecting how they can be used.' },
  'paper-and-pencil': { summary: 'Write during gameplay', description: 'Players write on paper as part of the game, recording information or making marks.' },
  'passed-action-token': { summary: 'Token moves when passing', description: 'A token that passes to another player when someone passes their turn or action.' },
  'pattern-building': { summary: 'Create specific arrangements', description: 'Players try to create specific patterns or arrangements with game components.' },
  'pattern-movement': { summary: 'Move in set patterns', description: 'Pieces move in predetermined patterns, like chess pieces.' },
  'pattern-recognition': { summary: 'Identify visual patterns', description: 'Players must identify patterns in visual information presented during the game.' },
  'physical-removal': { summary: 'Remove pieces from play', description: 'Game pieces can be physically removed from the game, often permanently.' },
  'pick-up-and-deliver': { summary: 'Transport goods for rewards', description: 'Players pick up goods from one location and deliver them to another for rewards.' },
  'pieces-as-map': { summary: 'Components form the board', description: 'Game pieces themselves form the play area or map as they are placed.' },
  'player-elimination': { summary: 'Players can be knocked out', description: 'Players can be eliminated from the game before it ends, unable to continue playing.' },
  'player-judge': { summary: 'Players judge submissions', description: 'One or more players act as judge, evaluating other players submissions or performances.' },
  'point-to-point-movement': { summary: 'Move between connected points', description: 'Movement occurs between specific points connected by lines or paths, not on a grid.' },
  'predictive-bid': { summary: 'Bid on expected outcomes', description: 'Players bid on what they predict will happen, scoring based on accuracy.' },
  'prisoners-dilemma': { summary: 'Cooperation vs betrayal choices', description: 'Players face choices between cooperation and betrayal, with outcomes depending on mutual decisions.' },
  'programmed-movement': { summary: 'Pre-plan movement sequence', description: 'Players program their movement in advance, then execute the programmed moves simultaneously.' },
  'push-your-luck': { summary: 'Risk more for greater rewards', description: 'Players repeatedly take risks, weighing potential rewards against the chance of losing everything gained.' },
  'questions-and-answers': { summary: 'Q&A determines outcomes', description: 'Gameplay involves asking and answering questions, with answers affecting game outcomes.' },
  'race': { summary: 'First to goal wins', description: 'Players race to be the first to reach a goal or complete an objective.' },
  'random-production': { summary: 'Randomized resource generation', description: 'Resources are produced randomly, adding uncertainty to economic planning.' },
  'ratio-combat-results-table': { summary: 'Combat odds from table', description: 'Combat results are determined by consulting a table based on the ratio of attacking to defending strength.' },
  're-rolling-and-locking': { summary: 'Reroll or keep dice', description: 'Players can reroll dice while choosing to lock certain results, as in Yahtzee.' },
  'real-time': { summary: 'Continuous simultaneous play', description: 'Players act simultaneously in real-time rather than taking turns.' },
  'relative-movement': { summary: 'Movement based on other pieces', description: 'Movement is determined relative to other game pieces rather than absolute positions.' },
  'resource-queue': { summary: 'Resources in ordered sequence', description: 'Resources are managed in a queue, with order affecting availability or value.' },
  'resource-to-move': { summary: 'Spend resources for movement', description: 'Players must spend resources to move their pieces.' },
  'rock-paper-scissors': { summary: 'Cyclic advantage system', description: 'A system where options have cyclic advantages over each other (A beats B, B beats C, C beats A).' },
  'role-playing': { summary: 'Act as a character', description: 'Players take on the role of a character, making decisions as that character would.' },
  'roles-with-asymmetric-information': { summary: 'Different knowledge per role', description: 'Different roles have access to different information, creating information asymmetry.' },
  'roll-spin-and-move': { summary: 'Random movement distance', description: 'Players roll dice or spin a spinner to determine how far they move.' },
  'rondel': { summary: 'Circular action selection', description: 'Players move markers around a circular track to select actions, with movement cost increasing for distant actions.' },
  'scenario-mission-campaign-game': { summary: 'Linked scenarios tell story', description: 'Multiple scenarios or missions are linked together, often telling an ongoing story.' },
  'score-and-reset-game': { summary: 'Score rounds then reset', description: 'The game consists of multiple rounds where scores are tallied and the game state resets.' },
  'secret-unit-deployment': { summary: 'Hidden unit placement', description: 'Players deploy units secretly, with positions hidden from opponents.' },
  'selection-order-bid': { summary: 'Bid for selection priority', description: 'Players bid to determine the order in which they make selections.' },
  'semi-cooperative-game': { summary: 'Cooperate with individual goals', description: 'Players must cooperate to some degree but also have individual victory conditions.' },
  'set-collection': { summary: 'Gather matching sets', description: 'Players collect sets of items (cards, tiles, etc.) to score points or achieve objectives.' },
  'simulation': { summary: 'Model real-world systems', description: 'The game simulates real-world systems or situations with some degree of accuracy.' },
  'simultaneous-action-selection': { summary: 'Choose actions together', description: 'All players choose their actions at the same time, then reveal them together for resolution.' },
  'singing': { summary: 'Sing as gameplay element', description: 'Players must sing as part of the game, often for others to guess songs.' },
  'single-loser-game': { summary: 'Avoid being last', description: 'Instead of a winner, the game has a single loser - the last player standing loses.' },
  'slide-push': { summary: 'Slide pieces to move', description: 'Pieces are moved by sliding them, often pushing other pieces in the process.' },
  'solo-solitaire-game': { summary: 'Single player mode', description: 'The game can be played solo, with the player competing against the game system.' },
  'speed-matching': { summary: 'Quick pattern matching', description: 'Players race to match patterns as quickly as possible.' },
  'spelling': { summary: 'Form words from letters', description: 'Players form words from available letters, as in Scrabble.' },
  'square-grid': { summary: 'Square tile board', description: 'The game board uses a grid of square spaces.' },
  'stacking-and-balancing': { summary: 'Stack pieces carefully', description: 'Players must stack or balance pieces, with the structure potentially collapsing.' },
  'stat-check-resolution': { summary: 'Compare stats to resolve', description: 'Outcomes are determined by comparing character or unit statistics.' },
  'static-capture': { summary: 'Capture by occupying', description: 'Pieces are captured by moving to their space, as in chess.' },
  'stock-holding': { summary: 'Own shares in companies', description: 'Players buy and sell shares in companies, profiting from dividends and price changes.' },
  'storytelling': { summary: 'Create narrative together', description: 'Players collaboratively create a story, with gameplay elements guiding the narrative.' },
  'sudden-death-ending': { summary: 'Instant win condition', description: 'The game can end instantly when a specific condition is met.' },
  'tags': { summary: 'Keywords categorize items', description: 'Game elements have tags or keywords that categorize them and determine interactions.' },
  'take-that': { summary: 'Direct attacks on opponents', description: 'Players can directly attack or hinder other players, often through card play.' },
  'targeted-clues': { summary: 'Clues for specific players', description: 'Clues are given to specific players, requiring deduction about why you received certain clues.' },
  'team-based-game': { summary: 'Fixed teams compete', description: 'Players are divided into fixed teams that compete against each other.' },
  'tech-trees-tech-tracks': { summary: 'Unlock improvements in sequence', description: 'Players progress along technology trees or tracks, unlocking new abilities and improvements.' },
  'three-dimensional-movement': { summary: 'Move in 3D space', description: 'Pieces can move in three dimensions, not just on a flat plane.' },
  'tile-placement': { summary: 'Place tiles to build', description: 'Players place tiles to build a shared or personal playing area, often with matching requirements.' },
  'track-movement': { summary: 'Move along fixed tracks', description: 'Pieces move along predetermined tracks rather than freely on a board.' },
  'trading': { summary: 'Exchange items with players', description: 'Players exchange resources, cards, or other game elements with each other through trades.' },
  'traitor-game': { summary: 'Hidden enemy among players', description: 'One or more players secretly work against the group, trying to sabotage without being discovered.' },
  'trick-taking': { summary: 'Win card rounds', description: 'Players play cards in rounds (tricks), with the highest card of the led suit (or trump) winning the trick.' },
  'tug-of-war': { summary: 'Push-pull between sides', description: 'A marker moves back and forth between opposing sides based on player actions.' },
  'turn-order-auction': { summary: 'Bid for turn position', description: 'Players bid to determine their position in turn order.' },
  'turn-order-claim-action': { summary: 'Claiming sets turn order', description: 'Turn order for the next round is determined by which action spaces players claimed.' },
  'turn-order-pass-order': { summary: 'Pass order sets turns', description: 'The order in which players pass determines turn order for the next round.' },
  'turn-order-progressive': { summary: 'Turn order shifts regularly', description: 'Turn order changes in a regular pattern, often rotating or reversing.' },
  'turn-order-random': { summary: 'Random turn sequence', description: 'Turn order is determined randomly each round.' },
  'turn-order-role-order': { summary: 'Roles determine turn order', description: 'Turn order is determined by players roles or positions in the game.' },
  'turn-order-stat-based': { summary: 'Stats determine turn order', description: 'Turn order is determined by comparing player or unit statistics.' },
  'turn-order-time-track': { summary: 'Time track sets turn order', description: 'Players take turns based on their position on a time track, with the furthest behind going next.' },
  'variable-phase-order': { summary: 'Phase order can change', description: 'The order of game phases can vary from round to round.' },
  'variable-player-powers': { summary: 'Unique player abilities', description: 'Each player has unique abilities or powers that create asymmetric gameplay.' },
  'variable-set-up': { summary: 'Different starting setups', description: 'The game can start with different configurations, adding variety to each play.' },
  'victory-points-as-a-resource': { summary: 'Spend VPs for effects', description: 'Victory points can be spent during the game for various effects, not just counted at the end.' },
  'voting': { summary: 'Decide by majority vote', description: 'Players vote to make collective decisions, with majority typically winning.' },
  'worker-placement': { summary: 'Place workers to claim actions', description: 'Players place worker tokens on action spaces to perform actions, blocking others from using those spaces until workers are retrieved.' },
  'worker-placement-with-dice-workers': { summary: 'Dice serve as workers', description: 'Dice are used as workers, with their values affecting what actions they can take or their effectiveness.' },
  'worker-placement-different-worker-types': { summary: 'Specialized worker types', description: 'Different types of workers have different capabilities or restrictions on where they can be placed.' },
  'zone-of-control': { summary: 'Units restrict enemy movement', description: 'Units exert control over adjacent spaces, restricting or affecting enemy movement through those areas.' },
};

function getMechanicInfo(slug: string, name: string): { summary: string; description: string } {
  if (mechanicDescriptions[slug]) {
    return mechanicDescriptions[slug];
  }
  // Generate a basic description for any missing mechanics
  return {
    summary: `${name} mechanic`,
    description: `${name} is a board game mechanic that affects how players interact with the game.`
  };
}

interface MechanicData extends MechanicDef {
  summary: string;
}

function generateMarkdown(mech: MechanicData): string {
  return `---
id: ${mech.id}
name: "${mech.name}"
slug: ${mech.slug}
category: ${mech.category}
summary: "${mech.summary}"
bgg_url: ${mech.bggUrl}
---

# ${mech.name}

${mech.description}

## Reference

- **BGG ID**: ${mech.id}
- **Category**: ${mech.category}
- **BGG URL**: [${mech.name}](${mech.bggUrl})

## Usage in RULES.md

\`\`\`yaml
---
name: "My Game"
mechanics:
  - ${mech.slug}
---
\`\`\`
`;
}

function main() {
  const rawPath = join(MECHANICS_DIR, '_raw_mechanics.txt');
  const raw = readFileSync(rawPath, 'utf-8');

  const mechanics: MechanicData[] = [];
  const categories = new Set<string>();

  for (const line of raw.trim().split('\n')) {
    const [id, name] = line.split('|');
    if (!id || !name) continue;

    const slug = slugify(name);
    const category = categorize(name);
    const { summary, description } = getMechanicInfo(slug, name.trim());
    categories.add(category);

    mechanics.push({
      id: id.trim(),
      name: name.trim(),
      slug,
      category,
      summary,
      description,
      bggUrl: `https://boardgamegeek.com/boardgamemechanic/${id.trim()}/${slug}`
    });
  }

  // Ensure category directories exist
  for (const cat of categories) {
    const catDir = join(MECHANICS_DIR, cat);
    if (!existsSync(catDir)) {
      mkdirSync(catDir, { recursive: true });
    }
  }

  // Generate markdown files
  for (const mech of mechanics) {
    const filePath = join(MECHANICS_DIR, mech.category, `${mech.slug}.md`);
    writeFileSync(filePath, generateMarkdown(mech));
  }

  // Generate index.json
  const index = {
    generated: new Date().toISOString(),
    source: 'https://boardgamegeek.com/browse/boardgamemechanic',
    count: mechanics.length,
    categories: [...categories].sort(),
    mechanics: mechanics.map(m => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      category: m.category,
      path: `${m.category}/${m.slug}.md`
    }))
  };

  writeFileSync(join(MECHANICS_DIR, 'index.json'), JSON.stringify(index, null, 2));

  // Generate category index files
  for (const cat of categories) {
    const catMechanics = mechanics.filter(m => m.category === cat);
    const catIndex = `# ${cat.charAt(0).toUpperCase() + cat.slice(1)} Mechanics

${catMechanics.map(m => `- [${m.name}](./${m.slug}.md)`).join('\n')}
`;
    writeFileSync(join(MECHANICS_DIR, cat, 'README.md'), catIndex);
  }

  console.log(`Generated ${mechanics.length} mechanic files in ${categories.size} categories`);
  console.log('Categories:', [...categories].sort().join(', '));
}

main();
