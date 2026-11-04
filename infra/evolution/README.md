# Evolution API — WhatsApp da Bruthus

Ponte entre o sistema e o WhatsApp. Com ela conectada, a campanha diária
(`scripts/campanhaDiaria.js`) envia sozinha. Com ela fora do ar ou com o
chip despareado, o sistema manda a lista do dia para o Telegram do dono e
**mantém os mesmos clientes na fila** até a mensagem sair de verdade.

## Onde roda

Numa VM do Oracle Cloud que já existia (projeto `licitafacil`), no tier
gratuito. Custo mensal: **R$ 0**.

| | |
|---|---|
| Máquina | VM.Standard.A1.Flex — Ampere **ARM**, 1 OCPU, 5,8 GB RAM, 45 GB |
| Sistema | Ubuntu 24.04 LTS |
| IP | 163.176.241.81 |
| Endereço | https://bruthusburger.duckdns.org |
| Pasta | `/home/ubuntu/evolution` |

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@163.176.241.81
```

### Por que não no Render

O serviço do sistema roda no plano free do Render, que **dorme quando fica
ocioso**. A sessão do WhatsApp cai junto, e o disco é descartado a cada
restart — é nele que a sessão vive. Seria reparear o QR todo dia.

### Por que ARM importa

A máquina é Ampere (aarch64), não Intel. A maioria das imagens Docker de
WhatsApp só publica `amd64` e simplesmente não sobe aqui.
`evoapicloud/evolution-api` publica `arm64` — por isso ela, e não a
`atendai/evolution-api` dos tutoriais, que parou na v1.

## Como está montado

```
internet → Caddy (80/443, HTTPS automático)
             └→ evolution (8080, só localhost)
                  └→ postgres (interno)
```

A Evolution **não** fica exposta: a porta 8080 escuta em `127.0.0.1`. Quem
vem de fora passa obrigatoriamente pelo Caddy, com certificado Let's
Encrypt renovado sozinho. Sem isso a apikey viajaria em texto puro entre o
Render e esta máquina.

## Operação

```bash
cd /home/ubuntu/evolution
sudo docker compose ps
sudo docker compose logs -f evolution
sudo docker compose restart evolution
```

Ver a chave da API (é ela que vai no Render):

```bash
grep AUTHENTICATION_API_KEY /home/ubuntu/evolution/.env
```

### Parear o chip

Abra <https://bruthusburger.duckdns.org/manager>, entre com a chave
acima e leia o QR code em **WhatsApp → Aparelhos conectados**.

**Use um chip separado, nunca o número que recebe pedido.** Se esse número
for bloqueado, você perde a campanha, não a operação. Depois de pareado o
celular pode ficar guardado — o WhatsApp multi-device não exige o aparelho
online, mas o chip precisa continuar existindo.

Conferir o estado:

```bash
curl -s https://bruthusburger.duckdns.org/instance/connectionState/bruthus \
  -H "apikey: SUA_CHAVE"
```

`"state":"open"` = conectado. `"connecting"` = esperando o QR.

### Ligar no sistema

No Render, serviço `bruthus-burger`, em Environment:

```
EVOLUTION_API_URL   = https://bruthusburger.duckdns.org
EVOLUTION_API_KEY   = a mesma AUTHENTICATION_API_KEY
EVOLUTION_INSTANCE  = bruthus
```

Confirme em `https://bruthus-burger.onrender.com/clientes/whatsapp/status`.

Antes de deixar solto, rode uma simulação — não envia e não grava:

```bash
curl -X POST https://bruthus-burger.onrender.com/campanhas/diaria/rodar \
  -H "Content-Type: application/json" \
  -d '{"qtd":3,"dryRun":true,"forcar":true}'
```

## Armadilhas que já custaram caro

**Formato do corpo mudou da v1 para a v2.** O schema da v2.3.0 aceita
`number`, `text`, `linkPreview`, `delay`, `quoted`, `everyOne` e
`mentioned`, todos no topo. O formato antigo `options: { delay, presence }`
**não dá erro** — o schema não proíbe campo extra, então ele é aceito e
descartado em silêncio, e a pausa de digitação nunca acontece.

**Ter variável não é estar conectado.** `configurado()` só olha se as
variáveis existem. Com o chip despareado a API responde normalmente, mas o
envio fica pendurado até o timeout. Por isso a campanha usa `conectado()`,
que lê o estado real e cai para o Telegram quando não está `open`.

**Firewall do Oracle tem duas camadas.** A Security List no console e o
`iptables` da máquina. Abrir só no console não funciona. Neste caso não foi
preciso mexer: porta publicada por container não passa pelo `INPUT` (vai
por `FORWARD`/DNAT, que o Docker libera), e a Security List já estava
aberta nas portas 80 e 443.

## O que havia antes nesta máquina

O projeto `sistema-licitantes` rodava aqui (Caddy + backend + Postgres).
Os containers foram removidos com `docker compose down`, **sem `-v`** — os
volumes continuam no disco, com 47 MB de banco intactos:

```
oracle_db_data  oracle_backend_data  oracle_caddy_data  oracle_caddy_config
```

Cópia da configuração em `/home/ubuntu/licitantes-backup-compose.yml` e
`/home/ubuntu/licitantes-backup.env`.

Para trazer de volta é `docker compose up -d` em
`/home/ubuntu/sistema-licitantes/deploy/oracle` — mas os dois não podem
rodar juntos, porque disputam as portas 80 e 443 e o mesmo domínio.

## Segurança

O `AUTHENTICATION_API_KEY` é a única coisa entre a internet e o WhatsApp da
loja. Quem tiver essa chave manda mensagem como você. Ele está só no
`.env` da VM e no `.env` local, ambos fora do git.
