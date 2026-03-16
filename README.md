# 🍔 Bruthus Burger — Marketing Automation

Sistema completo de automação de marketing no Instagram para a **Bruthus Burger**.

**Objetivo:** Transformar o Instagram em uma máquina de gerar pedidos direto no link:
> https://bruthus-burger.ola.click/products

---

## 📁 Estrutura do Projeto

```
bruthus-marketing/
├── content/
│   ├── fotos/          ← Coloque as fotos aqui para postagem automática
│   └── videos/         ← Vídeos para Reels
├── generated/
│   ├── captions/       ← Legendas geradas pela IA
│   ├── hashtags/       ← Hashtags geradas
│   └── promotions/     ← Promoções geradas + logs de anúncios
├── scripts/
│   ├── generateCaption.js      → Gera legendas com IA
│   ├── generatePromotion.js    → Gera promoções da semana
│   ├── generateReelsScript.js  → Gera roteiros de Reels
│   ├── generateHashtags.js     → Gera hashtags estratégicas
│   ├── postInstagram.js        → Publica posts no Instagram
│   └── createAds.js            → Cria campanhas no Meta Ads
├── scheduler/
│   └── scheduler.js    → Agendador automático (node-cron)
├── server.js           → API REST completa
├── .env                → Credenciais (NÃO commitar!)
└── package.json
```

---

## ⚙️ Configuração Inicial

### 1. Instalar dependências

```bash
cd bruthus-marketing
npm install
```

### 2. Configurar o `.env`

Edite o arquivo `.env` com suas credenciais:

```env
META_ACCESS_TOKEN=seu_token_aqui
IG_USER_ID=seu_ig_user_id_aqui
AD_ACCOUNT_ID=act_seu_ad_account_id_aqui
OPENAI_API_KEY=sua_openai_key_aqui
```

---

## 🔑 Como Obter as Credenciais da Meta

### Passo 1 — Criar App na Meta

1. Acesse: https://developers.facebook.com/apps
2. Clique em **"Criar App"**
3. Selecione: **"Empresa"** ou **"Outro"**
4. Dê um nome (ex: `Bruthus Marketing`)
5. Em **Produtos**, adicione:
   - **Instagram Graph API**
   - **Marketing API**

---

### Passo 2 — Conectar Instagram Business

> Requisito: conta do Instagram precisa ser **Business** ou **Creator** e vinculada a uma **Página do Facebook**

1. No painel do App, vá em **Instagram > Configurações Básicas**
2. Adicione sua conta de Instagram Business
3. Em **Permissões**, solicite:
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_comments`
   - `pages_read_engagement`
   - `ads_management` (para criar anúncios)

---

### Passo 3 — Obter o Access Token

**Opção A — Token de longa duração (recomendado):**

1. Vá em: https://developers.facebook.com/tools/explorer
2. Selecione seu App
3. Gere token com as permissões acima
4. Troque pelo token de longa duração (60 dias):

```bash
curl "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=SEU_APP_ID&client_secret=SEU_APP_SECRET&fb_exchange_token=TOKEN_CURTO"
```

**Opção B — Token permanente via System User:**
1. No Business Manager → Configurações → Usuários do Sistema
2. Crie um Usuário do Sistema Admin
3. Gere token permanente com as permissões necessárias

---

### Passo 4 — Obter o IG User ID

```bash
curl "https://graph.facebook.com/v18.0/me/accounts?access_token=SEU_TOKEN"
```

Pegue o `id` da sua página, depois:

```bash
curl "https://graph.facebook.com/v18.0/SEU_PAGE_ID?fields=instagram_business_account&access_token=SEU_TOKEN"
```

O `instagram_business_account.id` é o seu **IG_USER_ID**.

---

### Passo 5 — Obter o Ad Account ID

1. Acesse: https://business.facebook.com
2. Vá em **Configurações do Negócio → Contas de Anúncios**
3. Copie o ID (formato: `act_123456789`)

---

## 🚀 Como Rodar

### Iniciar o servidor completo (com agendador)

```bash
npm start
```

### Modo desenvolvimento (reinicia automaticamente)

```bash
npm run dev
```

### Rodar scripts individualmente

```bash
# Gerar uma legenda
npm run caption

