// 영어 단어 목록 (등급별) — "단어:뜻" 형식
// 1~3등급: 중1~중3 · 4~6등급: 고1~고3 · 7등급: 수능 고난도 · 8등급: 대학·토익 · 9등급: 고급(GRE급)
// 3차에서 관리 화면으로 추가·교체한 단어가 있으면 그 목록이 우선 적용됩니다.

export const LEVEL_NAMES = {
  1: "중1", 2: "중2", 3: "중3",
  4: "고1", 5: "고2", 6: "고3",
  7: "수능 고난도", 8: "대학·토익", 9: "고급"
};

const RAW = {
  1: `apple:사과, bread:빵, chair:의자, clock:시계, cloud:구름, dream:꿈, earth:지구, field:들판, fruit:과일,
glass:유리잔, green:초록색, happy:행복한, heart:심장, horse:말(동물), house:집, juice:주스, lemon:레몬, light:빛,
money:돈, mouse:생쥐, music:음악, night:밤, ocean:바다, paper:종이, party:파티, plant:식물, queen:여왕, river:강,
salad:샐러드, sheep:양, shirt:셔츠, smile:미소, snake:뱀, stone:돌, story:이야기, sugar:설탕, table:탁자,
tiger:호랑이, toast:토스트, train:기차, truck:트럭, voice:목소리, water:물, watch:손목시계, whale:고래, white:흰색,
woman:여자, world:세계, write:쓰다, young:젊은, bird:새, book:책, cake:케이크, desk:책상, door:문, face:얼굴,
farm:농장, fish:물고기, hand:손, milk:우유, moon:달, rain:비, ship:배(선박), star:별, tree:나무, wind:바람,
family:가족, friend:친구, school:학교, garden:정원, mother:어머니, father:아버지, flower:꽃, summer:여름,
winter:겨울, window:창문, animal:동물, orange:오렌지, yellow:노란색`,

  2: `beach:해변, brain:뇌, brave:용감한, catch:잡다, cheap:값이 싼, clean:깨끗한, climb:오르다, coach:코치,
dance:춤추다, diary:일기, dirty:더러운, early:이른, empty:비어 있는, enjoy:즐기다, fever:열(병), floor:바닥,
fresh:신선한, guest:손님, guide:안내하다, honey:꿀, hobby:취미, human:인간, judge:판사, knife:칼, laugh:웃다,
magic:마법, metal:금속, noise:소음, nurse:간호사, peace:평화, price:가격, prize:상(상품), quiet:조용한, quick:빠른,
scene:장면, sleep:잠자다, solve:해결하다, space:우주, speak:말하다, spend:(돈·시간을) 쓰다, storm:폭풍, sweet:달콤한,
thief:도둑, tired:피곤한, tooth:이(치아), uncle:삼촌, visit:방문하다, wrong:틀린, bridge:다리(교량), castle:성,
danger:위험, hunger:굶주림, island:섬, letter:편지, market:시장, museum:박물관, number:숫자, pocket:주머니,
ticket:표, weather:날씨, holiday:휴일, library:도서관, kitchen:부엌, picture:그림`,

  3: `abroad:해외로, accept:받아들이다, active:활동적인, advice:충고, allow:허락하다, amount:양, ancient:고대의,
anxious:불안한, borrow:빌리다, bother:귀찮게 하다, career:직업 경력, choose:고르다, climate:기후, common:흔한,
create:창조하다, culture:문화, damage:손상, decide:결정하다, depend:의존하다, effort:노력, energy:에너지,
escape:탈출하다, event:행사, exist:존재하다, expect:기대하다, factor:요인, focus:집중하다, forest:숲,
global:세계적인, habit:습관, health:건강, invent:발명하다, journey:여행(여정), leader:지도자, manage:관리하다,
method:방법, nature:자연, notice:알아차리다, object:물체, planet:행성, polite:공손한, prefer:선호하다,
prepare:준비하다, protect:보호하다, reason:이유, recycle:재활용하다, remain:남다, result:결과, review:검토하다,
shadow:그림자, signal:신호, similar:비슷한, source:근원, suggest:제안하다, survive:살아남다, travel:여행하다,
unique:독특한, voyage:항해, waste:낭비하다, wisdom:지혜, worry:걱정하다, novel:소설, pride:자부심, crowd:군중,
chief:주된, faith:믿음, ghost:유령, grade:성적, lucky:운이 좋은, react:반응하다, smell:냄새`,

  4: `achieve:성취하다, adapt:적응하다, admire:존경하다, affect:영향을 미치다, approach:접근하다, attitude:태도,
available:이용 가능한, benefit:이익, capable:유능한, challenge:도전, citizen:시민, compare:비교하다, complex:복잡한,
conflict:갈등, consume:소비하다, contain:포함하다, current:현재의, decline:감소하다, deliver:배달하다, demand:요구,
describe:묘사하다, device:장치, digital:디지털의, disease:질병, element:요소, emotion:감정, encourage:격려하다,
essential:필수적인, evidence:증거, extend:연장하다, feature:특징, function:기능, generate:만들어 내다,
identify:확인하다, impact:영향, improve:개선하다, include:포함하다, income:소득, involve:관련시키다, measure:측정하다,
mental:정신의, observe:관찰하다, occur:발생하다, opinion:의견, physical:신체의, positive:긍정적인, predict:예측하다,
previous:이전의, pressure:압력, require:요구하다, respond:응답하다, scholar:학자, species:종(생물), strategy:전략,
structure:구조, support:지지하다, theory:이론, valuable:귀중한, variety:다양성, region:지역, crisis:위기,
label:꼬리표, logic:논리, guilt:죄책감, trend:경향, steady:꾸준한, rescue:구조하다, launch:출시하다, phrase:구절,
solar:태양의, rural:시골의, urban:도시의, vital:필수적인, blame:비난하다, cheer:응원하다`,

  5: `abandon:버리다, absorb:흡수하다, abstract:추상적인, accurate:정확한, acquire:얻다, adequate:적절한,
advocate:옹호하다, allocate:할당하다, alternative:대안, analyze:분석하다, anticipate:예상하다, apparent:명백한,
assess:평가하다, assume:가정하다, attribute:속성, authority:권위, barrier:장벽, bias:편견, capacity:용량,
coherent:일관성 있는, collapse:붕괴하다, commit:저지르다, compensate:보상하다, conceive:상상하다, concrete:구체적인,
consistent:한결같은, constrain:제약하다, contrast:대조, contribute:기여하다, convert:전환하다, criteria:기준,
crucial:중대한, decay:부패하다, deny:부인하다, derive:유래하다, distinct:뚜렷한, diverse:다양한, dominate:지배하다,
enhance:향상시키다, ethical:윤리적인, exploit:이용하다, facilitate:촉진하다, flexible:유연한, fragile:깨지기 쉬운,
imply:암시하다, inherent:고유한, insight:통찰력, interpret:해석하다, justify:정당화하다, mature:성숙한,
modify:수정하다, neglect:소홀히 하다, obtain:얻다, perceive:인지하다, pursue:추구하다, retain:유지하다,
sustain:지속하다, vague:모호한, yield:산출하다, grasp:이해하다, merit:장점, prone:~하기 쉬운, scope:범위,
trait:특성, cease:중단하다, rigid:엄격한, swift:신속한, dense:빽빽한, fiber:섬유, prime:주요한, cite:인용하다`,

  6: `accommodate:수용하다, accumulate:축적하다, ambiguous:모호한, arbitrary:임의의, articulate:분명히 표현하다,
autonomy:자율성, coincide:동시에 일어나다, compatible:양립할 수 있는, comprehensive:포괄적인, conform:따르다,
contemplate:숙고하다, controversy:논란, correspond:일치하다, deteriorate:악화되다, discrepancy:불일치,
disposition:성향, elaborate:정교한, eliminate:제거하다, empirical:경험적인, endeavor:노력, equivalent:동등한,
evoke:불러일으키다, fluctuate:변동하다, hypothesis:가설, implement:시행하다, inevitable:불가피한, infer:추론하다,
integrate:통합하다, intrinsic:본질적인, manipulate:조작하다, mediate:중재하다, negligible:무시해도 될, notion:개념,
paradox:역설, phenomenon:현상, plausible:그럴듯한, precede:앞서다, prevail:우세하다, profound:심오한,
reconcile:화해시키다, refute:반박하다, reinforce:강화하다, resilient:회복력 있는, scrutiny:정밀 조사,
simultaneous:동시의, subtle:미묘한, superficial:피상적인, suppress:억압하다, tangible:실체가 있는,
undermine:약화시키다, verify:검증하다, vulnerable:취약한, adhere:고수하다, revoke:철회하다, oblige:의무를 지우다,
deduce:추론하다, embody:구현하다, foster:육성하다, hinder:방해하다, mimic:흉내 내다, novice:초보자, ponder:숙고하다,
rigor:엄격함, savvy:요령 있는, thrive:번성하다, vivid:생생한, haste:서두름, irony:반어`,

  7: `aberration:일탈, acquiesce:묵인하다, adversity:역경, altruism:이타심, ambivalent:양가적인, anecdote:일화,
antithesis:정반대, apathy:무관심, assimilate:동화하다, attenuate:약화시키다, benevolent:자비로운, candor:솔직함,
circumvent:우회하다, cognition:인지, complacent:자기만족에 빠진, conjecture:추측, credulous:잘 믿는,
culminate:절정에 이르다, deference:존중, delineate:묘사하다, detrimental:해로운, dichotomy:이분법, diligent:성실한,
disparity:격차, dissipate:흩어지다, eloquent:유창한, emulate:모방하다, ephemeral:순식간의, exacerbate:악화시키다,
fallacy:오류, frugal:검소한, gregarious:사교적인, impartial:공정한, incentive:동기 부여, indifferent:무관심한,
innate:타고난, intricate:복잡한, lucid:명쾌한, meticulous:꼼꼼한, mitigate:완화하다, nuance:미묘한 차이,
obsolete:구식의, ostensible:표면상의, perpetuate:영속시키다, pragmatic:실용적인, prejudice:편견, proliferate:급증하다,
prudent:신중한, reciprocal:상호의, redundant:불필요한, rhetoric:수사법, skeptical:회의적인, stagnant:침체된,
tenacious:끈질긴, ubiquitous:어디에나 있는, wane:약해지다, zealous:열성적인, allude:암시하다, bolster:강화하다,
cajole:구슬리다, deplete:고갈시키다, enigma:수수께끼, feeble:연약한, hamper:방해하다, impede:지연시키다,
mundane:평범한, oblivion:망각, placid:평온한, quench:해소하다, revere:숭배하다, stifle:억누르다, tirade:장광설`,

  8: `acquisition:인수, amortize:분할 상환하다, auditor:감사관, bilateral:쌍방의, collateral:담보, compliance:준수,
consensus:합의, contingency:비상 사태, deduction:공제, delegate:위임하다, depreciation:가치 하락, discretion:재량,
dividend:배당금, entrepreneur:기업가, expenditure:지출, fiscal:재정의, incumbent:재임자, inventory:재고,
jurisdiction:관할권, liability:책임, liquidity:유동성, mandate:권한, merger:합병, negotiate:협상하다,
outsource:외주를 주다, preliminary:예비의, procurement:조달, prospectus:투자 설명서, quota:할당량,
reimburse:상환하다, remuneration:보수, revenue:수익, stipulate:규정하다, subsidiary:자회사, surplus:흑자,
tariff:관세, tenure:재임 기간, transaction:거래, verdict:평결, warranty:품질 보증, waiver:권리 포기,
adjourn:휴회하다, audit:감사, broker:중개인, budget:예산, clause:조항, deficit:적자, equity:자기 자본,
levy:부과하다, lease:임대하다, ledger:원장(장부), payroll:급여 대장, rebate:환급, slump:폭락, tenant:세입자,
vendor:판매자, voucher:상품권, accrue:누적되다, appraise:평가하다, curtail:축소하다, embargo:통상 금지,
forfeit:몰수당하다, haggle:흥정하다, lucrative:수익성이 좋은, mortgage:담보 대출, pension:연금, premium:보험료,
rally:반등하다, subsidy:보조금`,

  9: `abstruse:난해한, acrimony:신랄함, alacrity:민첩함, anachronism:시대착오, apocryphal:출처가 의심스러운,
approbation:승인, arcane:불가사의한, assiduous:근면한, audacious:대담한, bombastic:과장된, cacophony:불협화음,
capricious:변덕스러운, chicanery:속임수, cogent:설득력 있는, convoluted:뒤얽힌, debacle:대실패, deleterious:유해한,
diatribe:혹평, disparage:깎아내리다, dogmatic:독단적인, ebullient:활기 넘치는, efficacy:효능, enervate:기력을 빼앗다,
equivocate:얼버무리다, erudite:박식한, esoteric:소수만 아는, fastidious:까다로운, garrulous:수다스러운,
hackneyed:진부한, iconoclast:인습 타파주의자, idiosyncrasy:특이한 성격, impetuous:성급한, inchoate:초기의,
insipid:무미건조한, intransigent:비타협적인, laconic:말수가 적은, loquacious:말 많은, magnanimous:관대한,
mendacious:거짓의, obdurate:고집 센, obfuscate:흐리게 하다, obsequious:아첨하는, opulent:호화로운,
panacea:만병통치약, paucity:부족, pedantic:현학적인, perfidious:배신하는, perfunctory:형식적인, pernicious:치명적인,
quixotic:비현실적인, recalcitrant:반항하는, sanguine:낙관적인, sycophant:아첨꾼, taciturn:과묵한,
truculent:공격적인, vacillate:망설이다, venerate:존경하다, vociferous:시끄러운, abate:약해지다, banal:진부한,
droll:익살스러운, fervid:열렬한, gaffe:실수(결례), hubris:오만, jejune:유치한, lithe:유연한, malign:비방하다,
nadir:최저점, ornate:화려한, pariah:따돌림받는 사람, pithy:간결한, rancor:원한, sordid:추잡한, torpor:무기력,
umbrage:불쾌감, wistful:아쉬워하는, zenith:정점, burnish:윤을 내다, cavil:트집 잡다, dearth:부족`
};

function parse(raw) {
  return raw.split(",").map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.indexOf(":");
    return { w: s.slice(0, i).trim().toUpperCase(), m: s.slice(i + 1).trim() };
  }).filter(x => /^[A-Z]+$/.test(x.w));
}

export const WORDS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, parse(v)]));
