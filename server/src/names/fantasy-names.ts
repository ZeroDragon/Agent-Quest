/**
 * Random fantasy names for agent heroes.
 * Used when creating new agents to give them a unique identity.
 */

const FANTASY_NAMES = [
  // Warriors
  'Thorin', 'Gimli', 'Boromir', 'Aragorn', 'Faramir', 'Eomer', 'Balin',
  'Dwalin', 'Gloin', 'Oin', 'Dori', 'Nori', 'Ori', 'Bifur', 'Bofur', 'Bombur',
  // Mages
  'Gandalf', 'Saruman', 'Radagast', 'Gimli', 'Elrond', 'Legolas', 'Glorfindel',
  'Cirdan', 'Galadriel', 'Celeborn', 'Thranduil', 'Galdor', 'Erestor', 'Gildor',
  // Rangers
  'Strider', 'Halbarad', 'Dirhael', 'Arahad', 'Arathorn', 'Gilraen',
  'Diron', 'Maltagar', 'Orleg', 'Strider', 'Aranarth', 'Cirion',
  // Elves
  'Thranduil', 'Legolas', 'Elladan', 'Elrohir', 'Estel', 'Glorfindel',
  'Luthien', 'Arwen', 'Idril', 'Nimrodel', 'Aredhel', 'Finduilas',
  // Dwarves
  'Durin', 'Thrain', 'Thror', 'Dain', 'Brand', 'Bard', 'Girion',
  'Farin', 'Gror', 'Nain', 'Thori', 'Dori', 'Nori', 'Ori',
  // Hobbits
  'Frodo', 'Samwise', 'Merry', 'Pippin', 'Bilbo', 'Bingo', 'Primula',
  'Drogo', 'Hamfast', 'Gaffer', 'Tolman', 'Rosie', 'Lobelia', 'Otho',
  // Men
  'Theoden', 'Eowyn', 'Eomer', 'Denethor', 'Beregond', 'Beregond',
  'Hurin', 'Huor', 'Tuor', 'Turgon', 'Finrod', 'Orodreth',
  // Wizards
  'Alatar', 'Pallando', 'Curunir', 'Aiwendil', 'Olvar', 'Eldacar',
  // Other
  'Shadowfax', 'Brego', 'Asfaloth', 'Bill', 'Strider', 'Fatty',
  'Hamson', 'Fredegar', 'Olo', 'Wiseman', 'Harding', 'Garth',
  // Modern fantasy
  'Kael', 'Lyra', 'Theron', 'Aria', 'Zephyr', 'Nova', 'Orion',
  'Sage', 'Raven', 'Phoenix', 'Ember', 'Storm', 'Shadow', 'Blaze',
  'Drake', 'Wynter', 'Ash', 'Rune', 'Mystic', 'Crystal', 'Sylvan',
  'Vex', 'Echo', 'Rift', 'Flux', 'Byte', 'Core', 'Null',
  'Vector', 'Pixel', 'Matrix', 'Cipher', 'Node', 'Stack', 'Heap',
];

/**
 * Pick a random name from the fantasy names list.
 */
export function pickRandomName(): string {
  return FANTASY_NAMES[Math.floor(Math.random() * FANTASY_NAMES.length)]!;
}
