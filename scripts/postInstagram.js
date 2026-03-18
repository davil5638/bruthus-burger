require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { generateCaption } = require("./generateCaption");
const { generateRotatingHashtags } = require("./generateHashtags");

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID;
const ORDER_LINK = process.env.ORDER_LINK || "https://bruthus-burger.ola.click/products";
const GRAPH_API = "https://graph.facebook.com/v21.0";

// ──────────────────────────────────────────────
// FUNÇÕES DE VALIDAÇÃO
// ──────────────────────────────────────────────

function validarConfig() {
  if (!ACCESS_TOKEN || ACCESS_TOKEN === "SEU_ACCESS_TOKEN_AQUI") {
    throw new Error("❌ META_ACCESS_TOKEN não configurado no .env");
  }
  if (!IG_USER_ID || IG_USER_ID === "SEU_IG_USER_ID_AQUI") {
    throw new Error("❌ IG_USER_ID não configurado no .env");
  }
}

// ──────────────────────────────────────────────
// SELECIONAR IMAGEM DA PASTA
// ──────────────────────────────────────────────

/**
 * Seleciona uma imagem da pasta /content/fotos
 * Opcionalmente remove da fila após usar (modo rotação)
 */
function selecionarImagem(removerAposUso = false) {
  const pastaFotos = path.resolve(__dirname, "../content/fotos");
  const extensoesValidas = [".jpg", ".jpeg", ".png"];

  if (!fs.existsSync(pastaFotos)) {
    throw new Error(`❌ Pasta não encontrada: ${pastaFotos}`);
  }

  const arquivos = fs.readdirSync(pastaFotos).filter((f) =>
    extensoesValidas.includes(path.extname(f).toLowerCase())
  );

  if (arquivos.length === 0) {
    throw new Error(`❌ Nenhuma imagem encontrada em ${pastaFotos}. Adicione fotos .jpg ou .png!`);
  }

  // Seleciona a mais antiga (FIFO - first in, first out)
  const imagemSelecionada = arquivos[0];
  const caminhoCompleto = path.join(pastaFotos, imagemSelecionada);

  console.log(`📷 Imagem selecionada: ${imagemSelecionada}`);
  console.log(`📁 Total na fila: ${arquivos.length} imagens`);

  if (removerAposUso) {
    // Move para pasta "usadas" após publicar
    const pastaUsadas = path.resolve(__dirname, "../content/fotos_usadas");
    if (!fs.existsSync(pastaUsadas)) fs.mkdirSync(pastaUsadas, { recursive: true });
    fs.renameSync(caminhoCompleto, path.join(pastaUsadas, imagemSelecionada));
    console.log(`✅ Imagem movida para /content/fotos_usadas`);
  }

  return caminhoCompleto;
}

// ──────────────────────────────────────────────
// UPLOAD DE IMAGEM NO INSTAGRAM
// ──────────────────────────────────────────────

/**
 * Cria container de mídia no Instagram (passo 1 da publicação)
 * A imagem precisa ser uma URL pública acessível - use um host de imagens
 */
async function criarContainerMidia(imageUrl, legenda) {
  const url = `${GRAPH_API}/${IG_USER_ID}/media`;

  console.log("\n📤 Criando container de mídia no Instagram...");

  const response = await axios.post(url, null, {
    params: {
      image_url: imageUrl,
      caption: legenda,
      access_token: ACCESS_TOKEN,
    },
  });

  if (!response.data.id) {
    throw new Error("❌ Falha ao criar container de mídia: " + JSON.stringify(response.data));
  }

  console.log(`✅ Container criado: ${response.data.id}`);
  return response.data.id;
}

/**
 * Publica o container de mídia (passo 2 - publicação efetiva)
 */
async function publicarContainer(containerId) {
  const url = `${GRAPH_API}/${IG_USER_ID}/media_publish`;

  console.log("\n🚀 Publicando post no Instagram...");

  const response = await axios.post(url, null, {
    params: {
      creation_id: containerId,
      access_token: ACCESS_TOKEN,
    },
  });

  if (!response.data.id) {
    throw new Error("❌ Falha ao publicar: " + JSON.stringify(response.data));
  }

  console.log(`✅ Post publicado! ID: ${response.data.id}`);
  return response.data.id;
}

// ──────────────────────────────────────────────
// COMENTÁRIO FIXADO
// ──────────────────────────────────────────────

/**
 * Adiciona comentário ao post
 */
