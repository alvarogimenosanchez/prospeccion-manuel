// Datos geográficos de España: CCAA → Provincias → Municipios principales
// Solo capitales + ciudades >20k habitantes (cubre ~90% de uso real)

export type Provincia = {
  nombre: string;
  municipios: string[]; // Capital primero, luego ordenados por población
};

export type CCAA = {
  nombre: string;
  provincias: Provincia[];
};

export const ESPANA: CCAA[] = [
  {
    nombre: "Andalucía",
    provincias: [
      { nombre: "Almería", municipios: ["Almería", "El Ejido", "Roquetas de Mar", "Níjar", "Vícar", "Adra"] },
      { nombre: "Cádiz", municipios: ["Cádiz", "Jerez de la Frontera", "Algeciras", "San Fernando", "El Puerto de Santa María", "Chiclana", "La Línea", "Sanlúcar de Barrameda"] },
      { nombre: "Córdoba", municipios: ["Córdoba", "Lucena", "Puente Genil", "Montilla", "Cabra", "Priego de Córdoba"] },
      { nombre: "Granada", municipios: ["Granada", "Motril", "Almuñécar", "Baza", "Loja", "Guadix"] },
      { nombre: "Huelva", municipios: ["Huelva", "Lepe", "Almonte", "Ayamonte", "Moguer", "Punta Umbría"] },
      { nombre: "Jaén", municipios: ["Jaén", "Linares", "Andújar", "Úbeda", "Martos", "Alcalá la Real"] },
      { nombre: "Málaga", municipios: ["Málaga", "Marbella", "Vélez-Málaga", "Mijas", "Fuengirola", "Torremolinos", "Benalmádena", "Estepona", "Ronda", "Antequera"] },
      { nombre: "Sevilla", municipios: ["Sevilla", "Dos Hermanas", "Alcalá de Guadaíra", "Utrera", "Mairena del Aljarafe", "Écija", "Los Palacios y Villafranca", "Lebrija"] },
    ],
  },
  {
    nombre: "Aragón",
    provincias: [
      { nombre: "Huesca", municipios: ["Huesca", "Monzón", "Barbastro", "Fraga", "Jaca", "Sabiñánigo"] },
      { nombre: "Teruel", municipios: ["Teruel", "Alcañiz", "Andorra", "Calamocha"] },
      { nombre: "Zaragoza", municipios: ["Zaragoza", "Calatayud", "Utebo", "Ejea de los Caballeros", "Tarazona"] },
    ],
  },
  {
    nombre: "Asturias",
    provincias: [
      { nombre: "Asturias", municipios: ["Oviedo", "Gijón", "Avilés", "Siero", "Langreo", "Mieres", "Castrillón", "Llanera"] },
    ],
  },
  {
    nombre: "Baleares",
    provincias: [
      { nombre: "Illes Balears", municipios: ["Palma", "Calvià", "Manacor", "Ibiza", "Llucmajor", "Marratxí", "Inca", "Santa Eulalia", "Mahón", "Ciutadella"] },
    ],
  },
  {
    nombre: "Canarias",
    provincias: [
      { nombre: "Las Palmas", municipios: ["Las Palmas de Gran Canaria", "Telde", "Santa Lucía de Tirajana", "Arrecife", "San Bartolomé de Tirajana", "Puerto del Rosario", "Mogán"] },
      { nombre: "Santa Cruz de Tenerife", municipios: ["Santa Cruz de Tenerife", "San Cristóbal de La Laguna", "Arona", "Adeje", "Granadilla de Abona", "La Orotava", "Los Realejos"] },
    ],
  },
  {
    nombre: "Cantabria",
    provincias: [
      { nombre: "Cantabria", municipios: ["Santander", "Torrelavega", "Castro-Urdiales", "Camargo", "Piélagos", "El Astillero", "Laredo"] },
    ],
  },
  {
    nombre: "Castilla-La Mancha",
    provincias: [
      { nombre: "Albacete", municipios: ["Albacete", "Hellín", "Villarrobledo", "Almansa", "La Roda"] },
      { nombre: "Ciudad Real", municipios: ["Ciudad Real", "Puertollano", "Tomelloso", "Alcázar de San Juan", "Valdepeñas", "Manzanares"] },
      { nombre: "Cuenca", municipios: ["Cuenca", "Tarancón", "Quintanar del Rey", "San Clemente"] },
      { nombre: "Guadalajara", municipios: ["Guadalajara", "Azuqueca de Henares", "Cabanillas del Campo", "Sigüenza"] },
      { nombre: "Toledo", municipios: ["Toledo", "Talavera de la Reina", "Illescas", "Seseña", "Torrijos", "Yuncos", "Ocaña"] },
    ],
  },
  {
    nombre: "Castilla y León",
    provincias: [
      { nombre: "Ávila", municipios: ["Ávila", "Arévalo", "Las Navas del Marqués", "Arenas de San Pedro"] },
      { nombre: "Burgos", municipios: ["Burgos", "Aranda de Duero", "Miranda de Ebro", "Briviesca"] },
      { nombre: "León", municipios: ["León", "Ponferrada", "San Andrés del Rabanedo", "Villaquilambre", "Astorga"] },
      { nombre: "Palencia", municipios: ["Palencia", "Aguilar de Campoo", "Guardo", "Venta de Baños"] },
      { nombre: "Salamanca", municipios: ["Salamanca", "Béjar", "Ciudad Rodrigo", "Santa Marta de Tormes", "Villamayor"] },
      { nombre: "Segovia", municipios: ["Segovia", "Cuéllar", "El Espinar", "La Granja"] },
      { nombre: "Soria", municipios: ["Soria", "Almazán", "Burgo de Osma"] },
      { nombre: "Valladolid", municipios: ["Valladolid", "Medina del Campo", "Laguna de Duero", "Arroyo de la Encomienda", "Tordesillas"] },
      { nombre: "Zamora", municipios: ["Zamora", "Benavente", "Toro"] },
    ],
  },
  {
    nombre: "Cataluña",
    provincias: [
      { nombre: "Barcelona", municipios: ["Barcelona", "L'Hospitalet de Llobregat", "Badalona", "Terrassa", "Sabadell", "Mataró", "Santa Coloma de Gramenet", "Cornellà", "Sant Cugat", "Manresa", "Rubí", "Vilanova i la Geltrú", "El Prat de Llobregat", "Granollers", "Mollet del Vallès"] },
      { nombre: "Girona", municipios: ["Girona", "Figueres", "Blanes", "Lloret de Mar", "Olot", "Salt", "Palafrugell"] },
      { nombre: "Lleida", municipios: ["Lleida", "Balaguer", "Tàrrega", "Mollerussa", "La Seu d'Urgell"] },
      { nombre: "Tarragona", municipios: ["Tarragona", "Reus", "Cambrils", "Salou", "Tortosa", "El Vendrell", "Valls"] },
    ],
  },
  {
    nombre: "Comunidad Valenciana",
    provincias: [
      { nombre: "Alicante", municipios: ["Alicante", "Elche", "Torrevieja", "Orihuela", "Benidorm", "Alcoy", "Elda", "San Vicente del Raspeig", "Denia", "Petrer", "Villena", "Santa Pola", "Crevillente"] },
      { nombre: "Castellón", municipios: ["Castellón de la Plana", "Vila-real", "Burriana", "Vinaròs", "Onda", "Almazora", "Benicàssim", "Benicarló"] },
      { nombre: "Valencia", municipios: ["Valencia", "Gandía", "Torrent", "Paterna", "Sagunto", "Mislata", "Alzira", "Burjassot", "Xirivella", "Cullera", "Alaquàs", "Manises", "Quart de Poblet", "Aldaia", "Ontinyent"] },
    ],
  },
  {
    nombre: "Extremadura",
    provincias: [
      { nombre: "Badajoz", municipios: ["Badajoz", "Mérida", "Don Benito", "Almendralejo", "Villanueva de la Serena", "Olivenza", "Zafra"] },
      { nombre: "Cáceres", municipios: ["Cáceres", "Plasencia", "Navalmoral de la Mata", "Coria", "Trujillo", "Miajadas"] },
    ],
  },
  {
    nombre: "Galicia",
    provincias: [
      { nombre: "A Coruña", municipios: ["A Coruña", "Santiago de Compostela", "Ferrol", "Narón", "Oleiros", "Arteixo", "Carballo", "Culleredo", "Ames", "Boiro", "Cedeira", "Ribeira"] },
      { nombre: "Lugo", municipios: ["Lugo", "Monforte de Lemos", "Viveiro", "Sarria", "Vilalba", "Burela"] },
      { nombre: "Ourense", municipios: ["Ourense", "Verín", "O Barco", "O Carballiño", "Xinzo de Limia"] },
      { nombre: "Pontevedra", municipios: ["Pontevedra", "Vigo", "Marín", "Redondela", "Cangas", "Vilagarcía de Arousa", "A Estrada", "Ponteareas", "Tui", "Lalín", "Sanxenxo"] },
    ],
  },
  {
    nombre: "La Rioja",
    provincias: [
      { nombre: "La Rioja", municipios: ["Logroño", "Calahorra", "Arnedo", "Haro", "Lardero", "Nájera"] },
    ],
  },
  {
    nombre: "Madrid",
    provincias: [
      { nombre: "Madrid", municipios: ["Madrid", "Móstoles", "Alcalá de Henares", "Fuenlabrada", "Leganés", "Getafe", "Alcorcón", "Torrejón de Ardoz", "Parla", "Alcobendas", "Coslada", "Las Rozas", "Pozuelo de Alarcón", "Majadahonda", "San Sebastián de los Reyes", "Rivas-Vaciamadrid", "Valdemoro", "Aranjuez", "Collado Villalba", "Boadilla del Monte", "Tres Cantos", "Pinto", "Colmenar Viejo", "Galapagar"] },
    ],
  },
  {
    nombre: "Murcia",
    provincias: [
      { nombre: "Murcia", municipios: ["Murcia", "Cartagena", "Lorca", "Molina de Segura", "Alcantarilla", "Mazarrón", "Águilas", "Yecla", "San Javier", "Totana", "Cieza", "Jumilla"] },
    ],
  },
  {
    nombre: "Navarra",
    provincias: [
      { nombre: "Navarra", municipios: ["Pamplona", "Tudela", "Barañáin", "Burlada", "Zizur Mayor", "Estella", "Tafalla"] },
    ],
  },
  {
    nombre: "País Vasco",
    provincias: [
      { nombre: "Álava", municipios: ["Vitoria-Gasteiz", "Llodio", "Amurrio", "Salvatierra"] },
      { nombre: "Bizkaia", municipios: ["Bilbao", "Barakaldo", "Getxo", "Portugalete", "Santurtzi", "Basauri", "Leioa", "Galdakao", "Sestao", "Durango", "Erandio"] },
      { nombre: "Gipuzkoa", municipios: ["Donostia", "Irun", "Errenteria", "Eibar", "Zarautz", "Hernani", "Hondarribia", "Tolosa", "Andoain"] },
    ],
  },
  {
    nombre: "Ceuta",
    provincias: [{ nombre: "Ceuta", municipios: ["Ceuta"] }],
  },
  {
    nombre: "Melilla",
    provincias: [{ nombre: "Melilla", municipios: ["Melilla"] }],
  },
];

// Helpers
export function getCCAAByNombre(nombre: string): CCAA | undefined {
  return ESPANA.find(c => c.nombre === nombre);
}

export function getProvinciaByNombre(nombre: string): { ccaa: CCAA; provincia: Provincia } | undefined {
  for (const ccaa of ESPANA) {
    const prov = ccaa.provincias.find(p => p.nombre === nombre);
    if (prov) return { ccaa, provincia: prov };
  }
  return undefined;
}

export function municipiosDeCCAA(ccaaNombre: string): string[] {
  const ccaa = getCCAAByNombre(ccaaNombre);
  if (!ccaa) return [];
  return ccaa.provincias.flatMap(p => p.municipios);
}

export function capitalesDeCCAA(ccaaNombre: string): string[] {
  const ccaa = getCCAAByNombre(ccaaNombre);
  if (!ccaa) return [];
  return ccaa.provincias.map(p => p.municipios[0]);
}

export function municipiosDeProvincia(provinciaNombre: string): string[] {
  return getProvinciaByNombre(provinciaNombre)?.provincia.municipios ?? [];
}
