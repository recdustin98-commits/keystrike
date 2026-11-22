// Word pools by length. Lowercase a-z only.
const W3 = 'ace arc ash bay bit bog box bud cab cog cow cub cup dab den dew dot dye eel elf elm emu fan fig fin fir fog fox fun gap gem gum hat hen hop hub hue ice ink ion ivy jam jar jaw jet jog joy keg key kit lab lap log lux map mob mud nap net nib nut oak oar ore owl pad paw pod pun ray rib rim rod rye sap saw sky sun tab tan tin toe ton urn van vat wax web wig yak yam zap zen zip'.split(' ');
const W4 = 'apex atom axis beam bolt bond calm clay coal comb core crab dart dawn dock dove drum dune dust echo edge envy fern fire flux foam fuel gale glow gold grip gust halo hawk haze helm husk iris iron isle jade jolt kelp kite knot lake lava leaf lime lynx mars maze mint mist moon nail neon nest nova oath onyx opal orbit pace palm peak pine plum pulse quad quay quiz rain reef ring rock ruby rust sail salt silk snow soar star surf tide tusk vast veil vibe void volt warp wave wing wolf yarn yawn yoke zeal zero zinc zone'.split(' ').filter(w => w.length === 4);
const W5 = 'amber angle arrow badge beach blade blaze bloom brave brick cabin camel cargo chalk chase cliff cloud cobra comet coral crane crown delta drift eagle earth ember epoch fable feast flame flash fleet frost ghost giant glide globe grain gravy haven heart honey horse hover image ivory jelly jewel joker karma kayak knife laser lemon light lunar magic maple medal metal minor motor noble north ocean olive orbit otter pearl pilot pixel plane polar prism pulse quake quest quiet radar raven ridge river robot rover sabre shark shell solar sonic spark speed spice storm swift tiger titan torch trail ultra umbra urban valve vapor vigor viper whale wheat whirl xenon yacht yield zebra'.split(' ');
const W6 = 'anchor arctic aurora beacon bridge bronze cactus candle canyon carbon castle cipher cobalt cosmic dagger desert dragon engine falcon fathom flight forest galaxy garnet glider hammer harbor helium hunter impact island jaguar jungle kernel kettle ladder lagoon legend magnet marble meteor mirror motion nebula nectar office oyster parrot pepper photon planet plasma pollen puzzle quartz quiver radius rocket saddle salmon shield signal silver socket sphere spiral sprint stream summit tandem temple thrust timber tundra turbine tunnel unicorn vector velvet violet vortex walrus window wizard yogurt zenith zigzag'.split(' ').filter(w => w.length === 6);
const W7 = 'antenna asteroid balance bandana blizzard captain caravan cascade century chimney climate cockpit compass crystal current diamond dolphin eclipse emerald element equator fortune freedom gallery gateway glacier gravity harmony horizon hydrant iceberg journey jukebox kingdom lantern leopard library machine mammoth mercury mineral mission monster mystery neptune network nucleus octopus orchard outpost painter panther pelican phantom pioneer pyramid quantum rainbow reactor rhythm sapphire scanner shuttle stardust station sunrise thunder tornado trumpet uranium venture victory volcano voltage warrior whisper'.split(' ').filter(w => w.length === 7);
const W8 = 'aircraft airspace alphabet asteroid backbone blackout calendar cardinal champion chemical crescent daylight dinosaur dynamite electric elephant emission fireball firework flamingo galactic gemstone graphite guardian headwind hologram horsefly icebound infinity iridium keyboard landmark launcher magnetic marathon meteoric midnight moonbeam mountain nebulous northern obsidian octagonal overdrive parallel pinnacle platinum quantity radiance rainfall sapphire satellite seashell skylight slipstream solstice spaceman stardust starship sunlight tailwind thruster titanium triangle twilight universe velocity warpgate windmill'.split(' ').filter(w => w.length === 8);

const P = [
  [W3, W4],
  [W3, W4, W5],
  [W4, W5],
  [W4, W5, W6],
  [W5, W6],
  [W5, W6, W7],
  [W6, W7, W8],
].map(g => [].concat(...g));

// Pool by distance travelled (meters). Deterministic for every player.
export function wordsFor(d) {
  const i = d < 250 ? 0 : d < 550 ? 1 : d < 900 ? 2 : d < 1300 ? 3 : d < 1800 ? 4 : d < 2600 ? 5 : 6;
  return P[i];
}
