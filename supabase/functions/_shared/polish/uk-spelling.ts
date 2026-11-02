// American to British spelling. An explicit word list plus one rule (-ize/-yze to -ise/-yse).
// -or/-our and -er/-re are listed word by word, because rules would wrongly change words such as
// doctor, humorous, meter (the device) and parameter.
import type { SpellingChange } from "./report.ts";
import { isSentenceStart, matchCase } from "./text.ts";

const pairs: [string, string][] = [];

/** Adds `usStem + suffix` to `ukStem + suffix` for each space-separated suffix ("-" means none). */
function family(usStem: string, ukStem: string, suffixes: string): void {
  for (const suffix of suffixes.split(" ")) {
    const end = suffix === "-" ? "" : suffix;
    pairs.push([usStem + end, ukStem + end]);
  }
}

/** British doubles the final l (or p) before these endings: traveled to travelled. */
function doubled(stem: string, suffixes: string): void {
  const last = stem.charAt(stem.length - 1);
  for (const suffix of suffixes.split(" ")) pairs.push([stem + suffix, stem + last + suffix]);
}

function words(list: string): void {
  for (const pair of list.trim().split(/\s+/)) {
    const [us, uk] = pair.split(">");
    if (us && uk) pairs.push([us, uk]);
  }
}

// -or to -our. Endings are listed per word because humorous, laborious, honorary and vigorous do not change.
family("color", "colour", "- s ed ing ings ful fully less ist ists");
family("watercolor", "watercolour", "- s");
family("discolor", "discolour", "- s ed ing");
family("multicolor", "multicolour", "- ed");
family("flavor", "flavour", "- s ed ing ings ful less some");
family("humor", "humour", "- s ed ing less");
family("labor", "labour", "- s ed ing er ers");
family("neighbor", "neighbour", "- s hood hoods ing ly liness");
family("behavior", "behaviour", "- s al ally ist ists ism");
family("misbehavior", "misbehaviour", "-");
family("favor", "favour", "- s ed ing able ably ite ites itism");
family("unfavor", "unfavour", "able ably");
family("disfavor", "disfavour", "-");
family("honor", "honour", "- s ed ing able ably");
family("dishonor", "dishonour", "- s ed able");
family("harbor", "harbour", "- s ed ing");
family("rumor", "rumour", "- s ed");
family("vapor", "vapour", "- s");
family("vigor", "vigour", "-");
family("savior", "saviour", "- s");
family("armor", "armour", "- s ed er y");
family("endeavor", "endeavour", "- s ed ing");
family("odor", "odour", "- s less");
family("parlor", "parlour", "- s");
family("rigor", "rigour", "- s");
family("valor", "valour", "-");
family("clamor", "clamour", "- s ed ing");
family("splendor", "splendour", "- s");
family("tumor", "tumour", "- s");
family("candor", "candour", "-");
family("fervor", "fervour", "-");
family("ardor", "ardour", "-");
family("demeanor", "demeanour", "-");
family("rancor", "rancour", "-");
family("glamor", "glamour", "-");
family("savor", "savour", "- s ed ing y");
family("unsavor", "unsavour", "y");
family("mold", "mould", "- s ed ing ings y");
family("smolder", "smoulder", "- s ed ing");
family("molt", "moult", "- s ed ing");
words("armories>armouries armory>armoury");

// -er to -re. Meter (the device), parameter and diameter are deliberately absent.
family("center", "centre", "- s");
family("centerpiece", "centrepiece", "- s");
family("epicenter", "epicentre", "- s");
family("theater", "theatre", "- s");
family("fiber", "fibre", "- s");
family("liter", "litre", "- s");
family("kilometer", "kilometre", "- s");
family("centimeter", "centimetre", "- s");
family("millimeter", "millimetre", "- s");
family("milliliter", "millilitre", "- s");
family("caliber", "calibre", "- s");
family("saber", "sabre", "- s");
family("somber", "sombre", "- ly");
family("specter", "spectre", "- s");
family("meager", "meagre", "- ly");
family("scepter", "sceptre", "- s");
family("louver", "louvre", "- s");
family("miter", "mitre", "- s");
words(`
  centered>centred centering>centring fiberglass>fibreglass luster>lustre sepulcher>sepulchre
  ocher>ochre saltpeter>saltpetre goiter>goitre reconnoiter>reconnoitre
  maneuver>manoeuvre maneuvers>manoeuvres maneuvered>manoeuvred maneuvering>manoeuvring
  maneuverable>manoeuvrable maneuverability>manoeuvrability
`);

