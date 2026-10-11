// Producten en onderwerpen die de radar elke dag meet, per markt (zoekterm in de taal van die Wikipedia, categorie).
// Uitbreiden: voeg hier een regel toe. NL = nl.wikipedia, US/WW = en.wikipedia, DE = de.wikipedia.
export const WATCH = {
  NL: [
    ['Thuisbatterij', 'Energy'], ['Warmtepomp', 'Energy'], ['Zonnepaneel', 'Energy'], ['Infraroodverwarming', 'Energy'], ['Thermostaat', 'Energy'],
    ['Elektrische deken', 'Home'], ['Luchtbevochtiger', 'Home'], ['Luchtontvochtiger', 'Home'], ['Elektrische kachel', 'Home'], ['Airfryer', 'Kitchen'],
    ['Adventskalender', 'Seasonal'], ['Kerstboom', 'Seasonal'], ['Chocoladeletter', 'Seasonal'], ['Vuurwerk', 'Seasonal'], ['Oliebol', 'Seasonal'],
    ['Schaatsen', 'Sport'], ['Lichttherapie', 'Health'], ['Vitamine D', 'Health'], ['Powerbank', 'Tech'], ['Elektrische fiets', 'Mobility'],
  ],
  US: [
    ['Heated clothing', 'Apparel'], ['Space heater', 'Home'], ['Electric blanket', 'Home'], ['Humidifier', 'Home'], ['Air fryer', 'Kitchen'],
    ['Advent calendar', 'Seasonal'], ['Christmas tree', 'Seasonal'], ['Ugly Christmas sweater', 'Seasonal'], ['Turkey fryer', 'Seasonal'], ['Hand warmer', 'Outdoor'],
    ['Snow blower', 'Outdoor'], ['Snow boot', 'Apparel'], ['Light therapy', 'Health'], ['Vitamin D', 'Health'], ['Weighted blanket', 'Home'],
    ['Creatine', 'Health'], ['Pickleball', 'Sport'], ['Portable generator', 'Energy'], ['Home energy storage', 'Energy'], ['Solar panel', 'Energy'],
  ],
  DE: [
    ['Wärmepumpe', 'Energy'], ['Balkonkraftwerk', 'Energy'], ['Batteriespeicher', 'Energy'], ['Photovoltaikanlage', 'Energy'], ['Heizlüfter', 'Home'],
    ['Heizdecke', 'Home'], ['Luftbefeuchter', 'Home'], ['Wärmflasche', 'Home'], ['Adventskalender', 'Seasonal'], ['Weihnachtsbaum', 'Seasonal'],
    ['Glühwein', 'Seasonal'], ['Lebkuchen', 'Seasonal'], ['Feuerwerkskörper', 'Seasonal'], ['Raclette', 'Kitchen'], ['Fondue', 'Kitchen'],
    ['Schneekette', 'Mobility'], ['Winterreifen', 'Mobility'], ['Pedelec', 'Mobility'], ['Tageslichtlampe', 'Health'], ['Vitamin D', 'Health'],
  ],
  WW: [
    ['Labubu', 'Toys'], ['Matcha', 'Food'], ['Dubai chocolate', 'Food'], ['Mushroom coffee', 'Food'], ['Protein bar', 'Food'],
    ['Smart ring', 'Tech'], ['Smart glasses', 'Tech'], ['Robotic vacuum cleaner', 'Tech'], ['E-reader', 'Tech'], ['Mechanical keyboard', 'Tech'],
    ['Standing desk', 'Office'], ['3D printing', 'Tech'], ['Drone', 'Tech'], ['Vibe coding', 'Software'], ['AI agent', 'Software'],
    ['Collagen', 'Health'], ['Magnesium supplement', 'Health'], ['Ice bath', 'Health'], ['Padel', 'Sport'], ['Electric bicycle', 'Mobility'],
  ],
};
