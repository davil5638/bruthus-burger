# Evolution API — WhatsApp da Bruthus

Ponte entre o sistema e o WhatsApp. Quando ela está no ar, a campanha
diária (`scripts/campanhaDiaria.js`) envia sozinha. Enquanto não está, o
sistema manda a lista do dia para o Telegram do dono, para envio manual —
isso para de acontecer automaticamente assim que as credenciais existirem.

## Por que não no Render

O serviço do sistema roda no plano free do Render, que **dorme quando fica
ocioso**. A sessão do WhatsApp cai junto, e o disco é descartado a cada
restart — é nele que a sessão vive. Seria reparear o QR todo dia.

Evolution precisa de uma máquina que não dorme.

## VPS

| | |
|---|---|
| RAM | 1 GB funciona, 2 GB é confortável |
| Disco | 20 GB basta |
| Sistema | Ubuntu 22.04 ou 24.04 |
| Precisa de | Docker e Docker Compose |

Custo típico: R$ 20 a R$ 40/mês. Hostinger cobra em real e tem suporte em
português; Hetzner e Contabo são mais baratos mas o painel é em inglês.

## Passo a passo

**1. Na VPS, instalar o Docker**

```bash
curl -fsSL https://get.docker.com | sh
```

**2. Copiar esta pasta para a VPS e criar o `.env`**

```bash
cp .env.exemplo .env
nano .env
```

Preencha os três valores. A `AUTHENTICATION_API_KEY` você inventa — é uma
senha longa, qualquer coisa aleatória serve, só não pode ser curta.

**3. Subir**

```bash
docker compose up -d
docker compose logs -f evolution
```

Deve responder em `http://SEU_IP:8080`. Se não responder, o log diz o
porquê — geralmente é nome de variável que mudou de versão. Confira em
[doc.evolution-api.com](https://doc.evolution-api.com/v2/pt/install/docker).

**4. Criar a instância e parear**

```bash
curl -X POST http://SEU_IP:8080/instance/create \
  -H "apikey: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"bruthus","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

A resposta traz o QR code. Escaneie com o WhatsApp do número da campanha —
**use um chip separado, não o número que recebe pedido.** Se esse número
for bloqueado, você perde a campanha, não a operação.

Depois de pareado, o celular pode ficar guardado: o WhatsApp multi-device
não exige o aparelho online.

**5. Conferir que conectou**

```bash
curl http://SEU_IP:8080/instance/connectionState/bruthus -H "apikey: SUA_CHAVE"
```

**6. Ligar no sistema**

No Render, no serviço `bruthus-burger`, em Environment:

```
EVOLUTION_API_URL     = http://SEU_IP:8080
EVOLUTION_API_KEY     = a mesma AUTHENTICATION_API_KEY
EVOLUTION_INSTANCE    = bruthus
```

Confirme em `https://bruthus-burger.onrender.com/clientes/whatsapp/status`
— tem que dizer `"configurado": true`.

A partir daí a campanha das 11h envia sozinha, 5 clientes por dia.

## Antes de deixar solto

Dispare uma vez em simulação e leia o que sairia:

```bash
curl -X POST https://bruthus-burger.onrender.com/campanhas/diaria/rodar \
  -H "Content-Type: application/json" \
  -d '{"qtd":3,"dryRun":true,"forcar":true}'
```

Simulação não envia e **não grava** no histórico, então pode rodar à
vontade.

## Segurança

O `AUTHENTICATION_API_KEY` é a única coisa entre a internet e o WhatsApp da
loja. Quem tiver essa chave manda mensagem como você.

Com a porta 8080 aberta no IP, qualquer um pode tentar. Vale, quando der:
pôr um domínio com HTTPS na frente (Caddy resolve em poucas linhas) e
fechar a 8080 no firewall para aceitar só o Render.

Não é motivo para adiar o começo — mas é motivo para não esquecer.