// -ense to -ence (nouns only; defensive and offensive do not change).
family("defense", "defence", "- s");
family("offense", "offence", "- s");
family("pretense", "pretence", "- s");

// -og to -ogue.
family("catalog", "catalogue", "- s");
family("dialog", "dialogue", "- s");
family("analog", "analogue", "- s");
family("monolog", "monologue", "- s");
words("cataloged>catalogued cataloging>cataloguing prolog>prologue epilog>epilogue");

// Doubled l (and p) before an ending.
doubled("travel", "ed ing er ers");
doubled("cancel", "ed ing");
doubled("label", "ed ing");
doubled("model", "ed ing er ers");
doubled("remodel", "ed ing");
doubled("fuel", "ed ing");
doubled("refuel", "ed ing");
doubled("level", "ed ing");
doubled("signal", "ed ing");
doubled("total", "ed ing");
doubled("channel", "ed ing");
doubled("tunnel", "ed ing");
doubled("marshal", "ed ing");
doubled("dial", "ed ing er ers");
doubled("equal", "ed ing");
doubled("quarrel", "ed ing");
doubled("counsel", "ed ing or ors");
doubled("jewel", "er ers");
doubled("marvel", "ed ing ous ously");
doubled("panel", "ed ing ist ists");
doubled("pencil", "ed ing");
doubled("rival", "ed ing");
doubled("shovel", "ed ing");
doubled("snorkel", "ed ing");
doubled("spiral", "ed ing");
doubled("duel", "ed ing");
doubled("grovel", "ed ing");
doubled("initial", "ed ing");
doubled("libel", "ed ing ous");
doubled("revel", "ed ing er ers");
doubled("worship", "ed ing er ers");
doubled("bevel", "ed ing");
doubled("swivel", "ed ing");
doubled("pummel", "ed ing");
doubled("unravel", "ed ing");
doubled("yodel", "ed ing");
words("barreled>barrelled chiseled>chiselled enameled>enamelled graveled>gravelled tasseled>tasselled disheveled>dishevelled");
words("cancelation>cancellation jewelry>jewellery woolen>woollen tranquility>tranquillity tranquilizer>tranquilliser tranquilizers>tranquillisers tranquilize>tranquillise tranquilized>tranquillised");

// Single l where American doubles it.
words(`
  enroll>enrol enrolls>enrols enrollment>enrolment enrollments>enrolments
  fulfill>fulfil fulfills>fulfils fulfillment>fulfilment fulfillments>fulfilments
  skillful>skilful skillfully>skilfully willful>wilful willfully>wilfully
  installment>instalment installments>instalments distill>distil distills>distils
  instill>instil instills>instils enthrall>enthral enthralls>enthrals appall>appal appalls>appals
`);

// ae and oe.
words(`
  anemia>anaemia anemic>anaemic anesthesia>anaesthesia anesthetic>anaesthetic anesthetics>anaesthetics
  anesthetist>anaesthetist anesthetists>anaesthetists anesthetize>anaesthetise
  pediatric>paediatric pediatrics>paediatrics pediatrician>paediatrician pediatricians>paediatricians
  orthopedic>orthopaedic orthopedics>orthopaedics gynecology>gynaecology gynecologist>gynaecologist
  gynecologists>gynaecologists hemorrhage>haemorrhage hemoglobin>haemoglobin hematology>haematology
  hemophilia>haemophilia leukemia>leukaemia diarrhea>diarrhoea esophagus>oesophagus estrogen>oestrogen
  edema>oedema cesarean>caesarean archeology>archaeology archeologist>archaeologist
  archeologists>archaeologists archeological>archaeological paleontology>palaeontology
  paleontologist>palaeontologist esthetic>aesthetic esthetics>aesthetics eon>aeon eons>aeons
`);