# Gerar legenda por tipo: SMASH, COMBO, PROMOCAO, FAMILIA, BATATA
node scripts/generateCaption.js SMASH

# Gerar 6 legendas em lote
node scripts/generateCaption.js SMASH --lote

# Gerar promoção do dia
npm run promotion

# Gerar promoção específica
node scripts/generatePromotion.js QUINTA_BURGER

# Gerar promoções da semana inteira
node scripts/generatePromotion.js QUINTA_BURGER --semana

# Gerar roteiro de Reels (formato, duração em segundos)
npm run reels
node scripts/generateReelsScript.js CLOSE_UP 30
node scripts/generateReelsScript.js MAKING_OF 60

# Publicar post (exige imageUrl pública)
node scripts/postInstagram.js https://sua-url-da-imagem.com/foto.jpg

# Criar campanha Meta Ads
node scripts/createAds.js https://sua-url-da-imagem.com/foto.jpg

# Ver relatório de anúncios (últimos 7 dias)
node scripts/createAds.js relatorio

# Testar agendamento sem esperar o horário
node scheduler/scheduler.js testar quinta
node scheduler/scheduler.js testar sexta
```

---

## 📸 Como Adicionar Fotos para Postagem

1. Coloque as fotos em `content/fotos/`
2. Formatos aceitos: `.jpg`, `.jpeg`, `.png`
3. Resolução recomendada: **1080x1080px** (quadrado) ou **1080x1350px** (retrato)
4. O sistema seleciona a mais antiga (fila FIFO)
5. Após postagem, a foto é movida para `content/fotos_usadas/`

> ⚠️ **IMPORTANTE:** A API do Instagram exige que a imagem esteja em uma **URL pública** acessível.
> Use serviços como: **Cloudinary**, **AWS S3**, **Imgur** ou qualquer CDN.

---

## 📅 Estratégia de Postagem Automática

| Dia        | Horário | Conteúdo              |
|------------|---------|----------------------|
| Segunda    | 18h     | 🍔 Burger Clássico   |
| Quarta     | 18h     | 🍟 Batata ou Combo   |
| Quinta     | 18h     | 🎉 Quinta do Hambúrguer |
| Sexta      | 19h     | 🔥 Smash Burger      |
| Domingo    | 17h     | 👨‍👩‍👧‍👦 Combo Família |
| Segunda    | 9h      | 📊 Relatório semanal |

Para configurar as imagens de cada dia, adicione no `.env`:

```env
IMG_SEGUNDA=https://url-da-sua-imagem-de-segunda.jpg
IMG_QUARTA=https://url-da-sua-imagem-de-quarta.jpg
IMG_QUINTA=https://url-da-sua-imagem-de-quinta.jpg
IMG_SEXTA=https://url-da-sua-imagem-de-sexta.jpg
IMG_DOMINGO=https://url-da-sua-imagem-de-domingo.jpg
```

---

## 🌐 API REST — Endpoints

Com o servidor rodando em `http://localhost:3000`:

| Método | Endpoint              | Descrição                    |
|--------|-----------------------|------------------------------|
| GET    | `/`                   | Lista todos os endpoints     |
| GET    | `/status`             | Status e configurações       |
| POST   | `/post`               | Publica post no Instagram    |
| POST   | `/caption`            | Gera legenda com IA          |
| POST   | `/caption/batch`      | Gera múltiplas legendas      |
| POST   | `/promotion`          | Gera promoção                |
| GET    | `/promotion/tipos`    | Lista tipos de promoção      |
| POST   | `/reels`              | Gera roteiro de Reels        |
| GET    | `/hashtags`           | Gera hashtags                |
| GET    | `/posts`              | Lista posts publicados       |
| POST   | `/ads`                | Cria campanha Meta Ads       |
| GET    | `/ads/relatorio`      | Relatório de performance     |
| POST   | `/scheduler/testar`   | Testa agendamento            |
| GET    | `/scheduler/config`   | Ver config do agendador      |

