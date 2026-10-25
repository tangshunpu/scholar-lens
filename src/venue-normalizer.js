(function attachVenueNormalizer(global) {
  "use strict";

  const UNKNOWN_VENUE = "Unknown venue";
  const ARXIV_VENUE = "arXiv preprint";
  const CONFERENCE_KEYWORD_RE = /\b(conf(?:erence)?|symp(?:osium)?|workshop|proceedings|congress|forum|summit|meeting|colloquium|seminar|convention|globecom|infocom|icc|vtc|icassp|cvpr|iccv|eccv|neurips|nips|icml|iclr|aaai|ijcai|acl|emnlp|naacl|sigcomm|mobicom|mobisys|mobihoc|conext|hotnets|sensys|ipsn|percom|secon|nsdi|osdi|sosp|eurosys|asplos|atc|icnp|icdcs|dsn|middleware|sigmetrics|isca|sigmod|vldb|kdd|sigir)\b/i;
  const TITLE_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "based",
    "by",
    "for",
    "from",
    "in",
    "into",
    "of",
    "on",
    "or",
    "the",
    "to",
    "toward",
    "towards",
    "using",
    "via",
    "with"
  ]);

  const DEFAULT_ALIASES = [
    {
      pattern: "IEEE Trans. Commun.",
      canonical: "IEEE Trans. Commun."
    },
    {
      pattern: "IEEE Transactions on Communications",
      canonical: "IEEE Trans. Commun."
    },
    {
      pattern: "IEEE Transactions on Communication",
      canonical: "IEEE Trans. Commun."
    },
    {
      pattern: "IEEE T Commun",
      canonical: "IEEE Trans. Commun."
    },
    {
      pattern: "IEEE Trans. Wireless Commun.",
      canonical: "IEEE Trans. Wireless Commun."
    },
    {
      pattern: "IEEE Transactions on Wireless Communications",
      canonical: "IEEE Trans. Wireless Commun."
    },
    {
      pattern: "IEEE T Wireless Commun",
      canonical: "IEEE Trans. Wireless Commun."
    },
    {
      pattern: "IEEE Trans. Signal Process.",
      canonical: "IEEE Trans. Signal Process."
    },
    {
      pattern: "IEEE Transactions on Signal Processing",
      canonical: "IEEE Trans. Signal Process."
    },
    {
      pattern: "IEEE T Signal Process",
      canonical: "IEEE Trans. Signal Process."
    },
    {
      pattern: "IEEE Trans. Inf. Theory",
      canonical: "IEEE Trans. Inf. Theory"
    },
    {
      pattern: "IEEE Transactions on Information Theory",
      canonical: "IEEE Trans. Inf. Theory"
    },
    {
      pattern: "IEEE T Inform Theory",
      canonical: "IEEE Trans. Inf. Theory"
    },
    {
      pattern: "IEEE Journal on Selected Areas in Communications",
      canonical: "IEEE J. Sel. Areas Commun."
    },
    {
      pattern: "IEEE J. Sel. Areas Commun.",
      canonical: "IEEE J. Sel. Areas Commun."
    }
  ];

  const WORKSHOP_ACRONYM_RULES = [
    { acronym: "AAAI", pattern: /\b(?:AAAI|Association for the Advancement of Artificial Intelligence|Conference on Artificial Intelligence)\b/i },
    { acronym: "NeurIPS", pattern: /\b(?:NeurIPS|NIPS|Neural Information Processing Systems)\b/i },
    { acronym: "ICML", pattern: /\b(?:ICML|International Conference on Machine Learning)\b/i },
    { acronym: "ICLR", pattern: /\b(?:ICLR|International Conference on Learning Representations)\b/i },
    { acronym: "CVPR", pattern: /\b(?:CVPR|Computer Vision and Pattern Recognition)\b/i },
    { acronym: "ICCV", pattern: /\b(?:ICCV|International Conference on Computer Vision)\b/i },
    { acronym: "ECCV", pattern: /\b(?:ECCV|European Conference on Computer Vision)\b/i },
    { acronym: "ACL", pattern: /\b(?:ACL|Association for Computational Linguistics)\b/i },
    { acronym: "EMNLP", pattern: /\b(?:EMNLP|Empirical Methods in Natural Language Processing)\b/i },
    { acronym: "NAACL", pattern: /\b(?:NAACL|North American Chapter of the Association for Computational Linguistics)\b/i },
    { acronym: "KDD", pattern: /\b(?:KDD|Knowledge Discovery and Data Mining)\b/i },
    { acronym: "SIGIR", pattern: /\b(?:SIGIR|Research and Development in Information Retrieval)\b/i },
    { acronym: "SIGCOMM", pattern: /\b(?:SIGCOMM|Special Interest Group on Data Communication)\b/i },
    { acronym: "MobiCom", pattern: /\b(?:MobiCom|Mobile Computing and Networking)\b/i },
    { acronym: "MobiSys", pattern: /\b(?:MobiSys|Mobile Systems,\s*Applications,\s*and\s*Services|Mobile Systems\s+Applications\s+and\s+Services)\b/i },
    { acronym: "MobiHoc", pattern: /\b(?:MobiHoc|Mobile Ad Hoc Networking and Computing|Mobile Networks and Mobile Computing)\b/i },
    { acronym: "CoNEXT", pattern: /\b(?:CoNEXT|Networking EXperiments and Technologies|Networking Experiments and Technologies)\b/i },
    { acronym: "IMC", pattern: /\b(?:IMC|Internet Measurement Conference)\b/i },
    { acronym: "HotNets", pattern: /\b(?:HotNets|Hot Topics in Networks)\b/i },
    { acronym: "SenSys", pattern: /\b(?:SenSys|Networked Sensor Systems)\b/i },
    { acronym: "IPSN", pattern: /\b(?:IPSN|Information Processing in Sensor Networks)\b/i },
    { acronym: "PerCom", pattern: /\b(?:PerCom|Pervasive Computing and Communications)\b/i },
    { acronym: "SECON", pattern: /\b(?:SECON|Sensing,\s*Communication and Networking|Sensor,\s*Mesh and Ad Hoc Communications and Networks)\b/i },
    { acronym: "NSDI", pattern: /\b(?:NSDI|Networked Systems Design and Implementation)\b/i },
    { acronym: "OSDI", pattern: /\b(?:OSDI|Operating Systems Design and Implementation)\b/i },
    { acronym: "SOSP", pattern: /\b(?:SOSP|Operating Systems Principles)\b/i },
    { acronym: "EuroSys", pattern: /\b(?:EuroSys|European Conference on Computer Systems)\b/i },
    { acronym: "ASPLOS", pattern: /\b(?:ASPLOS|Architectural Support for Programming Languages and Operating Systems)\b/i }
  ];

  const ABBREVIATION_RULES = [
    {
      canonical: "IEEE Trans. Commun.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Communications?\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Communication\s+Technology\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Communications?\s+Systems?\b/i,
        /\bIRE\s+Transactions?\s+on\s+Communications?\s+Systems?\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Communication\s+and\s+Electronics\b/i,
        /\bTransactions?\s+of\s+the\s+(?:AIEE|American\s+Institute\s+of\s+Electrical\s+Engineers).*Communication\s+and\s+Electronics\b/i,
        /\bIEEE\s+Trans\.?\s+Commun\.?\b/i,
        /\bIEEE\s+Trans\.?\s+Commun\.?\s+Technol\.?\b/i,
        /\bIEEE\s+Trans\.?\s+Commun\.?\s+Syst\.?\b/i,
        /\bIEEE\s+T\s+Commun\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Wireless Commun.",
      patterns: [
        /^IEEE\s+Transactions?\s+on\s+Wireless\s+Communications?$/i,
        /^IEEE\s+Trans\.?\s+Wireless\s+Commun\.?$/i,
        /^IEEE\s+T\s+Wireless\s+Commun$/i
      ]
    },
    {
      canonical: "IEEE Commun. Lett.",
      patterns: [
        /\bIEEE\s+Communications?\s+Letters?\b/i,
        /\bIEEE\s+Commun\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE Wireless Commun. Lett.",
      patterns: [
        /\bIEEE\s+Wireless\s+Communications?\s+Letters?\b/i,
        /\bIEEE\s+Wireless\s+Commun\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE Commun. Mag.",
      patterns: [
        /\bIEEE\s+Communications?\s+Magazine\b/i,
        /\bIEEE\s+Commun\.?\s+Mag\.?\b/i
      ]
    },
    {
      canonical: "IEEE Wireless Commun.",
      patterns: [
        /^IEEE\s+Wireless\s+Communications?$/i,
        /^IEEE\s+Wireless\s+Commun\.?$/i
      ]
    },
    {
      canonical: "IEEE Netw.",
      patterns: [
        /\bIEEE\s+Network\b/i,
        /^IEEE\s+Netw\.?$/i
      ]
    },
    {
      canonical: "IEEE Netw. Lett.",
      patterns: [
        /\bIEEE\s+Networking\s+Letters\b/i,
        /\bIEEE\s+Netw\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE Internet Things J.",
      patterns: [
        /\bIEEE\s+Internet\s+of\s+Things\s+Journal\b/i,
        /\bIEEE\s+Internet\s+Things\s+J\.?\b/i
      ]
    },
    {
      canonical: "IEEE J. Sel. Areas Commun.",
      patterns: [
        /\bIEEE\s+Journal\s+(?:on|of)\s+Selected\s+Areas\s+in\s+Communications?\b/i,
        /\bIEEE\s+J\.?\s+Sel\.?\s+Areas\s+Commun\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Veh. Technol.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Vehicular\s+Technology\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Vehicular\s+Communications?\b/i,
        /\bTransactions?\s+of\s+the\s+IRE\s+Professional\s+Group\s+on\s+Vehicular\s+Communications?\b/i,
        /\bIEEE\s+Trans\.?\s+Veh\.?\s+Technol\.?\b/i
      ]
    },
    {
      canonical: "IEEE Veh. Technol. Mag.",
      patterns: [
        /\bIEEE\s+Vehicular\s+Technology\s+Magazine\b/i,
        /\bIEEE\s+Veh\.?\s+Technol\.?\s+Mag\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Mobile Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Mobile\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Mobile\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Signal Process.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Signal\s+Processing\b/i,
        /\bIEEE\s+Trans\.?\s+Signal\s+Process\.?\b/i,
        /\bIEEE\s+T\s+Signal\s+Process\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Inf. Theory",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Information\s+Theory\b/i,
        /\bIEEE\s+Trans\.?\s+Inf\.?\s+Theory\b/i,
        /\bIEEE\s+T\s+Inform\s+Theory\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Inf. Forensics Secur.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Information\s+Forensics\s+and\s+Security\b/i,
        /\bIEEE\s+Trans\.?\s+Inf\.?\s+Forensics\s+Secur\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Dependable Secure Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Dependable\s+and\s+Secure\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Dependable\s+Secure\s+Comput\.?\b/i,
        /\bIEEE\s+Trans\.?\s+Dependable\s+Secur\.?\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Rel.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Reliability\b/i,
        /\bIEEE\s+Trans\.?\s+Rel\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Parallel Distrib. Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Parallel\s+and\s+Distributed\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Parallel\s+Distrib\.?\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Comput. Imag.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Computational\s+Imaging\b/i,
        /\bIEEE\s+Trans\.?\s+Comput\.?\s+Imag\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Emerg. Topics Comput. Intell.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Emerging\s+Topics\s+in\s+Computational\s+Intelligence\b/i,
        /\bIEEE\s+Trans\.?\s+Emerg\.?\s+Topics\s+Comput\.?\s+Intell\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Computers\b/i,
        /^IEEE\s+Trans\.?\s+Comput\.?$/i
      ]
    },
    {
      canonical: "IEEE Trans. Knowl. Data Eng.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Knowledge\s+and\s+Data\s+Engineering\b/i,
        /\bIEEE\s+Trans\.?\s+Knowl\.?\s+Data\s+Eng\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Softw. Eng.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Software\s+Engineering\b/i,
        /\bIEEE\s+Trans\.?\s+Softw\.?\s+Eng\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Cloud Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Cloud\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Cloud\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Control Netw. Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Control\s+of\s+Network\s+Systems\b/i,
        /\bIEEE\s+Control\s+Netw\.?\s+Syst\.?\b/i,
        /\bIEEE\s+Trans\.?\s+Control\s+Netw\.?\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Contr. Syst. Lett.",
      patterns: [
        /\bIEEE\s+Control\s+Systems?\s+Letters\b/i,
        /\bIEEE\s+Contr\.?\s+Syst\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Control Syst. Technol.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Control\s+Systems\s+Technology\b/i,
        /\bIEEE\s+Trans\.?\s+Control\s+Syst\.?\s+Technol\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Autom. Control",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Automatic\s+Control\b/i,
        /\bIEEE\s+Trans\.?\s+Autom\.?\s+Control\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Big Data",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Big\s+Data\b/i,
        /\bIEEE\s+Trans\.?\s+Big\s+Data\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Affect. Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Affective\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Affect\.?\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Sustain. Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Sustainable\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Sustain\.?\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Emerg. Topics Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Emerging\s+Topics\s+in\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Emerg\.?\s+Topics\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Comput. Soc. Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Computational\s+Social\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Comput\.?\s+Soc\.?\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Artif. Intell.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Artificial\s+Intelligence\b/i,
        /\bIEEE\s+Trans\.?\s+Artif\.?\s+Intell\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Games",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Games\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Computational\s+Intelligence\s+and\s+AI\s+in\s+Games\b/i,
        /\bIEEE\s+Trans\.?\s+Games\b/i,
        /\bIEEE\s+Trans\.?\s+Comput\.?\s+Intell\.?\s+AI\s+Games\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Learn. Technol.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Learning\s+Technologies\b/i,
        /\bIEEE\s+Trans\.?\s+Learn\.?\s+Technol\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Vis. Comput. Graphics",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Visualization\s+and\s+Computer\s+Graphics\b/i,
        /\bIEEE\s+Trans\.?\s+Vis\.?\s+Comput\.?\s+Graphics\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Intell. Transp. Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Intelligent\s+Transportation\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Intell\.?\s+Transp\.?\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Intell. Transp. Syst. Mag.",
      patterns: [
        /\bIEEE\s+Intelligent\s+Transportation\s+Systems\s+Magazine\b/i,
        /\bIEEE\s+Intell\.?\s+Transp\.?\s+Syst\.?\s+Mag\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Intell. Veh.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Intelligent\s+Vehicles\b/i,
        /\bIEEE\s+Trans\.?\s+Intell\.?\s+Veh\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Robot.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Robotics\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Robotics\s+and\s+Automation\b/i,
        /\bIEEE\s+Trans\.?\s+Robot\.?\b/i
      ]
    },
    {
      canonical: "IEEE Robot. Autom. Lett.",
      patterns: [
        /\bIEEE\s+Robotics?\s+and\s+Automation\s+Letters\b/i,
        /\bIEEE\s+Robot\.?\s+Autom\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Autom. Sci. Eng.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Automation\s+Science\s+and\s+Engineering\b/i,
        /\bIEEE\s+Trans\.?\s+Autom\.?\s+Sci\.?\s+Eng\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Cybern.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Cybernetics\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Systems\s*,?\s+Man\s*,?\s+and\s+Cybernetics\s*,?\s+Part\s+B\b/i,
        /\bIEEE\s+Trans\.?\s+Cybern\.?\b/i,
        /\bIEEE\s+Trans\.?\s+Syst\.?\s*,?\s+Man\s*,?\s+Cybern\.?\s+B\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Syst., Man, Cybern. Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Systems\s*,?\s+Man\s*,?\s+and\s+Cybernetics\s*:\s*Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Syst\.?\s*,?\s+Man\s*,?\s+Cybern\.?\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Comput.-Aided Design Integr. Circuits Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Computer-Aided\s+Design\s+of\s+Integrated\s+Circuits\s+and\s+Systems\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Computer\s+Aided\s+Design\s+of\s+Integrated\s+Circuits\s+and\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Comput\.?-Aided\s+Design\s+Integr\.?\s+Circuits\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Very Large Scale Integr. (VLSI) Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Very\s+Large\s+Scale\s+Integration\s+\(VLSI\)\s+Systems\b/i,
        /\bIEEE\s+Transactions?\s+on\s+Very\s+Large\s+Scale\s+Integration\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Very\s+Large\s+Scale\s+Integr\.?\s+\(VLSI\)\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Secur. Priv.",
      patterns: [
        /\bIEEE\s+Security\s*(?:&|and)\s*Privacy\b/i,
        /\bIEEE\s+Secur\.?\s+Priv\.?\b/i
      ]
    },
    {
      canonical: "IEEE Sensors J.",
      patterns: [
        /\bIEEE\s+Sensors\s+Journal\b/i,
        /\bIEEE\s+Sensors\s+J\.?\b/i
      ]
    },
    {
      canonical: "IEEE Sens. Lett.",
      patterns: [
        /\bIEEE\s+Sensors\s+Letters\b/i,
        /\bIEEE\s+Sens\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE Internet Comput.",
      patterns: [
        /\bIEEE\s+Internet\s+Computing\b/i,
        /\bIEEE\s+Internet\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Comput. Graph. Appl.",
      patterns: [
        /\bIEEE\s+Computer\s+Graphics\s+and\s+Applications\b/i,
        /\bIEEE\s+Comput\.?\s+Graph\.?\s+Appl\.?\b/i
      ]
    },
    {
      canonical: "IEEE Softw.",
      patterns: [
        /\bIEEE\s+Software\b/i,
        /\bIEEE\s+Softw\.?\b/i
      ]
    },
    {
      canonical: "IEEE Computer",
      patterns: [
        /^IEEE\s+Computer$/i
      ]
    },
    {
      canonical: "IEEE Syst. J.",
      patterns: [
        /\bIEEE\s+Systems\s+Journal\b/i,
        /\bIEEE\s+Syst\.?\s+J\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Netw. Sci. Eng.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Network\s+Science\s+and\s+Engineering\b/i,
        /\bIEEE\s+Trans\.?\s+Netw\.?\s+Sci\.?\s+Eng\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Cogn. Commun. Netw.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Cognitive\s+Communications?\s+and\s+Networking\b/i,
        /\bIEEE\s+Trans\.?\s+Cogn\.?\s+Commun\.?\s+Netw\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Netw. Serv. Manag.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Network\s+and\s+Service\s+Management\b/i,
        /\bIEEE\s+Trans\.?\s+Netw\.?\s+Serv\.?\s+Manag\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Ind. Informat.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Industrial\s+Informatics\b/i,
        /\bIEEE\s+Trans\.?\s+Ind\.?\s+Informat\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Ind. Electron.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Industrial\s+Electronics\b/i,
        /\bIEEE\s+Trans\.?\s+Ind\.?\s+Electron\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Serv. Comput.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Services\s+Computing\b/i,
        /\bIEEE\s+Trans\.?\s+Serv\.?\s+Comput\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Green Commun. Netw.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Green\s+Communications?\s+and\s+Networking\b/i,
        /\bIEEE\s+Trans\.?\s+Green\s+Commun\.?\s+Netw\.?\b/i
      ]
    },
    {
      canonical: "IEEE/ACM Trans. Netw.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Networking\b/i,
        /\bIEEE\/ACM\s+Transactions?\s+on\s+Networking\b/i,
        /\bIEEE\s+Trans\.?\s+Netw\.?\b/i,
        /\bIEEE\/ACM\s+Trans\.?\s+Netw\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Multimedia",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Multimedia\b/i,
        /\bIEEE\s+Trans\.?\s+Multimedia\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Image Process.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Image\s+Processing\b/i,
        /\bIEEE\s+Trans\.?\s+Image\s+Process\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Circuits Syst. Video Technol.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Circuits\s+and\s+Systems\s+for\s+Video\s+Technology\b/i,
        /\bIEEE\s+Trans\.?\s+Circuits?\s+Syst\.?\s+Video\s+Technol\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Neural Netw. Learn. Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Neural\s+Networks\s+and\s+Learning\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Neural\s+Netw\.?\s+Learn\.?\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Pattern Anal. Mach. Intell.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Pattern\s+Analysis\s+and\s+Machine\s+Intelligence\b/i,
        /\bIEEE\s+Trans\.?\s+Pattern\s+Anal\.?\s+Mach\.?\s+Intell\.?\b/i
      ]
    },
    {
      canonical: "IEEE Signal Process. Lett.",
      patterns: [
        /\bIEEE\s+Signal\s+Processing\s+Letters\b/i,
        /\bIEEE\s+Signal\s+Process\.?\s+Lett\.?\b/i
      ]
    },
    {
      canonical: "IEEE J. Sel. Topics Signal Process.",
      patterns: [
        /\bIEEE\s+Journal\s+of\s+Selected\s+Topics\s+in\s+Signal\s+Processing\b/i,
        /\bIEEE\s+J\.?\s+Sel\.?\s+Topics\s+Signal\s+Process\.?\b/i
      ]
    },
    {
      canonical: "IEEE J. Sel. Areas Inf. Theory",
      patterns: [
        /\bIEEE\s+Journal\s+on\s+Selected\s+Areas\s+in\s+Information\s+Theory\b/i,
        /\bIEEE\s+J\.?\s+Sel\.?\s+Areas\s+Inf\.?\s+Theory\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Signal Inf. Process. Netw.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Signal\s+and\s+Information\s+Processing\s+over\s+Networks\b/i,
        /\bIEEE\s+Trans\.?\s+Signal\s+Inf\.?\s+Process\.?\s+Netw\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Smart Grid",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Smart\s+Grid\b/i,
        /\bIEEE\s+Trans\.?\s+Smart\s+Grid\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Sustain. Energy",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Sustainable\s+Energy\b/i,
        /\bIEEE\s+Trans\.?\s+Sustain\.?\s+Energy\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Power Syst.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Power\s+Systems\b/i,
        /\bIEEE\s+Trans\.?\s+Power\s+Syst\.?\b/i
      ]
    },
    {
      canonical: "IEEE Trans. Power Electron.",
      patterns: [
        /\bIEEE\s+Transactions?\s+on\s+Power\s+Electronics\b/i,
        /\bIEEE\s+Trans\.?\s+Power\s+Electron\.?\b/i
      ]
    },
    {
      canonical: "IEEE Commun. Surv. Tutor.",
      patterns: [
        /\bIEEE\s+Communications?\s+Surveys\s+(?:&|and)\s+Tutorials\b/i,
        /\bIEEE\s+Communications?\s+Surveys\b/i,
        /\bIEEE\s+Commun\.?\s+Surv\.?\s+Tutor\.?\b/i
      ]
    },
    {
      canonical: "IEEE Open J. Commun. Soc.",
      patterns: [
        /\bIEEE\s+Open\s+Journal\s+of\s+the\s+Communications?\s+Society\b/i,
        /\bIEEE\s+Open\s+J\.?\s+Commun\.?\s+Soc\.?\b/i
      ]
    },
    {
      canonical: "IEEE Access",
      patterns: [/\bIEEE\s+Access\b/i]
    },
    {
      canonical: "Proc. IEEE",
      patterns: [
        /\bProceedings\s+of\s+the\s+IEEE(?!\/)\b/i,
        /\bProc\.?\s+IEEE(?!\/)\b/i
      ]
    },
    {
      canonical: "US Patent",
      patterns: [
        /^U\.?S\.?\s+Pat\.?\b/i,
        /^U\.?S\.?\s+Patent(?:\s+(?:No\.?|Application|App\.?|Appl\.?|Publication|Publ\.?))*\b/i,
        /^United\s+States\s+Patent(?:\s+(?:No\.?|Application|App\.?|Appl\.?|Publication|Publ\.?))*\b/i
      ]
    },
    {
      canonical: "IET Commun.",
      patterns: [
        /\bIET\s+Communications?\b/i,
        /\bIET\s+Commun\.?\b/i
      ]
    },
    {
      canonical: "IET Signal Process.",
      patterns: [
        /\bIET\s+Signal\s+Processing\b/i,
        /\bIET\s+Signal\s+Process\.?\b/i
      ]
    },
    {
      canonical: "IET Comput. Vis.",
      patterns: [
        /\bIET\s+Computer\s+Vision\b/i,
        /\bIET\s+Comput\.?\s+Vis\.?\b/i
      ]
    },
    {
      canonical: "Wirel. Commun. Mob. Comput.",
      patterns: [
        /^(?!.*\b(?:Conference|Conf\.?|Proceedings)\b).*?\bWireless\s+Communications?\s+and\s+Mobile\s+Computing\b/i,
        /^(?!.*\b(?:Conference|Conf\.?|Proceedings)\b).*?\bWirel\.?\s+Commun\.?\s+Mob\.?\s+Comput\.?\b/i,
        /^WCMC$/i
      ]
    },
    {
      canonical: "J. Commun. Netw.",
      patterns: [
        /\bJournal\s+of\s+Communications?\s+and\s+Networks?\b/i,
        /\bJ\.?\s+Commun\.?\s+Netw\.?\b/i
      ]
    },
    {
      canonical: "Comput. Commun.",
      patterns: [
        /^(?!.*\bConference\b).*\bComputer\s+Communications?\b/i,
        /^(?!.*\bConference\b).*\bComput\.?\s+Commun\.?\b/i
      ]
    },
    {
      canonical: "Digit. Commun. Netw.",
      patterns: [
        /\bDigital\s+Communications?\s+and\s+Networks?\b/i,
        /\bDigit\.?\s+Commun\.?\s+Netw\.?\b/i
      ]
    },
    {
      canonical: "ACM Trans. Multimedia Comput. Commun. Appl.",
      patterns: [
        /\bACM\s+Transactions?\s+on\s+Multimedia\s+Computing\b/i,
        /\bACM\s+Trans\.?\s+Multimedia\s+Comput\.?\s+Commun\.?\s+Appl\.?\b/i
      ]
    },
    {
      canonical: "AAAI",
      patterns: [
        /\bAAAI\b(?!\s+Workshop)/i,
        /\bAAAI\s+Conference\s+on\s+Artificial\s+Intelligence\b/i,
        /\bConference\s+on\s+Artificial\s+Intelligence\s*\(AAAI\)/i,
        /\bProceedings\s+of\s+the\s+AAAI\s+Conference\s+on\s+Artificial\s+Intelligence\b/i
      ]
    },
    {
      canonical: "IJCAI",
      patterns: [
        /\bIJCAI\b/i,
        /\bInternational\s+Joint\s+Conference\s+on\s+Artificial\s+Intelligence\b/i
      ]
    },
    {
      canonical: "NeurIPS",
      patterns: [
        /\b(?:NeurIPS|NIPS)\b(?!\s+Workshop)/i,
        /\bNeural\s+Information\s+Processing\s+Systems\b/i,
        /\bAdvances\s+in\s+Neural\s+Information\s+Processing\s+Systems\b/i
      ]
    },
    {
      canonical: "ICML",
      patterns: [
        /\bICML\b(?!\s+Workshop)/i,
        /\bInternational\s+Conference\s+on\s+Machine\s+Learning\b/i
      ]
    },
    {
      canonical: "ICLR",
      patterns: [
        /\bICLR\b(?!\s+Workshop)/i,
        /\bInternational\s+Conference\s+on\s+Learning\s+Representations\b/i
      ]
    },
    {
      canonical: "CVPR",
      patterns: [
        /\bCVPR\b(?!\s+Workshop)/i,
        /\bComputer\s+Vision\s+and\s+Pattern\s+Recognition\b/i,
        /\bIEEE\/CVF\s+Conference\s+on\s+Computer\s+Vision\s+and\s+Pattern\s+Recognition\b/i
      ]
    },
    {
      canonical: "ICCV",
      patterns: [
        /\bICCV\b(?!\s+Workshop)/i,
        /\bInternational\s+Conference\s+on\s+Computer\s+Vision\b/i
      ]
    },
    {
      canonical: "ECCV",
      patterns: [
        /\bECCV\b(?!\s+Workshop)/i,
        /\bEuropean\s+Conference\s+on\s+Computer\s+Vision\b/i
      ]
    },
    {
      canonical: "ACL",
      patterns: [
        /\bACL\b(?!\s+Workshop)/i,
        /\bAnnual\s+Meeting\s+of\s+the\s+Association\s+for\s+Computational\s+Linguistics\b/i,
        /\bAssociation\s+for\s+Computational\s+Linguistics\b/i
      ]
    },
    {
      canonical: "EMNLP",
      patterns: [
        /\bEMNLP\b(?!\s+Workshop)/i,
        /\bEmpirical\s+Methods\s+in\s+Natural\s+Language\s+Processing\b/i
      ]
    },
    {
      canonical: "NAACL",
      patterns: [
        /\bNAACL\b(?!\s+Workshop)/i,
        /\bNorth\s+American\s+Chapter\s+of\s+the\s+Association\s+for\s+Computational\s+Linguistics\b/i
      ]
    },
    {
      canonical: "KDD",
      patterns: [
        /\bKDD\b(?!\s+Workshop)/i,
        /\bKnowledge\s+Discovery\s+and\s+Data\s+Mining\b/i
      ]
    },
    {
      canonical: "SIGIR",
      patterns: [
        /\bSIGIR\b(?!\s+Workshop)/i,
        /\bResearch\s+and\s+Development\s+in\s+Information\s+Retrieval\b/i
      ]
    },
    {
      canonical: "AISTATS",
      patterns: [
        /\bAISTATS\b(?!\s+Workshop)/i,
        /\bArtificial\s+Intelligence\s+and\s+Statistics\b/i
      ]
    },
    {
      canonical: "UAI",
      patterns: [
        /\bUAI\b(?!\s+Workshop)/i,
        /\bUncertainty\s+in\s+Artificial\s+Intelligence\b/i
      ]
    },
    {
      canonical: "COLT",
      patterns: [
        /\bCOLT\b(?!\s+Workshop)/i,
        /\bConference\s+on\s+Learning\s+Theory\b/i
      ]
    },
    {
      canonical: "JMLR",
      patterns: [
        /\bJournal\s+of\s+Machine\s+Learning\s+Research\b/i,
        /\bJMLR\b/i
      ]
    },
    {
      canonical: "TMLR",
      patterns: [
        /\bTransactions?\s+on\s+Machine\s+Learning\s+Research\b/i,
        /\bTMLR\b/i
      ]
    },
    {
      canonical: "SIGCOMM",
      patterns: [
        /\bSIGCOMM\b(?!\s+Workshop)/i,
        /\bACM\s+SIGCOMM\s+Conference\b/i,
        /\bConference\s+of\s+the\s+ACM\s+Special\s+Interest\s+Group\s+on\s+Data\s+Communications?\b/i,
        /\bACM\s+Conference\s+on\s+Special\s+Interest\s+Group\s+on\s+Data\s+Communications?\b/i
      ]
    },
    {
      canonical: "MobiCom",
      patterns: [
        /\bMobiCom\b(?!\s+Workshop)/i,
        /\b(?:ACM\s+)?(?:Annual\s+)?International\s+Conference\s+on\s+Mobile\s+Computing\s+and\s+Networking\b/i,
        /\b(?:ACM\s+)?SIGMOBILE\s+International\s+Conference\s+on\s+Mobile\s+Computing\s+and\s+Networking\b/i
      ]
    },
    {
      canonical: "MobiSys",
      patterns: [
        /\bMobiSys\b(?!\s+Workshop)/i,
        /\b(?:ACM\s+)?(?:International\s+)?Conference\s+on\s+Mobile\s+Systems\s*,?\s+Applications\s*,?\s+and\s+Services\b/i,
        /\bMobile\s+Systems\s*,?\s+Applications\s*,?\s+and\s+Services\b/i
      ]
    },
    {
      canonical: "MobiHoc",
      patterns: [
        /\bMobiHoc\b(?!\s+Workshop)/i,
        /\bInternational\s+Symposium\s+on\s+Theory\s*,?\s+Algorithmic\s+Foundations\s*,?\s+and\s+Protocol\s+Design\s+for\s+Mobile\s+Networks\s+and\s+Mobile\s+Computing\b/i,
        /\bInternational\s+Symposium\s+on\s+Mobile\s+Ad\s+Hoc\s+Networking\s+and\s+Computing\b/i
      ]
    },
    {
      canonical: "CoNEXT",
      patterns: [
        /\bCoNEXT\b(?!\s+Workshop)/i,
        /\bConference\s+on\s+emerging\s+Networking\s+EXperiments\s+and\s+Technologies\b/i,
        /\bConference\s+on\s+Emerging\s+Networking\s+Experiments\s+and\s+Technologies\b/i
      ]
    },
    {
      canonical: "IMC",
      patterns: [
        /\bInternet\s+Measurement\s+Conference\b/i,
        /\bInternet\s+Measurement\s+Workshop\b/i,
        /\bACM\s+IMC\b/i
      ]
    },
    {
      canonical: "HotNets",
      patterns: [
        /\bHotNets\b(?!\s+Workshop)/i,
        /\bHot\s+Topics\s+in\s+Networks\b/i
      ]
    },
    {
      canonical: "SenSys",
      patterns: [
        /\bSenSys\b(?!\s+Workshop)/i,
        /\bConference\s+on\s+Embedded\s+Networked\s+Sensor\s+Systems\b/i,
        /\bConference\s+on\s+Networked\s+Sensor\s+Systems\b/i
      ]
    },
    {
      canonical: "IPSN",
      patterns: [
        /\bIPSN\b(?!\s+Workshop)/i,
        /\b(?:ACM\/IEEE\s+)?(?:International\s+)?Conference\s+on\s+Information\s+Processing\s+in\s+Sensor\s+Networks\b/i
      ]
    },
    {
      canonical: "PerCom",
      patterns: [
        /\bPerCom\b(?!\s+Workshop)/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Pervasive\s+Computing\s+and\s+Communications\b/i,
        /\bInternational\s+Conference\s+on\s+Pervasive\s+Computing\s+and\s+Communications\b/i
      ]
    },
    {
      canonical: "IEEE SECON",
      patterns: [
        /\bSECON\b(?!\s+Workshop)/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Sensing\s*,?\s+Communication\s+and\s+Networking\b/i,
        /\bIEEE\s+Communications?\s+Society\s+Conference\s+on\s+Sensor\s*,?\s+Mesh\s+and\s+Ad\s+Hoc\s+Communications?\s+and\s+Networks\b/i
      ]
    },
    {
      canonical: "NSDI",
      patterns: [
        /\bNSDI\b(?!\s+Workshop)/i,
        /\bNetworked\s+Systems\s+Design\s+and\s+Implementation\b/i
      ]
    },
    {
      canonical: "OSDI",
      patterns: [
        /\bOSDI\b(?!\s+Workshop)/i,
        /\bOperating\s+Systems\s+Design\s+and\s+Implementation\b/i
      ]
    },
    {
      canonical: "SOSP",
      patterns: [
        /\bSOSP\b(?!\s+Workshop)/i,
        /\bSymposium\s+on\s+Operating\s+Systems\s+Principles\b/i
      ]
    },
    {
      canonical: "EuroSys",
      patterns: [
        /\bEuroSys\b(?!\s+Workshop)/i,
        /\bEuropean\s+Conference\s+on\s+Computer\s+Systems\b/i
      ]
    },
    {
      canonical: "ASPLOS",
      patterns: [
        /\bASPLOS\b(?!\s+Workshop)/i,
        /\bArchitectural\s+Support\s+for\s+Programming\s+Languages\s+and\s+Operating\s+Systems\b/i
      ]
    },
    {
      canonical: "Middleware",
      patterns: [
        /\bACM\s+Middleware\b/i,
        /\bInternational\s+Middleware\s+Conference\b/i
      ]
    },
    {
      canonical: "SIGMETRICS",
      patterns: [
        /\bSIGMETRICS\b(?!\s+Workshop)/i,
        /\bMeasurement\s+and\s+Modeling\s+of\s+Computer\s+Systems\b/i
      ]
    },
    {
      canonical: "USENIX ATC",
      patterns: [
        /\bUSENIX\s+ATC\b/i,
        /\bUSENIX\s+Annual\s+Technical\s+Conference\b/i
      ]
    },
    {
      canonical: "USENIX FAST",
      patterns: [
        /\bUSENIX\s+FAST\b/i,
        /\bFile\s+and\s+Storage\s+Technologies\b/i
      ]
    },
    {
      canonical: "IEEE ICC",
      patterns: [
        /\bIEEE\s+International\s+Conference\s+on\s+Communications\b/i,
        /\bInternational\s+Conference\s+on\s+Communications\s*\(ICC\)/i,
        /\bICC\b.*\bInternational\s+Conference\s+on\s+Communications\b/i
      ]
    },
    {
      canonical: "IEEE GLOBECOM",
      patterns: [
        /\bGLOBECOM\b/i,
        /\bIEEE\s+Global\s+Telecommunications?\s+Conference\b/i,
        /\bGlobal\s+Telecommunications?\s+Conference\b/i,
        /\bIEEE\s+Global\s+Communications?\s+Conference\b/i
      ]
    },
    {
      canonical: "IEEE WCNC",
      patterns: [
        /\bWCNC\b/i,
        /\bIEEE\s+Wireless\s+Communications?\s+and\s+Networking\s+Conference\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Wireless\s+Communications?\s+and\s+Networking\b/i,
        /\bWireless\s+Communications?\s+and\s+Networking\s+Conference\b/i
      ]
    },
    {
      canonical: "IEEE INFOCOM",
      patterns: [
        /\bINFOCOM\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Computer\s+Communications\b/i
      ]
    },
    {
      canonical: "IEEE PIMRC",
      patterns: [
        /\bPIMRC\b/i,
        /\bIEEE\s+International\s+Symposium\s+on\s+Personal\s*,?\s+Indoor\s+and\s+Mobile\s+Radio\s+Communications\b/i
      ]
    },
    {
      canonical: "ICASSP",
      patterns: [
        /\bICASSP\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Acoustics\b/i,
        /\bInternational\s+Conference\s+on\s+Acoustics\s*,?\s+Speech\s+and\s+Signal\s+Processing\b/i
      ]
    },
    {
      canonical: "IEEE ICNP",
      patterns: [
        /\bICNP\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Network\s+Protocols\b/i
      ]
    },
    {
      canonical: "IEEE ICDCS",
      patterns: [
        /\bICDCS\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Distributed\s+Computing\s+Systems\b/i
      ]
    },
    {
      canonical: "IEEE ICPADS",
      patterns: [
        /\bICPADS\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Parallel\s+and\s+Distributed\s+Systems\b/i
      ]
    },
    {
      canonical: "IEEE CCGrid",
      patterns: [
        /\bCCGrid\b/i,
        /\bIEEE\/ACM\s+International\s+Symposium\s+on\s+Cluster\s*,?\s+Cloud\s+and\s+Grid\s+Computing\b/i,
        /\bIEEE\/ACM\s+International\s+Symposium\s+on\s+Cluster\s+Computing\s+and\s+the\s+Grid\b/i
      ]
    },
    {
      canonical: "IEEE DSN",
      patterns: [
        /\bDSN\b/i,
        /\bIEEE\/IFIP\s+International\s+Conference\s+on\s+Dependable\s+Systems\s+and\s+Networks\b/i
      ]
    },
    {
      canonical: "IEEE CNSM",
      patterns: [
        /\bCNSM\b/i,
        /\bInternational\s+Conference\s+on\s+Network\s+and\s+Service\s+Management\b/i
      ]
    },
    {
      canonical: "IEEE ICCS",
      patterns: [
        /\bICCS\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Communication\s+Systems\b/i
      ]
    },
    {
      canonical: "IEEE ICCC",
      patterns: [
        /\bICCC\b/i,
        /\bIEEE\/CIC\s+International\s+Conference\s+on\s+Communications?\s+in\s+China\b/i
      ]
    },
    {
      canonical: "IEEE SmartGridComm",
      patterns: [
        /\bSmartGridComm\b/i,
        /\bIEEE\s+(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|\d+(?:st|nd|rd|th))\s+International\s+Conference\s+on\s+Smart\s+Grid\s+Communications\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Smart\s+Grid\s+Communications\b/i
      ]
    },
    {
      canonical: "IEEE FNWF",
      patterns: [
        /\bFNWF\b/i,
        /\bIEEE\s+Future\s+Networks\s+World\s+Forum\b/i
      ]
    },
    {
      canonical: "IEEE Blockchain",
      patterns: [
        /\bIEEE\s+Blockchain\b/i,
        /\bIEEE\s+International\s+Conference\s+on\s+Blockchain\b/i
      ]
    },
    {
      canonical: "WCSP",
      patterns: [
        /\bWCSP\b/i,
        /\bInternational\s+Conference\s+on\s+Wireless\s+Communications?\s+and\s+Signal\s+Processing\b/i
      ]
    },
    {
      canonical: "IWCMC",
      patterns: [
        /\bIWCMC\b/i,
        /\bInternational\s+Wireless\s+Communications?\s+and\s+Mobile\s+Computing\s+Conference\b/i,
        /\bInternational\s+Conference\s+on\s+Wireless\s+Communications?\s+and\s+Mobile\s+Computing\b/i
      ]
    },
    {
      canonical: "WASA",
      patterns: [
        /\bWASA\b/i,
        /\bInternational\s+Conference\s+on\s+Wireless\s+Algorithms\s*,?\s+Systems\s*,?\s+and\s+Applications\b/i
      ]
    },
    {
      canonical: "IEEE APWCS",
      patterns: [
        /\bAPWCS\b/i,
        /\bAsia\s+Pacific\s+Wireless\s+Communications?\s+Symposium\b/i
      ]
    }
  ];

  function normalizeSpaces(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripTrailingPunctuation(value) {
    return normalizeSpaces(value).replace(/[.,;:\s]+$/g, "").trim();
  }

  function preserveKnownConferenceCommas(value) {
    return normalizeSpaces(value)
      .replace(/\bAcoustics\s*,\s*Speech\s+and\s+Signal\s+Processing\b/gi, "Acoustics Speech and Signal Processing")
      .replace(/\bMobile\s+Systems\s*,\s*Applications\s*,?\s+and\s+Services\b/gi, "Mobile Systems Applications and Services")
      .replace(/\bTheory\s*,\s*Algorithmic\s+Foundations\s*,?\s+and\s+Protocol\s+Design\b/gi, "Theory Algorithmic Foundations and Protocol Design")
      .replace(/\bSensing\s*,\s*Communication\s+and\s+Networking\b/gi, "Sensing Communication and Networking")
      .replace(/\bSensor\s*,\s*Mesh\s+and\s+Ad\s+Hoc\s+Communications?\s+and\s+Networks\b/gi, "Sensor Mesh and Ad Hoc Communications and Networks")
      .replace(/\bPersonal\s*,\s*Indoor\s+and\s+Mobile\s+Radio\s+Communications\b/gi, "Personal Indoor and Mobile Radio Communications")
      .replace(/\bCluster\s*,\s*Cloud\s+and\s+Grid\s+Computing\b/gi, "Cluster Cloud and Grid Computing")
      .replace(/\bWireless\s+Algorithms\s*,\s*Systems\s*,?\s+and\s+Applications\b/gi, "Wireless Algorithms Systems and Applications")
      .replace(/\bSystems\s*,\s*Man\s*,?\s+and\s+Cybernetics\b/gi, "Systems Man and Cybernetics")
      .replace(/\bSyst\.?\s*,\s*Man\s*,?\s+Cybern\.?\b/gi, "Syst. Man Cybern.");
  }

  function cleanVenueLine(rawVenue) {
    const text = preserveKnownConferenceCommas(stripTrailingPunctuation(rawVenue));

    if (!text) {
      return UNKNOWN_VENUE;
    }

    let venue = text.split(/\s*,\s*/)[0] || text;

    venue = mergeArxivPreprints(venue);

    venue = venue
      .replace(/\s*\([^)]*\b(?:arxiv|preprint)\b[^)]*(?:\)|$)\s*/gi, " ")
      .replace(/\s+(?:vol\.?|volume)\s+\d+.*$/i, "")
      .replace(/\s+(?:no\.?|number)\s+\d+.*$/i, "")
      .replace(/\s+pp\.?\s+\d+.*$/i, "")
      .replace(/\s+\d+\s*\([^)]*\)\s*$/i, "")
      .replace(/\s+\d+(?:\.\d+)?\s*$/i, "")
      .replace(/\s+\d+\s*:\s*\d+.*$/i, "");

    venue = mergeConferenceYears(venue);

    return stripTrailingPunctuation(venue) || UNKNOWN_VENUE;
  }

  function mergeArxivPreprints(venue) {
    const cleanVenue = stripTrailingPunctuation(venue);

    if (/10\.48550\s*\/\s*arxiv/i.test(cleanVenue)) {
      return ARXIV_VENUE;
    }

    if (/^CoRR\b(?:\s+abs\/\S+)?$/i.test(cleanVenue)) {
      return ARXIV_VENUE;
    }

    if (/^(?:arxiv|arXiv)(?:\s+preprint|\s+e-prints?)?\s+(?:arxiv:\s*)?\d{4}\.\d+(?:v\d+)?$/i.test(cleanVenue)) {
      return ARXIV_VENUE;
    }

    if (/^(?:arxiv|arXiv)(?:\s+preprint|\s+e-prints?)?$/i.test(cleanVenue)) {
      return ARXIV_VENUE;
    }

    if (/^(?:preprint\s+)?(?:arxiv|arXiv):\s*\d{4}\.\d+(?:v\d+)?$/i.test(cleanVenue)) {
      return ARXIV_VENUE;
    }

    return cleanVenue;
  }

  function isArxivVenue(rawVenue) {
    const cleanVenue = stripTrailingPunctuation(rawVenue);

    if (!cleanVenue) {
      return false;
    }

    const venueWithoutArxivNote = stripTrailingPunctuation(
      cleanVenue.replace(/\s*\([^)]*\b(?:arxiv|preprint)\b[^)]*(?:\)|$)\s*/gi, " ")
    );

    if (
      venueWithoutArxivNote
      && venueWithoutArxivNote !== cleanVenue
      && !/^(?:arxiv|arXiv|preprint)\b/i.test(venueWithoutArxivNote)
    ) {
      return false;
    }

    return mergeArxivPreprints(cleanVenue) === ARXIV_VENUE
      || /^(?:doi:\s*)?https?:\/\/doi\.?\s*\.?\s*org\/10\.48550\s*\/\s*arxiv/i.test(cleanVenue)
      || /^(?:arxiv|arXiv|preprint\s+arxiv)\b/i.test(cleanVenue);
  }

  function mergeConferenceYears(venue) {
    let cleanVenue = stripTrailingPunctuation(venue);

    if (!CONFERENCE_KEYWORD_RE.test(cleanVenue)) {
      return cleanVenue;
    }

    cleanVenue = cleanVenue
      .replace(/\b([A-Z][A-Z0-9]{1,})(?:[-_ ]?(?:19|20)\d{2})(?:[-_ ](Spring|Fall|Summer|Winter))?\b/g, (_match, acronym, season) => {
        return season ? `${acronym} ${season}` : acronym;
      })
      .replace(/\b(?:19|20)\d{2}[-_ ](?:Spring|Fall|Summer|Winter)\b/gi, " ")
      .replace(/\b(?:Spring|Fall|Summer|Winter)[-_ ](?:19|20)\d{2}\b/gi, " ")
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/^\s*[A-Z][A-Z0-9]{1,12}(?:\s+(?:Spring|Fall|Summer|Winter))?\s*[-:–—]\s*(?=.*\b(?:conference|symposium|workshop|congress|proceedings)\b)/i, "")
      .replace(/\s*[-:–—]\s*[-:–—]\s*/g, " - ")
      .replace(/\s*[-:–—]\s*$/g, "")
      .replace(/^\s*[-:–—]\s*/g, "");

    return stripTrailingPunctuation(cleanVenue) || UNKNOWN_VENUE;
  }

  function compactForMatch(value) {
    return normalizeSpaces(value)
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\btransactions\b/g, "trans")
      .replace(/\btransaction\b/g, "trans")
      .replace(/\bcommunications\b/g, "commun")
      .replace(/\bcommunication\b/g, "commun")
      .replace(/\binformation\b/g, "inform")
      .replace(/\bwireless\b/g, "wireless")
      .replace(/\bsignal\b/g, "signal")
      .replace(/\bprocessing\b/g, "process")
      .replace(/[^a-z0-9]+/g, "");
  }

  function parseRegexPattern(pattern) {
    const regexMatch = String(pattern || "").match(/^\/(.+)\/([a-z]*)$/i);

    if (!regexMatch) {
      return null;
    }

    try {
      return new RegExp(regexMatch[1], regexMatch[2]);
    } catch (_error) {
      return null;
    }
  }

  function aliasMatches(venue, pattern) {
    const regex = parseRegexPattern(pattern);

    if (regex) {
      return regex.test(venue);
    }

    return compactForMatch(venue) === compactForMatch(pattern);
  }

  function rulePatternMatches(venue, pattern) {
    if (pattern instanceof RegExp) {
      return pattern.test(venue);
    }

    return aliasMatches(venue, pattern);
  }

  function abbreviateKnownWorkshop(venue) {
    if (!/\bworkshops?\b/i.test(venue)) {
      return null;
    }

    const match = WORKSHOP_ACRONYM_RULES.find((rule) => rule.pattern.test(venue));
    if (!match) {
      return null;
    }

    return match.acronym === "HotNets" ? "HotNets" : `${match.acronym} Workshop`;
  }

  function abbreviateVtc(venue) {
    if (!/\b(?:VTC|Vehicular\s+Technology\s+Conference)\b/i.test(venue)) {
      return null;
    }

    return "IEEE VTC";
  }

  function abbreviateVenue(venue) {
    const cleanVenue = stripTrailingPunctuation(venue);

    if (!cleanVenue || cleanVenue === UNKNOWN_VENUE) {
      return cleanVenue || UNKNOWN_VENUE;
    }

    if (isArxivVenue(cleanVenue)) {
      return ARXIV_VENUE;
    }

    const workshop = abbreviateKnownWorkshop(cleanVenue);

    if (workshop) {
      return workshop;
    }

    const vtc = abbreviateVtc(cleanVenue);

    if (vtc) {
      return vtc;
    }

    const rule = ABBREVIATION_RULES.find((candidate) => {
      return candidate.patterns.some((pattern) => rulePatternMatches(cleanVenue, pattern));
    });

    return rule ? rule.canonical : cleanVenue;
  }

  function applyAliases(cleanVenue, aliases) {
    const aliasList = Array.isArray(aliases) && aliases.length ? aliases : DEFAULT_ALIASES;

    for (const alias of aliasList) {
      if (!alias || !alias.pattern || !alias.canonical) {
        continue;
      }

      if (aliasMatches(cleanVenue, alias.pattern)) {
        return mergeArxivPreprints(alias.canonical);
      }
    }

    return cleanVenue;
  }

  function normalizeVenue(rawVenue, aliases) {
    const cleanVenue = cleanVenueLine(rawVenue);
    const aliasedVenue = applyAliases(cleanVenue, aliases);
    return abbreviateVenue(aliasedVenue);
  }

  function normalizeTitleForMatch(value) {
    return normalizeSpaces(value)
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function titleTokenSet(value) {
    return new Set(
      normalizeTitleForMatch(value)
        .split(/\s+/)
        .filter((token) => token.length > 2 && !TITLE_STOPWORDS.has(token))
    );
  }

  function titlesProbablyMatch(leftTitle, rightTitle) {
    const left = normalizeTitleForMatch(leftTitle);
    const right = normalizeTitleForMatch(rightTitle);

    if (!left || !right) {
      return false;
    }

    if (left === right) {
      return true;
    }

    if ((left.length >= 30 || right.length >= 30) && (left.includes(right) || right.includes(left))) {
      return true;
    }

    const leftTokens = titleTokenSet(left);
    const rightTokens = titleTokenSet(right);
    const minSize = Math.min(leftTokens.size, rightTokens.size);

    if (minSize < 5) {
      return false;
    }

    let intersection = 0;

    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        intersection += 1;
      }
    }

    return intersection / minSize >= 0.82;
  }

  function parseYear(value) {
    const match = String(value || "").match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  function parseAliasText(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.includes("=>") ? "=>" : "=";
        const [pattern, canonical] = line.split(separator).map((part) => part.trim());

        if (!pattern || !canonical) {
          return null;
        }

        return { pattern, canonical };
      })
      .filter(Boolean);
  }

  function aliasesToText(aliases) {
    return (Array.isArray(aliases) ? aliases : DEFAULT_ALIASES)
      .map((alias) => `${alias.pattern} => ${alias.canonical}`)
      .join("\n");
  }

  const api = {
    UNKNOWN_VENUE,
    DEFAULT_ALIASES,
    normalizeSpaces,
    cleanVenueLine,
    mergeArxivPreprints,
    mergeConferenceYears,
    isArxivVenue,
    abbreviateVenue,
    normalizeVenue,
    normalizeTitleForMatch,
    titlesProbablyMatch,
    parseYear,
    parseAliasText,
    aliasesToText
  };

  global.ScholarVenueStatsNormalizer = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
