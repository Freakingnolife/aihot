export const CATEGORIES = [
  {
    "key": "applications",
    "label": "Applications",
    "section": "Applications",
    "guide": "Named deployments, application lessons and customer experiences"
  },
  {
    "key": "products",
    "label": "Products & materials",
    "section": "Products & materials",
    "guide": "Machines, materials, process and software changes"
  },
  {
    "key": "industry",
    "label": "Industry",
    "section": "Industry",
    "guide": "Business, supply continuity and partnerships"
  },
  {
    "key": "paper",
    "label": "Research & standards",
    "section": "Research & standards",
    "guide": "Research, quality methods and standards with qualifications preserved"
  },
  {
    "key": "tip",
    "label": "Practice",
    "section": "Practice",
    "guide": "Reusable workflows and operational lessons"
  },
  {
    "key": "opinion",
    "label": "Analysis",
    "section": "Analysis",
    "guide": "Attributed commentary and practitioner perspectives"
  }
] as const;
// Stable content types retain the original seven weight rows; model_release denotes a process/material platform release.
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;
export const CATEGORY_TAGS = ["Applications", "Product update", "Research", "Practice", "Analysis", "Industry", "Policy", "Other"] as const;
export const TOPIC_TAGS = ["Polymer", "Metal", "Ceramic", "Composite", "Construction", "Bioprinting", "Quality", "Software", "Service bureau"] as const;
export const ENTITY_TAGS = ["3D Systems", "3DXTech", "Ackuretta", "Admatec", "America Makes", "AMUG", "Anycubic", "AON3D", "Asiga", "Axtra3D", "Bambu Lab", "BASF Forward AM", "BCN3D", "Carbon", "CELLINK", "COBOD", "DWS", "EOS", "Eplus3D", "Farsoon", "Formlabs", "Henkel LOCTITE 3D", "INTAMSYS", "Kexcelled", "Liqcreate", "Lithoz", "Make3D", "Overture", "Polymaker", "Prusa / Prusament", "Rapid Shape", "Roboze", "SAREMCO Dental", "SHINING 3D", "Siraya Tech", "Solukon", "SprintRay", "Stratasys", "TPM3D", "Trideo", "UnionTech"] as const;
export const TAG_SYNONYMS: Readonly<Record<string, string>> = { "research": "Research", "tutorial": "Practice", "product": "Product update" };
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {model_release:"Product update",product_launch:"Product update",tool_or_prompt:"Practice",research_paper:"Research",industry_event:"Industry",opinion_analysis:"Analysis",tutorial_explainer:"Practice"};
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  "3d-systems": {
    "name": "3D Systems",
    "displayTag": "3D Systems",
    "aliases": [
      "3D Systems"
    ]
  },
  "3dxtech": {
    "name": "3DXTech",
    "displayTag": "3DXTech",
    "aliases": [
      "3DXTech"
    ]
  },
  "ackuretta": {
    "name": "Ackuretta",
    "displayTag": "Ackuretta",
    "aliases": [
      "Ackuretta"
    ]
  },
  "admatec": {
    "name": "Admatec",
    "displayTag": "Admatec",
    "aliases": [
      "Admatec"
    ]
  },
  "america-makes": {
    "name": "America Makes",
    "displayTag": "America Makes",
    "aliases": [
      "America Makes"
    ]
  },
  "amug": {
    "name": "AMUG",
    "displayTag": "AMUG",
    "aliases": [
      "AMUG"
    ]
  },
  "anycubic": {
    "name": "Anycubic",
    "displayTag": "Anycubic",
    "aliases": [
      "Anycubic"
    ]
  },
  "aon3d": {
    "name": "AON3D",
    "displayTag": "AON3D",
    "aliases": [
      "AON3D"
    ]
  },
  "asiga": {
    "name": "Asiga",
    "displayTag": "Asiga",
    "aliases": [
      "Asiga"
    ]
  },
  "axtra3d": {
    "name": "Axtra3D",
    "displayTag": "Axtra3D",
    "aliases": [
      "Axtra3D"
    ]
  },
  "bambu-lab": {
    "name": "Bambu Lab",
    "displayTag": "Bambu Lab",
    "aliases": [
      "Bambu Lab"
    ]
  },
  "basf-forward-am": {
    "name": "BASF Forward AM",
    "displayTag": "BASF Forward AM",
    "aliases": [
      "BASF Forward AM"
    ]
  },
  "bcn3d": {
    "name": "BCN3D",
    "displayTag": "BCN3D",
    "aliases": [
      "BCN3D"
    ]
  },
  "carbon": {
    "name": "Carbon",
    "displayTag": "Carbon",
    "aliases": [
      "Carbon"
    ]
  },
  "cellink": {
    "name": "CELLINK",
    "displayTag": "CELLINK",
    "aliases": [
      "CELLINK"
    ]
  },
  "cobod": {
    "name": "COBOD",
    "displayTag": "COBOD",
    "aliases": [
      "COBOD"
    ]
  },
  "dws": {
    "name": "DWS",
    "displayTag": "DWS",
    "aliases": [
      "DWS"
    ]
  },
  "eos": {
    "name": "EOS",
    "displayTag": "EOS",
    "aliases": [
      "EOS"
    ]
  },
  "eplus3d": {
    "name": "Eplus3D",
    "displayTag": "Eplus3D",
    "aliases": [
      "Eplus3D"
    ]
  },
  "farsoon": {
    "name": "Farsoon",
    "displayTag": "Farsoon",
    "aliases": [
      "Farsoon"
    ]
  },
  "formlabs": {
    "name": "Formlabs",
    "displayTag": "Formlabs",
    "aliases": [
      "Formlabs"
    ]
  },
  "henkel-loctite": {
    "name": "Henkel LOCTITE 3D",
    "displayTag": "Henkel LOCTITE 3D",
    "aliases": [
      "Henkel LOCTITE 3D"
    ]
  },
  "intamsys": {
    "name": "INTAMSYS",
    "displayTag": "INTAMSYS",
    "aliases": [
      "INTAMSYS"
    ]
  },
  "kexcelled": {
    "name": "Kexcelled",
    "displayTag": "Kexcelled",
    "aliases": [
      "Kexcelled"
    ]
  },
  "liqcreate": {
    "name": "Liqcreate",
    "displayTag": "Liqcreate",
    "aliases": [
      "Liqcreate"
    ]
  },
  "lithoz": {
    "name": "Lithoz",
    "displayTag": "Lithoz",
    "aliases": [
      "Lithoz"
    ]
  },
  "make3d": {
    "name": "Make3D",
    "displayTag": "Make3D",
    "aliases": [
      "Make3D"
    ]
  },
  "overture": {
    "name": "Overture",
    "displayTag": "Overture",
    "aliases": [
      "Overture"
    ]
  },
  "polymaker": {
    "name": "Polymaker",
    "displayTag": "Polymaker",
    "aliases": [
      "Polymaker"
    ]
  },
  "prusa": {
    "name": "Prusa / Prusament",
    "displayTag": "Prusa / Prusament",
    "aliases": [
      "Prusa / Prusament"
    ]
  },
  "rapid-shape": {
    "name": "Rapid Shape",
    "displayTag": "Rapid Shape",
    "aliases": [
      "Rapid Shape"
    ]
  },
  "roboze": {
    "name": "Roboze",
    "displayTag": "Roboze",
    "aliases": [
      "Roboze"
    ]
  },
  "saremco": {
    "name": "SAREMCO Dental",
    "displayTag": "SAREMCO Dental",
    "aliases": [
      "SAREMCO Dental"
    ]
  },
  "shining3d": {
    "name": "SHINING 3D",
    "displayTag": "SHINING 3D",
    "aliases": [
      "SHINING 3D"
    ]
  },
  "siraya-tech": {
    "name": "Siraya Tech",
    "displayTag": "Siraya Tech",
    "aliases": [
      "Siraya Tech"
    ]
  },
  "solukon": {
    "name": "Solukon",
    "displayTag": "Solukon",
    "aliases": [
      "Solukon"
    ]
  },
  "sprintray": {
    "name": "SprintRay",
    "displayTag": "SprintRay",
    "aliases": [
      "SprintRay"
    ]
  },
  "stratasys": {
    "name": "Stratasys",
    "displayTag": "Stratasys",
    "aliases": [
      "Stratasys"
    ]
  },
  "tpm3d": {
    "name": "TPM3D",
    "displayTag": "TPM3D",
    "aliases": [
      "TPM3D"
    ]
  },
  "trideo": {
    "name": "Trideo",
    "displayTag": "Trideo",
    "aliases": [
      "Trideo"
    ]
  },
  "uniontech": {
    "name": "UnionTech",
    "displayTag": "UnionTech",
    "aliases": [
      "UnionTech"
    ]
  }
};
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = Object.entries(ENTITIES).map(([id,e]) => ({id,name:e.name,patterns:[new RegExp(e.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),"i")]}));
export const PUBLISHER_DOMAINS: ReadonlyArray<{entityId:string;domains:readonly string[]}> = [{"entityId": "3d-systems", "domains": ["www.3dsystems.com"]}, {"entityId": "3dxtech", "domains": ["www.3dxtech.com"]}, {"entityId": "ackuretta", "domains": ["ackuretta.com"]}, {"entityId": "admatec", "domains": ["admateceurope.com"]}, {"entityId": "america-makes", "domains": ["www.americamakes.us"]}, {"entityId": "amug", "domains": ["www.amug.com"]}, {"entityId": "anycubic", "domains": ["store.anycubic.com"]}, {"entityId": "aon3d", "domains": ["www.aon3d.com"]}, {"entityId": "asiga", "domains": ["www.asiga.com"]}, {"entityId": "axtra3d", "domains": ["axtra3d.com"]}, {"entityId": "bambu-lab", "domains": ["blog.bambulab.com"]}, {"entityId": "basf-forward-am", "domains": ["forward-am.com"]}, {"entityId": "bcn3d", "domains": ["bcn3d.com"]}, {"entityId": "carbon", "domains": ["www.carbon3d.com"]}, {"entityId": "cellink", "domains": ["www.cellink.com"]}, {"entityId": "cobod", "domains": ["cobod.com"]}, {"entityId": "dws", "domains": ["www.dwssystems.com"]}, {"entityId": "eos", "domains": ["www.eos.info"]}, {"entityId": "eplus3d", "domains": ["www.eplus3d.com"]}, {"entityId": "farsoon", "domains": ["www.farsoon-gl.com"]}, {"entityId": "formlabs", "domains": ["formlabs.com"]}, {"entityId": "henkel-loctite", "domains": ["www.loctiteam.com"]}, {"entityId": "intamsys", "domains": ["blog.intamsys.com"]}, {"entityId": "kexcelled", "domains": ["kexcelled3d.com"]}, {"entityId": "liqcreate", "domains": ["www.liqcreate.com"]}, {"entityId": "lithoz", "domains": ["www.lithoz.com"]}, {"entityId": "make3d", "domains": ["make3d.in"]}, {"entityId": "overture", "domains": ["overture3d.com"]}, {"entityId": "polymaker", "domains": ["polymaker.com"]}, {"entityId": "prusa", "domains": ["blog.prusa3d.com"]}, {"entityId": "rapid-shape", "domains": ["rapidshape3d.com"]}, {"entityId": "roboze", "domains": ["www.roboze.com"]}, {"entityId": "saremco", "domains": ["saremco.ch"]}, {"entityId": "shining3d", "domains": ["www.shining3ddental.com"]}, {"entityId": "siraya-tech", "domains": ["siraya.tech"]}, {"entityId": "solukon", "domains": ["www.solukon.de"]}, {"entityId": "sprintray", "domains": ["sprintray.com"]}, {"entityId": "stratasys", "domains": ["investors.stratasys.com"]}, {"entityId": "tpm3d", "domains": ["english.tpm3d.com"]}, {"entityId": "trideo", "domains": ["www.trideo3d.com"]}, {"entityId": "uniontech", "domains": ["www.uniontech3d.com"]}];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{entityId:string;pattern:RegExp}> = [];