// Everything else.
words(`
  aluminum>aluminium gray>grey grayish>greyish grayscale>greyscale grayed>greyed graying>greying
  plow>plough plows>ploughs plowed>ploughed plowing>ploughing pajamas>pyjamas pajama>pyjama
  cozy>cosy cozier>cosier coziest>cosiest coziness>cosiness cozily>cosily mustache>moustache mustaches>moustaches
  skeptic>sceptic skeptics>sceptics skeptical>sceptical skeptically>sceptically skepticism>scepticism
  artifact>artefact artifacts>artefacts airplane>aeroplane airplanes>aeroplanes aging>ageing
  acknowledgment>acknowledgement acknowledgments>acknowledgements donut>doughnut donuts>doughnuts
  math>maths toward>towards afterward>afterwards checkered>chequered omelet>omelette omelets>omelettes
  sulfur>sulphur sulfate>sulphate sulfates>sulphates sulfide>sulphide sulfuric>sulphuric
  tidbit>titbit tidbits>titbits yogurt>yoghurt yogurts>yoghurts behoove>behove behooves>behoves
  carburetor>carburettor carburetors>carburettors draftsman>draughtsman draftsmen>draughtsmen drafty>draughty
  mollusk>mollusc mollusks>molluscs furor>furore thru>through
`);

export const US_TO_UK: ReadonlyMap<string, string> = new Map(pairs);

// -ize/-yze rule. Roots that end in "ize" in British English too.
const IZE = /^([a-z]+?)([iy])z(e|es|ed|er|ers|ing|ation|ations|able)$/;
const IZE_EXCEPTIONS = ["size", "seize", "maize", "baize", "prize", "assize", "belize"];

function izeToIse(word: string): string | undefined {
  const match = IZE.exec(word);
  if (!match) return undefined;
  const [, stem = "", vowel = "", ending = ""] = match;
  const root = `${stem}${vowel}ze`;
  if (stem.length < 2 || IZE_EXCEPTIONS.some((exception) => root.endsWith(exception))) return undefined;
  return `${stem}${vowel}s${ending}`;
}

export function ukSpellingOf(lowerWord: string): string | undefined {
  return US_TO_UK.get(lowerWord) ?? izeToIse(lowerWord);
}

export interface UkSpellingResult {
  text: string;
  changes: SpellingChange[];
}

export function toUkSpelling(input: string): UkSpellingResult {
  return convertSpelling(input, ukSpellingOf);
}

/** Swaps every word `lookup` knows, keeping its case. Shared by the British and American passes. */
export function convertSpelling(input: string, lookup: (lowerWord: string) => string | undefined): UkSpellingResult {
  const counts = new Map<string, SpellingChange>();

  const text = input.replace(/\p{L}+/gu, (word: string, offset: number, whole: string) => {
    const lower = word.toLowerCase();
    const isLower = word === lower;
    const isUpper = word.length > 1 && word === word.toUpperCase();
    const isCapitalised = !isLower && !isUpper && word.slice(1) === lower.slice(1);
    // Mixed case (ColorPicker) is code; a capital mid-sentence is probably a name (Lincoln Center).
    if (!isLower && !isUpper && !(isCapitalised && isSentenceStart(whole, offset))) return word;

    const swapped = lookup(lower);
    if (!swapped) return word;
    const change = counts.get(lower) ?? { from: lower, to: swapped, count: 0 };
    change.count++;
    counts.set(lower, change);
    return matchCase(word, swapped);
  });

  return { text: counts.size === 0 ? input : text, changes: [...counts.values()] };
}