### Exemplos de chamadas

```bash
# Gerar legenda
curl -X POST http://localhost:3000/caption \
  -H "Content-Type: application/json" \
  -d '{"tipo": "SMASH"}'

# Publicar post
curl -X POST http://localhost:3000/post \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://sua-imagem.com/foto.jpg", "tipoCaptions": "SMASH"}'

# Gerar promoção
curl -X POST http://localhost:3000/promotion \
  -H "Content-Type: application/json" \
  -d '{"tipo": "QUINTA_BURGER"}'

# Criar campanha de anúncio
curl -X POST http://localhost:3000/ads \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://sua-imagem.com/foto.jpg", "orcamentoDiario": 1000}'

# Testar agendamento
curl -X POST http://localhost:3000/scheduler/testar \
  -H "Content-Type: application/json" \
  -d '{"dia": "quinta"}'
```

---

## 📣 Segmentação dos Anúncios

| Parâmetro  | Configuração          |
|------------|-----------------------|
| Raio       | 5km do restaurante    |
| Idade      | 18 a 45 anos          |
| Interesses | Fast food, Hambúrguer, Delivery, Restaurante |
| Orçamento  | R$10/dia (ajustável)  |
| Objetivo   | Cliques no link de pedido |
| Destino    | https://bruthus-burger.ola.click/products |

> Configure a latitude/longitude real do restaurante em `scripts/createAds.js` na variável `SEGMENTACAO_PADRAO`.

---

## 🔮 Melhorias Futuras

- [ ] **Dashboard visual** — Painel web com métricas de engajamento em tempo real
- [ ] **Upload automático de imagens** — Integração com Cloudinary para hospedar fotos
- [ ] **Análise de engajamento** — Identificar os posts com mais cliques e replicar o padrão
- [ ] **Geração automática de vídeos** — Integração com APIs de vídeo (RunwayML, D-ID)
- [ ] **Testes A/B de legendas** — Comparar performance de diferentes estilos de copy
- [ ] **Stories automáticos** — Postagem de stories com link de pedido direto
- [ ] **Integração Analytics** — Conectar com Google Analytics ou Meta Pixel
- [ ] **Relatório por WhatsApp** — Enviar relatório semanal de performance no WhatsApp
- [ ] **IA de imagens** — Gerar artes de promoção automaticamente com DALL-E
- [ ] **Múltiplos restaurantes** — Suporte a franquias com contas diferentes

---

## ⚠️ Avisos Importantes

1. **Nunca commite o `.env`** — adicione ao `.gitignore`
2. **Token expira** — Tokens padrão expiram em 60 dias. Use System User para token permanente
3. **Limite de posts** — A API do Instagram limita 25 publicações por dia
4. **URL pública** — A imagem precisa ser acessível publicamente pela internet
5. **Conta Business** — Obrigatório ter conta Business/Creator no Instagram
6. **Revisão de anúncios** — Campanhas criadas ficam pausadas para revisão manual antes de ativar

---

## 🆘 Problemas Comuns

**Erro: "Access token expired"**
→ Renove o token ou use System User token permanente

**Erro: "Media URL not accessible"**
→ A URL da imagem precisa ser pública. Use Cloudinary ou S3

**Erro: "User not found"**
→ Verifique o IG_USER_ID — deve ser o ID do Instagram Business, não do perfil pessoal

**Post não aparece no Instagram**
→ Verifique se a conta é Business e está vinculada a uma Página do Facebook

---

*Sistema desenvolvido para automação de marketing da Bruthus Burger 🍔*
