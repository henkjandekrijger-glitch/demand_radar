// Thema's met subniches. Per land: zoektermen (in de taal van dat land), een Wikipedia-onderwerp en
// typische piekmaanden (alleen als vaste periode bekend is; gemeten data gaat altijd voor).
// Een eigen thema laat de AI zo'n lijst maken (zie lib/map.js, expandTheme).
export const COUNTRIES = {
  NL: { name: 'Netherlands', lang: 'nl', loc: 2528, wiki: 'nl', q: ['hoe', 'wat'] },
  DE: { name: 'Germany', lang: 'de', loc: 2276, wiki: 'de', q: ['wie', 'was'] },
  US: { name: 'United States', lang: 'en', loc: 2840, wiki: 'en', q: ['how', 'what'] },
};

const N = (id, name, cat, seeds, wiki, peaks = {}, note = '') => ({ id, name, cat, seeds, wiki, peaks, note });

export const PACKS = {
  practice: {
    title: 'Everything people practise for',
    niches: [
      N('job-interview', 'Job interview practice', 'Jobs',
        { NL: ['sollicitatiegesprek oefenen', 'sollicitatiegesprek vragen'], DE: ['vorstellungsgespräch üben', 'vorstellungsgespräch fragen'], US: ['job interview practice', 'interview questions and answers'] },
        { NL: 'Sollicitatie', DE: 'Vorstellungsgespräch', US: 'Job interview' },
        { NL: [1, 9], DE: [1, 9], US: [1, 9] }, 'Job-change seasons: January and September.'),
      N('assessment', 'Assessment & aptitude tests', 'Jobs',
        { NL: ['assessment oefenen', 'capaciteitentest oefenen'], DE: ['einstellungstest üben', 'assessment center übungen'], US: ['aptitude test practice', 'ccat practice test'] },
        { NL: 'Assessment', DE: 'Einstellungstest', US: 'Aptitude' },
        { NL: [1, 9], DE: [8, 9, 10], US: [1, 9] }, 'Germany: most apprenticeship (Ausbildung) selection tests run from late summer to autumn.'),
      N('iq', 'IQ tests & certificates', 'Self-test',
        { NL: ['iq test', 'iq test online'], DE: ['iq test', 'iq test kostenlos'], US: ['iq test', 'iq test online'] },
        { NL: 'Intelligentiequotiënt', DE: 'Intelligenzquotient', US: 'Intelligence quotient' }),
      N('citizenship', 'Citizenship & integration tests', 'Official exams',
        { NL: ['inburgeringsexamen oefenen', 'knm examen oefenen'], DE: ['einbürgerungstest üben', 'leben in deutschland test'], US: ['us citizenship test practice', 'civics test practice'] },
        { NL: 'Inburgeringsexamen', DE: 'Einbürgerungstest', US: 'Naturalization test United States' }),
      N('driving', 'Driving theory tests', 'Official exams',
        { NL: ['theorie examen oefenen', 'cbr theorie oefenen'], DE: ['führerschein theorie üben', 'theorieprüfung führerschein'], US: ['dmv practice test', 'permit practice test'] },
        { NL: 'Rijbewijs', DE: 'Fahrerlaubnisprüfung', US: 'Driving test' },
        { US: [6, 7] }, 'US: teenagers take permit tests mostly in summer.'),
      N('school', 'School exams', 'Education',
        { NL: ['doorstroomtoets oefenen', 'eindexamen oefenen'], DE: ['abitur übungen', 'abitur mathe aufgaben'], US: ['sat practice test', 'act practice test'] },
        { NL: 'Doorstroomtoets', DE: 'Abitur', US: 'SAT' },
        { NL: [2, 5], DE: [3, 4, 5], US: [3, 5, 10] }, 'NL: doorstroomtoets in February, final exams in May. DE: Abitur in spring. US: main SAT dates in spring and autumn.'),
      N('language', 'Language exams', 'Education',
        { NL: ['staatsexamen nt2 oefenen', 'nt2 b1 oefenen'], DE: ['goethe zertifikat b1 übungen', 'telc b1 übungen'], US: ['toefl practice test', 'ielts practice test'] },
        { NL: 'Staatsexamen Nederlands als tweede taal', DE: 'Goethe-Zertifikat', US: 'TOEFL' }),
      N('certificates', 'Professional certificates', 'Jobs',
        { NL: ['vca examen oefenen', 'bhv examen'], DE: ['sachkundeprüfung 34a übungen', 'ihk prüfung vorbereitung'], US: ['pmp practice exam', 'comptia security+ practice test'] },
        { NL: 'VCA', DE: 'Sachkundeprüfung', US: 'Project Management Professional' }),
      N('public-service', 'Police, army & public-service selection', 'Jobs',
        { NL: ['politie selectie oefenen', 'defensie keuring'], DE: ['polizei einstellungstest üben', 'bundeswehr einstellungstest'], US: ['asvab practice test', 'police exam practice'] },
        { NL: 'Politie', DE: 'Einstellungstest', US: 'Armed Services Vocational Aptitude Battery' }),
      N('office-skills', 'Excel & typing tests for jobs', 'Jobs',
        { NL: ['excel test sollicitatie', 'typetest'], DE: ['excel test bewerbung', 'tipptest'], US: ['excel test for job interview', 'typing test'] },
        { NL: null, DE: null, US: null },
        { NL: [1, 9], DE: [1, 9], US: [1, 9] }),
    ],
  },
};