async function comentarNoPost(postId, comentario) {
  const url = `${GRAPH_API}/${postId}/comments`;

  const response = await axios.post(url, null, {
    params: {
      message: comentario,
      access_token: ACCESS_TOKEN,
    },
  });

  return response.data.id;
}

/**
 * Fixa um comentário no post
 * Nota: A fixação de comentários requer permissão especial na API
 */
async function fixarComentario(postId, comentario) {
  try {
    console.log("\n📌 Adicionando comentário de CTA...");
    const comentarioId = await comentarNoPost(postId, comentario);
    console.log(`✅ Comentário adicionado: ${comentarioId}`);
    return comentarioId;
  } catch (error) {
    console.warn(`⚠️ Não foi possível adicionar comentário: ${error.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────
// VERIFICAR STATUS DO CONTAINER
// ──────────────────────────────────────────────

async function verificarStatusContainer(containerId, tentativas = 10) {
  for (let i = 0; i < tentativas; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const response = await axios.get(`${GRAPH_API}/${containerId}`, {
      params: {
        fields: "status_code,status",
        access_token: ACCESS_TOKEN,
      },
    });

    const status = response.data.status_code;
    console.log(`⏳ Status do container: ${status} (tentativa ${i + 1}/${tentativas})`);

    if (status === "FINISHED") return true;
    if (status === "ERROR") throw new Error(`❌ Erro no processamento da mídia: ${JSON.stringify(response.data)}`);
  }

  throw new Error("❌ Timeout: container não ficou pronto a tempo");
}

// ──────────────────────────────────────────────
// FUNÇÃO PRINCIPAL DE POSTAGEM
// ──────────────────────────────────────────────

/**
 * Fluxo completo: seleciona imagem → gera legenda → publica → comenta
 * @param {object} opcoes - Opções de postagem
 * @param {string} opcoes.imageUrl - URL pública da imagem (obrigatório para API)
 * @param {string} opcoes.tipoCaptions - Tipo de legenda a gerar
 * @param {string} opcoes.legendaCustom - Legenda customizada (opcional, ignora IA)
 * @param {boolean} opcoes.incluirHashtags - Incluir hashtags (padrão: true)
 * @param {boolean} opcoes.comentarLink - Comentar link de pedido (padrão: true)
 */
async function publicarPost(opcoes = {}) {
  const {
    imageUrl,
    tipoCaptions = "SMASH",
    legendaCustom = null,
    incluirHashtags = true,
    comentarLink = true,
  } = opcoes;

  validarConfig();

  if (!imageUrl) {
    throw new Error("❌ imageUrl é obrigatório. A API do Instagram exige uma URL pública da imagem.");
  }

  try {
    console.log("\n" + "═".repeat(50));
    console.log("🍔 BRUTHUS BURGER - PUBLICAÇÃO AUTOMÁTICA");
    console.log("═".repeat(50));

    // 1. Gera ou usa legenda customizada
    let legenda;
    if (legendaCustom) {
      legenda = legendaCustom;
    } else {
      console.log("\n🤖 Gerando legenda com IA...");
      const legendaGerada = await generateCaption(tipoCaptions);
      const hashtags = incluirHashtags ? "\n\n" + generateRotatingHashtags(tipoCaptions.toLowerCase()) : "";
      legenda = legendaGerada + hashtags;
    }

    console.log("\n📝 Legenda que será publicada:");
    console.log("─".repeat(40));
    console.log(legenda.substring(0, 200) + (legenda.length > 200 ? "..." : ""));
    console.log("─".repeat(40));

    // 2. Cria container de mídia
    const containerId = await criarContainerMidia(imageUrl, legenda);

    // 3. Aguarda processamento
    await verificarStatusContainer(containerId);

    // 4. Publica
    const postId = await publicarContainer(containerId);

    // 5. Adiciona comentário com link de pedido
    if (comentarLink) {
      const comentarioCTA = `🍔 Peça direto aqui 👇\n${ORDER_LINK}`;
      await fixarComentario(postId, comentarioCTA);
    }

    // 6. Log de sucesso
    const resultado = {
      postId,
      imageUrl,
      legendaUsada: legenda,
      publicadoEm: new Date().toISOString(),
    };

    const logPath = path.resolve(__dirname, "../generated/captions/post_log.json");
    const logs = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
    logs.push(resultado);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    console.log("\n" + "═".repeat(50));
    console.log("✅ POST PUBLICADO COM SUCESSO!");
    console.log(`🆔 Post ID: ${postId}`);
    console.log(`🕐 Publicado em: ${resultado.publicadoEm}`);
    console.log("═".repeat(50) + "\n");

    return resultado;
  } catch (error) {
    console.error("\n❌ ERRO NA PUBLICAÇÃO:", error.message);
    throw error;
  }
}

// ──────────────────────────────────────────────
// BUSCAR POSTS PUBLICADOS
// ──────────────────────────────────────────────

async function listarPostsPublicados(limite = 10) {
  validarConfig();

  const response = await axios.get(`${GRAPH_API}/${IG_USER_ID}/media`, {
    params: {
      fields: "id,caption,timestamp,like_count,comments_count,permalink",
      limit: limite,
      access_token: ACCESS_TOKEN,
    },
  });

  console.log("\n📊 Posts publicados recentemente:\n");
  response.data.data.forEach((post, i) => {
    console.log(`[${i + 1}] ID: ${post.id}`);
    console.log(`    📅 ${post.timestamp}`);
    console.log(`    ❤️  ${post.like_count || 0} curtidas | 💬 ${post.comments_count || 0} comentários`);
    console.log(`    🔗 ${post.permalink}\n`);
  });

  return response.data.data;
}

// Execução direta
if (require.main === module) {
  const comando = process.argv[2];

  if (comando === "listar") {
    listarPostsPublicados().catch(console.error);
  } else {
    // Exemplo de uso - substituir pela URL real da imagem
    const imageUrlTeste = process.argv[2] || "https://via.placeholder.com/1080x1080";

    publicarPost({
      imageUrl: imageUrlTeste,
      tipoCaptions: "SMASH",
      incluirHashtags: true,
      comentarLink: true,
    }).catch(console.error);
  }
}

// ──────────────────────────────────────────────
// PUBLICAR STORY
// ──────────────────────────────────────────────

/**
 * Publica uma imagem como Story no Instagram.
 * A imagem deve ser 1080x1920 (9:16) — ideal via Cloudinary.
 * Stories não têm legenda — o texto já vem baked na imagem.
 *
 * @param {string} imageUrl — URL pública da imagem do story
 */
async function publicarStory(imageUrl, linkPedido = null) {
  validarConfig();

  if (!imageUrl) {
    throw new Error("❌ imageUrl é obrigatório para publicar story.");
  }

  try {
    console.log("\n" + "═".repeat(50));
    console.log("📱 BRUTHUS BURGER - PUBLICANDO STORY");
    console.log("═".repeat(50));
    console.log(`🖼️  URL: ${imageUrl.substring(0, 80)}...`);
    if (linkPedido) console.log(`🔗 Link sticker: ${linkPedido}`);

    // Passo 1: Criar container de story
    const params = {
      image_url: imageUrl,
      media_type: "STORIES",
      access_token: ACCESS_TOKEN,
    };

    // Link sticker clicável — aparece no story para o cliente clicar
    if (linkPedido) {
      params.story_links = JSON.stringify([{ url: linkPedido }]);
    }

    const containerRes = await axios.post(`${GRAPH_API}/${IG_USER_ID}/media`, null, { params });

    const containerId = containerRes.data.id;
    if (!containerId) {
      throw new Error("❌ Falha ao criar container de story: " + JSON.stringify(containerRes.data));
    }
    console.log(`✅ Container de story criado: ${containerId}`);

    // Passo 2: Aguarda processamento
    await verificarStatusContainer(containerId);

    // Passo 3: Publicar
    const publishRes = await axios.post(`${GRAPH_API}/${IG_USER_ID}/media_publish`, null, {
      params: {
        creation_id: containerId,
        access_token: ACCESS_TOKEN,
      },
    });

    const storyId = publishRes.data.id;
    if (!storyId) {
      throw new Error("❌ Falha ao publicar story: " + JSON.stringify(publishRes.data));
    }

    const resultado = {
      storyId,
      imageUrl,
      publicadoEm: new Date().toISOString(),
    };

    console.log("\n" + "═".repeat(50));
    console.log("✅ STORY PUBLICADO COM SUCESSO!");
    console.log(`🆔 Story ID: ${storyId}`);
    console.log(`🕐 Publicado em: ${resultado.publicadoEm}`);
    console.log("═".repeat(50) + "\n");

    return resultado;
  } catch (error) {
    const detalhe = error.response?.data?.error?.message || error.response?.data || error.message;
    console.error("\n❌ ERRO AO PUBLICAR STORY:", detalhe);
    const err = new Error(typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe));
    throw err;
  }
}

module.exports = { publicarPost, publicarStory, listarPostsPublicados, selecionarImagem };
