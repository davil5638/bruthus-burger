require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");

const CITY = process.env.CITY || "Fortaleza";
const STATE = process.env.STATE || "CE";

// Banco de hashtags organizadas por categoria
const HASHTAG_BANK = {
  // Produto
  produto: [
    "#burger", "#hamburguer", "#hamburgueria", "#smashburger", "#smash",
    "#burgerartesanal", "#hamburguerartesanal", "#cheeseburguer",
    "#burguerlovers", "#burgertime", "#burgerlife", "#burgerlover",
    "#craftburger", "#doubleburger", "#tripleburger",
  ],

  // Ingredientes
  ingredientes: [
    "#batatasfrites", "#batatafrita", "#queijocheddar", "#cheddar",
    "#paobrioiche", "#brioche", "#carnemoida", "#smashpatty",
    "#molhoespecial", "#picles",
  ],

  // Delivery / Pedido
  delivery: [
    "#delivery", "#deliveryfood", "#deliveryfood", "#peçaagora",
    "#pedidoonline", "#comidadelivery", "#deliveryhamburguer",
    "#food", "#fooddelivery", "#comidarapida",
  ],

  // Food photography
  foodporn: [
    "#foodporn", "#foodphotography", "#foodie", "#instafood",
    "#foodstagram", "#foodlover", "#foodblogger", "#yummy",
    "#delicious", "#tasty", "#foodgasm", "#foodpics",
  ],

  // Local - Fortaleza/CE
  local: [
    `#${CITY.toLowerCase()}food`, `#${CITY.toLowerCase()}`,
    `#comida${CITY.toLowerCase()}`, `#${STATE.toLowerCase()}food`,
    `#${STATE.toLowerCase()}hamburguer`, `#delivery${CITY.toLowerCase()}`,
    "#nordeste", "#nordestino", "#comidanordestina",
  ],

  // Branding
  branding: ["#bruthusburger", "#bruthus"],

  // Trending food
  trending: [
    "#smashburguer", "#smashburgers", "#streetfood",
    "#fastfood", "#junkfood", "#burgershop", "#hamburguerismo",
    "#burguergringo", "#cheeseburger",
  ],
};

/**
 * Gera conjunto otimizado de hashtags para um post
 * @param {string} tipo - Tipo de post (produto, promo, reels)
 * @param {number} total - Total de hashtags desejadas (max 30 para Instagram)
 * @returns {string} String de hashtags prontas para usar
 */
function generateHashtags(tipo = "produto", total = 25) {
  const sets = {
    produto: {
      produto: 6,
      ingredientes: 3,
      foodporn: 5,
      delivery: 4,
      local: 4,
      branding: 2,
      trending: 1,
    },
    promo: {
      produto: 4,
      delivery: 6,
      foodporn: 4,
      local: 5,
      branding: 2,
      trending: 2,
      ingredientes: 2,
    },
    reels: {
      produto: 5,
      foodporn: 6,
      trending: 5,
      local: 4,
      branding: 2,
      delivery: 3,
    },
    default: {
      produto: 5,
      foodporn: 5,
      delivery: 4,
      local: 4,
      branding: 2,
      trending: 3,
      ingredientes: 2,
    },
  };

  const distribuicao = sets[tipo] || sets.default;
  const hashtagsSelecionadas = [];

  // Seleciona hashtags de cada categoria conforme distribuição
  for (const [categoria, quantidade] of Object.entries(distribuicao)) {
    const pool = [...HASHTAG_BANK[categoria]];
    const selecionadas = shuffleArray(pool).slice(0, quantidade);
    hashtagsSelecionadas.push(...selecionadas);
  }

  // Remove duplicatas e limita ao máximo
  const unicas = [...new Set(hashtagsSelecionadas)].slice(0, total);

  return unicas.join(" ");
}

/**
 * Gera hashtags com variação para evitar shadowban
 * Alterna grupos de hashtags a cada chamada
 */
function generateRotatingHashtags(tipo = "produto") {
  // Cria variações para não repetir sempre as mesmas
  const variacao1 = generateHashtags(tipo, 25);
  const variacao2 = generateHashtags(tipo, 25);
  const variacao3 = generateHashtags(tipo, 25);

  const variacoes = [variacao1, variacao2, variacao3];
  const indice = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % 3; // Muda a cada dia

  return variacoes[indice];
}

/**
 * Salva as hashtags geradas em arquivo
 */
function saveHashtags(hashtags, tipo = "geral") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.resolve(
    __dirname,
    `../generated/hashtags/hashtags_${tipo}_${timestamp}.txt`
  );
  fs.writeFileSync(outputPath, hashtags, "utf-8");
  return outputPath;
}

/**
 * Embaralha array
 */
function shuffleArray(arr) {
  return arr.sort(() => Math.random() - 0.5);
}

// Execução direta
if (require.main === module) {
  const tipo = process.argv[2] || "produto";
  const hashtags = generateRotatingHashtags(tipo);

  console.log(`\n✅ Hashtags geradas para: ${tipo}\n`);
  console.log("─".repeat(50));
  console.log(hashtags);
  console.log("─".repeat(50));
  console.log(`\nTotal: ${hashtags.split(" ").length} hashtags`);

  const filePath = saveHashtags(hashtags, tipo);
  console.log(`\n📁 Salvo em: ${filePath}\n`);
}

module.exports = { generateHashtags, generateRotatingHashtags, HASHTAG_BANK };
